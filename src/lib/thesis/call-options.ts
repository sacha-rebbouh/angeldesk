import type { ValidatedLLMCallOptions } from "@/agents/base-agent";
import type {
  AngelDeskLensOutput,
} from "@/agents/thesis/frameworks/angel-desk";
import type { ThielLensOutput } from "@/agents/thesis/frameworks/thiel";
import type { YcLensOutput } from "@/agents/thesis/frameworks/yc";
import type { ModelKey } from "@/services/openrouter/client";

type ThesisCallContext = {
  initialVerdict?: string;
  initialConfidence?: number;
};

export type ThesisRole =
  | "core"
  | "yc-lens"
  | "thiel-lens"
  | "angel-desk-lens"
  | "reconciler"
  | "judge";

const UPGRADED_CHAINS: Record<ThesisRole, ModelKey[]> = {
  core: ["CLAUDE_SONNET_45", "HAIKU"],
  // Framework lenses run after document extraction + core thesis extraction
  // inside a 300s Vercel function. Keep them single-attempt: terminal fallback
  // is better than spending a second model timeout and losing the whole run.
  "yc-lens": ["GEMINI_PRO"],
  "thiel-lens": ["GEMINI_PRO"],
  "angel-desk-lens": ["GEMINI_PRO"],
  reconciler: ["GEMINI_PRO", "CLAUDE_SONNET_45", "HAIKU"],
  judge: ["GEMINI_PRO", "GEMINI_3_FLASH", "HAIKU"],
};

const ROLE_TIMEOUTS_MS: Partial<Record<ThesisRole, number>> = {
  core: 110_000,
  "yc-lens": 75_000,
  "thiel-lens": 75_000,
  "angel-desk-lens": 75_000,
  // reconciler : cap PAR MODÈLE (llmCompleteJSONValidated wrappe chaque appel modèle dans
  // withTimeout(timeoutMs)). 50s × chaîne 3 modèles (GEMINI_PRO→SONNET→HAIKU) ≈ 150s, sous le
  // cap run() (config.timeoutMs 180s) → échec plus rapide + coût borné. HAIKU gardé en dernier
  // recours (dégradation gracieuse > terminal "reconciliation indisponible"). Décision produit.
  reconciler: 50_000,
};

// maxRetries PAR RÔLE (override de config.maxRetries, levier effectif côté appel LLM). reconciler:0
// → 1 tentative par modèle (pas de retry interne) ; la diversité vient de la chaîne de fallback, pas
// des retries (sinon 3 modèles × retries × 50s exploserait). NB : 0 est falsy → tester `!== undefined`.
const ROLE_MAX_RETRIES: Partial<Record<ThesisRole, number>> = {
  reconciler: 0,
};

function getFrameworkDefaults(role: "yc-lens" | "thiel-lens" | "angel-desk-lens"):
  YcLensOutput | ThielLensOutput | AngelDeskLensOutput {
  switch (role) {
    case "yc-lens":
      return {
        verdict: "contrasted",
        confidence: 0,
        question: "Existe-t-il un chemin credible vers le Product-Market-Fit ?",
        claims: [],
        failures: [],
        strengths: [],
        summary: "yc lens evaluation unavailable (model degraded)",
      };
    case "thiel-lens":
      return {
        verdict: "contrasted",
        confidence: 0,
        question: "Existe-t-il un chemin vers le monopoly ou une position contrarian defensible ?",
        claims: [],
        failures: [],
        strengths: [],
        summary: "thiel lens evaluation unavailable (model degraded)",
      };
    case "angel-desk-lens":
      return {
        verdict: "contrasted",
        confidence: 0,
        question: "Cette these reste-t-elle solide sous contraintes reelles de capital prive ?",
        claims: [],
        failures: [],
        strengths: [],
        summary: "angel-desk lens evaluation unavailable (model degraded)",
      };
  }
}

function getTerminalFrameworkFallback(role: "yc-lens" | "thiel-lens" | "angel-desk-lens"):
  YcLensOutput | ThielLensOutput | AngelDeskLensOutput {
  const base = getFrameworkDefaults(role);
  switch (role) {
    case "yc-lens":
      return {
        ...base,
        failures: ["YC lens evaluation unavailable — all models in fallback chain exhausted"],
        summary: "yc lens evaluation unavailable (chain exhausted)",
      };
    case "thiel-lens":
      return {
        ...base,
        failures: ["Thiel lens evaluation unavailable — all models in fallback chain exhausted"],
        summary: "thiel lens evaluation unavailable (chain exhausted)",
      };
    case "angel-desk-lens":
      return {
        ...base,
        failures: ["Angel Desk lens evaluation unavailable — all models in fallback chain exhausted"],
        summary: "angel-desk lens evaluation unavailable (chain exhausted)",
      };
  }
}

function getFallbackDefaultsForRole<T>(
  role: ThesisRole,
  context?: ThesisCallContext
): Partial<T> | undefined {
  switch (role) {
    case "core":
      return { moat: null } as unknown as Partial<T>;
    case "yc-lens":
    case "thiel-lens":
    case "angel-desk-lens":
      return getFrameworkDefaults(role) as unknown as Partial<T>;
    case "reconciler":
      if (!context?.initialVerdict) return undefined;
      return {
        updatedVerdict: context.initialVerdict,
        updatedConfidence: context.initialConfidence ?? 50,
        verdictChangeJustification: "Reconciliation unavailable, keeping initial verdict",
        newRedFlags: [],
        reconciliationNotes: [],
        hiddenStrengths: [],
      } as unknown as Partial<T>;
    case "judge":
      return undefined;
  }
}

function getTerminalFallbackForRole<T>(
  role: ThesisRole,
  context?: ThesisCallContext
): T | undefined {
  switch (role) {
    case "core":
    case "judge":
      return undefined;
    case "yc-lens":
    case "thiel-lens":
    case "angel-desk-lens":
      return getTerminalFrameworkFallback(role) as T;
    case "reconciler":
      if (!context?.initialVerdict) return undefined;
      return {
        updatedVerdict: context.initialVerdict,
        updatedConfidence: context.initialConfidence ?? 50,
        verdictChangeJustification: "Reconciliation unavailable — all models exhausted, initial verdict preserved",
        newRedFlags: [],
        reconciliationNotes: [
          {
            title: "Reconciliation indisponible",
            detail: "Tous les modèles de la chaîne de fallback ont échoué. Verdict initial conservé.",
            impact: "neutral",
          },
        ],
        hiddenStrengths: [],
      } as T;
  }
}

/**
 * THESIS_MODEL_TIER:
 * - upgraded: upgraded model chains for the thesis panel
 * - legacy: router default model selection, but keep fail-closed and role-safe degradation
 */
export function getThesisCallOptions<T>(
  role: ThesisRole,
  context?: ThesisCallContext
): Partial<ValidatedLLMCallOptions<T>> {
  const isLegacy = process.env.THESIS_MODEL_TIER === "legacy";
  const defaults = getFallbackDefaultsForRole<T>(role, context);
  const terminalFallback = getTerminalFallbackForRole<T>(role, context);

  const baseOptions: Partial<ValidatedLLMCallOptions<T>> = {};
  if (defaults) baseOptions.fallbackDefaults = defaults;
  if (terminalFallback !== undefined) baseOptions.terminalFallbackData = terminalFallback;
  if (ROLE_TIMEOUTS_MS[role]) baseOptions.timeoutMs = ROLE_TIMEOUTS_MS[role];
  if (ROLE_MAX_RETRIES[role] !== undefined) baseOptions.maxRetries = ROLE_MAX_RETRIES[role];

  if (isLegacy) {
    // Legacy : pas de chaîne explicite → le fallback model-aware implicite de completeJSON reste le
    // SEUL failover, on ne le désactive donc pas (même pour reconciler).
    return baseOptions;
  }

  const upgraded: Partial<ValidatedLLMCallOptions<T>> = {
    ...baseOptions,
    fallbackChain: UPGRADED_CHAINS[role],
  };
  // reconciler : la chaîne explicite (GEMINI_PRO → CLAUDE_SONNET_45 → HAIKU, 3 familles) EST le
  // failover. Désactiver le fallback model-aware implicite de completeJSON, sinon GEMINI_PRO→HAIKU
  // (HAIKU avant SONNET) ou HAIKU→GEMINI_3_FLASH (modèle hors chaîne) casseraient l'ordre « HAIKU
  // dernier recours » + le budget borné (gate Codex). Les autres rôles gardent le fallback implicite.
  if (role === "reconciler") {
    upgraded.disableModelFallback = true;
  }
  return upgraded;
}
