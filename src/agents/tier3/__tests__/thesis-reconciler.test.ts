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

import { ThesisReconcilerAgent } from "../thesis-reconciler";

function buildThesis(): ThesisExtractorOutput {
  return {
    reformulated: "La societe pense pouvoir dominer une niche logicielle.",
    problem: "Le marche souffre d'un pilotage manuel lent.",
    solution: "Une plateforme automatisee pour les equipes operationnelles.",
    whyNow: "Le virage IA rend l'automatisation abordable.",
    moat: "Un moat produit + distribution",
    pathToExit: "Acquisition par un consolidateur logiciel",
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
                title: "Exit hautement improbable",
                description: "La trajectoire de burn rend le path to exit peu credible",
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
          field: "pathToExit",
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
