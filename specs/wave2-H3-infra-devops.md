# Wave 2 - H3 : Infrastructure & DevOps

**Agent**: H3 - Infrastructure & DevOps
**Date**: 2026-02-11
**Failles couvertes**: F42, F44, F45, F46, F47, F48, F49, F58
**Statut**: Spec de correction detaillee

---

## Table des matieres

1. [F42 - Prompt version hardcodee "1.0"](#f42)
2. [F44 - Mutation in-memory des faits (violation immutabilite)](#f44)
3. [F45 - Erreurs de persistance avalees silencieusement](#f45)
4. [F46 - Analyse fire-and-forget sans SSE](#f46)
5. [F47 - Zero test automatise](#f47)
6. [F48 - Zero chiffrement applicatif des pitch decks](#f48)
7. [F49 - Scalabilite non concue pour le volume](#f49)
8. [F58 - OCR gameable (20 pages max)](#f58)

---

<a name="f42"></a>
## F42 - Prompt version hardcodee "1.0"

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/base-agent.ts`
**Ligne**: 172

```typescript
// Ligne 172
promptVersion: "1.0", // Could be versioned per agent
```

Le `buildTrace()` (lignes 154-174) construit un objet `StandardTrace` avec un champ `promptVersion` toujours fixe a `"1.0"`. Ce champ est stocke avec chaque trace d'analyse mais ne reflete jamais le contenu reel du prompt. Consequences :

1. **Impossible de correler une analyse a un prompt specifique** : si le prompt d'un agent change, les anciennes analyses continuent d'afficher "1.0".
2. **Pas de reproductibilite** : on ne sait pas quel prompt+modele+temperature a produit quel resultat.
3. **Pas de regression detection** : impossible de comparer les performances avant/apres changement de prompt.

Le `contextHash` (lignes 145-150) hashe deja le contexte d'entree mais pas le prompt lui-meme.

### Correction

**Principe** : Calculer un hash deterministe a partir du contenu reel du prompt (system + user template), du modele, et de la temperature. Stocker ce hash comme `promptVersion` au lieu de "1.0".

**Fichier a modifier** : `src/agents/base-agent.ts`

```typescript
// === AJOUT : methode privee pour calculer le hash du prompt ===
// A ajouter dans la classe BaseAgent, avant buildTrace()

/**
 * Compute a deterministic prompt version hash from the agent's
 * system prompt content, model complexity, and default temperature.
 * Changes whenever the prompt text or model config changes.
 */
private computePromptVersionHash(): string {
  const systemPrompt = this.buildSystemPrompt();
  const configSignature = `${this.config.modelComplexity}|${this.config.timeoutMs}`;
  const content = `${systemPrompt}||${configSignature}`;
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}
```

```typescript
// === MODIFICATION : buildTrace() ligne 172 ===

// AVANT (ligne 172) :
promptVersion: "1.0", // Could be versioned per agent

// APRES :
promptVersion: this.computePromptVersionHash(),
```

**Extension du type `StandardTrace`** dans `src/agents/types.ts` - ajouter un champ optionnel pour stocker les details de versioning :

```typescript
// Dans l'interface StandardTrace (fichier src/agents/types.ts)
// Ajouter apres promptVersion:
promptVersion: string;
/** Details du prompt pour audit (optionnel, desactivable en prod) */
promptVersionDetails?: {
  systemPromptHash: string;
  modelComplexity: string;
  agentName: string;
};
```

**Mise a jour de buildTrace()** pour inclure les details :

```typescript
private buildTrace(): StandardTrace | undefined {
  if (!this._enableTrace) return undefined;

  const promptVersionHash = this.computePromptVersionHash();

  return {
    id: this._traceId,
    agentName: this.config.name,
    startedAt: this._traceStartedAt,
    completedAt: new Date().toISOString(),
    totalDurationMs: 0,
    llmCalls: this._llmCallTraces,
    contextUsed: this._contextUsed ?? { documents: [] },
    metrics: {
      totalInputTokens: this._totalInputTokens,
      totalOutputTokens: this._totalOutputTokens,
      totalCost: this._totalCost,
      llmCallCount: this._llmCalls,
    },
    contextHash: this._contextHash,
    promptVersion: promptVersionHash,
    promptVersionDetails: {
      systemPromptHash: createHash("sha256")
        .update(this.buildSystemPrompt())
        .digest("hex")
        .slice(0, 16),
      modelComplexity: this.config.modelComplexity as string,
      agentName: this.config.name,
    },
  };
}
```

### Dependances

- Aucune dependance bloquante.
- Le hash est calcule a chaque `run()`, donc tout changement de prompt est automatiquement detecte.
- Si le type `StandardTrace` est modifie dans `src/agents/types.ts`, les consommateurs du type (persistence, front) doivent etre compatibles (champ optionnel).

### Verification

1. Lancer une analyse sur un deal de test, noter le `promptVersion` dans la trace.
2. Modifier le system prompt d'un agent (ex: ajouter une ligne).
3. Relancer l'analyse - verifier que le `promptVersion` a change.
4. Verifier que le meme prompt produit toujours le meme hash (determinisme).
5. Test unitaire : `expect(computePromptVersionHash()).not.toBe("1.0")`

---

<a name="f44"></a>
## F44 - Mutation in-memory des faits (violation immutabilite event-sourced)

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/services/fact-store/current-facts.ts`
**Lignes**: 490-514

```typescript
// Lignes 490-514
export function updateFactsInMemory(
  facts: CurrentFact[],
  validations: AgentFactValidation[]
): CurrentFact[] {
  for (const validation of validations) {
    const fact = facts.find(f => f.factKey === validation.factKey);
    if (!fact) continue;

    if (validation.status === 'CONTRADICTED' && validation.correctedValue !== undefined) {
      const previousValue = fact.currentValue;
      const previousSource = fact.currentSource;
      fact.currentValue = validation.correctedValue;           // MUTATION DIRECTE
      fact.currentDisplayValue = validation.correctedDisplayValue ?? String(validation.correctedValue);  // MUTATION
      fact.isDisputed = true;                                   // MUTATION
      fact.disputeDetails = {                                   // MUTATION
        conflictingValue: previousValue,
        conflictingSource: previousSource,
      };
    }

    fact.currentConfidence = validation.newConfidence;          // MUTATION
  }

  return facts; // Retourne la MEME reference, mutee
}
```

**Appel dans l'orchestrateur** (`src/agents/orchestrator/index.ts`, ligne 1944) :
```typescript
updateFactsInMemory(factStore, validations);
```

Problemes :
1. **Violation du pattern event-sourced** : Le Fact Store est cense fonctionner en event sourcing (append-only), mais `updateFactsInMemory` mute directement les objets `CurrentFact` en place.
2. **Si crash entre mutation et fin de phase** : l'etat en memoire est corrompu sans trace. La persistance des validations se fait seulement apres toutes les phases (lignes 1977+).
3. **Side-effects imprevisibles** : Les references mutees sont partagees avec `enrichedContext.factStore`, ce qui signifie que n'importe quel consommateur du contexte voit les mutations non persistees.

### Correction

**Principe** : Remplacer la mutation in-place par un pattern immutable (creation de nouveaux objets). Le tableau retourne est une nouvelle reference.

**Fichier a modifier** : `src/services/fact-store/current-facts.ts`

```typescript
// === REMPLACEMENT de updateFactsInMemory (lignes 490-514) ===

/**
 * Creates a NEW array of facts with validation updates applied.
 * Does NOT mutate the input array (immutable pattern).
 * Does NOT persist to DB — used between sequential pipeline phases for speed.
 *
 * @param facts - Current facts array (NOT mutated)
 * @param validations - Validation results from an agent
 * @returns NEW facts array with updates applied
 */
export function updateFactsInMemory(
  facts: ReadonlyArray<CurrentFact>,
  validations: AgentFactValidation[]
): CurrentFact[] {
  // Build a Map of validations by factKey for O(1) lookup
  const validationMap = new Map<string, AgentFactValidation>();
  for (const validation of validations) {
    validationMap.set(validation.factKey, validation);
  }

  // Create new array with new objects for changed facts
  return facts.map(fact => {
    const validation = validationMap.get(fact.factKey);
    if (!validation) {
      // No validation for this fact - return as-is (same reference is fine, not mutated)
      return fact;
    }

    // Create a new object (shallow clone + overrides)
    const updatedFact: CurrentFact = { ...fact };

    if (validation.status === 'CONTRADICTED' && validation.correctedValue !== undefined) {
      updatedFact.currentValue = validation.correctedValue;
      updatedFact.currentDisplayValue =
        validation.correctedDisplayValue ?? String(validation.correctedValue);
      updatedFact.isDisputed = true;
      updatedFact.disputeDetails = {
        conflictingValue: fact.currentValue,
        conflictingSource: fact.currentSource,
      };
    }

    updatedFact.currentConfidence = validation.newConfidence;

    return updatedFact;
  });
}
```

**Fichier a modifier** : `src/agents/orchestrator/index.ts` (ligne 1944)

```typescript
// AVANT (ligne 1944) :
updateFactsInMemory(factStore, validations);

// APRES :
factStore = updateFactsInMemory(factStore, validations);
```

Le meme pattern doit etre applique partout ou `updateFactsInMemory` est appele. Verification dans le codebase : seule l'appel ligne 1944 existe (confirme par grep). L'assignation a la ligne 1945 (`factStoreFormatted = reformatFactStoreWithValidations(...)`) et 1946 (`enrichedContext.factStore = factStore`) fonctionnent naturellement car `factStore` est maintenant une nouvelle reference.

### Dependances

- **F45** (erreurs de persistance) : La persistance des validations (lignes 1977+) doit aboutir pour que les facts soient durables.
- Le type `CurrentFact` dans `src/services/fact-store/types.ts` doit rester un plain object (pas de classe avec methodes mutantes).

### Verification

1. Test unitaire :
```typescript
const original = [createFact({ factKey: "financial.arr", currentValue: 100 })];
const updated = updateFactsInMemory(original, [
  { factKey: "financial.arr", status: "CONTRADICTED", newConfidence: 30, correctedValue: 50, validatedBy: "test", explanation: "test" }
]);
// original non mute
expect(original[0].currentValue).toBe(100);
// nouveau tableau avec nouvelle valeur
expect(updated[0].currentValue).toBe(50);
expect(updated).not.toBe(original);
```
2. Lancer une analyse complete, verifier que les facts sont correctement propages entre phases.
3. Simuler un crash apres `updateFactsInMemory` : l'etat d'origine est intact.

---

<a name="f45"></a>
## F45 - Erreurs de persistance avalees silencieusement en production

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestrator/persistence.ts`

Plusieurs fonctions catchent les erreurs et ne les loguent qu'en `development` :

| Fonction | Lignes | Comportement |
|----------|--------|-------------|
| `persistStateTransition` | 94-98 | `catch` + log dev uniquement |
| `persistReasoningTrace` | 131-135 | `catch` + log dev uniquement |
| `persistScoredFindings` | 170-174 | `catch` + log dev uniquement |
| `persistDebateRecord` | 219-223 | `catch` + log dev uniquement |
| `saveCheckpoint` | 583-588 | `catch` + log dev + **throw** (correct) |
| `loadLatestCheckpoint` | 618-622 | `catch` + log dev + return null |
| `findInterruptedAnalyses` | 689-693 | `catch` + log dev + return [] |
| `markAnalysisAsFailed` | 774-779 | `catch` + log dev uniquement |
| `cleanupOldCheckpoints` | 813-817 | `catch` + log dev + return 0 |

Pattern problematique systematique :

```typescript
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Persistence] Failed to persist ...", error);
  }
  // En production : SILENCE TOTAL
}
```

**Impact en production** :
- Si la DB est lente ou deconnectee, aucune alerte
- Les traces de raisonnement, findings scores, debates sont perdus silencieusement
- Impossible de diagnostiquer des problemes de persistance en prod
- Les checkpoints peuvent echouer sans que personne le sache

### Correction

**Principe** : Toujours logger les erreurs (pas seulement en dev). Pour les fonctions non-critiques (traces, findings), logger + emettre une metrique. Pour les fonctions critiques (checkpoints), throw.

**Fichier a modifier** : `src/agents/orchestrator/persistence.ts`

**Etape 1** : Creer un utilitaire de logging en haut du fichier :

```typescript
// === AJOUT en haut du fichier, apres les imports ===

/**
 * Log a persistence error in ALL environments.
 * In development: console.error with full stack.
 * In production: console.error with message + structured metadata for log aggregation.
 */
function logPersistenceError(
  operation: string,
  error: unknown,
  metadata?: Record<string, unknown>
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Always log in all environments
  console.error(
    `[Persistence] FAILED ${operation}: ${errorMessage}`,
    metadata ? JSON.stringify(metadata) : "",
  );

  // In development, also log the full stack
  if (process.env.NODE_ENV === "development" && errorStack) {
    console.error(errorStack);
  }
}
```

**Etape 2** : Remplacer chaque bloc `catch` :

```typescript
// === persistStateTransition (lignes 94-98) ===
// AVANT :
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Persistence] Failed to persist state transition:", error);
  }
}

// APRES :
} catch (error) {
  logPersistenceError("persistStateTransition", error, {
    analysisId, fromState, toState, trigger,
  });
}
```

```typescript
// === persistReasoningTrace (lignes 131-135) ===
// AVANT :
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Persistence] Failed to persist reasoning trace:", error);
  }
}

// APRES :
} catch (error) {
  logPersistenceError("persistReasoningTrace", error, {
    analysisId, agentName,
  });
}
```

```typescript
// === persistScoredFindings (lignes 170-174) ===
// AVANT :
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Persistence] Failed to persist scored findings:", error);
  }
}

// APRES :
} catch (error) {
  logPersistenceError("persistScoredFindings", error, {
    analysisId, agentName, findingsCount: findings.length,
  });
}
```

```typescript
// === persistDebateRecord (lignes 219-223) ===
// AVANT :
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Persistence] Failed to persist debate record:", error);
  }
}

// APRES :
} catch (error) {
  logPersistenceError("persistDebateRecord", error, {
    analysisId,
    contradictionId: debateResult.contradiction.id,
  });
}
```

```typescript
// === loadLatestCheckpoint (lignes 618-622) ===
// AVANT :
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Checkpoint] Failed to load checkpoint:", error);
  }
  return null;
}

// APRES :
} catch (error) {
  logPersistenceError("loadLatestCheckpoint", error, { analysisId });
  return null;
}
```

```typescript
// === findInterruptedAnalyses (lignes 689-693) ===
// AVANT :
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Checkpoint] Failed to find interrupted analyses:", error);
  }
  return [];
}

// APRES :
} catch (error) {
  logPersistenceError("findInterruptedAnalyses", error, { userId });
  return [];
}
```

```typescript
// === markAnalysisAsFailed (lignes 774-779) ===
// AVANT :
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Checkpoint] Failed to mark analysis as failed:", error);
  }
}

// APRES :
} catch (error) {
  logPersistenceError("markAnalysisAsFailed", error, { analysisId, reason });
}
```

```typescript
// === cleanupOldCheckpoints (lignes 813-817) ===
// AVANT :
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Checkpoint] Failed to cleanup checkpoints:", error);
  }
  return 0;
}

// APRES :
} catch (error) {
  logPersistenceError("cleanupOldCheckpoints", error, { analysisId, keepCount });
  return 0;
}
```

**Etape 3** (optionnelle mais recommandee) : Pour les fonctions critiques, ajouter un compteur d'erreurs observable.

```typescript
// === AJOUT en haut du fichier ===

/** In-memory persistence error counter for monitoring */
const persistenceErrors = {
  total: 0,
  byOperation: new Map<string, number>(),
  lastError: null as { operation: string; message: string; at: Date } | null,
};

export function getPersistenceErrorStats() {
  return {
    total: persistenceErrors.total,
    byOperation: Object.fromEntries(persistenceErrors.byOperation),
    lastError: persistenceErrors.lastError,
  };
}
```

Appeler dans `logPersistenceError` :

```typescript
function logPersistenceError(
  operation: string,
  error: unknown,
  metadata?: Record<string, unknown>
): void {
  // ... logging (ci-dessus) ...

  // Increment error counter
  persistenceErrors.total++;
  persistenceErrors.byOperation.set(
    operation,
    (persistenceErrors.byOperation.get(operation) ?? 0) + 1
  );
  persistenceErrors.lastError = {
    operation,
    message: error instanceof Error ? error.message : String(error),
    at: new Date(),
  };
}
```

### Dependances

- Aucune dependance bloquante.
- La fonction `getPersistenceErrorStats()` peut etre exposee dans `/api/admin/health` pour le monitoring.

### Verification

1. En prod (ou en simulant `NODE_ENV=production`), provoquer une erreur de persistance (ex: DB down temporairement).
2. Verifier que les logs contiennent `[Persistence] FAILED ...`.
3. Verifier que `getPersistenceErrorStats()` retourne des compteurs > 0.
4. Verifier que l'analyse continue malgre les erreurs non-critiques (traces, findings).

---

<a name="f46"></a>
## F46 - Analyse fire-and-forget sans streaming SSE

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/app/api/analyze/route.ts`
**Lignes**: 163-201

```typescript
// Lignes 163-193 : Fire-and-forget
orchestrator
  .runAnalysis({
    dealId,
    type: effectiveType,
    enableTrace,
    userPlan: effectivePlan,
  })
  .then((result) => { ... })
  .catch(async (error) => { ... });

// Ligne 195-201 : Reponse immediate
return NextResponse.json({
  data: {
    status: "RUNNING",
    dealId,
    remainingDeals: usageResult.remainingDeals,
  },
});
```

**Pas de `maxDuration`** : Confirme par grep - aucun `export const maxDuration` dans `/src/app/api/analyze/route.ts`. Le frontend utilise un polling toutes les 3 secondes (`refetchInterval: 3000`) sur `/api/deals/[dealId]/analyses` (fichier `src/components/deals/analysis-panel.tsx`, ligne 358).

**Problemes** :
1. **Pas de `maxDuration`** : Sur Vercel, les fonctions serverless ont un timeout par defaut de 10s (Free) / 60s (Pro) / 900s (Enterprise). L'analyse complete prend 2-10 minutes. La requete initiale retourne vite mais le `.then()` n'est pas garanti de finir.
2. **Pas de progression granulaire** : Le polling retourne seulement `completedAgents / totalAgents`. Pas de detail par agent (nom, duree, statut).
3. **Pas de SSE** : L'utilisateur attend 3s entre chaque refresh, pas de temps reel.

**Frontend polling actuel** (`src/components/deals/analysis-panel.tsx`, ligne 322-358) :
```typescript
// Polling toutes les 3s pendant qu'une analyse est RUNNING
const isPolling = useMemo(
  () => analyses.some((a) => a.status === "RUNNING"),
  [analyses]
);
// ...
refetchInterval: isPolling ? 3000 : false,
```

### Correction

**Phase 1 (Quick Win)** : Ajouter `maxDuration` + enrichir la reponse de polling.

**Fichier a modifier** : `src/app/api/analyze/route.ts`

```typescript
// === AJOUT en haut du fichier, apres les imports ===

// Vercel: Allow long-running analysis. Requires Pro plan (300s max).
// Without this, the fire-and-forget promise may be killed after 10s.
export const maxDuration = 300; // 5 minutes
```

**Fichier a modifier** : `src/app/api/deals/[dealId]/analyses/route.ts`

Enrichir la reponse pour inclure le detail des agents completes :

```typescript
// === MODIFICATION du GET ===
// Apres la ligne qui fetche latestAnalysis, ajouter :

// If RUNNING, also return partial results for progress detail
let agentDetails: { name: string; status: string; executionTimeMs?: number }[] | null = null;
if (latestAnalysis.status === "RUNNING" && latestAnalysis.results) {
  try {
    const results = latestAnalysis.results as Record<string, {
      agentName: string;
      success: boolean;
      executionTimeMs?: number;
    }>;
    agentDetails = Object.entries(results).map(([name, r]) => ({
      name,
      status: r.success ? "completed" : "failed",
      executionTimeMs: r.executionTimeMs,
    }));
  } catch {
    // results may not be parseable yet
  }
}

// Dans le return, ajouter agentDetails :
return NextResponse.json({
  data: {
    // ... champs existants ...
    agentDetails, // NEW: detail par agent pour progression granulaire
  },
});
```

**Phase 2 (SSE Endpoint)** : Creer un endpoint SSE pour streaming en temps reel.

**Fichier a creer** : `src/app/api/analyze/stream/route.ts`

```typescript
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";

export const maxDuration = 300; // 5 minutes

/**
 * GET /api/analyze/stream?dealId=xxx
 * SSE endpoint for real-time analysis progress.
 * The client connects and receives events as agents complete.
 */
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  const dealId = request.nextUrl.searchParams.get("dealId");

  if (!dealId || !isValidCuid(dealId)) {
    return new Response("Invalid dealId", { status: 400 });
  }

  // Verify ownership
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: user.id },
    select: { id: true },
  });

  if (!deal) {
    return new Response("Deal not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      let lastCompletedAgents = -1;
      let lastResults: string[] = [];
      let attempts = 0;
      const MAX_ATTEMPTS = 200; // 200 * 1.5s = 5 minutes max

      const poll = async () => {
        try {
          const analysis = await prisma.analysis.findFirst({
            where: { dealId, status: { in: ["RUNNING", "COMPLETED", "FAILED"] } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              completedAgents: true,
              totalAgents: true,
              results: true,
              summary: true,
              totalCost: true,
              totalTimeMs: true,
            },
          });

          if (!analysis) {
            sendEvent("waiting", { message: "No analysis found yet" });
            return true; // continue polling
          }

          // Detect new agent completions
          if (analysis.completedAgents !== lastCompletedAgents) {
            lastCompletedAgents = analysis.completedAgents;

            // Extract newly completed agent names from results
            const currentResults = analysis.results
              ? Object.keys(analysis.results as Record<string, unknown>)
              : [];
            const newAgents = currentResults.filter(a => !lastResults.includes(a));
            lastResults = currentResults;

            sendEvent("progress", {
              completedAgents: analysis.completedAgents,
              totalAgents: analysis.totalAgents,
              newAgents,
              percent: Math.round(
                (analysis.completedAgents / Math.max(analysis.totalAgents, 1)) * 100
              ),
            });
          }

          // Check if done
          if (analysis.status === "COMPLETED") {
            sendEvent("complete", {
              status: "COMPLETED",
              summary: analysis.summary,
              totalCost: analysis.totalCost?.toString(),
              totalTimeMs: analysis.totalTimeMs,
            });
            return false; // stop polling
          }

          if (analysis.status === "FAILED") {
            sendEvent("error", {
              status: "FAILED",
              summary: analysis.summary,
            });
            return false; // stop polling
          }

          return true; // continue polling
        } catch (error) {
          sendEvent("error", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
          return false;
        }
      };

      // Poll every 1.5 seconds
      while (attempts < MAX_ATTEMPTS) {
        const shouldContinue = await poll();
        if (!shouldContinue) break;
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      if (attempts >= MAX_ATTEMPTS) {
        sendEvent("timeout", { message: "Stream timeout after 5 minutes" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

### Dependances

- **F49** (scalabilite) : L'ajout de `maxDuration` est un prerequis pour que l'analyse survive assez longtemps sur Vercel.
- Le SSE endpoint utilise le meme pattern de polling DB que `/api/deals/[dealId]/analyses` mais avec push au lieu de pull.

### Verification

1. Verifier que `maxDuration = 300` est exporte dans `route.ts`.
2. Deployer sur Vercel, lancer une analyse : la fonction ne doit plus timeout apres 10s.
3. Connecter un `EventSource` au SSE endpoint : les evenements `progress` doivent arriver au fur et a mesure.
4. Verifier le fallback : le polling existant (3s) continue de fonctionner si SSE echoue.

---

<a name="f47"></a>
## F47 - Zero test automatise

### Diagnostic

**Tests existants** (3 fichiers) :
1. `/Users/sacharebbouh/Desktop/angeldesk/src/services/fact-store/__tests__/matching.test.ts` - Tests de matching/supersession du Fact Store
2. `/Users/sacharebbouh/Desktop/angeldesk/src/services/credits/__tests__/usage-gate.test.ts` - Tests du systeme de credits
3. `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestration/__tests__/tier3-coherence.test.ts` - Tests de coherence Tier 3

**Config vitest existante** : `/Users/sacharebbouh/Desktop/angeldesk/vitest.unit.config.ts` - fonctionne, pattern `src/**/__tests__/**/*.test.ts`.

**Couverture manquante critique** :
- 0 test pour `base-agent.ts` (850+ lignes)
- 0 test pour `orchestrator/` (2000+ lignes)
- 0 test pour `persistence.ts` (800+ lignes)
- 0 test pour la route `/api/analyze`
- 0 test pour `ocr-service.ts`
- 0 test pour `quality-analyzer.ts`
- 0 test pour le routeur LLM (`src/services/openrouter/router.ts`)
- 0 test pour les fonctions financieres
- Aucun test d'integration, aucun test E2E
- Aucune CI/CD configuree

### Correction

**Phase 1 : Tests unitaires pour les fonctions pures critiques**

**Fichier a creer** : `src/agents/__tests__/base-agent.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

// Test du calcul de prompt version hash (F42)
describe('computePromptVersionHash', () => {
  it('should produce deterministic hash for same input', () => {
    const prompt = "You are a financial auditor.";
    const config = "HAIKU|120000";
    const content = `${prompt}||${config}`;
    const hash1 = createHash("sha256").update(content).digest("hex").slice(0, 12);
    const hash2 = createHash("sha256").update(content).digest("hex").slice(0, 12);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe("1.0");
    expect(hash1).toHaveLength(12);
  });

  it('should produce different hash for different prompts', () => {
    const hash1 = createHash("sha256").update("prompt A||HAIKU|120000").digest("hex").slice(0, 12);
    const hash2 = createHash("sha256").update("prompt B||HAIKU|120000").digest("hex").slice(0, 12);
    expect(hash1).not.toBe(hash2);
  });
});
```

**Fichier a creer** : `src/services/fact-store/__tests__/current-facts.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { updateFactsInMemory, type AgentFactValidation } from '../current-facts';
import type { CurrentFact } from '../types';

function createMockFact(overrides: Partial<CurrentFact> = {}): CurrentFact {
  return {
    dealId: 'test-deal',
    factKey: 'financial.arr',
    category: 'FINANCIAL',
    currentValue: 1000000,
    currentDisplayValue: '1M EUR',
    currentSource: 'PITCH_DECK',
    currentConfidence: 85,
    isDisputed: false,
    eventHistory: [],
    firstSeenAt: new Date(),
    lastUpdatedAt: new Date(),
    ...overrides,
  };
}

describe('updateFactsInMemory', () => {
  it('should NOT mutate original array', () => {
    const original = [createMockFact()];
    const originalValue = original[0].currentValue;

    const validations: AgentFactValidation[] = [{
      factKey: 'financial.arr',
      status: 'CONTRADICTED',
      newConfidence: 30,
      correctedValue: 500000,
      correctedDisplayValue: '500K EUR',
      validatedBy: 'deck-forensics',
      explanation: 'test',
    }];

    const result = updateFactsInMemory(original, validations);

    // Original unchanged
    expect(original[0].currentValue).toBe(originalValue);
    // Result has new value
    expect(result[0].currentValue).toBe(500000);
    // Different references
    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
  });

  it('should update confidence on VERIFIED', () => {
    const facts = [createMockFact({ currentConfidence: 60 })];
    const result = updateFactsInMemory(facts, [{
      factKey: 'financial.arr',
      status: 'VERIFIED',
      newConfidence: 95,
      validatedBy: 'deck-forensics',
      explanation: 'verified against bank statements',
    }]);
    expect(result[0].currentConfidence).toBe(95);
  });

  it('should skip facts not in validations', () => {
    const facts = [
      createMockFact({ factKey: 'financial.arr' }),
      createMockFact({ factKey: 'financial.mrr' }),
    ];
    const result = updateFactsInMemory(facts, [{
      factKey: 'financial.arr',
      status: 'VERIFIED',
      newConfidence: 95,
      validatedBy: 'test',
      explanation: 'test',
    }]);
    expect(result[0].currentConfidence).toBe(95);
    expect(result[1].currentConfidence).toBe(85); // unchanged
  });

  it('should handle empty validations', () => {
    const facts = [createMockFact()];
    const result = updateFactsInMemory(facts, []);
    expect(result).toEqual(facts);
  });
});
```

**Fichier a creer** : `src/services/pdf/__tests__/quality-analyzer.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  analyzeExtractionQuality,
  getPagesNeedingOCR,
  quickOCRCheck,
} from '../quality-analyzer';

describe('analyzeExtractionQuality', () => {
  it('should return high quality for good text', () => {
    const text = `This is a pitch deck with problem, solution, market, team and business model.
    Revenue is growing at 100% YoY. ARR is 1M EUR. TAM is 10B. The competitive landscape
    includes 5 competitors. Our team has strong experience. The product roadmap includes
    expansion to Europe. We are raising 2M at 10M valuation. Growth projection for next year.
    ` + ' lorem ipsum '.repeat(100);

    const result = analyzeExtractionQuality(text, 10);
    expect(result.metrics.qualityScore).toBeGreaterThan(50);
    expect(result.isUsable).toBe(true);
  });

  it('should detect insufficient text', () => {
    const result = analyzeExtractionQuality('hello', 10);
    expect(result.metrics.qualityScore).toBeLessThan(30);
    expect(result.requiresOCR).toBe(true);
  });

  it('should handle empty text', () => {
    const result = analyzeExtractionQuality('', 5);
    expect(result.metrics.totalCharacters).toBe(0);
    expect(result.requiresOCR).toBe(true);
  });
});

describe('getPagesNeedingOCR', () => {
  it('should return pages with low content', () => {
    const distribution = [500, 50, 300, 10, 400]; // pages 1,3 are low
    const result = getPagesNeedingOCR(distribution, 20);
    expect(result).toContain(1);
    expect(result).toContain(3);
    expect(result).not.toContain(0);
  });

  it('should respect maxPages limit', () => {
    const distribution = Array(50).fill(10); // all pages low
    const result = getPagesNeedingOCR(distribution, 5);
    expect(result).toHaveLength(5);
  });

  it('should sort by lowest content first', () => {
    const distribution = [50, 10, 30]; // all low, sorted: 10(idx1), 30(idx2), 50(idx0)
    const result = getPagesNeedingOCR(distribution, 3);
    expect(result[0]).toBe(1); // lowest content first
  });
});

describe('quickOCRCheck', () => {
  it('should return true for low density', () => {
    expect(quickOCRCheck('short', 10)).toBe(true);
  });

  it('should return false for good density', () => {
    const goodText = 'x'.repeat(5000);
    expect(quickOCRCheck(goodText, 5)).toBe(false);
  });
});
```

**Phase 2 : CI/CD GitHub Actions**

**Fichier a creer** : `.github/workflows/test.yml`

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm test

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
```

### Dependances

- Les tests pour `updateFactsInMemory` dependent de la correction **F44** (immutabilite).
- Les tests de hash dependent de la correction **F42**.

### Verification

1. `npm test` doit passer avec tous les tests.
2. `npx vitest --coverage` doit montrer une couverture > 0% sur les fichiers testes.
3. Push sur GitHub : la CI doit lancer les tests automatiquement.

---

<a name="f48"></a>
## F48 - Zero chiffrement applicatif des pitch decks

### Diagnostic

**Schema Prisma** (`prisma/schema.prisma`, lignes 116-146) :

```prisma
model Document {
  // ...
  extractedText    String?  @db.Text    // TEXTE EN CLAIR
  ocrText          String?  @db.Text    // TEXTE OCR EN CLAIR
  // ...
}
```

```prisma
model FactEvent {
  // ...
  value               Json               // VALEURS EN CLAIR
  displayValue        String             // EN CLAIR
  extractedText       String?  @db.Text  // EN CLAIR
  // ...
}
```

Tous les textes extraits des documents sont stockes en clair dans PostgreSQL (Neon). Les donnees financieres sensibles (ARR, valorisation, cap table) transitent aussi en clair via OpenRouter vers les modeles LLM.

**Impact** :
- Une fuite de la DB expose tout le contenu des pitch decks
- Les donnees financieres des startups sont lisibles directement
- Neon a ses propres protections (encryption at rest TLS), mais pas de chiffrement applicatif

### Correction

**Principe** : Chiffrement AES-256-GCM au niveau applicatif pour le texte extrait. Dechiffrement a la volee avant envoi aux agents. La cle de chiffrement est stockee dans une variable d'environnement.

**Fichier a creer** : `src/lib/encryption.ts`

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * Must be set in .env.local and Vercel env vars.
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "DOCUMENT_ENCRYPTION_KEY is not set. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (keyHex.length !== 64) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt text using AES-256-GCM.
 * Returns: base64(iv + authTag + ciphertext)
 */
export function encryptText(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt text encrypted with encryptText().
 * Returns the original plaintext.
 */
export function decryptText(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encryptedBase64, "base64");

  // Unpack: iv (12) + authTag (16) + ciphertext
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Check if a string is encrypted (heuristic: valid base64 with min length).
 * Used during migration to handle mixed encrypted/plaintext data.
 */
export function isEncrypted(text: string): boolean {
  if (text.length < IV_LENGTH + AUTH_TAG_LENGTH) return false;
  try {
    const buf = Buffer.from(text, "base64");
    // Check if base64 round-trips correctly and has minimum packed size
    return buf.toString("base64") === text && buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Safely decrypt: returns plaintext if encrypted, original text if not.
 * Used during migration period when some records may not be encrypted yet.
 */
export function safeDecrypt(text: string): string {
  if (!isEncrypted(text)) return text;
  try {
    return decryptText(text);
  } catch {
    // If decryption fails, assume it's plaintext
    return text;
  }
}
```

**Points d'integration** (modifications a faire dans les fichiers existants) :

1. **Upload/processing** (`src/app/api/documents/upload/route.ts` et `src/app/api/documents/[documentId]/process/route.ts`) : Chiffrer `extractedText` avant `prisma.document.update()`.

```typescript
import { encryptText } from "@/lib/encryption";

// Avant de sauvegarder :
const encryptedText = extractedText ? encryptText(extractedText) : null;
await prisma.document.update({
  where: { id: documentId },
  data: {
    extractedText: encryptedText,
    // ...
  },
});
```

2. **Lecture par les agents** (`src/agents/orchestrator/persistence.ts`, fonction `getDealWithRelations`) : Dechiffrer a la lecture.

```typescript
import { safeDecrypt } from "@/lib/encryption";

export async function getDealWithRelations(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { documents: { /* ... */ }, founders: true },
  });

  if (!deal) return null;

  // Decrypt extracted text for each document
  deal.documents = deal.documents.map(doc => ({
    ...doc,
    extractedText: doc.extractedText ? safeDecrypt(doc.extractedText) : null,
  }));

  return deal;
}
```

3. **OCR** (`src/services/pdf/ocr-service.ts`) : Chiffrer le texte OCR avant stockage.

**Migration** : Les documents existants en clair devront etre migres via un script one-time :

```typescript
// Script de migration (a executer une fois)
import { prisma } from "@/lib/prisma";
import { encryptText, isEncrypted } from "@/lib/encryption";

async function migrateDocuments() {
  const docs = await prisma.document.findMany({
    where: { extractedText: { not: null } },
    select: { id: true, extractedText: true },
  });

  for (const doc of docs) {
    if (!doc.extractedText || isEncrypted(doc.extractedText)) continue;

    const encrypted = encryptText(doc.extractedText);
    await prisma.document.update({
      where: { id: doc.id },
      data: { extractedText: encrypted },
    });
  }

  console.log(`Migrated ${docs.length} documents`);
}
```

**Variable d'environnement a ajouter** :

```
# .env.local
DOCUMENT_ENCRYPTION_KEY=<64-char-hex-string>
```

### Dependances

- Aucune dependance sur les autres failles.
- **Attention** : Le chiffrement/dechiffrement ajoute un overhead CPU. Pour les documents tres volumineux (>100K chars), l'impact est negligeable (<10ms).
- **Critique** : La cle ne doit JAMAIS etre commitee dans le code. Utiliser Vercel env vars.
- Les donnees envoyees aux LLMs via OpenRouter restent en clair (necessaire pour l'analyse). Le chiffrement protege uniquement le stockage en DB.

### Verification

1. Test unitaire pour `encryptText` / `decryptText` :
```typescript
const original = "Donnees financieres sensibles: ARR 2M EUR";
const encrypted = encryptText(original);
expect(encrypted).not.toBe(original);
expect(decryptText(encrypted)).toBe(original);
```
2. Uploader un document, verifier en DB que `extractedText` est du base64 et non du texte lisible.
3. Lancer une analyse : verifier que les agents recoivent le texte dechiffre correctement.
4. Tester `safeDecrypt` avec du texte non chiffre (backward compatibility).

---

<a name="f49"></a>
## F49 - Scalabilite non concue pour le volume

### Diagnostic

**Architecture actuelle** :
1. `POST /api/analyze` (sans `maxDuration`) lance `orchestrator.runAnalysis()` en fire-and-forget dans le meme contexte serverless.
2. L'orchestrateur execute 15-25 agents sequentiellement/en parallele dans la meme invocation.
3. Chaque agent fait 1-3 appels LLM. Une analyse complete = 20-50 appels LLM.
4. Rate limiter en memoire (`checkRateLimit` dans `src/lib/sanitize.ts`) : non partage entre instances serverless.

**Inngest existe** (`src/lib/inngest.ts`) mais n'est utilise que pour la maintenance DB (cleaner, sourcer, completer). L'analyse de deals n'utilise PAS Inngest.

**Problemes a 100 deals/jour** :
- 100 deals x 30 LLM calls = 3000 appels/jour sur une seule instance OpenRouter
- Rate limiter en memoire = chaque instance serverless a son propre compteur
- Pas de queue : toutes les analyses sont synchrones dans le request handler
- Pas de retry intelligent : si un agent echoue, il faut relancer toute l'analyse

### Correction

**Phase 1 (Quick Wins)** : `maxDuration` + rate limiter persistant.

1. `maxDuration` : voir F46 ci-dessus (deja corrige).

2. Rate limiter persistant via DB au lieu d'in-memory :

**Fichier a modifier** : `src/app/api/analyze/route.ts`

Le rate limiter actuel (`checkRateLimit`) est in-memory. Le remplacer par le check transactionnel deja present (lignes 100-134) suffit pour eviter les double analyses. Pour le rate limiting global, utiliser un compteur DB :

```typescript
// Remplacer le checkRateLimit in-memory (lignes 54-67) par :

// Rate limiting via DB: check recent analyses count for this user
const recentAnalyses = await prisma.analysis.count({
  where: {
    deal: { userId: user.id },
    createdAt: { gte: new Date(Date.now() - 60000) }, // last minute
  },
});

if (recentAnalyses >= 5) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}
```

**Phase 2 (Inngest Integration)** : Decouplage via job queue.

L'infrastructure Inngest est deja en place. L'objectif est de deplacer l'analyse dans une Inngest function avec des steps par tier.

**Fichier a modifier** : `src/lib/inngest.ts`

```typescript
// === AJOUT : Fonction Inngest pour l'analyse de deals ===

import { orchestrator, type AnalysisType } from "@/agents";

/**
 * DEAL ANALYSIS via Inngest
 * Decouple l'analyse du request handler.
 * Chaque tier est un step separe pour resilience et observabilite.
 */
export const dealAnalysisFunction = inngest.createFunction(
  {
    id: 'deal-analysis',
    name: 'Deal Analysis',
    retries: 1,
    // Concurrency: max 3 analyses simultanées par user
    concurrency: [{
      key: "event.data.userId",
      limit: 3,
    }],
  },
  { event: 'analysis/deal.analyze' },
  async ({ event, step }) => {
    const { dealId, type, enableTrace, userPlan, analysisId } = event.data as {
      dealId: string;
      type: AnalysisType;
      enableTrace: boolean;
      userPlan: string;
      analysisId?: string;
    };

    // Run the analysis (orchestrator handles its own persistence)
    const result = await step.run('run-analysis', async () => {
      return await orchestrator.runAnalysis({
        dealId,
        type,
        enableTrace,
        userPlan: userPlan as "FREE" | "PRO",
      });
    });

    return result;
  }
);

// Ajouter a l'export
export const functions = [cleanerFunction, sourcerFunction, completerFunction, dealAnalysisFunction];
```

**Fichier a modifier** : `src/app/api/analyze/route.ts`

Remplacer le fire-and-forget par un envoi d'evenement Inngest :

```typescript
// === REMPLACEMENT du fire-and-forget (lignes 163-193) ===

// AVANT :
orchestrator.runAnalysis({ ... }).then(...).catch(...);

// APRES :
import { inngest } from "@/lib/inngest";

await inngest.send({
  name: "analysis/deal.analyze",
  data: {
    dealId,
    type: effectiveType,
    enableTrace,
    userPlan: effectivePlan,
    userId: user.id,
  },
});
```

**Phase 3 (Chunking avance)** : Decouplage par tier dans Inngest steps.

```typescript
// Version avancee avec steps par tier :
export const dealAnalysisFunction = inngest.createFunction(
  { id: 'deal-analysis', name: 'Deal Analysis', retries: 1 },
  { event: 'analysis/deal.analyze' },
  async ({ event, step }) => {
    const { dealId, type, enableTrace, userPlan } = event.data;

    // Step 1: Tier 0 - Fact Extraction
    const tier0Result = await step.run('tier0-extraction', async () => {
      // ... extraction logic ...
    });

    // Step 2: Document Extraction
    const extractionResult = await step.run('document-extraction', async () => {
      // ... document-extractor agent ...
    });

    // Step 3: Tier 1 - Analysis (parallel phases inside step)
    const tier1Result = await step.run('tier1-analysis', async () => {
      // ... 13 Tier 1 agents in phases ...
    });

    // Step 4: Tier 2 - Sector Expert (if full analysis)
    if (type === 'full_analysis') {
      const tier2Result = await step.run('tier2-sector', async () => {
        // ... sector expert ...
      });
    }

    // Step 5: Tier 3 - Synthesis (if full analysis)
    if (type === 'full_analysis') {
      const tier3Result = await step.run('tier3-synthesis', async () => {
        // ... 5 Tier 3 agents ...
      });
    }

    return { success: true };
  }
);
```

### Dependances

- **F46** (`maxDuration`) : prerequis.
- Inngest doit etre configure en production (Vercel integration existante).
- Le rate limiter DB remplace le rate limiter in-memory : verifier qu'il n'y a pas d'autre usage de `checkRateLimit` pour l'analyse.

### Verification

1. Lancer 5 analyses en parallele : le rate limiter DB doit bloquer la 6eme.
2. Via Inngest dashboard : verifier que les steps s'executent correctement.
3. Simuler un crash apres le Step 2 : la reprise doit etre possible via les checkpoints existants.
4. Mesurer le temps total : pas de regression vs le fire-and-forget.

---

<a name="f58"></a>
## F58 - OCR gameable (20 pages max)

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/services/pdf/ocr-service.ts`

```typescript
// Ligne 43
const MAX_PAGES_TO_OCR = 20;

// Ligne 80
const pagesToProcess = pageIndices.slice(0, MAX_PAGES_TO_OCR);
```

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/services/pdf/quality-analyzer.ts`

```typescript
// Lignes 403-420
export function getPagesNeedingOCR(
  pageContentDistribution: number[],
  maxPages: number = 20
): number[] {
  const lowContentPages: { index: number; chars: number }[] = [];

  for (let i = 0; i < pageContentDistribution.length; i++) {
    if (pageContentDistribution[i] < MIN_CHARS_PER_PAGE) {  // < 200 chars
      lowContentPages.push({ index: i, chars: pageContentDistribution[i] });
    }
  }

  // Sort by lowest content first (prioritize emptiest pages)
  lowContentPages.sort((a, b) => a.chars - b.chars);

  // Return indices, limited to maxPages
  return lowContentPages.slice(0, maxPages).map(p => p.index);
}
```

**Problemes** :
1. **Tri par contenu le plus bas** : Les pages completement vides (decoratives, cover, separateurs) sont traitees en priorite. Ces pages ne contiennent souvent aucune info utile.
2. **Pas de detection de pages financieres** : Une page avec un tableau financier qui n'a pas ete extrait (image) a la meme priorite qu'une page de cover.
3. **Budget gaspille** : Les 20 premieres pages OCR sont les plus vides, pas les plus utiles.
4. **Limitation fixe a 20** : Un deck de 50 pages avec 30 pages de contenu utile mais image-based n'en traitera que 20.

### Correction

**Principe** : Prioriser les pages qui ont le plus de chance de contenir des donnees financieres/tableaux. Detecter les pages decoratives (cover, dividers, thank you) pour les exclure.

**Fichier a modifier** : `src/services/pdf/quality-analyzer.ts`

```typescript
// === REMPLACEMENT de getPagesNeedingOCR (lignes 403-420) ===

/**
 * Page priority scores for OCR.
 * Higher score = higher priority for OCR processing.
 */
interface PageOCRPriority {
  index: number;
  chars: number;
  priority: number;
  reason: string;
}

/**
 * Get prioritized list of pages needing OCR.
 * Prioritizes pages likely to contain financial data/tables over decorative pages.
 *
 * Priority logic:
 * 1. Pages with some text containing financial keywords but low char count (likely tables as images)
 * 2. Pages in the middle of the document (more likely to be content)
 * 3. Pages that are completely empty (may be image-only slides with charts)
 * 4. First/last pages are deprioritized (usually cover/thank you)
 *
 * @param pageContentDistribution - Characters per page array
 * @param maxPages - Maximum pages to return (default 20)
 * @param existingText - Already extracted text (for keyword detection per page)
 * @returns Prioritized array of page indices (0-indexed)
 */
export function getPagesNeedingOCR(
  pageContentDistribution: number[],
  maxPages: number = 20,
  existingText?: string
): number[] {
  const totalPages = pageContentDistribution.length;
  if (totalPages === 0) return [];

  // Financial/table keywords that suggest high-value content
  const FINANCIAL_KEYWORDS = [
    'revenue', 'arr', 'mrr', 'ebitda', 'margin', 'growth',
    'forecast', 'projection', 'budget', 'cost', 'expense',
    'customer', 'churn', 'ltv', 'cac', 'cohort', 'unit',
    'cap table', 'valuation', 'dilution', 'round', 'funding',
    'total', 'q1', 'q2', 'q3', 'q4', 'fy', 'ytd',
    '2023', '2024', '2025', '2026',
  ];

  // Decorative page indicators (low value for OCR)
  const DECORATIVE_KEYWORDS = [
    'thank you', 'merci', 'contact', 'appendix', 'annexe',
    'confidential', 'confidentiel', 'disclaimer',
  ];

  // Split existing text into approximate per-page chunks for keyword matching
  const pageTexts: string[] = [];
  if (existingText) {
    const sections = existingText.split(/\n{3,}|\f/);
    const groupSize = Math.max(1, Math.ceil(sections.length / totalPages));
    for (let i = 0; i < totalPages; i++) {
      const start = i * groupSize;
      const end = Math.min(start + groupSize, sections.length);
      pageTexts.push(sections.slice(start, end).join('\n').toLowerCase());
    }
  }

  const priorities: PageOCRPriority[] = [];

  for (let i = 0; i < totalPages; i++) {
    const chars = pageContentDistribution[i];

    // Skip pages with good text extraction (>= 200 chars)
    if (chars >= MIN_CHARS_PER_PAGE) continue;

    let priority = 50; // Base priority
    let reason = "low-content";

    const pageText = pageTexts[i] || "";

    // BOOST: Pages with some financial keywords (partial extraction of tables)
    const financialKeywordCount = FINANCIAL_KEYWORDS.filter(kw =>
      pageText.includes(kw)
    ).length;
    if (financialKeywordCount > 0) {
      priority += financialKeywordCount * 15;
      reason = `financial-keywords(${financialKeywordCount})`;
    }

    // BOOST: Pages with numbers/percentages (likely data tables)
    const numberDensity = (pageText.match(/\d+[%€$KMB,.]?\d*/g) || []).length;
    if (numberDensity > 3) {
      priority += Math.min(numberDensity * 5, 30);
      reason += `,numbers(${numberDensity})`;
    }

    // BOOST: Middle pages are more likely content (not cover/end)
    const relativePosition = i / Math.max(totalPages - 1, 1);
    if (relativePosition > 0.1 && relativePosition < 0.9) {
      priority += 10; // Middle of document
    }

    // PENALTY: First page (usually cover)
    if (i === 0) {
      priority -= 30;
      reason += ",cover-likely";
    }

    // PENALTY: Last page (usually thank you / contact)
    if (i === totalPages - 1) {
      priority -= 25;
      reason += ",end-page";
    }

    // PENALTY: Decorative keywords detected
    const isDecorative = DECORATIVE_KEYWORDS.some(kw => pageText.includes(kw));
    if (isDecorative) {
      priority -= 20;
      reason += ",decorative";
    }

    // PENALTY: Completely empty with no extracted text at all
    // (may be a blank separator or decorative full-bleed image)
    if (chars === 0 && pageText.length === 0) {
      priority -= 10;
      reason += ",empty";
    }

    priorities.push({ index: i, chars, priority, reason });
  }

  // Sort by priority DESC (highest priority first)
  priorities.sort((a, b) => b.priority - a.priority);

  // Return top maxPages indices
  return priorities.slice(0, maxPages).map(p => p.index);
}
```

**Fichier a modifier** : `src/services/pdf/ocr-service.ts`

Passer le texte existant a `getPagesNeedingOCR` pour la detection de keywords :

```typescript
// === MODIFICATION dans smartExtract() (ligne 351) ===

// AVANT :
const pagesToOCR = getPagesNeedingOCR(pageDistribution, maxOCRPages);

// APRES :
const pagesToOCR = getPagesNeedingOCR(
  pageDistribution,
  maxOCRPages,
  regularResult.text  // Pass existing text for keyword-based prioritization
);
```

**Fichier a modifier** : `src/services/pdf/ocr-service.ts` - augmenter la limite pour les documents financiers

```typescript
// === MODIFICATION ligne 43 ===

// AVANT :
const MAX_PAGES_TO_OCR = 20;

// APRES :
const MAX_PAGES_TO_OCR = 30; // Augmente de 20 a 30 pour meilleure couverture

// === AJOUT : Limite dynamique basee sur le type de document ===
export function getMaxOCRPages(documentType?: string): number {
  switch (documentType) {
    case 'FINANCIAL_MODEL':
    case 'FINANCIAL_STATEMENTS':
      return 40; // Financial docs need more OCR coverage
    case 'PITCH_DECK':
      return 30;
    default:
      return MAX_PAGES_TO_OCR;
  }
}
```

### Dependances

- La signature de `getPagesNeedingOCR` change (ajout du parametre optionnel `existingText`). Les appelants existants continuent de fonctionner (parametre optionnel).
- Les tests existants de `getPagesNeedingOCR` doivent etre mis a jour pour le nouveau comportement de tri.

### Verification

1. Test unitaire :
```typescript
const distribution = [0, 50, 300, 10, 400, 50];
// Page 0 (cover), 1 (some content), 3 (almost empty), 5 (some content)
// Old behavior: would sort [0, 3, 1, 5] (emptiest first)
// New behavior: page 0 penalized (cover), page 3 deprioritized if no keywords
const result = getPagesNeedingOCR(distribution, 4, "revenue growth... q1 q2");
expect(result[0]).not.toBe(0); // Cover page should not be first
```
2. Uploader un pitch deck image-heavy de 30+ pages.
3. Verifier que les pages OCR traitees contiennent plus de contenu financier que le tri precedent.
4. Verifier que la page de couverture et la page "Thank you" sont en bas de priorite.

---

## Resume des corrections

| Faille | Fichiers modifies | Complexite | Risque |
|--------|-------------------|------------|--------|
| F42 | `base-agent.ts`, `types.ts` | Faible | Faible |
| F44 | `current-facts.ts`, `orchestrator/index.ts` | Faible | Moyen (regression immutabilite) |
| F45 | `orchestrator/persistence.ts` | Faible | Faible |
| F46 | `api/analyze/route.ts`, `analyses/route.ts`, nouveau `stream/route.ts` | Moyen | Moyen |
| F47 | Nouveaux fichiers `__tests__/`, `.github/workflows/` | Moyen | Faible |
| F48 | Nouveau `lib/encryption.ts`, `persistence.ts`, `upload/route.ts` | Eleve | Eleve (migration, perf) |
| F49 | `inngest.ts`, `api/analyze/route.ts` | Eleve | Moyen (changement archi) |
| F58 | `quality-analyzer.ts`, `ocr-service.ts` | Moyen | Faible |

## Ordre d'implementation recommande

1. **F45** (erreurs silencieuses) - Quick win, zero risque, ameliore le debugging
2. **F42** (prompt version) - Quick win, zero risque, ameliore la tracabilite
3. **F44** (immutabilite facts) - Correction de bug, impact localise
4. **F46** (maxDuration + SSE) - Phase 1 critique pour Vercel (maxDuration)
5. **F58** (OCR prioritisation) - Amelioration qualite, pas de breaking change
6. **F47** (tests) - Infrastructure qualite, depend de F42 et F44
7. **F49** (Inngest analysis) - Changement architectural, necessite F46
8. **F48** (chiffrement) - Le plus complexe, necessite migration de donnees
