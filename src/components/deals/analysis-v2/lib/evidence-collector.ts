import { getFactKeyLabel, type EvidenceSolidity } from "@/lib/ui-configs";

import {
  agentData,
  arrayAt,
  isFiniteNumber,
  isRecord,
  isString,
  numberAt,
  type ResultsMap,
  stringAt,
  valueAt,
} from "./extractors";
import { presentableSource, sanitizeSourceLabel, scrubAgentNamesFromText, scrubPrescriptiveDecisionLanguage } from "./presentation";

import type { EvidenceRowProps, EvidenceStatus } from "../atoms/evidence-row";

/**
 * Fusionne les preuves issues de :
 *   - fact-extractor.facts[] (Tier 0)
 *   - deck-forensics.claimVerification[] (Tier 1)
 *   - deck-coherence-checker.issues[] (Tier 0)
 *   - contradiction-detector.contradictions[] (Tier 3)
 *
 * Pour produire une table unifiée Evidence-First : Affirmation / Source /
 * Fraîcheur / Solidité / Status.
 */

const STATUS_MAP: Record<string, EvidenceStatus> = {
  VERIFIED: "VERIFIED",
  CONTRADICTED: "CONTRADICTED",
  PARTIAL: "PARTIAL",
  NOT_VERIFIABLE: "NOT_VERIFIABLE",
  EXAGGERATED: "EXAGGERATED",
  MISLEADING: "MISLEADING",
  PROJECTION_AS_FACT: "PROJECTION_AS_FACT",
  DECLARED: "DECLARED",
};

const RELIABILITY_TO_SOLIDITY: Record<string, EvidenceSolidity> = {
  VERIFIED: "strong",
  AUDITED: "strong",
  DECLARED: "moderate",
  PROJECTED: "low",
  ESTIMATED: "low",
  UNVERIFIABLE: "insufficient",
};

function freshnessFromDate(value: unknown, fallback?: unknown): string | null {
  const raw = isString(value) ? value : isString(fallback) ? fallback : null;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const now = Date.now();
  const monthsAgo = Math.max(0, Math.round((now - date.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  if (monthsAgo <= 0) return "ce mois-ci";
  if (monthsAgo === 1) return "il y a 1 mois";
  if (monthsAgo < 12) return `il y a ${monthsAgo} mois`;
  const years = Math.floor(monthsAgo / 12);
  return years === 1 ? "il y a 1 an" : `il y a ${years} ans`;
}

function asStatus(value: unknown): EvidenceStatus | null {
  if (!isString(value)) return null;
  return STATUS_MAP[value.toUpperCase()] ?? null;
}

function asSolidity(value: unknown): EvidenceSolidity | null {
  if (!isString(value)) return null;
  const upper = value.toUpperCase();
  if (upper in RELIABILITY_TO_SOLIDITY) return RELIABILITY_TO_SOLIDITY[upper];
  const lower = value.toLowerCase();
  if (["strong", "moderate", "low", "contradictory", "insufficient"].includes(lower)) {
    return lower as EvidenceSolidity;
  }
  return null;
}

function collectFromFactExtractor(results: ResultsMap): EvidenceRowProps[] {
  const data = agentData(results, "fact-extractor");
  if (!isRecord(data)) return [];
  const facts = arrayAt(data, ["facts"]);
  const out: EvidenceRowProps[] = [];
  for (const fact of facts) {
    if (!isRecord(fact)) continue;
    const factKey = stringAt(fact, ["factKey"]);
    const factLabel = factKey ? getFactKeyLabel(factKey) : "Fait extrait";
    const displayValue = stringAt(fact, ["displayValue"]);
    const value = valueAt(fact, ["value"]);
    const unit = stringAt(fact, ["unit"]);
    const claimParts = [factLabel, displayValue ?? (isFiniteNumber(value) ? `${value}${unit ? ` ${unit}` : ""}` : null)];
    const claim = claimParts.filter(Boolean).join(" — ");
    const source = sanitizeSourceLabel(stringAt(fact, ["source"]));
    const extracted = stringAt(fact, ["extractedText"]);
    const reliability = stringAt(fact, ["reliability", "reliability"]);
    const projection = valueAt(fact, ["reliability", "isProjection"]);
    const documentDate = stringAt(fact, ["reliability", "temporalAnalysis", "documentDate"]);
    const truth = numberAt(fact, ["truthConfidence"]);
    out.push({
      claim: claim || "Fait extrait",
      source,
      sourceDetail: extracted ? scrubAgentNamesFromText(extracted) || null : null,
      freshness: freshnessFromDate(documentDate),
      solidity: asSolidity(reliability) ?? (truth != null && truth >= 90 ? "strong" : truth != null && truth >= 70 ? "moderate" : "low"),
      status: projection === true ? "PROJECTION_AS_FACT" : "DECLARED",
      note: null,
    });
  }
  return out;
}

function collectFromDeckForensics(results: ResultsMap): EvidenceRowProps[] {
  const data = agentData(results, "deck-forensics");
  if (!isRecord(data)) return [];
  const claims = arrayAt(data, ["claimVerification"]);
  const out: EvidenceRowProps[] = [];
  for (const claim of claims) {
    if (!isRecord(claim)) continue;
    const text = stringAt(claim, ["claim"]) ?? "Claim deck";
    const location = stringAt(claim, ["location"]);
    const source = sanitizeSourceLabel(stringAt(claim, ["sourceUsed"]) ?? "Deck");
    const evidence = stringAt(claim, ["evidence"]);
    const dataReliability = stringAt(claim, ["dataReliability"]);
    const status = asStatus(stringAt(claim, ["status"])) ?? null;
    out.push({
      claim: text,
      source,
      sourceDetail: location ? scrubAgentNamesFromText(location) || null : null,
      freshness: null,
      solidity: asSolidity(dataReliability) ?? (status === "VERIFIED" ? "strong" : status === "CONTRADICTED" ? "contradictory" : null),
      status,
      note: evidence ? scrubAgentNamesFromText(evidence) || null : null,
    });
  }
  return out;
}

function collectFromDeckCoherence(results: ResultsMap): EvidenceRowProps[] {
  const data = agentData(results, "deck-coherence-checker");
  if (!isRecord(data)) return [];
  const issues = arrayAt(data, ["issues"]);
  const out: EvidenceRowProps[] = [];
  for (const issue of issues) {
    if (!isRecord(issue)) continue;
    const title = stringAt(issue, ["title"]) ?? "Anomalie de cohérence";
    const description = stringAt(issue, ["description"]);
    const severity = stringAt(issue, ["severity"]);
    const pages = arrayAt(issue, ["pages"])
      .map((p) => (typeof p === "number" ? `p.${p}` : isString(p) ? p : null))
      .filter(Boolean)
      .join(" · ");
    out.push({
      claim: title,
      source: "Deck",
      sourceDetail: pages || null,
      freshness: null,
      solidity: severity === "critical" ? "contradictory" : severity === "warning" ? "low" : "moderate",
      status: severity === "critical" ? "CONTRADICTED" : "PARTIAL",
      note: description ? scrubAgentNamesFromText(description) || null : null,
    });
  }
  return out;
}

function collectFromContradictions(results: ResultsMap): EvidenceRowProps[] {
  const data = agentData(results, "contradiction-detector");
  if (!isRecord(data)) return [];
  const contradictions = arrayAt(data, ["findings", "contradictions"]);
  const out: EvidenceRowProps[] = [];
  for (const item of contradictions) {
    if (!isRecord(item)) continue;
    // Tout texte interpolé est scrubé des noms d'agents (le texte d'un énoncé
    // peut lui-même en contenir), pas seulement les locations/implication.
    const topic = scrubAgentNamesFromText(stringAt(item, ["topic"]) ?? "") || "Contradiction";
    const s1 = scrubAgentNamesFromText(stringAt(item, ["statement1", "text"]) ?? "");
    const s1loc = presentableSource(stringAt(item, ["statement1", "location"]));
    const s2 = scrubAgentNamesFromText(stringAt(item, ["statement2", "text"]) ?? "");
    const s2loc = presentableSource(stringAt(item, ["statement2", "location"]));
    const implication = stringAt(item, ["implication"]);
    const severity = stringAt(item, ["severity"]);
    // #19 : source rattachée INLINE à chaque énoncé (compréhensible sans contexte),
    // texte complet (plus de troncature à 260c #18). L'implication devient la « Lecture » (note).
    const partA = s1 ? `${s1loc ? `${s1loc} : ` : ""}« ${s1} »` : "";
    const partB = s2 ? `${s2loc ? `${s2loc} : ` : ""}« ${s2} »` : "";
    const body = [partA, partB].filter(Boolean).join(" ↔ ");
    const claim = body ? `${topic} — ${body}` : topic;
    // Pas de fausse provenance : "Recoupement de sources" seulement si au moins
    // une source inline est présentable ; sinon fallback honnête.
    const hasInlineSource = Boolean(s1loc || s2loc);
    out.push({
      claim,
      source: hasInlineSource ? "Recoupement de sources" : "Provenance documentaire non disponible",
      sourceDetail: null,
      freshness: null,
      solidity: "contradictory",
      status: severity === "CRITICAL" ? "CONTRADICTED" : "PARTIAL",
      note: implication ? scrubAgentNamesFromText(implication) || null : null,
    });
  }
  return out;
}

export function collectEvidence(results: ResultsMap | null | undefined): EvidenceRowProps[] {
  if (!results) return [];
  // Passe finale : claim/note rendus → anti-prescriptif « décision » (doctrine, Codex P0).
  // UNIQUEMENT le scrub prescriptif (les noms d'agents sont déjà traités au niveau des
  // champs ; ré-appliquer scrubAgentNamesFromText écraserait l'espace FR avant « : » du
  // claim de contradiction « Doc : « énoncé » »). Idempotent.
  return [
    ...collectFromFactExtractor(results),
    ...collectFromDeckForensics(results),
    ...collectFromContradictions(results),
    ...collectFromDeckCoherence(results),
  ].map((row) => ({
    ...row,
    claim: scrubPrescriptiveDecisionLanguage(row.claim) || row.claim,
    note: row.note ? scrubPrescriptiveDecisionLanguage(row.note) || null : null,
  }));
}
