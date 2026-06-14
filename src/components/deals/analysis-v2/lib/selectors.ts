import type { EvidenceSolidity, Orientation, DeckCoherenceBand } from "@/lib/ui-configs";
import { thesisAlertCategoryLabel } from "@/lib/ui-configs";

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
import { isLegalRegistryUnavailableSignal, presentableSource, sanitizeSourceLabel, scrubAgentNamesFromText, scrubPrescriptiveDecisionLanguage } from "./presentation";

/**
 * Nettoyage des textes d'agents RENDUS : retire les noms d'agents techniques ET
 * reformule les tournures prescriptives « décision » (doctrine — l'outil ne
 * décide jamais). Défense en profondeur appliquée au rendu (rétroactif sur les
 * analyses persistées).
 */
function cleanRenderedText(raw: string | null | undefined): string {
  return scrubPrescriptiveDecisionLanguage(scrubAgentNamesFromText(raw));
}
import { inferRedFlagTopic } from "@/services/red-flag-dedup/dedup";

/**
 * Source UNIQUE des risques consolidés (Codex #10 : pas deux listes
 * divergentes entre Section 1 et le mémo). Fusionne dealbreakers Question
 * Master + red flags Tier 1, **dédupliqués par topic sémantique**
 * (`inferRedFlagTopic` — « valorisation » ne réapparaît plus 4×), triés par
 * sévérité. Pas de cap : la liste complète déduplicée (#21).
 */
function consolidateRiskRanks(results: ResultsMap | null | undefined): RankRowItem[] {
  if (!results) return [];
  const fromQm = extractRanksFromQuestionMaster(results);
  const fromRedFlags = extractRanksFromTier1RedFlags(results, 100);
  // Représentant par topic choisi par SÉVÉRITÉ la plus haute (Codex : sinon une
  // condition QM moins sévère, vue en premier, masque un red flag Tier 1 CRITICAL
  // du même topic et sous-compte les risques critiques). Premier-vu gagne à égalité.
  const byTopic = new Map<string, RankRowItem>();
  for (const item of [...fromQm, ...fromRedFlags]) {
    const key = inferRedFlagTopic(item.title);
    const existing = byTopic.get(key);
    if (!existing || rankSeverity(item.severity) < rankSeverity(existing.severity)) {
      byTopic.set(key, item);
    }
  }
  return [...byTopic.values()].sort((a, b) => rankSeverity(a.severity) - rankSeverity(b.severity));
}

/**
 * Dérive un titre lisible depuis une description/impact quand l'agent n'a pas
 * fourni de `title` (#5 : éviter le générique "Risque identifié" quand du
 * contenu existe). Première phrase, jamais tronquée silencieusement.
 */
function deriveRiskTitle(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = scrubAgentNamesFromText(text).trim();
  if (!trimmed) return null;
  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0]?.trim();
  return firstSentence && firstSentence.length > 0 ? firstSentence : trimmed;
}

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
    const riskIf = stringAt(item, ["riskIfIgnored"]);
    const timeToResolve = stringAt(item, ["timeToResolve"]);
    ranks.push({
      id: stringAt(item, ["id"]) ?? `qm-${ranks.length}`,
      title: cleanRenderedText(condition) || "Condition critique",
      description: cleanRenderedText(description ?? riskIf ?? "") || undefined,
      severity,
      severityLabel: severityLabel(severity),
      // source = nom d'agent → pas de pastille (cohérence avec les ranks Tier 1).
      source: null,
      tags: timeToResolve ? [{ label: `Délai : ${timeToResolve}`, tone: "info" as const }] : [],
    });
  }
  return ranks;
}

/**
 * Blob texte d'un red flag (tous champs porteurs de provenance/signal), utilisé
 * de façon UNIFORME par les 3 chemins du reframe « couverture légale » (#6) —
 * skip des ranks, notice `detectLegalCoverageGap`, filtre des concerns — pour
 * qu'un flag retiré des risques lève TOUJOURS la notice (jamais de troncature
 * muette, même si la source registre n'est que dans `location`). Codex #2.
 */
function redFlagSignalBlob(rf: Record<string, unknown>): string {
  return [
    stringAt(rf, ["title"]),
    stringAt(rf, ["description"]),
    stringAt(rf, ["impact"]),
    stringAt(rf, ["evidence"]),
    stringAt(rf, ["location"]),
  ]
    .filter(Boolean)
    .join(" ");
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
      const rawTitle = stringAt(rf, ["title"]);
      const description = stringAt(rf, ["description"]);
      const impact = stringAt(rf, ["impact"]);
      const location = stringAt(rf, ["location"]);
      const evidence = stringAt(rf, ["evidence"]);
      // #6 : un flag « registre officiel indisponible » n'est pas un risque société —
      // il est reclassé en notice « couverture légale à vérifier » (detectLegalCoverageGap),
      // donc retiré des risques rangés (signature explicite, jamais un « légal » flou).
      if (isLegalRegistryUnavailableSignal(redFlagSignalBlob(rf))) {
        continue;
      }
      // #5 : titre fourni (scrubé des noms d'agents — un title runtime peut en
      // contenir), sinon dérivé de description/impact, sinon générique en dernier recours.
      const cleanRawTitle = rawTitle ? cleanRenderedText(rawTitle) : "";
      const title = cleanRawTitle || cleanRenderedText(deriveRiskTitle(description ?? impact) ?? "") || "Risque identifié";
      // #7/#4 : description complète (pas de troncature muette), scrubée des noms d'agents
      // ET reformulée des tournures prescriptives « décision » (doctrine).
      const fullDescription = cleanRenderedText([description, impact].filter(Boolean).join(" · ")) || null;
      // #7 : preuve complète scrubée → rendue en détail repliable (plus de chip tronqué à 80c).
      const cleanEvidence = cleanRenderedText(evidence) || null;
      // #7 : la "source" était le nom d'agent → pas de pastille ; la provenance utile
      // est la `location` sanitizée en tag.
      const locationTag = location ? sanitizeSourceLabel(location) : null;
      collected.push({
        id: stringAt(rf, ["id"]) ?? `${name}-${collected.length}`,
        title,
        description: fullDescription,
        evidence: cleanEvidence,
        severity,
        severityLabel: severityLabel(severity),
        source: null,
        tags: locationTag ? [{ label: locationTag, tone: "neutral" as const }] : [],
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
    deduped.push({ id: item.id, title: item.title, description: item.description, evidence: item.evidence, severity: item.severity, severityLabel: item.severityLabel, source: item.source, tags: item.tags });
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
        const text = cleanRenderedText(insight);
        if (text) out.push({ text, source: name });
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
      const text = cleanRenderedText(insight);
      if (text) out.push({ text, source: name });
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Bande verbale de cohérence du deck — dérive le score interne (deck-coherence-
 * checker) en bande qualitative. Le NOMBRE n'est jamais restitué (doctrine
 * dé-scorisation) ; seule la bande alimente le libellé verbal et le ton.
 */
function deckCoherenceBand(score: number | null): DeckCoherenceBand | null {
  if (score == null) return null;
  if (score >= 80) return "strong";
  if (score >= 60) return "moderate";
  if (score >= 40) return "weak";
  return "incoherent";
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

  // Couverture HONNÊTE : ne pas se fier à analysis.completedAgents (compteur DB
  // gonflé — incrémenté même pour les échecs). On recalcule depuis les résultats
  // réellement aboutis. En mode thesis_only, Tier 1/3 ne sont pas attendus.
  const isThesisOnly = analysis.mode === "thesis_only";
  const snapshots = buildAgentSnapshots(analysis.results);
  const tier1NotOk = snapshots
    .filter((s) => s.status !== "ok")
    .map((s) => ({ label: s.label, status: s.status as "failed" | "missing" }));
  const TIER3_EXPECTED: Array<{ key: string; label: string }> = [
    { key: "synthesis-deal-scorer", label: "Synthèse du signal" },
    { key: "contradiction-detector", label: "Détection de contradictions" },
    { key: "conditions-analyst", label: "Conditions critiques" },
    { key: "devils-advocate", label: "Avocat du diable" },
    { key: "memo-generator", label: "Mémo synthétique" },
    { key: "thesis-reconciler", label: "Réconciliation de thèse" },
  ];
  const tier3NotOk = TIER3_EXPECTED
    .filter((a) => analysis.results?.[a.key]?.success !== true)
    .map((a) => ({ label: a.label, status: (analysis.results?.[a.key] ? "failed" : "missing") as "failed" | "missing" }));
  const incompleteAgents = isThesisOnly ? [] : [...tier1NotOk, ...tier3NotOk];
  const expectedTotal = snapshots.length + TIER3_EXPECTED.length;
  const coverage = {
    ok: expectedTotal - (tier1NotOk.length + tier3NotOk.length),
    total: expectedTotal,
    incompleteAgents,
    isThesisOnly,
  };

  return {
    header,
    orientation,
    solidity,
    alertDistribution,
    coherenceBand: deckCoherenceBand(coherenceScore != null ? Math.round(coherenceScore) : null),
    contradictionsCritical,
    totalContradictions,
    thesisVerdict,
    completion,
    coverage,
  };
}

/**
 * #6 : détecte si AU MOINS un agent a signalé l'indisponibilité du registre
 * officiel (Pappers/K-bis). Ces flags sont retirés des risques rangés et
 * regroupés en UNE notice honnête « couverture légale à vérifier » (pas un
 * risque société). Signature explicite (source registre ET indisponibilité).
 */
function detectLegalCoverageGap(results: ResultsMap | null | undefined): boolean {
  if (!results) return false;
  for (const entry of Object.values(results)) {
    if (!entry?.success) continue;
    for (const rf of arrayAt(entry.data, ["redFlags"])) {
      if (!isRecord(rf)) continue;
      if (isLegalRegistryUnavailableSignal(redFlagSignalBlob(rf))) return true;
    }
  }
  return false;
}

export function buildDecisionSectionModel(results: ResultsMap | null | undefined) {
  return {
    favorable: extractPositiveSignals(results, 5),
    vigilance: extractVigilanceSignals(results, 5),
    // #21 : liste complète déduplicée (source unique consolidateRiskRanks),
    // plus de cap muet à 8 ni de doublons « valorisation ».
    ranks: consolidateRiskRanks(results),
    // #6 : couverture légale (registre officiel indisponible) reclassée en notice
    // honnête, hors des risques société.
    legalCoverageGap: detectLegalCoverageGap(results),
    alertConvergence: countAlertSignalDistribution(results),
  };
}

export type ThesisSectionModel = {
  cards: ThesisCard[];
  loadBearing: LoadBearingClaim[];
  alerts: ThesisAlert[];
  reconciled: boolean;
  /** #11 (9c) : réconciliation aboutie MAIS en mode déterministe (synthèse LLM indisponible). */
  reconciliationDegraded: boolean;
  reconciliationReason: string | null;
  verdict: string | null;
  confidence: number | null;
};

export function buildThesisSectionModel(thesis: Record<string, unknown> | null, results: ResultsMap | null | undefined, analysisMode?: string | null): ThesisSectionModel {
  if (!thesis) {
    return { cards: [], loadBearing: [], alerts: [], reconciled: false, reconciliationDegraded: false, reconciliationReason: "Aucune thèse enregistrée pour ce dossier.", verdict: null, confidence: null };
  }
  const cards: ThesisCard[] = [
    { key: "reformulated", title: "Reformulation", body: stringAt(thesis, ["reformulated"]) },
    { key: "problem", title: "Problème", body: stringAt(thesis, ["problem"]) },
    { key: "solution", title: "Solution", body: stringAt(thesis, ["solution"]) },
    { key: "whyNow", title: "Why now", body: stringAt(thesis, ["whyNow"]) },
    { key: "moat", title: "Moat", body: stringAt(thesis, ["moat"]) },
    { key: "pathToExit", title: "Path-to-exit", body: stringAt(thesis, ["pathToExit"]) },
  ]
    .filter((c) => isString(c.body))
    .map((c) => ({ ...c, body: cleanRenderedText(c.body as string) || (c.body as string) })) as ThesisCard[];

  const loadBearingRaw = arrayAt(thesis, ["loadBearing"]);
  const loadBearing: LoadBearingClaim[] = loadBearingRaw
    .map((item) => {
      if (!isRecord(item)) return null;
      const status = stringAt(item, ["status"]);
      const statement = stringAt(item, ["statement"]);
      if (!statement) return null;
      return {
        id: stringAt(item, ["id"]) ?? statement.slice(0, 40),
        statement: cleanRenderedText(statement) || statement,
        status: status === "verified" || status === "contradicted" ? status : "declared",
        impact: cleanRenderedText(stringAt(item, ["impact"]) ?? "") || null,
        validationPath: cleanRenderedText(stringAt(item, ["validationPath"]) ?? "") || null,
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
        title: cleanRenderedText(title) || title,
        detail: cleanRenderedText(stringAt(item, ["detail"]) ?? "") || null,
        // Label user-facing (jamais l'enum brut "ASSUMPTION_FRAGILE" → #13).
        category: thesisAlertCategoryLabel(stringAt(item, ["category"])),
        severity: sev,
        severityLabel: severityLabel(sev),
      } satisfies ThesisAlert;
    })
    .filter((x): x is ThesisAlert => x !== null)
    .sort((a, b) => rankSeverity(a.severity) - rankSeverity(b.severity));

  // Distinguer les états réels : réconcilié / non-applicable (analyse arrêtée à
  // la thèse) / échec ou timeout (l'agent a tourné mais n'a pas abouti) / non lancé.
  // Le message « n'a pas tourné » était faux quand l'agent avait timeout.
  const reconcilerEntry = results?.["thesis-reconciler"];
  const reconciled = reconcilerEntry?.success === true;
  // 9c : réconciliation aboutie mais en mode déterministe (marqueur structuré
  // posé par l'agent quand la chaîne LLM est épuisée — pas une heuristique texte).
  const reconciliationDegraded =
    reconciled && isRecord(reconcilerEntry?.data) && valueAt(reconcilerEntry.data, ["synthesisDegraded"]) === true;
  let reconciliationReason: string | null = null;
  if (!reconciled) {
    const reconcilerError = reconcilerEntry && isString(reconcilerEntry.error) ? reconcilerEntry.error : null;
    if (analysisMode === "thesis_only") {
      reconciliationReason =
        "Analyse arrêtée après l'extraction de thèse : les Tier 1 n'ont pas été lancés, la réconciliation ne s'applique pas à ce stade.";
    } else if (reconcilerError && /timed?\s*out|timeout|délai/i.test(reconcilerError)) {
      reconciliationReason =
        "Le réconciliateur de thèse a dépassé son délai d'exécution : les hypothèses porteuses ci-dessous n'ont pas pu être confrontées aux résultats des Tier 1.";
    } else if (reconcilerError) {
      reconciliationReason =
        "Le réconciliateur de thèse a échoué : les hypothèses porteuses ci-dessous n'ont pas été confrontées aux résultats des Tier 1.";
    } else {
      reconciliationReason =
        "Le réconciliateur de thèse n'a pas été exécuté sur cette analyse. Les hypothèses porteuses ci-dessous n'ont pas été confrontées aux résultats des Tier 1.";
    }
  }

  return {
    cards,
    loadBearing,
    alerts,
    reconciled,
    reconciliationDegraded,
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
      // #14/#15 : séparer « ce qui étaye » (insights non négatifs) de « ce qui
      // alerte » (red flags structurés) — plus de puces positives sous une
      // orientation d'alerte. Tout est scrubé des noms d'agents.
      const supports = flattenInsights(snap.data, 5)
        .filter((i) => !NEGATIVE_KEYWORDS.test(i))
        .map((i) => cleanRenderedText(i))
        .filter((i) => i.length > 0)
        .slice(0, 3);
      const concerns = arrayAt(snap.data, ["redFlags"])
        .filter((rf) => {
          if (!isRecord(rf)) return false;
          // #6 : un « registre indisponible » n'est pas une alerte de dimension —
          // il est porté par la notice « couverture légale à vérifier ».
          return !isLegalRegistryUnavailableSignal(redFlagSignalBlob(rf));
        })
        .map((rf) => {
          if (!isRecord(rf)) return "";
          const t = stringAt(rf, ["title"]) ?? stringAt(rf, ["description"]) ?? stringAt(rf, ["impact"]) ?? "";
          return cleanRenderedText(t);
        })
        .filter((t) => t.length > 0)
        .slice(0, 3);
      // oneLiner scrubé des noms d'agents + reformulé anti-prescriptif (cohérent avec supports/concerns).
      const rawOneLiner = summarizeOneLiner(snap.data) ?? deriveFallbackOneLiner(snap.data);
      const oneLiner = rawOneLiner ? cleanRenderedText(rawOneLiner) || null : null;
      const redFlags = arrayAt(snap.data, ["redFlags"]).length;
      const questions = arrayAt(snap.data, ["questions"]).length;
      cards.push({
        agentLabel: snap.label,
        agentRole: snap.role,
        oneLiner,
        orientation,
        solidity,
        supports,
        concerns,
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

/**
 * When an agent succeeded but emitted no narrative text — e.g. its result was
 * revised by the reflexion engine (which returns only meta/score/findings), or a
 * degraded run — derive a meaningful one-liner from its structured output instead
 * of showing the ambiguous "Pas de synthèse explicite produite par l'agent".
 */
function deriveFallbackOneLiner(data: unknown): string | null {
  const insights = flattenInsights(data, 1);
  if (insights.length > 0 && insights[0].trim().length > 0) {
    return compactString(insights[0], 180);
  }
  for (const rf of arrayAt(data, ["redFlags"])) {
    if (!isRecord(rf)) continue;
    const t = stringAt(rf, ["title"]) ?? stringAt(rf, ["description"]);
    if (t) return compactString(`Signal d'alerte : ${t}`, 180);
  }
  // #16 : pas de score chiffré dans le oneLiner — uniquement un libellé d'intensité non numérique.
  const intensity = stringAt(data, ["signalIntensity"]);
  if (intensity) {
    const intl = ({
      low: "Signal favorable",
      elevated: "Signal contrasté",
      high: "Vigilance requise",
      critical: "Signal d'alerte",
    } as Record<string, string>)[intensity];
    if (intl) return intl;
  }
  return null;
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

type MemoPriority = { action: string; rationale: string | null; deadline: string | null; priority: string | null };

// --- Phase 5 (Option B) : blocs riches du mémo généré (mémo AUTONOME) ---
// Chaque champ texte rendu passe par cleanRenderedText (scrub noms d'agents +
// tournures prescriptives). Les blocs absents/vides sont rendus `null` (le
// composant les masque) — jamais de provenance ni de label fabriqué.
type MemoHighlight = { highlight: string; evidence: string | null; dbComparable: string | null; source: string | null };
type MemoKeyRisk = {
  risk: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | null;
  severityLabel: string | null;
  mitigation: string | null;
  residualRisk: string | null;
  category: string | null;
  source: string | null;
};
type MemoFinancialSummary = { metrics: Array<{ label: string; value: string }>; projections: string | null; valuationAssessment: string | null };
type MemoDealTerms = { valuation: string | null; roundSize: string | null; keyTerms: string[]; negotiationPoints: string[] };
type MemoDueDiligence = { completed: string[]; outstanding: string[] };

const RESIDUAL_RISK_LABELS: Record<string, string> = { low: "Faible", medium: "Moyen", high: "Élevé" };

/** Scrub + trim ; renvoie null si rien d'utile ne reste (pas de chaîne vide rendue). */
function cleanOrNull(raw: string | null | undefined): string | null {
  const cleaned = cleanRenderedText(raw ?? "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function cleanStringList(value: unknown[]): string[] {
  return value.map((t) => (isString(t) ? cleanOrNull(t) : null)).filter((t): t is string => t !== null);
}

/**
 * companyOverview est un OBJET `{description,problem,solution,businessModel,traction}`
 * (BUG corrigé Phase 5 : l'ancien `stringAt(memo,["companyOverview"])` rendait null).
 * Concaténé en prose, chaque morceau scrubé. Fallback défensif sur l'ancienne forme string.
 */
function buildCompanyOverviewProse(memo: Record<string, unknown>): string | null {
  const co = valueAt(memo, ["companyOverview"]);
  if (isRecord(co)) {
    const parts = [
      stringAt(co, ["description"]),
      stringAt(co, ["problem"]),
      stringAt(co, ["solution"]),
      stringAt(co, ["businessModel"]),
      stringAt(co, ["traction"]),
    ]
      .map((p) => cleanRenderedText(p ?? "").trim())
      .filter((p) => p.length > 0);
    return parts.length > 0 ? parts.join(" ") : null;
  }
  return cleanOrNull(stringAt(memo, ["companyOverview"]));
}

function buildMemoHighlights(memo: Record<string, unknown>): MemoHighlight[] {
  return arrayAt(memo, ["investmentHighlights"])
    .map((h): MemoHighlight | null => {
      if (!isRecord(h)) return null;
      const highlight = cleanOrNull(stringAt(h, ["highlight"]));
      if (!highlight) return null;
      return {
        highlight,
        evidence: cleanOrNull(stringAt(h, ["evidence"])),
        dbComparable: cleanOrNull(stringAt(h, ["dbComparable"])),
        source: presentableSource(stringAt(h, ["source"])),
      };
    })
    .filter((h): h is MemoHighlight => h !== null);
}

function buildMemoKeyRisks(memo: Record<string, unknown>): MemoKeyRisk[] {
  return arrayAt(memo, ["keyRisks"])
    .map((r): MemoKeyRisk | null => {
      if (!isRecord(r)) return null;
      const risk = cleanOrNull(stringAt(r, ["risk"]));
      if (!risk) return null;
      // severity ABSENTE → pas de pastille fabriquée (severityToPill renverrait
      // "MEDIUM" par défaut, ce qui inventerait une sévérité).
      const sevRaw = stringAt(r, ["severity"]);
      const severity = sevRaw ? severityToPill(sevRaw) : null;
      const residualRaw = (stringAt(r, ["residualRisk"]) ?? "").toLowerCase();
      return {
        risk,
        severity,
        severityLabel: severity ? severityLabel(severity) : null,
        mitigation: cleanOrNull(stringAt(r, ["mitigation"])),
        residualRisk: RESIDUAL_RISK_LABELS[residualRaw] ?? null,
        category: cleanOrNull(stringAt(r, ["category"])),
        source: presentableSource(stringAt(r, ["source"])),
      };
    })
    .filter((r): r is MemoKeyRisk => r !== null);
}

function buildMemoFinancialSummary(memo: Record<string, unknown>): MemoFinancialSummary | null {
  const fs = valueAt(memo, ["financialSummary"]);
  if (!isRecord(fs)) return null;
  const metricsObj = valueAt(fs, ["currentMetrics"]);
  const metrics: Array<{ label: string; value: string }> = isRecord(metricsObj)
    ? Object.entries(metricsObj)
        // Le LABEL est une CLÉ du mémo LLM (ex. "ARR") → scrubé au même titre que
        // la value : une clé piégée ("financial-auditor ARR") ne doit pas fuiter.
        .map(([label, value]) => ({
          label: cleanRenderedText(label).trim(),
          value: typeof value === "number" ? String(value) : cleanRenderedText(String(value ?? "")).trim(),
        }))
        .filter((m) => m.label.length > 0 && m.value.length > 0)
    : [];
  const projections = cleanOrNull(stringAt(fs, ["projections"]));
  const valuationAssessment = cleanOrNull(stringAt(fs, ["valuationAssessment"]));
  if (metrics.length === 0 && !projections && !valuationAssessment) return null;
  return { metrics, projections, valuationAssessment };
}

function buildMemoDealTerms(memo: Record<string, unknown>): MemoDealTerms | null {
  const dt = valueAt(memo, ["dealTerms"]);
  if (!isRecord(dt)) return null;
  const valuation = cleanOrNull(stringAt(dt, ["valuation"]));
  const roundSize = cleanOrNull(stringAt(dt, ["roundSize"]));
  const keyTerms = cleanStringList(arrayAt(dt, ["keyTerms"]));
  const negotiationPoints = cleanStringList(arrayAt(dt, ["negotiationPoints"]));
  if (!valuation && !roundSize && keyTerms.length === 0 && negotiationPoints.length === 0) return null;
  return { valuation, roundSize, keyTerms, negotiationPoints };
}

function buildMemoDueDiligence(memo: Record<string, unknown>): MemoDueDiligence | null {
  const dd = valueAt(memo, ["dueDiligenceFindings"]);
  if (!isRecord(dd)) return null;
  const completed = cleanStringList(arrayAt(dd, ["completed"]));
  const outstanding = cleanStringList(arrayAt(dd, ["outstanding"]));
  if (completed.length === 0 && outstanding.length === 0) return null;
  return { completed, outstanding };
}

export type MemoSectionModel =
  | {
      kind: "generated";
      executiveSummary: string | null;
      keyPoints: string[];
      companyOverview: string | null;
      investmentThesis: string | null;
      // Phase 5 (Option B) — blocs riches du mémo autonome.
      investmentHighlights: MemoHighlight[];
      keyRisks: MemoKeyRisk[];
      financialSummary: MemoFinancialSummary | null;
      teamAssessment: string | null;
      marketOpportunity: string | null;
      competitiveLandscape: string | null;
      dealTerms: MemoDealTerms | null;
      dueDiligence: MemoDueDiligence | null;
      criticalRisks: Array<{ title: string; detail: string | null; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"; severityLabel: string; source: string | null }>;
      nextSteps: string[];
      /** Plan d'investigation priorisé (Question Master) — enrichit des next steps trop courts (#22). */
      topPriorities: MemoPriority[];
      /** Total de risques critiques distincts consolidés — pour « voir les N risques » (#21). */
      totalCriticalRisks: number;
    }
  | {
      kind: "reconstituted";
      reason: string;
      strengths: SignalWithSource[];
      criticalRisks: Array<{ title: string; detail: string | null; source: string | null }>;
      topPriorities: MemoPriority[];
      diligenceItems: Array<{ item: string; documentsNeeded: string[]; estimatedEffort: string | null }>;
      negotiationPoints: Array<{ point: string; category: string | null; argument: string | null }>;
      forNegotiation: string[];
      totalCriticalRisks: number;
    };

export function buildMemoSectionModel(results: ResultsMap | null | undefined): MemoSectionModel {
  // Source unique consolidée (Codex #10) : total de risques critiques distincts (#21).
  const consolidated = consolidateRiskRanks(results);
  const totalCriticalRisks = consolidated.filter((r) => r.severity === "CRITICAL").length;

  // Plan d'investigation priorisé (Question Master) — partagé par les deux modes (#22).
  const qm = agentData(results, "question-master");
  const topPriorities: MemoPriority[] = (isRecord(qm) ? arrayAt(qm, ["topPriorities"]) : [])
    .map((p) => {
      if (!isRecord(p)) return null;
      // Tous les champs RENDUS sont scrubés (action/rationale/deadline) — ils
      // viennent de Question Master et peuvent contenir des noms d'agents (Codex).
      return {
        action: cleanRenderedText(stringAt(p, ["action"]) ?? "") || "Action prioritaire",
        rationale: cleanRenderedText(stringAt(p, ["rationale"]) ?? "") || null,
        deadline: cleanRenderedText(stringAt(p, ["deadline"]) ?? "") || null,
        priority: stringAt(p, ["priority"]),
      } satisfies MemoPriority;
    })
    .filter((x): x is MemoPriority => x !== null);

  const memo = agentData(results, "memo-generator");
  if (isRecord(memo)) {
    return {
      kind: "generated",
      executiveSummary: cleanRenderedText(stringAt(memo, ["executiveSummary", "oneLiner"]) ?? "") || null,
      keyPoints: arrayAt(memo, ["executiveSummary", "keyPoints"])
        .map((kp) => (isString(kp) ? kp : isRecord(kp) ? stringAt(kp, ["text"]) : null))
        .filter((kp): kp is string => kp !== null)
        .map((kp) => cleanRenderedText(kp) || kp),
      // Phase 5 (BUG corrigé) : companyOverview est un objet → prose scrubée.
      companyOverview: buildCompanyOverviewProse(memo),
      investmentThesis: cleanRenderedText(
        (isString(valueAt(memo, ["investmentThesis"]))
          ? (valueAt(memo, ["investmentThesis"]) as string)
          : stringAt(memo, ["investmentThesis", "summary"])) ?? "",
      ) || null,
      // Phase 5 (Option B) — blocs riches du mémo autonome (tous scrubés).
      investmentHighlights: buildMemoHighlights(memo),
      keyRisks: buildMemoKeyRisks(memo),
      financialSummary: buildMemoFinancialSummary(memo),
      teamAssessment: cleanOrNull(stringAt(memo, ["teamAssessment"])),
      marketOpportunity: cleanOrNull(stringAt(memo, ["marketOpportunity"])),
      competitiveLandscape: cleanOrNull(stringAt(memo, ["competitiveLandscape"])),
      dealTerms: buildMemoDealTerms(memo),
      dueDiligence: buildMemoDueDiligence(memo),
      // criticalRisks[] = {severity, description, evidence, source} (PAS de title).
      // Titre dérivé de description, détail = evidence ; tout scrubé (le prompt mémo
      // enseignait « Source: <agent> »), source via presentableSource (null si agent).
      criticalRisks: arrayAt(memo, ["criticalRisks"])
        .filter((r) => {
          if (!isRecord(r)) return false;
          // #6 : « registre officiel indisponible » sort des risques critiques du
          // mémo (porté par la notice « couverture légale à vérifier »). « K-bis
          // NON FOURNI » (sans token d'indisponibilité) reste un vrai item de diligence.
          const blob = [stringAt(r, ["description"]), stringAt(r, ["title"]), stringAt(r, ["evidence"]), stringAt(r, ["detail"])].filter(Boolean).join(" ");
          return !isLegalRegistryUnavailableSignal(blob);
        })
        .map((r) => {
          if (!isRecord(r)) return null;
          const severity = severityToPill(stringAt(r, ["severity"]));
          const rawTitle = stringAt(r, ["description"]) ?? stringAt(r, ["title"]);
          const title = (rawTitle ? cleanRenderedText(rawTitle) : "") || "Risque identifié";
          const rawDetail = stringAt(r, ["evidence"]) ?? stringAt(r, ["detail"]);
          const detail = rawDetail ? cleanRenderedText(rawDetail) || null : null;
          return {
            title,
            detail,
            severity,
            severityLabel: severityLabel(severity),
            source: presentableSource(stringAt(r, ["source"])),
          };
        })
        .filter(
          (r): r is { title: string; detail: string | null; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"; severityLabel: string; source: string | null } =>
            r !== null,
        ),
      nextSteps: arrayAt(memo, ["nextSteps"])
        .map((s) => (isString(s) ? cleanRenderedText(s) : null))
        .filter((s): s is string => s !== null && s.length > 0),
      topPriorities,
      totalCriticalRisks,
    };
  }

  const strengths = extractPositiveSignals(results, 6);
  const diligenceRaw = isRecord(qm) ? arrayAt(qm, ["diligenceChecklist", "items"]) : [];
  const negotiationRaw = isRecord(qm) ? arrayAt(qm, ["negotiationPoints"]) : [];
  const forNegotiation: string[] = [];
  if (results) {
    for (const entry of Object.values(results)) {
      if (!entry?.success) continue;
      const items = arrayAt(entry.data, ["narrative", "forNegotiation"]);
      for (const i of items) if (isString(i)) forNegotiation.push(cleanRenderedText(i) || i);
    }
  }

  return {
    kind: "reconstituted",
    reason: "Le mémo synthétique n'a pas pu être généré par l'agent. La vue ci-dessous reconstitue les éléments à partir des Tier 1 disponibles, du Question Master et de la cohérence documentaire.",
    strengths,
    // Liste complète déduplicée (source unique consolidateRiskRanks), filtrée critique/élevé.
    criticalRisks: consolidated
      .filter((r) => r.severity === "CRITICAL" || r.severity === "HIGH")
      .map((r) => ({ title: r.title, detail: r.description ?? null, source: r.source ?? null })),
    topPriorities,
    diligenceItems: diligenceRaw
      .map((it) => {
        if (!isRecord(it)) return null;
        const docs = arrayAt(it, ["documentsNeeded"]).filter(isString) as string[];
        return {
          item: cleanRenderedText(stringAt(it, ["item"]) ?? "") || "Item de diligence",
          documentsNeeded: docs,
          estimatedEffort: stringAt(it, ["estimatedEffort"]),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    negotiationPoints: negotiationRaw
      .map((n) => {
        if (!isRecord(n)) return null;
        return {
          point: cleanRenderedText(stringAt(n, ["point"]) ?? "") || "Point de négociation",
          category: stringAt(n, ["category"]),
          argument: cleanRenderedText(stringAt(n, ["leverage", "argument"]) ?? stringAt(n, ["argument"]) ?? "") || null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    forNegotiation,
    totalCriticalRisks,
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
    thesisSection: buildThesisSectionModel(thesis, analysis.results, analysis.mode),
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
