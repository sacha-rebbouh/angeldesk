/**
 * FullAnalysisStepState — DTO de transfert d'état entre steps Inngest durables
 * (Fix C, split stepwise de full_analysis). ÉTAPE B — type + validation seulement.
 * Aucun import lourd, aucune dépendance Prisma : ce module est pur (testable sans mock).
 *
 * POURQUOI : un `step.run` Inngest ne conserve PAS l'état mémoire (enrichedContext,
 * factStore, verificationContext, stateMachine, costMonitor) entre invocations — seul
 * le retour JSON mémoïsé survit. Ce type est le contrat EXPLICITE de ce qui doit
 * transiter d'une unité (phase/batch) à la suivante, en particulier les artefacts
 * NON reconstructibles depuis la DB :
 *   - `previousResults` : l'OVERLAY complet (résultats d'agents sanitizés pour les
 *     agents downstream) injecté dans enrichedContext.previousResults, qui CONTIENT
 *     la clé synthétique `_consensus_resolutions` (jamais persistée ailleurs). On porte
 *     TOUT previousResults, pas seulement la résolution consensus (audit Codex) — car
 *     les agents downstream lisent l'overlay entier (formes sanitizées ≠ allResults brut).
 *   - `tier1CrossValidation` / `consolidatedRedFlags` : calculés inline-only après Tier1.
 *   - `verificationContext` : dépend de la funding-DB qui peut DRIFTER entre passes →
 *     carry (pas rebuild), sinon byte-divergence.
 *   - `factStoreFormatted` : bytes exacts (les prompts en dépendent).
 *
 * INVARIANT (audit Codex #2) : DTO sérialisable STRICT, pas un EnrichedAgentContext
 * déguisé. Aucune fonction/classe/Map/Set/Date/undefined/NaN non normalisés. Les
 * champs « riches » sont au niveau fil (JSON brut) ; les domain types sont reconstruits
 * par le consommateur. Validation STRICTE au write (assertSerializableStepState) ET au
 * load (parseStepState) : tous les blobs requis présents + typés + JSON pur, scalaires
 * bornés.
 */

/** Version du schéma de snapshot — bump si la forme change (compat snapshot en vol). */
export const FULL_ANALYSIS_STEP_STATE_VERSION = 1 as const;

/** Identifiants d'unités du pipeline stepwise (ordre d'exécution). */
export type FullAnalysisUnit =
  | "init"
  | "tier0-thesis"
  | "tier1-phase-a"
  | "tier1-phase-b"
  | "tier1-phase-c"
  | "tier1-phase-d"
  | "post-tier1-glue"
  | "tier3-pre"
  | "tier2-sector"
  | "tier3-post";

export const FULL_ANALYSIS_UNITS: readonly FullAnalysisUnit[] = [
  "init",
  "tier0-thesis",
  "tier1-phase-a",
  "tier1-phase-b",
  "tier1-phase-c",
  "tier1-phase-d",
  "post-tier1-glue",
  "tier3-pre",
  "tier2-sector",
  "tier3-post",
];

const UNIT_SET: ReadonlySet<string> = new Set<string>(FULL_ANALYSIS_UNITS);

/**
 * État sérialisable transféré entre steps. TOUTES les valeurs doivent être du JSON
 * pur (cf. assertSerializableStepState).
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

  /** Dernière unité dont le travail est inclus dans ce state. */
  lastUnit: FullAnalysisUnit;
  /** true => pipeline terminé (le dispatcher arrête la boucle). */
  done: boolean;

  /** factStoreFormatted — bytes exacts utilisés dans les prompts. */
  factStoreFormatted: string;

  // --- blobs JSON (artefacts non reconstructibles depuis la DB) ---
  /** Sorties d'agents mutées (incl. entrées révisées par reflexion). JSON pur. */
  allResults: Record<string, unknown>;
  /**
   * Overlay complet enrichedContext.previousResults : résultats sanitizés consommés
   * par les agents downstream, CONTENANT la clé synthétique `_consensus_resolutions`
   * (jamais persistée ailleurs). Carry intégral obligatoire (audit Codex).
   */
  previousResults: Record<string, unknown>;
  /** Sortie de runTier1CrossValidation (inline-only). null avant post-Tier1. */
  tier1CrossValidation: Record<string, unknown> | null;
  /** Sortie de consolidateRedFlags (inline-only). null avant post-Tier1. */
  consolidatedRedFlags: unknown[] | null;
  /**
   * verificationContext sérialisé (carry, PAS rebuild — la funding-DB peut drifter).
   * null tant que Tier1 n'a pas produit son verificationContext.
   */
  verificationContext: Record<string, unknown> | null;
}

/** Champs scalaires requis + typeof attendu (validation au load). */
const SCALAR_FIELDS: ReadonlyArray<[keyof FullAnalysisStepState, "string" | "number" | "boolean"]> = [
  ["analysisId", "string"],
  ["dealId", "string"],
  ["analysisType", "string"],
  ["factStoreFormatted", "string"],
  ["totalAgents", "number"],
  ["completedCount", "number"],
  ["totalCost", "number"],
  ["lastUnit", "string"],
  ["done", "boolean"],
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

  // lastUnit doit appartenir à l'enum.
  if (!UNIT_SET.has(o.lastUnit as string)) {
    throw new Error(`[StepState] lastUnit invalide: ${String(o.lastUnit)}`);
  }

  // Blobs requis : présence + typage.
  for (const field of ["allResults", "previousResults"] as const) {
    if (!(field in o) || !isPlainObject(o[field])) {
      throw new Error(`[StepState] ${field} doit être un objet`);
    }
  }
  for (const field of ["tier1CrossValidation", "verificationContext"] as const) {
    if (!(field in o)) throw new Error(`[StepState] champ "${field}" manquant`);
    if (!(o[field] === null || isPlainObject(o[field]))) {
      throw new Error(`[StepState] ${field} doit être un objet ou null`);
    }
  }
  if (!("consolidatedRedFlags" in o)) {
    throw new Error(`[StepState] champ "consolidatedRedFlags" manquant`);
  }
  if (!(o.consolidatedRedFlags === null || Array.isArray(o.consolidatedRedFlags))) {
    throw new Error(`[StepState] consolidatedRedFlags doit être un tableau ou null`);
  }

  // Contenu JSON pur (rejette Date/Map/function/NaN imbriqués).
  assertPlainJson(o.allResults, "$.allResults");
  assertPlainJson(o.previousResults, "$.previousResults");
  assertPlainJson(o.tier1CrossValidation, "$.tier1CrossValidation");
  assertPlainJson(o.consolidatedRedFlags, "$.consolidatedRedFlags");
  assertPlainJson(o.verificationContext, "$.verificationContext");

  return value as unknown as FullAnalysisStepState;
}

/**
 * Valide un state complet avant écriture du snapshot. Équivalent à parseStepState
 * (qui valide désormais scalaires bornés + blobs + JSON pur). Lève sinon.
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
