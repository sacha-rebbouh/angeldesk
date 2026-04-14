// ============================================================================
// AngelDesk WebSocket Relay — Fly.io
// ============================================================================
// Receives real-time video frames from Recall.ai via WebSocket,
// filters duplicates with perceptual hashing, and forwards unique
// screenshare frames to the Vercel API for visual analysis.
//
// Recall.ai WebSocket protocol (JSON events):
//   Each message is a JSON object:
//   {
//     "event": "video_separate_png.data",
//     "data": {
//       "data": {
//         "buffer": "<base64 encoded PNG>",
//         "type": "webcam" | "screenshare",
//         "timestamp": { "relative": <seconds>, "absolute": "<ISO>" },
//         "participant": { "id": <int>, "name": <string|null>, ... }
//       },
//       "bot": { "id": "<bot_id>", ... },
//       ...
//     }
//   }
//
// Ref: https://github.com/recallai/participant-live-video
//      https://docs.recall.ai/docs/how-to-get-separate-videos-per-participant-realtime
//
// Environment variables:
//   RELAY_SECRET   — shared secret for authenticating with Vercel API
//   VERCEL_API_URL — base URL of the Vercel app (e.g. https://app.angeldesk.io)
//   PORT           — listening port (default 8080)
// ============================================================================

/* eslint-disable @typescript-eslint/no-require-imports -- Fly relay runs as a standalone CommonJS service. */
const { WebSocketServer } = require("ws");
const { createServer } = require("http");
const sharp = require("sharp");

const PORT = parseInt(process.env.PORT || "8080", 10);
const RELAY_SECRET = process.env.RELAY_SECRET;
const VERCEL_API_URL = process.env.VERCEL_API_URL;

if (!RELAY_SECRET || !VERCEL_API_URL) {
  console.error("Missing RELAY_SECRET or VERCEL_API_URL");
  process.exit(1);
}

// ── Perceptual hash (8x8 grayscale → average hash) ──

async function computePHash(pngBuffer) {
  const { data } = await sharp(pngBuffer)
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const avg = data.reduce((s, v) => s + v, 0) / data.length;
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (data[i] >= avg) hash |= 1n << BigInt(i);
  }
  return hash;
}

function hammingDistance(a, b) {
  let xor = a ^ b;
  let dist = 0;
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return dist;
}

const HASH_THRESHOLD = 5; // < 5/64 bits different = same frame

// CUID validation regex (matches server pattern: 21-30 chars, starts with 'c')
const CUID_REGEX = /^c[a-z0-9]{20,29}$/;

// ── Per-session state ──

const sessionState = new Map();
// Map: sessionId → { lastHash, lastForwardedAt }

// ── Rate limiting: max 1 forward per 3 seconds per session ──
const FORWARD_INTERVAL_MS = 3_000;

// ── Retry config ──
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

async function forwardWithRetry(url, options, retries = 0) {
  try {
    const res = await fetch(url, options);
    if (!res.ok && res.status >= 500 && retries < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (retries + 1)));
      return forwardWithRetry(url, options, retries + 1);
    }
    return res;
  } catch (err) {
    if (retries < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (retries + 1)));
      return forwardWithRetry(url, options, retries + 1);
    }
    throw err;
  }
}

// ── HTTP server + WebSocket ──

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({
  server,
  maxPayload: 10 * 1024 * 1024, // 10MB max message size
  verifyClient: (info, cb) => {
    // Extract sessionId from query params and validate format
    const url = new URL(info.req.url, `http://localhost:${PORT}`);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId || !CUID_REGEX.test(sessionId)) {
      console.warn(`[relay] Rejected connection: invalid sessionId "${sessionId}"`);
      cb(false, 400, "Invalid sessionId");
      return;
    }

    cb(true);
  },
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get("sessionId");

  console.log(`[relay] Recall.ai connected for session ${sessionId}`);

  // Init session state if needed
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      lastHash: null,
      lastForwardedAt: 0,
    });
  }

  // Ping/pong keepalive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30_000);

  let messageCount = 0;
  let forwardCount = 0;

  ws.on("message", async (message) => {
    messageCount++;

    // Recall.ai sends all events as JSON text messages
    let event;
    try {
      event = JSON.parse(message.toString());
    } catch {
      if (messageCount <= 3) {
        console.warn(`[relay][${sessionId}] Non-JSON message #${messageCount}, ignoring (${message.toString().substring(0, 100)})`);
      }
      return;
    }

    // Log first message and periodically
    if (messageCount === 1 || messageCount % 50 === 0) {
      console.log(`[relay][${sessionId}] Message #${messageCount}: event=${event.event}, forwarded=${forwardCount}`);
    }

    // Only process video_separate_png.data events
    if (event.event !== "video_separate_png.data") {
      if (messageCount <= 5) {
        console.log(`[relay][${sessionId}] Event: ${event.event} (not PNG, skipping)`);
      }
      return;
    }

    const payload = event.data?.data;
    if (!payload?.buffer) {
      console.warn(`[relay][${sessionId}] PNG event missing buffer field`);
      return;
    }

    // Only process screenshare frames (skip webcam feeds — too noisy)
    if (payload.type !== "screenshare") {
      return;
    }

    const state = sessionState.get(sessionId);
    if (!state) return;

    // Rate limiting: skip if forwarded recently
    const now = Date.now();
    if (now - state.lastForwardedAt < FORWARD_INTERVAL_MS) {
      return;
    }

    // Decode base64 PNG
    try {
      const pngBuffer = Buffer.from(payload.buffer, "base64");

      if (pngBuffer.length < 100) {
        console.warn(`[relay][${sessionId}] PNG too small (${pngBuffer.length} bytes), skipping`);
        return;
      }

      // pHash dedup — skip if frame looks the same as the last one
      const hash = await computePHash(pngBuffer);

      if (state.lastHash !== null) {
        const dist = hammingDistance(hash, state.lastHash);
        if (dist < HASH_THRESHOLD) {
          return; // Same frame, skip
        }
      }

      state.lastHash = hash;
      state.lastForwardedAt = now;
      forwardCount++;

      // Extract timestamp (Recall gives relative seconds)
      const timestampMs = payload.timestamp?.relative
        ? Math.round(payload.timestamp.relative * 1000)
        : Date.now();

      const participantId = payload.participant?.id ?? 0;

      // Forward to Vercel API as raw PNG with metadata in headers
      const apiUrl = `${VERCEL_API_URL}/api/live-sessions/${sessionId}/visual-frame`;

      console.log(
        `[relay][${sessionId}] Forwarding screenshare #${forwardCount} ` +
        `(${(pngBuffer.length / 1024).toFixed(1)}KB, participant=${participantId})`
      );

      forwardWithRetry(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          Authorization: `Bearer ${RELAY_SECRET}`,
          "X-Participant-Id": String(participantId),
          "X-Timestamp-Ms": String(timestampMs),
        },
        body: pngBuffer,
        signal: AbortSignal.timeout(15_000), // 15s timeout (visual analysis takes time)
      })
        .then((res) => {
          if (!res.ok) {
            console.warn(`[relay][${sessionId}] API responded ${res.status}`);
          }
        })
        .catch((err) => {
          console.error(`[relay][${sessionId}] Forward failed:`, err.message);
        });
    } catch (err) {
      console.error(`[relay][${sessionId}] Processing error:`, err.message);
    }
  });

  ws.on("close", () => {
    console.log(`[relay][${sessionId}] Connection closed (messages=${messageCount}, forwarded=${forwardCount})`);
    clearInterval(pingInterval);
    sessionState.delete(sessionId);
  });

  ws.on("error", (err) => {
    console.error(`[relay][${sessionId}] WS error:`, err.message);
    clearInterval(pingInterval);
    sessionState.delete(sessionId);
  });
});

// ── Graceful shutdown ──

function shutdown(signal) {
  console.log(`[relay] ${signal} received, shutting down...`);

  // Close all active WebSocket connections
  for (const client of wss.clients) {
    client.close(1001, "Server shutting down");
  }

  wss.close(() => {
    server.close(() => {
      console.log("[relay] Graceful shutdown complete");
      process.exit(0);
    });
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error("[relay] Forced shutdown after 10s timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, () => {
  console.log(`[relay] WebSocket relay listening on port ${PORT}`);
  console.log(`[relay] Forwarding to: ${VERCEL_API_URL}`);
});
