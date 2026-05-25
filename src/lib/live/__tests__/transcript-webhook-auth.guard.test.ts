/**
 * Phase C slice C4a — Source guard SEC-001 (transcript webhook auth).
 *
 * Verrouille :
 *   - `start/route.ts` et `reinvite/route.ts` n'interpolent PAS le secret
 *     brut (`LIVE_TRANSCRIPT_WEBHOOK_SECRET` ou son helper de lecture) dans
 *     l'URL envoyée à Recall — ils passent par `buildTranscriptWebhookUrl`.
 *   - Les deux routes importent `buildTranscriptWebhookUrl`.
 *   - `webhook/route.ts` appelle `verifyTranscriptWebhookSignature` AVANT
 *     `isWebhookRateLimited` (pour ne pas remplir le rate-limit map avec
 *     des probes non authentifiées).
 *   - Le helper `transcript-webhook-auth.ts` n'expose pas le secret en log.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

const START_ROUTE = "src/app/api/live-sessions/[id]/start/route.ts";
const REINVITE_ROUTE = "src/app/api/live-sessions/[id]/reinvite/route.ts";
const WEBHOOK_ROUTE = "src/app/api/live-sessions/[id]/webhook/route.ts";
const HELPER = "src/lib/live/transcript-webhook-auth.ts";

describe("Phase C C4a — Source guards SEC-001", () => {
  describe("start/route.ts", () => {
    const source = loadFile(START_ROUTE);

    it("importe `buildTranscriptWebhookUrl`", () => {
      expect(
        /import\s*\{[^}]*\bbuildTranscriptWebhookUrl\b[^}]*\}\s*from\s*["']@\/lib\/live\/transcript-webhook-auth["']/.test(
          source
        )
      ).toBe(true);
    });

    it("appelle `buildTranscriptWebhookUrl(appUrl, id)`", () => {
      expect(/buildTranscriptWebhookUrl\s*\(/.test(source)).toBe(true);
    });

    it("n'interpole PAS le secret brut `LIVE_TRANSCRIPT_WEBHOOK_SECRET` dans une URL", () => {
      // Le secret env var name ne doit pas apparaître interpolé.
      expect(/\$\{[^}]*LIVE_TRANSCRIPT_WEBHOOK_SECRET[^}]*\}/.test(source)).toBe(false);
      // Et le code ne doit pas lire `process.env.LIVE_TRANSCRIPT_WEBHOOK_SECRET`
      // directement (seul le helper a le droit).
      expect(/process\.env\.LIVE_TRANSCRIPT_WEBHOOK_SECRET/.test(source)).toBe(false);
    });

    it("ne contient PAS d'URL webhook construite à la main (sans helper)", () => {
      // Avant C4a : `${appUrl}/api/live-sessions/${id}/webhook` (sans sig).
      // Doit avoir migré vers `buildTranscriptWebhookUrl`.
      expect(
        /\$\{appUrl\}\/api\/live-sessions\/\$\{id\}\/webhook/.test(source)
      ).toBe(false);
    });
  });

  describe("reinvite/route.ts", () => {
    const source = loadFile(REINVITE_ROUTE);

    it("importe `buildTranscriptWebhookUrl`", () => {
      expect(
        /import\s*\{[^}]*\bbuildTranscriptWebhookUrl\b[^}]*\}\s*from\s*["']@\/lib\/live\/transcript-webhook-auth["']/.test(
          source
        )
      ).toBe(true);
    });

    it("appelle `buildTranscriptWebhookUrl(appUrl, id)`", () => {
      expect(/buildTranscriptWebhookUrl\s*\(/.test(source)).toBe(true);
    });

    it("n'interpole PAS le secret brut", () => {
      expect(/\$\{[^}]*LIVE_TRANSCRIPT_WEBHOOK_SECRET[^}]*\}/.test(source)).toBe(false);
      expect(/process\.env\.LIVE_TRANSCRIPT_WEBHOOK_SECRET/.test(source)).toBe(false);
    });

    it("ne construit PAS d'URL webhook à la main", () => {
      expect(
        /\$\{appUrl\}\/api\/live-sessions\/\$\{id\}\/webhook/.test(source)
      ).toBe(false);
    });
  });

  describe("webhook/route.ts", () => {
    const source = loadFile(WEBHOOK_ROUTE);

    it("importe `verifyTranscriptWebhookSignature`", () => {
      expect(
        /import\s*\{[^}]*\bverifyTranscriptWebhookSignature\b[^}]*\}\s*from\s*["']@\/lib\/live\/transcript-webhook-auth["']/.test(
          source
        )
      ).toBe(true);
    });

    it("appelle `verifyTranscriptWebhookSignature` au moins une fois", () => {
      expect(/verifyTranscriptWebhookSignature\s*\(/.test(source)).toBe(true);
    });

    it("appelle `verifyTranscriptWebhookSignature` AVANT l'appel `isWebhookRateLimited(id)` dans le handler", () => {
      // Cible l'**appel** précis dans le POST handler (pas la définition de
      // la fonction `isWebhookRateLimited` en haut du fichier).
      const verifyIdx = source.indexOf("verifyTranscriptWebhookSignature(request");
      const rateLimitIdx = source.indexOf("isWebhookRateLimited(id)");
      expect(verifyIdx).toBeGreaterThan(-1);
      expect(rateLimitIdx).toBeGreaterThan(-1);
      expect(verifyIdx).toBeLessThan(rateLimitIdx);
    });

    it("ne lit PAS `process.env.LIVE_TRANSCRIPT_WEBHOOK_SECRET` directement (seul le helper le fait)", () => {
      expect(/process\.env\.LIVE_TRANSCRIPT_WEBHOOK_SECRET/.test(source)).toBe(false);
    });
  });

  describe("transcript-webhook-auth.ts (helper)", () => {
    const source = loadFile(HELPER);

    it("ne contient AUCUN appel `console.*` (la signature ne doit jamais être loggée)", () => {
      expect(/\bconsole\.(log|info|warn|error|debug)\s*\(/.test(source)).toBe(false);
    });

    it("n'inclut PAS le secret brut dans un template string (defense-in-depth)", () => {
      // Le secret ne doit jamais apparaître dans une URL/template construite
      // ici. Le helper ne doit lire `process.env.LIVE_TRANSCRIPT_WEBHOOK_SECRET`
      // qu'à travers `readSecret()`.
      expect(/\$\{[^}]*secret[^}]*\}\s*\/api/i.test(source)).toBe(false);
    });

    it("exporte le quadruple-guard de bypass dev", () => {
      expect(/export\s+function\s+isTranscriptWebhookBypassEnabled\s*\(/.test(source)).toBe(true);
      // Les 4 conditions doivent toutes être présentes dans le corps du
      // helper (verrouille SEC-002 alignement).
      expect(source).toMatch(/NODE_ENV\s*===\s*"development"/);
      expect(source).toMatch(/LIVE_TRANSCRIPT_BYPASS_SIGNATURE\s*===\s*"true"/);
      expect(source).toMatch(/VERCEL_ENV\s*!==\s*"production"/);
      expect(source).toMatch(/!process\.env\.VERCEL/);
    });
  });
});
