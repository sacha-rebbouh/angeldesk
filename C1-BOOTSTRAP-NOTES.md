# C.1 — Notes d'exécution : extraire `initializeFullAnalysisRun`

> Document versionné (repo), à auditer par Codex. La reprise NE doit PAS dépendre de
> la mémoire Claude ni de `/tmp` (volatiles). Tout ce qui est nécessaire à C.1 est ici.
>
> Pré-requis lus avant édition : `git status` propre + `npx tsc --noEmit` = 0.
> Édition via codemod Node (octets disque), PAS Edit multi-lignes (l'affichage Read a
> masqué/garblé du contenu lors de sessions précédentes). `git commit` dans un appel
> SÉPARÉ, APRÈS avoir lu `tsc = 0` (3 commits tsc=1 évités de justesse en session #5).

## Contexte
Fix C (split durable du Deep Dive). Étape B validée par Codex. HEAD branche
`fix/thesis-gate-guard` = `2a88a0e` (NON poussé ; `origin/fix/thesis-gate-guard` =
`de02b77`, `origin/main` = `ff87da4`). C.1 = **refactor byte-inert** : extraire le
bootstrap de `runFullAnalysis` dans une méthode privée `initializeFullAnalysisRun`,
qui RETOURNE un objet typé ; `runFullAnalysis` l'appelle puis continue dans le **même
ordre**. Aucun changement de logique, de prompt, de schéma, d'agent. Pas d'Inngest,
pas de flag `DEEP_DIVE_STEPWISE`, pas de découpe Tier1/Tier3 (= C.2+).

## Frontière exacte (décision Sacha, option 1)
Dans `runFullAnalysis` (méthode = lignes ~1408→2463 ; **re-vérifier** les numéros, le
fichier évolue) :

- **EXTRAIRE** le bloc bootstrap **AVANT le `try`** : de la déstructuration
  `const { … } = advancedOptions;` (~1414) jusqu'à `let founderResponses … = [];`
  (~1499) INCLUS.
- **NE PAS extraire** (restent dans le `try` de `runFullAnalysis`, pour préserver
  exactement la frontière try/catch actuelle) :
  - `await stateMachine.start();`
  - `loadEvidenceContextSafe(dealId)`
  - `baseContext`
  - `STEP 0: TIER 0 FACT EXTRACTION` et toute la suite du pipeline.
- Une éventuelle extraction d'`evidence + baseContext` sera une **micro-étape C.1b
  séparée** (appelée DANS le `try`), auditée à part. Hors scope C.1.

## Ancres codemod
- **Début** : `    } = advancedOptions;` — confirmé **unique** (count=1) en session #5.
- **Fin** : la ligne `let founderResponses: Array<{ questionId: string; question:
  string; answer: string; category: string }> = [];` apparaît **2 fois** dans le
  fichier (≈735 dans une autre méthode, et ≈1498 dans `runFullAnalysis`).
  ⚠️ **NE PAS l'utiliser comme ancre de chaîne globale.** Scoper le remplacement à
  la plage de lignes de `runFullAnalysis` (calculer ses bornes par
  `private async runFullAnalysis` → prochaine `(private )?async <méthode>`), OU couper
  par index de ligne dans cette plage.
- **Repère post-bootstrap** (doit rester dans `runFullAnalysis`, count=1) :
  `      await stateMachine.start();`.

## Locals produits par le bootstrap et consommés APRÈS la frontière
(`runFullAnalysis` les utilise plus bas → ils DOIVENT être dans le type de retour de
`initializeFullAnalysisRun`. Compteurs d'usages post-1499 relevés en session #5 ;
**re-scanner** pour confirmer avant de coder.)

**Const à retourner** :
`failFastOnCritical, maxCostUsd, onEarlyWarning, isUpdate, enableTrace,
stopAfterThesis, analysisModeOverride, startTime, initialCanonicalDeal, sectorExpert,
TOTAL_AGENTS, corpusSnapshot, scopedDocuments, analysis, stateMachine`.

**`let` mutables à retourner** (réassignés ensuite dans `runFullAnalysis` → les
ré-extraire en `let` côté appelant) :
`collectedWarnings, allResults, totalCost, completedCount, factStore,
factStoreFormatted, founderResponses`.

**NE PAS exposer** (internes au bootstrap, 0 usage après 1499) :
`initialFactStore, hasSectorExpert, tier3AgentCount, documentIds`.

**Reste un paramètre** (pas produit par le bootstrap) : `onProgress` — déjà argument
de `runFullAnalysis`, ne passe pas par le retour du helper.

## Type de retour
Définir une interface explicite (PAS `any`, PAS un objet large non typé), ex.
`FullAnalysisRunInit`, listant exactement les const + les `let` ci-dessus. Le helper
construit l'`analysis`, la `stateMachine` (+ `onStateChange`), appelle
`setAnalysisContext(analysis.id)`, `costMonitor.startAnalysis(...)`, `messageBus.clear()`
dans l'ordre actuel, et renvoie l'objet.

## Vérifs avant commit (ordre strict)
1. `npx tsc --noEmit` dans un appel — **lire** = 0.
2. `npx vitest run --config vitest.unit.config.ts src/agents/orchestrator` — vert.
3. `git diff` court montrant un **déplacement** (le corps extrait = identique, juste
   déplacé + un appel + une déstructuration du retour). Pas de changement de logique.
4. `git commit` dans un appel **séparé**, après lecture de (1).

## Stop
Arrêt après C.1 pour audit Codex. Ne pas commencer C.2. Ne rien pousser tant que C.1
n'est pas audité.
