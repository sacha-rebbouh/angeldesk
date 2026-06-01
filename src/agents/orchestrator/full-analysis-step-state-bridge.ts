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
import type { AnalysisResult } from "./types";
import {
  FULL_ANALYSIS_STEP_STATE_VERSION,
  type FullAnalysisStepState,
  type FullAnalysisUnit,
  assertSerializableStepState,
  assertPlainJson,
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
  /** Compteur CUMULATIF de transitions de la state machine (stateMachine.getTransitionCount()). */
  transitionCount: number;
  lastUnit: FullAnalysisUnit;
  done: boolean;
  /** Résultat terminal wire (early-return failFast/cost-limit), sinon null. */
  terminalResult?: Record<string, unknown> | null;
  /** Contexte enrichi VIVANT (avec Date objects) au boundary de l'unité. */
  enrichedContext: EnrichedAgentContext;
  /** allResults brut (non sanitizé) du run. */
  allResults: Record<string, unknown>;
  /** verificationContext local (carry, pas rebuild). null avant Tier1. */
  verificationContext: Record<string, unknown> | null;
  /** Accumulateur de warnings (Date timestamp). */
  collectedWarnings: unknown[];
  /**
   * Findings agrégés Tier1 (`extractAllFindings(...).allFindings`). Local de runFullAnalysis,
   * PAS porté par enrichedContext. Vide (`[]`) avant l'agrégation post-Tier1. Chaque finding a
   * un `createdAt` (Date) normalisé en ISO ; ravivé seul au rehydrate (lock Codex #4, v3 d-2a). */
  tier1Findings: unknown[];
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
    transitionCount: input.transitionCount,
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
    terminalResult: toWireObjectOrNull(input.terminalResult, "$.terminalResult"),

    scopedDocuments: toWireArray(ctx.documents, "$.scopedDocuments"),
    factStore: toWireArray(ctx.factStore, "$.factStore"),
    founderResponses: toWireArray(ctx.founderResponses, "$.founderResponses"),
    collectedWarnings: toWireArray(input.collectedWarnings, "$.collectedWarnings"),
    tier1Findings: toWireArray(input.tier1Findings, "$.tier1Findings"),

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
 * tier1Findings : `createdAt` (`new Date()` posé à l'extraction) — SEULE Date d'un
 * ScoredFinding Tier1 (le finding-extractor n'émet pas de benchmarkData.updatedAt). Lock
 * Codex #4 (v3 d-2a) : raviver `createdAt` seul ; le reste du finding est wire-stable.
 */
function reviveTier1Findings(wire: unknown[]): unknown[] {
  const findings = cloneWire(wire);
  findings.forEach((f, i) => {
    const o = asRecord(f);
    if (o) reviveField(o, "createdAt", `tier1Findings[${i}]`);
  });
  return findings;
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
  /** Findings agrégés Tier1 (createdAt ravivé). Local de runFullAnalysis (hors enrichedContext). */
  tier1Findings: unknown[];
  totalCost: number;
  completedCount: number;
  startTimeMs: number;
  transitionCount: number;
  totalAgents: number;
  lastUnit: FullAnalysisUnit;
  done: boolean;
  /** Résultat terminal wire si l'unité a early-return (done=true), sinon null. */
  terminalResult: Record<string, unknown> | null;
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
    tier1Findings: reviveTier1Findings(state.tier1Findings),
    totalCost: state.totalCost,
    completedCount: state.completedCount,
    startTimeMs: state.startTimeMs,
    transitionCount: state.transitionCount,
    totalAgents: state.totalAgents,
    lastUnit: state.lastUnit,
    done: state.done,
    terminalResult: cloneWire(state.terminalResult),
    analysisId: state.analysisId,
    dealId: state.dealId,
    analysisType: state.analysisType,
  };
}

// ============================================================================
// d-2b — tier0-facts : DTO « step de sortie » (lock Codex #2/#3)
// ============================================================================

/**
 * DTO wire de TOUTE la mutation de runTier0Step (lock Codex #3). `tier0-facts` est un step
 * de SORTIE (pas un snapshot unit) : son retour mémoïsé EST appliqué au state vivant au
 * memo hit (PAS de readLatestStepwiseSnapshot — lock Codex #2). Porte les 5 champs retournés
 * par runTier0Step + `allResults["fact-extractor"]` (muté par réf dans runTier0Step).
 */
export interface Tier0FactsWire {
  totalCost: number;
  completedCount: number;
  /** factStore wire (Date firstSeenAt/lastUpdatedAt/validAt/eventHistory en ISO). */
  factStore: unknown[];
  factStoreFormatted: string;
  founderResponses: unknown[];
  /** allResults["fact-extractor"] wire (null si scopedDocuments vide → agent non exécuté). */
  factExtractorResult: Record<string, unknown> | null;
}

/**
 * Construit le DTO wire depuis la mutation vivante de runTier0Step. Normalise STRICT
 * (Date->ISO ; LÈVE sur NaN/Map/Set/classe via les helpers toWire et assertPlainJson). `factExtractorResult`
 * = allResults["fact-extractor"] (ou null). Valide le tout JSON-pur avant retour (cohérent
 * avec buildStepState).
 */
export function buildTier0FactsWire(input: {
  totalCost: number;
  completedCount: number;
  factStore: unknown[];
  factStoreFormatted: string;
  founderResponses: unknown[];
  factExtractorResult: unknown;
}): Tier0FactsWire {
  const wire: Tier0FactsWire = {
    totalCost: input.totalCost,
    completedCount: input.completedCount,
    factStore: toWireArray(input.factStore, "$.tier0Facts.factStore"),
    factStoreFormatted: input.factStoreFormatted,
    founderResponses: toWireArray(input.founderResponses, "$.tier0Facts.founderResponses"),
    factExtractorResult: toWireObjectOrNull(input.factExtractorResult, "$.tier0Facts.factExtractorResult"),
  };
  assertPlainJson(wire, "$.tier0FactsWire");
  return wire;
}

/** Résultat de l'application du DTO tier0-facts au state vivant. */
export interface AppliedTier0Facts {
  totalCost: number;
  completedCount: number;
  /** factStore avec Date RAVIVÉES (deep-equal au single-pass, cohérent avec rehydrateContext). */
  factStore: unknown[];
  factStoreFormatted: string;
  founderResponses: unknown[];
  /** allResults["fact-extractor"] wire (string-date, comme rehydrateContext sur allResults) ou null. */
  factExtractorResult: Record<string, unknown> | null;
}

/**
 * Applique le DTO tier0-facts (run sain OU memo hit — lock Codex #2 : on applique CE DTO, on
 * ne lit PAS readLatestStepwiseSnapshot). Ravive les Date du factStore (comme rehydrateContext
 * → deep-equal au single-pass) ; laisse `factExtractorResult` en wire (allResults est traité
 * wire partout dans le chantier — pas de revive, cohérent avec rehydrateContext qui fait
 * cloneWire(state.allResults)). L'appelant pose `allResults["fact-extractor"]` si non-null.
 */
export function applyTier0FactsWire(wire: Tier0FactsWire): AppliedTier0Facts {
  return {
    totalCost: wire.totalCost,
    completedCount: wire.completedCount,
    factStore: reviveFactStore(wire.factStore),
    factStoreFormatted: wire.factStoreFormatted,
    founderResponses: cloneWire(wire.founderResponses),
    factExtractorResult: cloneWire(wire.factExtractorResult),
  };
}

// ============================================================================
// D.5d-1c — Enveloppe terminale durable de l'AnalysisResult (Modèle B, 1 step englobante)
// ============================================================================

/**
 * Construit l'enveloppe WIRE durable d'un AnalysisResult pour la sortie de l'unique step
 * stepwise (Modèle B). Exclut DÉLIBÉRÉMENT le champ lourd `results` (= allResults, non
 * borné) : le mémoïser dans la sortie `step.run` dépasserait le cap Inngest de 4 MB par
 * step (gate Codex). `results` est relu de la persistance (completeAnalysis a déjà écrit
 * allResults) à la reconstruction. Les `earlyWarnings[].timestamp` (Date) sont normalisés
 * en ISO via le normalizer STRICT (rejette tout non-wire-safe résiduel). Le reste reste
 * wire (analysisDelta porte des dates string-only, cohérent avec le traitement d'allResults
 * partout dans le chantier).
 */
export function buildTerminalEnvelope(result: AnalysisResult): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result)) {
    if (k === "results") continue; // exclu (cap 4 MB sortie de step) — relu à la reconstruction
    rest[k] = v;
  }
  const wire = normalizeToWire(rest, "$.terminalEnvelope");
  if (wire === null || typeof wire !== "object" || Array.isArray(wire)) {
    throw new Error("[buildTerminalEnvelope] objet wire attendu");
  }
  return wire as Record<string, unknown>;
}

/**
 * Ravive l'enveloppe WIRE en la part « hors results » d'un AnalysisResult au replay
 * (bodyRan=false). Seule Date top-level ravivée : `earlyWarnings[].timestamp` (gate Codex —
 * `analysisDelta` est string-only, `results` est réinjecté par l'appelant depuis la
 * persistance). Renvoie un objet plain SANS `results` ; l'appelant ajoute `results`.
 */
export function reviveTerminalEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
  const revived = cloneWire(envelope);
  if (Array.isArray(revived.earlyWarnings)) {
    (revived.earlyWarnings as unknown[]).forEach((w, i) => {
      const o = asRecord(w);
      if (o) reviveField(o, "timestamp", `terminalEnvelope.earlyWarnings[${i}]`);
    });
  }
  return revived;
}
