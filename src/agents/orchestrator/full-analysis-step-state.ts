/**
 * FullAnalysisStepState — DTO de transfert d'état entre steps Inngest durables
 * (Fix C, split stepwise de full_analysis). Module PUR (aucune dépendance Prisma/lourde,
 * testable sans mock).
 *
 * POURQUOI : un `step.run` Inngest ne conserve PAS l'état mémoire (enrichedContext,
 * factStore, verificationContext, stateMachine, costMonitor) entre invocations — seul
 * le retour JSON mémoïsé survit. Ce type est le contrat EXPLICITE de ce qui doit
 * transiter d'une unité (phase/batch) à la suivante.
 *
 * VERSION 2 (D.5b) — CONTRAT D'ÉTAT COMPLET. La v1 (étape B) ne portait que les artefacts
 * non reconstructibles strictement (allResults, previousResults, tier1CrossValidation,
 * consolidatedRedFlags, verificationContext, factStoreFormatted). La v2 porte AUSSI tout
 * le contexte (deal snapshot, documents, evidenceContext, evidenceToday, factStore, thesis,
 * contextEngine, evidenceLedger, extractedData, deckCoherenceReport, baPreferences,
 * dealTerms, dealStructure, founderResponses, previousAnalysisQuestions, analysis-binding,
 * collectedWarnings) afin de RECONSTRUIRE enrichedContext + les locals sans re-lecture DB
 * (re-lecture interdite : le deal row est muté en run ; la funding-DB / les signaux evidence
 * peuvent drifter ; evidenceLedger.generatedAt est wall-clock → rebuild = byte-divergence).
 *
 * STRATÉGIE CARRY > REBUILD (D.5b, validé Codex) : tout ce qui peut finir dans un prompt
 * ou dépend du wall-clock / d'une donnée DB mutable est PORTÉ, pas recalculé. Seul le
 * sectorExpert (closure) n'est jamais porté (reconstruit via le secteur au step Tier2).
 *
 * VERSION 3 (d-2a) — AJOUT `tier1Findings` (blob tableau requis). Les findings agrégés Tier1
 * (extractAllFindings(...).allFindings) portent un `id` et un `createdAt` (`new Date()`)
 * générés à l'extraction et NON re-dérivables byte-identique ; ils sont réutilisés tels quels
 * au consensus Tier2-sectoriel (lock Codex #4) → ils doivent être PORTÉS, pas re-extraits.
 *
 * VERSION 4 (d-3) — AJOUT `allValidations` + `needsReflect` (2 blobs tableau requis). Le split FIN
 * de Tier1 (un step `agents` + un step de reflexion PAR agent low-conf + un step `phase-finalize`)
 * snapshote AU MILIEU d'une phase : l'état intra-phase doit transiter. `allValidations` = les
 * AgentFactValidation accumulées (lues CUMULATIVEMENT par reformatFactStoreWithValidations à chaque
 * phase, pas seulement persistées en DB) ; `needsReflect` = la LISTE ORDONNÉE des agents low-conf
 * restant à refléchir dans la phase courante (PORTÉE, pas re-dérivée : la reflexion mute allResults,
 * donc re-extraire les confidences au replay donnerait une liste différente — lock Codex). Les
 * findings intra-phase accumulés réutilisent le champ `tier1Findings` existant (runPostTier1Aggregation
 * renvoie `phasesResult.allFindings` inchangé → même tableau). AgentFactValidation = primitifs seuls
 * (aucune Date) → `allValidations` ne nécessite pas de reviver.
 *
 * SÉRIALISATION : ce DTO est du JSON pur (cf. assertPlainJson). Les valeurs riches sont
 * stockées au niveau fil (Date → string ISO ; aucun Map/Set — confirmé par l'audit). Les
 * Date sont RAVIVÉES par le consommateur (rehydrateContext, étape D.5b ultérieure) aux
 * chemins connus. La validation est STRICTE au write (assertSerializableStepState) ET au
 * load (parseStepState) : tous les blobs requis présents + typés + JSON pur, scalaires bornés.
 */

/** Version du schéma de snapshot — bump si la forme change (compat snapshot en vol). */
export const FULL_ANALYSIS_STEP_STATE_VERSION = 4 as const;

/**
 * Identifiants d'unités du pipeline stepwise (ordre d'exécution). `tier0-facts` est
 * ISOLÉ de `tier0-thesis` (D.5d, gate Codex) pour confiner la ré-exécution du
 * `createFactEventsBatch` non idempotent à sa propre unité durable.
 *
 * Le graphe v4 SPLIT `tier0-thesis` en `tier0-pre-context` (doc-extractor + deck-coherence +
 * context-engine = 1er SNAPSHOT) et `tier0-thesis-extractor` (thesis-extractor ~280s peelé,
 * gate Codex Option B) : on isole le thesis-extractor SANS frontière durable avant le 1er
 * snapshot, pour éviter le re-chargement de `evidenceToday` (wall-clock, loadEvidenceContextSafe)
 * qui driverait au replay. `tier0-thesis` reste utilisé par les graphes v2 ET v3 (frozen).
 *
 * Le graphe v4 SPLIT aussi le batch tier3-pré (conditions/contradiction/devils, parallèle en
 * single-pass) en steps per-agent durables : `tier3-setup` (startSynthesis + DealTerms/Structure/
 * BAPrefs) puis `tier3-pre-conditions` / `tier3-pre-contradiction` / `tier3-pre-devils`. L'écriture
 * `previousResults` des 3 est DIFFÉRÉE sur le step devils (les 3 agents tournent contre la baseline
 * post-glue, byte-équiv du parallèle). `tier3-pre` (step unique) reste utilisé par v2/v3 (frozen).
 * Ajouter des lastUnit ne change PAS la forme du snapshot → pas de bump de version.
 */
export type FullAnalysisUnit =
  | "init"
  | "tier0-facts"
  | "tier0-thesis"
  | "tier0-pre-context"
  | "tier0-thesis-extractor"
  | "tier1-phase-a"
  | "tier1-phase-b"
  | "tier1-phase-c"
  | "tier1-phase-d"
  | "post-tier1-glue"
  | "tier3-pre"
  | "tier3-setup"
  | "tier3-pre-conditions"
  | "tier3-pre-contradiction"
  | "tier3-pre-devils"
  | "tier2-sector"
  | "tier3-post";

export const FULL_ANALYSIS_UNITS: readonly FullAnalysisUnit[] = [
  "init",
  "tier0-facts",
  "tier0-thesis",
  "tier0-pre-context",
  "tier0-thesis-extractor",
  "tier1-phase-a",
  "tier1-phase-b",
  "tier1-phase-c",
  "tier1-phase-d",
  "post-tier1-glue",
  "tier3-pre",
  "tier3-setup",
  "tier3-pre-conditions",
  "tier3-pre-contradiction",
  "tier3-pre-devils",
  "tier2-sector",
  "tier3-post",
];

const UNIT_SET: ReadonlySet<string> = new Set<string>(FULL_ANALYSIS_UNITS);

/**
 * État sérialisable transféré entre steps. TOUTES les valeurs doivent être du JSON
 * pur (cf. assertSerializableStepState). Les champs « wire » portant des Date les
 * stockent en string ISO ; le consommateur (rehydrateContext) les ravive.
 */
export interface FullAnalysisStepState {
  /** Version du schéma (validation au load). */
  version: typeof FULL_ANALYSIS_STEP_STATE_VERSION;

  // --- identité / progression (scalaires bornés) ---
  analysisId: string;
  dealId: string;
  /** AnalysisType au niveau fil (string), recasté par le consommateur. */
  analysisType: string;
  /** Entier > 0. */
  totalAgents: number;
  /** Entier >= 0 et <= totalAgents. */
  completedCount: number;
  /** >= 0. */
  totalCost: number;
  /** Début RÉEL du run (epoch ms). Porté pour préserver totalTimeMs/durée au replay. */
  startTimeMs: number;
  /**
   * Nombre CUMULATIF de transitions de la state machine au boundary (D.5d). Porté pour
   * que `getSummary().transitions` (injecté dans le summary user) reste identique au
   * single-pass après un resume (restoreFromStepState ne rejoue pas l'historique).
   */
  transitionCount: number;

  /** Dernière unité dont le travail est inclus dans ce state. */
  lastUnit: FullAnalysisUnit;
  /** true => pipeline terminé (le dispatcher arrête la boucle). */
  done: boolean;

  // --- bytes exacts utilisés dans les prompts ---
  /** factStoreFormatted — bytes exacts. */
  factStoreFormatted: string;
  /** evidenceLedgerFormatted — bytes exacts (CARRY : generatedAt wall-clock, rebuild driverait). */
  evidenceLedgerFormatted: string;
  /** evidenceToday du run, en ISO (CARRY : référence de fraîcheur stable ; ravivé en Date). */
  evidenceTodayIso: string;
  /** Mode conditions-analyst ('pipeline'|'standalone') ou null. */
  conditionsAnalystMode: string | null;

  // --- blobs OBJET requis (JSON pur) ---
  /** Sorties d'agents brutes mutées (incl. entrées révisées par reflexion). */
  allResults: Record<string, unknown>;
  /**
   * Overlay complet enrichedContext.previousResults : résultats sanitizés consommés
   * par les agents downstream, CONTENANT la clé synthétique `_consensus_resolutions`
   * (jamais persistée ailleurs). Carry intégral obligatoire (audit Codex).
   */
  previousResults: Record<string, unknown>;
  /** Snapshot du canonicalDeal courant (wire ; Date createdAt/updatedAt/founders en ISO). */
  canonicalDeal: Record<string, unknown>;
  /** Binding analyse : { id, mode, thesisBypass, thesisId, corpusSnapshotId }. */
  analysisBinding: Record<string, unknown>;

  // --- blobs OBJET nullable (null tant que l'étape productrice n'a pas tourné) ---
  /** Sortie de runTier1CrossValidation (inline-only). null avant post-Tier1. */
  tier1CrossValidation: Record<string, unknown> | null;
  /** verificationContext (carry, PAS rebuild — funding-DB peut drifter). null avant Tier1. */
  verificationContext: Record<string, unknown> | null;
  /** evidenceContext (wire ; Date profondes ISO). null si non chargé. */
  evidenceContext: Record<string, unknown> | null;
  /** Objet thèse injecté dans enrichedContext (PLAIN). null avant extraction. */
  thesis: Record<string, unknown> | null;
  /** Données Context Engine (PLAIN, dates=string). null si non enrichi. */
  contextEngine: Record<string, unknown> | null;
  /** evidenceLedger (PLAIN, generatedAt=string) — CARRY (wall-clock, pas rebuild). */
  evidenceLedger: Record<string, unknown> | null;
  /** extractedData (ContextSeed, PLAIN). null avant document-extractor. */
  extractedData: Record<string, unknown> | null;
  /** Rapport cohérence deck (PLAIN). null si non produit. */
  deckCoherenceReport: Record<string, unknown> | null;
  /** Préférences BA (PLAIN). null avant synthesis-setup. */
  baPreferences: Record<string, unknown> | null;
  /** DealTerms convertis (PLAIN, Number()). null si absent. */
  dealTerms: Record<string, unknown> | null;
  /** DealStructure convertie (PLAIN, Number()). null si absent. */
  dealStructure: Record<string, unknown> | null;
  /**
   * Résultat terminal wire (AnalysisResult sérialisé) posé par un early-return
   * (runPostTier1FailFast / runPostConsensusCostLimit), avec `done=true`. Le driver le
   * rehydrate et le retourne au replay (reconstruction exacte du retour terminal). null
   * tant qu'aucun early-return terminal n'a eu lieu (D.5d, gate Codex).
   */
  terminalResult: Record<string, unknown> | null;

  // --- blobs TABLEAU requis (JSON pur) ---
  /** scopedDocuments (wire ; Date uploadedAt/sourceDate/receivedAt en ISO). */
  scopedDocuments: unknown[];
  /** factStore (wire ; Date firstSeenAt/lastUpdatedAt/validAt/eventHistory en ISO). */
  factStore: unknown[];
  /** founderResponses (PLAIN). */
  founderResponses: unknown[];
  /** collectedWarnings (wire ; Date timestamp en ISO). */
  collectedWarnings: unknown[];
  /**
   * tier1Findings — findings agrégés Tier1 (`extractAllFindings(...).allFindings`, des
   * ScoredFinding). PORTÉ (v3, d-2a) car non re-dérivable byte-identique : chaque finding a
   * un `id` et un `createdAt` (`new Date()`) générés à l'extraction, et l'objet est réutilisé
   * tel quel au consensus Tier2-sectoriel (lock Codex #4). `createdAt` est la SEULE Date d'un
   * ScoredFinding Tier1 (le finding-extractor n'émet pas de benchmarkData.updatedAt) → ravivé
   * seul au rehydrate. `lowConfidenceAgents` reste re-dérivé (log-only, hors invariant). Vide
   * (`[]`) tant que l'agrégation post-Tier1 n'a pas tourné. */
  tier1Findings: unknown[];
  /**
   * allValidations — AgentFactValidation accumulées sur les phases Tier1 (extractValidatedClaims).
   * Carry (v4, d-3) : lues CUMULATIVEMENT par reformatFactStoreWithValidations à chaque phase, donc
   * l'état intra-Tier1 doit transiter au snapshot mid-phase. AgentFactValidation = primitifs seuls
   * (aucune Date) → pas de reviver au rehydrate. Vide (`[]`) avant la 1re validation Tier1. */
  allValidations: unknown[];
  /**
   * needsReflect — LISTE ORDONNÉE des agents low-conf restant à refléchir dans la phase Tier1 en
   * cours (split d-3 : 1 step reflexion par agent). Carry (v4) : PORTÉE et NON re-dérivée — la
   * reflexion mute allResults, donc re-extraire les confidences au replay changerait la liste (lock
   * Codex). Vide (`[]`) hors d'une phase en cours de reflexion. */
  needsReflect: unknown[];

  // --- blobs TABLEAU nullable ---
  /** Sortie de consolidateRedFlags (inline-only). null avant post-Tier1. */
  consolidatedRedFlags: unknown[] | null;
  /** Questions des analyses antérieures (PLAIN). null si aucune. */
  previousAnalysisQuestions: unknown[] | null;
}

/** Champs scalaires requis + typeof attendu (validation au load). */
const SCALAR_FIELDS: ReadonlyArray<[keyof FullAnalysisStepState, "string" | "number" | "boolean"]> = [
  ["analysisId", "string"],
  ["dealId", "string"],
  ["analysisType", "string"],
  ["factStoreFormatted", "string"],
  ["evidenceLedgerFormatted", "string"],
  ["evidenceTodayIso", "string"],
  ["totalAgents", "number"],
  ["completedCount", "number"],
  ["totalCost", "number"],
  ["startTimeMs", "number"],
  ["transitionCount", "number"],
  ["lastUnit", "string"],
  ["done", "boolean"],
];

/** Blobs OBJET requis (présents + plain object + JSON pur). */
const REQUIRED_OBJECT_BLOBS: ReadonlyArray<keyof FullAnalysisStepState> = [
  "allResults",
  "previousResults",
  "canonicalDeal",
  "analysisBinding",
];

/** Blobs OBJET nullable (null OU plain object + JSON pur). */
const NULLABLE_OBJECT_BLOBS: ReadonlyArray<keyof FullAnalysisStepState> = [
  "tier1CrossValidation",
  "verificationContext",
  "evidenceContext",
  "thesis",
  "contextEngine",
  "evidenceLedger",
  "extractedData",
  "deckCoherenceReport",
  "baPreferences",
  "dealTerms",
  "dealStructure",
  "terminalResult",
];

/** Blobs TABLEAU requis (présents + array + JSON pur). */
const REQUIRED_ARRAY_BLOBS: ReadonlyArray<keyof FullAnalysisStepState> = [
  "scopedDocuments",
  "factStore",
  "founderResponses",
  "collectedWarnings",
  "tier1Findings",
  "allValidations",
  "needsReflect",
];

/** Blobs TABLEAU nullable (null OU array + JSON pur). */
const NULLABLE_ARRAY_BLOBS: ReadonlyArray<keyof FullAnalysisStepState> = [
  "consolidatedRedFlags",
  "previousAnalysisQuestions",
];

/** Champs string nullable (null OU string). */
const NULLABLE_STRING_FIELDS: ReadonlyArray<keyof FullAnalysisStepState> = [
  "conditionsAnalystMode",
];

/** true si v est un objet « plain » (prototype Object.prototype ou null). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Garde de sérialisabilité STRICTE (audit Codex #2). Lève si `value` contient autre
 * chose que du JSON pur : Date, Map, Set, RegExp, function, symbol, bigint,
 * undefined (valeur d'objet), NaN/Infinity, ou instance de classe (prototype non plain).
 * Renvoie le chemin fautif pour diagnostic immédiat.
 */
export function assertPlainJson(value: unknown, path = "$"): void {
  if (value === null) return;
  const t = typeof value;
  if (t === "string" || t === "boolean") return;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error(`[StepState] valeur numérique non-finie (NaN/Infinity) en ${path}`);
    }
    return;
  }
  if (t === "undefined") throw new Error(`[StepState] undefined non sérialisable en ${path}`);
  if (t === "function") throw new Error(`[StepState] function non sérialisable en ${path}`);
  if (t === "symbol") throw new Error(`[StepState] symbol non sérialisable en ${path}`);
  if (t === "bigint") throw new Error(`[StepState] bigint non sérialisable en ${path}`);

  if (Array.isArray(value)) {
    value.forEach((v, i) => assertPlainJson(v, `${path}[${i}]`));
    return;
  }

  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null) {
    const ctor = (value as { constructor?: { name?: string } })?.constructor?.name ?? "unknown";
    throw new Error(`[StepState] instance non-plain (${ctor}) non sérialisable en ${path}`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertPlainJson(v, `${path}.${k}`);
  }
}

/**
 * Valide un objet `unknown` comme FullAnalysisStepState et renvoie le type.
 * Lève si : pas un objet plain, version inconnue, scalaire manquant/mal typé,
 * scalaire numérique non-fini / hors bornes, lastUnit hors enum, blob requis absent
 * ou mal typé, ou contenu non JSON-pur. Utilisé au load snapshot (objet Json déjà
 * parsé par Prisma), par deserializeStepState (string) ET par
 * assertSerializableStepState (au write).
 */
export function parseStepState(value: unknown): FullAnalysisStepState {
  if (!isPlainObject(value)) {
    throw new Error("[StepState] le snapshot n'est pas un objet");
  }
  const o = value;

  if (o.version !== FULL_ANALYSIS_STEP_STATE_VERSION) {
    throw new Error(`[StepState] version non supportée: ${String(o.version)}`);
  }

  // Scalaires : présence + typeof + finitude.
  for (const [field, expected] of SCALAR_FIELDS) {
    const v = o[field as string];
    if (typeof v !== expected) {
      throw new Error(`[StepState] champ "${String(field)}" manquant ou mal typé (attendu ${expected})`);
    }
    if (expected === "number" && !Number.isFinite(v as number)) {
      throw new Error(`[StepState] champ "${String(field)}" non-fini (NaN/Infinity)`);
    }
  }

  // Bornes métier des scalaires numériques (audit Codex).
  const totalAgents = o.totalAgents as number;
  const completedCount = o.completedCount as number;
  const totalCost = o.totalCost as number;
  const startTimeMs = o.startTimeMs as number;
  if (!Number.isInteger(totalAgents) || totalAgents <= 0) {
    throw new Error(`[StepState] totalAgents doit être un entier > 0 (reçu ${totalAgents})`);
  }
  if (!Number.isInteger(completedCount) || completedCount < 0) {
    throw new Error(`[StepState] completedCount doit être un entier >= 0 (reçu ${completedCount})`);
  }
  if (completedCount > totalAgents) {
    throw new Error(`[StepState] completedCount (${completedCount}) > totalAgents (${totalAgents})`);
  }
  if (totalCost < 0) {
    throw new Error(`[StepState] totalCost doit être >= 0 (reçu ${totalCost})`);
  }
  if (!Number.isInteger(startTimeMs) || startTimeMs < 0) {
    throw new Error(`[StepState] startTimeMs doit être un entier >= 0 (reçu ${startTimeMs})`);
  }
  const transitionCount = o.transitionCount as number;
  if (!Number.isInteger(transitionCount) || transitionCount < 0) {
    throw new Error(`[StepState] transitionCount doit être un entier >= 0 (reçu ${transitionCount})`);
  }

  // lastUnit doit appartenir à l'enum.
  if (!UNIT_SET.has(o.lastUnit as string)) {
    throw new Error(`[StepState] lastUnit invalide: ${String(o.lastUnit)}`);
  }

  // Champs string nullable.
  for (const field of NULLABLE_STRING_FIELDS) {
    const v = o[field as string];
    if (!(v === null || typeof v === "string")) {
      throw new Error(`[StepState] ${String(field)} doit être une string ou null`);
    }
  }

  // Blobs OBJET requis : présence + plain object.
  for (const field of REQUIRED_OBJECT_BLOBS) {
    if (!(field in o) || !isPlainObject(o[field as string])) {
      throw new Error(`[StepState] ${String(field)} doit être un objet`);
    }
  }
  // Blobs OBJET nullable : présence + (null OU plain object).
  for (const field of NULLABLE_OBJECT_BLOBS) {
    if (!(field in o)) throw new Error(`[StepState] champ "${String(field)}" manquant`);
    const v = o[field as string];
    if (!(v === null || isPlainObject(v))) {
      throw new Error(`[StepState] ${String(field)} doit être un objet ou null`);
    }
  }
  // Blobs TABLEAU requis : présence + array.
  for (const field of REQUIRED_ARRAY_BLOBS) {
    if (!(field in o) || !Array.isArray(o[field as string])) {
      throw new Error(`[StepState] ${String(field)} doit être un tableau`);
    }
  }
  // Blobs TABLEAU nullable : présence + (null OU array).
  for (const field of NULLABLE_ARRAY_BLOBS) {
    if (!(field in o)) throw new Error(`[StepState] champ "${String(field)}" manquant`);
    const v = o[field as string];
    if (!(v === null || Array.isArray(v))) {
      throw new Error(`[StepState] ${String(field)} doit être un tableau ou null`);
    }
  }

  // Contenu JSON pur (rejette Date/Map/function/NaN imbriqués) sur tous les blobs.
  for (const field of [...REQUIRED_OBJECT_BLOBS, ...NULLABLE_OBJECT_BLOBS, ...REQUIRED_ARRAY_BLOBS, ...NULLABLE_ARRAY_BLOBS]) {
    assertPlainJson(o[field as string], `$.${String(field)}`);
  }

  return value as unknown as FullAnalysisStepState;
}

/**
 * Valide un state complet avant écriture du snapshot. Équivalent à parseStepState
 * (qui valide scalaires bornés + blobs + JSON pur). Lève sinon.
 */
export function assertSerializableStepState(state: FullAnalysisStepState): void {
  parseStepState(state);
}

/** Sérialise un state validé en JSON. Lève si non sérialisable. */
export function serializeStepState(state: FullAnalysisStepState): string {
  assertSerializableStepState(state);
  return JSON.stringify(state);
}

/** Désérialise + valide un state depuis une string JSON. */
export function deserializeStepState(json: string): FullAnalysisStepState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`[StepState] JSON invalide: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseStepState(parsed);
}
