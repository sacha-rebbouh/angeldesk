/**
 * Phase C slice C3b — Source guard Live cost wiring.
 *
 * Verrouille :
 *   - Les 7 callers Live LLM importent et appellent `costMonitor.recordLiveCall`.
 *   - Aucun caller Live n'appelle `costMonitor.recordCall` (réservé au chemin
 *     orchestrator d'analyse, singleton `currentAnalysis`).
 *   - Aucun caller Live ne nomme de clé de metadata sensible (`transcript`,
 *     `utterance`, `prompt`, `userPrompt`, `systemPrompt`, `extractedText`,
 *     `rawContent`, `content`) à proximité d'un `recordLiveCall(`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

const LIVE_LLM_CALLERS: ReadonlyArray<string> = [
  "src/lib/live/coaching-engine.ts",
  "src/lib/live/utterance-router.ts",
  "src/lib/live/auto-dismiss.ts",
  "src/lib/live/visual-processor.ts",
  "src/lib/live/transcript-condenser.ts",
  "src/lib/live/post-call-generator.ts",
  "src/lib/live/post-call-reanalyzer.ts",
];

describe("Phase C C3b — Source guard Live cost wiring", () => {
  for (const path of LIVE_LLM_CALLERS) {
    describe(path, () => {
      const source = loadFile(path);

      it("importe `costMonitor` depuis `@/services/cost-monitor`", () => {
        expect(
          /import\s*\{[^}]*\bcostMonitor\b[^}]*\}\s*from\s*["']@\/services\/cost-monitor["']/.test(
            source
          )
        ).toBe(true);
      });

      it("appelle `costMonitor.recordLiveCall(` au moins une fois", () => {
        const matches = source.match(/costMonitor\.recordLiveCall\s*\(/g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });

      it("n'appelle JAMAIS `costMonitor.recordCall(` (réservé orchestrator)", () => {
        expect(/costMonitor\.recordCall\s*\(/.test(source)).toBe(false);
      });

      it("le `recordLiveCall` est positionné APRÈS un appel LLM (cost/result dispo)", () => {
        const completeIdx = Math.max(
          source.indexOf("completeJSON<"),
          source.indexOf("completeVisionJSON<")
        );
        const recordIdx = source.indexOf("costMonitor.recordLiveCall(");
        expect(completeIdx).toBeGreaterThan(-1);
        expect(recordIdx).toBeGreaterThan(completeIdx);
      });

      it("aucune clé de metadata sensible posée à proximité du recordLiveCall", () => {
        // Sécurité défensive : on interdit dans le fichier entier la
        // présence littérale de ces noms comme clés JS (suivies de `:`).
        // L'objet `metadata` éventuellement passé à recordLiveCall ne doit
        // jamais contenir transcript/prompt/etc., et plus largement le
        // fichier caller ne doit pas typer des metadata structurées
        // dangereuses.
        const dangerousKeys = [
          /\btranscriptText\s*:/,
          /\butteranceText\s*:/,
          /\bpromptText\s*:/,
          /\buserPromptText\s*:/,
          /\bsystemPromptText\s*:/,
          /\bextractedText\s*:/,
          /\brawContent\s*:/,
        ];
        // Look only within ~400 chars after every `recordLiveCall(` call.
        const idx = source.indexOf("costMonitor.recordLiveCall(");
        const slice = idx >= 0 ? source.slice(idx, idx + 600) : "";
        for (const re of dangerousKeys) {
          expect(re.test(slice)).toBe(false);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Guard global : `trackCoachingCost` (C3a, log-only) n'est plus utilisé par
// `visual-processor.ts` (migré vers `recordLiveCall` en C3b — décision Codex
// pour éviter le double log).
// ---------------------------------------------------------------------------

describe("Phase C C3b — visual-processor : trackCoachingCost retiré (anti-double-log)", () => {
  const source = loadFile("src/lib/live/visual-processor.ts");

  it("visual-processor.ts n'importe plus `trackCoachingCost`", () => {
    expect(/\btrackCoachingCost\b/.test(source)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Guard : monitoring.ts conserve trackCoachingCost exporté (compat C3a).
// ---------------------------------------------------------------------------

describe("Phase C C3b — monitoring.ts conserve l'API C3a", () => {
  const source = loadFile("src/lib/live/monitoring.ts");

  it("trackCoachingCost reste exporté (compat C3a)", () => {
    expect(/export\s+function\s+trackCoachingCost\s*\(/.test(source)).toBe(true);
  });
});
