# Changes Log - Angel Desk

---
## 2026-02-24 — fix: post-call report crash + retry + coaching pertinence + latence

### src/lib/live/post-call-generator.ts
- Fix crash `Cannot read properties of undefined (reading 'length')` : sanitisation du rapport LLM (tous les tableaux défaultés à [])
- Sécurisation de `generateMarkdownReport` : optional chaining sur tous les `.length`, defaults sur sous-champs

### src/app/api/live-sessions/[id]/retry-report/route.ts (NEW)
- Route POST pour relancer la génération du rapport sur sessions failed/processing
- Supprime le summary existant avant de relancer

### src/components/deals/live-tab-content.tsx
- Bouton "Relancer le rapport" sur les sessions failed dans l'historique
- useMutation + invalidation du cache sessions

---
## 2026-02-24 — fix: coaching pertinence + latence + polling UI

Refonte du coaching engine pour réactivité et pertinence. Le LLM réagit maintenant à ce qui est dit, pas aux données du deal.

### src/lib/live/coaching-engine.ts
- System prompt réécrit : RÈGLE N°1 = réactivité (carte DOIT réagir à l'utterance)
- Prompt restructuré : utterance EN PREMIER, deal context en référence à la fin
- Interdit explicitement les cartes génériques non liées à l'utterance

### src/app/api/live-sessions/[id]/webhook/route.ts
- Buffer abaissé de 15 à 8 mots (capture "je veux une valo à 25M" sans attendre plus)
- Gap timeout de 4s à 3s
- Ajout logging détaillé : timing pipeline, auto-promote, buffer flush, chaque webhook reçu

### src/components/deals/live-tab-content.tsx
- Polling agressif pour bot_joining et processing : 2s (au lieu de 15s)
- staleTime réduit à 2s

### src/app/api/live-sessions/[id]/start/route.ts
- Ajout `automatic_leave` config (timeouts waiting room, no one joined, everyone left)

### src/lib/live/utterance-router.ts
- Simplifié shouldTriggerCoaching : tout non-BA non-investor non-filler trigger coaching

---
## 2026-02-24 — fix: Recall.ai low latency config — transcription temps réel

Config critique Recall.ai : passage de `prioritize_accuracy` (3-10 min de délai) à `prioritize_low_latency` (~1-3s). Sans ce fix, le coaching live est inutilisable.

### src/app/api/live-sessions/[id]/start/route.ts
- Remplacement ancien format (`real_time_transcription` + `transcription_options`) par `recording_config`
- Activation `recallai_streaming.mode: "prioritize_low_latency"`
- Activation `realtime_endpoints` avec events `transcript.data` + `transcript.partial_data`

### src/app/api/live-sessions/[id]/webhook/route.ts
- Parsing du champ `event` pour distinguer `transcript.data` vs `transcript.partial_data`
- Les partial results sont ignorés côté coaching pipeline (skip costly LLM calls)
- TODO: publier les partials via Ably pour indicateur "qui parle" en temps réel

### src/lib/live/types.ts
- `RecallBotConfig` reécrit avec le nouveau format `recording_config` (Recall.ai API v1.10+)
- Ajout type `RecallRealtimeEvent` pour les events webhook

### LIVE-COACHING-SPEC.md
- Annexe A enrichie : documentation de la config low latency, tableau comparatif des modes, limitations FR, stratégie partial results

---
## 2026-02-24 — fix: live coaching display & orchestration — 8 fichiers frontend

Audit et correction des composants d'affichage et d'orchestration du coaching live.

### ui-constants.ts (NEW)
- Cr\u00e9ation de `src/lib/live/ui-constants.ts` avec constantes partag\u00e9es
- `SESSION_STATUS_LABELS`, `SESSION_STATUS_COLORS` (avec dark mode)
- `formatDuration()` utilitaire partag\u00e9
- `SEVERITY_CONFIG` avec dark mode (import\u00e9 par post-call-report, post-call-reanalysis)

### live-tab-content.tsx (CRITICAL)
- Fix "completed" state : sessions compl\u00e9t\u00e9es < 10min restent visibles comme actives
- Fix polling conditionnel : 5s (processing), 15s (active), off (idle) au lieu de 10s fixe
- Fix double refetch : suppression `queryClient.invalidateQueries` redondant dans `handleRefresh`
- Ajout dark mode sur erreur : `dark:border-red-800 dark:bg-red-950/50`, textes red-200/red-400
- Import constantes partag\u00e9es depuis `ui-constants.ts` (suppression duplication)
- Fix accents FR : "Cr\u00e9\u00e9e", "\u00c9chou\u00e9e", "R\u00e9essayer", "G\u00e9n\u00e9ration", "pr\u00e9c\u00e9dentes", "r\u00e9union"

### live-session-card.tsx
- Fix `ACTIVE_STATUSES` : ajout "created" et "processing" (alignement avec live-tab-content)
- Import `formatDuration` depuis `ui-constants.ts` (suppression duplication locale)
- Fix accents FR : "\u00c0 l\u2019instant", "Dur\u00e9e", "r\u00e9el"

### live-session-launcher.tsx
- Ajout dark mode sur badges plateformes : `dark:bg-blue-900 dark:text-blue-200`, etc.
- Ajout dark mode sur badges analyse : `dark:bg-green-900`, `dark:bg-yellow-900`
- Ajout dark mode sur erreur : `dark:bg-red-950/50 dark:border-red-800`
- Fix accents FR : "cr\u00e9er", "d\u00e9marrage", "compl\u00e8te", "r\u00e9union", "support\u00e9s", "Fran\u00e7ais", "S\u00e9lectionner"

### analysis-questions-tab.tsx
- Ajout dark mode sur priority badges : `dark:bg-red-900 dark:text-red-200`, etc.
- Ajout `aria-expanded` sur boutons collapsibles des cat\u00e9gories
- Fix accents FR : "\u00c9lev\u00e9e" (haute priorit\u00e9), "compl\u00e8te"

### post-call-report.tsx (CRITICAL)
- Fix bug dur\u00e9e : suppression division par 60 (`stats.duration` d\u00e9j\u00e0 en minutes)
- Import `SEVERITY_CONFIG` depuis `ui-constants.ts` (dark mode inclus)
- Ajout dark mode sur badges owner, coaching, confidence delta
- Ajout `aria-expanded` sur boutons `CollapsibleSection`
- Fix accents FR : "\u00c9lev\u00e9", "Points cl\u00e9s", "S\u00e9v\u00e9rit\u00e9", "Questions pos\u00e9es", "\u00c9ch\u00e9ance", "Dur\u00e9e", "R\u00e9sum\u00e9", "Apr\u00e8s", "Partag\u00e9"

### post-call-reanalysis.tsx
- Ajout cas neutre (diff = 0) pour delta confiance : styling gris au lieu de rouge
- Import `SEVERITY_CONFIG` depuis `ui-constants.ts` (dark mode inclus)
- Ajout dark mode sur erreurs et badges delta
- Fix accents FR : "r\u00e9-analyse", "cibl\u00e9e", "compl\u00e8te", "termin\u00e9e", "lanc\u00e9e", "r\u00e9solues", "impact\u00e9s"

### live/page.tsx
- Ajout redirect non-popout vers `/deals/[dealId]?tab=live`
- Page simplifi\u00e9e (ne sert plus que pour le mode pop-out)

**Validation :** `tsc --noEmit` OK (0 erreurs)

---
## 2026-02-24 — fix: live coaching real-time components — 6 fichiers frontend

Audit et correction des composants temps reel du coaching live.

### session-status-bar.tsx (CRITICAL)
- Fix canal Ably : `session:${sessionId}` -> `live-session:${sessionId}` (le serveur publie sur live-session:)
- Ajout dark mode : `dark:border-red-800 dark:bg-red-950/30` sur le container live
- Ajout `aria-hidden="true"` sur les dots decoratifs (pulsing red dot)
- Fix accents FR : "Preparation" -> "Preparation", "Generation" -> "Generation"

### coaching-feed.tsx
- Remplacement placeholder QuestionsTab par le vrai composant `AnalysisQuestionsTab`
- Ajout prop `dealId` (optionnel, fallback sur `useParams`)
- Ajout semantique ARIA tabs : `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`
- Ajout `aria-live="polite"` et `role="log"` sur le scroll container
- Limite addressed cards a 20 max dans le reducer
- Fix accents FR : "Abordes" -> "Abordes", "apparaitront" -> "apparaitront", "fenetre separee" -> "fenetre separee"

### coaching-card.tsx
- Fix relativeTime fige : suppression `useMemo` pour que le temps se mette a jour a chaque re-render
- Ajout `aria-hidden="true"` sur l'icone decorative
- Ajout `role="article"` et `aria-label` sur le wrapper de carte
- Fix accents FR : "Aborde" -> "Aborde", "a l'instant" -> "a l'instant", "Priorite" -> "Priorite", "Nego" -> "Nego"

### session-controls.tsx
- Suppression complete du bouton Pause (aucun effet server-side, trompeur pour l'utilisateur)
- Suppression state `isPaused` et `togglePause` inutilises
- Fix accents FR : "Arret" -> "Arret", "genere" -> "genere"

### ably-provider.tsx
- Ajout etat d'erreur avec bouton "Reessayer" quand connexion failed/closed (au lieu d'un spinner infini)
- Ajout dark mode sur le container d'erreur : `dark:border-red-800 dark:bg-red-950/50`
- Fix accents FR : "Connecte" -> "Connecte", "Deconnecte" -> "Deconnecte", "Ferme" -> "Ferme", "reel" -> "reel"

### participant-mapper.tsx
- Fix reference instable `debouncedSave` : utilisation `useRef` pour `saveMutation.mutate` (evite re-creation a chaque render)
- Ajout dark mode sur tous les badges de role : `dark:bg-X-900 dark:text-X-200 dark:border-X-700`
- Ajout `aria-label` sur chaque SelectTrigger : `Role de ${participant.name}`
- Fix accents FR : "detecte" -> "detecte", "Sauvegarde" -> "Sauvegarde", "roles" -> "roles"

---
## 2026-02-24 — fix: audit backend logic (src/lib/live/) — 5 fichiers, 1 suppression

Audit et correction de la logique backend dans `src/lib/live/`.

### post-call-generator.ts (CRITICAL)
- Ajout `generateAndSavePostCallReport()` — orchestrateur complet : generate -> markdown -> save -> status -> Ably notify
- Gestion erreur : session passe en "failed" avec message d'erreur en cas d'echec
- Merge des imports dupliques (`completeJSON` + `runWithLLMContext` en une seule ligne)
- Suppression import inutilise `MODELS`
- Ajout import `publishSessionStatus` depuis ably-server

### context-compiler.ts (CRITICAL)
- Ajout cache in-memory avec TTL de 5 minutes (`compileDealContextCached`)
- Ajout `getCachedSerializedContext()` pour acces sans DB call
- Ajout `clearContextCache()` pour invalidation apres reanalyse
- Evite ~100-150 appels DB identiques par session de 30min

### recall-client.ts (SECURITY)
- Remplacement boucle XOR manuelle par `crypto.timingSafeEqual` (timing attack prevention)
- `recallFetch` rendu prive (suppression export, usage interne uniquement)
- `detectPlatform` utilise `new URL()` pour validation stricte du hostname (au lieu de regex)
- Suppression du tableau PLATFORM_PATTERNS devenu inutile

### coaching-engine.ts (SECURITY)
- Ajout `sanitizeTranscriptText()` — strip ``` et balises system/user/assistant/INST
- Application aux textes de transcription dans `buildCoachingPrompt`
- `COACHING_SYSTEM_PROMPT` et `buildCoachingPrompt` rendus prives (suppression export, usage interne)

### deepgram-client.ts (CLEANUP)
- Fichier supprime entierement (stub jamais importe)

---
## 2026-02-24 — fix: audit API routes — post-call pipeline, webhook guards, rate limits, validation

**Fichiers modifies :**
- `src/app/api/live-sessions/[id]/stop/route.ts`
- `src/app/api/webhooks/recall/route.ts`
- `src/app/api/live-sessions/[id]/webhook/route.ts`
- `src/app/api/live-sessions/route.ts`
- `src/app/api/live-sessions/[id]/route.ts`
- `src/app/api/coaching/reanalyze/route.ts`

**Corrections appliquees :**
- **CRITICAL** : `generatePostCallReport` remplace par `generateAndSavePostCallReport` dans stop/route.ts et recall webhook (rapport etait genere mais jamais sauvegarde)
- **recall webhook** : generic 401 au lieu de 500 avec details internes quand RECALL_WEBHOOK_SECRET absent ; duplicate guard pour eviter double processing/completed
- **transcript webhook** : generic 401 pour secret manquant ; try-catch JSON.parse ; chunk limit guard (2000 max) ; import `compileDealContextCached` (cached) ; skip auto-dismiss pour filler/small_talk ; merge 2 card queries en 1 ; parallelize deal context dans Promise.all ; ecriture `context: text` dans CoachingCard
- **live-sessions GET** : validation dealId query param ; `coachingCards: true` toujours inclus
- **live-sessions POST** : rolling 24h au lieu de startOfDay pour daily limit (coherent avec live-session-limits.ts)
- **live-sessions/[id] PATCH** : `llmModel` valide par z.enum au lieu de z.string
- **coaching/reanalyze** : rate limit 3/h par user ajoute

**Validation :** tsc --noEmit 0 erreurs dans src/app/api/

---
## 2026-02-24 — fix: audit DB Live Coaching — cascades, indexes, precision, updatedAt

**Fichiers modifiés :**
- `prisma/schema.prisma`

**Corrections appliquées :**
- **C1** : `onDelete: SetNull` sur `LiveSession.deal` et `LiveSession.document`, `onDelete: Cascade` sur `LiveSession.user` (FK constraint errors on delete)
- **H1** : Indexes composites `[userId, status]`, `[userId, createdAt]` sur LiveSession ; `[sessionId, isFinal, classification]` sur TranscriptChunk
- **H2** : `updatedAt @updatedAt` ajouté sur TranscriptChunk et CoachingCard
- **H3** : `totalCost` precision `Decimal(6,4)` -> `Decimal(8,4)` sur LiveSession (aligné avec AIBoardSession)

**Validation :** prisma generate OK, db push OK, tsc --noEmit OK (0 erreurs)

---
## 2026-02-24 — feat: Live Coaching — implémentation complète (35 fichiers, 6 batches)

**Feature Live Coaching** : coaching IA temps réel pendant les calls BA/fondateur. Bot Recall.ai rejoint le meeting, transcrit, classifie les interventions, génère des suggestions contextuelles via Sonnet croisées avec l'analyse AngelDesk existante, push en temps réel via Ably.

### Infrastructure (12 fichiers)
- `src/lib/live/types.ts` — Types partagés (SessionStatus, DealContext, CoachingResponse, PostCallReport, Ably events, Recall.ai types)
- `src/lib/live/recall-client.ts` — Client Recall.ai (createBot, leaveMeeting, verifyWebhookSignature HMAC, detectPlatform)
- `src/lib/live/ably-server.ts` — Publisher Ably (singleton, publishCoachingCard, generateAblyToken scoped 60min)
- `src/lib/live/deepgram-client.ts` — Stub Deepgram (interface prête)
- `src/lib/live/context-compiler.ts` — Compile DealContext depuis DB (Promise.all, ~5-10K tokens)
- `src/lib/live/utterance-router.ts` — Classifieur hybride regex+Haiku, shouldTriggerCoaching
- `src/lib/live/speaker-detector.ts` — Détection BA fuzzy match, mapSpeakerToRole
- `src/lib/live/coaching-engine.ts` — Moteur coaching Sonnet, timeout 5s via Promise.race, getTranscriptBuffer
- `src/lib/live/auto-dismiss.ts` — Auto-détection sémantique Haiku, markCardsAsAddressed
- `src/lib/live/post-call-generator.ts` — Rapport post-call + saveReport (Document + SessionSummary en transaction)
- `src/lib/live/post-call-reanalyzer.ts` — Delta report, identifyImpactedAgents, triggerTargetedReanalysis
- `src/lib/live/monitoring.ts` — Logging structuré [LiveCoaching], latence, coûts, erreurs
- `src/services/live-session-limits.ts` — Limites (1 active, 3/jour), usage tracking, coût estimé

### Routes API (10 fichiers)
- `src/app/api/live-sessions/route.ts` — POST create + GET list (rate limit, ownership)
- `src/app/api/live-sessions/[id]/route.ts` — GET detail + PATCH update
- `src/app/api/live-sessions/[id]/start/route.ts` — POST deploy bot Recall.ai
- `src/app/api/live-sessions/[id]/stop/route.ts` — POST stop + fire-and-forget report
- `src/app/api/live-sessions/[id]/participants/route.ts` — PUT update participants roles
- `src/app/api/live-sessions/[id]/webhook/route.ts` — POST transcription chunks (CRITIQUE: store→classify→auto-dismiss→coaching→publish, fire-and-forget)
- `src/app/api/webhooks/recall/route.ts` — POST bot status events (in_call→live, done→processing, fatal→failed)
- `src/app/api/coaching/context/route.ts` — GET deal context compilé
- `src/app/api/coaching/ably-token/route.ts` — GET token Ably scopé
- `src/app/api/coaching/reanalyze/route.ts` — POST re-analyse (delta/targeted/full)

### Frontend (13 fichiers)
- `src/app/(dashboard)/deals/[dealId]/live/page.tsx` — Page shell server component (auth, data, state-based rendering, pop-out)
- `live/components/live-session-launcher.tsx` — Formulaire URL meeting + auto-detect plateforme + langue
- `live/components/participant-mapper.tsx` — Mapping rôles participants, fuzzy match BA, auto-save
- `live/components/ably-provider.tsx` — Wrapper Ably realtime (authCallback, connexion indicator)
- `live/components/coaching-feed.tsx` — Feed principal (useReducer + useChannel Ably, auto-scroll, pop-out)
- `live/components/coaching-card.tsx` — Carte coaching (4 types colorés, priorité, animation slide-in, état abordé)
- `live/components/analysis-questions-tab.tsx` — Questions analyse groupées par catégorie
- `live/components/session-status-bar.tsx` — Barre LIVE (dot rouge pulsant, timer, status Ably)
- `live/components/session-controls.tsx` — Pause/Stop avec AlertDialog confirmation
- `live/components/post-call-report.tsx` — Rapport 9 sections collapsibles
- `live/components/post-call-reanalysis.tsx` — Trigger re-analyse 3 modes
- `src/components/deals/live-tab-content.tsx` — Orchestrateur complet du flow (state machine → bons composants)
- `src/components/deals/live-session-card.tsx` — Mini-card overview deal

### Fichiers modifiés
- `prisma/schema.prisma` — +4 modèles (LiveSession, TranscriptChunk, CoachingCard, SessionSummary), +CALL_TRANSCRIPT enum, +relations Deal/User/Document
- `src/lib/query-keys.ts` — Section `live` (sessions, session, cards, context, summary)
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Onglet "Live" (5e tab, icône Radio, dynamic import ssr:false)

### Vérification : `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Live Coaching monitoring + error handling hardening

**Fichier cree :**
- `src/lib/live/monitoring.ts` — Structured logging pour live coaching. 4 fonctions : `logCoachingLatency` (latence par stage, warn si >5s), `logCoachingError` (erreurs structurees), `logSessionEvent` (evenements session avec data optionnelle JSON), `trackCoachingCost` (couts LLM par agent). Format `[LiveCoaching]` uniforme, console-based, pret pour migration vers service monitoring externe.

**Fichiers modifies :**
- `src/lib/live/coaching-engine.ts` — Fix timeout 5s : remplacement AbortController (signal jamais connecte a completeJSON) par `Promise.race` contre un timer. Si le timer gagne, retourne `NO_RESPONSE` et le call LLM est discard en background. Meme fail-safe : ne crashe jamais le pipeline.
- `src/app/api/live-sessions/[id]/webhook/route.ts` — (1) Import et integration monitoring a chaque etape du pipeline async (classify, auto-dismiss, coaching, full pipeline). (2) Try/catch individuel par etape : avant, un echec de classification empechait auto-dismiss et coaching d'executer. Maintenant chaque etape est independante avec fallback. Classification default `strategy_reveal` si LLM echoue (fail open). Import `UtteranceClassification` pour typage correct.

**Fichiers verifies (aucune modification) :**
- `src/lib/live/utterance-router.ts` — Fallback deja correct : catch sur LLM retourne `strategy_reveal` confidence 0.5 (fail open). Validation classification LLM deja presente.
- `src/app/api/webhooks/recall/route.ts` — Gestion status inconnus deja en place (default case log + ignore). Optional chaining sur tous les champs nullable. Try/catch global + fire-and-forget post-call avec .catch.

---
## 2026-02-24 — feat: Live session limits service, session card, live tab content orchestrator

**Fichiers crees :**
- `src/services/live-session-limits.ts` — Service de limites et usage des sessions live. `canStartLiveSession(userId)` verifie max 1 session active (status in created/bot_joining/live) et max 3 sessions par 24h. `getSessionUsage(userId)` retourne activeCount, todayCount, todayLimit pour affichage UI. `recordSessionDuration(sessionId, durationMinutes)` calcule et enregistre le cout estime ($2.40/h) dans `LiveSession.totalCost`. Import prisma depuis `@/lib/prisma`. `Promise.all` pour queries paralleles dans getSessionUsage.
- `src/components/deals/live-session-card.tsx` — Mini-card pour onglet overview deal. Props: `{ dealId }`. `useQuery` avec `queryKeys.live.sessions(dealId)`, refetch toutes les 60s. 3 etats d'affichage : session active (carte verte pulsante "Session live en cours" avec badge lien vers onglet Live), session completee recente (date relative + duree), aucune session (description courte). Helpers `formatRelativeDate` et `formatDuration`. Icone `Radio` de lucide-react. Skeleton loading. shadcn Card + Badge.
- `src/components/deals/live-tab-content.tsx` (UPDATE) — Remplacement du placeholder par orchestrateur complet du flow live. `useQuery` sessions avec `includeSummary=true`, refetch 10s. Check analyse via query separee. Rendering conditionnel par status: no session → `LiveSessionLauncher`, created/bot_joining → waiting + `ParticipantMapper`, live → `AblyProvider` wrapper + `SessionStatusBar` + `SessionControls` + `CoachingFeed`, processing → spinner + `PostCallReport`, completed → `PostCallReport` + `PostCallReanalysis`. Historique des sessions completees en bas. Import de 8 composants depuis live/components/. Error state avec bouton retry. Sub-components `ActiveSessionView` et `SessionHistory`.

---
## 2026-02-24 — feat: Live Coaching UI — 5 composants client (questions, status bar, controls, report, reanalysis)

**Fichiers crees :**
- `src/app/(dashboard)/deals/[dealId]/live/components/analysis-questions-tab.tsx` — Onglet "Questions analyse". `useQuery` avec `queryKeys.live.context(dealId)` pour fetch `/api/coaching/context`. Questions groupees par categorie avec headers collapsibles. Chaque question affiche texte, badge priorite (high=rouge, medium=ambre, low=bleu), tag categorie, contexte. Categories triees par nombre de questions haute priorite. Skeletons loading, error state, empty state. `React.memo` sur sous-composants `QuestionCard` et `CategorySection`.
- `src/app/(dashboard)/deals/[dealId]/live/components/session-status-bar.tsx` — Barre de status live en haut de session. Props: `sessionId`, `dealName`, `status`, `startedAt`. Indicateur rouge pulsant "LIVE" via `animate-ping`. Timer MM:SS mis a jour chaque seconde via `useEffect`+`setInterval` dans hook custom `useElapsedTimer`. Ecoute Ably `session-status` via `useChannel` pour MAJ dynamique du status. Status labels FR (Preparation, Bot en cours, En direct, Generation rapport). Responsive: deal name masque sur mobile. Import `Message` from `ably` pour typage correct.
- `src/app/(dashboard)/deals/[dealId]/live/components/session-controls.tsx` — Boutons pause/stop session. Pause = toggle local state (icones `Pause`/`Play`). Stop = `useMutation` POST `/api/live-sessions/${sessionId}/stop` + `AlertDialog` shadcn pour confirmation. Invalidation `queryKeys.live.session` et `queryKeys.live.sessions` on success. Disabled states pendant mutation. N'affiche rien si status !== 'live'.
- `src/app/(dashboard)/deals/[dealId]/live/components/post-call-report.tsx` — Rapport post-call complet. Props: `sessionId`, `summary?: PostCallReportData`. 9 sections collapsibles : resume executif, points cles (avec citations), nouvelles infos (avec impact + agents tags), contradictions (table deck vs call + severity badge), questions posees (badge "via coaching"), questions restantes, actions a suivre (owner badges BA/Fondateur/Partage), statistiques (duree, interventions, cards, couverture topics avec `Progress`), delta confiance (before/after + diff colore). Loading state avec spinner si pas de summary. `React.memo` sur chaque sous-section.
- `src/app/(dashboard)/deals/[dealId]/live/components/post-call-reanalysis.tsx` — Declencheur re-analyse post-call. 3 boutons : "Voir le delta" (mode delta), "Relancer analyse ciblee" (mode targeted), "Relancer analyse complete" (mode full). Chaque bouton = `useMutation` POST `/api/coaching/reanalyze`. Affichage inline des resultats : `DeltaReportDisplay` (newFacts, contradictions, resolvedQuestions, impactedAgents tags, confidence change), `AgentStatusDisplay` (badges agents + status). Calcul `impactedAgentCount` depuis `summary.newInformation`. Loading/error states par mutation. Disabled states pendant mutation.

**Patterns suivis :** `"use client"`, `React.memo` + `useCallback` + `useMemo`, `useQuery`/`useMutation` de TanStack Query, `queryKeys` factory, shadcn `Card`/`Badge`/`Table`/`AlertDialog`/`Progress`/`Skeleton`, `cn()` utility, `Message` from `ably` pour typage Ably, types depuis `@/lib/live/types`.

**Verification :** `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Live Coaching UI — coaching-feed + coaching-card (composants temps reel)

**Fichiers crees :**
- `src/app/(dashboard)/deals/[dealId]/live/components/coaching-card.tsx` — Composant client individuel pour carte de coaching. `React.memo`. Props: `card: AblyCoachingCardEvent`, `isAddressed?: boolean`. 4 types de cartes avec bordure gauche coloree (question=orange, contradiction=red, new_info=green, negotiation=violet). Icones lucide-react par type (HelpCircle, AlertTriangle, Lightbulb, Scale). Labels FR (Question, Contradiction, Nouveau, Nego). Indicateur de priorite : dot colore large (high), petit (medium), absent (low). Layout compact: header (icone+label+dot+timestamp), contenu (1-2 lignes), question suggeree en italique, reference en petit. Etat "aborde" : bg-muted/50, opacity-60, icone Check verte, label "Aborde". Timestamp relatif FR ("a l'instant", "il y a 2min"). Animation entree slide-in-from-top via tw-animate-css. Dark mode via CSS variables.
- `src/app/(dashboard)/deals/[dealId]/live/components/coaching-feed.tsx` — Composant client principal du feed de coaching temps reel. `React.memo`. Props: `sessionId`, `initialCards?`. 2 onglets legers (boutons simples, pas shadcn Tabs) : "Coaching" (feed live) et "Questions analyse" (placeholder). Abonnement temps reel Ably via `useChannel` (events: `coaching-card`, `card-addressed`). Gestion etat via `useReducer` (CardState: active/addressed, actions: ADD_CARD/ADDRESS_CARD/INIT). Auto-scroll vers le haut sur nouvelle carte sauf si l'utilisateur a scroll (detection via useRef + onScroll). Layout : cartes actives en haut (newest first), separateur "Abordes", cartes traitees en dessous (grayed out). Empty state avec animation pulse. Reconnect handling : dispatch INIT si initialCards change. Bouton pop-out via `window.open()` (400x700). Deduplication des cartes (idempotent sur reconnect). Import `Message` depuis `ably` pour typage correct des callbacks.

**Verification :** `npx tsc --noEmit` = 0 erreurs (dans les nouveaux fichiers)

---
## 2026-02-24 — feat: Live Coaching — 3 composants client (launcher, participant-mapper, ably-provider)

**Fichiers crees :**
- `src/app/(dashboard)/deals/[dealId]/live/components/live-session-launcher.tsx` — Composant client formulaire de lancement de session Live Coaching. Input URL de reunion avec auto-detection de plateforme (Zoom/Meet/Teams via regex, affichage Badge colore). Select langue (fr-en/fr/en, defaut fr-en). Badge status analyse (vert "Analyse complete" / jaune "Sans analyse" selon prop `hasAnalysis`). Submit via `useMutation` enchaine : POST `/api/live-sessions` (creation) puis POST `/api/live-sessions/${id}/start` (demarrage). Invalidation `queryKeys.live.sessions(dealId)` on success. Affichage erreur mutation sous le formulaire. Bouton desactive pendant le loading. shadcn: Card, Input, Select, Badge, Button.
- `src/app/(dashboard)/deals/[dealId]/live/components/participant-mapper.tsx` — Composant client mapping des roles participants. Affiche liste des participants detectes par Recall.ai avec nom + Badge role colore + dropdown Select role (ba/founder/co-founder/investor/lawyer/advisor/other). Auto-detection BA par fuzzy matching nom (normalize accents, check last-name). Auto-save debounce 500ms via `useRef` timeout + `useMutation` PUT `/api/live-sessions/${sessionId}/participants`. Indicateur sauvegarde reussie/erreur. Empty state si aucun participant.
- `src/app/(dashboard)/deals/[dealId]/live/components/ably-provider.tsx` — Wrapper client Ably realtime pour coaching en direct. Cree `Ably.Realtime` avec `authCallback` vers `/api/coaching/ably-token?sessionId=xxx`. Wrap children dans `<AblyProvider><ChannelProvider channelName="live-session:${sessionId}">`. Indicateur status connexion (vert connecte, jaune en cours, rouge deconnecte) via `connection.on()` state listener. Loading state avec animation pendant la connexion initiale. Cleanup client on unmount via `client.close()`.

**Patterns suivis :** `"use client"`, `useCallback` pour event handlers, `useMemo` pour calculs derives, `useMutation` de `@tanstack/react-query`, imports shadcn depuis `@/components/ui/...`, query keys depuis `@/lib/query-keys`, types depuis `@/lib/live/types`.

**Verification :** `npx tsc --noEmit` = 0 erreurs sur les 3 nouveaux fichiers

---
## 2026-02-24 — feat: Live Coaching UI — page shell + onglet Live dans deal page

**Fichiers crees :**
- `src/app/(dashboard)/deals/[dealId]/live/page.tsx` — Page server component Live Coaching. `requireAuth()` + verification ownership deal via `prisma.deal.findFirst`. Fetch session active (`status in created/bot_joining/live/processing`) avec `coachingCards` + `summary` inclus, et historique des 10 dernieres sessions terminees/echouees. Rendu conditionnel selon le status de session : placeholder launcher (pas de session), attente bot (created/bot_joining), coaching feed (live), generation rapport (processing). Support mode pop-out (`?popout=true`) avec layout minimal sans sidebar. Data attributes sur le conteneur session pour integration future des composants client. `Promise.all()` pour fetch active session + historique en parallele.
- `src/components/deals/live-tab-content.tsx` — Composant client placeholder pour l'onglet Live dans la page deal. Affiche icone Radio + titre + description. Props: `dealId`, `dealName`.

**Fichiers modifies :**
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Ajout onglet "Live" (5eme tab). Import `Radio` depuis lucide-react, `nextDynamic` depuis `next/dynamic` (renomme pour eviter conflit avec `export const dynamic`). `LiveTabContent` charge en `ssr: false` (composant client-only pour futur Ably realtime). TabsTrigger avec icone Radio + TabsContent delegant au composant dynamique.

**Verification :** `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Live Coaching Webhook Routes (2 endpoints critiques)

**Fichiers crees :**
- `src/app/api/live-sessions/[id]/webhook/route.ts` — Route POST recevant les chunks de transcription temps reel de Recall.ai. `maxDuration = 30`. Verification signature HMAC via `verifyWebhookSignature(rawBody, signature, secret)` (header `x-recall-signature`). Parse `data.transcript` avec `speaker`, `words[]`, `is_final`. Ignore les chunks partiels (`is_final: false`). Concatene les mots en texte complet. Lookup session par id (status `live` ou `bot_joining`). Determine le `speakerRole` via `mapSpeakerToRole()` (fuzzy matching participants). Store `TranscriptChunk` en DB immediatement. Retourne 200 instantanement a Recall.ai. Fire-and-forget async : (1) `classifyUtterance()` + update chunk classification en DB, (2) si speaker BA/investor : `checkAutoDismiss()` + `markCardsAsAddressed()` pour les cartes actives, (3) si `shouldTriggerCoaching()` : fetch en `Promise.all()` (transcriptBuffer, previousCards, addressedCards), compile dealContext (full ou cold mode), build `CoachingInput`, `generateCoachingSuggestion()`, si `shouldRespond` : create `CoachingCard` en DB + `publishCoachingCard()` via Ably. Tous les erreurs async catchees et loguees, jamais thrown.
- `src/app/api/webhooks/recall/route.ts` — Route POST recevant les evenements de status bot de Recall.ai. `maxDuration = 10`. Verification signature identique. Parse `event` + `data.bot_id` + `data.status.code`. Lookup session par `botId`. Mapping status codes : `in_call_recording`/`in_call_not_recording` -> `live` (set `startedAt`), `call_ended`/`done` -> `processing` (set `endedAt`, fire-and-forget `generatePostCallReport()`), `fatal` -> `failed` (store error message). Update session DB + publish Ably `session-status` event. Fire-and-forget pour post-call report via dynamic import pattern (identique a stop route).

**Patterns suivis :** `RouteContext` with `Promise<{ id: string }>`, `verifyWebhookSignature()`, `handleApiError()`, `isValidCuid()`, `void (async () => { ... })()` fire-and-forget, `Promise.all()` pour requetes paralleles, dynamic import pour `post-call-generator`.

**Verification :** `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Coaching support API routes (3 endpoints)

**Fichiers crees :**
- `src/app/api/coaching/context/route.ts` — GET `/api/coaching/context?dealId=xxx`. Compile le DealContext pour le coaching LLM. Auth via `requireAuth()`, validation `isValidCuid()`, verification ownership deal, appel `compileDealContext(dealId)`.
- `src/app/api/coaching/ably-token/route.ts` — GET `/api/coaching/ably-token?sessionId=xxx`. Genere un token Ably scope au channel de la session (subscribe+presence, 60min TTL). Auth, validation sessionId, verification ownership session (403 si non trouve/non proprietaire), appel `generateAblyToken(sessionId, userId)`.
- `src/app/api/coaching/reanalyze/route.ts` — POST `/api/coaching/reanalyze`. Declenche la re-analyse post-call. Zod schema `{ sessionId, mode: 'delta' | 'targeted' | 'full' }`. Verification session completed/processing + dealId present. Mode delta : `generateDeltaReport()` (comparaison legere). Mode targeted : reconstruit PostCallReport depuis SessionSummary, `identifyImpactedAgents()` + `triggerTargetedReanalysis()`. Mode full : `triggerTargetedReanalysis()` avec les 18 agents (13 Tier 1 + 5 Tier 3).

**Patterns suivis :** `requireAuth()`, `isValidCuid()`, `handleApiError()`, `NextRequest`/`NextResponse`, try/catch wrapping, `z.object()` pour POST body.

**Verification :** `npx tsc --noEmit` = 0 erreurs (dans les nouveaux fichiers)

---
## 2026-02-24 — feat: Live Coaching Phase 3 — Post-Call Report Generator + Reanalyzer

**Fichiers crees :**
- `src/lib/live/post-call-generator.ts` — Generation de rapport post-call structure. `generatePostCallReport(sessionId)` : fetch en `Promise.all()` (session+deal, transcriptChunks, coachingCards), compile le dealContext si dealId existe, construit la transcription complete, appel `completeJSON<PostCallReport>()` via Sonnet (maxTokens 4000), system prompt avec regle n1 appliquee (ton analytique, jamais prescriptif), ecrase sessionStats avec donnees reelles (anti-hallucination LLM). `generateMarkdownReport(report, sessionMeta)` : conversion en Markdown structure (header metadata, resume, points cles avec citations, informations nouvelles, contradictions en table, questions posees/restantes, actions a suivre avec owner labels FR, evolution confiance, stats). `saveReport(sessionId, report, markdown)` : transaction Prisma creant SessionSummary + Document (type CALL_TRANSCRIPT) + lien LiveSession.documentId.
- `src/lib/live/post-call-reanalyzer.ts` — Identification des agents impactes et re-analyse ciblee. `identifyImpactedAgents(report)` : mapping category-to-agent via keywords (financial/competitive/team/market/tech/legal/gtm/customer/exit/cap_table), detection depuis newInformation.agentsAffected + texte libre (fact+impact), detection depuis contradictions, toujours inclut contradiction-detector si contradictions, toujours inclut synthesis-deal-scorer + memo-generator (Tier 3). `triggerTargetedReanalysis(dealId, agentNames, sessionId)` : cree un record Analysis (type FULL_DD, mode post_call_reanalysis, status PENDING) avec metadata agents cibles — integration orchestrateur en Phase 5. `generateDeltaReport(sessionId, dealId)` : comparaison legere pre-call vs post-call via `completeJSON<DeltaReport>()` Sonnet (maxTokens 2000), system prompt regle n1, retourne newFacts/contradictions/resolvedQuestions/impactedAgents/confidenceChange.

**Verification :** `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Live Coaching API routes (5 endpoints)

**Fichiers crees :**
- `src/app/api/live-sessions/route.ts` — POST (create session) + GET (list sessions). Zod validation, platform detection via `detectPlatform()`, rate limit (max 1 active session, max 3/day), deal ownership check, query filters (dealId, status, includeSummary).
- `src/app/api/live-sessions/[id]/route.ts` — GET (session detail with optional transcript, coaching cards, summary) + PATCH (update language, llmModel, participants). Ownership verification via `findFirst` + userId.
- `src/app/api/live-sessions/[id]/start/route.ts` — POST: deploy Recall.ai bot via `createBot()`, update status to `bot_joining`, publish Ably session-status event. `maxDuration = 30`.
- `src/app/api/live-sessions/[id]/stop/route.ts` — POST: call `leaveMeeting()`, update status to `processing`, publish Ably event, fire-and-forget `generatePostCallReport()`. `maxDuration = 300`.
- `src/app/api/live-sessions/[id]/participants/route.ts` — PUT: update participants JSON field with Zod-validated `SpeakerRole` enum array.

**Patterns suivis :** `requireAuth()`, `isValidCuid()`, `handleApiError()`, `checkRateLimit()`, `RouteContext` with `Promise<{ id: string }>`, `NextRequest`/`NextResponse`, try/catch wrapping.

---
## 2026-02-24 — feat: Live Coaching Phase 2.3 — Coaching Engine + Auto-Dismiss

**Fichiers créés :**
- `src/lib/live/coaching-engine.ts` — Moteur de coaching temps réel. `COACHING_SYSTEM_PROMPT` : system prompt complet en français, positionné analytiquement (jamais prescriptif, règle n°1 CLAUDE.md appliquée), couvre les 4 types de cartes (question/contradiction/new_info/negotiation), 3 niveaux de priorité, format JSON strict, 8 règles de qualité (max 1 carte/utterance, contenu 1-2 phrases, pas de répétition). `buildCoachingPrompt(input)` : assemble le prompt utilisateur depuis dealContext sérialisé + 5 dernières utterances + utterance courante classifiée + 10 dernières cartes + sujets abordés. `generateCoachingSuggestion(input)` : appel Sonnet via `completeJSON<CoachingResponse>()`, temperature 0.4, maxTokens 500, hard timeout 5s via AbortController (retourne `shouldRespond: false` si timeout), validation type/priority/content, `runWithLLMContext({ agentName: 'coaching-engine' })` pour cost tracking. `getTranscriptBuffer(sessionId, limit)` : récupère les N derniers chunks significatifs depuis DB (exclut small_talk/filler), ordre chronologique.
- `src/lib/live/auto-dismiss.ts` — Détection automatique quand le BA aborde un sujet de carte coaching. `checkAutoDismiss(baUtterance, activeCards)` : comparaison sémantique via Haiku LLM (pas keyword matching), temperature 0.2, retourne les IDs des cartes adressées, validation que les IDs retournés existent dans les cartes actives, fail-safe (jamais de dismiss sur erreur). `markCardsAsAddressed(sessionId, cardIds)` : batch update DB (status='addressed', addressedAt, addressedBy='auto') + publish Ably `card-addressed` events en `Promise.all()`.

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---

## 2026-02-24 — feat: Live Coaching Phase 2 — Context Compiler + Speaker Detector

**Fichiers créés :**
- `src/lib/live/context-compiler.ts` — Compile le DealContext depuis la DB pour injection LLM. `compileDealContext(dealId)` fetch en `Promise.all()` : deal (avec redFlags, documents, founders, factEvents), dernière analyse complétée, sessions live précédentes. Extrait les résultats agents (financial-auditor, team-investigator, market-intelligence, tech-stack-dd, question-master, contradiction-detector) depuis `Analysis.results` JSON. Calcule le profil de signal selon la grille CLAUDE.md. Gère gracieusement les données manquantes. `compileContextForColdMode()` retourne un contexte minimal générique. `serializeContext()` produit du texte lisible (pas de JSON dump) structuré en sections markdown.
- `src/lib/live/speaker-detector.ts` — Détection et mapping des participants. `detectBAFromParticipants()` : fuzzy match case-insensitive avec normalisation diacritiques, tokenization, exact match puis score-based avec threshold 50%. `mapSpeakerToRole()` : trouve le participant par nom et retourne son rôle. `suggestRoles()` : auto-détecte les fondateurs depuis dealContext (match noms founders vs participants), retourne des suggestions avec speakerId vide.

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---


## 2026-02-24 — feat: Live Coaching Phase 2.2 — Utterance Router

**Fichier créé :**
- `src/lib/live/utterance-router.ts` — Classifieur hybride regex+LLM pour les chunks de transcription. Fast-path O(1) pour fillers (< 5 mots, regex FR/EN), small talk (salutations, météo, logistique), et mots-clés domaine (financier, concurrentiel, négociation). Fallback LLM via Haiku pour utterances ambiguës avec `runWithLLMContext()` pour cost tracking. Fonction `shouldTriggerCoaching()` : ne trigger pas pour fillers/small_talk/BA utterances, trigger pour founder/co-founder substantif.

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---


## 2026-02-24 — feat: Live Coaching Phase 1 — infrastructure clients (Recall.ai, Ably, Deepgram)

**Fichiers créés :**
- `src/lib/live/recall-client.ts` — Client API Recall.ai : fetch authentifié, CRUD bot (create/status/leave/delete), récupération transcription complète, vérification HMAC-SHA256 des webhooks, détection plateforme meeting (Zoom/Meet/Teams)
- `src/lib/live/ably-server.ts` — Publisher Ably server-side : singleton REST client, channel naming par session, publishers pour coaching cards/card addressed/session status/participant joined-left, génération de tokens scopés (subscribe+presence, 60min TTL)
- `src/lib/live/deepgram-client.ts` — Stub client Deepgram STT : interfaces DeepgramConnection et DeepgramTranscriptEvent, factory createLiveTranscription (throws not implemented — Recall.ai transcription utilisée), TODO pour future implémentation WebSocket streaming

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---

## 2026-02-24 — spec: Live Coaching — spécification complète

**Fichier créé :** `LIVE-COACHING-SPEC.md`

Spécification exhaustive de la feature Live Coaching : coaching IA temps réel pendant les calls BA/fondateurs. Couvre :
- Architecture server-side (Recall.ai bot + Ably realtime + Claude Sonnet 4.5/4.6)
- Pipeline 3 phases : pré-call (Deal Context Engine), live (Utterance Router + Coaching Engine), post-call (rapport + re-analyse)
- UI/UX minimaliste (flux de cartes coaching, zéro interaction manuelle, auto-détection des sujets abordés)
- Schéma DB (4 nouvelles tables : LiveSession, TranscriptChunk, CoachingCard, SessionSummary)
- Structure fichiers, routes API, intégration avec l'existant
- Coûts détaillés (~$2.40/h par session), sécurité, gestion d'erreurs, testing, limites
- 5 phases d'implémentation

---

---

## 2026-02-22 — refactor: enforcement complet du positionnement "analyse, pas décision" (UI + prompts Tier 3)

**Contexte :** Les agents Tier 3 généraient encore du texte prescriptif ("Ne pas investir", "Rejeter", "perte de temps") malgré le relabeling UI. Le MemoGeneratorCard affichait des préfixes bruts ([CRITICAL], [IMMEDIATE] [INVESTOR]) et des headers sans accents.

### UI — MemoGeneratorCard (tier3-results.tsx)
- **Accents** : "Probleme" → "Problème", "These" → "Thèse", "negociation" → "négociation", "completer" → "compléter", "etapes" → "étapes"
- **Red Flags stylés** : Parsing `[CRITICAL] texte (agent)` → Badge sévérité coloré + texte + source agent. Remplace les listes à puces brutes.
- **Next Steps stylés** : Parsing `[IMMEDIATE] [INVESTOR] texte` → Badge priorité (rouge/ambre/bleu) + badge owner + texte. Remplace le texte brut.
- **DD items** : Remplacement `list-disc list-inside` par cards individuelles full-width (plus de troncature)
- **Layout** : Grid 2-cols DD/RedFlags → stack vertical pour lisibilité

### Prompts agents Tier 3 — section TONALITÉ ajoutée aux 3 agents

**synthesis-deal-scorer.ts :**
- "PRODUIRE LA DÉCISION FINALE" → "PRODUIRE L'ANALYSE FINALE"
- "GO/NO-GO clair" → "PROFIL DE SIGNAL clair"
- Section TONALITÉ complète : interdits (Investir/Rejeter/GO/NO-GO/Dealbreaker), obligatoires (constater/rapporter/guider), exemples
- Règles spécifiques nextSteps (investigation, pas rejet) et forNegotiation (constats, pas ordres)

**memo-generator.ts :**
- Grille recommandation → profils de signal
- "Recommandation claire et assumée" → "Profil de signal clair, le BA décide"
- Section TONALITÉ complète avec règles par champ (investmentThesis, nextSteps, negotiationPoints, oneLiner)
- Ajout exemple "MAUVAIS OUTPUT PRESCRIPTIF"

**devils-advocate.ts :**
- Mission : "tu PROTEGES en INFORMANT — tu ne décides JAMAIS"
- Section TONALITÉ : interdits + obligatoires + ton "analyste rigoureux, pas prophète de malheur"
- Règle 8 : JAMAIS de langage prescriptif
- forNegotiation : constats factuels, pas d'ordres

### CLAUDE.md
- Ajout section "POSITIONNEMENT PRODUIT — RÈGLE N°1" : principe fondamental, tableau interdits/remplacements, grille profils de signal, labels de score, exemples avant/après, règle d'or, état implémentation

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---

---

## 2026-02-22 — fix: devils-advocate prompt — langage analytique non-prescriptif

**Fichiers modifiés :**
- `src/agents/tier3/devils-advocate.ts` — Mise à jour du system prompt (`buildSystemPrompt()`) uniquement, aucune modification de types/interfaces/logique :
  - **Mission** : reformulée de "PROTEGER L'INVESTISSEUR en challengeant" → "Tu PROTEGES l'investisseur en l'INFORMANT des risques — tu ne decides JAMAIS a sa place"
  - **Nouvelle section TONALITE** : ajoutée après la mission — liste explicite des termes interdits ("Ne pas investir", "Fuir", "Ce deal est une arnaque", tout impératif), obligations (constater, questionner, condition sur chaque killReason, ton analyste rigoureux)
  - **Règle 8** : ajoutée dans REGLES ABSOLUES — "JAMAIS de langage prescriptif" avec exemples interdit/correct
  - **narrative.forNegotiation** : note ajoutée dans FORMAT DE SORTIE — "constats, pas d'ordres" avec exemple

**Raison :** Angel Desk analyse et guide, ne décide jamais. Le Devil's Advocate est naturellement analytique mais certaines sections du prompt pouvaient encore produire du langage prescriptif.

---

---

## 2026-02-22 — refactor: synthesis-deal-scorer — langage analytique non-prescriptif

**Fichier modifie :**
- `src/agents/tier3/synthesis-deal-scorer.ts`

**Changements dans le system prompt (`buildSystemPrompt`) :**
1. **Role description** — "PRODUIRE LA DECISION FINALE D'INVESTISSEMENT" remplace par "PRODUIRE L'ANALYSE FINALE DU DEAL"
2. **Verdict grid** — Descriptions reformulees en termes analytiques (signaux favorables, signaux contrastes, etc.)
3. **Regle ABSOLUE n5** — "GO/NO-GO clair" remplace par "PROFIL DE SIGNAL clair / SOIS INFORMATIF"
4. **Nouvelle section TONALITE** — Regle absolue anti-prescriptive ajoutee avant REGLES ABSOLUES : termes interdits (Investir/Rejeter/GO/NO-GO/Dealbreaker), formulations obligatoires (constats, signaux, questions), exemples BON/MAUVAIS
5. **Nouvelle section NEXT STEPS** — Regles de formulation : jamais "Rejeter"/"Classer le dossier", toujours "Verifier X"/"Clarifier Z"
6. **Nouvelle section FORNEGOTIATION** — Jamais "Refuser" comme action, points factuels uniquement
7. **Mission step 3/4** — "deal-breakers" remplace par "signaux d'alerte majeurs", "GO/NO-GO" par "profil de signal"

**Changements dans le user prompt (`execute`) :**
- RAPPELS CRITIQUES : "SOIS ACTIONNABLE — GO/NO-GO clair" remplace par "SOIS INFORMATIF — Profil de signal clair, le BA decide"

**Raison :** Angel Desk analyse et guide, il ne decide jamais a la place du Business Angel. Le scorer produisait du langage prescriptif ("Investir", "Ne pas investir", "GO/NO-GO"). Toutes les instructions prompt sont maintenant alignees avec le positionnement produit.

---

---

## 2026-02-22 — fix: memo-generator prompt — langage analytique non-prescriptif

**Fichiers modifiés :**
- `src/agents/tier3/memo-generator.ts` — Mise à jour du system prompt (`buildSystemPrompt`) et du prompt d'exécution (`execute`) pour imposer un ton analytique, jamais prescriptif :
  - Grille de recommandation : descriptions changées en profils de signal factuels (ex: "Vigilance requise, risques significatifs identifiés" au lieu de label GO/NO-GO)
  - Ajout section "TONALITE — REGLE ABSOLUE" avant REGLES ABSOLUES : liste exhaustive des formulations interdites (impératifs, jugements, ordres de ne pas investir) et obligatoires (constats factuels, actions d'investigation)
  - Règle 7 : "La recommandation doit être claire et assumée" remplacée par "Le profil de signal doit être clair (le BA décide, l'outil rapporte)"
  - Ajout exemple "MAUVAIS OUTPUT PRESCRIPTIF" (oneLiner/verdict prescriptifs) avec explication
  - Prompt execute : "La recommandation DOIT être claire et assumée" remplacée par "Le profil de signal DOIT être clair (l'outil rapporte, le BA décide)"

**Raison :** Angel Desk analyse et guide, il ne décide jamais à la place du Business Angel. Le memo-generator était le dernier agent Tier 3 à encore pouvoir générer du langage prescriptif ("Ne pas investir", "Deal à fuir", "Refuser la structure").

---

---

## 2026-02-22 — fix: MemoGeneratorCard — accents, red flags badges, next steps badges, layout DD

**Fichiers modifiés :**
- `src/components/deals/tier3-results.tsx` — MemoGeneratorCard uniquement :
  - **Accents manquants** : "Probleme" → "Problème", "These d'investissement" → "Thèse d'investissement", "Points de negociation" → "Points de négociation", "DD a completer" → "DD à compléter", "Prochaines etapes" → "Prochaines étapes"
  - **Red Flags parsés** : parsing du format `[SEVERITY] texte (agent-source)` → affichage avec severity badges colorés via `getSeverityStyle()` + source agent en sous-texte
  - **Next Steps parsés** : parsing du format `[PRIORITY] [OWNER] texte` → badges priority (IMMEDIATE=rouge, BEFORE_TERM_SHEET=ambre, DURING_DD=bleu) + badges owner (INVESTOR=slate, FOUNDER=violet)
  - **DD outstanding** : remplacement du `list-disc list-inside` tronqué par des cards individuelles avec padding correct
  - **Layout DD/Red Flags** : passage de `grid md:grid-cols-2` cramé à `space-y-4` vertical pour meilleure lisibilité
  - Import `getSeverityStyle` ajouté depuis `@/lib/ui-configs`
  - Helpers `parseRedFlag()`, `parseNextStep()` + configs `PRIORITY_BADGE_CONFIG`, `OWNER_BADGE_CONFIG` hoistés hors du composant
  - `useMemo` pour parsed arrays (pattern cohérent avec le reste du fichier)

---

---

## 2026-02-22 — doc: CLAUDE.md — ajout section positionnement produit (règle n°1)

**Fichiers modifiés :**
- `CLAUDE.md` — Ajout section "POSITIONNEMENT PRODUIT — RÈGLE N°1" entre les principes de développement et la stack technique. Contient : principe fondamental ("Angel Desk analyse et guide, ne décide jamais"), tableau des termes interdits avec remplacements, grille des profils de signal, labels de score, exemples de reformulation, règle d'or, liste des endroits d'application (prompts, UI, PDF, chat, landing), état de l'implémentation (fait vs reste à faire).

**Raison :** Chaque nouvelle conversation Claude Code démarrait sans contexte sur cette orientation critique. Le CLAUDE.md est lu automatiquement — cette section garantit que le positionnement "conseil, pas décision" est respecté dès le départ.

---

---

## 2026-02-22 — fix: CRITICAL — derniers vestiges de langage prescriptif + 100+ accents manquants

**Contexte :** Deuxième passe d'audit (2 agents audit parallèles) → 4 agents fix parallèles. Zéro CRITICAL restant, zéro prescriptif visible par l'utilisateur.

**Dernières corrections composants (13 edits) :**
- `deck-coherence-report.tsx` — "Equipe" → "Équipe", "Marche" → "Marché", "Metriques" → "Métriques", "Incoherence" → "Incohérence"
- `deal-comparison.tsx` — "Equipe" → "Équipe", "Marche" → "Marché"
- `score-display.tsx` — "Equipe" → "Équipe"
- `founder-responses.tsx` — "Equipe" → "Équipe", "Marche" → "Marché", "Legal" → "Légal"
- `conditions-analysis-cards.tsx` — "Eleve" → "Élevé", "Modere" → "Modéré"
- `percentile-comparator.tsx` — "Marche" → "Marché", "Eleve" → "Élevé", "Tres eleve" → "Très élevé"
- `suivi-dd-filters.tsx` — "Eleve" → "Élevé"
- `unified-alert.ts` — "Eleve" → "Élevé"
- `team-management.tsx` — "detecte(s)" → "détecté(s)", "succes" → "succès", "equipe" → "équipe", "detecter" → "détecter"

**CRITICAL fixes (5) :**
- `src/components/deals/partial-analysis-banner.tsx` — "dealbreakers" → "risques critiques" (teaser FREE users)
- `src/components/chat/deal-chat-panel.tsx` — "Red flags & dealbreakers" → "Red flags & risques critiques" (chat prompt)
- `src/components/deals/next-steps-guide.tsx` — "dealbreakers" → "risques critiques" + 8 accents manquants
- `src/app/(dashboard)/pricing/page.tsx` — "GO / NO-GO / NEED MORE INFO" → "votent et rendent un avis argumenté"
- `src/lib/pdf/pdf-sections/cover.tsx` — Raw verdict `verdict.replace(/_/g, " ")` → `recLabel(verdict)` + 4 accents

**HIGH fixes (100+ accents) — PDF files :**
- `negotiation.tsx` — 13 corrections (Stratégie, Négociation, Priorité, Amélioration, Résolution, Bénéfice, Résumé...)
- `tier3-synthesis.tsx` — 26 corrections (Sévérité, Probabilité, Scénario, Déclencheur, Délai, Préoccupations, Plausibilité...)
- `questions.tsx` — 16 corrections (Priorité, Catégorie, Déclencheur, réponse, évaluation, Criticité, Éléments...)
- `tier1-agents.tsx` — ~55 corrections (Sévérité x4, Catégorie x3, Crédibilité, Cohérence, Qualité, Complétude...)
- `tier2-expert.tsx` — ~45 corrections (Métriques clés, Préoccupation, IA véritable, Crédibilité technique, Dépendance API...)
- `early-warnings.tsx` — 2 corrections (Catégorie, détectée)
- `generate-analysis-pdf.tsx` — 2 corrections (Résumé dans métadonnées PDF)

**HIGH fixes (accents) — Composants :**
- `severity-badge.tsx` — 8 corrections (sérieux, réduire, Négocier, adressé, combiné, à d'autres, immédiate, sévérité)
- `severity-legend.tsx` — 2 corrections (sérieux, sévérité)

**Vérification :** `npx tsc --noEmit` = 0 erreurs. Grep global : 0 "dealbreaker" user-facing, 0 "GO/NO-GO" hors Board, 0 "INVESTIR"/"PASSER".

---

---

## 2026-02-22 — fix: accents manquants dans 3 fichiers PDF (questions, tier1-agents, tier2-expert)

**Fichiers modifies :**

- `src/lib/pdf/pdf-sections/questions.tsx` — "Priorite" -> "Priorite", "Categorie" -> "Categorie", "Declencheur" -> "Declencheur", "Bonne reponse" -> "Bonne reponse", "Mauvaise reponse" -> "Mauvaise reponse", "Guide d'evaluation" -> "Guide d'evaluation", "Personne ideale" -> "Personne ideale", "completes" -> "completes", "Elements bloques" -> "Elements bloques", "Criticite" -> "Criticite", "Reponses du Fondateur" -> "Reponses du Fondateur", "reponse(s) enregistree(s)" -> "reponse(s) enregistree(s)", "Verifications de references" -> "Verifications de references", "Total elements" -> "Total elements", "Element" -> "Element", "Detail" -> "Detail"
- `src/lib/pdf/pdf-sections/tier1-agents.tsx` — Correction de ~50 accents manquants dans labels/headers : "Severite" -> "Severite" (x4), "Categorie" -> "Categorie" (x3), "Critere", "Metrique", "Donnees", "Realistes", "Efficacite", "Coherence", "Credibilite", "Completude", "Retention", "Liquidite", "Fenetre", "Scenarios", "Resume", "Repartition", "Detention", "Reglementations", etc.
- `src/lib/pdf/pdf-sections/tier2-expert.tsx` — Correction de ~45 accents manquants : "Severite", "Categorie", "Priorite", "Preoccupation", "Metriques cles", "Metrique" (x3), "Median", "Detail", "Maturite", "Complexite", "Opportunites", "Modele", "Efficacite", "Completude", "Decentralisation", "Securite", "Sensibilite", "Resilience", etc.

---

---

## 2026-02-22 — fix: accents manquants dans 6 fichiers UI/PDF

**Fichiers modifiés :**

- `src/components/shared/severity-badge.tsx` — "serieux" → "sérieux", "reduire" → "réduire", "Negocier" → "Négocier", "adresse" → "adressé", "combine" → "combiné", "a d'autres" → "à d'autres", "A noter" → "À noter", "a prioriser" → "à prioriser", "immediate" → "immédiate", "severite" → "sévérité", "Evaluer" → "Évaluer"
- `src/components/shared/severity-legend.tsx` — "serieux" → "sérieux", "severite" → "sévérité"
- `src/components/deals/next-steps-guide.tsx` — "generees" → "générées", "Reponses" → "Réponses", "reponses" → "réponses", "complementaires" → "complémentaires", "specifiques" → "spécifiques", "connait" → "connaît", "resultats" → "résultats", "complete" → "complète", "scenarios" → "scénarios", "detecteur" → "détecteur", "memo" → "mémo", "Preparer" → "Préparer", "negociation" → "négociation", "identifie" → "identifié", "etapes" → "étapes", "recommandees" → "recommandées"
- `src/lib/pdf/pdf-sections/early-warnings.tsx` — "detectee(s)" → "détectée(s)", "Categorie" → "Catégorie"
- `src/lib/pdf/pdf-sections/cover.tsx` — "Analyse complete:" → "Analyse complète :", "Genere le" → "Généré le", "EQUIPE" → "ÉQUIPE", "DEMANDE" → "DEMANDÉ"
- `src/lib/pdf/generate-analysis-pdf.tsx` — "DD Resume" → "DD Résumé", "Resume Due Diligence" → "Résumé Due Diligence"

---

---

## 2026-02-22 — fix: accents manquants dans pdf-sections/tier3-synthesis.tsx

**Fichiers modifiés :**

- `src/lib/pdf/pdf-sections/tier3-synthesis.tsx` — Correction de tous les accents manquants dans les labels/headers PDF français : "Synthese" → "Synthèse", "Contradictions detectees" → "Contradictions détectées", "Severite" → "Sévérité", "Resolution probable" → "Résolution probable", "Lacunes de donnees identifiees" → "Lacunes de données identifiées", "Impact si ignore" → "Impact si ignoré", "Scenario catastrophe" → "Scénario catastrophe", "Probabilite" → "Probabilité", "Perte estimee" → "Perte estimée", "Declencheur" → "Déclencheur", "Delai" → "Délai", "Angles morts identifies" → "Angles morts identifiés", "Objections detaillees" → "Objections détaillées", "Echec comparable" → "Échec comparable", "Interpretation alternative" → "Interprétation alternative", "Plausibilite" → "Plausibilité", "Synthese des preoccupations" → "Synthèse des préoccupations", "Preoccupations serieuses" → "Préoccupations sérieuses", "Preoccupations mineures" → "Préoccupations mineures", "Scenarios d'investissement" → "Scénarios d'investissement", "Resultat probabiliste" → "Résultat probabiliste", "risque-ajustee" → "risque-ajustée", "Scenario" (table header) → "Scénario", "Scenario le + probable" → "Scénario le + probable", "sensibilite" → "sensibilité", "Evaluation burn" → "Évaluation burn"

---

---

## 2026-02-22 — fix: accents manquants dans pdf-sections/negotiation.tsx

**Fichiers modifiés :**

- `src/lib/pdf/pdf-sections/negotiation.tsx` — Correction de tous les accents manquants dans les labels/headers PDF français : "Strategie de Negociation" → "Stratégie de Négociation", "Arguments cles" → "Arguments clés" (x2), "Apres" → "Après", "Amelioration" → "Amélioration", "Points de negociation" → "Points de négociation" (x2), "Priorite" → "Priorité" (x2), "Resolution" → "Résolution", "Resolvable" → "Résolvable", "Benefice net" → "Bénéfice net", "Negociation — Resume" → "Négociation — Résumé"

---

---

## 2026-02-22 — fix: accents et langage — corrections HIGH+MEDIUM à travers la codebase

**Fichiers modifiés :**

- `src/lib/ui-configs.ts` — "Eleve" → "Élevé" (label sévérité HIGH)
- `src/components/deals/early-warnings-panel.tsx` — "Integrite Fondateurs" → "Intégrité Fondateurs", "Marche" → "Marché", "Questions a poser" → "Questions à poser", "Alertes Detectees" → "Alertes Détectées", phrase critique avec accents manquants corrigée
- `src/components/deals/suivi-dd/suivi-dd-alert-card.tsx` — "Conditionnel" → "Risque conditionnel", "Resolu" → "Résolu", "Accepte" → "Accepté", "Piste de resolution" → "Piste de résolution", "Argument de nego" → "Argument de négociation"
- `src/components/deals/tier3-results.tsx` — "Niveau de conviction" → "Niveau de scepticisme", "Investment Highlights" → "Points forts du deal", "Deals Compares" → "Deals Comparés", "Contradictions detectees" → "Contradictions détectées", "identifiee(s)" → "identifiée(s)", "incoherences" → "incohérences", "coherentes" → "cohérentes", "Analyse automatisee" → "Analyse automatisée", "Synthese Due Diligence" → "Synthèse Due Diligence", "Fiabilite donnees" → "Fiabilité données"
- `src/components/shared/severity-legend.tsx` — "Dealbreaker potentiel" → "Risque potentiellement bloquant"
- `src/components/shared/severity-badge.tsx` — CRITICAL: "Dealbreaker potentiel. Ce risque peut a lui seul justifier de passer le deal." → langage non-prescriptif avec accents
- `src/lib/pdf/pdf-sections/early-warnings.tsx` — "Alertes Precoces (Early Warnings)" → "Alertes Précoces", "Questions a poser" → "Questions à poser"
- `src/lib/pdf/pdf-sections/negotiation.tsx` — "Approche recommandee" → "Approche recommandée"
- `src/lib/pdf/pdf-sections/questions.tsx` — "Risques critiques identifies" → "Risques critiques identifiés", "Resolvabilite" → "Résolvabilité", "Red flag si mauvaise" → "Signal d'alerte si mauvaise réponse"
- `src/components/deals/tier2-results.tsx` — "Confidence:" → "Fiabilité :", "Top Strength" → "Point fort principal", "Top Concern" → "Point d'attention principal"

---

---

## 2026-02-22 — fix: CRITICAL+HIGH — prescriptive text, missing rec keys, raw internal keys in chat

**Fichiers modifies :**

- `src/lib/pdf/pdf-sections/tier3-synthesis.tsx` — "Raisons de ne PAS investir" -> "Signaux d'alerte critiques"
- `src/lib/pdf/pdf-helpers.ts` — recLabel() : ajout cases strong_invest, strong_pass, no_go, conditional_invest
- `src/lib/pdf/pdf-components.tsx` — RecommendationBadge : gestion complète de tous les keys (strong_invest, strong_pass, no_go, conditional_invest) avec bg/fg corrects
- `src/agents/orchestrator/summary.ts` — Ajout ACTION_LABELS, remplacement .toUpperCase() par labels FR, "Dealbreakers potentiels" -> "Risques critiques potentiels"
- `src/config/labels-fr.ts` — Suppression VERDICT_LABELS_FR (non utilisée, labels incorrects)
- `src/components/deals/tier2-results.tsx` — Renommage VERDICT_CONFIG -> SECTOR_FIT_CONFIG + mise a jour ref avec keyof typeof
- `src/lib/score-utils.ts` — extractDealRecommendation() : lit d'abord investmentRecommendation.action, fallback recommendation
- `src/components/deals/verdict-panel.tsx` — "Verdict" -> "Analyse globale" (h3 + empty-state)

---

---

## 2026-02-22 — fix: accessibility + performance — score-ring, verdict-panel, early-warnings, tier3, tier1, ui-configs

**Fichiers modifies :**

### Accessibility
- `src/components/ui/score-ring.tsx` — Ajout `role="img"` + `aria-label="Score: X sur 100"` sur le conteneur, `aria-hidden="true"` sur le SVG
- `src/components/deals/verdict-panel.tsx` — MiniBar : ajout prop `label`, `role="progressbar"`, `aria-valuenow/min/max`, `aria-label`. Call sites mis a jour avec `label={dim.label}`
- `src/components/deals/early-warnings-panel.tsx` — Bouton expand/collapse : ajout `aria-expanded={isExpanded}`

### Performance
- `src/components/deals/tier3-results.tsx` — Hoist `recommendationConfig` de `MemoGeneratorCard` vers module level (`MEMO_RECOMMENDATION_CONFIG`). Ajout `shrink-0` sur `RecommendationBadge` Badge className
- `src/lib/ui-configs.ts` — Ajout exports `ALERT_SIGNAL_LABELS` et `READINESS_LABELS` (source de verite unique)
- `src/components/deals/tier1-results.tsx` — Suppression constants locales `ALERT_SIGNAL_LABELS`/`READINESS_LABELS`, import depuis `@/lib/ui-configs`
- `src/lib/pdf/pdf-sections/tier1-agents.tsx` — Import `ALERT_SIGNAL_LABELS` depuis `@/lib/ui-configs`, remplacement de la chaine ternaire inline

---

---

## 2026-02-22 — refactor: repositionnement produit — de conseil à analyse (profils de signal)

**Contexte :** Réduction du risque juridique/réputationnel en éliminant le langage prescriptif (INVESTIR/PASSER/etc.) au profit de constats analytiques. Le BA reste le décideur, l'outil rapporte des signaux.

**Fichiers modifies :**

### Configs centrales
- `src/lib/ui-configs.ts` — RECOMMENDATION_CONFIG: INVESTIR→"Signaux favorables", PASSER→"Signaux d'alerte dominants", NEGOCIER→"Signaux contrastés", ATTENDRE→"Investigation complémentaire". VERDICT_CONFIG: Forte conviction→"Signaux très favorables", Ne pas investir→"Signaux d'alerte dominants". getScoreLabel: Bon→"Solide", Moyen→"À approfondir", Faible→"Points d'attention", Critique→"Zone d'alerte"
- `src/config/labels-fr.ts` — VERDICT_LABELS_FR aligné sur nouveau VERDICT_CONFIG

### Composants d'affichage
- `src/components/deals/early-warnings-panel.tsx` — "Dealbreaker probable/absolu"→"Risque majeur/critique détecté"
- `src/components/deals/tier1-results.tsx` — AlertSignal mapping (STOP→"ANOMALIE MAJEURE", INVESTIGATE_FURTHER→"INVESTIGATION REQUISE", etc.), readiness labels (DO_NOT_PROCEED→"Alertes critiques"), "Dealbreakers identifiés"→"Risques critiques identifiés"
- `src/components/deals/tier2-results.tsx` — Sector verdicts (NOT_RECOMMENDED→"Hors profil sectoriel"), valuation verdicts (excessive→"Nettement au-dessus")
- `src/components/deals/tier3-results.tsx` — "Dealbreakers"→"Risques critiques", "Pourquoi NO_GO"→"Signaux d'alerte dominants", memo recommendation labels
- `src/components/deals/suivi-dd/suivi-dd-alert-card.tsx` — "Dealbreaker"→"Risque critique"

### PDF
- `src/lib/pdf/pdf-helpers.ts` — recLabel() aligné sur profils de signal
- `src/lib/pdf/pdf-components.tsx` — RecommendationBadge aligné
- `src/lib/pdf/pdf-sections/early-warnings.tsx` — "DEALBREAKER ABSOLU/PROBABLE"→"RISQUE CRITIQUE/MAJEUR DÉTECTÉ"
- `src/lib/pdf/pdf-sections/negotiation.tsx` — "Dealbreakers"→"Risques critiques"
- `src/lib/pdf/pdf-sections/tier3-synthesis.tsx` — "Dealbreakers absolus/conditionnels"→"Risques critiques/conditionnels"
- `src/lib/pdf/pdf-sections/questions.tsx` — "Dealbreakers identifies"→"Risques critiques identifies"
- `src/lib/pdf/pdf-sections/tier1-agents.tsx` — alertSignal labels reformulés

### Prompts agents
- `src/agents/tier3/synthesis-deal-scorer.ts` — Grille verdict reformulée en profils de signal
- `src/agents/tier3/memo-generator.ts` — Grille recommandation reformulée
- `src/agents/tier3/devils-advocate.ts` — Kill reasons : ajout obligation de condition d'atténuation
- `src/agents/orchestrator/summary.ts` — "VERDICT FINAL"→"ANALYSE FINALE", "Recommandation"→"Signal"

### Landing + Pricing
- `src/app/page.tsx` — Badge: "Votre équipe d'analystes IA", CTA: "Vous décidez, vos analystes IA font le travail", "Votre prochain deal, analysé en 5 minutes"
- `src/app/(dashboard)/pricing/page.tsx` — Header: "Votre équipe d'analystes, toujours disponible", "GO/NO-GO en 2 min"→"Briefing express en 2 min", Tiers 2/3 inversés corrigés

### Divers
- `src/lib/glossary.ts` — "Dealbreaker" redéfini comme "Risque critique"

**Ce qui ne change PAS :** Types TS, Zod schemas, clés internes, Board GO/NO_GO, Prisma schema, logique de scoring

---

---

## 2026-02-22 — fix: prompt engineering conditions-analyst — tonalité valorisation + logique CCA vs BSA-AIR

**Fichiers modifies :**
- `src/agents/tier3/conditions-analyst.ts` — 3 corrections dans le system prompt :
  1. Section Valorisation : ajout tableau "Interprétation pour le BA" + règle de tonalité (score élevé = bonne nouvelle, formuler positivement). Interdit les formulations alarmantes pour une sous-évaluation favorable
  2. Section Conseils de négociation : ajout règle de vérification économique — chaque conseil doit bénéficier au BA (réduire coût ou augmenter protections), jamais l'inverse
  3. Section Multi-tranche : ajout règle critique comparaison CCA-nominal vs BSA-AIR-cap — le CCA au nominal est moins cher, convertir en BSA-AIR augmente le coût. Ne jamais recommander cette conversion

**Raison :** L'agent produisait (1) des rationales alarmants pour des valorisations sous-évaluées (score 85 mais texte "montant dérisoire"), et (2) des conseils absurdes comme "convertir CCA en BSA-AIR" alors que ça augmente le coût d'acquisition pour le BA.

---

---

## 2026-02-21 — refactor: refonte onglet Conditions — suppression duplication, hero card, UX formulaire

**Fichiers modifies :**
- `src/components/ui/score-ring.tsx` — CREE : composant ScoreRing partagé (extrait de verdict-panel)
- `src/components/deals/conditions/conditions-analysis-cards.tsx` — REECRIT : 7 cards → 5 cards consolidées (ConditionsHeroCard remplace VerdictSummary+ScoreCard, NegotiationAdviceCard+talkingPoints, CrossReferenceInsightsCard collapsible). Suppression 4 helpers de couleur locaux → imports ui-configs.ts
- `src/components/deals/conditions/conditions-tab.tsx` — Nouvel ordre des cards, AlertDialog warning mode switch, suppression topAdvice dupliqué
- `src/components/deals/conditions/simple-mode-form.tsx` — Auto-calcul dilution (formule + bouton Appliquer + avertissement écart)
- `src/components/deals/conditions/tranche-editor.tsx` — Suppression GripVertical (pas de drag-to-reorder)
- `src/components/deals/verdict-panel.tsx` — Import ScoreRing partagé
- `src/components/deals/score-display.tsx` — Import ScoreRing partagé (remplace MiniScoreRing inline)

**Raison :** Le score et le one-liner apparaissaient dans 2 cards distinctes, les top 3 négociation étaient dupliqués entre VerdictSummary et NegotiationAdviceCard. Information architecture repensée : Hero card unique (ScoreRing + verdict + breakdown compact + valuation) → Négociation → Questions → Red flags → Cross-refs collapsible.

---

---

## 2026-02-21 — fix: security hardening — Zod schema constraints on terms route

- **route.ts (terms)** : ajout `.max(100)` sur `instrumentType`, `liquidationPref`, `antiDilution`, `boardSeat` — `.max(500)` sur `instrumentDetails` — `.max(2000)` sur `customConditions`, `notes`
- **route.ts (terms)** : ajout `.max(1e15)` sur `valuationPre`, `amountRaised` pour borner les valeurs numeriques
- **route.ts (terms)** : trancheSchema — remplacement `z.string().default("PENDING")` par `z.enum(["PENDING", "ACTIVE", "CONVERTED", "EXPIRED", "CANCELLED"])` pour le champ `status`
- **route.ts (terms)** : trancheSchema — ajout `.max(200)` sur `label`, `.max(100)` sur `trancheType`, `.max(500)` sur `typeDetails`, `.max(1000)` sur `triggerDetails`, `.max(100)` sur `liquidationPref`/`antiDilution`

### Fichiers modifies
- `src/app/api/deals/[dealId]/terms/route.ts`

---

---

## 2026-02-21 — perf: React.memo + useCallback — conditions components

- **version-timeline.tsx** : `VersionDetails` enveloppe dans `React.memo` pour eviter re-renders inutiles quand le snapshot n'a pas change
- **conditions-tab.tsx** : inline `onApply` callback extrait en `handleApplyTermSheet` via `useCallback` (reference stable pour `TermSheetSuggestions`)
- **dilution-simulator.tsx** : ajout `useCallback` pour `handlePreMoneyChange`, `handleInvestmentChange`, `handleEsopChange` — remplacement des setters inline dans les 6 handlers (Input onChange + Slider onValueChange)

### Fichiers modifies
- `src/components/deals/conditions/version-timeline.tsx`
- `src/components/deals/conditions/conditions-tab.tsx`
- `src/components/deals/conditions/dilution-simulator.tsx`

---

---

## 2026-02-21 — fix: dark mode + empty state — conditions components

- **percentile-comparator.tsx** : ajout dark mode variants sur le gradient de la barre percentile (`dark:from-green-900/40 dark:via-blue-900/40 dark:via-yellow-900/40 dark:to-red-900/40`)
- **term-sheet-suggestions.tsx** : ajout dark mode variants sur les badges de confidence (`dark:text-green-400 dark:bg-green-900/30`, etc.)
- **conditions-tab.tsx** : ajout empty state quand l'analyse IA n'a pas encore ete lancee (icone Brain + message invitant a cliquer "Sauvegarder et analyser")

### Fichiers modifies
- `src/components/deals/conditions/percentile-comparator.tsx`
- `src/components/deals/conditions/term-sheet-suggestions.tsx`
- `src/components/deals/conditions/conditions-tab.tsx`

---

---

## 2026-02-21 — fix: conditions tab — types, validation, icons, verdict, questions

- **types.ts** : ajout types `QuestionItem`, `ValuationFindings`, `InstrumentFindings`, `ProtectionsFindings` — enrichissement `ConditionsFindings` avec champs types (valuation, instrument, protections) — ajout champ `questions` dans `TermsResponse`
- **terms-normalization.ts** : ajout mapping `questions` (lowercase priority) dans `buildTermsResponse`, retourne `questions` dans la reponse
- **conditions-tab.tsx** : fix icones dupliquees Simulateur/Comparateur (`BarChart3` remplace par `TrendingDown`/`Target`) — term sheet suggestions affiches meme si formulaire non vide — validation client-side avant sauvegarde (dilution 0-100%, cliff <= vesting, ESOP 0-100%, valo/montant positifs) — ajout `ConditionsVerdictSummary` en haut de l'analyse + `ConditionsQuestionsCard` — spacer `h-16` pour le bouton sticky

### Fichiers modifies
- `src/components/deals/conditions/types.ts`
- `src/services/terms-normalization.ts`
- `src/components/deals/conditions/conditions-tab.tsx`

---

---

## 2026-02-21 — feat: ConditionsVerdictSummary + ConditionsQuestionsCard + progress bar clamp

- **conditions-analysis-cards.tsx** : ajout composant `ConditionsVerdictSummary` — carte TL;DR en haut de l'analyse (score/verdict, valuation quick view, top 3 nego priorities, arguments de nego, boutons simulateur/comparateur)
- **conditions-analysis-cards.tsx** : ajout composant `ConditionsQuestionsCard` — carte expandable des questions a poser au fondateur (priority badge, context, whatToLookFor)
- **conditions-analysis-cards.tsx** : clamp progress bar width a `Math.min(score, 100)` dans `ConditionsScoreCard` et `StructuredAssessmentCard` pour eviter overflow
- **conditions-analysis-cards.tsx** : ajout import `QuestionItem` depuis `./types`
- **types.ts** : type `QuestionItem` deja present (id?, question, priority, context?, whatToLookFor?)

### Fichiers modifies
- `src/components/deals/conditions/conditions-analysis-cards.tsx`

---

---

## 2026-02-21 — fix: accessibility, responsive, performance — conditions components

- **simple-mode-form.tsx** : `aria-label` ajouté sur les 9 Switch (pro-rata, information rights, founder vesting, drag-along, tag-along, ratchet, pay-to-play, milestones, non-compete)
- **tranche-editor.tsx** : `aria-label="Pro-rata rights"` ajouté sur le Switch
- **dilution-simulator.tsx** : `aria-label` sur les 3 Sliders (pre-money, montant investi, ESOP)
- **dilution-simulator.tsx** : suppression dependance redondante `result` dans le `useMemo` scenarios
- **dilution-simulator.tsx** : hauteur chart responsive (`h-[160px] sm:h-[200px]`), largeurs Input responsive
- **percentile-comparator.tsx** : remplacement `.replace("bg-", "text-")` fragile par fonctions dediees `getPercentileTextColor` et `getPercentileLabel`
- **version-timeline.tsx** : indicateur de troncature quand > 20 champs affiches

### Fichiers modifies
- `src/components/deals/conditions/simple-mode-form.tsx`
- `src/components/deals/conditions/tranche-editor.tsx`
- `src/components/deals/conditions/dilution-simulator.tsx`
- `src/components/deals/conditions/percentile-comparator.tsx`
- `src/components/deals/conditions/version-timeline.tsx`

---

---

## 2026-02-21 — fix: UX conditions tab — empty state, extraction list, confidence colors

- **conditions-tab.tsx** : empty state redesigne avec grid de 2 cartes explicatives (Simple vs Structure) au lieu de 2 boutons generiques
- **term-sheet-suggestions.tsx** : max-height extraction list responsive (250px mobile / 350px desktop)
- **term-sheet-suggestions.tsx** : seuils `getConfidenceColor` plus granulaires (85/65/45) avec ajout niveau bleu intermediaire
- **conditions-help.ts** : audit tooltips — tous terminent deja par un point, aucun fix necessaire

### Fichiers modifies
- `src/components/deals/conditions/conditions-tab.tsx`
- `src/components/deals/conditions/term-sheet-suggestions.tsx`

---

---

## 2026-02-21 — fix: backend conditions-analyst + terms route race condition + timeout

- **analysis-constants.ts** : ajout `"conditions-analyst"` dans `TIER3_AGENTS` pour que `categorizeResults` classe correctement ses résultats en Tier 3
- **terms/route.ts** : timeout route aligné de 55s à 52s (2s buffer après le 50s agent timeout)
- **terms/route.ts** : fix race condition version numbering — `count()` remplacé par `findFirst(orderBy: desc)` pour éviter les conflits de numéro de version en cas de requêtes concurrentes
- **terms-normalization.ts** : ajout import `QuestionItem` depuis les types conditions

### Fichiers modifiés
- `src/lib/analysis-constants.ts`
- `src/app/api/deals/[dealId]/terms/route.ts`
- `src/services/terms-normalization.ts`

---

---

## 2026-02-20 — refonte Vue d'ensemble : suppression VerdictPanel, Scores en premier

- **VerdictPanel supprimé** de la Vue d'ensemble (redondant avec la card Scores)
- **Card Scores remontée** en première position (gauche), DealInfo à droite
- Variables mortes nettoyées : verdictScore, verdictRecommendation, verdictRedFlags, conditionIssues, pendingQuestionsCount
- Imports morts supprimés : VerdictPanel, extractDealScore, extractDealRecommendation
- Fichier modifié : `deals/[dealId]/page.tsx`

---

---

## 2026-02-20 — feat: AI Board en sous-onglet à côté de Suivi DD

- **AI Board** intégré comme sous-onglet dans l'AnalysisPanel : Résultats | Cohérence | Suivi DD | **AI Board**
- Dynamic import du AIBoardPanel directement dans analysis-panel.tsx (ssr: false, lazy-loaded)
- Suppression du BoardPanelWrapper standalone de la page deal (plus de composant séparé en bas)
- Props `dealName` ajoutée à AnalysisPanelWrapper → AnalysisPanel pour le board
- Fichiers modifiés : `analysis-panel.tsx`, `analysis-panel-wrapper.tsx`, `deals/[dealId]/page.tsx`

---

---

## 2026-02-20 — refonte UI: Verdict, Scores, DealInfo — design pro fintech

### Composants redesignés
- **VerdictPanel** — Score ring SVG animé, accent line colorée, layout horizontal score+détails, typographie uppercase tracking-wider pour labels, spacing et hiérarchie visuelle améliorés
- **ScoreDisplay/ScoreGrid** — Barres gradient avec fond teinté, mini score ring pour le score global, labels uppercase, meilleur espacement grid
- **DealInfoCard** — Layout avec icônes par champ (MapPin, Target, Banknote...), header séparé avec bordure, InfoRow component, suppression de la Card shadcn basique
- **Deal page** — Suppression des stat cards redondants (Valorisation/ARR dupliqués), section Scores custom container au lieu de Card générique, nettoyage imports inutilisés

### Fichiers modifiés
- `src/components/deals/verdict-panel.tsx`
- `src/components/deals/score-display.tsx`
- `src/components/deals/deal-info-card.tsx`
- `src/app/(dashboard)/deals/[dealId]/page.tsx`

---
