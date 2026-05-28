import type { EvidenceSolidity, Orientation } from "@/lib/ui-configs";

import {
  agentData,
  agentError,
  arrayAt,
  compactString,
  isFiniteNumber,
  isRecord,
  isString,
  numberAt,
  stringAt,
  valueAt,
  type ResultsMap,
} from "./extractors";
import {
  aggregateOrientation,
  aggregateSolidity,
  buildAgentSnapshots,
  countAlertSignalDistribution,
  flattenInsights,
  pickTier2ExpertSnapshot,
  summarizeOneLiner,
  tier3CompletionState,
  type AgentSnapshot,
} from "./solidity-aggregator";
import type { AgentCardSignal } from "../atoms/agent-card";
import type { EvidenceRowProps } from "../atoms/evidence-row";
import type { RankRowItem, SignalWithSource, ThesisCard, LoadBearingClaim, ThesisAlert } from "./view-types";
import { collectEvidence } from "./evidence-collector";

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  ABSOLUTE: 0,
  HIGH: 1,
  SERIOUS: 1,
  CONDITIONAL: 1,
  MEDIUM: 2,
  WARNING: 2,
  LOW: 3,
  INFO: 4,
};

function rankSeverity(value: unknown): number {
  if (!isString(value)) return 99;
  return SEVERITY_RANK[value.toUpperCase()] ?? 99;
}

function severityToPill(value: unknown): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" {
  if (!isString(value)) return "MEDIUM";
  const upper = value.toUpperCase();
  if (upper === "ABSOLUTE" || upper === "CRITICAL") return "CRITICAL";
  if (upper === "SERIOUS" || upper === "CONDITIONAL" || upper === "HIGH") return "HIGH";
  if (upper === "WARNING" || upper === "MEDIUM") return "MEDIUM";
  if (upper === "LOW") return "LOW";
  return "INFO";
}

function severityLabel(severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"): string {
  return { CRITICAL: "Critique", HIGH: "Élevé", MEDIUM: "Moyen", LOW: "Faible", INFO: "Info" }[severity];
}

const POSITIVE_KEYWORDS = /(force|atout|opportun|conviction|avantage|étay|sécuris|valid|aligné|cohérent|preuve|favorable|robuste)/i;
const NEGATIVE_KEYWORDS = /(risque|alerte|contradictoire|carence|opaque|fragile|incomplet|absent|manqu|incohér|exagér|trompeur|projection|spéculat|hypothè|doute)/i;

function extractDealHeader(deal: { id: string; name?: string | null; companyName?: string | null; status?: string | null; sector?: string | null; stage?: string | null }, analysis: { completedAt?: Date | null; totalCost?: number | null; totalTimeMs?: number | null; totalAgents?: number | null; completedAgents?: number | null; mode?: string | null }) {
  const name = deal.companyName ?? deal.name ?? "Dossier sans nom";
  return {
    name,
    status: deal.status ?? null,
    sector: deal.sector ?? null,
    stage: deal.stage ?? null,
    completedAt: analysis.completedAt ? new Date(analysis.completedAt) : null,
    totalCostUsd: typeof analysis.totalCost === "number" ? analysis.totalCost : null,
    totalDurationMin: typeof analysis.totalTimeMs === "number" ? Math.round(analysis.totalTimeMs / 60000) : null,
    totalAgents: analysis.totalAgents ?? null,
    completedAgents: analysis.completedAgents ?? null,
    mode: analysis.mode ?? null,
  };
}

function extractRanksFromQuestionMaster(results: ResultsMap | null | undefined): RankRowItem[] {
  if (!results) return [];
  const qm = agentData(results, "question-master");
  if (!isRecord(qm)) return [];
  const dealbreakers = arrayAt(qm, ["dealbreakers"]);
  const ranks: RankRowItem[] = [];
  for (const item of dealbreakers) {
    if (!isRecord(item)) continue;
    const severity = severityToPill(stringAt(item, ["severity"]));
    const condition = stringAt(item, ["condition"]) ?? stringAt(item, ["description"]) ?? "Condition critique";
    const description = stringAt(item, ["description"]);
    const sourceAgent = stringAt(item, ["sourceAgent"]);
    const riskIf = stringAt(item, ["riskIfIgnored"]);
    const timeToResolve = stringAt(item, ["timeToResolve"]);
    ranks.push({
      id: stringAt(item, ["id"]) ?? `qm-${ranks.length}`,
      title: compactString(condition, 180) ?? "Condition critique",
      description: compactString(description ?? riskIf, 280) ?? undefined,
      severity,
      severityLabel: severityLabel(severity),
      source: sourceAgent ?? "question-master",
      tags: timeToResolve ? [{ label: `Délai : ${timeToResolve}`, tone: "info" as const }] : [],
    });
  }
  return ranks;
}

function extractRanksFromTier1RedFlags(results: ResultsMap | null | undefined, limit: number): RankRowItem[] {
  if (!results) return [];
  const collected: Array<RankRowItem & { _rank: number }> = [];
  for (const [name, entry] of Object.entries(results)) {
    if (!entry?.success) continue;
    const redFlags = arrayAt(entry.data, ["redFlags"]);
    for (const rf of redFlags) {
      if (!isRecord(rf)) continue;
      const severityRaw = stringAt(rf, ["severity"]);
      const severityRank = rankSeverity(severityRaw);
      if (severityRank > 1) continue;
      const severity = severityToPill(severityRaw);
      const title = stringAt(rf, ["title"]) ?? stringAt(rf, ["description"]) ?? "Risque identifié";
      const description = stringAt(rf, ["description"]);
      const location = stringAt(rf, ["location"]);
      const impact = stringAt(rf, ["impact"]);
      const evidence = stringAt(rf, ["evidence"]);
      collected.push({
        id: stringAt(rf, ["id"]) ?? `${name}-${collected.length}`,
        title: compactString(title, 180) ?? "Risque identifié",
        description: compactString([description, impact].filter(Boolean).join(" · "), 280),
        severity,
        severityLabel: severityLabel(severity),
        source: name,
        tags: [
          location ? { label: location, tone: "neutral" as const } : null,
          evidence ? { label: compactString(evidence, 80) ?? "", tone: "info" as const } : null,
        ].filter((t): t is { label: string; tone: "neutral" | "info" } => t !== null && t.label.length > 0),
        _rank: severityRank,
      });
    }
  }
  collected.sort((a, b) => a._rank - b._rank);
  const seen = new Set<string>();
  const deduped: RankRowItem[] = [];
  for (const item of collected) {
    const key = item.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ id: item.id, title: item.title, description: item.description, severity: item.severity, severityLabel: item.severityLabel, source: item.source, tags: item.tags });
    if (deduped.length >= limit) break;
  }
  return deduped;
}

function extractPositiveSignals(results: ResultsMap | null | undefined, limit: number): SignalWithSource[] {
  if (!results) return [];
  const out: SignalWithSource[] = [];
  for (const [name, entry] of Object.entries(results)) {
    if (!entry?.success) continue;
    const insights = arrayAt(entry.data, ["narrative", "keyInsights"]);
    for (const insight of insights) {
      if (!isString(insight)) continue;
      if (NEGATIVE_KEYWORDS.test(insight)) continue;
      if (POSITIVE_KEYWORDS.test(insight)) {
        out.push({ text: insight, source: name });
      }
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

function extractVigilanceSignals(results: ResultsMap | null | undefined, limit: number): SignalWithSource[] {
  if (!results) return [];
  const out: SignalWithSource[] = [];
  for (const [name, entry] of Object.entries(results)) {
    if (!entry?.success) continue;
    const insights = arrayAt(entry.data, ["narrative", "keyInsights"]);
    for (const insight of insights) {
      if (!isString(insight)) continue;
      if (!NEGATIVE_KEYWORDS.test(insight)) continue;
      out.push({ text: insight, source: name });
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function buildDecisionStripModel(deal: { id: string; name?: string | null; companyName?: string | null; status?: string | null; sector?: string | null; stage?: string | null }, analysis: { results: ResultsMap | null | undefined; completedAt?: Date | null; totalCost?: number | null; totalTimeMs?: number | null; totalAgents?: number | null; completedAgents?: number | null; mode?: string | null }, thesis: { verdict?: string | null; reformulated?: string | null } | null) {
  const header = extractDealHeader(deal, analysis);
  const orientation = aggregateOrientation(analysis.results) as Orientation | null;
  const solidity = aggregateSolidity(analysis.results) as EvidenceSolidity | null;
  const alertDistribution = countAlertSignalDistribution(analysis.results);
  const coherenceScore = numberAt(agentData(analysis.results, "deck-coherence-checker"), ["coherenceScore"]);
  const completion = tier3CompletionState(analysis.results);
  const contradictionsCritical = arrayAt(
    agentData(analysis.results, "contradiction-detector"),
    ["findings", "contradictions"],
  ).filter((c) => isRecord(c) && stringAt(c, ["severity"]) === "CRITICAL").length;
  const totalContradictions = arrayAt(
    agentData(analysis.results, "contradiction-detector"),
    ["findings", "contradictions"],
  ).length;
  const thesisVerdict = isString(thesis?.verdict) ? (thesis!.verdict as Orientation) : null;

  return {
    header,
    orientation,
    solidity,
    alertDistribution,
    coherenceScore: coherenceScore != null ? Math.round(coherenceScore) : null,
    contradictionsCritical,
    totalContradictions,
    thesisVerdict,
    completion,
  };
}

export function buildDecisionSectionModel(results: ResultsMap | null | undefined) {
  return {
    favorable: extractPositiveSignals(results, 5),
    vigilance: extractVigilanceSignals(results, 5),
    ranks: (() => {
      const fromQm = extractRanksFromQuestionMaster(results);
      const fromRedFlags = extractRanksFromTier1RedFlags(results, 8);
      const merged: RankRowItem[] = [];
      const seen = new Set<string>();
      for (const item of [...fromQm, ...fromRedFlags]) {
        const key = item.title.toLowerCase().slice(0, 80);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
        if (merged.length >= 8) break;
      }
      return merged;
    })(),
    alertConvergence: countAlertSignalDistribution(results),
  };
}

export type ThesisSectionModel = {
  cards: ThesisCard[];
  loadBearing: LoadBearingClaim[];
  alerts: ThesisAlert[];
  reconciled: boolean;
  reconciliationReason: string | null;
  verdict: string | null;
  confidence: number | null;
};

export function buildThesisSectionModel(thesis: Record<string, unknown> | null, results: ResultsMap | null | undefined): ThesisSectionModel {
  if (!thesis) {
    return { cards: [], loadBearing: [], alerts: [], reconciled: false, reconciliationReason: "Aucune thèse enregistrée pour ce dossier.", verdict: null, confidence: null };
  }
  const cards: ThesisCard[] = [
    { key: "reformulated", title: "Reformulation", body: stringAt(thesis, ["reformulated"]) },
    { key: "problem", title: "Problème", body: stringAt(thesis, ["problem"]) },
    { key: "solution", title: "Solution", body: stringAt(thesis, ["solution"]) },
    { key: "whyNow", title: "Why now", body: stringAt(thesis, ["whyNow"]) },
    { key: "moat", title: "Moat", body: stringAt(thesis, ["moat"]) },
    { key: "pathToExit", title: "Path-to-exit", body: stringAt(thesis, ["pathToExit"]) },
  ].filter((c) => isString(c.body)) as ThesisCard[];

  const loadBearingRaw = arrayAt(thesis, ["loadBearing"]);
  const loadBearing: LoadBearingClaim[] = loadBearingRaw
    .map((item) => {
      if (!isRecord(item)) return null;
      const status = stringAt(item, ["status"]);
      const statement = stringAt(item, ["statement"]);
      if (!statement) return null;
      return {
        id: stringAt(item, ["id"]) ?? statement.slice(0, 40),
        statement,
        status: status === "verified" || status === "contradicted" ? status : "declared",
        impact: stringAt(item, ["impact"]),
        validationPath: stringAt(item, ["validationPath"]),
      } satisfies LoadBearingClaim;
    })
    .filter((x): x is LoadBearingClaim => x !== null);

  const alertsRaw = arrayAt(thesis, ["alerts"]);
  const alerts: ThesisAlert[] = alertsRaw
    .map((item) => {
      if (!isRecord(item)) return null;
      const title = stringAt(item, ["title"]);
      if (!title) return null;
      const sev = severityToPill(stringAt(item, ["severity"]));
      return {
        id: stringAt(item, ["id"]) ?? title.slice(0, 40),
        title,
        detail: stringAt(item, ["detail"]),
        category: stringAt(item, ["category"]),
        severity: sev,
        severityLabel: severityLabel(sev),
      } satisfies ThesisAlert;
    })
    .filter((x): x is ThesisAlert => x !== null)
    .sort((a, b) => rankSeverity(a.severity) - rankSeverity(b.severity));

  const reconciled = results?.["thesis-reconciler"]?.success === true;
  const reconciliationReason = reconciled
    ? null
    : "Le réconciliateur de thèse n'a pas tourné sur cette analyse. Les hypothèses porteuses ci-dessous n'ont pas été confrontées aux résultats des Tier 1.";

  return {
    cards,
    loadBearing,
    alerts,
    reconciled,
    reconciliationReason,
    verdict: stringAt(thesis, ["verdict"]),
    confidence: numberAt(thesis, ["confidence"]),
  };
}

export type SignalsSectionModel = {
  cards: AgentCardSignal[];
  emptyCards: Array<{ agentLabel: string; reason: "failed" | "missing" | "not_activated"; errorMessage?: string }>;
  tier2: { snapshot: AgentSnapshot | null; activated: boolean };
};

export function buildSignalsSectionModel(results: ResultsMap | null | undefined): SignalsSectionModel {
  const snapshots = buildAgentSnapshots(results);
  const cards: AgentCardSignal[] = [];
  const emptyCards: SignalsSectionModel["emptyCards"] = [];
  for (const snap of snapshots) {
    if (snap.status === "ok") {
      const orientationFromContribution = valueAt(snap.data, ["signalContribution", "orientation"]);
      const solidityFromContribution = valueAt(snap.data, ["signalContribution", "evidenceSolidity"]);
      const intensity = valueAt(snap.data, ["signalIntensity"]);
      const orientation = isString(orientationFromContribution)
        ? (orientationFromContribution as Orientation)
        : isString(intensity)
          ? intensityToOrientation(intensity)
          : null;
      const solidity = isString(solidityFromContribution) ? (solidityFromContribution as EvidenceSolidity) : null;
      const insights = flattenInsights(snap.data, 3);
      const oneLiner = summarizeOneLiner(snap.data);
      const redFlags = arrayAt(snap.data, ["redFlags"]).length;
      const questions = arrayAt(snap.data, ["questions"]).length;
      const score = numberAt(snap.data, ["score", "value"]);
      cards.push({
        agentLabel: snap.label,
        agentRole: snap.role,
        oneLiner,
        orientation,
        solidity,
        scoreValue: score != null ? Math.round(score) : null,
        insights,
        redFlagCount: redFlags,
        questionCount: questions,
      });
    } else {
      emptyCards.push({
        agentLabel: snap.label,
        reason: snap.status === "failed" ? "failed" : "missing",
        errorMessage: snap.error ?? undefined,
      });
    }
  }
  const tier2Snapshot = pickTier2ExpertSnapshot(results);
  return { cards, emptyCards, tier2: { snapshot: tier2Snapshot, activated: tier2Snapshot !== null } };
}

function intensityToOrientation(intensity: string): Orientation | null {
  switch (intensity) {
    case "low":
      return "favorable";
    case "elevated":
      return "contrasted";
    case "high":
      return "vigilance";
    case "critical":
      return "alert_dominant";
    default:
      return null;
  }
}

export function buildEvidenceSectionModel(results: ResultsMap | null | undefined): EvidenceRowProps[] {
  return collectEvidence(results);
}

export type MemoSectionModel =
  | {
      kind: "generated";
      executiveSummary: string | null;
      keyPoints: string[];
      companyOverview: string | null;
      investmentThesis: string | null;
      criticalRisks: Array<{ title: string; detail: string | null }>;
      nextSteps: string[];
    }
  | {
      kind: "reconstituted";
      reason: string;
      strengths: SignalWithSource[];
      criticalRisks: Array<{ title: string; detail: string | null; source: string }>;
      topPriorities: Array<{ action: string; rationale: string | null; deadline: string | null; priority: string | null }>;
      diligenceItems: Array<{ item: string; documentsNeeded: string[]; estimatedEffort: string | null }>;
      negotiationPoints: Array<{ point: string; category: string | null; argument: string | null }>;
      forNegotiation: string[];
    };

export function buildMemoSectionModel(results: ResultsMap | null | undefined): MemoSectionModel {
  const memo = agentData(results, "memo-generator");
  if (isRecord(memo)) {
    return {
      kind: "generated",
      executiveSummary: stringAt(memo, ["executiveSummary", "oneLiner"]),
      keyPoints: arrayAt(memo, ["executiveSummary", "keyPoints"])
        .map((kp) => (isString(kp) ? kp : isRecord(kp) ? stringAt(kp, ["text"]) : null))
        .filter((kp): kp is string => kp !== null),
      companyOverview: stringAt(memo, ["companyOverview"]),
      investmentThesis: isString(valueAt(memo, ["investmentThesis"]))
        ? (valueAt(memo, ["investmentThesis"]) as string)
        : stringAt(memo, ["investmentThesis", "summary"]),
      criticalRisks: arrayAt(memo, ["criticalRisks"])
        .map((r) => {
          if (!isRecord(r)) return null;
          return { title: stringAt(r, ["title"]) ?? "Risque", detail: stringAt(r, ["detail"]) ?? stringAt(r, ["description"]) };
        })
        .filter((r): r is { title: string; detail: string | null } => r !== null),
      nextSteps: arrayAt(memo, ["nextSteps"])
        .map((s) => (isString(s) ? s : null))
        .filter((s): s is string => s !== null),
    };
  }

  const qm = agentData(results, "question-master");
  const strengths = extractPositiveSignals(results, 6);
  const ranks = extractRanksFromTier1RedFlags(results, 6);
  const topPrioritiesRaw = isRecord(qm) ? arrayAt(qm, ["topPriorities"]) : [];
  const diligenceRaw = isRecord(qm) ? arrayAt(qm, ["diligenceChecklist", "items"]) : [];
  const negotiationRaw = isRecord(qm) ? arrayAt(qm, ["negotiationPoints"]) : [];
  const forNegotiation: string[] = [];
  if (results) {
    for (const entry of Object.values(results)) {
      if (!entry?.success) continue;
      const items = arrayAt(entry.data, ["narrative", "forNegotiation"]);
      for (const i of items) if (isString(i)) forNegotiation.push(i);
    }
  }

  return {
    kind: "reconstituted",
    reason: "Le mémo synthétique n'a pas pu être généré par l'agent. La vue ci-dessous reconstitue les éléments à partir des Tier 1 disponibles, du Question Master et de la cohérence documentaire.",
    strengths,
    criticalRisks: ranks
      .filter((r) => r.severity === "CRITICAL" || r.severity === "HIGH")
      .map((r) => ({
        title: r.title,
        detail: r.description ?? null,
        source: r.source ?? "Tier 1",
      })),
    topPriorities: topPrioritiesRaw
      .map((p) => {
        if (!isRecord(p)) return null;
        return {
          action: stringAt(p, ["action"]) ?? "Action prioritaire",
          rationale: stringAt(p, ["rationale"]),
          deadline: stringAt(p, ["deadline"]),
          priority: stringAt(p, ["priority"]),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    diligenceItems: diligenceRaw
      .map((it) => {
        if (!isRecord(it)) return null;
        const docs = arrayAt(it, ["documentsNeeded"]).filter(isString) as string[];
        return {
          item: stringAt(it, ["item"]) ?? "Item de diligence",
          documentsNeeded: docs,
          estimatedEffort: stringAt(it, ["estimatedEffort"]),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    negotiationPoints: negotiationRaw
      .map((n) => {
        if (!isRecord(n)) return null;
        return {
          point: stringAt(n, ["point"]) ?? "Point de négociation",
          category: stringAt(n, ["category"]),
          argument: stringAt(n, ["leverage", "argument"]) ?? stringAt(n, ["argument"]),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    forNegotiation,
  };
}

export type AnalysisV2ViewModel = {
  decisionStrip: ReturnType<typeof buildDecisionStripModel>;
  decisionSection: ReturnType<typeof buildDecisionSectionModel>;
  thesisSection: ThesisSectionModel;
  signalsSection: SignalsSectionModel;
  evidenceSection: EvidenceRowProps[];
  memoSection: MemoSectionModel;
};

export function buildAnalysisV2ViewModel(input: {
  deal: { id: string; name?: string | null; companyName?: string | null; status?: string | null; sector?: string | null; stage?: string | null };
  analysis: { results: ResultsMap | null | undefined; completedAt?: Date | null; totalCost?: number | null; totalTimeMs?: number | null; totalAgents?: number | null; completedAgents?: number | null; mode?: string | null };
  thesis: Record<string, unknown> | null;
}): AnalysisV2ViewModel {
  const { deal, analysis, thesis } = input;
  return {
    decisionStrip: buildDecisionStripModel(deal, analysis, thesis ? { verdict: isString(thesis.verdict) ? thesis.verdict : null, reformulated: stringAt(thesis, ["reformulated"]) } : null),
    decisionSection: buildDecisionSectionModel(analysis.results),
    thesisSection: buildThesisSectionModel(thesis, analysis.results),
    signalsSection: buildSignalsSectionModel(analysis.results),
    evidenceSection: buildEvidenceSectionModel(analysis.results),
    memoSection: buildMemoSectionModel(analysis.results),
  };
}

export type { RankRowItem };
export { extractRanksFromTier1RedFlags, extractRanksFromQuestionMaster };

// Helper exposed for tests
export function _internalRankSeverity(v: unknown) {
  return rankSeverity(v);
}

export { isFiniteNumber };
