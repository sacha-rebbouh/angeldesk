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

// ============================================================================
// b-3 — rehydrateContext : DTO wire -> état VIVANT (revive Date aux chemins connus)
// ============================================================================

/**
 * Ravive une string ISO en Date STRICTE (gate Codex b-1 : pas de `Invalid Date`).
 * Lève si la valeur n'est pas une string ou si la date est invalide.
 */
function reviveDateStrict(value: unknown, path: string): Date {
  if (typeof value !== "string") {
    throw new Error(`[rehydrate] date attendue (string ISO) en ${path}, reçu ${typeof value}`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`[rehydrate] date ISO invalide en ${path}: ${value}`);
  }
  return d;
}

/** Ravive obj[key] en Date si présent (non null/undefined). In-place. */
function reviveField(obj: Record<string, unknown>, key: string, path: string): void {
  const v = obj[key];
  if (v === null || v === undefined) return;
  obj[key] = reviveDateStrict(v, `${path}.${key}`);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Clone profond d'un wire (JSON pur — aucune Date à perdre, ce sont des string ISO). */
function cloneWire<T>(wire: T): T {
  return wire === null || wire === undefined ? wire : (JSON.parse(JSON.stringify(wire)) as T);
}

/** Ravive les 3 dates d'un document (uploadedAt/sourceDate/receivedAt). In-place. */
function reviveDocDates(doc: Record<string, unknown>, path: string): void {
  reviveField(doc, "uploadedAt", path);
  reviveField(doc, "sourceDate", path);
  reviveField(doc, "receivedAt", path);
}

/**
 * Deal snapshot : createdAt/updatedAt + founders[].createdAt + documents[].dates.
 * `buildCanonicalRuntimeDeal` fait `{...deal}` → canonicalDeal CONSERVE les relations
 * `founders` (createdAt) ET `documents` (uploadedAt/sourceDate/receivedAt) du DealWithDocs
 * vivant — distinctes de `scopedDocuments`, mais portant aussi des Date à raviver
 * (gate Codex b-3 : le round-trip wire ne détecte pas une string ISO non ravivée).
 */
function reviveDeal(wire: Record<string, unknown>): Record<string, unknown> {
  const d = cloneWire(wire);
  reviveField(d, "createdAt", "canonicalDeal");
  reviveField(d, "updatedAt", "canonicalDeal");
  if (Array.isArray(d.founders)) {
    (d.founders as unknown[]).forEach((f, i) => {
      const fo = asRecord(f);
      if (fo) reviveField(fo, "createdAt", `canonicalDeal.founders[${i}]`);
    });
  }
  if (Array.isArray(d.documents)) {
    (d.documents as unknown[]).forEach((doc, i) => {
      const o = asRecord(doc);
      if (o) reviveDocDates(o, `canonicalDeal.documents[${i}]`);
    });
  }
  return d;
}

/** Documents (scopedDocuments) : uploadedAt / sourceDate / receivedAt. */
function reviveDocuments(wire: unknown[]): unknown[] {
  const docs = cloneWire(wire);
  docs.forEach((doc, i) => {
    const o = asRecord(doc);
    if (o) reviveDocDates(o, `scopedDocuments[${i}]`);
  });
  return docs;
}

/** factStore : firstSeenAt / lastUpdatedAt / validAt + eventHistory[].createdAt/validAt. */
function reviveFactStore(wire: unknown[]): unknown[] {
  const facts = cloneWire(wire);
  facts.forEach((fact, i) => {
    const o = asRecord(fact);
    if (!o) return;
    reviveField(o, "firstSeenAt", `factStore[${i}]`);
    reviveField(o, "lastUpdatedAt", `factStore[${i}]`);
    reviveField(o, "validAt", `factStore[${i}]`);
    if (Array.isArray(o.eventHistory)) {
      (o.eventHistory as unknown[]).forEach((ev, j) => {
        const eo = asRecord(ev);
        if (!eo) return;
        reviveField(eo, "createdAt", `factStore[${i}].eventHistory[${j}]`);
        reviveField(eo, "validAt", `factStore[${i}].eventHistory[${j}]`);
      });
    }
  });
  return facts;
}

/** collectedWarnings : timestamp. */
function reviveWarnings(wire: unknown[]): unknown[] {
  const warns = cloneWire(wire);
  warns.forEach((w, i) => {
    const o = asRecord(w);
    if (o) reviveField(o, "timestamp", `collectedWarnings[${i}]`);
  });
  return warns;
}

/**
 * evidenceContext : Record<docId, DocumentEvidenceContext>. Dates profondes —
 * documentDate.date, asOf.date, forecast.start/end, actuals[].start/end,
 * detectedAttachments[].emailSourceDate, claims[].dateStart/dateEnd.
 */
function reviveEvidenceContext(wire: Record<string, unknown> | null): Record<string, unknown> | null {
  if (wire === null) return null;
  const ctx = cloneWire(wire);
  for (const [docId, docCtxRaw] of Object.entries(ctx)) {
    const docCtx = asRecord(docCtxRaw);
    if (!docCtx) continue;
    const base = `evidenceContext.${docId}`;
    const documentDate = asRecord(docCtx.documentDate);
    if (documentDate) reviveField(documentDate, "date", `${base}.documentDate`);
    const asOf = asRecord(docCtx.asOf);
    if (asOf) reviveField(asOf, "date", `${base}.asOf`);
    const forecast = asRecord(docCtx.forecast);
    if (forecast) {
      reviveField(forecast, "start", `${base}.forecast`);
      reviveField(forecast, "end", `${base}.forecast`);
    }
    if (Array.isArray(docCtx.actuals)) {
      (docCtx.actuals as unknown[]).forEach((p, i) => {
        const po = asRecord(p);
        if (!po) return;
        reviveField(po, "start", `${base}.actuals[${i}]`);
        reviveField(po, "end", `${base}.actuals[${i}]`);
      });
    }
    if (Array.isArray(docCtx.detectedAttachments)) {
      (docCtx.detectedAttachments as unknown[]).forEach((a, i) => {
        const ao = asRecord(a);
        if (ao) reviveField(ao, "emailSourceDate", `${base}.detectedAttachments[${i}]`);
      });
    }
    if (Array.isArray(docCtx.claims)) {
      (docCtx.claims as unknown[]).forEach((c, i) => {
        const co = asRecord(c);
        if (!co) return;
        reviveField(co, "dateStart", `${base}.claims[${i}]`);
        reviveField(co, "dateEnd", `${base}.claims[${i}]`);
      });
    }
  }
  return ctx;
}

/**
 * État vivant reconstruit depuis un FullAnalysisStepState. enrichedContext est assemblé
 * depuis les blobs portés (Date ravivées) SANS ré-appeler attachEvidenceLedger (qui
 * régénérerait evidenceLedger.generatedAt wall-clock → byte-divergence). Le sectorExpert
 * (closure) n'est PAS ici : reconstruit par le driver via getTier2SectorExpert(sector).
 */
export interface RehydratedState {
  enrichedContext: EnrichedAgentContext;
  allResults: Record<string, unknown>;
  verificationContext: Record<string, unknown> | null;
  collectedWarnings: unknown[];
  totalCost: number;
  completedCount: number;
  startTimeMs: number;
  totalAgents: number;
  lastUnit: FullAnalysisUnit;
  done: boolean;
  analysisId: string;
  dealId: string;
  analysisType: string;
}

export function rehydrateContext(state: FullAnalysisStepState): RehydratedState {
  const canonicalDeal = reviveDeal(state.canonicalDeal);
  const evidenceToday = reviveDateStrict(state.evidenceTodayIso, "evidenceTodayIso");

  const enrichedContext = {
    dealId: state.dealId,
    deal: canonicalDeal,
    canonicalDeal,
    analysis: cloneWire(state.analysisBinding),
    documents: reviveDocuments(state.scopedDocuments),
    evidenceContext: reviveEvidenceContext(state.evidenceContext) ?? undefined,
    evidenceToday,
    previousResults: cloneWire(state.previousResults),
    contextEngine: cloneWire(state.contextEngine) ?? undefined,
    baPreferences: cloneWire(state.baPreferences) ?? undefined,
    factStore: reviveFactStore(state.factStore),
    factStoreFormatted: state.factStoreFormatted,
    evidenceLedger: cloneWire(state.evidenceLedger) ?? undefined,
    evidenceLedgerFormatted: state.evidenceLedgerFormatted,
    deckCoherenceReport: cloneWire(state.deckCoherenceReport) ?? undefined,
    thesis: cloneWire(state.thesis) ?? undefined,
    tier1CrossValidation: cloneWire(state.tier1CrossValidation) ?? undefined,
    consolidatedRedFlags: cloneWire(state.consolidatedRedFlags) ?? undefined,
    extractedData: cloneWire(state.extractedData) ?? undefined,
    founderResponses: cloneWire(state.founderResponses),
    previousAnalysisQuestions: cloneWire(state.previousAnalysisQuestions) ?? undefined,
    dealTerms: cloneWire(state.dealTerms) ?? undefined,
    dealStructure: cloneWire(state.dealStructure) ?? undefined,
    conditionsAnalystMode: state.conditionsAnalystMode ?? undefined,
  } as unknown as EnrichedAgentContext;

  return {
    enrichedContext,
    allResults: cloneWire(state.allResults),
    verificationContext: cloneWire(state.verificationContext),
    collectedWarnings: reviveWarnings(state.collectedWarnings),
    totalCost: state.totalCost,
    completedCount: state.completedCount,
    startTimeMs: state.startTimeMs,
    totalAgents: state.totalAgents,
    lastUnit: state.lastUnit,
    done: state.done,
    analysisId: state.analysisId,
    dealId: state.dealId,
    analysisType: state.analysisType,
  };
}
