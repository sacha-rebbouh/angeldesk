/**
 * Phase C slice C1b — Tests Recall webhook (REL-003 maxDuration + SEC-002
 * triple-guard dev bypass).
 *
 * Couvre :
 *   1. **REL-003** : `maxDuration` exporté = 300 (aligné avec `stop` et
 *      `retry-report`). Sans ça, `after(...)` qui lance Sonnet (~6-15s)
 *      pouvait être tronqué.
 *   2. **SEC-002 — triple-guard bypass** : la vérification Svix n'est
 *      ignorable QUE si :
 *        - `NODE_ENV === "development"`
 *        - `VERCEL_ENV !== "production"`
 *        - `!VERCEL`
 *      Toute autre combinaison (preview, prod, self-hosted Docker, etc.)
 *      doit appliquer la signature.
 *
 * Pas de test d'intégration Recall.ai réel — on mock `verifySvixSignature`
 * et `prisma.liveSession` côté unit pour exercer le contrôle de gate.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Mocks — verifySvixSignature + prisma.liveSession + post-call-generator
// ---------------------------------------------------------------------------

const { verifySvixSignatureMock, generateAndSavePostCallReportMock, publishSessionStatusMock } =
  vi.hoisted(() => ({
    verifySvixSignatureMock: vi.fn(),
    generateAndSavePostCallReportMock: vi.fn(),
    publishSessionStatusMock: vi.fn(),
  }));

vi.mock("@/lib/live/recall-client", () => ({
  verifySvixSignature: verifySvixSignatureMock,
}));

vi.mock("@/lib/live/post-call-generator", () => ({
  generateAndSavePostCallReport: generateAndSavePostCallReportMock,
}));

vi.mock("@/lib/live/ably-server", () => ({
  publishSessionStatus: publishSessionStatusMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// `next/server` `after()` is a no-op in unit tests : the callback ne doit
// jamais bloquer la réponse HTTP.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: vi.fn((fn: () => void | Promise<void>) => {
      // Lance le callback en best-effort, swallow errors (pareil que
      // l'implémentation Vercel).
      void Promise.resolve().then(fn).catch(() => undefined);
    }),
  };
});

import { POST, maxDuration } from "@/app/api/webhooks/recall/route";

// ---------------------------------------------------------------------------
// Helper : construit un NextRequest avec body + headers
// ---------------------------------------------------------------------------

function makeRequest(
  body: object,
  headers: Record<string, string> = {},
): import("next/server").NextRequest {
  const url = "https://example.com/api/webhooks/recall";
  // NextRequest accepte Request standard ; on passe Request directement
  // pour simplifier.
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const VALID_SVIX_HEADERS = {
  "svix-id": "msg_test_123",
  "svix-timestamp": "1700000000",
  "svix-signature": "v1,signature_payload",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset env to a known baseline — chaque test stub explicite ce qu'il veut.
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// REL-003 — maxDuration alignment
// ---------------------------------------------------------------------------

describe("Phase C C1b — REL-003 maxDuration", () => {
  it("`maxDuration` exporté = 300 (aligné avec stop/retry-report, couvre Sonnet post-call)", () => {
    expect(maxDuration).toBe(300);
  });

  it("ne reste PAS sur l'ancienne valeur `10` (insuffisante pour Sonnet ~6-15s)", () => {
    expect(maxDuration).not.toBe(10);
  });
});

// ---------------------------------------------------------------------------
// SEC-002 — triple-guard dev bypass matrix
// ---------------------------------------------------------------------------

describe("Phase C C1b — SEC-002 triple-guard dev bypass", () => {
  describe("Bypass ACCORDÉ uniquement en dev local strict (les 4 conditions réunies)", () => {
    it("NODE_ENV=development + RECALL_WEBHOOK_BYPASS_SIGNATURE=true + VERCEL_ENV unset + VERCEL unset → bypass appliqué (non-401)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RECALL_WEBHOOK_BYPASS_SIGNATURE", "true");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(false); // signature invalide

      const res = await POST(
        makeRequest(
          { event: "bot.status_change", data: { bot_id: "bot_x", status: { code: "joining_call", message: "" } } },
          VALID_SVIX_HEADERS,
        ),
      );

      // Bypass appliqué → le handler continue. Statut !== 401 (peut être 200
      // ou autre selon traitement aval ; on vérifie surtout NON 401).
      expect(res.status).not.toBe(401);
    });

    it("Sans le flag opt-in `RECALL_WEBHOOK_BYPASS_SIGNATURE=true` → 401 même en dev local (protection self-hosted)", async () => {
      // Reproduit le scénario self-hosted Docker avec `NODE_ENV=development`
      // laissé par accident, VERCEL/VERCEL_ENV non set. Sans le opt-in
      // explicite, le bypass DOIT être refusé.
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RECALL_WEBHOOK_BYPASS_SIGNATURE", ""); // absent
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(false);

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, VALID_SVIX_HEADERS),
      );

      expect(res.status).toBe(401);
    });

    it("Flag opt-in présent mais valeur != \"true\" (ex: \"1\", \"yes\") → 401", async () => {
      // Le opt-in doit être strict : seulement la string littérale "true".
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RECALL_WEBHOOK_BYPASS_SIGNATURE", "1");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(false);

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, VALID_SVIX_HEADERS),
      );

      expect(res.status).toBe(401);
    });
  });

  describe("Bypass REJETÉ — chaque condition manquante doit forcer 401 sur signature invalide", () => {
    it("Vercel preview (VERCEL=1 + VERCEL_ENV=preview + NODE_ENV=development + flag=true) → 401", async () => {
      // Cas Vercel preview réel : Vercel set TOUJOURS VERCEL=1 sur tous
      // déploiements (preview compris). Le quadruple-guard catch sur
      // `!VERCEL`. Critique : même avec le opt-in flag, la signature
      // reste obligatoire en preview/prod.
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RECALL_WEBHOOK_BYPASS_SIGNATURE", "true");
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(false);

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, VALID_SVIX_HEADERS),
      );

      expect(res.status).toBe(401);
    });

    it("VERCEL=1 + flag=true + NODE_ENV=development → 401 (déploiement Vercel ne doit pas bypass même avec opt-in)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RECALL_WEBHOOK_BYPASS_SIGNATURE", "true");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(false);

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, VALID_SVIX_HEADERS),
      );

      expect(res.status).toBe(401);
    });

    it("VERCEL_ENV=production + flag=true → 401 (production ne doit pas bypass même avec opt-in)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RECALL_WEBHOOK_BYPASS_SIGNATURE", "true");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(false);

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, VALID_SVIX_HEADERS),
      );

      expect(res.status).toBe(401);
    });

    it("NODE_ENV=production + flag=true → 401 (NODE_ENV !== development)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("RECALL_WEBHOOK_BYPASS_SIGNATURE", "true");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(false);

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, VALID_SVIX_HEADERS),
      );

      expect(res.status).toBe(401);
    });

    it("NODE_ENV=test + flag=true (Vitest runtime) → 401 (tests ne doivent pas bypass)", async () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("RECALL_WEBHOOK_BYPASS_SIGNATURE", "true");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(false);

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, VALID_SVIX_HEADERS),
      );

      expect(res.status).toBe(401);
    });
  });

  describe("Absence de secret/headers Svix en non-dev → 401", () => {
    it("VERCEL=1 + secret manquant → 401 (Unauthorized)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "");

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, {}),
      );

      expect(res.status).toBe(401);
    });

    it("VERCEL_ENV=preview + headers Svix absents → 401", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");

      const res = await POST(
        makeRequest({ event: "bot.status_change", data: { bot_id: "bot_x" } }, {}),
      );

      expect(res.status).toBe(401);
    });
  });

  describe("Signature VALIDE — handler poursuit (pas de 401)", () => {
    it("VERCEL_ENV=production + signature valide → pas 401 (handler continue)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("RECALL_WEBHOOK_SECRET", "test-secret");
      verifySvixSignatureMock.mockReturnValue(true);

      const res = await POST(
        makeRequest(
          { event: "bot.status_change", data: { bot_id: "bot_unknown", status: { code: "joining_call", message: "" } } },
          VALID_SVIX_HEADERS,
        ),
      );

      // Aucune session correspondante (mock liveSession.findFirst → null)
      // → le handler renvoie un 200/4xx selon la branche, mais PAS 401
      // (le 401 est strictement réservé à la signature invalide).
      expect(res.status).not.toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// Source guard — invariants statiques du fichier route.ts
// ---------------------------------------------------------------------------

describe("Phase C C1b — Source guard route.ts", () => {
  const REPO_ROOT = resolve(__dirname, "../../../../../..");
  const source = readFileSync(
    resolve(REPO_ROOT, "src/app/api/webhooks/recall/route.ts"),
    "utf-8",
  );

  it("quadruple-guard présent : NODE_ENV=development && RECALL_WEBHOOK_BYPASS_SIGNATURE=true && VERCEL_ENV!=production && !VERCEL", () => {
    expect(/process\.env\.NODE_ENV\s*===\s*"development"/.test(source)).toBe(true);
    expect(/process\.env\.RECALL_WEBHOOK_BYPASS_SIGNATURE\s*===\s*"true"/.test(source)).toBe(true);
    expect(/process\.env\.VERCEL_ENV\s*!==\s*"production"/.test(source)).toBe(true);
    expect(/!process\.env\.VERCEL\b/.test(source)).toBe(true);
  });

  it("opt-in flag explicite : pas de bypass implicite par environnement", () => {
    // Garde-fou Codex round 2 : le opt-in `RECALL_WEBHOOK_BYPASS_SIGNATURE`
    // doit apparaître au moins une fois dans la source ; sans lui, le
    // bypass deviendrait à nouveau déductible de l'environnement.
    expect(source).toContain("RECALL_WEBHOOK_BYPASS_SIGNATURE");
  });

  it("ne reste PAS sur l'ancien single-guard `isDev = NODE_ENV === \"development\"`", () => {
    // Vérifie qu'on n'a plus de single-condition isDev. Le triple-guard
    // doit être dans une fonction helper avec && entre les 3 conditions.
    const singleGuardPattern = /const\s+isDev\s*=\s*process\.env\.NODE_ENV\s*===\s*"development"\s*;/;
    expect(singleGuardPattern.test(source)).toBe(false);
  });

  it("`maxDuration = 300` exporté littéralement", () => {
    expect(/export\s+const\s+maxDuration\s*=\s*300\s*;/.test(source)).toBe(true);
    expect(/export\s+const\s+maxDuration\s*=\s*10\s*;/.test(source)).toBe(false);
  });
});
