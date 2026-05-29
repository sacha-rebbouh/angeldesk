# Errors Log — Angel Desk

> Registre centralisé des erreurs **CODE** rencontrées sur Angel Desk : architecture, sécurité, crédits, positionnement, performance, etc.
> Pour les erreurs **de raisonnement IA** (Claude/Codex/autres agents), voir `agentic-mistakes.md`.
> **Règle (CLAUDE.md global)** : Au début de chaque session, lire l'**index** ci-dessous. Lire les entrées complètes uniquement quand pertinentes à la tâche en cours. Après chaque erreur corrigée, append une nouvelle entrée.

---

## Index (lecture rapide)

| Date | Catégorie | Titre |
|---|---|---|
| 2026-03-12 | ARCHITECTURE | Fire-and-forget analyse sur Vercel serverless |
| 2026-03-12 | CREDITS | Fail-open en production (crédits illimités si DB down) |
| 2026-03-12 | CREDITS | Double refund non protégé (idempotence manquante) |
| 2026-03-12 | CREDITS | Race condition TOCTOU (check séparé du deduct) |
| 2026-03-12 | SÉCURITÉ | SSRF dans website-crawler (pas de blocage IP privées) |
| 2026-03-12 | SÉCURITÉ | CRON_SECRET comparaison non timing-safe |
| 2026-03-12 | POSITIONNEMENT | Termes prescriptifs dans l'UI visible (3 CRITICAL) |
| 2026-03-12 | POSITIONNEMENT | 12 violations dans les prompts agents |
| 2026-03-12 | POSITIONNEMENT | Type verdict désynchronisé du schema Zod |
| 2026-03-12 | ANTI-HALLUCINATION | Directives manquantes dans les fallbacks legacy |
| 2026-03-12 | ANTI-HALLUCINATION | Directives doublées dans Tier 3 + Chat |
| 2026-03-12 | UX | Dashboard "Plan: Gratuit / 3 deals/mois" obsolète |
| 2026-03-12 | UX | Page /analytics dans le sidebar → 404 |
| 2026-03-12 | UX | Accents manquants dans toute l'UI Board + composants |
| 2026-03-12 | UX | ScoreBadge labels désalignés avec ui-configs.ts |
| 2026-03-12 | PERFORMANCE | Export PDF charge results depuis DB (30s+) |
| 2026-03-12 | PERFORMANCE | Deal detail SSR charge extractedText inutilement |
| 2026-03-12 | ARCHITECTURE | Race condition BaseAgent état mutable singleton |
| 2026-03-12 | SCORING | Incohérence poids Board vs Scoring Tier 3 |
| 2026-03-12 | RGPD | Vercel Blob access "public" pour les pitch decks |
| 2026-03-12 | QA | Orchestrator index.ts 3748 lignes / tier1-results.tsx 3978 lignes |
| 2026-03-12 | QA | 120+ console.log non gardés en production |
| 2026-05-13 | ARCHITECTURE | Progress upload non partagé entre invocations Vercel (Redis missing) |
| 2026-05-13 | AUTH | Clerk JWT cookie sync défaillant sur preview deployments |
| 2026-05-13 | EXTRACTION | "Review requis" + "OCR recommandé" affichés après visual extraction réussie |
| 2026-05-13 | SÉCURITÉ | Cross-tenant leak via cache d'extraction par contentHash |
| 2026-05-13 | UX | Upload failed déclenchait toast success + auto-close du dialog |
| 2026-05-13 | UX | Progress upload pouvait régresser (36% → 1%) quand le polling serveur écrasait le state local |
| 2026-05-29 | CREDITS | Refactor crédits-only : drop User.subscriptionStatus + enum + UserCreditBalance.freeCreditsGranted ; ADD free hebdo 'use it or lose it' (10cr / 7j, lazy reset) ; drop API v1 ; drop pipeline gating par plan |
| 2026-05-13 | CREDITS | Retry OCR / re-process inutilisable ne refundait pas les crédits + requiresOCR jamais remis à false |
| 2026-05-13 | SÉCURITÉ | Blob client fetch+décrypt AVANT vérification ownership/analyse/parent |
| 2026-05-13 | SÉCURITÉ | Pas de match entre blobPathname et dealId du body (cross-deal blob substitution) |
| 2026-05-13 | STORAGE | Temp blob orphelin sur early-returns (deal not found, parent not found, running analysis, dedup) |
| 2026-05-13 | STORAGE | Blob final orphelin si Document.create échoue après uploadFile |
| 2026-05-13 | STORAGE | Delete deal n'effaçait pas les blobs documents (storage fuyait) |
| 2026-05-13 | RGPD | storageUrl Vercel Blob brut renvoyé aux clients (GET/PATCH deal, upload, document) |
| 2026-05-13 | SÉCURITÉ | Chemin Blob deals/${dealId}/${filename} énumérable et leakait le filename |
| 2026-05-13 | SÉCURITÉ | blobUrl pas binder à blobPathname → cleanup = primitive de delete arbitraire |
| 2026-05-13 | SÉCURITÉ | cleanup armé avant ownership prouvée (cleanup d'un blob d'un autre tenant) |
| 2026-05-13 | SÉCURITÉ | /api/documents/upload/client générait token sans matcher pathname↔dealId |
| 2026-05-13 | RGPD | Temp Blob pathname leakait le filename original avant cleanup |
| 2026-05-13 | QA | Incohérence storageUrl-only vs storageUrl ?? storagePath dans masques et deletes |
| 2026-05-13 | QA | process/ocr/retry routes bloquaient sur document.storageUrl seul (rows storagePath-only inutilisables) |
| 2026-05-13 | RGPD | DocumentExtractionPage.artifact + textPreview stockaient le corpus OCR brut en clair |
| 2026-05-13 | SÉCURITÉ | Phase 3 fail-open : isPageArtifactToxic ne déchiffrait pas → bypass UNVERIFIED_ARTIFACT |
| 2026-05-13 | RGPD | Phase 3 evidence-ledger ne déchiffrait pas → 0 tables/charts/numericClaims pour les agents |
| 2026-05-13 | RGPD | Phase 3 extraction-reuse propageait du plaintext legacy dans une nouvelle row |
| 2026-05-13 | SÉCURITÉ | Phase 3 fail-open résiduel : envelope chiffrée corrompue traitée comme "pas d'artifact" |
| 2026-05-13 | SÉCURITÉ | Phase 3 textPreview fail-closed buggé : safeDecrypt swallow l'erreur → corrompu cloné comme plaintext |
| 2026-05-14 | ARCHITECTURE | /process route faisait smartExtract inline (Vercel maxDuration=300, risque de troncation) |
| 2026-05-14 | DURABILITÉ | Compensation/catch ne terminalisaient pas le DocumentExtractionRun (reste PROCESSING) |
| 2026-05-14 | DURABILITÉ | Retry Inngest voyant un run FAILED retournait success sans refund |
| 2026-05-14 | DURABILITÉ | /process pre-enqueue catch laissait le run orphelin PROCESSING |
| 2026-05-14 | UX | Client traitait le 202 async comme "Extraction terminée" |
| 2026-05-14 | DURABILITÉ | Finalisation succès non-atomique entre DocumentExtractionRun et Document parent |
| 2026-05-14 | DURABILITÉ | Corpus vide → run terminal non-FAILED (mapRunStatus ignore le texte final) |
| 2026-05-14 | DURABILITÉ | Pipeline et completeDocumentExtractionRun divergeaient sur la définition de "succès" |
| 2026-05-14 | DURABILITÉ | Paths inline legacy (OCR route, upload PDF/image/Office) utilisaient encore la truthiness brute pour COMPLETED/FAILED |
| 2026-05-14 | ARCHITECTURE | Upload route faisait smartExtract PDF inline (Vercel maxDuration, soft-timeout décoratif) |
| 2026-05-14 | UX | Migration PDF async : modal upload ne pollait pas le progress + échec d'enqueue comptait comme succès |
| 2026-05-14 | DURABILITÉ | Retry sur run terminal ne republiait pas le progress terminal (progress row bloqué non-terminal) |
| 2026-05-14 | DURABILITÉ | Nouvelle version démotait l'ancien document AVANT que sa propre extraction réussisse (ancien perdu si échec) |
| 2026-05-14 | CONCURRENCE | Promotion de version : check-then-act sans lock → deux isLatest / latest non monotone sous concurrence |
| 2026-05-14 | DB | Clé d'advisory lock construite avec des octets NUL (0x00) — PostgreSQL rejette NUL dans text → crash runtime |
| 2026-05-14 | DURABILITÉ | Pipeline d'extraction sans budget temps réel — OCR pathologique tournait jusqu'au hard-kill infra |
| 2026-05-14 | DURABILITÉ | Callbacks onProgress tardifs (smartExtract perdant) réouvraient un run/progress terminal après timeout |
| 2026-05-14 | DB | acquireDocumentLineageLock utilisait $queryRaw sur pg_advisory_xact_lock (void) → P2010 runtime, le lock ne fonctionnait jamais |
| 2026-05-15 | STORAGE | downloadFile en mode Blob passait storagePath (pathname) directement à fetch → Invalid URL pour les rows storageUrl=NULL |
| 2026-05-17 | CONTEXT-ENGINE | base-agent labelait FILE sans sourceDate comme "produit le \<uploadedAt\>" (fallback faux sur la date d'upload) |
| 2026-05-29 | ARCHITECTURE | Relance v2 incomplète vs flux thèse-first : modal de revue absent en v2 + router.refresh() race Inngest → deadlock pending_thesis (409) |

---

## Format d'entrée

```
### [DATE] — [CATÉGORIE] — [Titre court]
- **Fichier(s)** : chemin(s) concerné(s)
- **Erreur** : description précise
- **Cause racine** : pourquoi ça s'est produit
- **Solution validée** : ce qui a fonctionné (avec code si pertinent)
- **Ce qui N'A PAS fonctionné** : tentatives échouées (pour éviter de les retenter)
- **Agent/Auteur** : qui a détecté et corrigé
```

---

## Entrées

### 2026-03-12 — ARCHITECTURE — Fire-and-forget analyse sur Vercel serverless
- **Fichier(s)** : `src/app/api/analyze/route.ts:227-263`
- **Erreur** : L'analyse est lancée en fire-and-forget (`orchestrator.runAnalysis().then().catch()`). Sur Vercel serverless, le runtime tue les processus après retour de la réponse. Les analyses longues (20+ agents, 3-5 min) sont tronquées silencieusement.
- **Cause racine** : Le code Inngest existe (`src/lib/inngest.ts:292-326`) mais la route ne l'utilise pas.
- **Solution validée** : Migrer vers `inngest.send('analysis/deal.analyze', ...)` et faire polling depuis le client.
- **Ce qui N'A PAS fonctionné** : `maxDuration = 300` ne suffit pas (nécessite Vercel Pro et ne couvre pas tous les cas).
- **Agent/Auteur** : Agent Architecture

### 2026-03-12 — CREDITS — Fail-open en production (crédits illimités si DB down)
- **Fichier(s)** : `src/services/credits/usage-gate.ts:128-133, 372-386`
- **Erreur** : Quand les tables de crédit ne sont pas accessibles, le code retourne `success: true, balanceAfter: 9999` SANS vérifier `NODE_ENV`. Bypass total du paywall si la DB a un problème temporaire.
- **Cause racine** : Code de dev conçu pour faciliter le développement local sans migration, jamais protégé pour la prod.
- **Solution validée** : Ajouter `if (process.env.NODE_ENV === 'production') throw error;` avant le fail-open. En prod, retourner `{ success: false, error: 'Credit system unavailable' }`.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent QA + Agent Scoring

### 2026-03-12 — CREDITS — Double refund non protégé (idempotence manquante)
- **Fichier(s)** : `src/services/credits/usage-gate.ts:244-275`
- **Erreur** : `refundCredits()` n'a aucune protection d'idempotence. Un double appel donne 2x le remboursement. Confirmé par le test e2e.
- **Cause racine** : Pas de vérification d'unicité du refund.
- **Solution validée** : Ajouter un check `WHERE NOT EXISTS (creditTransaction WHERE dealId AND action='REFUND')` ou utiliser un refundId unique.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Scoring

### 2026-03-12 — CREDITS — Race condition TOCTOU (check séparé du deduct)
- **Fichier(s)** : `src/app/api/analyze/route.ts:91 vs 207`
- **Erreur** : Le check des crédits (ligne 91) et la déduction (ligne 207) sont séparés par ~100 lignes de code et plusieurs requêtes DB. Deux requêtes concurrentes passent le check.
- **Cause racine** : Pattern check-then-act anti-pattern.
- **Solution validée** : Supprimer le check préalable, utiliser directement `deductCredits()` qui est atomique (`updateMany WHERE balance >= cost`). En cas d'échec, retourner 403.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent QA

### 2026-03-12 — SÉCURITÉ — SSRF dans website-crawler (pas de blocage IP privées)
- **Fichier(s)** : `src/services/context-engine/connectors/website-crawler.ts:167`, `website-resolver.ts:185`
- **Erreur** : Le crawler `fetch()` des URLs sans vérifier si elles pointent vers des adresses internes (localhost, 169.254.169.254). Un fondateur malveillant peut exfiltrer les métadonnées cloud.
- **Cause racine** : La validation SSRF existe pour les webhooks (`/api/v1/webhooks/route.ts:68-86`) mais n'est pas partagée avec le crawler.
- **Solution validée** : Créer une fonction `isPrivateUrl()` bloquant localhost, 127.0.0.1, 169.254.169.254, 10.*, 172.16-31.*, 192.168.*, etc. L'appliquer dans le crawler et le resolver.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Sécurité

### 2026-03-12 — SÉCURITÉ — CRON_SECRET comparaison non timing-safe
- **Fichier(s)** : `src/app/api/cron/maintenance/cleaner/route.ts:24` (+ sourcer, completer, supervisor)
- **Erreur** : `authHeader === Bearer ${cronSecret}` utilise `===` au lieu de `timingSafeEqual`. Vulnerable aux timing attacks.
- **Cause racine** : Code simple sans prise en compte des side-channel attacks.
- **Solution validée** : Utiliser `crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))` avec vérification de longueur préalable.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Sécurité

### 2026-03-12 — POSITIONNEMENT — Termes prescriptifs dans l'UI visible (3 CRITICAL)
- **Fichier(s)** : `src/components/shared/severity-legend.tsx:10`, `severity-badge.tsx:29`, `src/components/chat/deal-chat-panel.tsx:85`
- **Erreur** : "avant d'investir" dans des textes visibles par le BA. Viole la règle N°1 : "Angel Desk ne DÉCIDE JAMAIS".
- **Cause racine** : Reformulation incomplète lors de la migration vers le ton analytique.
- **Solution validée** : Remplacer "avant d'investir" par "avant toute décision" dans les 3 fichiers.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Conformité

### 2026-03-12 — POSITIONNEMENT — 12 violations dans les prompts agents
- **Fichier(s)** : `question-master.ts:368-420`, `legal-regulatory.ts:240`, `synthesis-deal-scorer.ts:360,647-648`, `conditions-analyst.ts:247`, `consensus-engine.ts:276`, `benchmark-tool.ts:346`, `early-warnings.ts:662`
- **Erreur** : "NO GO", "investir SI", "conditional_pass", "investir à l'aveugle", "dealbreakers" dans les prompts LLM. Le LLM reproduit ces termes dans ses réponses.
- **Cause racine** : Les exemples de "BON OUTPUT" contiennent eux-mêmes des termes interdits. Le LLM les reproduit.
- **Solution validée** : Reformuler chaque occurrence (cf. audit conformité complet). Remplacer les exemples par des formulations analytiques.
- **Ce qui N'A PAS fonctionné** : Le result-sanitizer filtre en sortie, mais le problème est en amont dans les prompts.
- **Agent/Auteur** : Agent Conformité

### 2026-03-12 — POSITIONNEMENT — Type verdict désynchronisé du schema Zod
- **Fichier(s)** : `src/agents/types.ts:3334`
- **Erreur** : Le type utilise `"strong_pass" | "pass" | "conditional_pass" | "weak_pass" | "no_go"` alors que le schema Zod utilise déjà `"very_favorable" | "favorable" | "contrasted" | "vigilance" | "alert_dominant"`.
- **Cause racine** : Le schema a été migré mais le type TypeScript n'a pas suivi.
- **Solution validée** : Synchroniser le type avec le schema Zod.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Conformité

### 2026-03-12 — ANTI-HALLUCINATION — Directives manquantes dans les fallbacks legacy
- **Fichier(s)** : `src/agents/orchestration/consensus-engine.ts:1113,1233,1392,1597`, `reflexion.ts:882,942,1000`, `board-orchestrator.ts:925`, `fact-extractor.ts:1097`
- **Erreur** : 9 appels LLM (7 legacy fallbacks + 1 board dedup + 1 fact-extractor meta-eval) n'ont aucune ou seulement certaines des 5 directives anti-hallucination.
- **Cause racine** : Les prompts principaux (Zod-validated) sont conformes, mais les fallbacks legacy (exécutés quand Zod échoue) n'ont pas été mis à jour.
- **Solution validée** : Ajouter les 5 directives dans chaque fallback, ou mieux : supprimer les fallbacks legacy et forcer la validation Zod avec des defaults.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Anti-Hallucination

### 2026-03-12 — ANTI-HALLUCINATION — Directives doublées dans Tier 3 + Chat
- **Fichier(s)** : `src/agents/tier3/*.ts`, `src/agents/chat/deal-chat-agent.ts`
- **Erreur** : Les directives 2-5 sont dans `buildSystemPrompt()` ET re-injectées par `buildFullSystemPrompt()`. Double tokens inutiles.
- **Cause racine** : Les agents Tier 3 ont ajouté les directives manuellement avant que BaseAgent ne les ajoute automatiquement.
- **Solution validée** : Retirer les appels explicites dans les `buildSystemPrompt()` des agents Tier 3 et Chat.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Anti-Hallucination

### 2026-03-12 — UX — Dashboard "Plan: Gratuit / 3 deals/mois" obsolète
- **Fichier(s)** : `src/app/(dashboard)/dashboard/page.tsx:183-196`
- **Erreur** : La carte "Plan" affiche un système d'abonnement alors que le pricing est par crédits.
- **Cause racine** : Remnant de l'ancien modèle par abonnement.
- **Solution validée** : Remplacer par une carte "Crédits" affichant le solde actuel + lien vers /pricing.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Persona BA + Agent UI/UX

### 2026-03-12 — UX — Page /analytics dans le sidebar → 404
- **Fichier(s)** : `src/components/layout/sidebar.tsx:49`
- **Erreur** : Le lien "Analytiques" pointe vers une page inexistante.
- **Cause racine** : Feature planifiée mais pas implémentée, lien laissé en place.
- **Solution validée** : Retirer le lien du sidebar ou créer une page minimale.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent UI/UX

### 2026-03-12 — UX — Accents manquants dans toute l'UI Board + composants
- **Fichier(s)** : `vote-board.tsx`, `arena-view.tsx`, `chat-view.tsx`, `columns-view.tsx`, `timeline-view.tsx`, `board-teaser.tsx`, `first-deal-guide.tsx`, `error.tsx`
- **Erreur** : "Debat", "Majorite", "Echec", "Reduire", "deliberent", "Desaccords", "Reessayer", "Creez", "metriques" — tous sans accents.
- **Cause racine** : Développement rapide sans vérification linguistique.
- **Solution validée** : Corriger systématiquement tous les accents dans les fichiers UI.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent UI/UX

### 2026-03-12 — UX — ScoreBadge labels désalignés avec ui-configs.ts
- **Fichier(s)** : `src/components/shared/score-badge.tsx:33`
- **Erreur** : SCORE_SCALE utilise "Bon" alors que ui-configs.ts dit "Solide" pour 60-79.
- **Cause racine** : Deux sources de vérité pour les labels de score.
- **Solution validée** : Aligner SCORE_SCALE avec `getScoreLabel()` de ui-configs.ts.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent UI/UX

### 2026-03-12 — PERFORMANCE — Export PDF charge results depuis DB (30s+)
- **Fichier(s)** : `src/app/api/deals/[dealId]/export-pdf/route.ts:53-60`
- **Erreur** : L'export PDF charge `analysis.results` directement depuis la DB Neon (blob de plusieurs MB = 30s+) au lieu d'utiliser le Blob cache CDN (<1s).
- **Cause racine** : Le code de la route n'utilise pas `loadResults()` du service persistence.
- **Solution validée** : Remplacer par `loadResults(analysisId)` qui utilise le Blob cache.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Performance

### 2026-03-12 — PERFORMANCE — Deal detail SSR charge extractedText inutilement
- **Fichier(s)** : `src/app/(dashboard)/deals/[dealId]/page.tsx:37-41`
- **Erreur** : `documents: true` charge toutes les colonnes incluant `extractedText` (@db.Text, potentiellement 200KB+). Ce texte n'est jamais affiché sur cette page.
- **Cause racine** : `include: true` au lieu de `select: { fields... }`.
- **Solution validée** : Utiliser `documents: { select: { id: true, name: true, type: true, ... }, orderBy: ... }` sans `extractedText`.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Performance

### 2026-03-12 — ARCHITECTURE — Race condition BaseAgent état mutable singleton
- **Fichier(s)** : `src/agents/base-agent.ts:61-76`, `src/agents/orchestrator/agent-registry.ts:18-19`
- **Erreur** : Les champs `_totalCost`, `_llmCalls`, etc. sont des variables d'instance mutables. Les agents sont cachés comme singletons. Deux analyses concurrentes corrompent les métriques.
- **Cause racine** : Etat mutable dans un singleton + absence d'isolation par requête.
- **Solution validée** : Déplacer l'état mutable dans un objet `RunContext` créé à chaque appel de `run()`, ou utiliser `AsyncLocalStorage`.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Architecture

### 2026-03-12 — SCORING — Incohérence poids Board vs Scoring Tier 3
- **Fichier(s)** : `src/agents/board/board-member.ts:155-160` vs `src/scoring/services/score-aggregator.ts:24-30`
- **Erreur** : Board = Team 40%, Market 25%, Product 20%, Financials 10%, Risques 5%. Scoring = Team 25%, Market 20%, Product 20%, Financials 20%, Timing 15%. Le Board est structurellement plus optimiste sur les deals "bonne équipe / mauvais financials".
- **Cause racine** : Deux systèmes de poids conçus indépendamment.
- **Solution validée** : Aligner les poids du Board avec `stage-weights.ts`, ou documenter explicitement la différence dans l'UI.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Scoring

### 2026-03-12 — RGPD — Vercel Blob access "public" pour les pitch decks
- **Fichier(s)** : `src/services/storage/index.ts:109-111`
- **Erreur** : Les documents sont uploadés en mode `access: "public"`. N'importe qui avec l'URL peut télécharger le pitch deck sans authentification.
- **Cause racine** : Vercel Blob free tier ne supporte que "public". Jamais migré vers le tier payant.
- **Solution validée** : Passer au tier payant Vercel Blob avec `access: "private"`, ou implémenter un proxy authentifié.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent RGPD

### 2026-03-12 — QA — Orchestrator index.ts 3748 lignes / tier1-results.tsx 3978 lignes
- **Fichier(s)** : `src/agents/orchestrator/index.ts`, `src/components/deals/tier1-results.tsx`
- **Erreur** : Fichiers monolithiques impossibles à maintenir.
- **Cause racine** : Croissance organique sans refactoring.
- **Solution validée** : Décomposer en sous-modules thématiques.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent QA

### 2026-03-12 — QA — 120+ console.log non gardés en production
- **Fichier(s)** : 50+ fichiers dans `src/`
- **Erreur** : ~120 `console.log/warn/error` s'exécutent en production, polluant les logs et exposant potentiellement des données.
- **Cause racine** : Pas de logger centralisé avec niveaux.
- **Solution validée** : Adopter un logger centralisé (pino, winston) avec niveaux, désactiver debug/info en prod.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent QA

### 2026-05-13 — ARCHITECTURE — Progress upload non partagé entre invocations Vercel (Redis missing)
- **Fichier(s)** : `src/services/documents/extraction-progress.ts`, `src/services/distributed-state/index.ts`, `prisma/schema.prisma`
- **Erreur** : Le POST `/api/documents/upload` écrivait le progress via `setDocumentExtractionProgress` qui tombait sur `InMemoryStore` (fallback quand `UPSTASH_REDIS_REST_URL` non configuré). Chaque invocation serverless Vercel a sa propre Map → les GET `/api/documents/upload/progress/[id]` lisaient toujours `null`. UI figée à 35% (fallback local du composant) pendant toute l'extraction.
- **Cause racine** : `getDistributedStore()` retombe silencieusement sur InMemoryStore quand Upstash n'est pas configuré. Sur Vercel serverless, chaque invocation = container isolé. Le warn `[DistributedState] No Upstash config found` n'apparaît pas dans les logs visibles côté preview.
- **Solution validée** : Migration du storage vers Postgres via Prisma. Nouveau modèle `DocumentExtractionProgress` (id=progressId, userId, phase, pageCount, pagesProcessed, percent, message, expiresAt). Service réécrit avec `prisma.documentExtractionProgress.upsert/findUnique`. TTL 15 min géré côté lecture (best-effort cleanup). Ajout de `prisma migrate deploy` au script `build`.
- **Ce qui N'A PAS fonctionné** : Bumper `@clerk/nextjs` pour fixer le 404 du polling était orthogonal et n'a rien réglé pour ce bug (le polling renvoyait 200 mais avec `data:null`).
- **Agent/Auteur** : Diag live via Chrome DevTools MCP (session 2026-05-13)

### 2026-05-13 — AUTH — Clerk JWT cookie sync défaillant sur preview deployments
- **Fichier(s)** : `src/lib/clerk-fetch.ts` (nouveau), `src/components/deals/file-upload.tsx`, `package.json` (bump SDK)
- **Erreur** : Sur preview Vercel avec dev keys Clerk (`pk_test_…`), après ~60 s de polling, le SDK browser rafraîchit `__session_<suffix>` mais pas `__session`. Le middleware Clerk lit `__session` (expiré), renvoie page HTML 404 avec `x-clerk-auth-message: JWT is expired … session_refresh_session_token_ineligible`. Toutes les requêtes API du tab basculent en 404 (polling progress + `/api/deals/*/staleness`, etc.). UI continue d'afficher loggé.
- **Cause racine** : Bug dans `@clerk/clerk-js@5` (browser SDK, chargé depuis le CDN Clerk, indépendant du package npm). Le bump `@clerk/nextjs` 6.36.8 → 6.39.3 a légèrement amélioré la tolérance côté middleware mais n'a PAS résolu le bug — le browser SDK reste en `@5` et continue de désynchroniser les cookies. Pas de réglage TTL JWT dispo dans le dashboard Clerk (60 s hardcodé, voir `agentic-mistakes.md` 2026-05-13).
- **Solution validée** : Wrapper `clerkFetch(url, init)` qui appelle `window.Clerk.session.getToken()` (renvoie un JWT frais depuis la session SDK) et attache `Authorization: Bearer <jwt>` à la requête. Vérifié dans `@clerk/backend/dist/internal.js:910` : le middleware tente d'abord le cookie, puis fallback sur Authorization header. Le Bearer frais bypasse le cookie périmé. Appliqué au polling progress en priorité (le plus visible). Generic : peut être étendu à d'autres endpoints au fur et à mesure.
- **Ce qui N'A PAS fonctionné** : (1) Bump SDK 6.36.8 → 6.39.3 seul. (2) Allonger le TTL JWT côté Clerk Dashboard — l'option n'est pas exposée (60 s hardcodé chez Clerk, voir `agentic-mistakes.md` 2026-05-13 PROPOSITION SANS DOC).
- **Agent/Auteur** : Diag live via Chrome DevTools MCP (session 2026-05-13)

### 2026-05-13 — EXTRACTION — "Review requis" + "OCR recommandé" affichés après visual extraction réussie
- **Fichier(s)** : `src/services/documents/extraction-runs.ts:isBlockingReviewPage`, `src/components/deals/extraction-quality-badge.tsx`, `src/app/api/documents/upload/route.ts:783`
- **Erreur** : Sur un PDF où la nouvelle pipeline visuelle a appliqué high_fidelity/supreme OCR à 27 pages avec succès (`quality=100%`, `pagesOCRd=27`), l'UI affiche quand même un dialog "Review requis - Qualité d'extraction: 100%" avec un encart "OCR recommandé" et un bouton "Activer OCR" — alors que l'OCR a déjà été appliqué. Tout le but de la refonte pipeline était d'éviter ce blocage côté UX.
- **Cause racine** : `isBlockingReviewPage` appliquait les MÊMES seuils de blocage aux pages OCR'd qu'aux pages non OCR'd (analyticalValueScore ≥ 35 pour insufficient, plus la branche "shouldBlockIfStructureMissing"). Or après visual extraction tier high_fidelity/supreme, la pipeline a déjà donné son meilleur résultat ; bloquer le BA pour re-déclencher une review manuelle ne rend pas l'extraction plus riche. La chaîne `blockingPages.length > 0 → requiresOCR=true → badge "Review requis" + dialog "OCR recommandé"` se déclenchait pour tout signal sémantique partiel post-OCR.
- **Solution validée** : Ajout de `ocrProcessed?: boolean` à `ExtractionPageReviewShape`. Quand `ocrProcessed === true`, `isBlockingReviewPage` ne bloque plus que pour erreur fatale explicite OU `semanticSufficiency === "insufficient" && analyticalValueScore >= 70` (seuil rehaussé de 35 → 70). La branche `shouldBlockIfStructureMissing` est désactivée post-OCR (la pipeline visuelle ÉTAIT le moyen de capturer la structure ; si elle n'a pas tout récupéré, re-lancer n'aidera pas). Pages sans OCR conservent les seuils existants. `getBlockingPageNumbersFromStoredPages` étendu pour passer `ocrProcessed` depuis le DB (le champ existe déjà sur `DocumentExtractionPage`). Tests `extraction-runs` (5/5) et `golden-corpus` (3/3) restent verts.
- **Ce qui N'A PAS fonctionné** : N/A. Le seul piège : les documents extraits AVANT ce fix conservent leur `extractionMetrics.blockingPages` figé dans le DB — le dialog s'affichera tant qu'ils n'ont pas été re-extraits. À gérer via un backfill ou un re-run manuel si besoin.
- **Agent/Auteur** : Diag live via Chrome DevTools MCP, session 2026-05-13

### 2026-05-13 — SÉCURITÉ — Cross-tenant leak via cache d'extraction par contentHash
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (call site) + nouveau `src/services/documents/extraction-reuse.ts` (fonction extraite)
- **Erreur** : `reuseCompletedExtractionForContentHash` cherchait n'importe quel document `processingStatus=COMPLETED` avec le même `contentHash`, sans filtrer par propriétaire. Conséquence : si user B uploade un fichier dont le hash matche un fichier de user A déjà extrait, on clonait dans le doc B l'`extractedText`, les `DocumentExtractionPage` (avec `artifact`, `textPreview`), les warnings et les metrics — fuite directe du texte OCR / corpus du tenant A vers le tenant B.
- **Cause racine** : code écrit pour économiser des crédits OCR sur ré-upload du même fichier. Le commentaire originel partait du principe qu'un hash identique implique que l'uploader "possède déjà ce document", mais en pratique un Business Angel peut très bien uploader la même Tear Sheet ou le même Excel modèle qu'un autre utilisateur.
- **Solution validée** : extraction de la fonction vers `extraction-reuse.ts` (testable isolément), ajout d'un paramètre `userId` obligatoire et d'un filtre `deal: { userId: params.userId }` sur le `prisma.document.findFirst`. Cross-tenant = retourne `null`, pas de transaction. Test : `extraction-reuse.test.ts` (3 cas dont assertion explicite du filtre `deal: { userId }`).
- **Ce qui N'A PAS fonctionné** : N/A — fix direct.
- **Agent/Auteur** : Audit Codex Phase 1 (2026-05-13), implémentation Claude.

### 2026-05-13 — UX — Upload failed déclenchait toast success + auto-close du dialog
- **Fichier(s)** : `src/components/deals/file-upload.tsx`, `src/components/deals/document-upload-dialog.tsx`
- **Erreur** : `handleUploadAll` dans `FileUpload` appelait `onAllComplete()` inconditionnellement à la fin de la boucle, même si chaque appel à `uploadFile` avait retourné `false` (HTTP error, signature invalide, virus, etc.). Dans `DocumentUploadDialog`, ce callback affichait `toast.success("Documents uploadés avec succès")` et auto-fermait le dialog au bout de 500ms — alors qu'en réalité tout avait échoué. L'utilisateur croyait l'upload réussi.
- **Cause racine** : `onAllComplete` était `() => void` sans transport du résumé succès/échec. Le composant parent ne pouvait pas distinguer les cas.
- **Solution validée** : `onAllComplete` typé `(summary: { successCount, errorCount }) => void`. `handleUploadAll` agrège les retours de `uploadFile`. `DocumentUploadDialog.handleAllComplete` : si `successCount === 0`, return immédiat (pas de toast, pas d'auto-close, les toasts d'erreur per-fichier ont déjà été affichés via `onError`). Si mix, toast hybride "N ajoutés, M en échec". Si tout réussi, comportement préservé.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 1 (2026-05-13), implémentation Claude.

### 2026-05-13 — UX — Progress upload pouvait régresser (36% → 1%) quand le polling serveur écrasait le state local
- **Fichier(s)** : `src/components/deals/file-upload.tsx`
- **Erreur** : Le composant set localement `serverProgress.percent = 36` à la fin du transfert blob ("Transfert terminé"), puis le polling distant lit le snapshot Postgres qui peut renvoyer un percent plus bas (extraction phase=started, percent=1%). `setServerProgress(payload)` direct écrasait → barre régresse visuellement → confusion UX.
- **Cause racine** : pas de garde monotone sur les updates de progress. Le polling et les setters synchrones du composant ne se coordonnaient pas.
- **Solution validée** : extraction d'une fonction pure `mergeMonotonicProgress(prev, next)` (testée) qui empêche `next.percent < prev.percent` sauf phases terminales `completed`/`failed` (qui doivent pouvoir settle l'UI). Tous les `setServerProgress({...})` non-null passent par `applyServerProgress` qui utilise ce merge. `setServerProgress(null)` reste utilisé pour le reset explicite entre fichiers.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 1 (2026-05-13), implémentation Claude.

### 2026-05-13 — CREDITS — Retry OCR / re-process inutilisable ne refundait pas les crédits + requiresOCR jamais remis à false
- **Fichier(s)** : `src/app/api/documents/[documentId]/extraction-pages/[pageNumber]/retry/route.ts`, `src/app/api/documents/[documentId]/process/route.ts`
- **Erreur (2 bugs)** :
  1. La branche 422 du retry (`!retryResult.success || retryPage.text.trim().length === 0`) retournait sans rembourser les 2 crédits `EXTRACTION_SUPREME_PAGE` débités juste avant. Le bloc `catch` refundait mais le 422 est un return normal, pas un throw — donc skippé. Idem pour la branche 500 (text vide) de `/process` avec `EXTRACTION_HIGH_PAGE`.
  2. Sur le retry réussi, la transaction setait `Document.requiresOCR = true` inconditionnellement (au sens "OCR a tourné"). L'UI lit `requiresOCR` comme "OCR encore requis" et affichait toujours "Review requis" + "OCR recommandé" même après retry réussi sur toutes les pages bloquantes.
- **Cause racine** :
  1. Le pattern "deduct au début, refund dans catch" oubliait les early-returns en mode dégradé (422, 500). Ces returns ne passent pas par le catch.
  2. Confusion sémantique de `requiresOCR` : "OCR a été appliqué" vs "OCR encore nécessaire". Le code écrivait le premier sens, l'UI lisait le second.
- **Solution validée** :
  1. Refund explicite dans chaque branche d'échec avec `idempotencyKey` distinct (`extraction:refund:supreme-page:${requestId}` et `extraction:refund:reprocess:${requestId}`). `chargedCredits = 0` après refund pour neutraliser un éventuel re-refund dans le catch. Réponse JSON inclut `refundedCredits` pour transparence côté client. Test `retry/__tests__/route.test.ts` (2 cas : selectiveOCR.success=true mais texte vide, selectiveOCR.success=false).
  2. Après `refreshRunExtractionStats(latestRun.id, updatedCorpus)` (qui recompute `unresolvedPages`), si `refreshedRun.readyForAnalysis === true` alors `prisma.document.update({ requiresOCR: false })`. L'UI repasse propre. Réponse JSON inclut désormais `requiresOCR` calculé.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 1 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — Blob client fetch+décrypt AVANT vérification ownership/analyse/parent
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (readBlobUploadInput + POST handler)
- **Erreur** : Pour la branche client-blob, `readBlobUploadInput` pullait `body.file.blobUrl` (50 MB) depuis Vercel Blob, déchiffrait avec la clé AES-GCM fournie dans le body, puis SEULEMENT après le POST handler vérifiait `deal.userId === user.id`, parent doc, running analysis, MIME, size. Si l'une de ces checks échouait, on avait déjà payé la bande passante + CPU décrypt sans cleanup.
- **Cause racine** : Le code `readUploadInput` faisait du I/O au moment de la lecture du body au lieu de retourner des métadonnées + un fetcher différé. Inversion d'ordre dans le pipeline.
- **Solution validée** : Réécriture du type `UploadInput` avec `source: "multipart" | "blob"` + `fetchBuffer: () => Promise<Buffer>` différé. `readBlobUploadInput` ne fait plus que valider l'URL Blob et retourner un closure qui pulle+déchiffre à la demande. Le POST handler appelle `fetchBuffer()` UNIQUEMENT après deal ownership, parent, running analysis, MIME, size. Pour la multipart path, le buffer est immédiat (déjà en mémoire).
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — Pas de match entre blobPathname et dealId du body (cross-deal blob substitution)
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (POST handler)
- **Erreur** : Le client construit le pathname temp `tmp/document-uploads/${dealId}/${random}-${filename}.enc`. Le serveur ne vérifiait PAS que le `dealId` segment du path correspondait au `dealId` du body. Un attaquant (avec session valide) pouvait POST `{ dealId: "deal_X_owned", blobPathname: "tmp/document-uploads/deal_Y/..." }` et faire copier un blob de `deal_Y` dans le storage de `deal_X`.
- **Cause racine** : `validateTemporaryBlobUrl` ne vérifiait que le format (`tmp/document-uploads/` prefix) sans corréler au dealId du body. Confiance implicite que le client construit son propre path.
- **Solution validée** : Après `cuidSchema` du dealId mais AVANT le fetch buffer, vérifier `blobPathname.startsWith(\`tmp/document-uploads/${dealId}/\`)`. Si non, `bailWithCleanup(400, ...)` (delete le temp blob aussi).
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — STORAGE — Temp blob orphelin sur early-returns
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (POST handler, branches early-return)
- **Erreur** : Sur 7+ early-returns du handler (deal not found, parent not found, parent CUID invalid, dealId invalid, running analysis, `!file`, `!dealId`), le code retournait `NextResponse.json(...)` SANS appeler `cleanupUploadSource(cleanupSourceUpload)`. Seules les branches MIME/size/signature/dedup faisaient le cleanup. Les autres laissaient le temp blob dans `tmp/document-uploads/...` jusqu'à expiration manuelle (jamais en pratique).
- **Cause racine** : Pattern "ajouter cleanup à la main avant chaque return" répété de manière incomplète au fil des features ajoutées.
- **Solution validée** : Helper `bailWithCleanup(status, payload)` centralisé qui fait `await cleanupUploadSource(cleanupSourceUpload); cleanupSourceUpload = null; return NextResponse.json(...)`. Tous les early-returns concernés réécrits via ce helper.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — STORAGE — Blob final orphelin si Document.create échoue après uploadFile
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (POST handler)
- **Erreur** : Séquence : (1) `uploadFile(deals/${dealId}/${name}, buffer)` créait le blob final. (2) `prisma.document.update` sur l'ancien doc (version bump) — pouvait throw. (3) `prisma.document.create` — pouvait throw. Si (2) ou (3) échouait, le catch handlait `cleanupSourceUpload` (= temp blob, déjà supprimé) mais PAS le blob final fraîchement créé. Storage fuyait, sans Document row qui pointe dessus.
- **Cause racine** : Pas de tracker pour le blob final. Le pattern existait pour le temp blob mais pas pour le final.
- **Solution validée** : Variable `cleanupFinalBlob: (() => Promise<void>) | null = null` en haut du handler. Armé juste après `uploadFile()` succès. Désarmé (`= null`) juste après `prisma.document.create()` succès. Le catch appelle BOTH `cleanupSourceUpload` ET `cleanupFinalBlob`.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — STORAGE — Delete deal n'effaçait pas les blobs documents
- **Fichier(s)** : `src/app/api/deals/[dealId]/route.ts` (DELETE handler)
- **Erreur** : `prisma.deal.delete` faisait un cascade-delete SQL des Document rows mais ne touchait jamais au storage. Tous les pitch decks/Excel models PDF restaient dans Vercel Blob (= paid storage) sans aucune Document row pour les référencer. Aucun audit n'aurait pu les retrouver après suppression.
- **Cause racine** : Cascade DB ≠ cascade stockage externe. Vercel Blob ne sait pas que les Document rows ont disparu.
- **Solution validée** : Avant `prisma.deal.delete`, `prisma.document.findMany({ where: { dealId }, select: { id, storageUrl, storagePath }})` puis boucle `deleteFile()` tolérante aux échecs (un blob 410 ne bloque pas la DB delete). `console.warn` détaille les échecs partiels. Réponse JSON inclut `blobDeletionFailures: number`. 3 tests dans `[dealId]/__tests__/route.test.ts`.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — RGPD — storageUrl Vercel Blob brut renvoyé aux clients
- **Fichier(s)** : `src/app/api/deals/[dealId]/route.ts` (GET + PATCH), `src/app/api/documents/[documentId]/route.ts` (GET + PATCH), `src/app/api/documents/upload/route.ts` (POST), `src/app/(dashboard)/deals/[dealId]/page.tsx` (SSR), `src/components/deals/{documents-tab,file-upload,document-preview-dialog}.tsx`
- **Erreur** : Les réponses JSON exposaient `storageUrl: "https://xyz.public.blob.vercel-storage.com/deals/..."` qui est une URL Vercel Blob *publique* (le service n'a pas de bucket privé). N'importe qui avec l'URL accédait au blob (chiffré côté Angel Desk mais quand même : pas la stratégie qu'on documente). Les clients consommaient déjà preview/download via `/api/documents/:id/...` côté serveur, donc le `storageUrl` n'était qu'un guard truthy "le doc a un fichier".
- **Cause racine** : Code Prisma `select: { storageUrl: true }` historique avant que les routes serveur de preview/download soient en place.
- **Solution validée** : Stripping serveur de `storageUrl` + `storagePath` dans toutes les réponses qui sortaient. Remplacé par `hasStorage: boolean` synthétisé. Côté client : `UploadedDocumentSummary`, `Document`, `DocumentPreviewDialog` props mis à jour, `disabled={!doc.storageUrl}` → `disabled={!doc.hasStorage}`. Helper `maskDocumentStorage()` centralisé dans `[dealId]/route.ts`.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — Chemin Blob deals/${dealId}/${filename} énumérable et leakait le filename
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (storageKey)
- **Erreur** : Le path Vercel Blob était `deals/${dealId}/${sanitizedFilename}`. Conséquences : (1) filename leak dans l'URL Vercel Blob (admin dashboard, logs, signed URL display). (2) Énumération possible : si un attaquant connaît dealId + filename habituels (pitch_deck.pdf, cap_table.xlsx), il peut deviner d'autres blobs du même tenant. (3) Re-upload même filename → écrasement implicite du blob (avant que F62 version tracking soit en place).
- **Cause racine** : Path human-readable choisi pour faciliter le debug ops. Pas pensé pour la confidentialité.
- **Solution validée** : `deals/${dealId}/${randomUUID()}${safeExtension}` — UUID v4 opaque + extension préservée pour content-type sniffing (`.pdf`, `.xlsx`, etc.). dealId conservé en prefix pour l'ops legibility (Vercel dashboard, log greps), mais le nom du fichier n'apparaît plus dans le storage path. Le `Document.name` DB conserve le nom original pour l'UI/download.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — blobUrl pas binder à blobPathname (cleanup = primitive de delete arbitraire)
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (validateTemporaryBlobUrl)
- **Erreur** : `validateTemporaryBlobUrl` validait séparément le domaine du `blobUrl` et le préfixe du `blobPathname`, sans vérifier que les deux pointaient sur le même blob. Un caller authentifié pouvait submit `{ blobUrl: "https://store.public.blob.vercel-storage.com/path/A", blobPathname: "tmp/document-uploads/<my-dealId>/path-B.enc" }`. Les deux passent leurs checks individuels. Ensuite, sur n'importe quelle early-return downstream qui appelait `cleanupUploadSource`, le code exécutait `deleteFile(body.file.blobUrl)` — supprimant un blob qui n'appartenait potentiellement pas au caller. La route devenait une primitive de delete arbitraire (le caller choisit ce qu'on supprime).
- **Cause racine** : Validation par composants au lieu de validation de la *cohérence* entre composants. Le code partait du principe que client honnête → URL et pathname identiques.
- **Solution validée** : Dans `validateTemporaryBlobUrl`, après les checks de domaine et préfixe, extraire `decodeURIComponent(new URL(blobUrl).pathname).replace(/^\/+/, "")` et exiger une égalité stricte avec `blobPathname`. Si non, throw `UploadRequestError("Blob URL does not match the declared pathname", 400)`. Le binding s'effectue AVANT l'arming du `cleanupSourceUpload` (cf. erreur suivante). Test : `upload/__tests__/route.test.ts` "rejects with 400 when blobUrl pathname does not match blobPathname (no deleteFile)".
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — cleanup armé avant ownership prouvée
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (POST handler order)
- **Erreur** : Même avec le binding URL↔pathname (erreur précédente), le code armait `cleanupSourceUpload` *immédiatement* après `readUploadInput`, AVANT les checks `dealId-vs-pathname` et `deal.findFirst`. Conséquence : un caller authentifié pouvait submit un blobUrl/pathname binder qui pointait dans un OTHER tenant's namespace (`tmp/document-uploads/<deal-victime>/...`), avec dans le body `dealId = <son-deal>`. Le `bailWithCleanup` déclenché plus tard supprimait le blob de la victime. Le binding URL↔pathname ne suffisait PAS : il faut aussi que le pathname soit dans LE namespace du caller ET que le caller possède ce namespace.
- **Cause racine** : Pattern "j'ai un cleanup, je l'arme dès que je peux" — sans prise en compte que ce cleanup pouvait s'appliquer à un blob d'un autre tenant tant que l'ownership n'est pas vérifiée.
- **Solution validée** : Réordonnancement strict du POST handler. Cleanup armé UNIQUEMENT après : (1) URL↔pathname binding, (2) `pathname.startsWith(\`tmp/document-uploads/${dealId}/\`)`, (3) `deal.findFirst({ id: dealId, userId })` succès. Toutes les early-returns AVANT cette ligne utilisent `NextResponse.json` direct (pas de cleanup). Toutes les early-returns APRÈS utilisent `bailWithCleanup` (delete sûr car blob prouvé comme étant à nous). Tests : "rejects with 400 when blobPathname's dealId segment does not match" et "returns 404 for unowned deal without fetching or deleting" verts.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — /api/documents/upload/client générait token sans matcher pathname↔dealId
- **Fichier(s)** : `src/app/api/documents/upload/client/route.ts` (onBeforeGenerateToken)
- **Erreur** : Le générateur de token client (handleUpload de @vercel/blob/client) recevait `pathname` (du client) et `clientPayload.dealId` (aussi du client). Le code vérifiait que pathname.startsWith(`tmp/document-uploads/`) et que le caller ownait `parsedPayload.dealId`. Mais il n'exigeait PAS que `pathname.startsWith(\`tmp/document-uploads/${parsedPayload.dealId}/\`)`. Conséquence : un caller authentifié soumettait `{ pathname: "tmp/document-uploads/<victim-deal>/foo.enc", clientPayload: { dealId: "<my-deal>" }}`. Token généré, upload autorisé dans le namespace de la victime. Contrat "temp blob scoped by deal" reposait uniquement sur l'honnêteté du client.
- **Cause racine** : Le check pathname et le check dealId étaient indépendants ; pas de check de cohérence entre eux.
- **Solution validée** : Après le parse du `clientPayload` et le CUID check du dealId, vérifier `pathname.startsWith(\`tmp/document-uploads/${parsedPayload.dealId}/\`)`. Si non, throw `ClientUploadTokenError("Upload pathname does not match the target deal", 400)` avant la génération du token.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — RGPD — Temp Blob pathname leakait le filename original avant cleanup
- **Fichier(s)** : `src/components/deals/file-upload.tsx` (buildTemporaryBlobPathname)
- **Erreur** : `tmp/document-uploads/${dealId}/${crypto.randomUUID()}-${sanitizedName}.enc` — le filename original (sanitized) apparaissait dans le path Vercel Blob *public-readable* jusqu'à ce que le cleanup serveur le supprime. Window de visibilité = durée upload + extraction (potentiellement plusieurs minutes). Le filename peut contenir des infos sensibles (nom du fondateur, codename du deal, etc.).
- **Cause racine** : Le filename était laissé dans le path "pour le debug" — pas pensé pour la confidentialité.
- **Solution validée** : `tmp/document-uploads/${dealId}/${crypto.randomUUID()}.enc` — opaque. Le filename original reste dans le body JSON (chiffré in-transit via HTTPS, jamais persisté en path public).
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — QA — Incohérence storageUrl-only vs storageUrl ?? storagePath
- **Fichier(s)** : `src/app/api/deals/[dealId]/route.ts` (maskDocumentStorage + select), `src/app/api/documents/[documentId]/route.ts` (DELETE)
- **Erreur** : Le cascade-delete deal utilisait `storageUrl ?? storagePath` (défensif). Mais `maskDocumentStorage` calculait `hasStorage: Boolean(storageUrl)` (sans fallback). Et DELETE document individuel utilisait seulement `document.storageUrl`. Pour les rows legacy ou local-dev avec storagePath mais sans storageUrl, le blob restait orphelin (DELETE doc) ou le client voyait `hasStorage: false` à tort (deal detail).
- **Cause racine** : Refactor par endroit sans audit transverse. Chaque site a sa propre sémantique de "ce document a-t-il un fichier ?".
- **Solution validée** : Tous les sites lisent `storageUrl ?? storagePath`. `maskDocumentStorage` strip les deux et compute `hasStorage: Boolean(storageUrl ?? storagePath)`. Ajout de `storagePath: true` au select Prisma des documents dans GET/PATCH deal. DELETE document utilise `document.storageUrl ?? document.storagePath` pour la cible.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 2 (2026-05-13), implémentation Claude.

### 2026-05-13 — QA — process/ocr/retry routes bloquaient sur document.storageUrl seul
- **Fichier(s)** : `src/app/api/documents/[documentId]/process/route.ts`, `src/app/api/documents/[documentId]/ocr/route.ts`, `src/app/api/documents/[documentId]/extraction-pages/[pageNumber]/retry/route.ts`
- **Erreur** : Les trois routes faisaient `if (!document.storageUrl) return 400 "Document has no storage URL"` puis `downloadFile(document.storageUrl)`. Or le schema (`prisma/schema.prisma:266`) autorise `storagePath` sans `storageUrl` (rows local-dev / legacy). Pour ces rows, l'utilisateur recevait un 400 alors que le blob existait bien et était accessible via `storagePath`. Inconsistant avec download/preview/delete qui géraient déjà `storageUrl ?? storagePath`.
- **Cause racine** : Refactor par site. Quand `storagePath` a été ajouté au schema/services, les routes OCR/reprocess n'ont pas été mises à jour. Phase 2 fix-up a corrigé `maskDocumentStorage` + DELETE doc, mais a raté ces 3 routes OCR-adjacent.
- **Solution validée** : Pattern uniforme dans chaque route : `const storageTarget = document.storageUrl ?? document.storagePath;` puis check `!storageTarget` + `downloadFile(storageTarget)`. Message d'erreur ajusté ("storage reference"). Test ajouté : `retry/__tests__/route.test.ts` "downloads using storagePath when storageUrl is null" — vérifie que `downloadFile` est appelé avec le storagePath quand storageUrl est null.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 2 résiduel (2026-05-13), implémentation Claude.

### 2026-05-13 — RGPD — DocumentExtractionPage.artifact + textPreview stockaient le corpus OCR brut en clair
- **Fichier(s)** : `prisma/schema.prisma` (DocumentExtractionPage.artifact: Json?, textPreview: String?), `src/services/documents/extraction-runs.ts`, `src/app/api/documents/[documentId]/extraction-pages/[pageNumber]/retry/route.ts`, `src/app/api/documents/[documentId]/extraction-audit/route.ts`, `src/agents/document-context-retriever.ts`, `src/services/pdf/ocr-service.ts`, `src/lib/encryption.ts`.
- **Erreur** : Pour chaque page d'extraction, on stockait en clair dans la DB :
  - `artifact` (Json) : objet `DocumentPageArtifact` contenant `text` (texte intégral de la page OCR), `tables[].markdown`/`.rows` (cellules), `charts[].description`/`.values` (chart data), `numericClaims[].label`/`.value`/`.sourceText` (claims numériques extraits), `visualBlocks[].title`/`.description`.
  - `textPreview` (String) : 300 premiers caractères du texte de page.
  Conséquences : tout dump SQL, backup, snapshot Neon, ou requête `prisma studio` exposait le contenu OCR complet hors du seul champ documenté `Document.extractedText` (qui lui était déjà chiffré). Violation du principe que le corpus utilisateur ne sort jamais en clair de la zone chiffrée.
- **Cause racine** : Évolution incrémentale du schema. Le champ `Document.extractedText` a été chiffré tôt, mais `DocumentExtractionPage.artifact` + `textPreview` ont été ajoutés ensuite (manifest structuré, audit dialog) sans appliquer le même traitement. Audit point Codex Phase 3.
- **Solution validée** :
  1. Nouveau helper `encryptJsonField(value)` dans `src/lib/encryption.ts` : sérialise JSON + chiffre avec AES-256-GCM, retourne `{ _enc: "ad1", data, v: 1 }` (envelope).
  2. Nouveau helper `safeDecryptJsonField(value)` : compat-legacy. Si la valeur est un envelope `_enc: "ad1"` → décrypter + JSON.parse. Si plaintext object → retourne tel quel. Si null → null. Si decrypt fail → null + console.warn.
  3. Wrapper `encryptExtractionPagePayload({ artifact, textPreview })` dans `extraction-runs.ts` exporté pour usage cross-fichier. Appelé à TOUS les sites d'écriture : `recordExtractionPageProgress`, `buildExtractionPageCreateInput` (utilisé par recordDocumentExtractionRun + completeDocumentExtractionRun), retry route success path. Le retry failed path utilise `encryptText` directement pour le textPreview.
  4. À TOUS les sites de lecture : `safeDecryptJsonField(page.artifact)` + `safeDecrypt(page.textPreview)` :
     - `extraction-audit/route.ts` (sérialisation client : artifact, textPreview, provider, verification, semanticAssessment).
     - `extraction-runs.ts:getBlockingPageNumbersFromStoredPages` (décision de blocage).
     - `retry/route.ts:canRetryPage` (introspection tables/charts/numericClaims).
     - `document-context-retriever.ts:formatExtractionPageArtifact` (prompt LLM analyse).
     - `ocr-service.ts:normalizeDocumentPageArtifact` (cache OCR par hash d'image).
  5. Compat legacy plaintext : les anciennes rows ne sont PAS migrées au backfill. À la lecture, `safeDecryptJsonField` détecte le marker `_enc: "ad1"` et fallback sur plaintext pour le reste. Garantie : zero downtime, zero breaking change pour les rows existantes.
  6. Phase 1 `extraction-reuse.ts` : pas modifié. Le clonage copie l'envelope/plaintext as-is dans la target row → la décryption fonctionne uniformément.
- **Test** : 7 tests helper (`encryption.test.ts`) + 12 tests non-régression (`phase3-encryption-compat.test.ts`) couvrant :
  - Round-trip ciphertext → plaintext exact.
  - Ciphertext ne contient AUCUNE substring du corpus brut (audit gate "Codex refuse si texte OCR brut lisible en DB").
  - Compat legacy : plaintext artifact + plaintext textPreview retournés verbatim.
  - Decision blocking identique pour rows legacy vs encrypted.
  - Tables / charts / numericClaims / visualBlocks survivent round-trip avec égalité stricte.
  - Phase 1 extraction-reuse (envelope cloning) reste correct.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 3 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — Phase 3 fail-open : isPageArtifactToxic ne déchiffrait pas → bypass UNVERIFIED_ARTIFACT
- **Fichier(s)** : `src/services/documents/extraction-readiness-policy.ts` (readPageVerificationState + readVerificationEvidence)
- **Erreur** : Après Phase 3, `artifact` est stocké en envelope `{ _enc: "ad1", data, v: 1 }`. `readPageVerificationState(artifact)` lisait `(artifact as { verification?: unknown }).verification` au top-level → l'envelope n'a pas de champ `verification` → `state = null`. Donc `isPageArtifactToxic` retournait `false` pour TOUTE page chiffrée, même `parse_failed`. Conséquence : le gate `UNVERIFIED_ARTIFACT` (qui empêche une analyse de tourner sur un corpus toxic) était entièrement bypassé pour tout document re-extrait après Phase 3. Mini-repro live : `isPageArtifactToxic({ verification: { state: "parse_failed" } })` → true, `isPageArtifactToxic(encryptJsonField(...))` → false.
- **Cause racine** : Phase 3.3 a wrappé 5 sites de lecture (extraction-audit, getBlockingPageNumbersFromStoredPages, canRetryPage, document-context-retriever, ocr-service cache) mais a raté que `extraction-readiness-policy.ts` est un module séparé qui consume aussi `page.artifact`. Le grep "page.artifact" l'aurait trouvé ; je n'ai grep que sur les routes publiques. Audit Codex P1.
- **Solution validée** : Import `safeDecryptJsonField` directement dans `extraction-readiness-policy.ts`. `readPageVerificationState` ET `readVerificationEvidence` font le décrypt en première ligne — ainsi tous les callers existants (`isPageArtifactToxic` et tous les sites externes qui appelaient ces deux fonctions) deviennent corrects sans changement. Le commentaire d'en-tête "Ne doit dependre d'AUCUN autre module interne" a été assoupli explicitement pour autoriser `@/lib/encryption` (leaf utility avec zéro deps internes, no cycle possible). Test RED→GREEN dans `phase3-leak-findings.test.ts` "flags a parse_failed artifact as toxic whether stored encrypted or plaintext".
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 3 (2026-05-13), implémentation Claude.

### 2026-05-13 — RGPD — Phase 3 evidence-ledger ne déchiffrait pas → 0 tables/charts/numericClaims pour les agents
- **Fichier(s)** : `src/services/evidence-ledger/index.ts` (asRecord)
- **Erreur** : `buildEvidenceLedgerFromContext` faisait `asRecord(page.artifact)` directement sur l'envelope `{ _enc, data, v }`. asRecord retournait l'objet envelope (non-null, est bien un object) mais sans `.tables`/`.charts`/`.numericClaims`. Résultat : `countArray(artifact.tables) === 0`, idem pour charts et numericClaims. Le ledger remontait aux agents `0 tables, 0 charts, 0 numeric claims` pour TOUS les documents re-extraits après Phase 3. Les prompts agents perdaient silencieusement leurs evidence structurées : claims numériques (ARR, burn, runway), tables (P&L), charts (growth curves). Régression critique sur la qualité d'analyse.
- **Cause racine** : Même cause que l'erreur précédente — Phase 3.3 a wrappé les sites front-facing mais a raté evidence-ledger qui est consommé par tous les agents Tier 1/2/3 via leur prompt-builder.
- **Solution validée** : `asRecord` modifié pour faire `safeDecryptJsonField(value)` AVANT le type check. Une seule fonction wrappée, tous les sites de consommation (2 dans evidence-ledger : `buildEvidenceLedgerFromContext` + `countNumericClaims`) deviennent corrects sans changement. Test RED→GREEN : "returns identical structured counts for encrypted vs plaintext artifacts" — vérifie que `coverage.documentArtifactCount`, `coverage.visualArtifactCount`, `coverage.numericClaimCount` sont identiques pour les deux formats.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 3 (2026-05-13), implémentation Claude.

### 2026-05-13 — RGPD — Phase 3 extraction-reuse propageait du plaintext legacy dans une nouvelle row
- **Fichier(s)** : `src/services/documents/extraction-reuse.ts` (pages: create)
- **Erreur** : Lors du clonage Phase 1 (réutilisation d'extraction par contentHash), `extraction-reuse.ts` copiait `artifact` et `textPreview` verbatim depuis la source. Pour une row legacy plaintext, la cible — qui est une **nouvelle écriture post-Phase-3** — recevait du plaintext non chiffré. Violation directe de l'invariant Phase 3 "toutes les nouvelles écritures sont chiffrées sur disque". Conséquence : un fondateur uploade un PDF dont le hash matche une extraction legacy d'avant Phase 3 → la nouvelle row du tenant courant a son corpus OCR en clair dans la DB. Failed audit gate Codex "refuse si du texte OCR brut reste lisible en DB hors Document.extractedText".
- **Cause racine** : J'ai analysé le pattern de clonage et conclu "envelope-to-envelope copy fonctionne au read". Vrai pour les sources Phase-3, faux pour les sources legacy. Erreur de raisonnement : j'aurais dû modéliser explicitement les 4 cas (legacy source × legacy/encrypted target intent) avant de conclure.
- **Solution validée** : Deux helpers `reEncryptArtifactForReuse(stored)` + `reEncryptTextPreviewForReuse(stored)` dans extraction-reuse.ts. Ils lisent via `safeDecryptJsonField` / `safeDecrypt` (handle legacy + encrypted), puis re-chiffrent avec un IV frais via `encryptJsonField` / `encryptText`. La target row est TOUJOURS chiffrée, quelle que soit la forme de la source. Tests RED→GREEN dans `phase3-leak-findings.test.ts` : "writes ENCRYPTED artifact + textPreview to the target row even when the source is legacy plaintext" + "preserves an already-encrypted source artifact (envelope-to-envelope copy stays correct)".
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 3 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — Phase 3 fail-open résiduel : envelope chiffrée corrompue = "pas d'artifact"
- **Fichier(s)** : `src/lib/encryption.ts` (safeDecryptJsonField + nouveau tryDecryptJsonField), `src/services/documents/extraction-readiness-policy.ts` (isPageArtifactToxic), `src/services/documents/extraction-reuse.ts` (reEncryptArtifactForReuse + reEncryptTextPreviewForReuse)
- **Erreur** : Même après le fix Phase 3.5(a), `safeDecryptJsonField` collapsait 3 états distincts en `null` : (1) artifact absent (null), (2) legacy plaintext null, (3) envelope chiffrée présente mais indéchiffrable. Le toxic gate lisait `state === null` et retournait `false` (= "pas toxique") pour les 3 cas — y compris l'envelope corrompue. Repro live Codex : `isPageArtifactToxic({ _enc: "ad1", data: "not-valid-ciphertext", v: 1 }) === false`. Conséquence : si DOCUMENT_ENCRYPTION_KEY est rotée, ou si la DB est tampered (insertion d'un envelope avec ciphertext bidon), tous les pages affectées passent le gate UNVERIFIED_ARTIFACT silencieusement. Idem dans `extraction-reuse.reEncryptArtifactForReuse` : envelope corrompue → safeDecryptJsonField null → encryptJsonField(null) null → `Prisma.DbNull` écrit sur la target row. Le clonage "nettoyait" silencieusement les rows tampered.
- **Cause racine** : API ambiguë de `safeDecryptJsonField` retournant le même `null` pour 3 sémantiques différentes. Les callers de sécurité (toxic gate, reuse) ont besoin de distinguer "absent" (OK) de "corrupted" (fail-closed). J'avais conçu l'helper pour le cas read-and-display où "null = no artifact" suffit. Pas adapté aux gates security-sensitive.
- **Solution validée** :
  1. Nouveau type `DecryptedJsonFieldResult<T>` discriminé : `{ kind: "absent" } | { kind: "plaintext", value } | { kind: "decrypted", value } | { kind: "corrupted", reason }`.
  2. Nouvelle fonction `tryDecryptJsonField(value)` qui retourne ce result.
  3. `safeDecryptJsonField` réécrite comme wrapper qui collapse absent+corrupted en null (compat ascendante).
  4. `isPageArtifactToxic` : check explicite `if (isEncryptedJsonField(artifact) && tryDecryptJsonField(...).kind === "corrupted") return true`. Fail-closed avant le check `state === null`.
  5. `reEncryptArtifactForReuse` : switch sur `result.kind`. `corrupted` → throw `CorruptedSourceArtifactError`. La transaction Prisma rollback ; le caller fall back sur une vraie ré-extraction.
  6. `reEncryptTextPreviewForReuse` : si la string ressemble à du chiffré (`isEncrypted`) mais ne décrypte pas, throw aussi.
  Tests RED→GREEN dans `phase3-leak-findings.test.ts` : "fail-closed: corrupted envelope must be toxic" + "fail-closed: corrupted envelope on the source must NOT be cloned as Prisma.DbNull".
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 3.5 (2026-05-13), implémentation Claude.

### 2026-05-13 — SÉCURITÉ — Phase 3 textPreview fail-closed buggé : safeDecrypt swallow l'erreur
- **Fichier(s)** : `src/lib/encryption.ts` (nouveau tryDecryptText), `src/services/documents/extraction-reuse.ts` (reEncryptTextPreviewForReuse)
- **Erreur** : Mon fix Phase 3.5(d) pour le textPreview disait "throw si décryption échoue" mais utilisait `safeDecrypt(stored)` qui contient son propre try/catch et retourne l'input verbatim sur échec. Le try/catch externe ne se déclenchait jamais. Conséquence : un textPreview base64 corrompu (passant la heuristique `isEncrypted` mais échouant la décryption AES auth-tag) était traité comme plaintext et ré-encrypté tel quel → le ciphertext original corrompu re-apparaît dans la nouvelle row. Repro live Codex : `isEncrypted=true, safeDecryptReturnedOriginal=true, clonedDecryptsToOriginalCiphertext=true`.
- **Cause racine** : Confusion entre la sémantique "ergonomique" (`safeDecrypt` retourne input sur échec, pratique pour le display) et la sémantique "strict" (un security gate doit voir l'échec). Le `try/catch` autour de `safeDecrypt` est code mort puisque `safeDecrypt` ne throw jamais.
- **Solution validée** : Miroir exact du pattern `tryDecryptJsonField` pour les strings. Nouveau `tryDecryptText(text)` exposé dans `encryption.ts` qui retourne `DecryptedTextResult = { kind: "plaintext" | "decrypted" | "corrupted", value?, reason? }`. `reEncryptTextPreviewForReuse` réécrit en switch sur `result.kind` : `corrupted` → throw `CorruptedSourceArtifactError`. La transaction Prisma rollback ; le caller fall back sur une vraie ré-extraction. Test RED→GREEN dans `phase3-leak-findings.test.ts` : "fail-closed: corrupted encrypted-looking textPreview on source must throw" + 4 tests directs `tryDecryptText` dans `encryption.test.ts` (plaintext / decrypted / corrupted / "differs from safeDecrypt").
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex post-Phase 3.5(d) (2026-05-13), implémentation Claude.

### 2026-05-14 — ARCHITECTURE — /process route faisait smartExtract inline (Vercel maxDuration=300, risque troncation)
- **Fichier(s)** : `src/app/api/documents/[documentId]/process/route.ts` (refactor complet), `src/services/documents/extraction-pipeline.ts` (nouveau), `src/lib/inngest.ts` (nouvelle Inngest function)
- **Erreur** : La route POST `/api/documents/[documentId]/process` exécutait `smartExtract` inline (download blob → OCR sur N pages → completeRun → updateDocument), avec `maxDuration = 300`. Sur Vercel serverless, un document de >50 pages OCR peut largement dépasser 5 min, le runtime kill le process à 300 s SANS cleanup → document en `PROCESSING` éternel, crédits débités, partial run écrit en DB. Même problème que `/api/analyze` corrigé en 2026-03-12 mais sur la surface document extraction. Cf. entrée errors.md 2026-03-12 ARCHITECTURE "Fire-and-forget analyse sur Vercel serverless".
- **Cause racine** : Pattern "tout faire dans la route" hérité de l'époque où l'extraction était rapide (PDF native text). Avec l'arrivée de l'OCR Vision sur N pages (introduit en 2026-Q1), le temps d'exécution dépasse régulièrement les limites Vercel.
- **Solution validée** (Phase 4.1, vertical slice auditable) :
  1. Nouveau service `src/services/documents/extraction-pipeline.ts:runDocumentExtractionPipeline({ documentId, extractionRunId })`. Contient la logique d'extraction (download + smartExtract + completeRun + updateDocument). Idempotent : si le run est déjà en état terminal (READY/READY_WITH_WARNINGS/BLOCKED/FAILED), retourne le résumé caché sans re-exécuter. Pages persistées via `recordExtractionPageProgress` (upsert par runId+pageNumber → safe sur retry partiel).
  2. Nouvelle Inngest function `documentExtractionFunction` (event `document/extraction.run`) qui wrap le service dans un `step.run` checkpointé. Sur throw : refund via `refundCreditAmount(idempotencyKey=dispatchRefundKey)` puis mark document FAILED. Retries: 1. Concurrency: 3 / user.
  3. Route `/process` réécrite pour : (a) claim PROCESSING atomique, (b) deduct credits (avec idempotency key), (c) startDocumentExtractionRun, (d) `inngest.send({ id: 'document-extraction:${runId}', name: 'document/extraction.run', data: {...} })`, (e) return 202. Pre-enqueue catch : refund + revert PROCESSING.
  4. `maxDuration` route passé de 300 → 30 (HTTP work bounded : DB writes + 1 Inngest send).
  5. Tests : 12 sur le pipeline (happy path, idempotency sur 4 statuts terminaux, 5 paths d'erreur), 8 sur la route (202 + enqueue + ordering deduct→send + refund-on-failure + race-condition guard + 403 / 400), 4 sur l'Inngest function (succès, refund+FAILED sur throw, refund failure logged, skip refund si chargedCredits=0).
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4 (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Compensation/catch ne terminalisaient pas le DocumentExtractionRun
- **Fichier(s)** : `src/services/documents/extraction-runs.ts` (nouveau `terminalizeExtractionRunAsFailed`), `src/services/documents/extraction-pipeline.ts`, `src/lib/inngest.ts`, `src/app/api/documents/[documentId]/process/route.ts`
- **Erreur** : Phase 4.1 marquait `Document.processingStatus = FAILED` sur échec mais laissait le `DocumentExtractionRun` (créé `PROCESSING` par `startDocumentExtractionRun`) dans cet état non-terminal. Cas concret : si `downloadFile` échoue AVANT `completeDocumentExtractionRun`, le run reste `PROCESSING` à vie. Impact : le `latestRun` n'est jamais terminal → readiness gate, polling UI et audit dialog restent dans un état incohérent (extraction "en cours" éternelle).
- **Cause racine** : Le pipeline et la compensation Inngest traitaient le Document et le Run comme deux entités indépendantes, alors que le Run doit toujours suivre le Document vers un état terminal. Les paths `downloadFile fail` / `smartExtract throw` / `MIME guard` n'atteignaient jamais `completeDocumentExtractionRun` (le seul endroit qui terminalisait le run).
- **Solution validée** : Nouveau helper idempotent `terminalizeExtractionRunAsFailed(runId, reason)` — `updateMany WHERE id AND status IN [PENDING, PROCESSING]` → `status: FAILED`. Idempotent (no-op si déjà terminal), safe à appeler depuis tous les catch. Branché dans : (1) le try/catch global du pipeline (`runDocumentExtractionPipeline` wrap `runExtractionWork` ; toute exception → terminalise run + document avant re-throw), (2) la compensation Inngest (`compensate-failed-extraction` step, défensif si le pipeline crash avant son propre catch), (3) le catch pré-enqueue de /process. Tests : `terminalizes the run + document when downloadFile fails`, `... when smartExtract throws`, `throws MIME_UNSUPPORTED and terminalizes the run`, + assertion dans le test Inngest function.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.1 fix-up (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Retry Inngest voyant un run FAILED retournait success sans refund
- **Fichier(s)** : `src/services/documents/extraction-pipeline.ts` (summarizeExistingRun + idempotency branch)
- **Erreur** : Le pipeline traitait un run terminal `FAILED` comme un cas d'idempotence "normal" : `summarizeExistingRun` retournait `{ status: "FAILED" }` sans throw. Scénario : attempt 1 marque le run FAILED puis le worker Inngest crash AVANT que `compensate-failed-extraction` ait fini (pas de refund). Le retry Inngest re-exécute le pipeline → voit `run.status === "FAILED"` → retourne `{ status: "FAILED" }` → la fonction Inngest traite ça comme un succès du `step.run` → le catch ne tourne JAMAIS → **l'utilisateur n'est jamais remboursé**.
- **Cause racine** : Confusion entre "idempotence = ne pas refaire le travail" et "idempotence = atteindre le même état final". Pour un run SUCCESS, retourner le résumé caché est correct. Pour un run FAILED, le "même état final" inclut la compensation (refund) — qui peut ne pas avoir tourné.
- **Solution validée** : La branche d'idempotence du pipeline distingue maintenant : run terminal SUCCESS (READY / READY_WITH_WARNINGS / BLOCKED) → `summarizeExistingRun` retourne le résumé (no-op). Run terminal FAILED → **throw** `ExtractionPipelineError(..., "EXTRACTION_FAILED")`. Le throw route le retry dans le catch de la fonction Inngest, dont le refund est idempotent via `dispatchRefundKey`. Test : `P1.2: re-running on a FAILED run THROWS (so the Inngest catch re-compensates idempotently)`.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.1 fix-up (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — /process pre-enqueue catch laissait le run orphelin PROCESSING
- **Fichier(s)** : `src/app/api/documents/[documentId]/process/route.ts`
- **Erreur** : Si `startDocumentExtractionRun` réussit puis `inngest.send` throw, le catch pré-enqueue refundait les crédits et révertait le `Document.processingStatus`, mais laissait le `DocumentExtractionRun` (créé `PROCESSING`) orphelin — aucun consumer ne le ferait jamais avancer (le job Inngest n'a jamais été enqueued).
- **Cause racine** : Le tracker `orphanRunId` n'existait pas ; le catch ne connaissait pas l'id du run créé.
- **Solution validée** : Variable `orphanRunId: string | null` en haut du handler. Set à `progressRun.id` juste après `startDocumentExtractionRun`. Remis à `null` juste après `inngest.send` succès (le run appartient désormais à la fonction Inngest). Le catch : si `orphanRunId` est non-null → `terminalizeExtractionRunAsFailed(orphanRunId, reason)`. Tests : `refunds + reverts PROCESSING + terminalizes the orphan run when inngest.send throws` + `does NOT terminalize the run when inngest.send succeeds`.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.1 fix-up (2026-05-14), implémentation Claude.

### 2026-05-14 — UX — Client traitait le 202 async comme "Extraction terminée"
- **Fichier(s)** : `src/components/deals/document-extraction-audit-dialog.tsx`
- **Erreur** : Après le passage de /process en async (202 enqueued), le `reprocessMutation.onSuccess` du audit dialog affichait toujours `toast.success("Extraction renforcee terminee")` immédiatement — alors que l'extraction n'a fait que démarrer. L'utilisateur croyait l'extraction finie alors qu'elle tournait encore en background.
- **Cause racine** : Le client n'a pas été adapté au changement sync→async de la route. Le `onSuccess` d'une mutation react-query se déclenche dès la réponse HTTP, qui est maintenant un 202 immédiat.
- **Solution validée** : (1) `onSuccess` stocke `result.data.extractionRunId` dans un state `reprocessRunId` et affiche `"Extraction renforcee lancee — traitement en cours"`. (2) Le `useQuery` du audit a un `refetchInterval: reprocessRunId ? 3000 : false` → poll tant qu'un run est en attente. (3) Un `useEffect` watch `audit.latestRun` : quand `latestRun.id === reprocessRunId` ET `latestRun.status` ∈ {READY, READY_WITH_WARNINGS, BLOCKED, FAILED} → clear `reprocessRunId`, toast final ("terminee" ou "echouee"), invalide readiness. (4) `extractionActionPending` inclut `reprocessRunId !== null` → la barre de progression reste affichée pendant tout le traitement durable. `notifyDocumentUpdated` wrappé en `useCallback` pour stabilité de la dep du useEffect.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.1 fix-up (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Finalisation succès non-atomique entre DocumentExtractionRun et Document parent
- **Fichier(s)** : `src/services/documents/extraction-runs.ts` (completeDocumentExtractionRun + param documentFinalization), `src/services/documents/extraction-pipeline.ts`
- **Erreur** : Le pipeline appelait `completeDocumentExtractionRun()` (transaction 1 : terminalise le run en READY/READY_WITH_WARNINGS/BLOCKED) PUIS séparément `prisma.document.update()` (transaction 2 : `extractedText` + `processingStatus: COMPLETED`). Pas atomique. Si le process crash ou si `document.update` throw APRÈS la terminalisation du run : run terminal-success commité, document encore PROCESSING / sans extractedText. Le catch ne peut plus réparer le run (`terminalizeExtractionRunAsFailed` ne touche que PENDING/PROCESSING). Au retry, l'idempotency check voit le run terminal-success → `summarizeExistingRun` retourne le résumé caché SANS re-muter le document. Résultat : run READY + document non exploitable. Trou de durabilité central pour upload/OCR/analyse.
- **Cause racine** : Deux transactions séquentielles là où il faut une atomicité. Le run et le document étaient traités comme deux commits indépendants alors que la finalisation succès doit être tout-ou-rien.
- **Solution validée** : Param optionnel `documentFinalization: { documentId, data }` ajouté à `completeDocumentExtractionRun`. Quand fourni, `tx.document.update` s'exécute DANS le même `prisma.$transaction` que la terminalisation du run + la création des pages. Soit les deux commitent, soit aucun. Le pipeline (`runDocumentExtractionPipeline`) construit `documentData` (COMPLETED+extractedText OU FAILED+errorWarning selon `isSuccess`) et le passe en `documentFinalization` — plus aucun `prisma.document.update` séparé. Si la transaction rollback : le run reste PROCESSING → le retry re-run le pipeline proprement (jamais run=READY + document non finalisé). Les callers legacy (upload/ocr routes, non encore migrés) omettent `documentFinalization` → comportement inchangé. Tests : `P1 (atomicity): when completeDocumentExtractionRun throws, the run is terminalized FAILED and NO orphan run-READY-without-document is left` (pipeline) + 3 tests `complete-extraction-run-atomic.test.ts` (document update DANS la tx, ordering run→doc, legacy sans documentFinalization ne touche pas le document, throw propagé).
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.1 fix-up #2 (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Corpus vide → run terminal non-FAILED (mapRunStatus ignore le texte final)
- **Fichier(s)** : `src/services/documents/extraction-runs.ts` (completeDocumentExtractionRun)
- **Erreur** : `completeDocumentExtractionRun` dérivait le statut du run uniquement depuis le manifest via `mapRunStatus(manifest)`. Or le chemin OCR peut retourner `success: true` avec `pagesProcessed > 0` mais un corpus final vide : `extractTextWithOCR` → `composeOCRText` (`ocr-service.ts`) retourne `""` quand toutes les pages OCR ont `text.length === 0`. Dans ce cas, le manifest peut être `ready_with_warnings` ou `needs_review` → `mapRunStatus` retourne `READY_WITH_WARNINGS` / `BLOCKED` (terminal-success). Le pipeline finalise pourtant le document en FAILED (car `isSuccess = Boolean(extraction.text)` est false) et throw → refund. Résultat incohérent : run terminal-success + document FAILED. Un retry voit le run terminal-success → `summarizeExistingRun` no-op → l'incohérence est permanente.
- **Cause racine** : `mapRunStatus` raisonne sur le manifest (qui décrit le traitement page-par-page) sans tenir compte du fait que la composition finale du corpus peut être vide. Le statut du run ne doit jamais contredire "il n'y a pas de texte exploitable".
- **Solution validée** : Dans `completeDocumentExtractionRun`, `const hasUsableCorpus = params.text.trim().length > 0;` puis `const status = hasUsableCorpus ? mapRunStatus(params.manifest) : "FAILED";` et `readyForAnalysis = hasUsableCorpus && (status === "READY" || status === "READY_WITH_WARNINGS")`. Corpus vide → run FORCÉ FAILED, cohérent avec le document FAILED. Test RED→GREEN dans `complete-extraction-run-atomic.test.ts` : `P1: forces run status FAILED when the final corpus is empty, even if the manifest says ready_with_warnings` + `keeps the manifest-derived status when the corpus is non-empty` (non-régression).
- **Ce qui N'A PAS fonctionné** : Le fix-up #3 ne traitait QUE `completeDocumentExtractionRun` — le caller pipeline gardait `Boolean(extraction.text)` (cf. entrée suivante fix-up #4).
- **Agent/Auteur** : Audit Codex Phase 4.1 fix-up #3 (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Pipeline et completeDocumentExtractionRun divergeaient sur la définition de "succès"
- **Fichier(s)** : `src/services/documents/extraction-runs.ts` (nouveau `hasUsableExtractionCorpus`), `src/services/documents/extraction-pipeline.ts`
- **Erreur** : Après le fix-up #3, `completeDocumentExtractionRun` utilisait `params.text.trim().length > 0` mais le pipeline utilisait encore `const isSuccess = Boolean(extraction.text)`. Pour un corpus whitespace-only (`text: "   \n  "`) : `Boolean(text)` est `true` mais `text.trim().length > 0` est `false`. Conséquence — divergence à 3 niveaux : (1) `completeDocumentExtractionRun` force le run en FAILED, (2) le pipeline construit `documentFinalization` en COMPLETED, (3) le pipeline retourne `status: "COMPLETED"` → la fonction Inngest ne rembourse pas. Run FAILED + document COMPLETED + API COMPLETED + pas de refund.
- **Cause racine** : Deux définitions de "succès d'extraction" dupliquées dans deux modules. Le fix-up #3 n'a corrigé qu'un des deux call sites.
- **Solution validée** : Helper partagé `hasUsableExtractionCorpus(text)` exporté depuis `extraction-runs.ts` — `typeof text === "string" && text.trim().length > 0`. Source unique de vérité. `completeDocumentExtractionRun` l'utilise pour `hasUsableCorpus`. Le pipeline l'utilise pour `isSuccess`. Plus aucune duplication. Test RED→GREEN dans `extraction-pipeline.test.ts` : `P1: treats a whitespace-only corpus as a FAILURE (no run/document/API divergence)` — `smartExtract` retourne `text: "   \n  \t "` + manifest `ready_with_warnings` + `pagesProcessed: 3` → le pipeline throw `EXTRACTION_FAILED` ET `documentFinalization.data.processingStatus === "FAILED"`.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.1 fix-up #4 (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Paths inline legacy utilisaient encore la truthiness brute pour COMPLETED/FAILED
- **Fichier(s)** : `src/services/documents/extraction-runs.ts` (recordDocumentExtractionRun), `src/app/api/documents/[documentId]/ocr/route.ts`, `src/app/api/documents/upload/route.ts` (paths PDF inline, image, Excel, Word, PowerPoint)
- **Erreur** : Le helper `hasUsableExtractionCorpus` (fix-up #4) était utilisé par `completeDocumentExtractionRun` et le durable pipeline, mais PAS par les 6 sites inline legacy : (1) `recordDocumentExtractionRun` dérivait le statut du run de `mapRunStatus(manifest)` seul, (2) la route OCR faisait `result.text ? "COMPLETED" : "FAILED"`, (3) le path PDF inline de l'upload faisait `result.text ? "COMPLETED" : "FAILED"`, (4-6) les paths image/Excel/Word/PowerPoint de l'upload mettaient `processingStatus: "COMPLETED"` *inconditionnellement*. Conséquence : un corpus whitespace-only → run FAILED (via `recordDocumentExtractionRun`/`completeDocumentExtractionRun` déjà fixés) MAIS document COMPLETED → la divergence run/document que les fix-ups #2-4 visaient à éliminer persistait sur tout le périmètre legacy.
- **Cause racine** : Les fix-ups #2-4 ont corrigé les fonctions DB partagées et le durable pipeline, mais les routes HTTP legacy (non encore migrées vers le durable pipeline) ont leur propre logique de finalisation du document, dupliquée et non mise à jour. Gate explicite Codex pour Phase 4.2.
- **Solution validée** : `hasUsableExtractionCorpus` appliqué partout : (1) `recordDocumentExtractionRun` — `status = hasUsableCorpus ? mapRunStatus(manifest) : "FAILED"` (miroir de `completeDocumentExtractionRun`). (2) Route OCR — `processingStatus`/`extractedText` gated sur `hasUsableExtractionCorpus(result.text)`. (3-6) Upload route — chaque path inline (PDF/image/Excel/Word/PowerPoint) gate `processingStatus`/`extractedText` sur `hasUsableExtractionCorpus(<text variable>)`. Tests : 5 tests directs `hasUsableExtractionCorpus` (`extraction-runs.test.ts`) + 2 tests `recordDocumentExtractionRun` corpus vide → FAILED (`complete-extraction-run-atomic.test.ts`).
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.2 step 1 — gate truthiness (2026-05-14), implémentation Claude.

### 2026-05-14 — ARCHITECTURE — Upload route faisait smartExtract PDF inline (Vercel maxDuration, soft-timeout décoratif)
- **Fichier(s)** : `src/app/api/documents/upload/route.ts` (path PDF), `src/services/documents/extraction-pipeline.ts`, `src/lib/inngest.ts`
- **Erreur** : Le path PDF de l'upload route exécutait `smartExtract` inline (~300 lignes) avec un `extractionTimeoutGuard` `setTimeout` "soft timeout" de 270s — décoratif : sur Vercel serverless, le runtime kill le process sans laisser le `setTimeout` s'exécuter proprement. Un PDF de >50 pages OCR dépassait régulièrement la fenêtre d'exécution → document `PROCESSING` éternel + run orphelin + crédits débités. Même pattern que `/process` (corrigé Phase 4.1) et `/api/analyze` (corrigé 2026-03-12), mais sur la surface upload.
- **Cause racine** : L'upload faisait toute l'extraction dans la requête HTTP. Avec l'OCR Vision multi-pages (introduit 2026-Q1), le temps d'exécution dépasse les limites Vercel.
- **Solution validée** (Phase 4.2 step 2) :
  1. Path PDF de l'upload réécrit : `estimatePdfExtractionCost` → pre-charge worst-case → `prisma.document.update PROCESSING` → `startDocumentExtractionRun` → `inngest.send('document/extraction.run', { reason: "upload", reconcileCredits: true, uploadProgressId, documentName, chargedCredits, dispatchRefundKey })`. ~300 lignes de smartExtract inline supprimées (avec le soft-timeout décoratif). Catch pré-enqueue : refund + `terminalizeExtractionRunAsFailed` + document FAILED.
  2. Pipeline `runDocumentExtractionPipeline` étendu : param `progressPublishing` (publie `DocumentExtractionProgress` aux phases started/native_extracted/page_processed/completed/failed pour le poller upload client) + `actualCredits` dans le résultat.
  3. Inngest function `documentExtractionFunction` étendue : (a) forward `progressPublishing` au pipeline, (b) step `reconcile-extraction-credits` sur succès si `reconcileCredits` — delta charge (`extraction:delta:${runId}`) ou refund (`extraction:reconcile-refund:${runId}`) selon `actualCredits` vs `chargedCredits`, (c) step `trigger-thesis-reextract` sur succès si `reason === "upload"` — déplacé depuis l'upload route (le document n'atteint COMPLETED que dans la fonction Inngest désormais).
  4. Réponse upload : pour un PDF enqueued, `response.extraction = { ...vides, pending: true }`. Le client poll `/api/documents/upload/progress/[id]`.
  5. `maxDuration` de l'upload route inchangé (le path multipart non-PDF reste inline) ; le path PDF ne fait plus que des writes DB + 1 `inngest.send`.
- **Tests** : 4 pipeline (actualCredits, progress started→completed, progress failed, no-progress si omis), 8 Inngest function (reconciliation refund/delta/equal/absent/refund-fail + thesis trigger exists/no-thesis/non-upload), 4 upload route (enqueue event shape, pre-charge avant send, 402 pas d'enqueue, refund+terminalize sur send-throw).
- **Ce qui N'A PAS fonctionné** : Le premier jet du step 2 a laissé 2 trous (cf. entrées suivantes) : la modal upload ne pollait pas réellement le progress async, et un échec d'enqueue retournait quand même 201.
- **Hors scope** : images / Excel / Word / PowerPoint restent inline (truthiness corrigée step 1). Migration durable de ces formats = sous-phase ultérieure.
- **Agent/Auteur** : Audit Codex Phase 4.2 step 2 (2026-05-14), implémentation Claude.

### 2026-05-14 — UX — Migration PDF async : modal upload ne pollait pas + échec d'enqueue = succès
- **Fichier(s)** : `src/components/deals/file-upload.tsx`, `src/app/api/documents/upload/route.ts`
- **Erreur (2 trous)** :
  1. **Modal ne poll pas l'extraction async** : la route renvoie `extraction.pending: true` pour un PDF enqueued, mais le client traitait toute réponse 2xx comme succès immédiat. `handleUploadAll` faisait `setIsUploading(false)` + `setActiveProgressId(null)` juste après la boucle HTTP. Le poller ne tourne que `if (isUploading && activeProgressId)` → il s'arrêtait avant que l'extraction durable finisse. Le progress publié par Inngest était quasi inutilisé ; le dialog pouvait afficher succès + auto-close pendant que l'OCR tournait.
  2. **Échec d'enqueue compté comme succès** : si `inngest.send` throw, la route compensait (refund + terminalize + document FAILED) mais *continuait* et retournait 201. Le client (`response.ok`) → fichier `success` → toast "Documents uploadés avec succès". Régression directe de la règle Phase 1 "failed upload : pas de success toast".
- **Cause racine** : Le step 2 a migré le serveur en async mais n'a pas adapté le contrat client. Le client était écrit pour un upload synchrone (réponse HTTP = résultat final).
- **Solution validée** :
  1. `FileToUpload.status` += `"extracting"`. `UploadApiResult` += `extraction?.pending`. `uploadFile` retourne `{ ok, pending, progressId }` ; un PDF `pending` → statut `"extracting"`, `onUploadComplete` différé. `handleUploadAll` : si un fichier est `pending`, garde `isUploading` true + `activeProgressId` sur son progressId, stocke les counts dans `deferredCountsRef`, ne tear-down PAS. Nouveau `useEffect` terminal-watcher : quand `serverProgress.phase` ∈ {completed, failed}, settle le fichier (`success`/`error`), tear-down, `onAllComplete` avec les counts finaux. Le poller existant continue de tourner (isUploading reste true).
  2. Route : la branche catch d'enqueue throw maintenant `UploadRequestError(503)` au lieu de continuer. Le client le transforme en exception via `parseUploadApiResponse` → fichier `error`, pas de success toast.
- **Tests** : upload route — `returns 5xx (NOT a success 201) ... when inngest.send throws` (status 503 + refund + terminalize). Client : couvert par tsc + revue (même pattern que le terminal-watcher du audit dialog Phase 4.1 ; pas de RTL dans ce repo).
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.2 step 2 — P1 (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Retry sur run terminal ne republiait pas le progress terminal
- **Fichier(s)** : `src/services/documents/extraction-pipeline.ts`
- **Erreur** : Si le worker Inngest crash APRÈS le commit DB (run terminal) mais AVANT `publishUploadProgress(completed)`, le retry voit le run terminal → branche d'idempotence : `summarizeExistingRun` retourne directement (READY) ou throw (FAILED) — sans republier le progress terminal. Le progress row reste non-terminal. Une fois le client corrigé pour vraiment poller (cf. entrée précédente), ce trou laisse la modal poller à l'infini.
- **Cause racine** : La branche d'idempotence du pipeline ne couvrait que la cohérence run/document, pas la cohérence du progress row (table `DocumentExtractionProgress`, séparée).
- **Solution validée** : Dans la branche d'idempotence : run terminal SUCCESS → `publishUploadProgress({ phase: "completed", pageCount })` avant de retourner `summarizeExistingRun`. Run terminal FAILED → `publishUploadProgress({ phase: "failed" })` avant de throw. Idempotent (republier le même phase terminal est sans effet de bord). Tests RED→GREEN : `a retry landing on a terminal {READY|READY_WITH_WARNINGS|BLOCKED} run republishes completed progress` (it.each) + `a retry landing on a terminal FAILED run republishes failed progress before throwing`.
- **Ce qui N'A PAS fonctionné** : N/A.
- **Agent/Auteur** : Audit Codex Phase 4.2 step 2 — P2 (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Nouvelle version démotait l'ancien document avant que sa propre extraction réussisse
- **Fichier(s)** : `src/app/api/documents/upload/route.ts`, `src/services/documents/extraction-runs.ts`, `src/services/documents/extraction-reuse.ts`
- **Erreur** : À l'upload d'une nouvelle version (même nom + deal), l'ancien document était `prisma.document.update({ isLatest: false, supersededAt: now })` IMMÉDIATEMENT, puis le nouveau créé `isLatest: true` — avant même que l'extraction de la nouvelle version ait tourné. Si cette extraction échouait ensuite (PDF corrompu, OCR vide, crash worker), le deal pointait sur un document `isLatest: true` cassé et l'ancien (fonctionnel) était définitivement démoté, sans fallback.
- **Cause racine** : La promotion `isLatest` était couplée à la CRÉATION de la row, pas à la RÉUSSITE de l'extraction. Aucune notion de "version candidate".
- **Solution validée** : Phase 4.3. (1) Nouvelle version créée comme CANDIDATE (`isLatest: false`) ; document neuf reste `isLatest: true` (rien à préserver). (2) Suppression du démote eager. (3) `promoteDocumentVersionTx(tx, documentId)` : promotion gated COMPLETED, lineage-scopée `(dealId, name, corpusParentDocumentId)`, monotone par version (une vieille version qui complète tard ne démote pas un winner plus récent → pas d'oscillation), démote tous les autres `isLatest` du lineage puis promeut → exactement un `isLatest: true` par lineage. (4) Path PDF durable : promotion DANS la transaction de `completeDocumentExtractionRun` (atomique avec le statut terminal du run). Reuse : promotion dans sa transaction de clonage. Inline image/Office : `promoteDocumentVersion` en fin de route une fois COMPLETED connu. Une extraction qui échoue ne promeut jamais → ancien document préservé. Tests : `promote-document-version.test.ts` (10) + `complete-extraction-run-atomic.test.ts` (ordre run→finalize→promote) + `upload/route.test.ts` (+2 : neuf=isLatest true, réupload=candidate sans démote eager).
- **Ce qui N'A PAS fonctionné** : La première implémentation faisait le check `newerLatest` puis le démote/promote SANS lock ni isolation → race en concurrence (voir entrée suivante). Corrigé au fix-up.
- **Agent/Auteur** : Plan Codex Phase 4.3 (2026-05-14), implémentation Claude.

### 2026-05-14 — CONCURRENCE — Promotion de version : check-then-act sans lock → deux isLatest / latest non monotone
- **Fichier(s)** : `src/services/documents/extraction-runs.ts`, `src/app/api/documents/upload/route.ts`
- **Erreur** : `promoteDocumentVersionTx` lisait `newerLatest` (y a-t-il une version plus récente déjà `isLatest` ?) puis, plus loin dans la même transaction, démotait les autres `isLatest` et promouvait le candidat. Transaction Prisma par défaut (READ COMMITTED), aucune isolation explicite, aucun lock de lineage, aucune contrainte unique "un seul isLatest par lineage". Scénario : v2 et v3 candidates terminent quasi simultanément ; tx v2 lit "pas de newer latest" pendant que v3 est encore candidate ; v3 promeut et commit ; v2 reprend, démote v3, promeut v2 → le latest repart en arrière (v3 → v2). Idem côté création : `version + 1` calculé hors transaction → deux uploads concurrents du même filename créent deux v2.
- **Cause racine** : Garantie de monotonie reposant sur un check-then-act non atomique. Le séquentiel passait, la concurrence non. Tests mockés ne couvraient que le séquentiel.
- **Solution validée** : Advisory lock transactionnel par lineage. `acquireDocumentLineageLock(tx, lineage)` = `SELECT pg_advisory_xact_lock(hashtext(key))`, `key` dérivé de `(dealId, name, corpusParentDocumentId)`, tenu jusqu'à la fin de la transaction. (1) `promoteDocumentVersionTx` prend le lock AVANT le check `newerLatest` + les writes → section critique sérialisée par lineage ; re-read de `processingStatus` DANS le lock (reprocess concurrent). (2) Upload route : assignation de version + `create` déplacés dans un `$transaction` qui prend le lock d'abord ; `version = MAX(version) + 1` sur tout le lineage → versions distinctes pour candidates concurrentes. Un seul lock par transaction (un doc = un lineage) → pas de deadlock. NON fait (suivi explicite) : index unique partiel "un seul isLatest par lineage" — nécessite migration SQL brute (NULL de corpusParentDocumentId) + nettoyage data ; les locks ferment la race au niveau applicatif. Tests : `promote-document-version.test.ts` (+4 : lock avant check/writes, clé dérivée du lineage, pas de lock si non-COMPLETED, re-read sous lock) + `upload/route.test.ts` (+1 : create dans $transaction lock-protégé, MAX(version)).
- **Ce qui N'A PAS fonctionné** : La première version du helper de lock construisait la clé avec des octets NUL comme séparateur → bug runtime DB (voir entrée suivante). Corrigé au ré-audit.
- **Agent/Auteur** : Audit Codex Phase 4.3 — P1 (2026-05-14), implémentation Claude.

### 2026-05-14 — DB — Clé d'advisory lock construite avec des octets NUL (0x00)
- **Fichier(s)** : `src/services/documents/extraction-runs.ts` (`acquireDocumentLineageLock`)
- **Erreur** : La clé du `pg_advisory_xact_lock` était construite par template string avec `\0` (NUL) comme séparateur entre `dealId`, `name`, `corpusParentDocumentId`, puis passée comme paramètre `text` à `hashtext($key)`. PostgreSQL **refuse les octets 0x00 dans les valeurs `text`** → `$queryRaw` aurait throw au runtime AVANT même de protéger la section critique, à chaque upload et chaque promotion de version.
- **Cause racine** : Choix d'un séparateur invisible (NUL) sans vérifier la contrainte PostgreSQL sur `text`. Non détecté par les tests : `$queryRaw` est mocké, les assertions vérifiaient seulement que la clé *contient* les bons morceaux — pas l'absence de NUL ni l'exécution réelle.
- **Solution validée** : Clé construite via `JSON.stringify(["doc-lineage", dealId, name, corpusParentDocumentId ?? ""])` — jamais de NUL brut, délimitation non ambiguë (échappement JSON ; deux lineages distincts ne peuvent pas produire la même string même si `name` contient un séparateur). Test ajouté : `expect(key).not.toContain("\0")` + `expect(JSON.parse(key)).toEqual([...])` avec un `name` contenant un espace. Test DB live réel (`SELECT pg_advisory_xact_lock(hashtext($key))`) repoussé en Phase 4.5.
- **Ce qui N'A PAS fonctionné** : N/A — corrigé au ré-audit.
- **Agent/Auteur** : Audit Codex ré-audit Phase 4.3 fix-up — P1 (2026-05-14), implémentation Claude.

### 2026-05-14 — DURABILITÉ — Pipeline d'extraction sans budget temps réel
- **Fichier(s)** : `src/services/pdf/ocr-service.ts`, `src/services/documents/extraction-pipeline.ts`
- **Erreur** : L'ancien upload route avait un soft-timeout *décoratif* (`Promise.race` contre un timer qui n'abortait rien — `smartExtract` continuait à tourner). Supprimé en Phase 4.2 sans remplacement. Résultat : le pipeline durable lançait `smartExtract` avec `maxOCRPages: Infinity` et AUCUN budget temps — une extraction OCR pathologique (PDF scanné volumineux) tournait jusqu'à ce que l'infra Inngest hard-kill le step (non gracieux : run laissé PROCESSING, pas de refund propre, dépend du catch Inngest pour rattraper).
- **Cause racine** : Le "timeout" n'a jamais été un vrai mécanisme d'abort — c'était un `Promise.race` qui résolvait tôt sans stopper le travail sous-jacent. Aucun `AbortSignal` threadé dans les boucles OCR.
- **Solution validée** : Phase 4.4 + fix-up. Vrai `AbortController` armé par le pipeline (`EXTRACTION_TIME_BUDGET_MS = 8 min`, soft budget interne devant déclencher avant toute limite infra). DEUX mécanismes combinés, aucun suffisant seul : (1) `signal` threadé dans toute la chaîne OCR (`smartExtract` → `extractTextWithOCR`/`selectiveOCR`/`runVisualOCRPlan`/`runStructuredProviderPlan` → boucles feuilles `processSelectedPdfPages`/`processAllPdfPages`) ; les boucles feuilles checkent `signal.aborted` entre batchs → `break` → arrêt coopératif du travail de fond ; (2) `budgetDeadline` (Promise rejetée par le timer) **racée** contre `smartExtract` → le pipeline réagit à la deadline même si un sous-appel non-coopératif (provider structuré Google/Azure sans abort) n'a pas rendu la main. Budget dépassé → `throw ExtractionPipelineError("EXTRACTION_TIMEOUT")` (message préfixé `EXTRACTION_TIMEOUT:` → préfixe stable persisté dans `blockedReason`) → catch externe terminalise run+document FAILED → catch Inngest refund. Tests : `extraction-pipeline.test.ts` (+3, fake timers, dont un où `smartExtract` ne résout JAMAIS) + `ocr-service-abort-budget.test.ts` (3).
- **Ce qui N'A PAS fonctionné** : (1) La 1re version ne faisait que l'abort coopératif (check entre batchs) + `await smartExtract` → pas un budget GLOBAL : un appel non-coopératif (provider structuré sans abort, requête LLM en vol) pouvait bloquer le pipeline au-delà de 8 min. Corrigé au fix-up #1 via la race contre `budgetDeadline`. Le code `EXTRACTION_TIMEOUT` n'était pas non plus persisté de façon stable (P2) — corrigé via préfixe message. (2) Après la race, le `smartExtract` perdant continuait en arrière-plan et ses callbacks `onProgress` tardifs pouvaient réécrire l'état après le FAILED (oscillation) — corrigé au fix-up #2 (voir entrée suivante).
- **Agent/Auteur** : Plan Codex Phase 4.4 (2026-05-14), implémentation Claude ; fix-up #1 (race + code stable) puis fix-up #2 (gardes monotones) après audits Codex successifs.

### 2026-05-14 — DURABILITÉ — Callbacks onProgress tardifs réouvraient un état terminal après timeout
- **Fichier(s)** : `src/services/documents/extraction-runs.ts`, `src/services/documents/extraction-progress.ts`, `src/services/documents/extraction-pipeline.ts`
- **Erreur** : Après que la race du budget (Phase 4.4 fix-up #1) a fait échouer le pipeline à 8 min, le `smartExtract` perdant continue de tourner en arrière-plan. Ses callbacks `onProgress` tardifs (fin de batch / provider qui rend la main après le timeout) appelaient `markExtractionRunProgress` et `recordExtractionPageProgress` qui faisaient un `update` NON gardé → un run déjà FAILED était reflippé `PROCESSING`. `setDocumentExtractionProgress` pouvait de même écraser une phase terminale `failed`/`completed` par `page_processed` → progress row bloqué non-terminal → modal d'upload poll à l'infini. Résultat possible : Document=FAILED, Run=PROCESSING, progress non-terminal — casse l'invariant Phase 4.1 "pas d'état oscillant".
- **Cause racine** : Les fonctions de progress faisaient des écritures inconditionnelles, sans vérifier que la cible n'avait pas déjà atteint un état terminal. Pattern check-then-act manquant pour des writes qui peuvent arriver en retard / en concurrence.
- **Solution validée** : Défense en profondeur sur 3 couches. (1) Garde callback : `onProgress` du pipeline early-return si `budgetController.signal.aborted`. (2) Garde DB monotone run : constante `LIVE_RUN_STATUSES = ["PENDING","PROCESSING"]` ; `markExtractionRunProgress` et le `update` final de `recordExtractionPageProgress` deviennent des `updateMany` scopés `status: { in: LIVE }` (write sur run terminal = no-op atomique) ; `recordExtractionPageProgress` early-return aussi si le run est terminal (skip encryption + upsert). (3) Garde DB monotone progress : `setDocumentExtractionProgress` — phase terminale → upsert (gagne toujours) ; phase non-terminale → `updateMany` scopé `phase: { notIn: terminal }` puis `create` si absent (catch P2002), race-free. Tests : `progress-monotone-guards.test.ts` (16) + `extraction-pipeline.test.ts` (+1, RED : budget gagne → callbacks tardifs droppés).
- **Ce qui N'A PAS fonctionné** : N/A — fix-up #2 direct, ré-audit Codex en attente.
- **Agent/Auteur** : Audit Codex Phase 4.4 fix-up — P1 (2026-05-14), implémentation Claude.

### 2026-05-14 — DB — acquireDocumentLineageLock utilisait $queryRaw sur une fonction retournant void
- **Fichier(s)** : `src/services/documents/extraction-runs.ts` (`acquireDocumentLineageLock`)
- **Erreur** : `await tx.$queryRaw\`SELECT pg_advisory_xact_lock(hashtext(${key}))\``. `pg_advisory_xact_lock` retourne le type `void`. Prisma `$queryRaw` matérialise le result set et tente de désérialiser chaque colonne → `P2010 — Failed to deserialize column of type 'void'`. La fonction throw à CHAQUE appel runtime. Comme elle est appelée dans une transaction (`promoteDocumentVersionTx`, création de version dans l'upload route, reuse), tout upload de nouvelle version et toute promotion auraient throw en prod → **l'advisory lock n'a jamais fonctionné**. Tous les tests unitaires mockent `$queryRaw` (assertion sur l'appel, jamais l'exécution réelle Prisma) → verts en test, cassé en réel.
- **Cause racine** : Choix de `$queryRaw` "parce que c'est un SELECT", sans réaliser que `$queryRaw` désérialise les colonnes et qu'une fonction `void` n'est pas désérialisable. Aucun test live-DB sur ce chemin SQL brut — c'est le 2e bug runtime de cette même fonction masqué par les mocks (le 1er : octets NUL dans la clé).
- **Solution validée** : `tx.$queryRaw` → `tx.$executeRaw`. `$executeRaw` exécute le statement (prend le lock comme effet de bord) et ne retourne qu'un compte de lignes — aucune désérialisation de colonne. Probé live sur les 3 formes possibles (`$executeRaw`, sous-requête wrappée renvoyant un int, `void::text`) : `$executeRaw` est la plus propre. Vérifié live via `scripts/e2e/advisory-lock-live.ts` : sérialisation même-lineage OK, non-blocage lineages différents OK, compatibilité pgbouncer pooled OK. Tests : 4 fichiers mis à jour (`$queryRaw` mock → `$executeRaw`) ; le test de régression réel = le script live (un test mické ne peut PAS attraper ce bug).
- **Ce qui N'A PAS fonctionné** : N/A — bug trouvé et corrigé pendant Phase 5 (E2E release gate), audit Codex en attente.
- **Agent/Auteur** : Phase 5 E2E release gate (2026-05-14), bug trouvé par le test live, corrigé par Claude.

### 2026-05-15 — STORAGE — downloadFile en mode Blob ne gérait pas un storagePath pathname
- **Fichier(s)** : `src/services/storage/index.ts` (`downloadFile`)
- **Erreur** : `if (isVercelBlobConfigured) { const res = await fetch(urlOrPath); ... }`. Le code `/retry`, `/process`, `/ocr` et l'extraction-pipeline lisent le blob via `document.storageUrl ?? document.storagePath`. Une row legacy avec `storageUrl=null` passe `storagePath` (un pathname comme `deals/<dealId>/abc.pdf`, **pas** une URL) à `downloadFile`. En mode Vercel Blob (prod), `fetch(pathname)` throw `TypeError [ERR_INVALID_URL]: Invalid URL` — le retry/process/ocr échoue immédiatement. Le mode local n'était pas affecté (il route via `/uploads/`). Le code de delete-cascade dans `/api/deals/[dealId]` commentait explicitement "use storageUrl ?? storagePath" → le codebase pensait que les deux formes étaient supportées, mais downloadFile n'avait pas été aligné. Audit Codex Phase 5 P1.
- **Cause racine** : Asymétrie locale/Blob non documentée. Le pattern `storageUrl ?? storagePath` est utilisé partout (parce que le schema autorise les deux) mais `downloadFile` ne savait pas résoudre un pathname Blob en URL. Aucun test live-Blob, et le smoke E2E ne forçait pas `storageUrl=null` non plus → non détecté.
- **Solution validée** : Dans la branche Blob de `downloadFile`, si `urlOrPath` n'est pas une URL `http(s)://`, résoudre via `@vercel/blob.head(pathname)` (`head` accepte URL OU pathname et retourne `{ url, ... }`), puis `fetch(info.url)`. Les URLs passent through. `getDownloadUrl` ne convenait pas (signature URL-only). Tests : `src/services/storage/__tests__/download-file-blob.test.ts` (4 — pathname → head + fetch ; URL → pas de head ; http:// aussi ; non-OK fetch throw). Le runbook scénario 6 ajoute un step déterministe `UPDATE Document SET storageUrl=NULL` puis retry → smoke réel.
- **Ce qui N'A PAS fonctionné** : N/A — bug trouvé via ré-audit Codex Phase 5 (le 1er round du runbook ne testait pas cette branche).
- **Agent/Auteur** : Audit Codex Phase 5 fix-up — P1 (2026-05-15), implémentation Claude.

### 2026-05-17 — CONTEXT-ENGINE — base-agent labelait FILE sans sourceDate comme "produit le <uploadedAt>"
- **Fichier(s)** : `src/agents/base-agent.ts:976-978` (rendu header doc), `src/agents/base-agent.ts:1060-1065` (tri chronologique)
- **Erreur** : `const producedAtLabel = this.formatDocumentDate(doc.sourceDate ?? doc.receivedAt ?? doc.uploadedAt);` puis `text += "### ${name} (${kind}, ${type}) — produit le ${producedAtLabel}, importé le ${importedAtLabel}";`. Pour les FILE sans `sourceDate` (cap tables, decks, BPs, financials), `producedAtLabel` valait `uploadedAt` (la date d'upload du fichier). Conséquence : un cap table de septembre 2024 uploadé en mai 2026 était présenté à TOUS les agents Tier 1/2/3 comme "produit le 17/05/2026". Audit Evidence Engine sur 3 deals (Avekapeti, FurLove, E4N) : **15/20 documents recevaient un label "produit le" faux** (= date d'upload masquerade comme date de production). Le tri chronologique (`getDocumentChronologyMs:1065`) utilisait le même fallback, donc l'ordre "ancien → récent" affiché à l'agent était également faux. Le commentaire ligne 959 instruit même l'agent à faire confiance à cet ordre falsifié : "En cas de divergence entre un document récent et le deck initial, le document récent fait foi".
- **Cause racine** : Confusion entre **date de production du contenu** (sémantique métier) et **date d'upload du fichier** (métadonnée technique). Le `??` fallback chain a été écrit pour "toujours avoir une date à afficher", sans modéliser que `uploadedAt` n'a pas la même nature que `sourceDate`/`receivedAt`. Catched par l'audit Codex de Phase 0.5 Evidence Engine — non détecté avant car l'audit document-context-retriever (qui renvoie `null` pour FILE) m'avait fait conclure à tort "pas de prelude pour FILE".
- **Solution validée** :
  ```diff
  - const producedAtLabel = this.formatDocumentDate(doc.sourceDate ?? doc.receivedAt ?? doc.uploadedAt);
  + // produit le = true content date only. uploadedAt is technical metadata, not a production date.
  + const producedAtLabel = this.formatDocumentDate(doc.sourceDate ?? doc.receivedAt ?? null);
  ```
  `formatDocumentDate(null)` retourne déjà `"date inconnue"`. Pour le tri chronologique, retourner `Number.MAX_SAFE_INTEGER` quand pas de source date → les docs non datés vont à la **fin** (les docs datés sont plus exploitables). Tests : `src/agents/__tests__/base-agent-date-rendering.test.ts` (4 tests — couvre §6.5 #23 du schema Phase 1).
- **Ce qui N'A PAS fonctionné** : N/A — fix direct et chirurgical.
- **Agent/Auteur** : Découvert pendant Phase 0.5 Evidence Engine audit (Codex), fix Phase 1 parallèle Claude.

### 2026-05-29 — CREDITS — Refactor crédits-only + free hebdo 'use it or lose it'
- **Fichier(s)** : `prisma/schema.prisma`, 2 migrations Prisma (`20260528150000_add_weekly_free_credits`, `20260528150100_drop_subscription_status_and_free_flag`), `src/services/credits/{types,usage-gate,__tests__/*}.ts`, `src/agents/orchestrator/{index,types}.ts`, `src/lib/inngest.ts`, `src/app/api/{analyze,admin/users,admin/users/[userId],user/export}/route.ts`, dossier `src/app/api/v1/` (12 fichiers supprimés), `src/lib/{auth,api-key-auth,api-logger}.ts`, `src/services/{deal-limits,board-credits,cost-monitor,webhook-dispatcher}/index.ts`, `src/types/index.ts`, 7 composants UI (`shared/pro-teaser`, `deals/partial-analysis-banner`, `deals/next-steps-guide`, `deals/board/board-teaser` supprimés ; `deals/tier1-results`, `deals/tier2-results`, `deals/tier3-results`, `deals/analysis-panel`, `deals/board/ai-board-panel`, `admin/costs-dashboard-v2` refactorisés), `src/app/(dashboard)/admin/users/page.tsx`, `src/lib/analysis-constants.ts`, tests associés.
- **Erreur (avant)** : Le système avait 3 zones où le concept legacy FREE/PRO subsistait : (1) pipeline d'analyse — `userPlan === "PRO" ? [4 tiers] : [Tier 1 + synthesis-deal-scorer]` dans orchestrator/index.ts:1432-1438 donnait des analyses tronquées (13 agents) aux FREE et complètes (19-20+) aux PRO ; (2) UI paywalls — ProTeaser + cascade verrouillait Tier 2/3 derrière une "passez au PRO" malgré que la doctrine produit attendait l'inverse (tout afficher dès que l'analyse a été payée en crédits) ; (3) dérivations backend — `effectivePlan`, `subscriptionStatus: totalPurchased > 0 ? "PRO" : "FREE"`, gating API v1 — du code mort qui maintenait l'illusion d'un plan.
- **Cause racine** : Modèle économique hybride non assumé. Le pricing avait déjà migré vers crédits (page pricing-content.tsx déjà "Des crédits, pas des abonnements", sidebar CreditCard déjà sans mention plan), mais l'infrastructure tier-gating + le champ DB `User.subscriptionStatus` étaient restés à droite, créant de la confusion (UI Sacha affichait "499 crédits" mais DB disait `subscriptionStatus = FREE` → ai conclu à tort "le user est FREE" au lieu de "le champ DB est un fossile runtime" dans l'agentic-mistakes 2026-05-28).
- **Solution validée** : Refactor en 4 phases commitées indépendamment (rollback granular) :
  1. **Schema Prisma** — 2 migrations séparées : (a) additive `ALTER TABLE UserCreditBalance ADD balanceFree INT DEFAULT 10, ADD freeResetStartedAt TIMESTAMP` ; (b) destructive `DROP COLUMN subscriptionStatus + DROP COLUMN freeCreditsGranted + DROP TYPE SubscriptionStatus`. Le DEFAULT 10 backfille les rows existantes. Le client Prisma régénéré produit 33 erreurs TS sur les call sites legacy (filet de sécurité).
  2. **Service crédits** — `FREE_TIER = { weeklyAllowance: 10, windowDurationMs: 7 * 24 * 60 * 60 * 1000 }`. `deductCreditAmount` refondu : lazy reset (si `freeResetStartedAt + 7j < now` → updateMany WHERE freeResetStartedAt = $oldValue SET balanceFree=10, freeResetStartedAt=null ; refetch si concurrence), free-first split (freeUsed = min(balanceFree, cost), paidUsed = cost - freeUsed), démarrage du timer dans la même transaction si freeUsed > 0 ET freeResetStartedAt was null, balanceAfter = newPaid + newFree (sémantique TOTAL). `refundCreditAmount` : 100% paid (conservateur, pas de pro-rata, doctrine money-touching errors.md 2026-03-12 CREDITS). `grantFreeCredits` simplifié (crée la row si absente, balanceFree=10 via schema default). `getCreditBalance` retourne `{ balance, balanceFree, totalAvailable, freeResetStartedAt, nextFreeResetAt }`. Helper interne `projectBalanceFree` pour la projection sans écriture en DB.
  3. **Backend** — DROP type UserPlan + AnalysisOptions.userPlan + signatures `runAnalysis/_runAnalysisImpl/runFullAnalysis`. DROP gating availableTiers/includeTier2/includeFullTier3 (toujours pipeline complet). DROP constante FREE_TIER3_BATCHES_AFTER_TIER2 (4 call sites adaptés : pendingTier2/3, Tier3 pre-Tier2 skip, finalSynthesisBatches, resume tier3Batches). DROP API v1 totalement (12 fichiers + 2 libs orphelines + webhook-dispatcher). Routes admin + user/export + cost-monitor + auth.ts purgés des refs subscriptionStatus + freeCreditsGranted.
  4. **UI** — DROP fichiers ProTeaser/PartialAnalysisBanner/NextStepsGuide/BoardTeaser (paywalls visuels). DROP props subscriptionPlan en cascade depuis analysis-panel vers Tier1/2/3Results. DROP isFree branches dans Tier 2/3 (toujours afficher Tier 2 + tabs Cohérence/Mémo). DROP PLAN_ANALYSIS_CONFIG + getDisplayLimits + SubscriptionPlan type. Admin UI : DROP colonne Plan + SubscriptionBadge + Select Abonnement + stats pro/free.
- **Ce qui N'A PAS fonctionné** : N/A — refactor smooth, tsc à 0 erreur après chaque phase, 4066 tests verts (+8 nouveaux tests dédiés au free hebdo "use it or lose it" : consommation free-first, lazy reset post-7j, pas de reset si <7j, timer démarre uniquement si freeUsed>0, refund 100% paid, erreur claire si totalAvailable<cost, getCreditBalance expose les nouveaux champs).
- **Doctrine money-touching errors.md 2026-03-12 CREDITS conservée** : fail-closed prod (return success: false en NODE_ENV=production si tables down), idempotency key UNIQUE constraint sur CreditTransaction (déjà en place), $transaction wrapping étendu au reset lazy, optimistic locking étendu au champ freeResetStartedAt (`updateMany WHERE freeResetStartedAt = $oldValue` empêche concurrence reset).
- **Agent/Auteur** : Refactor planifié et exécuté par Claude (2026-05-29) après décisions produit Sacha session précédente. Plan détaillé : /Users/sacharebbouh/.claude/plans/structured-finding-chipmunk.md. 5 commits sur branche refactor/credits-only.

---

### 2026-05-29 — ARCHITECTURE — Relance v2 incomplète vs flux thèse-first (deadlock pending_thesis)
- **Fichier(s)** : `src/components/deals/analysis-v2/relaunch-analysis-button.tsx`, `analysis-v2/page-shell.tsx`, `analysis-v2/analysis-v2-live.tsx` (nouveau), `src/app/(dashboard)/deals/[dealId]/page.tsx`
- **Erreur** : Le bouton « Relancer » de la vue v2 (PR #15) faisait `POST /api/analyze {full_analysis}` + `router.refresh()`. En prod : clic → 409 « Une revue de thèse est déjà en attente… » + reload sans issue, analyse parkée non finalisable.
- **Cause racine** : Le flux est **thesis-first** — un Deep Dive extrait la thèse puis se met en PAUSE (Analysis `RUNNING` + `thesisDecision=null` = `pending_thesis`, garde `reserveFullAnalysisDispatch`) sur une revue que le BA doit finaliser via `ThesisReviewModal`. Ce modal n'existait QUE dans l'ancien `AnalysisPanel` ; la v2 ne le portait pas. Le `router.refresh()` courait après le worker Inngest (async) → au refresh, la ligne `RUNNING` n'existait pas encore → la page restait sur la v2 figée (la bascule `page.tsx` `!some(RUNNING)` → ancien panel ne se déclenchait jamais) → thèse parkée sans UI, et tout reclic bloqué par la garde `pending_thesis` (409).
- **Solution validée** : Rendre la v2 **autosuffisante** (suppression de la bascule v2 ↔ ancien panel). Nouveau composant client `AnalysisV2Live` qui porte le cycle de vie dans la v2 : polling statut analyse (3s) + thèse (5s) ; auto-ouverture du `ThesisReviewModal` réutilisé tel quel (self-routing `/thesis/decision` & `/thesis/rebuttal`) ; `AnalysisProgress` pendant `RUNNING` ; relance thèse-aware (bascule **client immédiate** sur le suivi — pas de `router.refresh()` qui race Inngest ; 409 → bascule sur le suivi pour surfacer le modal ; 403/`upgradeRequired` → toast + `/pricing`) ; détection du terminal de l'analyse **suivie** via `watchedIdRef` (ignore le `COMPLETED` de l'ancienne analyse tant que la nouvelle `RUNNING` n'est pas captée) → `router.refresh()` reconstruit la v2 ; filet anti-spinner 30 min. `initialActive` (analyse `RUNNING` au chargement) amorce le suivi → une thèse parkée s'ouvre directement en v2. `page.tsx` rend `AnalysisV2Live` dès qu'une analyse COMPLETED existe ; l'ancien panel ne sert plus que pour la toute première analyse.
- **Ce qui N'A PAS fonctionné** : PR #15 — fallback `!deal.analyses.some(a => a.status === "RUNNING")` → ancien panel pour surfacer le modal : défait par le décalage SSR↔Inngest (au refresh, pas encore de ligne `RUNNING`) ET par le ping-pong de surfaces (perte de continuité client). Leçon : ne pas répartir un flux opérationnel (relance + revue de thèse + progression) entre deux surfaces dont la bascule dépend d'un état DB peuplé en asynchrone.
- **Agent/Auteur** : Régression introduite par Claude (PR #15), détectée par Sacha en prod, corrigée par Claude (PR #16, commit `e2ce2bf`). Investigation root-cause via workflow 4 agents parallèles.

