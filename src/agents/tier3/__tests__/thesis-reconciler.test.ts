import { describe, expect, it, vi } from "vitest";

import type { ThesisExtractorOutput } from "@/agents/thesis/types";
import type { AgentContext } from "@/agents/types";

vi.mock("@/services/openrouter/router", () => ({
  complete: vi.fn(),
  completeJSON: vi.fn(),
  completeJSONValidated: vi.fn(),
  completeJSONStream: vi.fn(),
  completeStream: vi.fn(),
}));

import { ThesisReconcilerAgent, ThesisReconcilerSchema } from "../thesis-reconciler";

type DeterministicChallenge = {
  field: "problem" | "solution" | "whyNow" | "moat" | "loadBearing" | null;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  agentName: string;
  reason: string;
};
type DeterministicGuardrails = {
  blockers: Array<{ agentName: string; reason: string; recommendation?: string }>;
  challenges: DeterministicChallenge[];
  verdictFloor?: string;
};
type ReconcilerInternals = {
  buildDeterministicLLMReconciliation: (
    thesis: ThesisExtractorOutput,
    guardrails: DeterministicGuardrails
  ) => {
    updatedVerdict: string;
    updatedConfidence: number;
    newRedFlags: Array<{ category: string; severity: string; sourceAgent: string; sourceClaim: string; conflictingFinding: string }>;
    reconciliationNotes: Array<{ title: string; detail: string; impact: string }>;
    hiddenStrengths: string[];
  };
  buildDeterministicGuardrails: (context: AgentContext) => DeterministicGuardrails;
};

function buildThesis(): ThesisExtractorOutput {
  return {
    reformulated: "La societe pense pouvoir dominer une niche logicielle.",
    problem: "Le marche souffre d'un pilotage manuel lent.",
    solution: "Une plateforme automatisee pour les equipes operationnelles.",
    whyNow: "Le virage IA rend l'automatisation abordable.",
    moat: "Un moat produit + distribution",
    verdict: "contrasted",
    confidence: 72,
    loadBearing: [
      {
        id: "lb1",
        statement: "Le produit restera nettement differencie",
        status: "declared",
        impact: "Sans differenciation le pricing s'effondre",
        validationPath: "Verifier les pertes de deals et les win/loss",
      },
    ],
    alerts: [],
    ycLens: {
      framework: "yc",
      verdict: "contrasted",
      confidence: 60,
      question: "Question YC",
      claims: [],
      failures: [],
      strengths: [],
      summary: "summary",
      availability: "evaluated",
    },
    thielLens: {
      framework: "thiel",
      verdict: "contrasted",
      confidence: 60,
      question: "Question Thiel",
      claims: [],
      failures: [],
      strengths: [],
      summary: "summary",
      availability: "evaluated",
    },
    angelDeskLens: {
      framework: "angel-desk",
      verdict: "contrasted",
      confidence: 60,
      question: "Question AD",
      claims: [],
      failures: [],
      strengths: [],
      summary: "summary",
      availability: "evaluated",
    },
    sourceDocumentIds: [],
    sourceHash: "hash",
  };
}

describe("ThesisReconcilerAgent deterministic guardrails", () => {
  it("derives an alert_dominant floor from blocker and critical thesis challenges", () => {
    const agent = new ThesisReconcilerAgent() as unknown as {
      buildDeterministicGuardrails: (context: AgentContext) => {
        verdictFloor?: string;
        blockers: Array<{ agentName: string }>;
        challenges: Array<{ field: string; agentName: string; severity: string }>;
      };
    };

    const context = {
      previousResults: {
        "thesis-extractor": {
          success: true,
          data: buildThesis(),
        },
        "competitive-intel": {
          success: true,
          data: {
            alertSignal: {
              hasBlocker: true,
              blockerReason: "Moat non defendable face a des concurrents mieux finances",
            },
            redFlags: [
              {
                severity: "CRITICAL",
                title: "Concurrence frontale",
                description: "Trois concurrents commoditisent deja la proposition de valeur",
              },
            ],
          },
        },
        "financial-auditor": {
          success: true,
          data: {
            redFlags: [
              {
                severity: "HIGH",
                title: "Unit economics non soutenables",
                description: "La trajectoire de burn fragilise la these economique",
              },
            ],
          },
        },
      },
    } as unknown as AgentContext;

    const guardrails = agent.buildDeterministicGuardrails(context);

    expect(guardrails.verdictFloor).toBe("alert_dominant");
    expect(guardrails.blockers).toHaveLength(1);
    expect(guardrails.challenges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "moat",
          agentName: "competitive-intel",
          severity: "CRITICAL",
        }),
        expect.objectContaining({
          // « Unit economics non soutenables » ne matche aucun champ → field null
          // (plus de défaut « loadBearing » fabriqué — Codex 9a).
          field: null,
          agentName: "financial-auditor",
          severity: "HIGH",
        }),
      ])
    );
  });

  it("mentions deterministic guardrails in the user prompt", () => {
    const agent = new ThesisReconcilerAgent() as unknown as {
      buildUserPrompt: (
        thesis: ThesisExtractorOutput,
        findings: string,
        guardrails: {
          verdictFloor?: string;
          blockers: Array<{ agentName: string; reason: string }>;
          challenges: Array<{ field: string; severity: string; agentName: string; reason: string }>;
        }
      ) => string;
    };

    const prompt = agent.buildUserPrompt(buildThesis(), "findings", {
      verdictFloor: "vigilance",
      blockers: [
        {
          agentName: "market-intelligence",
          reason: "Timing reglementaire defavorable au why-now revendique",
        },
      ],
      challenges: [
        {
          field: "whyNow",
          severity: "CRITICAL",
          agentName: "market-intelligence",
          reason: "Timing reglementaire defavorable au why-now revendique",
        },
      ],
    });

    expect(prompt).toContain("GARDE-FOUS DETERMINISTES");
    expect(prompt).toContain("market-intelligence");
    expect(prompt).toContain("vigilance");
  });
});

describe("ThesisReconcilerAgent — réconciliation déterministe (Phase 9a, terminalFallbackData)", () => {
  const agent = () => new ThesisReconcilerAgent() as unknown as ReconcilerInternals;

  const guardrails: DeterministicGuardrails = {
    verdictFloor: "alert_dominant",
    blockers: [{ agentName: "competitive-intel", reason: "Moat non defendable" }],
    challenges: [
      { field: "moat", severity: "CRITICAL", agentName: "competitive-intel", reason: "Moat non defendable" },
      { field: "solution", severity: "HIGH", agentName: "tech-stack-dd", reason: "Solution techniquement fragile" },
      { field: "whyNow", severity: "MEDIUM", agentName: "market-intelligence", reason: "Timing incertain" },
    ],
  };

  it("produit un output VALIDE contre le schéma (sinon throw → success:false)", () => {
    const out = agent().buildDeterministicLLMReconciliation(buildThesis(), guardrails);
    expect(ThesisReconcilerSchema.safeParse(out).success).toBe(true);
  });

  it("pose le verdict au floor déterministe + confiance basse", () => {
    const out = agent().buildDeterministicLLMReconciliation(buildThesis(), guardrails);
    expect(out.updatedVerdict).toBe("alert_dominant");
    expect(out.updatedConfidence).toBeLessThanOrEqual(30); // dégradé → confiance basse
    expect(out.hiddenStrengths).toEqual([]);
  });

  it("newRedFlags PRUDENTS : seulement CRITICAL/HIGH avec un claim porteur réel ; MEDIUM → note", () => {
    const out = agent().buildDeterministicLLMReconciliation(buildThesis(), guardrails);
    // moat (CRITICAL, claim réel) + solution (HIGH, claim réel) → 2 newRedFlags ; whyNow MEDIUM → note
    expect(out.newRedFlags).toHaveLength(2);
    for (const rf of out.newRedFlags) {
      expect(rf.category).toBe("THESIS_VS_REALITY");
      expect(rf.sourceAgent.length).toBeGreaterThan(0);
      expect(rf.sourceClaim.length).toBeGreaterThan(0);
      expect(rf.conflictingFinding.length).toBeGreaterThan(0);
    }
    expect(out.reconciliationNotes.some((n) => /Timing incertain/.test(n.detail))).toBe(true);
  });

  it("claim porteur ABSENT (moat null) → reconciliationNote, jamais un newRedFlag aux champs fabriqués", () => {
    const thesisNoMoat = { ...buildThesis(), moat: null };
    const out = agent().buildDeterministicLLMReconciliation(thesisNoMoat, {
      verdictFloor: "vigilance",
      blockers: [],
      challenges: [{ field: "moat", severity: "CRITICAL", agentName: "competitive-intel", reason: "Moat non defendable" }],
    });
    expect(out.newRedFlags).toHaveLength(0); // pas de sourceClaim réel → pas de red flag fabriqué
    expect(out.reconciliationNotes.length).toBeGreaterThan(0);
    expect(ThesisReconcilerSchema.safeParse(out).success).toBe(true);
  });

  it("est DÉTERMINISTE (même entrée → sortie identique, pour l'idempotence au replay)", () => {
    const a = agent().buildDeterministicLLMReconciliation(buildThesis(), guardrails);
    const b = agent().buildDeterministicLLMReconciliation(buildThesis(), guardrails);
    expect(a).toEqual(b);
  });

  it("sans floor ni challenge → conserve le verdict initial, output valide", () => {
    const out = agent().buildDeterministicLLMReconciliation(buildThesis(), {
      verdictFloor: undefined,
      blockers: [],
      challenges: [],
    });
    expect(out.updatedVerdict).toBe("contrasted"); // verdict initial du fixture
    expect(out.newRedFlags).toEqual([]);
    expect(ThesisReconcilerSchema.safeParse(out).success).toBe(true);
  });

  it("Codex 9a : red flag non classable → challenge field=null, ZÉRO newRedFlag fabriqué contre loadBearing[0]", () => {
    const context = {
      previousResults: {
        "thesis-extractor": { success: true, data: buildThesis() },
        "financial-auditor": {
          success: true,
          data: { redFlags: [{ severity: "CRITICAL", title: "Anomalie comptable", description: "Écriture non catégorisable au bilan" }] },
        },
      },
    } as unknown as AgentContext;
    const a = agent();
    const g = a.buildDeterministicGuardrails(context);
    const ch = g.challenges.find((c) => c.agentName === "financial-auditor");
    expect(ch?.field).toBeNull(); // plus de défaut « loadBearing »
    // et le déterministe ne fabrique PAS de THESIS_VS_REALITY contre la 1ʳᵉ hypothèse porteuse
    const out = a.buildDeterministicLLMReconciliation(buildThesis(), g);
    expect(out.newRedFlags).toHaveLength(0);
    expect(out.reconciliationNotes.length).toBeGreaterThan(0);
    expect(ThesisReconcilerSchema.safeParse(out).success).toBe(true);
  });

  it("Codex #2 : un blocker SEUL → floor vigilance (plus de double-compte → alert_dominant)", () => {
    const context = {
      previousResults: {
        "thesis-extractor": { success: true, data: buildThesis() },
        "competitive-intel": {
          success: true,
          data: {
            alertSignal: { hasBlocker: true, blockerReason: "Moat non defendable face a la concurrence" },
            // PAS de redFlag CRITICAL séparé : un seul signal critique réel
          },
        },
      },
    } as unknown as AgentContext;

    const guardrailsOut = agent().buildDeterministicGuardrails(context);
    expect(guardrailsOut.blockers).toHaveLength(1);
    expect(guardrailsOut.verdictFloor).toBe("vigilance"); // 1 signal critique → vigilance, PAS alert_dominant
  });
});
