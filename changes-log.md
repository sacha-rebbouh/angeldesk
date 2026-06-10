# Changes Log - Angel Desk

---
## 2026-06-10 — Chore/hygiène — Phase A remédiation post-audit : purge zombies, doublon base-agent, changes-log 30 entrées, docs-private tracké

### Fichiers
- Supprimés (zombies non-trackés, cassaient `tsc --noEmit` — 7 erreurs) : `src/app/api/v1/` (9 fichiers, API v1 ressuscitée du refactor crédits-only qui l'avait droppée), `src/lib/api-key-auth.ts`, `src/lib/api-logger.ts`, `src/lib/__tests__/api-logger.test.ts`, `src/services/webhook-dispatcher.ts`, `src/agents/tier1/exit-strategist.ts` (banni doctrine anti-oraculaire), `src/components/deals/next-steps-guide.tsx`, `src/components/deals/partial-analysis-banner.tsx`, `src/components/shared/pro-teaser.tsx`
- `git rm "src/agents/base-agent 2.ts"` (doublon macOS 80 KB tracké, 0 importeur)
- Ajoutés à git : `scripts/follow-deal-analysis.ts`, `scripts/unblock-deal-status.ts`, `scripts/unblock-stale-analysis.ts` (scripts ops sains, dry-run par défaut)
- `changes-log.md` tronqué à 30 entrées (1,12 MB → 58 KB, sa propre règle de rétention)
- `.gitignore` : `/docs-private` retiré → 23 fichiers docs-private/ trackés (scan secrets négatif ; protection contre la perte du laptop, reference.yaml 418 KB)

### Description
Phase A du plan de remédiation post-audit (audit multi-agents 2026-06-10, 13 findings High confirmés). Décisions Sacha : zombies supprimés (redesign API v1 = décision produit future), docs-private versionné dans le repo. Vérif : `tsc --noEmit` = 0 erreur, 4361 tests verts.

---
## 2026-06-10 — Infra/Décision — B (Clerk DEV→PROD) + C3 (FROM email) PARQUÉS : bloqués sur le choix du domaine prod

### Décision (utilisateur)
B et C3 du plan overlay/Clerk/email (`~/.claude/plans/velvety-stargazing-bee.md`) sont **mis en attente** : on finit le reste du plan, ces deux-là restent ouverts. Les deux convergent sur **une seule décision produit/infra non tranchée** : quel **domaine possédé** pour Angel Desk en prod (Sacha ne possède pas `angeldesk.app` ; le rename « AngelDesk » est en pause). Aucune urgence — la mitigation A + C1/C2 sont déployées, le feu est éteint.

### B — Clerk DEV→PROD (gelé)
L'instance Clerk **production** exige un domaine possédé (pas `*.vercel.app`). Tant que le domaine n'est pas choisi : B0 (migration users re-link par email vérifié, Codex-revu) + B1-B6 (instance prod, DNS/FAPI, `pk_live/sk_live`, CSP `next.config.ts`, OAuth/redirects/webhooks, rollback réversible) **gelés**. Détail dans le plan + Obsidian `Projet Migration Clerk DEV vers PROD`.

### C3 — Emails jamais reçus (gelé, même décision)
FROM actuel `maintenance@angeldesk.app` **non vérifiable** chez Resend (domaine non possédé) = racine probable de la non-réception. Fix = FROM sur **domaine possédé + vérifié** (SPF/DKIM/DMARC). Partie diagnostic (clé Resend en prod ? logs/bounces ?) reportée avec C3. C1/C2 (fail-loud + `response.ok+id`) déjà livrés → un envoi raté ne grave plus de faux `sentAt`.

### Reprise
Plan `~/.claude/plans/velvety-stargazing-bee.md` (volets B/C) · Obsidian `03_Projects/Projet Migration Clerk DEV vers PROD.md` · mémoire repo `angeldesk_overlay_freeze_clerk.md`.

---
## 2026-06-08 — Bug/auth — Gel overlay « analyse en cours » : session Clerk expirée (fetcher auth-required)

### Contexte
L'overlay + le tracker d'étapes restaient figés à 0/22 alors que l'analyse progressait (DB 0→22). Cause (preuve DevTools réseau) : le JWT de session Clerk expire (~60 s) et le refresh échoue (`refresh_token_not_found`) → le middleware `proxy.ts` (`auth.protect()`) réécrit les polls `/analyses` en 404 « signed-out » ; les composants en `fetch()` brut avalaient l'erreur et figeaient sur la dernière valeur. Bug Clerk cookie `__session` vs `__session_<suffix>` désynchronisés (instance DEV sur domaine prod).

### Changements (gate Codex APPROVE, 2 tours)
- `lib/fetch-latest-analysis.ts` (nouveau) : fetcher AUTH-REQUIRED unifié pour `analyses.latest` — `clerkFetch` puis UN retry `getToken({skipCache:true})` en Bearer avec `credentials:"omit"` (le cookie périmé ne gagne plus sur le header) ; sinon `AuthExpiredError`. Pas de fallback cookie-only.
- `lib/auth-expired-error.ts` (nouveau) : `AuthExpiredError` + `isAuthExpiredResponse` (401/403, ou 404 AVEC signal Clerk ; `x-matched-path:/404` seul ≠ auth-expired).
- 3 consommateurs (`analysis-running-overlay`, `analysis-v2-live`, `analysis-panel`) repointés sur le fetcher unifié + `retry` no-AuthExpired + `refetchInterval` stoppe sur `query.state.error` ; UI « Session expirée + Se reconnecter » ; toast unique.
- Retouches overlay : `beforeunload` retiré ; anneau ≥1 % (Tier0 ne paraît plus bloqué) ; libellé d'étape via `lib/analysis-progress-model.ts` (nouveau, partagé avec `analysis-progress.tsx` refacto byte-équivalent).

### Vérif
33 nouveaux tests + 100 tests existants analysis-v2/panel verts ; `tsc` clean hors WIP. Gate Codex APPROVE (correctif `credentials:omit` intégré au tour 2).

---
## 2026-06-08 — Bug/email — Fiabilise l'envoi : sendEmail exige response.ok+id, prod fail-loud

### Contexte
L'utilisateur ne reçoit jamais l'email « analyse prête » bien que `analysisReadyEmailSentAt` soit posé. Deux failles : (1) `sendEmail` considérait « succès » dès que `data.error` absent — un 401/403/429 ou un domaine Resend non vérifié passait pour un envoi réussi et gravait un faux `sentAt` ; (2) si `RESEND_API_KEY` manque en prod, le claim était consommé en silence (`sentAt` posé + log info), masquant la misconfig.

### Changements (gate Codex APPROVE)
- `services/notifications/email.ts` : `sendEmail` exige `response.ok && data.id` (sinon `success:false`) + guard `.catch` sur `json()` non-JSON.
- `services/notifications/analysis-ready-email.ts` : si email non configuré ET `VERCEL_ENV === "production"` → **relâche le claim** (`claimedAt=null`, guardé `sentAt:null`) **+ throw** (retry) au lieu de marquer `sentAt`. Hors prod (dev/local + Preview) → no-op inchangé.
- Tests : `email-idempotency.test.ts` (mock fetch `ok:true` + cas 403/sans-id → `success:false`) ; `analysis-ready-email.test.ts` (ancien « non configuré » → cas HORS PROD + nouveau cas prod fail-loud).

### Vérif
12 tests email verts ; `tsc` clean hors WIP préexistant (`exit-strategist.ts`). Gate Codex APPROVE (idempotence/claim intacts, gate `VERCEL_ENV` validé).

---
## 2026-06-08 — UI — Overlay « analyse en cours » : menu libre + affichage immédiat + redesign

### Contexte
Re-run Avekapeti : l'overlay (1) apparaissait **~1min30 après** le lancement (le worker ne pose `RUNNING` qu'après ~90s ; l'overlay attendait ce statut alors que l'inline tracker partait sur `isActive`), (2) était « moche », (3) couvrait **tout y compris le menu** alors que l'utilisateur veut pouvoir naviguer (autres deals/analyses, en lancer une autre) pendant que l'analyse tourne en arrière-plan.

### Changements (UI — pas de gate)
- `analysis-v2/analysis-running-overlay.tsx` : **SCOPE** `fixed inset-0 md:left-64` (couvre le contenu, **menu latéral `w-64` libre**) ; verrou de scroll body retiré (menu utilisable) ; **AFFICHAGE IMMÉDIAT** via fenêtre de grâce (`LAUNCH_GRACE_MS=150s`, couvre le démarrage worker) + statut `PENDING`/`RUNNING` ; **REDESIGN** (anneau de progression SVG + %, carte soignée, message « navigue librement, email à la fin »). beforeunload conservé (fermeture d'onglet accidentelle), navigation in-app libre.
- `analysis-v2/analysis-v2-live.tsx` (`handleRelaunch`, succès + 409) : pose le signal `queryKeys.analyses.launchedAt(dealId)=Date.now()` → l'overlay s'affiche **sans attendre** le worker.
- `lib/query-keys.ts` : ajout `analyses.launchedAt(dealId)`.

### Vérif
`tsc` clean (hors WIP) ; 62 tests analysis-v2 verts (non-régression). Validation visuelle live (overlay state-gated, non screenshotable hors analyse en cours).

---
## 2026-06-08 — Bug/money — Refund-à-tort + email manquant : gate sur statut terminal (pas allSuccess)

### Contexte
Re-run Avekapeti (validation post-release) : l'utilisateur n'a **jamais reçu l'email « analyse prête »**. Diagnostic (prouvé en base) : l'analyse `cmpzke95i…` a **COMPLETED 22/22 agents** mais a été **REFUNDÉE** (5 crédits, `refundedAt` posé) **et** sans email. Cause racine : `inngest.ts` gatait refund vs email sur `analysisResult.success` = `allSuccess` = `Object.values(results).every(r => r.success)` (orchestrator/index.ts:688…) = vrai **seulement si TOUS les agents `success:true`**. Sur un Deep Dive, ≥1 agent en échec est normal → `success:false` → branche refund + email sauté. **Impact : chaque Deep Dive complété-mais-partiel était remboursé en silence (fuite de revenu) + sans email.** Contredit la doctrine (« environnement fiable autour d'IA imparfaites » : une analyse COMPLETED est livrée/facturable).

### Décision (utilisateur + avis convergents Claude/Codex)
Option A : gater refund/email sur le **statut terminal PERSISTÉ**, binaire — `COMPLETED` → email + facturé (pas de refund), `FAILED` → refund. `allSuccess` reste un signal qualité/observabilité, jamais une règle commerciale. **Pas de seuil** dans `inngest.ts` (un seuil appartiendrait à la logique de STATUT). **Historique non corrigé** (que le futur, décision utilisateur).

### Changements (gate Codex APPROVE round 2)
- `src/lib/analysis-completion-policy.ts` (NEW) : helper PUR `completionActionForStatus(status) → 'notify'|'refund'|'none'`.
- `src/lib/inngest.ts` : `dealAnalysisFunction` + `dealAnalysisResumeFunction` — remplace le gate `analysisResult.success` par lecture du statut persisté (`step.run('resolve-terminal-status'…) → prisma.analysis.findUnique select status`) puis `completionActionForStatus`. Idempotence email (claim Phase 4) + clé refund inchangées.
- Tests : `analysis-completion-policy.test.ts` (NEW, 3) ; `deal-analysis-inngest-stepwise.test.ts` mis à jour (mock `findUnique` + spy email ; sémantique FAILED→refund ; **+ test de régression** COMPLETED malgré agents KO → email, pas de refund).

### Vérif
`tsc` clean (hors WIP). 18 tests verts (stepwise 7, policy 3, email 8). Gate Codex : round 1 REQUEST_CHANGES (tests stepwise rouges : mock prisma `{}` + sémantique obsolète) → mock + sémantique mis à jour + régression → **APPROVE** round 2. Suivi non-bloquant noté par Codex : pas de test resume dédié (logique identique via le helper testé).

---
## 2026-06-04 — Migration/infra — Phase 6 (refonte 5-sujets) : déblocage Neon + migration prod Phase 2/4

### Contexte
La prod Neon était suspendue par un garde-fou anti-drain : quota **projet** `compute_time_seconds = 72000` (20 CU-h) sur le projet `angeldesk` (`crimson-tooth-32900265`), dépassé à 20.33 CU-h → suspension persistante de TOUS les computes jusqu'à fin de période (≠ scale-to-zero). Diagnostic prouvé : psql brut sur les 2 endpoints (direct + poolé) renvoyait l'erreur quota au niveau protocole Postgres (donc pas Prisma/connection string). Cause = quota projet, pas le plan Launch ni la limite $20. Fix : quota relevé `72000 → 144000` (20→40 CU-h) via l'API Neon (PATCH project settings.quota) → compute redémarré immédiatement.

### Changements (gate Codex APPROVE)
- `prisma/schema.prisma` : ré-ajout de `@@index([dispatchEventId])` sur `Analysis` (Phase 2 — retiré du diff lors de la Phase 2 pour éviter le drift).
- `prisma/migrations/20260604120000_add_analysis_email_idempotency_and_dispatch_index/` : NOUVELLE migration — `ADD COLUMN analysisReadyEmailClaimedAt/SentAt TIMESTAMP(3)` (Phase 4) + `CREATE INDEX Analysis_dispatchEventId_idx` (Phase 2). SQL généré via `migrate diff` (lecture seule), **pas** `migrate dev` (`.env.local` = PROD → shadow DB/reset proscrits).
- **Dérive Thesis EXCLUE** : `migrate diff` remontait aussi `ALTER TABLE Thesis ALTER COLUMN sourceDocumentIds DROP DEFAULT` — dérive cosmétique pré-existante (la migration thesis-first-architecture a créé la colonne en `DEFAULT ARRAY[]`, le champ `String[]` n'a pas de `@default`). Bénigne, hors périmètre → exclue de cette migration (confirmé Codex). Restera visible dans `migrate diff` tant que non traitée séparément.

### Vérif
Appliquée en prod via `npx dotenv -e .env.local -- npx prisma migrate deploy`. `migrate status` = up to date (29 migrations). Introspection prod : les 2 colonnes email + l'index `Analysis_dispatchEventId_idx` présents. Client Prisma régénéré (v6.19.3). Gate Codex : **APPROVE**.

---
## 2026-06-04 — Tests/vérif — Phase 6 (refonte 5-sujets) : test du filet déterministe + vérification finale

### Contexte
Clôture de la refonte 5-sujets S1 (mémo Option B). Verrouillage comportemental du filet déterministe `buildDeterministicFallback` (le mémo ne doit jamais être vide/cassé) et vérification finale avant la décision utilisateur (merge/deploy/migrations/Neon).

### Changements (gate Codex APPROVE)
- `src/agents/tier3/__tests__/memo-generator-transform.test.ts` (+4 tests, test-only — runtime déjà APPROVE en 5a) : (1) le fallback reconstruit un `MemoGeneratorData` COMPLET (orientation = recommendation, evidenceSolidity null, criticalRisks = CRITICAL+HIGH, keyRisks enrichis severity/category/source, investmentHighlights vide, nextSteps depuis questions, dueDiligence.outstanding depuis questions CRITICAL) ; (2) orientation conservatrice sans scorer (1 CRITICAL → vigilance ; 2 → alert_dominant ; jamais favorable) ; (3) orientation = verdict canonique du synthesis-deal-scorer si dispo ; (4) verdict scorer invalide → dérivation conservatrice.

### Vérif finale
`tsc` clean (hors baseline `exit-strategist.ts` untracked). Suite unit COMPLÈTE : **4316 passed / 6 failed / 48 skipped** — les 6 rouges = `*-integration.test.ts` (evidence/evidence-signals) qui font `prisma.user.create` en beforeAll → **compute Neon capé par l'utilisateur** (anti-drain), baseline pré-existante hors périmètre. ZÉRO régression. Guards doctrine/mémo verts.

### Reste — BLOQUÉ sur décision utilisateur / infra (Neon capé)
Migrations Prisma à générer (`migrate dev`, Neon UP requis) : `@@index([dispatchEventId])` (Phase 2) + colonnes email Phase 4 (`analysisReadyEmailClaimedAt`/`analysisReadyEmailSentAt`, dans `schema.prisma` sans migration). Puis merge, deploy, application migrations Neon prod à la main, réactivation reaper Inngest, re-run Avekapeti. À arbitrer par l'utilisateur.

---
## 2026-06-04 — Doctrine/UI — Phase 5b (refonte 5-sujets) : scrub doctrine classe « verdict » + résidu Source

### Contexte
Suite Phase 5a : le mémo enrichi surface plus de texte LLM rendu. Le scrub doctrine au rendu (`scrubPrescriptiveDecisionLanguage`) ne couvrait que la classe « décision » (« prendre une décision »…). La classe **verdict binaire** (investissable, GO/NO-GO, « ne pas investir »/« il faut investir », rejeter/passer le deal, rédhibitoire) n'était pas neutralisée. Plus un résidu « Source: » orphelin après scrub d'un nom d'agent mid-string.

### Changements (5b — gate Codex APPROVE round 2)
- `analysis-v2/lib/presentation.ts` : `scrubPrescriptiveDecisionLanguage` ÉTENDU à la classe VERDICT (même boucle SEGMENT + même préservation du sujet INVESTISSEUR que la classe décision). Cible des CONSTRUCTIONS (verbe + objet deal), pas des mots nus → « thèse d'investissement », le rejet d'une hypothèse, « passer à l'étape », « montant investissable » NON touchés. `investissable` réécrit en constat **NEUTRE** dans les 2 formes (copule / objet-deal) — jamais de polarité (« non investissable » ne devient PAS « favorable », finding Codex round 1).
- **Contrainte source-scan** : `doctrine-guard.test.ts` scanne `presentation.ts` et bannit ces littéraux en clair. Les regex sont écrites avec `\s+`/classes pour ne pas inscrire les littéraux contigus, et les commentaires évitent de les épeler (round 0 local : commentaires épelaient les littéraux → corrigés). `doctrine-guard` 10/10.
- `analysis-v2/lib/presentation.ts` : `scrubAgentNamesFromText` retire le résidu « Source: »/« Sources: »/« Analyse: » mid-string suivi UNIQUEMENT de ponctuation/fin (LEADING_LABEL_PREFIX ne gère que la TÊTE). Edge cosmétique connu (double point possible), mais le label orphelin est retiré.
- Tests : `presentation.test.ts` (+7 : réécritures verdict, non-inversion polarité, préservation hypothèse/étape/thèse, préservation segment investisseur, résidu Source) ; fixture DÉDIÉE `HOSTILE_MEMO_VERDICT` (memo-generator généré, shape persisté, verdicts dans 11 champs rendus, séparée pour ne pas basculer la branche reconstituted) ; `doctrine-runtime-guard` test NON-VACUOUS (champs riches peuplés + walk-all zéro verdict/agent) + walk-all VM étendu.

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). 250 tests verts (analysis-v2 + tier3 + shared) ; 62 ciblés (presentation 37, doctrine-runtime-guard 15, doctrine-guard 10). Gate Codex : round 1 REQUEST_CHANGES (inversion polarité investissable) → constat neutre + test anti-inversion → **APPROVE** round 2.

---
## 2026-06-04 — Mémo/UI — Phase 5a (refonte 5-sujets) : enrichissement du mémo (Option B) + filet déterministe

### Contexte
Refonte 5-sujets, S1. Le mémo d'investissement était aminci sur toute la chaîne : le normalizer droppait `dbComparable`/`source` (highlights) et `severity`/`category`/`source` (keyRisks) alors que le LLM les produit ; le sélecteur ne surfaçait qu'une fraction des champs ; `companyOverview` (un OBJET) était lu via `stringAt` → toujours null. Décision produit verrouillée : **Option B** = mémo riche LLM + **mémo AUTONOME** (se suffit) + **filet déterministe** si l'appel LLM échoue. Modèle `memo-generator` pinné **GEMINI_PRO**.

### Changements (5a — enrichissement, gate Codex APPROVE round 2)
- `src/agents/types.ts` + `src/agents/type-modules/tier3.ts` : `MemoGeneratorData.investmentHighlights` (+`dbComparable?`, +`source?`) et `keyRisks` (+`severity?`, +`category?`, +`source?`). Champs optionnels, 2 défs gardées EN SYNC (`type-modules/tier3.ts` est un module orphelin — aucun importeur — synchronisé par sécurité anti-drift).
- `src/agents/tier3/memo-generator.ts` (normalizer) : arrête de dropper les champs riches (2 branches : LLM natif + fallback red flags), pattern conditionnel identique à `criticalRisks`.
- `src/agents/tier3/memo-generator.ts` (execute) : `model:"GEMINI_PRO"` + `maxTokens:32000` explicites ; appel LLM wrappé en try/catch → sur throw (troncature fail-closed, parse, timeout) bascule sur `buildDeterministicFallback`. La chaîne model-aware du router (GEMINI_PRO→HAIKU) reste active avant le throw.
- `src/agents/tier3/memo-generator.ts` (NEW `buildDeterministicFallback`) : reconstruit un `MemoGeneratorData` COMPLET et AUTONOME depuis `consolidatedRedFlags`/`consolidatedQuestions`/`deal`. Orientation = verdict canonique du synthesis-deal-scorer si valide (cohérence ScoreBadge), sinon dérivation CONSERVATRICE par counts de sévérité (jamais « favorable » — anti-fabrication). `investmentHighlights=[]` (pas de positif fabriqué).
- `prompts/memo-generator-prompt.ts` + bloc inline : concision assouplie (mémo autonome ~700-1200 mots), invariant anti-troncature conservé ; exemple « BON OUTPUT » verdict dé-impérativé ; « investissable » ajouté à la liste INTERDIT du prompt.
- `analysis-v2/lib/selectors.ts` : BUG `companyOverview` corrigé (objet → prose scrubée) ; surface `investmentHighlights`/`keyRisks`(rich)/`financialSummary`/`teamAssessment`/`marketOpportunity`/`competitiveLandscape`/`dealTerms`/`dueDiligence`. **Chaque** champ rendu passe par `cleanRenderedText` (y compris le LABEL des métriques `financialSummary` — finding Codex round 1).
- `analysis-v2/sections/memo-section.tsx` : blocs riches du mémo autonome (types dérivés via `Extract<MemoSectionModel,{kind:"generated"}>`).

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). 225 tests verts sur les 2 zones touchées (`analysis-v2/__tests__/` + `tier3/__tests__/`) + nouveau test scrub label `financialSummary`. Baseline rouge inchangée (Neon capé : 6 `*-integration` + 5 coaching/live). Gate Codex : round 1 REQUEST_CHANGES (label `financialSummary` non scrubé) → corrigé + test → **APPROVE** round 2. Phase 5b (scrub doctrine classe « verdict » + guard/fixture/tests) = commit suivant.

---
## 2026-06-04 — UX/infra — Phase 4 (refonte 5-sujets) : masque « analyse en cours » + email idempotent

### Contexte
Refonte 5-sujets (S4, Phase 1 seule). Une analyse Deep Dive est longue ; rien n'empêchait l'utilisateur de naviguer ailleurs en croyant l'analyse perdue. Objectif : masque plein écran au niveau page/onglets pendant qu'une analyse tourne + email « analyse prête » à la complétion. PAS de cancel, PAS de refund.

### Changements
- `prisma/schema.prisma` : 2 colonnes nullable sur `Analysis` — `analysisReadyEmailClaimedAt` / `analysisReadyEmailSentAt` (idempotence email). Client régénéré (`prisma generate`, sans DB). **Migration NON appliquée** (Neon capé) → générée en Phase 6.
- `src/services/notifications/analysis-ready-email.ts` (NEW) : `sendAnalysisReadyNotification()` — **claim ATOMIQUE** (`updateMany where {id, sentAt:null, claimedAt:null}` → `count===1`) puis send Resend, `sentAt` au succès / reset `claimedAt`+throw à l'échec (retry Inngest). Claim ET send en `step.run` distincts. URL deal via env SERVEUR (`APP_URL`/`VERCEL_URL`).
- `src/services/notifications/email.ts` : `isEmailConfigured()` + `sendAnalysisReadyEmail()` (template HTML doctrine-safe, aucun langage prescriptif).
- `src/lib/inngest.ts` : appel best-effort sur succès de `dealAnalysisFunction` ET `dealAnalysisResumeFunction` (try/catch : un échec d'email ne fait pas échouer une analyse réussie). FAILED → pas d'email.
- `src/components/deals/analysis-v2/analysis-running-overlay.tsx` (NEW) : masque plein écran `fixed inset-0 z-[60]`, dérivé du statut RUNNING serveur (poll, même queryKey que AnalysisV2Live), `beforeunload` informatif + verrou de scroll.
- `src/app/(dashboard)/deals/[dealId]/page.tsx` : monte l'overlay au niveau page (au-dessus des onglets + chat).

### Hardening idempotence (gate Codex round 1 → REQUEST_CHANGES, corrigé)
Codex a trouvé 2 fenêtres de double-envoi : (1) concurrence — claim mémoïsé `true` au retry après reset+throw alors qu'un autre run a envoyé ; (2) succès Resend puis échec de l'`update(sentAt)` → replay renvoie. Root cause : le step send renvoyait sans condition. Fix : **clé d'idempotence provider** `Idempotency-Key: analysis-ready/${analysisId}` (Resend dédoublonne 24h — doc vérifiée) + **re-check `sentAt`** en tête du step send. Exactly-once garanti au niveau provider.

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). Tests notif 8/8 : `analysis-ready-email` 6/6 (claim gagnant/perdu, re-check skip concurrent, échec Resend→reset+throw, non-configuré, destinataire absent, assert clé idempotence) + `email-idempotency` 2/2 (header `Idempotency-Key` atteint `fetch`). `doctrine-guard` 10/10 (reword « bloquant »→« plein écran »). Suite complète : aucune régression introduite — 11 fichiers rouges = 6 `*-integration` (Neon capé) + 5 coaching/live (fallout Phase 3, rouges aussi à HEAD, vérifié par stash). Gate Codex : **APPROVE** (round 2).

---
## 2026-06-04 — UI/infra — Phase 3 (refonte 5-sujets) : archivage du Live Coaching

### Contexte
Refonte 5-sujets. Live Coaching (temps réel Recall/Ably) n'a pas sa place pour l'instant → archivé (réactivable via flag), sans casser Recall ni laisser de drain Neon/LLM résiduel.

### Changements
- `src/lib/feature-flags.ts` : `isLiveCoachingEnabled()` (défaut false=archivé, runtime).
- `page.tsx` : onglet + contenu Live gatés + retirés de `allowedTabs`. Popout `live/page.tsx` : redirige vers `/deals/:id` (pas `?tab=live`) quand archivé.
- Routes **403 après auth** : POST `/live-sessions` (create), `[id]/start`, `[id]/reinvite`, `[id]/retry-report` (LLM), `[id]/participants` (PUT), `[id]` PATCH, `/coaching/{context,reanalyze,ably-token}`.
- Webhooks **no-op (ACK 200 APRÈS vérif signature/secret, avant DB/LLM)** : `/webhooks/recall`, `[id]/webhook`, `[id]/visual-frame`.
- `[id]/stop` CONSERVÉ (cleanup : `leaveMeeting` + transition statut) mais rapport post-call LLM + publish Ably gatés sous le flag.
- Conservé : GET (liste/détail), DELETE (nettoyage). `src/lib/live/*` dormant.
- `vitest.unit.config.ts` : `LIVE_COACHING_ENABLED=true` par défaut (routes testées en mode activé ; tests archivé-off → Phase 6).

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). 39 tests routes Live verts ; suite complète : seuls 6 `*-integration.test.ts` rouges (Neon capé). Scan auto : aucune route Live write/LLM sans guard. Différé Neon-up : stopper les bots Recall actifs. Gate Codex : **APPROVE** (après 1 round — gate report-LLM de `stop` + PATCH `[id]`).

---
## 2026-06-04 — infra/coûts — Phase 2 (refonte 5-sujets) : watchdog Neon événementiel par-analyse

### Contexte
Suite refonte 5-sujets. Un reaper cron (même à 15 min) réveille Neon à vide 24/7 (findMany inconditionnel) → ne restaure PAS le baseline ~3-4h compute/mois (≈10h/mois en horaire, ≈42h/mois en 15 min). Remplacement par une détection ÉVÉNEMENTIELLE par-analyse : Neon n'est touché que pendant qu'une analyse tourne réellement (~2 checks/analyse).

### Changements
- `src/lib/inngest.ts` : nouvelle `analysisWatchdogFunction` (event `analysis/watchdog.check`) — boucle durable `step.sleep 25m` → check UNE analyse → reap si figée (cap 8 itérations ≈ 3,3h ; la boucle vs tir unique couvre les hangs post-1er-check). Reaper global rétrogradé en BACKSTOP `0 */12 * * *` (orphelins). + registre `functions` + import des helpers. Non-stepwise full_analysis : `dispatchEventId` désormais threadé à `runAnalysis` (→ ligne Analysis le persiste, watchdog résoluble + get-or-create idempotent au retry).
- `src/lib/analysis-compensation.ts` : `reapIfStale` (helper PARTAGÉ ; `reapStaleAnalyses` byte-préservé, 9 tests existants verts) + `reapStaleAnalysisById` (resume) + `reapStaleAnalysisByDispatchEventId` (new-analysis ; no-row → `alive`/pending pour la race file Inngest).
- `src/app/api/analyze/route.ts` : 2 sends `analysis/watchdog.check` (new = `dispatchEventId`, gaté `full_analysis` ; resume = `analysisId`), non bloquants (échec → backstop 12h).
- `src/app/api/cron/reap-stale-analyses/route.ts` : commentaire rôle backstop 12h.

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). 37 tests (17 reaper/watchdog + 14 route + 6 stepwise). `@@index([dispatchEventId])` REPORTÉ en Phase 6 (migration générée quand Neon rouvre — évite le drift schema/migration). Gate Codex : **APPROVE** (après 2 rounds — threading non-stepwise + pending race + ciblage full_analysis + maj test/commentaire).

---
## 2026-06-04 — UI/produit — Phase 1 (refonte 5-sujets) : archivage de l'onglet Conditions

### Contexte
Refonte 5-sujets (plan agréé avec Codex). L'onglet « Conditions » (conçu pour un BA solo saisissant les conditions) est devenu une usine à gaz hors cœur de cible → archivé mais réactivable, sans casser l'agent `conditions-analyst` (dont `synthesis-deal-scorer` + `memo-generator` dépendent).

### Changements
- `src/lib/feature-flags.ts` (nouveau) : `isConditionsTabEnabled()` — flag SERVEUR runtime (pas `NEXT_PUBLIC` ; `page.tsx` est Server Component `force-dynamic` → toggle sans redeploy). Défaut `false` = archivé.
- `src/app/(dashboard)/deals/[dealId]/page.tsx` : gate du `TabsTrigger` + `TabsContent` « conditions » + retrait du champ `conditions` du `ScoreGrid` (Vue d'ensemble) quand off ; calcule `allowedTabs` passé à `DealDetailTabs`. Agent `conditions-analyst` CONSERVÉ.
- `src/components/deals/score-display.tsx` : ligne « Conditions » rendue seulement si `scores.conditions !== undefined` (`page.tsx` est le seul caller de `ScoreGrid`).
- `src/components/deals/deal-detail-tabs.tsx` : prop `allowedTabs` (onglets réellement rendus) → une URL `?tab=conditions` avec flag off retombe sur `analysis` (plus de vue vide). Couvre aussi `live` (Phase 3).

### Vérif
`tsc --noEmit` : aucune nouvelle erreur (seule baseline = `exit-strategist.ts`, untracked, hors périmètre). Choix flag-gating vs suppression d'imports : confirmé par Codex (imports non morts, référencés dans le JSX gaté). Gate Codex Phase 1 : **APPROVE** (après correction du cas URL `?tab=conditions` via `allowedTabs`).

---
## 2026-06-04 — infra/coûts — Reaper watchdog : cadence cron 5 min → 15 min (compute-hours Neon)

### Contexte
Compute-hours Neon passées de ~3-4h/MOIS à ~17h/4 JOURS. Cause racine : le cron Inngest `staleAnalysisReaperFunction` (introduit le 31/05, commit `773181f`) tournait à `*/5 * * * *` et exécutait un `prisma.analysis.findMany` INCONDITIONNEL à chaque tick → réveillait l'endpoint Neon ~288×/jour 24/7, empêchant l'autosuspend. Corrélation temporelle exacte (cron 4 j avant le report).

### Changements
- `src/lib/inngest.ts` : cadence reaper `*/5` → `*/15` + commentaire de rationale (seuil staleness `STALE_ANALYSIS_REAP_MS` = 20 min, donc 15 min détecte toute analyse figée dans sa fenêtre de seuil ; latence de détection ≤ 15 min < 20 min). 288 → 96 réveils/jour.
- `src/app/api/cron/reap-stale-analyses/route.ts` : commentaires « toutes les 5 min » → « 15 min » (cohérence).

### Vérif
`tsc --noEmit` : seul rouge préexistant = `exit-strategist.ts` (hors périmètre, fichier WIP non-tracké). Aucun test n'assert la chaîne du cron. Gate Codex : **APPROVE** (cadence 15 min correcte vs seuil 20 min ; flip atomique + refund-once inchangés ; `*/15` = meilleur trade-off vs `*/10`/`*/20`).

---

### Contexte
Sur une analyse Avekapeti rendue en prod, l'utilisateur a vu deux défauts : (#1) rank « Score de consistance insuffisant » avec « l'analyse n'est pas suffisamment fiable **pour prendre une decision** » / « baser une **decision d'investissement** » → **violation frontale de « Angel Desk ne décide jamais »** ; (#2) « La société Avekapeti**.** parie… » (faux point dans le `reformulated` LLM). Aggravation : la Phase 4 (fin des troncatures) affichait désormais le texte prescriptif en entier, et les guards doctrine ne couvraient pas la classe « décision ».

### Changements
- `lib/presentation.ts` : `scrubPrescriptiveDecisionLanguage(text)` — reformule les tournures où l'outil/l'analyse est présenté comme le LIEU de la décision (« fiable pour prendre une décision », « baser une décision d'investissement », « capacité à prendre une décision éclairée »). Précis ; ne touche PAS « à vous de décider » / « la décision revient à l'investisseur » ni la typographie FR. + `fixFalseSentencePeriod(text)` (#2, display-only, ciblé « société {Nom}. minuscule »).
- `lib/selectors.ts` : `cleanRenderedText` = scrub agents + anti-prescriptif, appliqué aux textes RENDUS (ranks title/description/evidence, QM, mémo criticalRisks/nextSteps/topPriorities/forNegotiation, signaux oneLiner/supports/concerns) → **corrige rétroactivement les analyses persistées** (pas de re-run).
- `sections/thesis-section.tsx` : `fixFalseSentencePeriod` sur le corps des cartes thèse (#2).
- Source (futures analyses) : `tier3/contradiction-detector.ts` (red flag reformulé, plus de « pour prendre une décision ») + `prompts/contradiction-detector-prompt.ts` (template l.128).
- Guard : fixture hostile + assertion VM « zéro tournure prescriptive décision dans ranks/mémo/signaux » + unit tests scrub (phrases exactes + négatifs doctrine) + fixFalseSentencePeriod.

### Couverture (corrections Codex F1-F4)
- F1/F2 : scrub appliqué à TOUTES les surfaces rendues (favorable/vigilance, mémo généré+reconstitué, thèse cards/loadBearing/alerts, evidence-collector — passe finale anti-prescriptif seule, pour préserver l'espace FR « : » du claim de contradiction).
- F3 : scrub SEGMENT-AWARE — ne reformule jamais un segment où l'INVESTISSEUR est le sujet de la décision (« l'investisseur conserve la capacité à prendre une décision » intact).
- F4 : `fixFalseSentencePeriod` borné à 1-3 tokens capitalisés accolés au point (ne fusionne pas « société X opère en France. elle… »).
- Guard : walk-all sur le view-model complet (zéro tournure prescriptive sur toutes surfaces).

### Vérif
analysis-v2 53 tests ; suite unit complète 4338 passed / 2 skipped ; tsc clean (hors `exit-strategist.ts`). Gate Codex : APPROVE (après 1 REQUEST_CHANGES — couverture P0 incomplète + sujet investisseur + period helper).

---
## 2026-06-03 — Refonte analysis-v2 — Phase 8c : Pappers MCP (décision argent → utilisateur)

### Décision
MCP officiel Pappers vérifié réel (`mcp.pappers.fr/{clé}`, abonnement payant à crédits, essai 2 semaines). Décision argent posée à l'utilisateur (AskUserQuestion) → **« Rester au plancher »**. 8a/8b reste la solution livrée pour #6 ; ni clé REST ni MCP provisionnés maintenant. MCP scopé et différé (revisité quand budget tranché). Aucun changement de code (la notice « couverture légale à vérifier » couvre l'UX en attendant).

---
## 2026-06-03 — Refonte analysis-v2 — Phase 9c : UI honnête réconciliation (#11)

### Contexte
9a fait que le réconciliateur RÉUSSIT (terminal_fallback → `success:true`) même quand les LLM échouent → il n'apparaît plus dans le bandeau « agents non aboutis » (#1 résolu par 9a, fin du cadrage « 1 petit agent »). Reste à signaler honnêtement le NOUVEL état : réconciliation aboutie MAIS en mode déterministe (synthèse LLM indisponible).

### Changements
- `thesis/types.ts` : champ STRUCTURÉ optionnel `synthesisDegraded?` sur `ThesisReconcilerOutput` (rétrocompat).
- `tier3/thesis-reconciler.ts` `execute()` : `synthesisDegraded = (resolution === "terminal_fallback")` — marqueur structuré, jamais une heuristique texte.
- `analysis-v2/lib/selectors.ts` `buildThesisSectionModel` : `reconciliationDegraded` (= reconciled && `data.synthesisDegraded`) ajouté au `ThesisSectionModel`.
- `analysis-v2/sections/thesis-section.tsx` : bandeau honnête (tone info) « Réconciliation en mode déterministe » — verdict + frictions viennent des signaux structurés, sans rédaction par modèle. Le bandeau « non effectuée » reste pour les vrais échecs. page-shell NON touché (le réconciliateur réussit → plus « agent non abouti »).

### Vérif
12 tests reconciler (dont « Test clé » end-to-end : completeJSON rejette tous les modèles → `execute()` success déterministe + `synthesisDegraded` ; + « Contrat PROD » : `run()` → `success:true`) + test selector `reconciliationDegraded`. Suite agents+thesis+analysis-v2+lib : 1473 passed. tsc clean (hors `exit-strategist.ts`). Gate Codex Phase 9c : APPROVE.

---
## 2026-06-03 — Refonte analysis-v2 — Phase 9b : idempotence persistence du réconciliateur

### Contexte
`thesisService.applyReconciliation` réécrivait `reconciledAt: new Date()` à CHAQUE appel → byte-drift au replay d'un step stepwise (alors que la sortie déterministe 9a est stable).

### Changements (`services/thesis/index.ts`)
- Helper pur `canonicalizeReconciliation(value)` : tri stable RÉCURSIF des clés ET des arrays → comparaison ordre-insensible. Le `reconcilerOutput` n'a aucune valeur volatile (`reconciledAt` est une colonne séparée) → JSON canonique suffit.
- `applyReconciliation` : garde idempotente AVANT l'update — si `reconciledAt` déjà set + `reconciliationJson` présent + `verdict`/`confidence` identiques + canonique égal → return la thèse existante SANS réécrire (`reconciledAt` préservé). Sinon update normal. La garde superseded (`!isLatest`) reste avant.

### Vérif
26 tests thesis-service verts (+3 : équivalent→pas de réécriture (notes réordonnées), verdict différent→réécrit, note-only→réécrit). tsc clean (hors `exit-strategist.ts`). Gate Codex Phase 9b : APPROVE.

---
## 2026-06-03 — Refonte analysis-v2 — Phase 9a : réconciliateur de thèse DURABLE (#1/#11)

### Contexte
Le réconciliateur de thèse (cœur produit) timeoutait → `success:false` → l'UI montrait « réconciliation non effectuée ». Faits vérifiés en lisant le code : `base-agent.run()` CATCH en interne (jamais de throw) → la boucle retry orchestrateur ne se redéclenche pas ; `llmCompleteJSON` cap chaque modèle à 50s (chaîne 3×50≈150s < 180s agent timeout) ; `llmCompleteJSONValidated` renvoie le `terminalFallbackData` (resolution `terminal_fallback`, success:true) S'IL valide le schéma, sinon throw. Le `terminalFallbackData` de `getThesisCallOptions` était un no-op « keep initial verdict ».

### Changements (`tier3/thesis-reconciler.ts`)
- `buildDeterministicLLMReconciliation(thesis, guardrails): LLMReconcilerOutput` (PAS `ThesisReconcilerOutput`, Codex #1) : verdict = floor déterministe ; `reconciliationNotes` = challenges (TRI STABLE → idempotence replay 9b) ; `newRedFlags` PRUDENTS (Codex #2) — `THESIS_VS_REALITY` émis SEULEMENT si un champ de thèse est **confidemment matché** (`field` non-null) ET le claim porteur existe ; sinon `reconciliationNote`. Confiance basse.
- `inferThesisField()` → `… | null` (Codex 9a) : RETIRÉ le défaut `loadBearing` qui fabriquait une association vers `loadBearing[0]` pour toute raison non classable. `DeterministicChallenge.field` nullable (propagé : clé dédup, prompt, tri).
- `execute()` : passe le déterministe comme `terminalFallbackData` APRÈS le spread `getThesisCallOptions` (override le no-op) ; capture `resolution` → si `terminal_fallback`, note honnête « Réconciliation déterministe — synthèse LLM indisponible ».
- `criticalSignals` dédup (Codex #2) : retiré `blockers.length +` (un blocker pousse déjà un challenge CRITICAL → double-compte). 1 blocker seul → `vigilance` (était `alert_dominant`). `ThesisReconcilerSchema` exporté pour test.

### Vérif
10 tests reconciler verts (schéma-valide, verdict=floor, newRedFlags prudents, field-null→note jamais fabriqué, déterministe, blocker-seul→vigilance). Suite agents+thesis+orchestrator : 701 passed. tsc clean (hors `exit-strategist.ts`). Gate Codex Phase 9a : APPROVE (après 1 REQUEST_CHANGES : défaut loadBearing fabriqué → field null).

---
## 2026-06-03 — Refonte analysis-v2 — Phase 8a/8b : Pappers / couverture légale (#6)

### Contexte
Le red flag CRITICAL « Absence de Vérification Légale (K-bis) » (devils-advocate, Avekapeti) a pour CAUSE « registre Pappers indisponible » (notre outil n'a pas pu interroger le registre — clé `PAPPERS_API_KEY` absente en prod), PAS « société risquée ». Il gonflait le compte de risques critiques et trahissait la machinerie comme un risque société.

### Changements (8a — reframe, plancher doctrine)
- `lib/presentation.ts` : `isLegalRegistryUnavailableSignal(text)` — **signature EXPLICITE** (résolution Codex), jamais une heuristique floue : exige À LA FOIS (1) un token de **CONNECTEUR/REGISTRE = l'outil interrogé** (`pappers`, `registre officiel/du commerce/national/des sociétés`, `greffe`, `infogreffe`, `companies house`, `societe.com`) — **`k-bis` EXCLU** car c'est un DOCUMENT (« K-bis indisponible/non fourni/non vérifié » = manque côté fondateur, vrai item de diligence) ; ET (2) un token explicite d'**ÉCHEC OUTIL** (`indisponible`, `non disponible`, `impossible de vérifier/interroger/consulter`, `pas pu (être) vérifier/interroger/consulter`). **Volontairement EXCLUS** (resserrements Codex r1/r2) : `non vérifié(s)`, `absence de vérification`, `n'a pas pu` non contraint — états ambigus. La conjonction « le CONNECTEUR est indisponible » isole l'échec outil sans jamais déclasser un vrai risque (litige, requalification, **procédure collective au greffe**, doc manquant). Constantes notice `LEGAL_COVERAGE_GAP_TITLE`/`_DETAIL`.
- `lib/selectors.ts` : helper partagé `redFlagSignalBlob(rf)` (title+description+impact+evidence+**location**) utilisé par les 3 chemins (alignement Codex #2, plus de fuite si la source n'est que dans `location`). (a) `extractRanksFromTier1RedFlags` retire les flags à signature « connecteur indisponible » (plus de faux risque critique, total #21 diminué d'autant) ; (b) `detectLegalCoverageGap(results)` → `buildDecisionSectionModel.legalCoverageGap` (1 notice consolidée, honnête) ; (c) `buildSignalsSectionModel.concerns` filtre les mêmes (pas d'alerte de dimension) ; (d) mémo généré `criticalRisks` filtre les mêmes (no-op « non fourni » pour Avekapeti, future-proof).
- `sections/decision-section.tsx` : Callout neutre « Couverture légale à vérifier » (limite de couverture de l'outil, pas un risque avéré) quand `legalCoverageGap`.

### 8b — REST (diagnostic, secret jamais loggé)
- Confirmé : `connectors/pappers.ts` lit bien `process.env.PAPPERS_API_KEY` (pas `n_API_KEY`). La clé n'est mise que dans le query `api_token` ; aucun log ne contient l'URL ni la clé (lignes warn/error = codes statut / chaînes statiques). Indispo Avekapeti = `unconfiguredCritical` (clé absente en prod, 19/19 autres connecteurs OK). Provisionnement clé (REST payant / MCP) = décision argent → Phase 8c. Aucun changement de code connecteur (déjà sûr, Surgical).

### Vérif
42 tests verts analysis-v2 (35 → +5 unit signature dont décoys fondateur/document, +2 guard VM #6). tsc clean (hors `exit-strategist.ts`). Validé sur données réelles : le fixture hostile reprend VERBATIM le flag devils-advocate Avekapeti (matche via « registre officiel … indisponible »).

---
## 2026-06-03 — Refonte analysis-v2 — Phase 7 : consolidation risques (source unique) + mémo (#20/#21/#22)

### Changements
- `lib/selectors.ts` : `consolidateRiskRanks()` = SOURCE UNIQUE (Codex #10) — fusionne dealbreakers QM + red flags Tier 1, **dédup par topic** (`inferRedFlagTopic`, réutilise le service `red-flag-dedup`), **représentant par sévérité max** (pas de premier-vu qui masque un CRITICAL), tri stable. `buildDecisionSectionModel.ranks` l'utilise (liste complète déduplicée #21, fin du cap muet à 8). `buildMemoSectionModel` : `totalCriticalRisks` + `topPriorities` (tous champs scrubés) partagés ; criticalRisks généré scrubés + `presentableSource` ; reconstitué = liste consolidée. Fin des `compactString` dans le mémo.
- `sections/memo-section.tsx` : #20 sous-titre neutre + note finale sans disclaimer redondant ; #21 `CompleteRisksHint` standalone (compte les **topics CRITICAL distincts** affichés, lien vers `#decision`) ; #22 bloc « Priorités d'investigation » surfacé aussi dans le mémo généré (`PrioritiesList`).
- Guards : dédup par topic (2 flags valorisation → 1), `totalCriticalRisks` exposé, `topPriorities` scrubés.

### Vérif
35 tests verts. tsc clean (hors `exit-strategist.ts`). Gate Codex Phase 7 : APPROVE (après 2 REQUEST_CHANGES : représentant par sévérité + comptage par topic distinct + hint standalone + scrub tous champs).

---
## 2026-06-03 — Refonte analysis-v2 — Phase 6 : preuves consolidées (#18 troncatures/noms d'agents, #19 contradictions)

### Changements
- `lib/evidence-collector.ts` : sources sanitizées (`sanitizeSourceLabel`), troncatures `compactString` retirées (claim/note complets), textes scrubés. Contradictions reformatées (#19) : source rattachée INLINE à chaque énoncé (« Doc : "…" ↔ Doc : "…" »), implication = note (« Lecture »), `topic`/`s1`/`s2` scrubés ; colonne Source = « Recoupement de sources » seulement si une source inline est présentable, sinon fallback honnête.
- `sections/evidence-section.tsx` : footer sans noms d'agents.
- Guard : assertion VM evidence rows (claim/source/note sans nom d'agent ; « Recoupement » ⇒ source inline réelle).

### Vérif
33 tests verts. tsc clean (hors `exit-strategist.ts`). Gate Codex Phase 6 : APPROVE (après 1 REQUEST_CHANGES : scrub topic/énoncés + source conditionnelle).

---
## 2026-06-03 — Refonte analysis-v2 — Phase 5 : cartes signaux (étaye/alerte, score masqué, légende)

### Contexte
Section 3 « Signaux par dimension » : #14/#15 puces positives sous orientation d'alerte, #16 score /100 biaisant, #17/#2 orientations peu différenciées.

### Changements
- `atoms/agent-card.tsx` : deux mini-listes « Ce qui étaye » / « Ce qui alerte » ; score /100 **masqué** (conservé en modèle).
- `lib/selectors.ts` (`buildSignalsSectionModel`) : `supports` (insights non-négatifs scrubés) + `concerns` (red flags title/description/impact scrubés) remplacent `insights[]` ; `oneLiner` scrubé ; `deriveFallbackOneLiner` ne renvoie plus de « Score X/100 » (libellé d'intensité non numérique).
- `sections/signals-section.tsx` : légende compacte des 4 orientations (#17/#2).
- Guard : assertion VM cards (oneLiner/supports/concerns sans nom d'agent ni `/100`).

### Vérif
32 tests verts. tsc clean (hors `exit-strategist.ts`). Gate Codex Phase 5 : APPROVE (après 1 REQUEST_CHANGES : score /100 dans oneLiner fallback + oneLiner non scrubé).

---
## 2026-06-03 — Refonte analysis-v2 — Phase 4 : Section 1 (provenance, troncatures, flèche, convergence)

### Contexte
Section « Synthèse de décision » : #4/#7 troncatures muettes, #5 titre générique, #7/#18 noms d'agents en source, #8 flèche cliquable morte, #9 convergence illisible.

### Changements
- `atoms/source-pin.tsx` : refonte GLOBALE (#8/#7) — `<span>` info non-cliquable (plus de flèche-bouton morte), source sanitizée via `presentableSource`, **rien affiché** si la source n'est qu'un nom d'agent ; tolère `null`.
- `lib/presentation.ts` : `presentableSource` (null si pas de vraie provenance), `scrubAgentNamesFromText` (scrub texte libre sans tokeniser), strip d'un préfixe-label `agent:`/`source:`.
- `lib/selectors.ts` : `extractRanksFromTier1RedFlags` — #5 titre dérivé (jamais « Risque identifié » si contenu), title scrubé, #4/#7 description + preuve COMPLÈTES (fin des `compactString`), preuve en champ `evidence`, source = null (pas de nom d'agent), location sanitizée. `extractRanksFromQuestionMaster` aligné. Mémo reconstitué : plus de provenance factice « Tier 1 ».
- `lib/view-types.ts` : `RankRowItem.evidence`. `atoms/rank-row.tsx` : preuve en `<details>` repliable.
- `lib/solidity-aggregator.ts` : #9 `countAlertSignalDistribution` restreint aux 12 dimensions Tier 1. `sections/decision-section.tsx` : #9 mini-table libellée (Signal critique / Investigation / Point d'attention / Conforme).
- Guards : fixture enrichi (titre piégé) + assertions VM ranks/mémo (zéro nom d'agent, pas de titre/provenance factice).

### Vérif
31 tests verts. tsc clean (hors `exit-strategist.ts`). Gate Codex Phase 4 : APPROVE (après 2 REQUEST_CHANGES : scrub embedded `agent:` + rawTitle ; provenance « Tier 1 »).

---
## 2026-06-03 — Refonte analysis-v2 — Phases 0b/2/3 : guard runtime + section thèse + verdict honnête

### Contexte
Suite refonte analysis-v2. 0b = filet de tests ; 2 = section thèse (#10 capitalisation, #12 statut/à-vérifier visibles, #13 enum → label) ; 3 = decision-strip (#3 cohérence verdict thèse).

### Changements
- 0b : `__tests__/fixtures/hostile-results.ts` (fixture réutilisable) + `__tests__/doctrine-runtime-guard.test.ts` (guard data-driven, helpers + VM thèse).
- 2 : `sections/thesis-section.tsx` — `capitalizeFirstMeaningfulChar` (card bodies + load-bearing), statut `declared` en tonalité vigilance (« Déclaré · non vérifié »), bloc « À vérifier » en badge visible, catégorie en chip lisible. `lib/selectors.ts` (`buildThesisSectionModel`) — `category` mappée via `thesisAlertCategoryLabel` (VM expose le label, jamais l'enum).
- 3 : `decision-strip.tsx` — `thesisConfronted` : verdict thèse affiché « Thèse non réconciliée » (tonalité neutre) quand la réconciliation n'a pas abouti (hors `thesis_only`), au lieu du verdict initial présenté comme abouti.

### Vérif
26 tests verts (analysis-v2). `tsc --noEmit` propre (hors `exit-strategist.ts` préexistant). Gate Codex Phases 2+3 : APPROVE.

---
## 2026-06-03 — Refonte analysis-v2 (22 pts) — Phase 0a : helpers de présentation + labels doctrine

### Contexte
Refonte de la vue Deep Dive (analysis-v2) sur 22 problèmes remontés (captures Avekapeti), plan validé par Codex (VERDICT APPROVE après 2 tours). Phase 0a = fondation : sanitization user-facing (zéro nom d'agent technique, zéro enum brut) réutilisée par toutes les phases suivantes.

### Changements
- `analysis-v2/lib/solidity-aggregator.ts` : `export` de `AGENT_DEFINITIONS` (source unique, évite copie divergente).
- `analysis-v2/lib/presentation.ts` (nouveau) : `sanitizeSourceLabel` (scrub global des noms d'agents même embarqués + `*-expert`, fallback honnête « Provenance documentaire non disponible / Synthèse interne non sourcée », réécriture jargon Context Engine/Fact Store, séparateurs `·`/`&` seulement pour préserver les dates), `humanizeInlineAgentNames`, `capitalizeFirstMeaningfulChar` (1er char only, display-only), `AGENT_TECHNICAL_NAMES`.
- `lib/ui-configs.ts` : `THESIS_ALERT_CATEGORY_LABELS` (8 catégories) + `thesisAlertCategoryLabel()` (fallback humanisé, jamais d'enum brut).
- `analysis-v2/__tests__/presentation.test.ts` (nouveau) : 13 tests hostiles (dont noms d'agents embarqués).

### Vérif
13/13 tests verts. `tsc --noEmit` : aucune nouvelle erreur (seule erreur préexistante = `exit-strategist.ts`, untracked, hors périmètre). Gate Codex Phase 0a : APPROVE (après 1 REQUEST_CHANGES corrigé — scrub embedded).

---
## 2026-06-03 — Gate Codex : indépendance d'abord, confrontation ensuite (anti-ancrage, symétrique)

### Contexte
Sur les contextes d'idéation/diagnostic, Codex était susceptible d'être **ancré** par l'analyse de Claude (« voici ma solution, t'es d'accord ? ») → il critique dans le cadre de Claude au lieu de penser frais. Perte de la valeur des deux avis indépendants. Demande utilisateur : Codex doit réfléchir **seul à partir de la demande originale d'abord**, puis confrontation — l'idée utile peut venir de l'un comme de l'autre (symétrique).

### Changements
- `CLAUDE.md` § Gate Codex → sous-section « Indépendance d'abord, confrontation ensuite (anti-ancrage) ». Pour idéation/diagnostic (feature, diagnostic — **pas** la review de diff) : fournir à Codex la **demande originale verbatim + contexte neutre, SANS la solution/conclusion de Claude** ; Codex produit son propre raisonnement d'abord ; confrontation ensuite (2ᵉ relance `codex exec resume` montrant l'avis de Claude, ou synthèse Claude). Exception : review de diff = ancrage inhérent OK.

### Vérif
Doc/doctrine uniquement. Cohérent avec § Routing (décision produit = utilisateur) et la doctrine produit Board AI (désaccords exposés).

---
## 2026-06-03 — Gate Codex : périmètre risk-tiered + second regard diagnostic (captures / incompréhension)

### Contexte
Étendre Codex au-delà des seuls plans multi-étapes, sans tomber dans le « Codex sur tout » (coût/latence + bruit qui érode l'attention). Décision utilisateur (impacte le coût → arbitrage utilisateur, pas Codex).

### Changements
- `CLAUDE.md` § Gate Codex : nouvelle sous-section « Périmètre — quand faire intervenir Codex ». **Gate obligatoire** sur changements à risque (durabilité/byte-equiv, scoring, auth/sécu, migrations, prompts doctrine, refacto/logique non triviale), plan ou standalone, via `codex-gate-drive.sh`. **Second regard diagnostic** sur captures de bug / incompréhension via `codex exec -s read-only -i <capture>` (hors gate diff-based, car souvent pas de changement). **Sounding board** sur idées de features/produit via `codex exec -s read-only` (Codex critique faisabilité/risques/alternatives, **ne décide pas** — la décision produit reste à l'utilisateur, cf. § Routing). **Skip** : UI, petits fix, typos/commentaires/format/doc.

### Vérif
Flag `-i/--image` de `codex exec` confirmé dans `codex exec --help`. Doc/doctrine uniquement, aucun code exécutable modifié.

---
## 2026-06-03 — Gate Codex : migration MCP → `codex exec resume` (continuité survit aux relais) + ledger

### Contexte
Une session relayée affichait *« The thread expired (Codex sessions are ephemeral). I'll start a fresh thread… »* → le gate repartait d'un thread neuf en perdant le contexte des étapes précédentes. Cause racine : le handle de thread MCP (`mcp__codex__codex-reply`) est scopé au process `codex mcp-server` ; il meurt à tout redémarrage de process (relais via `codex-relay.sh`). Le rollout de la conversation existe pourtant **sur disque** (`~/.codex/sessions/…/rollout-*-<id>.jsonl`, source `mcp`), et `codex exec resume <id>` sait le reprendre cross-process.

### Changements
- `~/.claude/bin/codex-gate-drive.sh` (nouveau, global) : pilote UNE étape de gate. **Create** via `codex exec -s read-only --json` (capture `thread.started.thread_id`), **resume** ensuite via `codex exec resume <id> -c sandbox_mode=read-only` (reprend le rollout disque). Effort `xhigh` forcé (override `CODEX_GATE_EFFORT`). Persiste `.codex-gate-thread`, append le ledger `.codex-gate-log.md` (1 bloc/tour : étape + verdict). Payload passé en **stdin** (`-`) pour éviter ARG_MAX sur gros diffs. Fallback : si `resume` échoue (rollout perdu), cold start **re-seedé par le ledger**. `codex-gate.sh` (builder de payload) inchangé.
- `CLAUDE.md` : § « Gate Codex par étape » réécrit (MCP → drive script ; protocole 1 appel/étape ; RAZ `.codex-gate-thread` + `.codex-gate-log.md` au début du plan) ; § « Routing des décisions » parenthèse « thread MCP » → `codex-gate-drive.sh`.
- `.gitignore` : `+ /.codex-gate-log.md` (artefact local, hors payload du gate).

### Vérif
Mécanisme testé **bout-en-bout** dans un repo git temp isolé (effort `low`, jamais dans angeldesk) : `create` capture l'UUID ; `resume` rappelle un mot-clé du tour précédent **thread inchangé** (`mode=resume`) = continuité réelle via rollout disque (pas via seed). Deux bugs trouvés et corrigés en cours de test : (1) `printf '- …'` lu comme option par bash → format `%s` + tiret dans la donnée ; (2) `codex exec resume` rejette `--color` (que `create` accepte) → retiré de la branche resume. `bash -n` OK ; `git check-ignore .codex-gate-log.md` OK ; `codex-cli 0.135.0`.

### Reste
1er run réel en plan multi-étapes sur angeldesk (notamment à travers un vrai relais) pour confirmer en conditions. NB : `.codex-gate-thread` d'angeldesk a changé pendant cette session (activité d'une autre session concurrente) — les edits de fichiers trackés ci-dessus (CLAUDE.md, .gitignore) apparaîtront dans le `git diff HEAD` d'un éventuel gate concurrent en cours.

---
## 2026-06-02 — Relais autonome de session (auto-handoff iTerm2) au point d'arrêt de scope

### Contexte
Éviter le cycle manuel fermer/rouvrir Claude + coller le recap toutes les ~20 min. Au point d'arrêt « avertissement de scope » (CLAUDE.md § Obéissance stricte), la session spawn elle-même une session fraîche et se ferme.

### Changements
- `~/.claude/bin/codex-relay.sh` (nouveau, global) : spawn d'un pane iTerm2 frais via AppleScript natif (`split` + `write text` + `close`, pas de keystrokes/System Events), relance `claude --effort max --permission-mode bypassPermissions` sur `.codex-gate-resume.md`. Sentinelle de démarrage `.codex-relay-up` + 60 s de latence + check `.codex-relay-dead`/pane-existe avant de fermer le pane courant. Cible le pane via `${ITERM_SESSION_ID#*:}` et l'app iTerm par **bundle id** `com.googlecode.iterm2` (insensible au nom iTerm/iTerm2). Flag **`--dry-run`** : B lance `echo+sleep` au lieu de claude (valide iTerm/TCC/fermeture sans session autonome ; ignore le cap).
- `CLAUDE.md` : section « Relais autonome de session au point d'arrêt » + RAZ compteur au début du plan (gate Codex point 2).
- `.gitignore` : ignore les artefacts relais (`.codex-gate-resume.md`, `.codex-gate-relay-count`, `.codex-relay-up/-dead`, `STOP`) + `.codex-gate-thread` (sinon inclus comme untracked dans le payload `codex-gate.sh`).
- Garde-fous : `STOP` file (kill manuel, jamais auto) ; cap `CODEX_RELAY_CAP` (défaut 10) via `.codex-gate-relay-count` (par plan).

### Vérif
`bash -n` OK ; gardes STOP/cap/non-iTerm testées en sandbox (exit 3/4/2) ; gitignore 6/6 ignorés ; flags `--effort max` + `--permission-mode bypassPermissions` confirmés via `claude --help`. NON testé en réel : spawn/close osascript (exige iTerm + Automation/TCC au 1er run ; le 1er `bypassPermissions` peut demander une confirmation à accepter une fois).

### Reste
Valider le 1er relais réel : autoriser « iTerm contrôle iTerm » (Automation), accepter le bypass une fois, régler iTerm « Prompt before closing » pour ne pas bloquer la fermeture auto.

