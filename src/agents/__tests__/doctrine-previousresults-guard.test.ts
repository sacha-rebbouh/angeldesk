import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Doctrine source guard — réinjection previousResults (audit HelloCoco
 * 2026-07-20, chantier 3).
 *
 * Garde-fou contre la réintroduction de notes de deal (« Score: X/100
 * (Grade: Y) ») dans les contextes LLM construits depuis `previousResults`
 * par les agents de synthèse, et contre les patterns /100 dans les textes
 * produits restitués (red flags, justifications, early warnings).
 * Cf. doctrine § 4.1 : le numérique interne (score.value, signalIntensity)
 * reste autorisé en mécanique — c'est sa RESTITUTION/réinjection qui est bannie.
 */

function readAgentSource(relPath: string): string {
  return readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

const REINJECTION_GUARDED_FILES = [
  "tier3/contradiction-detector.ts",
  "tier3/devils-advocate.ts",
  "tier3/thesis-reconciler.ts",
  "tier3/memo-generator.ts",
  "tier1/question-master.ts",
] as const;

// Templates de réinjection de note bannis (formatters previousResults → prompt)
const BANNED_REINJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Score: X/100 (template literal)", pattern: /Score: \$\{[^}]*\}\/100/ },
  { name: "(Grade: …) dans un template", pattern: /\(Grade: ?\$\{/ },
  { name: "grade interpolé après /100", pattern: /\/100 \((?:Grade: )?\$\{[^}]*grade/i },
];

describe("source guard — pas de note de deal réinjectée depuis previousResults", () => {
  for (const file of REINJECTION_GUARDED_FILES) {
    const source = readAgentSource(file);
    for (const { name, pattern } of BANNED_REINJECTION_PATTERNS) {
      it(`${file} ne contient pas « ${name} »`, () => {
        expect(source).not.toMatch(pattern);
      });
    }
  }

  it("memo-generator ne demande plus de grade A-F au LLM (schema de prompt)", () => {
    const source = readAgentSource("tier3/memo-generator.ts");
    expect(source).not.toContain('"grade": "A|B|C|D|F"');
    expect(source).not.toMatch(/grade: "A" \| "B" \| "C" \| "D" \| "F"/);
  });

  it("le system prompt du memo ne demande ni score/grade ni recommendation prescriptive", () => {
    const source = readAgentSource("tier3/prompts/memo-generator-prompt.ts");
    expect(source).not.toMatch(/score: value \(0-100\)/);
    expect(source).not.toMatch(/grade \(A-F\)/);
    expect(source).not.toMatch(/\| Score \| Grade \|/);
    expect(source).not.toMatch(/Score \d{1,3}\/100/);
    expect(source).not.toMatch(/alertSignal: hasBlocker, recommendation/);
    expect(source).not.toMatch(/Agréger les scores/);
  });

  it("devils-advocate ne réinjecte pas l'enum prescriptif alertSignal.recommendation dans son prompt", () => {
    const source = readAgentSource("tier3/devils-advocate.ts");
    expect(source).not.toMatch(/Recommandation: \$\{alert\.recommendation\}/);
  });

  it("contradiction-detector ne restitue pas de score dans l'evidence d'un red flag auto", () => {
    const source = readAgentSource("tier3/contradiction-detector.ts");
    expect(source).not.toMatch(/evidence: `Score: \$\{/);
  });

  it("early-warnings ne restitue pas de sous-score /100 dans un template de description", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../orchestrator/early-warnings.ts"),
      "utf-8"
    );
    expect(source).not.toMatch(/\{value\}\/100/);
  });

  it("contradiction-detector ne produit pas de « X/100 » dans un texte restitué", () => {
    const source = readAgentSource("tier3/contradiction-detector.ts");
    expect(source).not.toMatch(/\$\{consistencyScore\}\/100/);
  });

  it("devils-advocate ne produit pas de « score X/100 » dans une justification restituée", () => {
    const source = readAgentSource("tier3/devils-advocate.ts");
    expect(source).not.toMatch(/score \$\{[^}]*\}\/100/);
  });
});
