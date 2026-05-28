import type { EvidenceSolidity, Orientation } from "@/lib/ui-configs";

import { agentData, arrayAt, isRecord, isString, type ResultsMap, valueAt } from "./extractors";

/**
 * Calcul agrégé de l'orientation et de la solidité des preuves pour la
 * decision-strip — utilisé quand `synthesis-deal-scorer.signalContribution`
 * n'est pas disponible (cas Avekapeti où l'agent a échoué).
 *
 * Règle : pas d'invention. Si la donnée agent existe, on l'utilise. Sinon, on
 * agrège à partir des Tier 1 et de la cohérence documentaire. Si rien n'est
 * exploitable, on renvoie null — l'UI affichera "Non qualifiée".
 */

const ORIENTATION_ORDER: Orientation[] = [
  "very_favorable",
  "favorable",
  "contrasted",
  "vigilance",
  "alert_dominant",
];

const SOLIDITY_ORDER: EvidenceSolidity[] = [
  "strong",
  "moderate",
  "low",
  "contradictory",
  "insufficient",
];

function isOrientation(value: unknown): value is Orientation {
  return typeof value === "string" && (ORIENTATION_ORDER as string[]).includes(value);
}

function isSolidity(value: unknown): value is EvidenceSolidity {
  return typeof value === "string" && (SOLIDITY_ORDER as string[]).includes(value);
}

export function aggregateOrientation(results: ResultsMap | null | undefined): Orientation | null {
  if (!results) return null;

  const synthesis = agentData(results, "synthesis-deal-scorer");
  const direct = valueAt(synthesis, ["signalContribution", "orientation"]);
  if (isOrientation(direct)) return direct;

  const verdictFromScorer = valueAt(synthesis, ["verdict"]);
  if (isOrientation(verdictFromScorer)) return verdictFromScorer;

  const contradictionsOrientation = valueAt(
    agentData(results, "contradiction-detector"),
    ["signalContribution", "orientation"],
  );
  if (isOrientation(contradictionsOrientation)) return contradictionsOrientation;

  const tier1Names = Object.keys(results).filter((name) => {
    const entry = results[name];
    return entry?.success && !["document-extractor", "thesis-extractor", "fact-extractor", "deck-coherence-checker"].includes(name);
  });

  const intensityCount: Record<string, number> = { low: 0, elevated: 0, high: 0, critical: 0 };
  for (const name of tier1Names) {
    const intensity = valueAt(agentData(results, name), ["signalIntensity"]);
    if (isString(intensity) && intensity in intensityCount) {
      intensityCount[intensity] += 1;
    }
  }

  const total = intensityCount.low + intensityCount.elevated + intensityCount.high + intensityCount.critical;
  if (total === 0) return null;

  const criticalRatio = intensityCount.critical / total;
  const highRatio = (intensityCount.critical + intensityCount.high) / total;
  const favorableRatio = intensityCount.low / total;

  if (criticalRatio >= 0.3) return "alert_dominant";
  if (highRatio >= 0.5) return "vigilance";
  if (favorableRatio >= 0.6) return "favorable";
  return "contrasted";
}

export function aggregateSolidity(results: ResultsMap | null | undefined): EvidenceSolidity | null {
  if (!results) return null;

  const synthesisSolidity = valueAt(
    agentData(results, "synthesis-deal-scorer"),
    ["signalContribution", "evidenceSolidity"],
  );
  if (isSolidity(synthesisSolidity)) return synthesisSolidity;

  const contradictionSolidity = valueAt(
    agentData(results, "contradiction-detector"),
    ["signalContribution", "evidenceSolidity"],
  );
  if (isSolidity(contradictionSolidity)) return contradictionSolidity;

  const aggregated = valueAt(
    agentData(results, "contradiction-detector"),
    ["aggregatedDbComparison", "overallVerdict"],
  );
  if (isString(aggregated)) {
    if (aggregated === "MAJOR_DISCREPANCIES") return "contradictory";
    if (aggregated === "SIGNIFICANT_CONCERNS") return "low";
    if (aggregated === "MINOR_ISSUES") return "moderate";
    if (aggregated === "COHERENT") return "strong";
  }

  const coherenceScore = valueAt(agentData(results, "deck-coherence-checker"), ["coherenceScore"]);
  if (typeof coherenceScore === "number") {
    if (coherenceScore >= 80) return "strong";
    if (coherenceScore >= 60) return "moderate";
    if (coherenceScore >= 40) return "low";
    return "contradictory";
  }

  return null;
}

export function dimensionTone(orientation: Orientation | null): "favorable" | "vigilance" | "alert" | "info" | "neutral" {
  if (!orientation) return "neutral";
  switch (orientation) {
    case "very_favorable":
    case "favorable":
      return "favorable";
    case "contrasted":
      return "vigilance";
    case "vigilance":
      return "info";
    case "alert_dominant":
      return "alert";
    default:
      return "neutral";
  }
}

export function countAlertSignalDistribution(results: ResultsMap | null | undefined): {
  STOP: number;
  INVESTIGATE_FURTHER: number;
  PROCEED_WITH_CAUTION: number;
  PROCEED: number;
  total: number;
} {
  const counts = { STOP: 0, INVESTIGATE_FURTHER: 0, PROCEED_WITH_CAUTION: 0, PROCEED: 0, total: 0 };
  if (!results) return counts;
  for (const entry of Object.values(results)) {
    if (!entry?.success) continue;
    const reco = valueAt(entry.data, ["alertSignal", "recommendation"]);
    if (isString(reco) && reco in counts) {
      counts[reco as keyof typeof counts] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

export function dimensionsSummary(results: ResultsMap | null | undefined): Array<{
  key: string;
  label: string;
  intensity: "low" | "elevated" | "high" | "critical" | null;
  score: number | null;
}> {
  if (!results) return [];
  const TIER1_LABELS: Record<string, string> = {
    "financial-auditor": "Finance",
    "deck-forensics": "Deck",
    "team-investigator": "Équipe",
    "market-intelligence": "Marché",
    "competitive-intel": "Concurrence",
    "exit-strategist": "Exit",
    "tech-stack-dd": "Stack tech.",
    "tech-ops-dd": "Ops & sécurité",
    "legal-regulatory": "Légal",
    "gtm-analyst": "Go-to-market",
    "customer-intel": "Clients",
    "cap-table-auditor": "Cap table",
    "question-master": "Questions",
  };
  return Object.entries(TIER1_LABELS).map(([key, label]) => {
    const data = agentData(results, key);
    const intensity = valueAt(data, ["signalIntensity"]);
    const scoreValue = valueAt(data, ["score", "value"]);
    return {
      key,
      label,
      intensity: isString(intensity) && ["low", "elevated", "high", "critical"].includes(intensity)
        ? (intensity as "low" | "elevated" | "high" | "critical")
        : null,
      score: typeof scoreValue === "number" ? Math.round(scoreValue) : null,
    };
  });
}

export function tier3CompletionState(results: ResultsMap | null | undefined): {
  hasSynthesisScorer: boolean;
  hasMemoGenerator: boolean;
  hasDevilsAdvocate: boolean;
  hasContradictionDetector: boolean;
  hasConditionsAnalyst: boolean;
  hasThesisReconciler: boolean;
  failedAgents: Array<{ name: string; error: string }>;
} {
  if (!results) {
    return {
      hasSynthesisScorer: false,
      hasMemoGenerator: false,
      hasDevilsAdvocate: false,
      hasContradictionDetector: false,
      hasConditionsAnalyst: false,
      hasThesisReconciler: false,
      failedAgents: [],
    };
  }
  const failedAgents: Array<{ name: string; error: string }> = [];
  for (const [name, entry] of Object.entries(results)) {
    if (entry && !entry.success && isString(entry.error)) {
      failedAgents.push({ name, error: entry.error });
    }
  }
  return {
    hasSynthesisScorer: results["synthesis-deal-scorer"]?.success === true,
    hasMemoGenerator: results["memo-generator"]?.success === true,
    hasDevilsAdvocate: results["devils-advocate"]?.success === true,
    hasContradictionDetector: results["contradiction-detector"]?.success === true,
    hasConditionsAnalyst: results["conditions-analyst"]?.success === true,
    hasThesisReconciler: results["thesis-reconciler"]?.success === true,
    failedAgents,
  };
}

export type AgentSnapshot = {
  key: string;
  label: string;
  role: string;
  status: "ok" | "failed" | "missing";
  data: unknown;
  error: string | null;
};

const AGENT_DEFINITIONS: Array<{ key: string; label: string; role: string }> = [
  { key: "financial-auditor", label: "Audit financier", role: "Finance" },
  { key: "deck-forensics", label: "Forensique du deck", role: "Deck" },
  { key: "team-investigator", label: "Investigation équipe", role: "Équipe" },
  { key: "market-intelligence", label: "Intelligence marché", role: "Marché" },
  { key: "competitive-intel", label: "Veille concurrentielle", role: "Concurrence" },
  { key: "exit-strategist", label: "Stratégie d'exit", role: "Exit" },
  { key: "tech-stack-dd", label: "Stack technique", role: "Tech" },
  { key: "tech-ops-dd", label: "Ops & sécurité", role: "Tech" },
  { key: "legal-regulatory", label: "Légal & régulatoire", role: "Légal" },
  { key: "gtm-analyst", label: "Go-to-market", role: "GTM" },
  { key: "customer-intel", label: "Intelligence clients", role: "Clients" },
  { key: "cap-table-auditor", label: "Audit cap table", role: "Cap table" },
  { key: "question-master", label: "Questions & conditions critiques", role: "Synthèse questions" },
];

export function buildAgentSnapshots(results: ResultsMap | null | undefined): AgentSnapshot[] {
  if (!results) {
    return AGENT_DEFINITIONS.map((def) => ({ ...def, status: "missing", data: null, error: null }));
  }
  return AGENT_DEFINITIONS.map((def) => {
    const entry = results[def.key];
    if (!entry) return { ...def, status: "missing", data: null, error: null };
    if (entry.success && entry.data) {
      return { ...def, status: "ok", data: entry.data, error: null };
    }
    return { ...def, status: "failed", data: null, error: entry.error ?? "Erreur non documentée" };
  });
}

export function pickTier2ExpertSnapshot(results: ResultsMap | null | undefined): AgentSnapshot | null {
  if (!results) return null;
  const tier2Keys = Object.keys(results).filter((name) => name.endsWith("-expert"));
  if (tier2Keys.length === 0) return null;
  const [first] = tier2Keys;
  const entry = results[first];
  if (!entry) return null;
  const def = {
    key: first,
    label: `Expert sectoriel · ${first.replace(/-expert$/, "")}`,
    role: "Lentille sectorielle",
  };
  if (entry.success && entry.data) return { ...def, status: "ok" as const, data: entry.data, error: null };
  return { ...def, status: "failed" as const, data: null, error: entry.error ?? "Erreur non documentée" };
}

export function flattenInsights(data: unknown, max = 3): string[] {
  if (!isRecord(data)) return [];
  const collected: string[] = [];
  const candidates = [
    valueAt(data, ["narrative", "keyInsights"]),
    valueAt(data, ["narrative", "insights"]),
    valueAt(data, ["keyInsights"]),
  ];
  for (const c of candidates) {
    for (const insight of arrayAt(c, [])) {
      if (isString(insight)) collected.push(insight);
      else if (isRecord(insight)) {
        const t = valueAt(insight, ["text"]);
        if (isString(t)) collected.push(t);
      }
      if (collected.length >= max) break;
    }
    if (collected.length >= max) break;
  }
  return collected;
}

export function summarizeOneLiner(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const candidates = [
    valueAt(data, ["narrative", "oneLiner"]),
    valueAt(data, ["narrative", "summary"]),
    valueAt(data, ["summary"]),
  ];
  for (const c of candidates) {
    if (isString(c) && c.trim().length > 0) return c.trim();
  }
  return null;
}
