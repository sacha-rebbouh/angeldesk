/**
 * Pont live <-> wire pour le stepwise durable (D.5b).
 *
 * `buildStepState` (b-2) : transforme l'état VIVANT (EnrichedAgentContext muté + locals)
 * en `FullAnalysisStepState` sérialisable (Date -> ISO). C'est l'inverse de
 * `rehydrateContext` (b-3, à venir).
 *
 * Normalisation par `normalizeToWire` STRICT (PAS un JSON round-trip aveugle — gate Codex
 * b-2) : Date -> ISO ; string/boolean/nombre fini conservés ; undefined imbriqué DROPPÉ
 * pour un objet (champ optionnel absent, comme JSON) et -> null pour un élément de tableau.
 * REJETTE (au lieu de convertir silencieusement) : NaN/Infinity, Map, Set, instance de
 * classe (hors Date), function, symbol, bigint — avec le chemin fautif. Un JSON round-trip
 * aurait transformé NaN->null et Map/Set->{} en masquant une divergence live vs replay.
 *
 * Le sectorExpert (closure) n'est JAMAIS porté : reconstruit via le secteur au step Tier2.
 */

import type { EnrichedAgentContext } from "@/agents/types";
import {
  FULL_ANALYSIS_STEP_STATE_VERSION,
  type FullAnalysisStepState,
  type FullAnalysisUnit,
  assertSerializableStepState,
} from "./full-analysis-step-state";

export interface BuildStepStateInput {
  analysisId: string;
  dealId: string;
  analysisType: string;
  totalAgents: number;
  completedCount: number;
  totalCost: number;
  /** Début réel du run (epoch ms), pour préserver totalTimeMs/durée au replay. */
  startTimeMs: number;
  lastUnit: FullAnalysisUnit;
  done: boolean;
  /** Contexte enrichi VIVANT (avec Date objects) au boundary de l'unité. */
  enrichedContext: EnrichedAgentContext;
  /** allResults brut (non sanitizé) du run. */
  allResults: Record<string, unknown>;
  /** verificationContext local (carry, pas rebuild). null avant Tier1. */
  verificationContext: Record<string, unknown> | null;
  /** Accumulateur de warnings (Date timestamp). */
  collectedWarnings: unknown[];
}

/**
 * Normalizer STRICT live -> wire. Date -> ISO ; conserve string/boolean/nombre fini ;
 * DROPpe les valeurs undefined imbriquées d'un objet (champ optionnel absent, comme JSON)
 * et mappe un élément undefined de tableau -> null (comme JSON.stringify([undefined])).
 * LÈVE (au lieu de convertir silencieusement) sur NaN/Infinity, Map, Set, instance de
 * classe (hors Date), function, symbol, bigint — avec le chemin fautif.
 */
function normalizeToWire(value: unknown, path = "$"): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "boolean") return value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error(`[buildStepState] nombre non-fini (NaN/Infinity) en ${path}`);
    }
    return value;
  }
  if (t === "undefined") throw new Error(`[buildStepState] undefined inattendu en ${path}`);
  if (t === "function") throw new Error(`[buildStepState] function non sérialisable en ${path}`);
  if (t === "symbol") throw new Error(`[buildStepState] symbol non sérialisable en ${path}`);
  if (t === "bigint") throw new Error(`[buildStepState] bigint non sérialisable en ${path}`);

  // Date : seul cas spécial autorisé (instance de classe) -> ISO.
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((v, i) => (v === undefined ? null : normalizeToWire(v, `${path}[${i}]`)));
  }

  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null) {
    const ctor = (value as { constructor?: { name?: string } })?.constructor?.name ?? "unknown";
    throw new Error(`[buildStepState] instance non-plain (${ctor}) non sérialisable en ${path}`);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue; // champ optionnel absent -> droppé (comme JSON)
    out[k] = normalizeToWire(v, `${path}.${k}`);
  }
  return out;
}

function toWireObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  const w = normalizeToWire(value, path);
  if (w === null || typeof w !== "object" || Array.isArray(w)) {
    throw new Error(`[buildStepState] objet attendu en ${path}`);
  }
  return w as Record<string, unknown>;
}

function toWireObjectOrNull(value: unknown, path: string): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  const w = normalizeToWire(value, path);
  if (typeof w !== "object" || Array.isArray(w)) {
    throw new Error(`[buildStepState] objet ou null attendu en ${path}`);
  }
  return w as Record<string, unknown>;
}

function toWireArray(value: unknown, path: string): unknown[] {
  if (value === null || value === undefined) return [];
  const w = normalizeToWire(value, path);
  if (!Array.isArray(w)) {
    throw new Error(`[buildStepState] tableau attendu en ${path}`);
  }
  return w;
}

function toWireArrayOrNull(value: unknown, path: string): unknown[] | null {
  if (value === null || value === undefined) return null;
  const w = normalizeToWire(value, path);
  if (!Array.isArray(w)) {
    throw new Error(`[buildStepState] tableau ou null attendu en ${path}`);
  }
  return w;
}

/**
 * Construit le DTO sérialisable depuis l'état vivant au boundary d'une unité.
 * Valide STRICTEMENT le résultat (assertSerializableStepState) avant de le retourner :
 * un blob qui resterait non-plain (impossible après le round-trip, mais défensif) lèverait.
 */
export function buildStepState(input: BuildStepStateInput): FullAnalysisStepState {
  const ctx = input.enrichedContext;

  const evidenceToday =
    ctx.evidenceToday instanceof Date ? ctx.evidenceToday : new Date(input.startTimeMs);

  const state: FullAnalysisStepState = {
    version: FULL_ANALYSIS_STEP_STATE_VERSION,
    analysisId: input.analysisId,
    dealId: input.dealId,
    analysisType: input.analysisType,
    totalAgents: input.totalAgents,
    completedCount: input.completedCount,
    totalCost: input.totalCost,
    startTimeMs: input.startTimeMs,
    lastUnit: input.lastUnit,
    done: input.done,

    factStoreFormatted: ctx.factStoreFormatted ?? "",
    evidenceLedgerFormatted: ctx.evidenceLedgerFormatted ?? "",
    evidenceTodayIso: evidenceToday.toISOString(),
    conditionsAnalystMode: ctx.conditionsAnalystMode ?? null,

    allResults: toWireObject(input.allResults, "$.allResults"),
    previousResults: toWireObject(ctx.previousResults ?? {}, "$.previousResults"),
    canonicalDeal: toWireObject(ctx.canonicalDeal ?? ctx.deal, "$.canonicalDeal"),
    analysisBinding: toWireObject(ctx.analysis ?? {}, "$.analysisBinding"),

    tier1CrossValidation: toWireObjectOrNull(ctx.tier1CrossValidation, "$.tier1CrossValidation"),
    verificationContext: toWireObjectOrNull(input.verificationContext, "$.verificationContext"),
    evidenceContext: toWireObjectOrNull(ctx.evidenceContext, "$.evidenceContext"),
    thesis: toWireObjectOrNull(ctx.thesis, "$.thesis"),
    contextEngine: toWireObjectOrNull(ctx.contextEngine, "$.contextEngine"),
    evidenceLedger: toWireObjectOrNull(ctx.evidenceLedger, "$.evidenceLedger"),
    extractedData: toWireObjectOrNull(ctx.extractedData, "$.extractedData"),
    deckCoherenceReport: toWireObjectOrNull(ctx.deckCoherenceReport, "$.deckCoherenceReport"),
    baPreferences: toWireObjectOrNull(ctx.baPreferences, "$.baPreferences"),
    dealTerms: toWireObjectOrNull(ctx.dealTerms, "$.dealTerms"),
    dealStructure: toWireObjectOrNull(ctx.dealStructure, "$.dealStructure"),

    scopedDocuments: toWireArray(ctx.documents, "$.scopedDocuments"),
    factStore: toWireArray(ctx.factStore, "$.factStore"),
    founderResponses: toWireArray(ctx.founderResponses, "$.founderResponses"),
    collectedWarnings: toWireArray(input.collectedWarnings, "$.collectedWarnings"),

    consolidatedRedFlags: toWireArrayOrNull(ctx.consolidatedRedFlags, "$.consolidatedRedFlags"),
    previousAnalysisQuestions: toWireArrayOrNull(ctx.previousAnalysisQuestions, "$.previousAnalysisQuestions"),
  };

  assertSerializableStepState(state);
  return state;
}
