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
  core: ["CLAUDE_SONNET_45", "GEMINI_PRO", "HAIKU"],
  "yc-lens": ["GEMINI_PRO", "CLAUDE_SONNET_45", "HAIKU"],
  "thiel-lens": ["GEMINI_PRO", "CLAUDE_SONNET_45", "HAIKU"],
  "angel-desk-lens": ["GEMINI_PRO", "CLAUDE_SONNET_45", "HAIKU"],
  reconciler: ["GEMINI_PRO", "CLAUDE_SONNET_45", "HAIKU"],
  judge: ["GEMINI_PRO", "GEMINI_3_FLASH", "HAIKU"],
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
      return { moat: null, pathToExit: null } as unknown as Partial<T>;
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

  if (isLegacy) {
    return baseOptions;
  }

  return {
    ...baseOptions,
    fallbackChain: UPGRADED_CHAINS[role],
  };
}
