import { getFactKeyLabel, type EvidenceSolidity } from "@/lib/ui-configs";

import {
  agentData,
  arrayAt,
  compactString,
  isFiniteNumber,
  isRecord,
  isString,
  numberAt,
  type ResultsMap,
  stringAt,
  valueAt,
} from "./extractors";

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
    const source = stringAt(fact, ["source"]) ?? "Source non précisée";
    const extracted = stringAt(fact, ["extractedText"]);
    const reliability = stringAt(fact, ["reliability", "reliability"]);
    const projection = valueAt(fact, ["reliability", "isProjection"]);
    const documentDate = stringAt(fact, ["reliability", "temporalAnalysis", "documentDate"]);
    const truth = numberAt(fact, ["truthConfidence"]);
    out.push({
      claim: compactString(claim, 220) ?? "Fait extrait",
      source,
      sourceDetail: extracted ? compactString(extracted, 160) : null,
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
    const source = stringAt(claim, ["sourceUsed"]) ?? "Deck";
    const evidence = stringAt(claim, ["evidence"]);
    const dataReliability = stringAt(claim, ["dataReliability"]);
    const status = asStatus(stringAt(claim, ["status"])) ?? null;
    out.push({
      claim: compactString(text, 220) ?? "Claim deck",
      source,
      sourceDetail: location ?? null,
      freshness: null,
      solidity: asSolidity(dataReliability) ?? (status === "VERIFIED" ? "strong" : status === "CONTRADICTED" ? "contradictory" : null),
      status,
      note: evidence ? compactString(evidence, 160) : null,
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
      claim: compactString(title, 220) ?? title,
      source: "Deck",
      sourceDetail: pages || null,
      freshness: null,
      solidity: severity === "critical" ? "contradictory" : severity === "warning" ? "low" : "moderate",
      status: severity === "critical" ? "CONTRADICTED" : "PARTIAL",
      note: description ? compactString(description, 160) : null,
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
    const topic = stringAt(item, ["topic"]) ?? "Contradiction";
    const s1 = stringAt(item, ["statement1", "text"]);
    const s1loc = stringAt(item, ["statement1", "location"]);
    const s2 = stringAt(item, ["statement2", "text"]);
    const s2loc = stringAt(item, ["statement2", "location"]);
    const implication = stringAt(item, ["implication"]);
    const severity = stringAt(item, ["severity"]);
    out.push({
      claim: compactString(`${topic} — ${s1 ?? ""} ↔ ${s2 ?? ""}`, 260) ?? topic,
      source: [s1loc, s2loc].filter(Boolean).join(" · ") || "Multi-source",
      sourceDetail: implication ? compactString(implication, 160) : null,
      freshness: null,
      solidity: "contradictory",
      status: severity === "CRITICAL" ? "CONTRADICTED" : "PARTIAL",
      note: null,
    });
  }
  return out;
}

export function collectEvidence(results: ResultsMap | null | undefined): EvidenceRowProps[] {
  if (!results) return [];
  return [
    ...collectFromFactExtractor(results),
    ...collectFromDeckForensics(results),
    ...collectFromContradictions(results),
    ...collectFromDeckCoherence(results),
  ];
}
