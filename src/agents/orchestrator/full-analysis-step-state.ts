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
 *   - `consensusResolutions` (_consensus_resolutions) : injecté en mémoire dans
 *     enrichedContext.previousResults, JAMAIS persisté → carry obligatoire.
 *   - `tier1CrossValidation` / `consolidatedRedFlags` : calculés inline-only après Tier1.
 *   - `verificationContext` : dépend de la funding-DB qui peut DRIFTER entre passes →
 *     carry (pas rebuild), sinon byte-divergence.
 *   - `factStoreFormatted` : bytes exacts (les prompts en dépendent).
 *
 * INVARIANT (audit Codex #2) : DTO sérialisable STRICT, pas un EnrichedAgentContext
 * déguisé. Aucune fonction/classe/Map/Set/Date/undefined/NaN non normalisés. Les
 * champs « riches » sont au niveau fil (JSON brut) ; les domain types sont reconstruits
 * par le consommateur. `assertSerializableStepState` applique l'invariant au write.
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

/**
 * État sérialisable transféré entre steps. TOUTES les valeurs doivent être du JSON
 * pur (cf. assertSerializableStepState).
 */
export interface FullAnalysisStepState {
  /** Version du schéma (validation au load). */
  version: typeof FULL_ANALYSIS_STEP_STATE_VERSION;

  // --- identité / progression (scalaires) ---
  analysisId: string;
  dealId: string;
  /** AnalysisType au niveau fil (string), recasté par le consommateur. */
  analysisType: string;
  totalAgents: number;
  completedCount: number;
  totalCost: number;

  /** Dernière unité dont le travail est inclus dans ce state. */
  lastUnit: FullAnalysisUnit;
  /** true => pipeline terminé (le dispatcher arrête la boucle). */
  done: boolean;

  // --- blobs JSON (artefacts non reconstructibles depuis la DB) ---
  /** Sorties d'agents mutées (incl. entrées révisées par reflexion). JSON pur. */
  allResults: Record<string, unknown>;
  /**
   * Overlay synthétique `_consensus_resolutions` injecté dans previousResults,
   * jamais persisté ailleurs. null si aucun consensus encore produit.
   */
  consensusResolutions: Record<string, unknown> | null;
  /** Sortie de runTier1CrossValidation (inline-only). null avant post-Tier1. */
  tier1CrossValidation: Record<string, unknown> | null;
  /** Sortie de consolidateRedFlags (inline-only). null avant post-Tier1. */
  consolidatedRedFlags: unknown[] | null;
  /** factStoreFormatted — bytes exacts utilisés dans les prompts. */
  factStoreFormatted: string;
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
  ["totalAgents", "number"],
  ["completedCount", "number"],
  ["totalCost", "number"],
  ["lastUnit", "string"],
  ["done", "boolean"],
];

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

  // objet : doit être « plain » (prototype Object.prototype ou null).
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
 * Valide un objet `unknown` comme FullAnalysisStepState (version + scalaires + champs
 * blob présents). Lève sinon. Utilisé au load snapshot (où Prisma renvoie un objet
 * Json déjà parsé) et par deserializeStepState (string).
 */
export function parseStepState(value: unknown): FullAnalysisStepState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("[StepState] le snapshot n'est pas un objet");
  }
  const o = value as Record<string, unknown>;
  if (o.version !== FULL_ANALYSIS_STEP_STATE_VERSION) {
    throw new Error(`[StepState] version non supportée: ${String(o.version)}`);
  }
  for (const [field, expected] of SCALAR_FIELDS) {
    if (typeof o[field] !== expected) {
      throw new Error(`[StepState] champ "${String(field)}" manquant ou mal typé (attendu ${expected})`);
    }
  }
  for (const blob of ["allResults", "factStoreFormatted"] as const) {
    if (!(blob in o)) throw new Error(`[StepState] champ "${blob}" manquant`);
  }
  if (typeof o.factStoreFormatted !== "string") {
    throw new Error(`[StepState] factStoreFormatted doit être string`);
  }
  return value as FullAnalysisStepState;
}

/**
 * Valide un state complet avant écriture du snapshot : scalaires + version + contenu
 * JSON-pur de tous les blobs. Lève sinon.
 */
export function assertSerializableStepState(state: FullAnalysisStepState): void {
  parseStepState(state); // version + scalaires
  assertPlainJson(state.allResults, "$.allResults");
  assertPlainJson(state.consensusResolutions, "$.consensusResolutions");
  assertPlainJson(state.tier1CrossValidation, "$.tier1CrossValidation");
  assertPlainJson(state.consolidatedRedFlags, "$.consolidatedRedFlags");
  assertPlainJson(state.verificationContext, "$.verificationContext");
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
