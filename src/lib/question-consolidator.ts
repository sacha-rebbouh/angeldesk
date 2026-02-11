import type { AgentQuestion, QuestionPriority, QuestionCategory } from "@/components/deals/founder-responses";

interface RawAgentQuestion {
  question: string;
  priority?: string;
  category?: string;
  context?: string;
  whatToLookFor?: string;
  source?: string;
}

export interface ConsolidatedQuestion extends AgentQuestion {
  /** Score de priorisation (0-100) */
  priorityScore: number;
  /** Nombre d'agents ayant posé une question similaire */
  crossAgentCount: number;
  /** Agents sources */
  sources: string[];
  /** Lié à un red flag ? */
  linkedToRedFlag: boolean;
  /** Impact sur la décision */
  decisionImpact: "BLOCKER" | "SIGNIFICANT" | "MINOR";
}

/**
 * Consolide et priorise les questions de TOUS les agents.
 * Algorithme de scoring :
 * - Base: CRITICAL=40, HIGH=30, MEDIUM=20, LOW=10
 * - Cross-agent bonus: +10 par agent supplémentaire ayant posé une question similaire
 * - Red flag link: +15 si la question est liée à un red flag
 * - Decision impact: BLOCKER=+20, SIGNIFICANT=+10, MINOR=0
 */
export function consolidateAndPrioritizeQuestions(
  results: Record<string, { success: boolean; data?: unknown }>,
  redFlagTitles: string[]
): ConsolidatedQuestion[] {
  const allQuestions: Array<RawAgentQuestion & { agentName: string }> = [];

  for (const [agentName, result] of Object.entries(results)) {
    if (!result.success || !result.data) continue;
    const data = result.data as Record<string, unknown>;

    const questionArrays = [
      data.questions,
      data.questionsForFounder,
      data.criticalQuestions,
      data.followUpQuestions,
      (data.findings as Record<string, unknown> | undefined)?.founderQuestions,
    ];

    for (const questions of questionArrays) {
      if (!Array.isArray(questions)) continue;
      for (const q of questions) {
        if (typeof q === "string") {
          allQuestions.push({ question: q, agentName });
        } else if (q && typeof q === "object" && "question" in q) {
          allQuestions.push({ ...q, agentName });
        }
      }
    }
  }

  const consolidated = deduplicateQuestions(allQuestions);

  const scored = consolidated.map((q) => {
    let score = 0;

    const prio = (q.priority ?? "MEDIUM").toUpperCase();
    if (prio === "CRITICAL") score += 40;
    else if (prio === "HIGH" || prio === "MUST_ASK") score += 30;
    else if (prio === "MEDIUM" || prio === "SHOULD_ASK") score += 20;
    else score += 10;

    score += Math.min((q.sources.length - 1) * 10, 30);

    const linkedToRedFlag = redFlagTitles.some(
      (rf) => q.question.toLowerCase().includes(rf.toLowerCase().slice(0, 20))
    );
    if (linkedToRedFlag) score += 15;

    const decisionImpact: "BLOCKER" | "SIGNIFICANT" | "MINOR" =
      prio === "CRITICAL" ? "BLOCKER" :
      prio === "HIGH" ? "SIGNIFICANT" : "MINOR";
    if (decisionImpact === "BLOCKER") score += 20;
    else if (decisionImpact === "SIGNIFICANT") score += 10;

    return {
      ...q,
      priorityScore: Math.min(score, 100),
      linkedToRedFlag,
      decisionImpact,
    };
  });

  return scored.sort((a, b) => b.priorityScore - a.priorityScore);
}

function deduplicateQuestions(
  questions: Array<RawAgentQuestion & { agentName: string }>
): Array<ConsolidatedQuestion> {
  const seen = new Map<string, ConsolidatedQuestion>();

  for (const q of questions) {
    if (!q.question) continue;
    const key = q.question.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);

    if (!seen.has(key)) {
      seen.set(key, {
        id: `cq-${seen.size + 1}`,
        question: q.question,
        category: mapCategory(q.category ?? inferCategory(q.agentName)),
        priority: mapPriority(q.priority ?? "MEDIUM"),
        agentSource: q.agentName,
        priorityScore: 0,
        crossAgentCount: 1,
        sources: [q.agentName],
        linkedToRedFlag: false,
        decisionImpact: "MINOR",
      });
    } else {
      const existing = seen.get(key)!;
      existing.crossAgentCount += 1;
      if (!existing.sources.includes(q.agentName)) {
        existing.sources.push(q.agentName);
      }
      const newPrio = mapPriority(q.priority ?? "MEDIUM");
      if (prioRank(newPrio) < prioRank(existing.priority)) {
        existing.priority = newPrio;
      }
    }
  }

  return Array.from(seen.values());
}

function mapCategory(cat: string): QuestionCategory {
  const upper = cat.toUpperCase();
  const valid: QuestionCategory[] = ["FINANCIAL", "TEAM", "MARKET", "PRODUCT", "LEGAL", "TRACTION", "OTHER"];
  return valid.includes(upper as QuestionCategory) ? upper as QuestionCategory : "OTHER";
}

function mapPriority(p: string): QuestionPriority {
  const upper = p.toUpperCase();
  if (upper === "CRITICAL") return "CRITICAL";
  if (upper === "HIGH" || upper === "MUST_ASK") return "HIGH";
  if (upper === "MEDIUM" || upper === "SHOULD_ASK") return "MEDIUM";
  return "LOW";
}

function prioRank(p: QuestionPriority): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[p];
}

function inferCategory(agentName: string): string {
  if (agentName.includes("team") || agentName.includes("founder")) return "TEAM";
  if (agentName.includes("financial") || agentName.includes("cap-table")) return "FINANCIAL";
  if (agentName.includes("market") || agentName.includes("competitive")) return "MARKET";
  if (agentName.includes("legal")) return "LEGAL";
  if (agentName.includes("tech")) return "PRODUCT";
  return "OTHER";
}
