/**
 * Phase C slice C1d-1 — Shared truncation guard for `completeJSON*` callers.
 *
 * Source de vérité centralisée pour la sémantique fail-closed introduite
 * en C1c (REL-006). Réutilisée par :
 *   - `BaseAgent.llmCompleteJSON*` (refactor C1d-1 — remplace l'ancien
 *     helper privé `assertNotTruncatedResult`).
 *   - Les futurs callers directs `completeJSON` (C1d-2 Board, C1d-3 Tier2
 *     + services, C1d-4 Live).
 *
 * Contexte : le router `src/services/openrouter/router.ts:794` injecte
 * `_wasTruncated: true` sur l'objet `data` retourné par `completeJSON`
 * quand `extractBracedJSON` a auto-réparé une réponse JSON tronquée. Sans
 * check explicite côté caller, le partial passe pour valide et le
 * scoring déterministe + persistence opèrent sur données incomplètes.
 *
 * Comportement strict :
 *   - Si `_wasTruncated !== true` (ou `data` non-objet) → retourne `false`.
 *   - Si `_wasTruncated === true` SANS opt-in → throw avec message clair
 *     incluant le `caller` (pour diagnostic logs prod).
 *   - Si `_wasTruncated === true` AVEC opt-in `allowPartialOnTruncation: true`
 *     → retourne `true`. Le caller est responsable de propager le flag
 *     downstream (ex: `BaseAgent.checkTruncation` qui ajoute une
 *     limitation `meta.limitations[]`).
 *
 * Note Zod : ce check doit être exécuté AVANT toute validation Zod, car
 * un schéma strict strip les champs inconnus dont `_wasTruncated`. Les
 * callers qui appliquent Zod après doivent capturer la valeur de retour
 * pour la propager dans leur résultat typé.
 */

export interface TruncationGuardOptions {
  /**
   * Identifiant du caller (ex: `"llmCompleteJSON"`, `"board-member.analyze"`,
   * `"saas-expert"`). Inclus dans le message d'erreur pour faciliter le
   * diagnostic en prod.
   */
  caller: string;

  /**
   * Opt-in explicite : si `true`, ne throw pas. Le caller s'engage à
   * dégrader gracieusement (limitation utilisateur, fallback, etc.).
   *
   * Allowlisté agent par agent via les guards Phase C. À ne pas utiliser
   * sans justification documentée.
   */
  allowPartialOnTruncation?: boolean;
}

/**
 * Vérifie si le résultat LLM a été auto-réparé tronqué. Throw fail-closed
 * par défaut.
 *
 * @returns `true` si le résultat est tronqué ET le caller a opt-in ;
 *          `false` si le résultat n'est pas tronqué ou si `data` n'est
 *          pas un objet inspectable.
 * @throws  `Error` si le résultat est tronqué ET pas d'opt-in.
 */
export function assertCompletionNotTruncated<T>(
  data: T,
  options: TruncationGuardOptions,
): boolean {
  // Garde contre les types non-objet (string, number, null, undefined).
  if (data === null || typeof data !== "object") {
    return false;
  }
  const dataObj = data as Record<string, unknown>;
  if (dataObj._wasTruncated !== true) {
    return false;
  }
  if (!options.allowPartialOnTruncation) {
    throw new Error(
      `[${options.caller}] LLM JSON response was truncated and auto-repaired; ` +
        `refusing partial data. ` +
        `Pass \`allowPartialOnTruncation: true\` in the LLM options if this caller ` +
        `knows how to safely degrade with a limitation in meta or via a fallback.`,
    );
  }
  return true;
}
