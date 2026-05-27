import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Source guard pour le namespace analysis-v2.
 *
 * Empêche la régression vers le vocabulaire prescriptif banni par la doctrine
 * (CLAUDE.md § "Ce qui est INTERDIT — tolérance zéro" + pivot § 5).
 *
 * Si une nouvelle valeur LLM commençait à parler de "Pause avant
 * investissement" ou "Confiance 90%", le test attraperait la chaîne à la
 * première compilation.
 */

const BASE_DIR = join(process.cwd(), "src/components/deals/analysis-v2");

const BANNED_PATTERNS: Array<{ name: string; pattern: RegExp; allowInTestFiles?: boolean }> = [
  { name: "Investir / Ne pas investir", pattern: /\b(N['e]?\s*investissez|N[''e]?\s*investir|Ne pas investir)\b/i },
  { name: "Rejeter / Passer ce deal", pattern: /\b(Rejet(er|ez)|Passer ce deal)\b/i },
  { name: "GO / NO-GO", pattern: /\b(NO[-_\s]*GO|GO\/NO[-_\s]*GO)\b/ },
  { name: "Dealbreaker / Bloquant", pattern: /\b(Dealbreaker|Bloquant)\b/i },
  { name: "défendre un ticket/deal/opportunité", pattern: /défendre[^.]{0,12}(ticket|deal|opportunité|opportunite)/i },
  { name: "Recommandation : PASS", pattern: /Recommandation\s*:\s*PASS/i },
  { name: "Pause avant investissement", pattern: /Pause avant investissement/i },
  { name: "Décision proposée", pattern: /D[ée]cision propos[ée]e/i },
  // Axe "Confiance" en surface utilisateur — banni doctrinalement.
  // On accepte "Confiance" dans les commentaires de code et dans les tests
  // (qui exercent justement les valeurs Confidence venant des LLM), mais
  // pas dans les chaînes user-facing.
  {
    name: "Confiance comme axe scoring (label user-facing)",
    pattern: /["'`>][^"'`<]*Confiance\s+(?:\d|élevée|moyenne|faible|tr[èe]s|de\s+\d)/i,
    allowInTestFiles: true,
  },
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...listFiles(full));
    } else if (/\.(tsx?|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("doctrine guard — analysis-v2", () => {
  const files = listFiles(BASE_DIR);

  it("scans the namespace and finds source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { name, pattern, allowInTestFiles } of BANNED_PATTERNS) {
    it(`bans ${name}`, () => {
      const violations: string[] = [];
      for (const file of files) {
        if (allowInTestFiles && /__tests__/.test(file)) continue;
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          // Skip comment lines for the "Confiance" rule — comments referencing
          // the banned pattern as DOCUMENTATION are legitimate.
          if (allowInTestFiles && /^\s*(\*|\/\/|#)/.test(line)) return;
          if (pattern.test(line)) {
            violations.push(`${file.replace(BASE_DIR, "analysis-v2")}:${idx + 1} → ${line.trim()}`);
          }
        });
      }
      expect(violations, `Doctrine violation:\n${violations.join("\n")}`).toEqual([]);
    });
  }
});
