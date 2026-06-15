# Changes Log - Angel Desk

---
## 2026-06-15 — Dé-scorisation — P5-b.2 — purge ConditionsAnalystData.score (Option B, cast Record legacy)

### Fichiers
- `src/agents/types.ts` : `ConditionsAnalystData` — `score?: AgentScore` retiré + commentaire P5-b.
- `src/agents/type-modules/tier3.ts` : `ConditionsAnalystData` (one-liner) — idem.
- `src/services/terms-normalization.ts` : fallback legacy `conditionsBreakdown` — lecture `score.breakdown` (criterion + justification) passée d'un accès typé à un cast `Record` étroit.

### Description
**Chantier dé-scorisation, P5-b.2 (gaté Codex APPROVE, Option B arbitrée — sans REQUEST_CHANGES).** Purge du champ de note `score` côté conditions. **Fork de périmètre tranché par Codex** : `ConditionsAnalystData.score` avait UN lecteur typé vivant (le fallback legacy `terms-normalization.ts` qui lit `score.breakdown` criterion/justification pour les snapshots conditions pré-P4). Option B retenue (vs A garder le champ / C drop le fallback) : retirer le champ du type + lire le fallback via cast `Record` étroit → compat snapshot historique préservée (libellés qualitatifs, jamais value/grade), runtime byte-équivalent. Producteur n'émet plus de `score` top-level depuis P4-b2 ; seuls `trancheAssessments[].score` (LARGE-différé) subsistent. `AgentScore` import non orphelin (ContradictionDetector/DevilsAdvocate). **Pas de bump `STEPWISE_GRAPH_VERSION`** (purge de type, bytes runtime inchangés). **P5-b COMPLET** (b.1 synthèse + b.2 conditions). tsc 0 (lu directement) ; suite unit complète 4502 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-b.1 — purge des champs de note du type SynthesisDealScorerData (synthèse)

### Fichiers
- `src/agents/type-modules/tier3.ts` : `SynthesisDealScorerData` (one-liner) — 5 champs de note retirés (`overallScore`, `confidence`, `dimensionScores`, `scoreBreakdown`, `comparativeRanking`) ; commentaire P4→P5-b.
- `src/agents/types.ts` : même def — 5 champs + commentaire mis à jour.
- `src/agents/tier3/synthesis-deal-scorer.ts` : même def — 5 champs + bloc commentaire fusionné avec la doc `verdict`.

### Description
**Chantier dé-scorisation, P5-b.1 (gaté Codex APPROVE, sans REQUEST_CHANGES).** Purge des 5 champs de note de deal devenus OPTIONNELS en P4-a, côté synthèse uniquement. **Zéro lecteur typé** : `tier3-results.tsx` (seul consumer UI) scoreless depuis P3 ; producteur `transformResponse` ne les set plus (P4-a) ; `analysis-delta`/`analysis-variance` lisent via leur propre type local lâche (cluster différé, interne) ; scrubber `signal-profile` via clone `Record` ; `early-warnings` `field: "overallScore"` = littéral string consommé dynamiquement (règle inerte). Snapshots historiques lus défensivement (cast `Record`), jamais via ce type. **Hors périmètre** (micro-steps séparés) : `ConditionsAnalystData.score` (bi-reader vivant `terms-normalization.ts:85` → P5-b.2), règle early-warning inerte, mock Prisma `base-agent-date-rendering.test.ts` (→ P5-c), `SynthesisDealScorerDataV2`. **Pas de bump `STEPWISE_GRAPH_VERSION`** (purge de type, bytes runtime inchangés). tsc 0 (lu directement) ; suite unit complète 4502 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-a.4 — read-model core scoreless (P5-a bascule readers COMPLET)

### Fichiers
- `src/services/deals/analysis-signal-summary.ts` (−36) : moitié SCORES retirée (`AnalysisSignalSummaryData.scores`, `computeAnalysisSignalSummary`, `SummaryRow`, `rowToData`, `select` `readAnalysisSignalSummaries`, write `upsert`). **`extractedInfo` (sector/stage/instrument/geo/description) ENTIÈREMENT CONSERVÉ** (moitié live).
- `src/services/analysis-results/score-extraction.ts` (−90) : `extractAnalysisScores` + interface `AnalysisScores` + helper `normalizeDimensionLabel` SUPPRIMÉS. `extractCanonicalExtractedInfo` + `CanonicalExtractedInfo` + `isRecord`/`readString` conservés.
- `src/services/funding-db/percentile-calculator.ts` SUPPRIMÉ (`calculateDealPercentile` = percentile-DE-score, orphelin en prod — bloc F37 retiré en P4-a, aucun import production) + son test ; 2 `vi.mock` morts retirés (agent-pipeline + sequential-pipeline).
- Test `analysis-signal-summary.test.ts` : assertions de score retirées, couverture `extractedInfo` conservée.

### Description
**Chantier dé-scorisation, P5-a.4 (gaté Codex APPROVE, sans REQUEST_CHANGES) — clôt P5-a (bascule readers).** Le cœur du read-model ne calcule/stocke/lit plus de note. **Durabilité (validée Codex)** : colonnes `AnalysisSignalSummary.*Score` restent en DB jusqu'à P5-c (drop confirmé) ; **pas de bump `CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION`** (la moitié `extractedInfo` cachée est inchangée → vieux rows valides en lecture ; scores simplement ignorés). Pas de bump `STEPWISE_GRAPH_VERSION`. `extractAnalysisScores`/`AnalysisScores`/`calculateDealPercentile` totalement absents (reste 1 commentaire historique). **P5-a COMPLET** : a.1 chat, a.2 canonical deal-fields, a.3 terms/conditions, a.4 read-model core. tsc 0 (lu directement) ; suite unit complète 4502 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-a.3 — bascule des readers du cluster TERMS/CONDITIONS off conditionsScore

### Fichiers
- `src/services/terms-normalization.ts` : `buildTermsResponse` perd le param positionnel `conditionsScore` + le champ `conditionsScore` du retour (`conditionsBreakdown`/`dimensionAssessment` verbal conservé).
- `src/app/api/deals/[dealId]/terms/route.ts` : 3 callers mis à jour ; `select` Deal.{globalScore (mort), conditionsScore} retiré (GET) ; write `conditionsScore` du `dealTermsVersion.create` retiré ; write neutralisé `conditionsScore: null` du `Deal.update` retiré.
- `src/app/(dashboard)/deals/[dealId]/page.tsx` : lecture `deal.conditionsScore` retirée + `conditionsScore` ajouté à l'`omit` `getDeal`.
- `src/app/api/deals/[dealId]/terms/versions/route.ts` : `select` + sortie `DealTermsVersion.conditionsScore` retirés.
- `src/agents/orchestrator/persistence.ts` : write neutralisé `conditionsScore: null` (case `conditions-analyst`) retiré.
- `src/components/deals/conditions/types.ts` : `conditionsScore` retiré de `TermsResponse` + `TermsVersionData` (0 consumer client).
- 5 `omit` (deals/route, deals/[dealId]/route, deals/page, deals/[dealId]/page, dashboard) : `conditionsScore` ajouté (note Codex a.2 — couvre aussi les `include` + spread sans lecture explicite).

### Description
**Chantier dé-scorisation, P5-a.3 (gaté Codex APPROVE, sans REQUEST_CHANGES).** 3e micro-step de P5 : le cluster terms/conditions ne lit/écrit plus `conditionsScore` (Deal.conditionsScore + DealTermsVersion.conditionsScore). UI déjà scoreless depuis G4 (carry mort) ; le verbal `conditionsBreakdown`/`dimensionAssessment` reste. **Scope P5-c confirmé par Codex** : DROP aussi `DealTermsVersion.conditionsScore` (snapshot de note mort, comme `Deal.conditionsScore` + `AnalysisSignalSummary.*Score`). Conservé : guard `user/export` (asserte l'absence). **Différé à P5-b** : mock full-Deal `base-agent-date-rendering.test.ts` (porte les 7 scores). Colonnes encore en schema ; drop = P5-c → `omit` retirés à ce moment. **Pas de bump `STEPWISE_GRAPH_VERSION`**. tsc 0 (lu directement) ; suite unit complète 4506 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-a.2 — bascule des readers du cluster CANONICAL DEAL-FIELDS off Deal.*Score

### Fichiers
- `src/services/deals/canonical-read-model.ts` (cœur, −53) : `CanonicalFieldFallbacks` (= `CanonicalDealFields`) 5 champs de score retirés ; `CanonicalDealSignals.analysisScoresByDealId` retiré + son build dans `loadCanonicalDealSignals` (early-return vide + chemin nominal) ; **`extractedInfoByDealId` CONSERVÉ** (live : sector/stage/geo) ; fonction `resolveCanonicalAnalysisScores` SUPPRIMÉE (0 caller) ; `resolveCanonicalDealFields` `const scores` + 5 sorties retirés ; import `type AnalysisScores` retiré.
- 5 consumers (retrait des args fallback de score lus depuis `deal.*Score` + sorties ; ajout d'un `omit` Prisma des 6 colonnes note global/dimension pour fermer la fuite `include` + spread `...deal`) : `api/deals/route.ts` (utilisait `resolveCanonicalAnalysisScores` + mapping → import retiré), `api/deals/[dealId]/route.ts`, `(dashboard)/deals/page.tsx`, `(dashboard)/deals/[dealId]/page.tsx` (helper `getDeal`, `omit` de 6 — conditionsScore gardé pour a.3), `(dashboard)/dashboard/page.tsx`.
- `src/components/deals/types.ts` : `CanonicalDealListItem.globalScore` retiré (0 consumer UI post-E).
- Tests (suppression de couverture de SCORE uniquement) : `canonical-read-model.test.ts` (test obsolète `resolveCanonicalAnalysisScores` supprimé + I/O score retirés du test de résolution), `canonical-read-model-signal-summary.test.ts` (assertions `analysisScoresByDealId` retirées, équivalence cache hit/miss conservée via extractedInfo), `api/deals/route.test.ts` + `api/deals/[dealId]/route.test.ts` (mocks + assertions de score retirés).

### Description
**Chantier dé-scorisation, P5-a.2 (gaté Codex APPROVE après 1 REQUEST_CHANGES).** 2e micro-step de P5 : le read-model canonique (linchpin partagé par 5 surfaces) ne lit/restitue plus les colonnes de note global/dimension. **REQUEST_CHANGES Codex (correct, vérifié)** : `prisma.deal.findMany({ include })` sans `select` ramène TOUS les scalaires → `...deal` re-restituait `globalScore` etc. dans la réponse API même après retrait des reads explicites → ajout `omit` (6 colonnes) sur les 5 requêtes qui spreadent ; + correction du test détail `api/deals/[dealId]/route.test.ts` (contrat obsolète qui masquait la fuite). **Boundary** : `conditionsScore` = P5-a.3 (lectures explicites onglet Conditions) ; **note Codex pour a.3** : ajouter `conditionsScore` aux `omit` couvrira aussi les requêtes sans lecture explicite. Colonnes encore en schema (tsc vert) ; drop = P5-c → les `omit` seront retirés à ce moment. **Pas de bump `STEPWISE_GRAPH_VERSION`** (hors graphe durable). tsc 0 (lu directement) ; suite unit complète 4506 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-a.1 — bascule des readers du cluster CHAT off Deal.*Score (scoreless)

### Fichiers
- `src/agents/chat/context-retriever.ts` : 5 champs de score retirés de l'interface `DealInfo`, du `select` Prisma deal, du carry `DealInfo`, et du type+corps de `getLatestAnalysisMeta` (`scores: extractAnalysisScores(results)`) ; import `extractAnalysisScores` retiré (`loadResults` conservé).
- `src/services/chat-context/index.ts` : 5 champs de score retirés du `select` `getDealBasicInfo`, carry `canonicalDeal` collapsé (`const canonicalDeal = deal`), `scores` retiré de `getLatestAnalysisResults` (`results` conservé pour `hasResults`) ; import `extractAnalysisScores` retiré.
- `src/app/api/chat/[dealId]/route.ts` : 5 champs de score retirés des 2 objets construits pour l'agent (`dealInfo` + `deal`) ; `thesisGated` conservé (sanitizer).
- `src/agents/chat/deal-chat-agent.ts` : 5 champs de score optionnels retirés des 2 sous-objets de `FullChatContext` (`canonicalDeal` + `deal` alias legacy).
- `src/app/api/chat/[dealId]/__tests__/route.test.ts` + `src/agents/chat/__tests__/context-retriever.test.ts` : assertion `agentContext.deal.globalScore` + mocks de score obsolètes retirés (cluster grep-clean).

### Description
**Chantier dé-scorisation, P5-a.1 (gaté Codex APPROVE après 2 REQUEST_CHANGES).** 1er micro-step de P5 (bascule readers AVANT drop colonnes — colonnes encore en schema, tsc reste vert). Le cluster chat ne lit plus `Deal.*Score` ni `extractAnalysisScores` : champs structurés morts (LLM déjà scoreless depuis P3 + scrubbers G3). **Round 1→2 (finding Codex correct, vérifié tsc)** : le chat route reconstruisait `canonicalDeal.*Score` depuis `getDealBasicInfo` → ajout route + `FullChatContext` au périmètre. **Round 2→3** : mock `dealFindUnique` nettoyé (contrat « cluster fermé » = grep-clean). **Décisions Codex verrouillées pour la suite P5** : ordre a(readers)→b(types optionnels)→c(migration DROP)→cleanup ; DROP aussi `AnalysisSignalSummary.*Score` (même famille read-model) ; `calculateDealPercentile` supprimable dès a.4 (orphelin). **Pas de bump `STEPWISE_GRAPH_VERSION`** (hors graphe durable). tsc 0 (lu directement) ; 10 tests chat verts.

---
## 2026-06-15 — Dé-scorisation — P4-b4 — retrait du write de persistence inerte (synthesis → Deal.*Score) — P4 producteurs COMPLET

### Fichiers
- `src/agents/orchestrator/persistence.ts` : case `synthesis-deal-scorer` de `persistAgentResult` **retiré** (écrivait `Deal.{fundamentals,global,team,market,product,financials}Score` depuis `synthResult.data.overallScore` + `dimensionScores`). Inerte depuis P4-a (synthesis ne produit plus `overallScore` → garde `if (overallScore != null)` toujours faux). Remplacé par un commentaire (drop colonnes + readers = P5). Import `SynthesisDealScorerResult` retiré (orphelin).

### Description
**Chantier dé-scorisation, P4-b4 (gaté Codex APPROVE — clôt P4 producteurs).** Dernier nettoyage P4 : retrait du write DB mort. **P4 producteurs COMPLET** : b1 (team-investigator founder scores), b2 (conditions-analyst note + Option B dimensionAssessment), b3 (retrait deal-scorer Tier 0), b4 (persistence inerte). **Reporté à P5 (périmètre validé Codex)** : la PURGE des champs optionnels de note (synthesis `overallScore`/`dimensionScores`/`scoreBreakdown`/`comparativeRanking`/`confidence` ; conditions `score`) est entrelacée avec les lecteurs défensifs (`score-extraction`, `canonical-read-model`) + le drop des colonnes `Deal.*Score` → cluster P5, pas P4 (les retirer maintenant casserait les readers `?? null` et la compat snapshots). **Pas de bump `STEPWISE_GRAPH_VERSION`** (retrait d'un write inerte, aucun changement graphe/snapshot). tsc 0 ; persistence idempotence + salvage + progress-monotone = 32 verts.

---
## 2026-06-15 — Dé-scorisation — P4-b3 — retrait de l'agent deal-scorer Tier 0 (pur producteur de note)

### Fichiers
- **`src/agents/deal-scorer.ts` SUPPRIMÉ** : agent Tier 0 = PUR producteur de note de deal (scores global/team/market/product/financials/timing + breakdown + `percentileRanking` percentile-de-score + comparableDeals.score). Aucun findings/redFlags/narrative verbal à préserver. **Décision Codex : RETRAIT** (vs neutralisation, qui laisserait un agent vide).
- `src/agents/index.ts` + `src/agents/orchestrator/agent-registry.ts` : export `dealScorer` + import + entrée `BASE_AGENTS["deal-scorer"]` retirés.
- `src/agents/orchestrator/types.ts` : `"deal-scorer"` retiré de `BaseAgentName` ; `ANALYSIS_CONFIGS.full_dd.agents` → `[]` (**clé `full_dd` CONSERVÉE** car `AnalysisType = keyof typeof ANALYSIS_CONFIGS` — retirer la clé casserait le type partout).
- `src/agents/orchestrator/index.ts` : **garde dispatcher** `case "full_dd"` → fall-through `runFullAnalysis` (sans ce garde, un event interne legacy `type=full_dd` tomberait dans `runBaseAnalysis` avec 0 agent = succès vide trompeur — bug latent trouvé par Codex). Cohérent avec le remap route `full_dd→full_analysis`.
- `src/agents/board/{types,board-orchestrator}.ts` : champ + construction `dealScorer` du tier0 board retirés.
- Types orphelins retirés (3 copies) : `ScoringResult` / `DealScores` / `ScoreBreakdown` (agents/types.ts, type-modules/common.ts, src/types/index.ts) + membre `ScoringResult` des 2 unions `AnalysisAgentResult` + import pipeline.ts. (synthesis-deal-scorer a son `ScoreBreakdown` local, intact.)
- `src/agents/__tests__/a9-reste-confidence-threshold.guard.test.ts` : entrée `deal-scorer.ts` retirée de la liste (fichier supprimé).

### Description
**Chantier dé-scorisation, P4-b3 (gaté Codex APPROVE après 1 REQUEST_CHANGES — garde dispatcher).** 3e producteur P4. deal-scorer ne tournait que via `ANALYSIS_CONFIGS.full_dd`, lui-même remappé vers `full_analysis` à la route (`LEGACY_TYPE_REPLACEMENTS`) → agent de facto mort. Pas dans le graphe stepwise, pas persisté, seul consumer = board (déjà scrubbé P2-c). **Conservé (anti-over-clean, consigne Codex)** : label `AGENT_LABELS_FR["deal-scorer"]` (affichage historique), entrée denylist `presentation.ts` (empêche de resurfacer le nom technique d'anciens snapshots scorés), mappings API/coût/crédits legacy `full_dd`. **Pas de bump `STEPWISE_GRAPH_VERSION`** (hors graphe stepwise). **Dette doc notée** : `CLAUDE.md` § ARCHITECTURE liste encore deal-scorer sous « Couche 0 = 3 agents » / « 43 agents » — drift de doctrine laissé à Sacha (hors-scope code). tsc 0 ; suite complète verte dans le payload gate.

---
## 2026-06-15 — Dé-scorisation — P4-b2 — conditions-analyst : retrait de la note conditions (Option B)

### Fichiers
- `src/agents/tier3/conditions-analyst.ts` (−72) : top-level `score` (value/grade/breakdown) retiré — type `LLMConditionsResponse`, bloc `score` du prompt schema, construction dans `buildOutput` + fallback, `getGrade`, mention `score X/100` dans `alertSignal.justification`, `score` du return + import `AgentScore`. **Option B (gaté Codex)** : nouveau `findings.dimensionAssessment` `{criterion, justification}` (verbal UNIQUEMENT, aucune note) — demandé dans le prompt (4 critères Valorisation/Instrument/Protections/Gouvernance), mappé dans `buildOutput` (filtre + cap 4, fallback `[]`), `[]` en fallback no-conditions. Retrait de la **fuite LLM** du context-builder (poussait `Score X/100` des autres agents).
- `src/agents/base-agent.ts` : `conditions-analyst` retiré de `standardStructuredAgents` + branche contrat SCORELESS dédiée (`meta/findings/redFlags/questions/alertSignal/narrative`, sans `score`).
- `src/agents/types.ts` + `src/agents/type-modules/tier3.ts` : `ConditionsAnalystData.score` rendu OPTIONNEL (compat durable) ; `dimensionAssessment` ajouté à `ConditionsAnalystFindings` (2 défs).
- `src/agents/tier3/schemas/conditions-analyst-schema.ts` (hors-runtime) : `score` optionnel + `dimensionAssessment` ajouté (`.optional().default([])`, cohérence schéma/type/prompt — flag Codex).
- `src/agents/tier3/synthesis-deal-scorer.ts` (−11) : fuite LLM `extractConditionsData` retirée (`**Score conditions: X/100**` + breakdown, désormais morte ; findings/valuation/etc. verbaux conservés).
- `src/agents/orchestrator/persistence.ts` + `src/app/api/deals/[dealId]/terms/route.ts` : `Deal.conditionsScore` neutralisé (`null` ; colonne droppée en P5) ; cache `conditionsAnalysis` verbal conservé.
- `src/components/deals/conditions/types.ts` : `ScoreBreakdownItem` (weight/score) → `DimensionAssessmentItem` (criterion/justification verbal) ; `conditionsBreakdown` retypé.
- `src/services/terms-normalization.ts` : `conditionsBreakdown` lit `findings.dimensionAssessment` puis **fallback legacy** `score.breakdown.map(criterion, justification)` pour snapshots historiques pré-P4.
- `src/components/deals/conditions/conditions-analysis-cards.tsx` : prop `breakdown` retypé `DimensionAssessmentItem[]` (rendu criterion + justification inchangé — G4 « justifs par critère conservés »).
- `src/agents/__tests__/conditions-analyst-e2e.test.ts` (−49) : assertions `data.score.*` retirées (scoreless), 2 tests renommés.

### Description
**Chantier dé-scorisation, P4-b2 (BORNÉE, gaté Codex APPROVE après 2 REQUEST_CHANGES productifs).** 2e producteur P4. Retrait de la **note conditions** (`score.value`/grade) + neutralisation `Deal.conditionsScore`. **Fourche tranchée par Codex = Option B** : la décision G4 « justifs par critère conservées » (hero card) imposait de préserver les justifications verbales qui vivaient dans `score.breakdown` → déplacées vers `findings.dimensionAssessment` (verbal pur), avec fallback legacy `score.breakdown` pour les snapshots historiques. Carve-out du contrat partagé (comme synthesis-deal-scorer en P4-a). **Différé LARGE/P5** : `structuredAssessment.trancheAssessments[].score` (sous-note par tranche, non restituée depuis G4). **Pas de bump `STEPWISE_GRAPH_VERSION`** (contrat évalué à la PRODUCTION, pas au replay ; lecteurs legacy préservés). tsc 0 ; conditions e2e + transform + prompt.guard + schemas + 2 pipelines + doctrine guards = 104+ verts ; suite complète verte dans le payload gate.

---
## 2026-06-15 — Dé-scorisation — P4-b1 — team-investigator : retrait des notes par fondateur

### Fichiers
- `src/agents/tier1/team-investigator.ts` (−58) : retrait de `founderProfiles[].scores.*` (domainExpertise / entrepreneurialExperience / executionCapability / networkStrength / overallFounderScore = note d'appréciation agrégée par fondateur) — type `LLMTeamInvestigatorResponse`, schéma de sortie du prompt, exemple JSON, ligne du MAUVAIS exemple, et le bloc transform `scores:(()=>{capScore…})()`. Prompt : échelle chiffrée « Score domainExpertise 0-100 » → guidance qualitative (reflétée dans strengths/concerns) ; section « Impact sur les scores » → « Impact sur l'évaluation ». Métriques internes : les 4 dérivées `unit:"score"` (domain_expertise / entrepreneurial_experience / execution_capability / network_strength) + le helper `avg()` retirés ; **conservées** les observables `linkedin_verified_ratio` (%) et `successful_exits` (count). **Top-level `data.score.value` CONSERVÉ** (score agent des 15 standardStructuredAgents = LARGE-déféré per Codex ; désormais dérivé des 2 métriques observables + fallback breakdown LLM).
- `src/agents/types.ts` + `src/agents/type-modules/tier1.ts` : champ `scores` retiré de `FounderProfile` / `TeamInvestigatorFindings`.
- `src/agents/tier3/devils-advocate.ts` (−10) : **fuite LLM** retirée — le bloc qui poussait « name: Score N/100 » dans le contexte de challenge (devils-advocate reçoit déjà les founderProfiles complets via previousResults).
- `src/agents/orchestrator/persistence.ts` (−2) : `scores: profile.scores` retiré de `analysisData` (merge `verifiedInfo`) + champ de type `scores?`.
- `src/components/deals/team-management.tsx` (−9) : interface morte `AnalysisScores` + champ `scores?` retirés (rendering déjà retiré en `c63620d`).

### Description
**Chantier dé-scorisation, P4-b1 (périmètre BORNÉE gaté Codex APPROVE).** Premier producteur du périmètre P4 borné. Retrait des notes 0-100 PAR FONDATEUR (appréciation agrégée bannie même interne) + la fuite vers le contexte LLM de devils-advocate + persistence + UI/types. **Laissé intentionnellement** : top-level `data.score.value` de l'agent (carry interne transitoire non rendu, retrait dans le chantier LARGE/P5 per Codex) ; `TEAM_INVESTIGATOR_CRITERIA` (config de pondération du score déféré ; `calculateAgentScore` tolère déjà les métriques absentes) ; PDF `domainExpertise?:string` (dead rendering préexistant, lit un champ inexistant) ; context-engine `networkStrength` enum qualitatif (autre système). **Pas de bump `STEPWISE_GRAPH_VERSION`** (ni topologie ni step-id ni clé durable changés ; contrat partagé toujours satisfait). tsc 0 ; sequential-pipeline + agent-pipeline 45/45 ; suite complète verte dans le payload gate.

---
## 2026-06-15 — Dé-scorisation — P4-a — synthesis-deal-scorer : retrait de la PRODUCTION de note de deal

### Fichiers
- `src/agents/tier3/synthesis-deal-scorer.ts` (cœur, −296/+67) : `transformResponse` ne produit plus `overallScore` / `confidence` / `dimensionScores` / `scoreBreakdown` / `comparativeRanking`. Supprimés : extraction dimensionScores + calcul overallScore pondéré, caps de cohérence (Rule 1 skepticism, Rule 2 critical), meta-gate thèse (Rule 4), pénalité de score (Rule 3 ; le **relevé** `partialAgents` est conservé pour `keyWeaknesses`), confidence + pénalité, `patchScoreInText`, helper mort `normalizeDimensionWeight`. `execute()` : un SEUL appel LLM (retry « dimensions » retiré, sans objet en scoreless) + **bloc F37 retiré** (percentile DE SCORE via `percentile-calculator` → écriture comparativeRanking + confidence = note de deal bannie). Rationale restituée scrubbée via `stripDealScoreMentions` (remplace le patch). `buildSignalContribution(orientation, context)` ne porte plus `score`. Type `SynthesisDealScorerData` : 5 champs de score rendus **OPTIONNELS** (compat durable snapshots en vol + historiques + lecteurs défensifs `?? null`). Orientation 100% scoreless (`finalVerdict` + `signalProfile`) inchangée.
- `src/agents/types.ts` + `src/agents/type-modules/tier3.ts` : mêmes 5 champs de score rendus OPTIONNELS dans les copies dupliquées de `SynthesisDealScorerData`.
- `src/agents/base-agent.ts` : contrat de sortie synthesis SCORELESS. `getRequiredOutputContractFields` → `["verdict", "investmentRecommendation", "keyStrengths", "keyWeaknesses", "criticalRisks", "signalProfile"]` (overallScore/dimensionScores retirés). Bloc de validation synthesis : check structurel `signalProfile.orientation` + `dimensionCoverage` (au lieu de overallScore/dimensionScores/comparativeRanking). Sinon CONTRACT_BROKEN → `success:false`.
- `src/agents/tier3/__tests__/synthesis-deal-scorer-transform.test.ts` : invariant `signalContribution.score === overallScore` supprimé (les deux champs n'existent plus).
- `src/agents/tier3/__tests__/synthesis-deal-scorer-llm-budget.guard.test.ts` : `MAX_IN_EXECUTE_CALLS` 2→1 ; assertion count `>=2`→`toBe(1)` (retry retiré) ; doc/worst-case alignés (1×100s, F37 retiré).

### Description
**Chantier dé-scorisation, P4-a (retrait des scores producteurs, ordre additif).** La synthèse ne RESTITUE plus de note depuis P3 ; ici on retire sa **production** (1er producteur). Ordre ADDITIF : champs de note rendus optionnels (PAS supprimés du type) → snapshots stepwise en vol + analyses historiques + lecteurs défensifs (persistence `if (overallScore != null)`, score-extraction) compilent et tolèrent l'absence. La persistence (`Deal.*Score` gatée sur `overallScore != null`) **skippe** naturellement le write pour les nouveaux runs. **Pas de bump `STEPWISE_GRAPH_VERSION` (reste 4)** : ni topologie ni step-ids changés ; le contrat de sortie n'est validé qu'à la PRODUCTION (pas au replay du snapshot). Clé durable `"synthesis-deal-scorer"` inchangée. Gain collatéral : 1 appel LLM au lieu de 2. **Différé (micro-étapes P4 suivantes)** : prompt LLM (instruit encore score/dimensions, ignorés), purge finale des champs optionnels + write persistence inerte, retrait `percentile-calculator` (P5), type mort `SynthesisDealScorerDataV2`. tsc 0 ; suite unit complète 4515 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — sweep complétude — 3 surfaces (analysis-complete-view, deck-coherence, board thesis-debate)

### Fichiers
- `src/components/deals/analysis-complete-view.tsx` (vue complète par agent, rendue par analysis-panel + analysis-preview-tabs) : fonction `getScore` + badge `{value}/100 · {grade}` par agent **retirés**. `score` déjà dans `hiddenKeys` (non listé en findings). Reste inchangé.
- `src/components/deals/deck-coherence-report.tsx` (rapport cohérence deck, via analysis-panel) : header — `GradeBadge` (reliabilityGrade A-F) + badge `coherenceScore/100` retirés ; composant `GradeBadge` + `GRADE_CONFIG` orphelins retirés. Body conservé : `RecommendationBanner` (verbal) + compteurs issues critical/warning/info (observables) + liste issues ; auto-déplie si criticalIssues>0. `coherenceScore`/`reliabilityGrade` restent dans le type producteur (P4).
- `src/components/deals/board/thesis-debate-view.tsx` (Board Round 0) : `thesisSolidityScore/100` par membre (barre+nombre) + `avgSolidity/100` retirés (axe Solidité en nombre = anti-doctrine, axe-2 doit être verbal). Badge `agreement` (strong_agree…strong_disagree, verbal) conservé par membre ; description → « Thèse débattue par N membres IA, désaccords et critiques exposés » (on-doctrine Board). justification/weakestAssumption/majorCritique/recommandations conservés. Helper `solidityColor` orphelin retiré. `thesisSolidityScore` reste dans le type producteur (P4).

### Description
**Sweep complétude** : 3 surfaces de restitution de note NON listées dans le RESTE du relais. Producteurs inchangés (P4, ordre additif). **Gate Codex APPROVE.** tsc 0 ; board-orchestrator 2 + doctrine guards 27 = 29 verts. Restitutions écran restantes à classer : thesis « Confiance /100 » (×4 — allowlist per-item confidence vs note ?), react-trace + extraction-audit (qualité extraction/confiance dev = allowlist probable).

---
## 2026-06-15 — Dé-scorisation — sweep complétude — team-management (scores fondateurs)

### Fichiers
- `src/components/deals/team-management.tsx` : carte fondateur (onglet Équipe) dé-scorée. Avatar : nombre `overallFounderScore` (coloré) → initiale du nom. Grille 4 `ScoreMiniBar` (Domain/Startup XP/Execution/Network /100) **supprimée**. Caveat provenance « Scores estimés depuis le deck » → « Analyse estimée depuis le deck » (sorti du gate scores). Retirés : composant `ScoreMiniBar`, helpers locaux `getScoreColor`/`getScoreBg`, icônes Target/TrendingUp/Zap/Network, consts `scores`/`overallScore` (orphelins). **Conservé verbal natif** : strengths/concerns/redFlags/background/highlights. **Carry interne (Option B, → P4)** : interface `AnalysisScores` + `VerifiedInfo.scores` (data shape team-investigator, plus lue en rendu).

### Description
**Découverte sweep complétude** : surface de restitution de scores NON listée dans le RESTE du relais. Producteur `team-investigator` inchangé (P4, ordre additif). **Gate Codex APPROVE.** tsc 0 ; doctrine guards 27 verts. Sweep en cours : restent analysis-complete-view (score/100·grade), deck-coherence-report (coherenceScore/100), board thesis-debate (avgSolidity/100) ; thesis « Confiance /100 » à classer (allowlist per-item vs note).

---
## 2026-06-15 — Dé-scorisation — étape G4-b — cleanup composants + helpers de score orphelins

### Fichiers
- `src/components/deals/verdict-panel.tsx` : **supprimé** (composant MORT, 0 importeur ; panneau de score ScoreRing + dimensions + VERDICT_CONFIG).
- `src/components/ui/score-ring.tsx` : **supprimé** (orphelin après dé-scorisation G4 de conditions-analysis-cards ; seul consumer restant = verdict-panel supprimé).
- `src/lib/ui-configs.ts` : retrait section « Score Thresholds » — `getScoreColor` + `getScoreLabel` (ancienne échelle mono-axe Excellent/Solide/…) + `getScoreBarColor` (importeurs = verdict-panel + score-ring seulement). Commentaire périmé « verdict-panel » → « tier3-results & analysis-v2 ».
- `src/lib/format-utils.ts` : retrait `getScoreColor` (0 importeur, team-management a sa version locale) + `getScoreBadgeColor` (0 ref, orphelin depuis suppression score-badge étape D = le NIT du plan).

### Description
Cleanup des vestiges de score rendus orphelins par la dé-scorisation. Tous vérifiés orphelins par `git grep` avant suppression. **Hors-scope laissé (Karpathy)** : `team-management.tsx` garde `getScoreColor`/`getScoreBg` LOCAUX (scores fondateurs `overallFounderScore`/`domainExpertise`…) = surface de score SÉPARÉE vivante → sweep de complétude avant P4. Le source-guard `orientation-solidity-display.test.ts` référence `getScoreColor`/`getScoreLabel` comme chaînes BANNIES (pas de consommation) → non cassé. **Gate Codex APPROVE.** tsc 0 ; doctrine-guard 10 + doctrine-runtime-guard 17 + orientation-solidity 14 + ui-configs 71 verts.

---
## 2026-06-14 — Dé-scorisation — étape G4 — onglet Conditions entièrement scoreless (4 sous-onglets + 2 routes)

### Fichiers
- `src/components/deals/conditions/conditions-analysis-cards.tsx` : `ConditionsHeroCard` dé-scoré — retrait `ScoreRing` (note /100), `getVerdictConfig(score)` (verdict verbal « Conditions favorables/défavorables » **dérivé du score** = anti-pattern orientation-depuis-score-caché), badge `getScoreLabel`, `MiniBar` + nombres de breakdown par dimension. Layout 2 colonnes → 1 colonne. **Conservé verbal natif** : `narrative.oneLiner` (titre), compteur red flags (observable), justification qualitative par critère (criterion + justification, sans nombre ni poids), valuation quick view (verdict + percentile observable + rationale). `StructuredAssessmentCard` : `ta.score/100` + barre par tranche retirés (label + assessment + risks conservés). Imports `getScoreColor/getScoreBarColor/getScoreLabel/ScoreRing` retirés.
- `src/components/deals/conditions/conditions-tab.tsx` : prop `score` retiré du hero ; sentinel de présence d'analyse `conditionsScore` → `conditionsAnalysis` (montre la dernière analyse valide même après re-run échoué) ; `isEmpty` idem ; 2 textes empty-state dé-scorés.
- `src/components/deals/conditions/version-timeline.tsx` (Historique) : badges `Score: X/100` + delta `pts` retirés ; type `VersionWithDelta` (deltaScore) supprimé → lit `TermsVersionData`.
- `src/components/deals/conditions/percentile-comparator.tsx` (Comparateur) : notes `protections.score`/`governance.score` /100 + barres + `getScoreColor` local retirés → **checklist OBSERVABLE present/absent** (`TermsChecklist`) des protections/gouvernance saisies au formulaire. Conservé : valuation percentile P25/P50/P75, dilution médiane, instrument standard (observables).
- `src/app/api/deals/[dealId]/terms/versions/route.ts` : dérivation `deltaScore` (delta de note) retirée ; `conditionsScore` conservé en payload (carry interne, → P5).
- `src/app/api/deals/[dealId]/terms/benchmarks/route.ts` : tally `protectionScore`/`governanceScore` (0-100) → listes `items` present/absent dérivées des mêmes booléens observables du formulaire (terms null → items vides → « Non évalué »).

### Description
Directive Sacha « dégager tous les scores » + leçon défaut = SUPPRIMER. Toute la surface **Conditions** (4 sous-onglets) ne restitue plus de note de deal. Garde-fou respecté : aucune orientation dérivée d'un vieux score (suppression pure, contenu verbal natif conservé). Agent producteur `conditions-analyst` (score interne) + colonne DB `conditionsScore` **inchangés** = P4/P5 (ordre additif) ; les `conditionsScore` restants côté route = écritures DB + lecture producteur, jamais restitués écran. **Gate Codex APPROVE après 1 REQUEST_CHANGES** (Codex a flaggé version-timeline = même surface non dé-scorée ; corrigé + percentile-comparator dé-scoré proactivement par le même principe). Non-bloquant noté par Codex : select `globalScore` mort dans `/terms` GET → cleanup sweep P5/carry. tsc 0 ; 117 tests verts (doctrine-guard, doctrine-runtime-guard, signal-profile, orientation-solidity-display, conditions-analyst ×3).

---
## 2026-06-14 — Dé-scorisation cluster — étape G3 — export RGPD + contexte LLM chat scoreless (+ scrubber texte libre)

### Fichiers
- `src/services/signal-profile/index.ts` : nouveaux scrubbers de **texte libre** `stripDealScoreMentions(text)` (retire les patterns de NOTE : `X/100`, `score/note` qualifié deal, `grade A-F` ; préserve les observables %/montants/ratios non-/100 ; idempotent) et `deepStripScoreMentions(value)` (récursif, ne recurse que dans objets simples + arrays, laisse intacts Date/Decimal).
- `src/app/api/user/export/route.ts` (RGPD) : retrait des 7 `*Score` du select + des champs score par deal + du champ `scores` par analyse + de la machinerie `loadResults`/`extractAnalysisScores` (morte). `analysis.summary` scrubé via `stripDealScoreMentions` ; red flags historiques via `deepStripScoreMentions` (summaries/red flags persistés avant la bascule pouvaient contenir « Score : X/100 »).
- `src/agents/chat/deal-chat-agent.ts` : **scrub au niveau du bloc de contexte** — `contextPrompt` (l.1158) et `retrievedContextPrompt` (l.1151) passés par `stripDealScoreMentions` (couvre agentSummaries/keyFindings/findings/fallback summary/analysisSummary) ; `buildConversationHistory` scrub les messages **ASSISTANT** historiques (user intact). System prompt déjà sans note, `scrubAgentScoreData` (P3-a) sur les fullData agents conservé.
- Tests : `signal-profile.test.ts` (+10 cas strip/deep), `user/export/__tests__/route.test.ts` réécrit (assert observables + guard d'ABSENCE de score).

### Description
Directive Sacha : dégager tous les scores. **Vérification chat LLM** : le prompt n'expose aucune note (system prompt propre, blocs de contexte scrubés au boundary, historique assistant scrubé, `dealMetrics` mort sans consumer). **Export RGPD** scoreless (les `results` blobs gardent `overallScore` même après le drop DB P5 → scrub explicite requis, fait). **Gate Codex APPROVE après 3 REQUEST_CHANGES** (convergence : summary → agentSummaries/findings/red flags → historique assistant ; chaque vecteur distinct corrigé). Caveat non-bloquant acté : le scrub bloc retire aussi de rares « X/100 » de confiance de thèse (pas une note de deal ; la confiance reste exprimable en %). Internes tolérés (Option B, → P5) : `canonical-read-model.*Score`, `score-extraction`, `dealMetrics`. PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; signal-profile 40 + chat/route/chat-context 46 + export 1 tests verts.

---
## 2026-06-14 — Dé-scorisation cluster — étape G2 — dashboard : suppression du KPI « Score moyen » + métriques portfolio observables

### Fichiers
- `src/app/(dashboard)/dashboard/page.tsx` : (1) carte KPI « Score moyen » (`avgScore/100` + « N deals scorés ») **supprimée**. (2) data : calcul `scores`/`avgScore` retiré ; `sectorDistribution` **découplé de globalScore** (secteurs distincts de tout le portefeuille, observable) ; `dealsWithScoresCount` → `portfolioDealsCount` (= `metricDeals.length`, observable) ; select Prisma `globalScore` retiré de `metricDeals` ; appel mort `loadCanonicalDealSignals(signals)` (servait aux scores) retiré ; commentaire cap portfolio mis à jour. (3) carte « Métriques Portfolio » : gate `avgScore !== null` → `sectorDistribution.length > 0` ; tuile « Deals scorés » → « Deals suivis ». **Conservé** : « Secteurs couverts ».

### Description
Directive Sacha : dégager tous les scores. Dashboard scoreless ; métriques portfolio = observables (secteurs couverts, deals suivis). **Gate Codex APPROVE** (nit commentaire stale corrigé). Note hors-scope : `recentDeals` passe encore `globalScore` à `resolveCanonicalDealFields` (input du read-model canonique, **non restitué** par `RecentDealsList` — vérifié) → carry interne, sweep canonical-read-model/P5. PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; eslint dashboard clean ; doctrine guards 27 passed.

---
## 2026-06-14 — Dé-scorisation cluster — étape G1 — comparaison de deals : suppression pure des notes /100

### Fichiers
- `src/components/deals/deal-comparison.tsx` : retrait des 5 lignes de notes /100 (Score Global/Équipe/Marché/Produit/Financier) + `DIMENSION_LABELS` + memo `bestScores` + footnote « Meilleur score » + champs score du type `DealComparisonData` + import `useMemo` devenu inutile. Lignes **observables conservées** : Red Flags, Valorisation, ARR, Croissance.
- `src/app/api/deals/compare/route.ts` : retrait des 5 `*Score` du select Prisma + de toute la machinerie qui ne servait qu'à extraire les scores (thèses, analyses, `pickCanonicalAnalysis`, `loadResults`, `extractAnalysisScores`, `resultsByAnalysisId`, `analysisScores`, `canFallbackToDealScores`). La route ne charge plus que les current facts (valo/ARR/croissance) + redFlags → simplification + suppression du chargement de blobs `results` multi-MB pour la comparaison.
- `src/app/api/deals/compare/__tests__/route.test.ts` : réécrit pour le contrat scoreless (assert métriques observables + `redFlagCount`/`criticalRedFlagCount` + assert explicite ABSENCE des champs score = guard anti-régression).

### Description
Directive Sacha (suite AskUserQuestion) : **on dégage tous les scores, pas de remplacement**. La comparaison reste sur les métriques observables. **Gate Codex APPROVE** : comparaison scoreless de bout en bout, aucune note restituée, machinerie morte retirée. Note hors-scope : un `globalScore` subsiste dans `src/components/deals/types.ts` (type interne, à traiter dans le sweep cluster/P5). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; compare route test 2 passed ; doctrine guards 27 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 14/N (D) — suppression des composants score partagés orphelins (clôt la cible du plan)

### Fichiers
- **Supprimés** (4 fichiers totalement orphelins, 0 consumer runtime, 0 import de test) : `src/components/shared/score-badge.tsx` (`ScoreBadge`, plus aucun consumer après tier1-results C1-C4 + listes E) ; `src/components/deals/score-display.tsx` (`ScoreGrid`, plus aucun consumer après overview F) ; `src/components/deals/delta-indicator.tsx` + `src/components/deals/adjusted-score-badge.tsx` (orphelins préexistants depuis le cluster analysis-panel).
- **Conservé** : `src/components/ui/score-ring.tsx` — consumer **vivant** `conditions/conditions-analysis-cards.tsx` (via `conditions-tab.tsx`) ; `verdict-panel.tsx` l'importe aussi mais est MORT (aucun importeur).

### Description
Cleanup des composants de note de deal devenus orphelins après la bascule des consumers (tier1-results, listes, overview). **Gate Codex APPROVE** : 4 suppressions sûres (aucun import runtime restant de `ScoreBadge`/`ScoreGrid`/`DeltaIndicator`/`AdjustedScoreBadge` dans `src` ; occurrences restantes = docs/commentaires) ; conservation de `score-ring.tsx` correcte. **Ceci clôt la cible du plan de relais (« tier1-results puis composants score partagés »).** Restent des sous-chantiers SÉPARÉS hors cible : (1) cluster read-model/delta/compare/score-extraction (`canonical-read-model.ts` expose encore `*Score`, `analysis-delta`, `analysis-variance`, `compare`, `score-extraction`) ; (2) sous-chantier conditions (`conditions-analysis-cards.tsx` rend `ScoreRing(score)`) ; (3) nit futur `getScoreBadgeColor` dans `format-utils.ts` (à nettoyer si plus aucun consumer). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; doctrine guards 40 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 13/N (F) — vue d'ensemble : ScoreGrid /100 → BadgePair orientation × solidité (décision Sacha)

### Fichiers
- `src/app/(dashboard)/deals/[dealId]/page.tsx` : la carte « Scores » de l'overview rendait un `ScoreGrid` de 7 sous-scores /100 (`global`/`team`/`market`/`product`/`financials` depuis `canonicalDeal.*Score` + `fundamentals`/`conditions` depuis `deal.*Score` — toutes notes de deal bannies). Remplacé par **`BadgePair` (orientation × solidité)**. Orientation/solidité dérivées via `aggregateOrientation`/`aggregateSolidity` sur `latestCompletedResults` (déjà chargé server-side pour le view model analysis-v2 → aucun chargement de blob supplémentaire, pas de régression perf SSR). Gating `showOverviewScores` (globalScore != null) → `showOverviewSignal` (orientation != null && latestThesis && !thesisGated, gating thèse conservé). En-tête « Scores » → « Orientation » ; empty-state « Score masqué/indisponible » → « Orientation masquée/indisponible ». Import `ScoreGrid` retiré (→ `BadgePair` + agrégateurs).

### Description
Décision produit Sacha (AskUserQuestion, Q1 overview) : remplacer le score grid par le modèle 2 axes verbal. **Gate Codex APPROVE** (« plus de ScoreGrid ni 7 notes /100, BadgePair depuis results déjà chargé, gating thèse préservé, orientation dérivée sans lecture de note de deal »). Mêmes agrégateurs score-indépendants que tier3/investor-view/tier1 (caveat C3 connu : `aggregateSolidity` peut en dernier fallback dériver une solidité verbale depuis `coherenceScore` documentaire — pas la note de deal, nombre jamais rendu). **Périmètre = surface overview uniquement.** Le CLUSTER read-model/delta/compare (`canonical-read-model.ts` expose encore `*Score`, `analysis-delta` scoreDelta, `analysis-variance`, `compare/route.ts`, `score-extraction.ts`) = sous-chantier séparé à venir ; champs DB intacts (= P5). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; eslint page clean ; doctrine guards 54 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 12/N (E) — listes de deals : note /100 → compteur de signaux (décision Sacha)

### Fichiers
- `src/components/deals/deals-table.tsx` : les 2 `ScoreBadge score={deal.globalScore}` (note /100, bannie — vue mobile carte + cellule desktop) remplacés par un badge compteur « N signal/signaux » = `deal.redFlags.length` (total des red flags, observable). Branche `thesisGated` → « Thèse d'abord » conservée. En-tête colonne desktop « Score » → « Signaux ». Import `ScoreBadge` retiré.
- `src/components/deals/deals-kanban.tsx` : même remplacement `ScoreBadge` → compteur « N signaux ». Import `ScoreBadge` retiré. Commentaire `Name + score` → `Name + signals count` (stale, nit Codex).

### Description
Décision produit Sacha (AskUserQuestion, Q2 listes) : remplacer la note de deal des listes par un **compteur de signaux d'alerte**. Le nouveau badge montre le **total** (toutes sévérités) pour coller à la formulation « N signaux dont M critiques » ; les 3 surfaces affichent **déjà** ailleurs un compteur CRITICAL+HIGH (colonne « Alertes » desktop + tooltip, footers mobile/kanban) → total vs critique = deux lectures distinctes. **Gate Codex APPROVE** (« maintien séparé Signaux total / Alertes critique acceptable, colле à la décision produit » ; nit comment stale corrigé). Plus aucune note de deal (`deal.globalScore`) restituée dans les listes. `score-badge.tsx` devient probablement orphelin (à confirmer/retirer en étape D composants partagés). tsc 0 ; eslint clean ; doctrine guards 40 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 11/N (C4) — tier1-results.tsx : cleanup vars mortes (clôt le fichier)

### Fichiers
- `src/components/deals/tier1-results.tsx` : retrait des 4 variables mortes `scoreValue` (cartes cap-table, gtm, customer, question-master), rendues inutiles par l'étape C1 (remplacement du `ScoreBadge` de tête par `Tier1SignalChip`). Aucune autre logique touchée.

### Description
Étape 4/4 (cleanup) qui **clôt le chantier tier1-results.tsx** (C1 chips de tête, C2 sous-scores par dimension, C3 résumé agrégé scoreless, C4 cleanup). Plus aucune note de deal restituée dans le fichier (vérifié : zéro `/100` hors commentaires, zéro `ScoreBadge`, zéro grade A-F, zéro sous-score d'appréciation ; allowlist conservée = métriques observables + confiances par item). Warning eslint `hiddenCriticalCount` **préexistant** (présent dès le HEAD pré-session `6796cca`, non induit) laissé en place par principe Karpathy. **Gate Codex APPROVE** (cleanup pur confirmé). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; tests ciblés tier1/doctrine 54 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 10/N (C3) — tier1-results.tsx : résumé agrégé scoreless (BadgePair + dimensions verbales)

### Fichiers
- `src/components/deals/tier1-results.tsx` : le résumé agrégé (carte « Analyse détaillée » + onglet Résumé `Tier1SummaryView`) ne restitue plus aucune note de deal. **Retirés** : memos `scores` (note /100 par agent) + `avgScore` (moyenne /100), le `ScoreBadge avgScore` en tête, la grille par agent affichant la note, le hero `avgScore/100` et le tri « points faibles » par note la plus basse. **Ajoutés** : memo `dimensions` (intensité verbale par agent via nouveau helper `dimensionIntensityOf`, lecture read-only `signalIntensity`/`alertSignal.recommendation`, aucune lecture de `score.value`) ; `overallOrientation`/`overallSolidity` via `aggregateOrientation`/`aggregateSolidity` rendus en `BadgePair` (modèle 2 axes verbal 5 valeurs, cohérent écran-à-écran avec tier3-results / investor-view) ; tête de résumé = `BadgePair` + liste 2 colonnes des dimensions (nom + chip `Tier1IntensityBadge`) ; `Tier1SummaryView` = hero `BadgePair` + bloc « Dimensions à investiguer en priorité » (intensité high/critical). Import `ScoreBadge` retiré (dernière utilisation supprimée). Nouveaux helpers : `dimensionIntensityOf` + `Tier1IntensityBadge`.

### Description
Étape 3/4 de tier1-results.tsx : le résumé bascule du score moyen /100 vers le modèle 2 axes verbal (orientation × solidité). Les chips par dimension sont **score-indépendants** (intensité de signal uniquement). **Gate Codex APPROVE après push-back argumenté** : 1er tour REQUEST_CHANGES (le BadgePair de solidité expose `aggregateSolidity`, qui en dernier fallback dérive une solidité verbale depuis `deck-coherence-checker.coherenceScore`). Push-back vérifié contre le codebase et accepté : `coherenceScore` est une métrique de cohérence/fiabilité **documentaire** (signal evidence-first listé par la doctrine pour la solidité), pas la note de deal ; la sortie est verbale, le nombre jamais rendu ; c'est le pattern déjà verrouillé par P3-b (`buildDecisionStripModel` dérive `coherenceBand` de `coherenceScore`, lock `doctrine-runtime-guard.test.ts:310-319`) ; le retirer ferait diverger la solidité du BadgePair de la bande de cohérence du decision-strip (incohérence cross-surface). Nuance de vocabulaire actée : `aggregateSolidity` n'est pas « score-indépendant » au sens strict (peut utiliser ce score documentaire interne), mais reste conforme (pas de note de deal restituée, pas de dérivation d'orientation depuis une note cachée). Reste C4 : cleanup des 4 vars mortes `scoreValue` (induites par C1). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; tests ciblés tier1/doctrine 77 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 9/N (C2) — tier1-results.tsx : sous-scores numériques par dimension retirés

### Fichiers
- `src/components/deals/tier1-results.tsx` : retrait des sous-scores d'appréciation 0-100 restitués par dimension (anti-pattern `dimensionScores[].score`). (1) Carte équipe : grille 3 tuiles `technicalStrength`/`businessStrength`/`complementarityScore` supprimée (aucun verdict verbal companion). (2) Carte équipe : ligne par fondateur `domainExpertise`/`entrepreneurialExperience` (/100) supprimée. (3) Carte concurrence : barre de progression + `overallMoatStrength`/100 supprimées (la barre visualisait le score) — verdict verbal `moatVerdict` (MOAT_LABELS) **conservé**. (4) Carte deck : grille `storyCoherence`/`professionalismScore`/`transparencyScore` supprimée. (5) Carte customer : `pmfScore`/100 supprimé — verdict verbal `pmfVerdict` (PMF_LABELS) **conservé**. (6) Carte question-master : grille `agentsAnalyzed` affichait `grade` (A-F) + `score` (0-100) coloré par score → retiré ; **conservés** le nom d'agent + le compteur observable `criticalRedFlagsCount`.

### Description
Étape 2/4 de tier1-results.tsx : suppression des notes d'appréciation par dimension. Principe : retirer les nombres d'appréciation du deal, conserver les verdicts verbaux existants (`moatVerdict`/`pmfVerdict`, pas de re-dérivation depuis un score) et les comptes observables (`criticalRedFlagsCount`), **sans inventer de contenu de remplacement** (choix produit/UX réservé à l'utilisateur, YAGNI). Allowlist conservée : métriques observables (NRR/churn %, ACV, CAC, croissance %, percentiles de métriques, dilution/parts %), confiance ReAct par item (`reactData.confidence.score`%, non une note de deal). **Gate Codex APPROVE** (aucun nit). Hors périmètre, suivront : résumé `avgScore`/`dim.score` (C3) ; 4 vars mortes `scoreValue` induites par C1 (C4 cleanup). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; tests ciblés tier1/doctrine 54 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 8/N (C1) — tier1-results.tsx : ScoreBadge par carte d'agent → chip d'intensité verbal

### Fichiers
- `src/components/deals/tier1-results.tsx` : nouveau composant `Tier1SignalChip` (chip verbal d'intensité Tier 1, lit `signalIntensity` natif + fallback read-only `alertSignal.recommendation` via `resolveTier1SignalIntensity` / `TIER1_SIGNAL_INTENSITY_LABELS` / `TIER1_SIGNAL_INTENSITY_BADGE_CLASS`). Les **12 `ScoreBadge` par carte d'agent** (financial, team, competitive, deck-crédibilité, market, tech-stack, tech-ops, legal, cap-table, gtm, customer, question-master — note /100, bannie) remplacés par ce chip. Variable morte `score` (carte market) induite par le changement retirée.

### Description
Étape 1/4 du gros fichier tier1-results.tsx (3885 l) : retrait des notes /100 par carte d'agent, remplacées par le signal verbal Tier 1 (mêmes libellés/classes que `Tier1AlertSignalDisplay`). Dérivation **score-indépendante** (aucune lecture de `score.value`). Le `ScoreBadge` agrégé du résumé (`avgScore`) + l'import restent volontairement (étapes C3/C4). **Gate Codex APPROVE** : chip scoreless confirmé, doublon chip-en-tête / bloc-corps sur 5 cartes acceptable (scan rapide en tête + justification dans le corps = densité duale de l'ancien, à traiter en polish UX éventuel, pas un problème doctrine). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; tests ciblés tier1/doctrine 77 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 7/N — suppression du reader mort score-utils.ts

### Fichiers
- `src/lib/score-utils.ts` : **supprimé**. Exportait `extractDealScore` (lisait `overallScore`/`score.value` de synthesis-deal-scorer = note de deal) et `extractDealRecommendation`. Après les étapes 4 et 6, ses derniers consumers (`analysis-panel.tsx` + page dev-only avekapeti) ne l'importent plus.

### Description
Reader de note de deal entièrement orphelin (grep `score-utils` / `extractDealScore` / `extractDealRecommendation` = 0 hors fichier) → retiré, conforme au plan PLAN-DESCORING (« retirer le reader quand tous les consumers sont basculés »). **Gate Codex APPROVE** : suppression sans danger, aucun chemin durable/LLM ne dépend du reader, surfaces runtime migrées lisent orientation/verdict via chemins scoreless. PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; suite unit complète 4509 passed / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 6/N — analysis-panel.tsx + timeline-versions.tsx scoreless (clôt le cluster analysis-panel)

### Fichiers
- `src/components/deals/analysis-panel.tsx` : (1) reader `extractDealScore` retiré (import + memos `currentScore`/`previousScore`). (2) `DeltaIndicator unit="/100"` montrait le DELTA de la note de deal entre versions (banni) → usage + import retirés, aucun remplacement (un delta verbal orientation/red-flags relève du cluster read-model/`analysis-delta`, pas inventé ici — YAGNI). (3) `timelineVersions` ne calcule plus le champ `score`. (4) `thesisGated` (orphelin, ne gardait que le DeltaIndicator) retiré. (5) variable `resolutions` (tableau de `useResolutions`) orpheline retirée de la destructuration ET du pass `Tier3Results` (`resolutionMap`, distinct, conservé). (6) menu export PDF résumé : « Score » → « Orientation », « red flags » → « signaux d'alerte » (le PDF résumé est déjà scoreless).
- `src/components/deals/timeline-versions.tsx` : champ `score` retiré de l'interface `AnalysisVersion`, de l'affichage (pastille colorée par seuils 80/60) et du tooltip « Score: X/100 » ; la navigation entre versions (V1/V2…, date/heure) reste.
- `src/components/deals/tier3-results.tsx` : prop `Tier3ResultsProps.resolutions` (déclarée mais inutilisée depuis la dé-scorisation tier3, nit Codex différé) retirée.

### Description
Le cluster analysis-panel ne restitue plus aucune note de deal (delta de note + timeline de note supprimés). **Gate Codex APPROVE** (aucun nit) : ne pas inventer de delta verbal local est le bon choix (réservé au modèle dédié `analysis-delta`), cascade `thesisGated`/`resolutions` saine, `resolutionMap` préservé. Composants devenus orphelins laissés sur disque (Karpathy, préexistants, signalés) : `delta-indicator.tsx` (plus aucun consumer) et `adjusted-score-badge.tsx` (orphelin depuis l'étape SuiviDD). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; suite unit complète 4509 passed / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 5/N — SuiviDD (onglet Suivi DD) scoreless

### Fichiers
- `src/components/deals/suivi-dd/suivi-dd-dashboard.tsx` : le dashboard SuiviDD affichait `AdjustedScoreBadge` (note de deal originale ajustée par les résolutions = note de deal restituée, bannie). Retrait du badge + import. Les props `currentScore` et `resolutions` (qui n'existaient que pour ce badge) supprimées ; import de type `AlertResolution` devenu inutile retiré ; div header droit vide retiré. La progression DD reste rendue par la barre (alertes traitées/total + %) et les compteurs de sévérité (OBSERVABLES).
- `src/components/deals/suivi-dd/suivi-dd-tab.tsx` : prop `currentScore` retirée ; prop `resolutions` retirée (ne servait qu'à forwarder vers le dashboard ; `resolutionMap`, distinct, reste consommé par `useUnifiedAlerts`).
- `src/components/deals/analysis-panel.tsx` : ne passe plus `currentScore` ni `resolutions` à `SuiviDDTab` (garde encore `currentScore` pour `DeltaIndicator` + `resolutions` pour `Tier3Results`, traités à l'étape suivante).

### Description
L'onglet Suivi DD ne restitue plus aucune note de deal. **Gate Codex APPROVE** (aucun nit) : cascade de props correcte, `resolutionMap` préservé, métriques restantes (progression, %, compteurs sévérité, réponses) toutes observables. `AdjustedScoreBadge` n'a plus aucun consumer (tier3-results l'a retiré cette session) → composant préexistant laissé sur disque (Karpathy), signalé. PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; tests deals 521 passed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 4/N — analysis-investor-view.tsx (Vue investisseur) scoreless

### Fichiers
- `src/components/deals/analysis-investor-view.tsx` : surface « Vue investisseur » partagée (legacy panel + preview-tabs) rendue entièrement scoreless. (1) badge de recommandation dont `getRecommendation` dérivait l'orientation d'un score (seuil `currentScore >= 70` = anti-pattern score caché, garde-fou P3 n°1) → remplacé par l'atome `BadgePair` (orientation × solidité) alimenté par `aggregateOrientation`/`aggregateSolidity` (sélecteurs v2 score-indépendants, mêmes que decision-strip + tier3-results) ; `getRecommendation` supprimé. (2) bandeau de tuiles de note supprimé (`Score final /100`, `Cohérence du dossier /100`, `Finance /100`). (3) dimensions (Marché/Clients/Finance/Équipe/Technique) verbalisées via `signalIntensity` (`resolveTier1SignalIntensity` + `TIER1_SIGNAL_INTENSITY_LABELS`/`BADGE_CLASS`), `DimensionBar` → `DimensionRow` (chip d'intensité, plus de barre/nombre). (4) ligne « Contradictions » de la santé d'analyse (note d'agent) → compte OBSERVABLE de contradictions détectées (`findings.contradictions.length`). (5) prop `currentScore` retirée de `AnalysisInvestorView` + `AnalysisPreviewTabs` ; consumer dev-only `avekapeti/page.tsx` perd `extractDealScore` + var ; `analysis-panel.tsx` ne passe plus `currentScore` à `AnalysisInvestorView`. Helpers morts retirés (`extractScore`, `toneFromScore`, `toneClasses`, `recordAt`, `MetricTile`, `DimensionBar`).
- `src/components/deals/analysis-preview-tabs.tsx`, `src/app/(dashboard)/deals/analysis-preview/avekapeti/page.tsx`, `src/components/deals/analysis-panel.tsx` : retrait du plumbing `currentScore` vers la Vue investisseur.

### Description
La Vue investisseur ne restitue plus aucune note de deal ni orientation dérivée d'un score. **Gate Codex APPROVE** (aucun nit). Conservé (allowlist) : `thesis.confidence` (% sur un fait précis), badges qualitatifs par item/question, compte de contradictions (observable). `analysis-panel.tsx` garde encore `currentScore` pour `DeltaIndicator` + `SuiviDDTab` (étapes suivantes). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; suite unit complète 4509 passed / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P3 (legacy panel) étape 3/N — tier2-results.tsx (expert sectoriel) scoreless

### Fichiers
- `src/components/deals/tier2-results.tsx` : carte expert sectoriel (rend `SectorExpertData`, pas la synthèse deal → sous-scores SECTORIELS, pas la note de deal ; mirror PDF-4 tier2-expert). (1) header carte : bloc « Score Secteur » + `data.sectorScore` (4xl) supprimé. (2) `VerdictHero` : bloc « Score Secteur » + prop `sectorScore` supprimés ; verdict reste verbal via `SECTOR_FIT_CONFIG[verdict.recommendation].label` + keyInsight/topStrength/topConcern + Fiabilité (`verdict.confidence` qualitatif high/medium/low). (3) `ScoreBreakdownSection` (/25 sous-scores) + son wrapper ExpandableSection « Score Breakdown » supprimés (composant retiré). (4) `SectorFitSection` : ligne « Sector Fit Score » + `ScoreBadge(fit.score)` supprimée (Timing/Strengths/Weaknesses verbaux conservés). (5) dead-code induit : imports `ScoreBadge` + icône `Building2` retirés.

### Description
tier2-results.tsx ne restitue plus aucun sous-score sectoriel (grep `sectorScore`/`ScoreBadge`/`/25`/`scoreBreakdown` = 0). **Gate Codex APPROVE** (aucun nit). Conservé (allowlist, métriques OBSERVABLES) : `valuation.percentilePosition` (percentile de la valorisation dans la distribution secteur = benchmark de marché, confirmé Codex), multiples de valo, `VALUATION_VERDICT_CONFIG` (verbal), unit economics observables, `verdict.confidence` par item (qualitatif). PAS de bump `STEPWISE_GRAPH_VERSION`. tsc 0 ; tests deals 434 passed.

---
