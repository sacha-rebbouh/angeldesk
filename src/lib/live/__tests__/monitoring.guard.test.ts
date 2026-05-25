/**
 * Phase C slice C3a — Source guard `src/lib/live/monitoring.ts`.
 *
 * Verrouille :
 *   - Aucun `console.*` direct dans monitoring.ts (les logs passent par
 *     `@/lib/logger` qui hook Sentry automatiquement).
 *   - L'import du logger central est présent.
 *   - Les exports publics attendus (type `LiveErrorCategory`,
 *     `categorizeLiveError`) sont présents.
 *   - Aucune référence à des champs sensibles raw (transcript, prompt, etc.)
 *     dans le source — la redaction est gérée par `lib/logger.ts`, mais
 *     monitoring.ts ne doit pas non plus les nommer comme clés.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(
  resolve(__dirname, "..", "monitoring.ts"),
  "utf-8"
);

describe("Phase C3a — Source guard monitoring.ts", () => {
  it("ne contient AUCUN appel `console.*` direct", () => {
    expect(
      /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/.test(SOURCE)
    ).toBe(false);
  });

  it("importe `logger` depuis `@/lib/logger`", () => {
    expect(
      /import\s*\{[^}]*\blogger\b[^}]*\}\s*from\s*["']@\/lib\/logger["']/.test(
        SOURCE
      )
    ).toBe(true);
  });

  it("exporte le type `LiveErrorCategory`", () => {
    expect(/export\s+type\s+LiveErrorCategory\b/.test(SOURCE)).toBe(true);
  });

  it("exporte la fonction `categorizeLiveError`", () => {
    expect(/export\s+function\s+categorizeLiveError\s*\(/.test(SOURCE)).toBe(
      true
    );
  });

  it("préserve les 4 signatures publiques historiques", () => {
    expect(/export\s+function\s+logCoachingLatency\s*\(/.test(SOURCE)).toBe(
      true
    );
    expect(/export\s+function\s+logCoachingError\s*\(/.test(SOURCE)).toBe(true);
    expect(/export\s+function\s+logSessionEvent\s*\(/.test(SOURCE)).toBe(true);
    expect(/export\s+function\s+trackCoachingCost\s*\(/.test(SOURCE)).toBe(
      true
    );
  });

  it("ne nomme PAS de clé de contexte sensible (transcript/utterance/prompt/extractedText/rawContent/content)", () => {
    // Sécurité défensive : on interdit la présence littérale de ces noms en
    // tant qu'objets dans monitoring.ts. La redaction du logger est un
    // second filet, mais le premier filet est de ne pas les mentionner.
    expect(/\btranscript\s*:/.test(SOURCE)).toBe(false);
    expect(/\butterance\s*:/.test(SOURCE)).toBe(false);
    expect(/\bprompt\s*:/.test(SOURCE)).toBe(false);
    expect(/\buserPrompt\s*:/.test(SOURCE)).toBe(false);
    expect(/\bsystemPrompt\s*:/.test(SOURCE)).toBe(false);
    expect(/\bextractedText\s*:/.test(SOURCE)).toBe(false);
    expect(/\brawContent\s*:/.test(SOURCE)).toBe(false);
  });

  it("n'introduit pas de dépendance Prisma directe (C3b séparé)", () => {
    expect(/from\s+["']@\/lib\/prisma["']/.test(SOURCE)).toBe(false);
    expect(/from\s+["']@\/services\/cost-monitor["']/.test(SOURCE)).toBe(false);
  });
});
