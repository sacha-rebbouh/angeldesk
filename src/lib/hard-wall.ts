/**
 * Hard wall (Fix C — étape H) : borne le wall-clock d'une opération potentiellement non
 * bornée (glue : requête DB lente, etc.) par un `Promise.race` contre un timeout. Si `fn()`
 * ne résout pas avant `wallMs`, LÈVE `[hard-wall:<label>] timed out after <wallMs>ms` —
 * l'appelant DOIT dégrader gracieusement (try/catch autour). Garantit qu'un `await` qui ne
 * revient jamais ne bloque pas un step durable (plafond Vercel 300s) → pas de replay infini.
 *
 * `fn` est un THUNK (invoqué à l'intérieur du race) pour ne pas démarrer l'opération avant
 * d'armer le mur. `clearTimeout` en `finally` évite la fuite du timer (et un handle qui
 * maintiendrait le process Node éveillé).
 *
 * RÉSIDUEL connu (hors scope, documenté PLAN §5-H) : `Promise.race` n'ABORT PAS l'opération
 * sous-jacente — une requête Prisma lente continue jusqu'à sa fin réelle (connexion tenue)
 * même après que le mur a levé. Follow-up éventuel : AbortController/AbortSignal câblé
 * jusqu'à la couche transport.
 */
export async function withHardWall<T>(
  label: string,
  fn: () => Promise<T>,
  wallMs: number
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[hard-wall:${label}] timed out after ${wallMs}ms`));
    }, wallMs);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
