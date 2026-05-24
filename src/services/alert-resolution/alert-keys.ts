/**
 * Alert Key Generation — Stable identifiers for alert resolution.
 *
 * Keys must survive re-analyses (same alert → same key).
 * Strategy: content-based normalization, NOT LLM-generated IDs.
 */

import { inferRedFlagTopic } from "@/services/red-flag-dedup/dedup";

// ── Normalize text into a stable key fragment ──

function normalizeForKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "_")     // Non-alphanum → underscore
    .replace(/^_|_$/g, "")           // Trim leading/trailing underscores
    .slice(0, 60);
}

// ── Red Flag keys ──

export function redFlagAlertKey(title: string, category?: string): string {
  const topic = inferRedFlagTopic(title, category);
  return `RED_FLAG::${topic}`;
}

// ── Devil's Advocate keys ──
//
// Phase A slice A3 — Discriminant `"killReason"` retiré (D1 verrouillé,
// DA-spécifique). Remplacé par `"structuralRisk"` cohérent avec le contrat
// natif `DevilsAdvocateFindings.structuralRisks`. Conséquence trade-off
// documentée : les résolutions persistées sous l'ancienne clé
// `DEVILS_ADVOCATE::killReason::...` deviennent orphelines (la résolution
// reste en DB mais ne match plus aucune alerte calculée à partir du nouveau
// runtime). C'est conforme à l'arbitrage A3 Codex (pas d'alias émis).

export type DASubType =
  | "structuralRisk"
  | "concern"
  | "counterArgument"
  | "blindSpot"
  | "worstCase"
  | "altNarrative";

export function devilsAdvocateAlertKey(
  subType: DASubType,
  keyContent: string,
): string {
  const slug = normalizeForKey(keyContent);
  return `DEVILS_ADVOCATE::${subType}::${slug}`;
}

// ── Conditions keys ──

export type ConditionsSubType = "redFlag" | "negotiation";

export function conditionsAlertKey(
  subType: ConditionsSubType,
  title: string,
  category?: string,
): string {
  const slug = normalizeForKey(title);
  const prefix = category ? `${normalizeForKey(category)}::` : "";
  return `CONDITIONS::${subType}::${prefix}${slug}`;
}
