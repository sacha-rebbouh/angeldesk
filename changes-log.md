# Changes Log - Angel Desk

---
## 2026-04-13 — fix: financial-auditor timeout cascade + LinkedIn rate limit

**Orchestrator abort logic (1 fichier) :**
- `src/agents/orchestrator/index.ts` — Seule Phase A (deck-forensics) est désormais fatale. Phase B (financial-auditor) failure est loggé en warning mais n'aborte plus les 11 agents restants. L'analyse continue en mode dégradé (question-master sans red flags financiers) au lieu de produire 1/13 agents.

**Financial-auditor timeout (1 fichier) :**
- `src/agents/tier1/financial-auditor.ts` — Timeout augmenté de 120s → 180s pour accommoder les gros documents + modèle complex.

**Problème résolu :** Le timeout du financial-auditor cascadait et tuait toute l'analyse (1/13 agents Tier 1, Tier 3 sur du vide, scorer incohérent 7 vs 49).

**TypeScript : 0 erreurs.**

---
## 2026-04-13 — fix: LinkedIn API rate limit 429 — séquentialisation + retry

**Context Engine (1 fichier) :**
- `src/services/context-engine/index.ts` — `buildPeopleGraph()` : remplacé `Promise.all` parallèle par boucle `for...of` séquentielle. Chaque profil LinkedIn est fetché uniquement après le précédent, évitant les 429 rate limits.

**RapidAPI LinkedIn connector (1 fichier) :**
- `src/services/context-engine/connectors/rapidapi-linkedin.ts` — Ajout retry avec backoff sur HTTP 429 : 3 tentatives max avec délais 2s/4s/6s. Cache DB et log sur chaque retry réussi.

**Problème résolu :** 4/5 profils LinkedIn échouaient en 429 car tous fetchés en parallèle. Le team-investigator n'avait les données que d'1 fondateur sur 5.

**TypeScript : 0 erreurs.**

---
## 2026-03-12 — feat: image OCR for JPEG/PNG uploads

**OCR service (1 fichier) :**
- `src/services/pdf/ocr-service.ts` — Ajout `processImageOCR()` : envoie l'image en base64 à GPT-4o Mini Vision via OpenRouter pour extraction texte. Retourne texte, confidence (high/medium/low), coût.
- `src/services/pdf/index.ts` — Export `processImageOCR` ajouté

**Upload route (1 fichier) :**
- `src/app/api/documents/upload/route.ts` — Ajout bloc de traitement image (JPEG/PNG) : passe le buffer à `processImageOCR()`, met à jour le document avec le texte extrait (chiffré), quality score, métriques OCR. Fallback gracieux si OCR échoue (document marqué COMPLETED sans texte).

**Problème résolu :** Les images uploadées restaient en statut "en attente" (PENDING) car aucun bloc de traitement n'existait pour les types image/jpeg et image/png.

**TypeScript : 0 erreurs.**

---
## 2026-03-12 — fix: KillReason/CriticalQuestion type alignment, breadcrumb deal detail, cleanup types split

**Vue Kanban deals (3 fichiers) :**
- `src/components/deals/deals-kanban.tsx` — Nouveau : vue kanban groupant les deals par statut (6 colonnes)
- `src/components/deals/deals-view-toggle.tsx` — Nouveau : toggle liste/kanban avec boutons LayoutList/LayoutGrid
- `src/app/(dashboard)/deals/page.tsx` — Intégration DealsViewToggle, toggle visible dans le CardHeader

**Dark mode toggle (2 fichiers) :**
- `src/components/providers.tsx` — Ajout `ThemeProvider` de next-themes (attribute="class", defaultTheme="light")
- `src/components/layout/sidebar.tsx` — Ajout bouton toggle Sun/Moon dans la section user du sidebar

**Type alignment — Dealbreaker → ABSOLUTE/CONDITIONAL (6 fichiers) :**
- `src/agents/types.ts` — Ajout `CriticalQuestion` type alias, ajout `criticalQuestions` dans `QuestionMasterFindings`
- `src/agents/tier1/question-master.ts` — Fix severity mapping: `CRITICAL→ABSOLUTE`, `HIGH→CONDITIONAL`
- `src/agents/tier3/devils-advocate.ts` — Fix `validKillReasonLevels`, severity mapping, et filtres `dealBreakerLevel`
- `src/components/deals/tier3-results.tsx` — Fix 5 comparaisons `dealBreakerLevel` (`CRITICAL→ABSOLUTE`, `HIGH→CONDITIONAL`)

**Breadcrumb (1 fichier) :**
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Ajout fil d'Ariane "Deals / {deal.name}" avec `aria-label`

**Cleanup types split (suppression) :**
- Suppression `src/agents/types/` (split incomplet par agent background — fichiers non importés)

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — refactor: ProviderIcon extraction, Cache-Control, DB index, accents supplémentaires

**ProviderIcon extraction (5 fichiers) :**
- `src/components/shared/provider-icon.tsx` — Nouveau : composant partagé avec SVG inline des 4 providers (Anthropic, OpenAI, Google, xAI)
- `src/components/deals/board/board-progress.tsx` — Import partagé, suppression locale, accent "Réponse reçue"
- `src/components/deals/board/board-teaser.tsx` — Import partagé, suppression locale
- `src/components/deals/board/vote-board.tsx` — Import partagé, suppression locale
- `src/components/deals/board/views/chat-view.tsx` — Import partagé, suppression locale

**Cache-Control (1 fichier) :**
- `next.config.ts` — Ajout headers `Cache-Control: public, max-age=31536000, immutable` pour `/_next/static/` et `/fonts/`

**DB Index (1 fichier) :**
- `prisma/schema.prisma` — Ajout index composite `[userId, action]` sur CreditTransaction (optimise lookup refund idempotence)

**Accents supplémentaires (7 fichiers) :**
- `src/components/deals/partial-analysis-banner.tsx` — spécialisée, Détecte, spécifiques, Mémo, structuré, thèse, mitigés, étapes, concrètes
- `src/components/deals/board/ai-board-panel.tsx` — Débat (label)
- `src/components/deals/board/key-points-section.tsx` — supplémentaires
- `src/components/deals/conditions/simple-mode-form.tsx` — supplémentaires, spécifiques
- `src/components/deals/conditions/tranche-editor.tsx` — Détails, supplémentaires, Précisions
- `src/components/deals/conditions/term-sheet-suggestions.tsx` — supplémentaires
- `src/components/deals/conditions/structured-mode-form.tsx` — définie, décrire
- `src/components/onboarding/first-deal-guide.tsx` — étapes
- `src/components/error-boundary.tsx` — résultats

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — feat: admin analytics page

**Nouveau fichier :**
- `src/app/(dashboard)/admin/analytics/page.tsx` — Page server component d'analytics admin avec :
  - Overview cards : total users, deals, analyses completed, credits purchased
  - Recent activity : analyses/jour et users/jour (7 derniers jours) en tables
  - Credit health : balance moyenne, credits consumed, revenue estimate
  - Auth via `requireAdmin()`, queries paralleles via `Promise.all`

---
## 2026-03-12 — fix: accents français manquants dans 20+ composants UI

**Re-audit loop — correction des accents français dans les textes user-facing (20 fichiers) :**

- `src/components/shared/cgu-consent-modal.tsx` — opportunités, résultats, à, données, traitées, modèles, générer, utilisée, entraîner, Générales
- `src/components/shared/linkedin-consent-dialog.tsx` — données, expériences, compétences, légale, intérêt, légitime, à
- `src/components/shared/data-completeness-guide.tsx` — trésorerie, équipe
- `src/components/deals/board/ai-board-panel.tsx` — délibèrent, clés
- `src/components/deals/board/board-progress.tsx` — Débat
- `src/components/deals/board/debate-viewer.tsx` — Débat
- `src/components/deals/extraction-quality-badge.tsx` — Échec, échoué
- `src/components/deals/documents-tab.tsx` — Échec
- `src/components/deals/deck-coherence-report.tsx` — cohérentes, incohérences, détectées, nécessaire, données, supplémentaires, cohérence, recommandée, Vérification
- `src/components/deals/founder-responses.tsx` — réponse (x4), générée, générer, à, traitées, refusé, Ré-analyser
- `src/components/deals/partial-analysis-banner.tsx` — Détecteur, Détecte, données, réelles, incohérences, cachées, Modélisation, scénarios, probabilités
- `src/components/deals/tier1-results.tsx` — Résumé, Stratégique, Insights clés (x2)
- `src/components/deals/tier3-results.tsx` — cohérence
- `src/components/deals/analysis-panel.tsx` — Résumé (x3), exécutif, clés, exporté
- `src/components/deals/team-management.tsx` — conservées, équipe (x2)
- `src/components/deals/conditions/conditions-analysis-cards.tsx` — négocier, défavorables, sous-évalué, clés
- `src/components/deals/conditions/dilution-simulator.tsx` — Résultats
- `src/components/deals/conditions/percentile-comparator.tsx` — médiane (x2)
- `src/components/deals/conditions/structured-mode-form.tsx` — Résumé
- `src/components/deals/suivi-dd/suivi-dd-dashboard.tsx` — traitées, réponses
- `src/components/deals/suivi-dd/suivi-dd-tab.tsx` — Ré-analyser, réponses
- `src/components/chat/deal-chat-panel.tsx` — Résumé, identifiés, métriques, médiane, priorité, négociation (x2), justifiée, données (x2), négocier
- `src/components/onboarding/first-deal-guide.tsx` — métriques, clés, équipe, parallèle, marché, résultats, à
- `src/components/error-boundary.tsx` — résultats

**TypeScript : 0 nouvelles erreurs (2 attendues CGU/Prisma).**

---
## 2026-03-12 — fix: Phase 3A/3B/3C — auth, pricing, CSP, connection pool

**Phase 3A — Auth try/catch (1 fichier) :**
- `src/app/api/analyze/stream/route.ts` — `requireAuth()` wrappé en try/catch → retourne 401 au lieu de crash

**Phase 3B — UX Polish (3 fichiers) :**
- `src/app/(dashboard)/pricing/pricing-content.tsx` — "Pack recommandé : Standard (30 crédits, 99€)" ajouté sous Deal complet + toggle auto-refill masqué + nettoyage imports
- `src/components/shared/disclaimer-banner.tsx` — Retrait `pr-40` excessif, accent "Réduire" corrigé
- `src/app/(dashboard)/dashboard/loading.tsx` — Skeleton 3 colonnes → 4 colonnes

**Phase 3C — Architecture (2 fichiers) :**
- `next.config.ts` — CSP connect-src: ajout `wss://*.ably.io https://*.ably.io`
- `src/lib/prisma.ts` — `connection_limit` 15 → 25, comment mis à jour

**Divers :**
- `vitest.config.ts` — Suppression plugin storybook cassé (pas de `.storybook/` dir)
- `src/lib/__tests__/prisma-pool.test.ts` — Tests mis à jour pour connection_limit=25

**Tests : 498/498 passed.**

---
## 2026-03-12 — feat: CGU/IA consent modal at signup

**Prisma schema (1 fichier) :**
- `prisma/schema.prisma` — Ajout champ `cguAcceptedAt DateTime?` au model User (null = pas encore accepte)

**Composants (2 fichiers crees) :**
- `src/components/shared/cgu-consent-modal.tsx` — Modal non-dismissible (pas de X, pas d'escape, pas de clic exterieur) avec checkbox CGU + bouton "Accepter et continuer", POST vers `/api/user/cgu`
- `src/components/shared/cgu-gate.tsx` — Client wrapper qui affiche le modal si `cguAcceptedAt` est null

**API route (1 fichier cree) :**
- `src/app/api/user/cgu/route.ts` — POST handler : `requireAuth()` + `prisma.user.update({ cguAcceptedAt: new Date() })`

**Layout (1 fichier modifie) :**
- `src/app/(dashboard)/layout.tsx` — Charge l'utilisateur via `getAuthUser()`, wrappe le contenu avec `CguGate` qui affiche le modal si consentement manquant

**Auth (1 fichier modifie) :**
- `src/lib/auth.ts` — Ajout `cguAcceptedAt` au DEV_USER (pre-accepte en dev)

**TypeScript : 2 erreurs attendues (champ `cguAcceptedAt` absent des types Prisma generes — resolu apres `prisma generate`).**

---
## 2026-03-12 — feat: RGPD Art. 20 data portability route

**1 fichier cree :**
- `src/app/api/user/export/route.ts` — `GET /api/user/export` retourne un JSON telechargeable avec toutes les donnees utilisateur : profil, deals (founders, documents metadata, red flags, analyses metadata), credits (balance + transactions), API keys (masquees). Exclut les blobs d'analyse (10MB+), extractedText, et les cles API completes. Requetes paralleles via `Promise.all`. Headers `Content-Disposition` pour telechargement direct.

**TypeScript : 0 erreur sur le fichier.**

---
## 2026-03-12 — fix: Phase 2D/3B/3D — FR labels, Dealbreaker rename, UX polish, credits rollover

**Phase 2D — FR enum labels centralisés (2 fichiers) :**
- `src/lib/ui-configs.ts` — Ajout mappings FR : `BURN_EFFICIENCY_LABELS`, `MOAT_LABELS`, `PMF_LABELS`, `DIVERSIFICATION_LABELS`, `CONCENTRATION_LABELS`, `LEVEL_LABELS` + fonction `getEnumLabel()` avec fallback
- `src/components/deals/tier1-results.tsx` — 7 badges remplacent les enums EN bruts par les labels FR centralisés (EFFICIENT→"Efficace", STRONG_MOAT→"Fort avantage concurrentiel", etc.)

**Phase 3D — Dealbreaker → CriticalCondition (3 fichiers) :**
- `src/services/negotiation/strategist.ts` — Interface `Dealbreaker` → `CriticalCondition` (alias deprecated conservé pour compat)
- `src/services/negotiation/index.ts` — Export `CriticalCondition` ajouté
- `src/agents/tier1/schemas/question-master-schema.ts` — Commentaire JSDoc ajouté sur le champ `dealbreakers`

**Phase 3B — UX Polish (5 fichiers) :**
- `src/components/shared/disclaimer-banner.tsx` — Retrait `pr-40` excessif, accent "Réduire" corrigé
- `src/app/(dashboard)/dashboard/loading.tsx` — Skeleton 3 colonnes → 4 colonnes (aligné avec dashboard réel)
- `src/components/deals/board/views/arena-view.tsx` — Dimensions responsives `h-[240px] sm:h-[300px] lg:h-[400px]`
- `src/app/(dashboard)/pricing/pricing-content.tsx` — Toggle auto-refill masqué (Stripe non intégré), nettoyage imports/state inutiles
- `vitest.config.ts` — Suppression plugin storybook cassé (pas de `.storybook/` dir), config simplifiée

**Phase 3D — Credits rollover cap (1 fichier) :**
- `src/services/credits/usage-gate.ts` — `addCredits()` enforce rollover cap 2x sur auto-refill uniquement (manual purchases sans cap)

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — perf: Phase 2C Performance fixes (export-pdf blob cache, SSR doc select, dedup directives)

**Fix 1 — Export PDF: use Blob cache instead of DB query (3 fichiers) :**
- `src/services/analysis-results/load-results.ts` — Nouveau : fonction `loadResults()` partagee (Blob cache + DB fallback + backfill)
- `src/app/api/deals/[dealId]/export-pdf/route.ts` — Remplace `prisma.analysis.findFirst()` (charge le JSON multi-MB depuis Neon, 30s+) par `loadResults()` depuis le Blob cache (<1s). Metadata chargee separement avec `select` (sans le champ `results`)
- `src/app/api/deals/[dealId]/analyses/route.ts` — Importe `loadResults` depuis le service partage au lieu de la fonction locale

**Fix 2 — Deal SSR: exclure extractedText des documents (1 fichier) :**
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — `documents: { include: true }` remplace par `select` explicite excluant `extractedText` (200KB+/doc) et `ocrText`

**Fix 3 — Dedup anti-hallucination directives Tier 3 (6 fichiers) :**
- `src/agents/tier3/synthesis-deal-scorer.ts` — Suppression `getAbstentionPermission()`, `getCitationDemand()`, `getSelfAuditDirective()`, `getStructuredUncertaintyDirective()`, `getDataReliabilityDirective()`, `getAnalyticalToneDirective()` (deja auto-injectes par `buildFullSystemPrompt`). Directive 1 (Confidence Threshold) conservee.
- `src/agents/tier3/memo-generator.ts` — Idem
- `src/agents/tier3/devils-advocate.ts` — Idem
- `src/agents/tier3/scenario-modeler.ts` — Idem
- `src/agents/tier3/contradiction-detector.ts` — Idem
- `src/agents/tier3/conditions-analyst.ts` — Idem

**TypeScript : `npx tsc --noEmit` OK, 0 erreurs.**

---
## 2026-03-12 — test: comprehensive score-aggregator test suite (35 tests)

**Fichiers créés (1) :**
- `src/scoring/services/__tests__/score-aggregator.test.ts` — 35 tests couvrant : agrégation normale, scores 0 et 100, input vide, dimension unique, distribution des poids, scores hors limites, dimensions manquantes, filtrage par confidence, structure du résultat, précision moyenne pondérée, toggle confidence weighting, variance attendue, mapping catégorie→dimension, utilitaire createScoredFinding, compteurs metadata, minMetricsForDimension custom

**35/35 tests passed.**

---
## 2026-03-12 — fix: Phase 2E Anti-Hallucination — fallbacks consensus-engine + reflexion

**Fichiers modifiés (2) :**
- `src/agents/orchestration/consensus-engine.ts` — Ajout des 5 directives anti-hallucination (Confidence Threshold, Abstention Permission, Citation Demand, Self-Audit, Structured Uncertainty) dans les 4 fallback LLM calls : debateRound1Fallback, debateRound2 fallback, debateRound3 fallback, arbitrateFallback
- `src/agents/orchestration/reflexion.ts` — Ajout des 5 directives anti-hallucination dans les 3 fallback LLM calls legacy : generateCritiques, identifyDataNeeds, generateImprovements

---
## 2026-03-12 — fix: Phase 2G accessibilité WCAG AA — progressbar crédits

**Fichiers modifiés (1) :**
- `src/components/layout/sidebar.tsx` — Ajout `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label` sur la barre de solde crédits (CreditCard)

**Vérifications (2 fichiers déjà OK) :**
- `src/components/deals/board/views/arena-view.tsx` — `aria-label` déjà présent sur les boutons membres
- `src/components/shared/score-badge.tsx` — `tabIndex={0}` déjà présent

---
## 2026-03-12 — fix: Phase 1-2-3 mega-audit corrections

**Phase 1C — Positionnement Règle N°1 UI visible (3 fichiers) :**
- `src/components/shared/severity-legend.tsx` — "avant d'investir" → "avant toute décision"
- `src/components/shared/severity-badge.tsx` — "AVANT d'investir" → "avant toute décision"
- `src/components/chat/deal-chat-panel.tsx` — "avant d'investir" → "avant de me décider"

**Phase 1B — Crédits system (2 fichiers) :**
- `src/services/credits/usage-gate.ts` — Fail-open → fail-closed en prod, double refund idempotence via findFirst
- `src/app/api/analyze/route.ts` — TOCTOU: suppression canAnalyzeDeal(), seul recordDealAnalysis() atomique reste

**Phase 1D — UX critique (3 fichiers) :**
- `src/app/(dashboard)/dashboard/page.tsx` — Carte "Plan" → "Crédits" avec solde + lien /pricing
- `src/components/layout/sidebar.tsx` — "Analytiques" déplacé dans adminNavItems
- `src/app/(dashboard)/pricing/pricing-cta-button.tsx` — Toast Stripe → mailto contact@angeldesk.io

**Phase 2A — Positionnement prompts agents (7 fichiers) :**
- question-master, legal-regulatory, synthesis-deal-scorer, conditions-analyst, benchmark-tool, early-warnings, types.ts

**Phase 2C — Performance :** export-pdf deal+analysis parallélisés
**Phase 2D — Labels :** score-badge aligné ui-configs, tier1-results "Analyse détaillée"
**Phase 2E — Anti-hallucination :** fact-extractor meta-eval directives 2/3/5, board-orchestrator dedup guard
**Phase 3B/3D — Credits :** badge seuils, purchase-modal mailto, canAnalyze >= QUICK_SCAN

**Tests :** schemas verdict corrigé, credit-flow idempotence mock. **463/463 passed.**

---
## 2026-03-12 — fix: Phase 2D accents français + Phase 2G accessibilité WCAG AA

**Phase 2D — Accents français manquants (7 fichiers) :**
- `src/components/deals/board/vote-board.tsx` — "Majorite forte" → "Majorité forte", "Echec" → "Échec", "de debat" → "de débat"
- `src/components/deals/board/views/arena-view.tsx` — "Debat" → "Débat", "Derniere reponse" → "Dernière réponse", "A change de position" → "A changé de position", "les details" → "les détails"
- `src/components/deals/board/views/chat-view.tsx` — "Position changee" → "Position changée", "Reduire" → "Réduire" (x2)
- `src/components/deals/board/views/columns-view.tsx` — "Reduire" → "Réduire" (x2)
- `src/components/deals/board/views/timeline-view.tsx` — "Reduire" → "Réduire"
- `src/components/deals/board/board-teaser.tsx` — "deliberent" → "délibèrent", "Debat structure" → "Débat structuré", "desaccords" → "désaccords", "modeles" → "modèles"
- `src/components/shared/score-badge.tsx` — "modele" → "modèle", "retourne" → "retourné", "Echelle" → "Échelle", "Legende echelle" → "Légende échelle"

**Phase 2G — Accessibilité WCAG AA (3 fichiers) :**
- `src/components/deals/board/views/arena-view.tsx` — Ajout `aria-label` sur les boutons de membres du board
- `src/components/layout/sidebar.tsx` — Ajout `aria-current="page"` sur les liens nav actifs (4 emplacements : desktop main, desktop admin, mobile main, mobile admin)
- `src/components/shared/score-badge.tsx` — Ajout `tabIndex={0}` sur le score badge pour la navigation clavier

---
## 2026-03-12 — feat: user account deletion

**Fichiers créés (2) :**
- `src/app/api/user/route.ts` — DELETE handler: authenticates via `requireAuth()`, deletes Vercel Blob files for documents, then in a Prisma transaction deletes all orphan records (AIBoardSession, ChatConversation, CostEvent, UserBoardCredits, UserDealUsage) and finally the User record (cascading Deal, CreditBalance, CreditTransaction, ApiKey, Webhook, LiveSession and all sub-relations).
- `src/components/settings/delete-account-button.tsx` — Client component with red "Supprimer mon compte" button, shadcn AlertDialog confirmation, loading state, calls DELETE /api/user then Clerk signOut().

**Fichiers modifiés (1) :**
- `src/app/(dashboard)/settings/page.tsx` — Added danger zone card at bottom with DeleteAccountButton, imported AlertTriangle icon.

**`npx tsc --noEmit` : OK (no new errors).**

---
## 2026-03-12 — security: SSRF protection for website crawling/resolving

**Fichier cree (1) :**
- `src/lib/url-validator.ts` — Exports `isPrivateUrl()` and `validatePublicUrl()`. Checks hostname against private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7, fe80::/10), blocks localhost/0.0.0.0, resolves DNS to verify the actual IP is public, and enforces http/https-only protocols.

**Fichiers modifies (2) :**
- `src/services/context-engine/connectors/website-crawler.ts` — Added `validatePublicUrl()` check in `crawlPage()` before every fetch. Private URLs return null (skipped).
- `src/services/context-engine/website-resolver.ts` — Added `validatePublicUrl()` check in `validateUrl()` before the HEAD/GET fetch. Private URLs return false (invalid).

**`npx tsc --noEmit` : OK (no new errors).**

---
## 2026-03-12 — feat: authenticated proxy route for document download

**Fichier créé (1) :**
- `src/app/api/documents/[documentId]/download/route.ts` — GET route that authenticates via `requireAuth()`, verifies deal ownership, then streams the file from Vercel Blob (or local storage) with correct Content-Type and Content-Disposition headers. Returns 404 if not found, 403 if not owned by user.

---
## 2026-03-12 — security: timing-safe CRON_SECRET comparison in cron routes

**Fichiers modifiés (5) :**
- `src/app/api/cron/maintenance/cleaner/route.ts` — `===` replaced with `timingSafeEqual` from `node:crypto`
- `src/app/api/cron/maintenance/sourcer/route.ts` — idem
- `src/app/api/cron/maintenance/completer/route.ts` — idem
- `src/app/api/cron/maintenance/supervisor/check/route.ts` — idem
- `src/app/api/cron/maintenance/supervisor/weekly-report/route.ts` — idem

Handles length mismatch (early return false) before calling `timingSafeEqual` to avoid `RangeError`.

---
## 2026-03-12 — fix: Phase 1 CRITICAL — positionnement, crédits, UX

**Phase 1C — Positionnement Règle N°1 (3 fichiers) :**
- `src/components/shared/severity-legend.tsx` — "avant d'investir" → "avant toute décision"
- `src/components/shared/severity-badge.tsx` — "AVANT d'investir" → "avant toute décision"
- `src/components/chat/deal-chat-panel.tsx` — "avant d'investir" → "avant de me décider"

**Phase 1B — Crédits system (2 fichiers) :**
- `src/services/credits/usage-gate.ts` — Fix 6: Fail-open → fail-closed en production (deductCredits + getOrCreateBalance bloquent si tables absentes en prod). Fix 7: Double refund idempotence (check `creditTransaction.findFirst` avant refund).
- `src/app/api/analyze/route.ts` — Fix 8: Suppression TOCTOU `canAnalyzeDeal()` préalable, seul `recordDealAnalysis()` atomique reste.

**Phase 1D — UX critique (3 fichiers) :**
- `src/app/(dashboard)/dashboard/page.tsx` — Carte "Plan" remplacée par carte "Crédits" avec solde + lien /pricing
- `src/components/layout/sidebar.tsx` — "Analytiques" déplacé dans adminNavItems (visible uniquement pour admins)
- `src/app/(dashboard)/pricing/pricing-cta-button.tsx` — Toast Stripe remplacé par mailto contact@angeldesk.io

**`npx tsc --noEmit` : OK.**

---
## 2026-03-11 — fix: RecommendationBadge affiche les clés brutes au lieu des labels

**Problème :** Sur la page d'analyse Tier 3, les badges de recommandation affichaient `alert_dominant` en texte brut au lieu de "Signaux d'alerte dominants". La raison : `rationale` affichait "Analyse en cours" (fallback).

**Cause racine :**
1. `tier3-results.tsx` avait un `RECOMMENDATION_CONFIG` local (l.71-76) qui shadowait le global de `ui-configs.ts` et ne contenait que les anciennes clés (`invest/pass/wait/negotiate`). Les nouvelles clés (`very_favorable/favorable/contrasted/vigilance/alert_dominant`) n'y étaient pas → fallback sur le texte brut.
2. `synthesis-deal-scorer.ts` cherchait le `rationale` et `action` uniquement dans `data.findings?.recommendation` et `data.investmentRecommendation`, mais le LLM retourne dans `data.recommendation` (conformément au schema Zod). Résultat : fallback "Analyse en cours" et action par défaut "vigilance".

**Fichiers modifiés :**
- `src/components/deals/tier3-results.tsx` — `RECOMMENDATION_BADGE_CONFIG` avec toutes les clés (new + legacy). `RECOMMENDATION_ICONS` idem. `MEMO_RECOMMENDATION_CONFIG` idem.
- `src/agents/tier3/synthesis-deal-scorer.ts` — `rawAction` et `rawRationale` cherchent aussi dans `data.recommendation` et `data.investmentThesis.summary`. `LLMSynthesisResponse` enrichi avec `recommendation` et `investmentThesis`.
- `src/agents/tier3/schemas/synthesis-deal-scorer-schema.ts` — Ajout `rationale` optionnel dans le schema `recommendation`.

---
## 2026-03-11 — fix: déductions crédits manquantes + refunds (Live Coaching, Re-analyse, Analyse)

**Contexte :** Audit complet des routes API a révélé que 2 actions payantes ne déduisaient aucun crédit, et que les refunds en cas d'échec étaient absents.

**A. Live Coaching — check + déduction + refund (2 fichiers) :**
- `src/app/api/live-sessions/route.ts` — Ajout `checkCredits('LIVE_COACHING')` à la création de session. Bloque la création si crédits insuffisants (402).
- `src/app/api/live-sessions/[id]/start/route.ts` — Ajout `deductCredits('LIVE_COACHING')` avant le deploy du bot (8 crédits). Refund automatique via `refundCredits()` si le bot échoue au deploy (2 chemins d'erreur couverts : erreur video_separate_png + erreur générale).

**B. Re-analyse — check + déduction + refund (1 fichier) :**
- `src/app/api/coaching/reanalyze/route.ts` — Ajout `deductCredits('RE_ANALYSIS')` pour les modes targeted/full (3 crédits). Delta mode reste gratuit. Restructuré pour vérifier les préconditions (summary existe) AVANT la déduction. Refund automatique si `triggerTargetedReanalysis()` échoue.

**C. Analyse — refund sur échec (1 fichier) :**
- `src/app/api/analyze/route.ts` — Ajout `refundCredits()` dans le `.catch()` de `orchestrator.runAnalysis()`. Si l'analyse crash complètement, les crédits sont remboursés.

**Tableau final des déductions :**
| Action | Coût | Check | Deduct | Refund |
|--------|------|-------|--------|--------|
| Quick Scan | 1 | canAnalyzeDeal | recordDealAnalysis | refundCredits |
| Deep Dive | 5 | canAnalyzeDeal | recordDealAnalysis | refundCredits |
| AI Board | 10 | canStartBoard | consumeCredit | refundCredit |
| Live Coaching | 8 | checkCredits | deductCredits | refundCredits |
| Re-analyse | 3 | deductCredits | deductCredits | refundCredits |
| Chat | 0 | — | — | — |
| PDF Export | 0 | — | — | — |

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: migration UI complète vers système de crédits (suppression ancien plan Pro/Gratuit)

**Contexte :** Le backend avait déjà migré vers un système de crédits par pack (CREDIT_PACKS, CREDIT_COSTS dans `services/credits/types.ts`), mais l'UI affichait encore l'ancien modèle "Plan Gratuit / Plan Pro à 249€/mois". Migration complète de tous les composants UI.

**A. Nouveau composant — Modale d'achat de crédits (1 fichier) :**
- `src/components/credits/credit-purchase-modal.tsx` — Modale affichant les 5 packs avec prix, auto-sélection du pack couvrant le déficit, badges "Suffisant"/"Populaire", déverrouillage features (Négociation/API) selon totalPurchased.

**B. Credit Badge refonte (1 fichier) :**
- `src/components/credits/credit-badge.tsx` — Remplacé badge "PRO" / "X/Y analyses" par "N crédits" avec Popover dropdown (coûts par action + bouton acheter). Couleur dynamique selon solde (rouge/amber/normal).

**C. Credit Modal refonte (1 fichier) :**
- `src/components/credits/credit-modal.tsx` — Simplifié en wrapper de CreditPurchaseModal. Supprimé ancien type LIMIT_REACHED/UPGRADE_REQUIRED/TIER_LOCKED. Mapping legacy actions (ANALYSIS→DEEP_DIVE, UPDATE→RE_ANALYSIS, BOARD→AI_BOARD).

**D. Sidebar refonte (1 fichier) :**
- `src/components/layout/sidebar.tsx` — Supprimé "Plan Gratuit"/"Plan Pro" + barre d'utilisation mensuelle. Remplacé par carte crédits avec solde, barre visuelle, features débloquées (Quick Scan, Deep Dive, Négociation, API) selon totalPurchased, bouton "Acheter des crédits". Desktop + Mobile.

**E. ProTeaser refonte (1 fichier, 4 variantes) :**
- `src/components/shared/pro-teaser.tsx` — Supprimé toutes les mentions "PRO", "249EUR/mois", "Crown" icon. Remplacé par "crédits", "Coins" icon, "Acheter des crédits"/"Voir les packs de crédits".

**F. Settings page refonte (1 fichier) :**
- `src/app/(dashboard)/settings/page.tsx` — Supprimé carte "Abonnement" (Plan Pro/Gratuit, analyses/mois). Remplacé par carte "Crédits" avec solde, total acheté, dernier pack, features débloquées, lien pricing.

**G. Analysis panel mise à jour (1 fichier) :**
- `src/components/deals/analysis-panel.tsx` — Interface QuotaData migrée vers CreditBalanceInfo. handleAnalyzeClick vérifie le solde crédits au lieu de quota.analyses. CreditModal reçoit les nouvelles props (balance, totalPurchased). Supprimé badge PRO sur PDF export. Type d'analyse (`analysisType`) déterminé par le solde crédits (canAffordDeepDive) au lieu de subscriptionPlan. Ajout `effectivePlan` dérivé de la présence de résultats Tier 2/3 pour afficher correctement les résultats payés (corrige bug où un utilisateur ayant payé un Deep Dive avec des crédits voyait des ProTeasers au lieu des résultats). Toast "Passer PRO" → "Acheter des crédits". Import inutilisé `Crown` supprimé, import `AnalysisTypeValue` ajouté.

**H. Board teaser mise à jour (1 fichier) :**
- `src/components/deals/board/board-teaser.tsx` — Supprimé "Plan PRO", "249€/mois". Remplacé par "10 crédits", "Packs à partir de 49€". Import inutilisé `BOARD_PRICING` supprimé.

**I. API /api/analyze — migration critique (1 fichier) :**
- `src/app/api/analyze/route.ts` — Supprimé l'ancien check `userDealUsage.monthlyLimit` (hardcodé à 3) et l'override du type d'analyse par `subscriptionStatus`. Remplacé par déduction de crédits via `recordDealAnalysis()`. Le type d'analyse demandé par le frontend est maintenant utilisé directement (plus d'override `FREE→tier1_complete`). Import inutilisé `SubscriptionTier` supprimé.

**J. API /api/deals/[dealId]/export-pdf — suppression gate PRO (1 fichier) :**
- `src/app/api/deals/[dealId]/export-pdf/route.ts` — Supprimé le check `subscriptionStatus === "FREE"` qui bloquait l'export PDF pour les utilisateurs gratuits. PDF_EXPORT coûte 0 crédits, donc accessible à tous.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: data reliability, analytical tone, narrative sanitizer, DB cross-reference

**Contexte :** Troisième passe corrective. Ajout systématique de la classification de fiabilité des données (6 niveaux), du ton analytique obligatoire (Règle N°1), d'un sanitizer post-LLM pour le langage prescriptif, et d'instructions de cross-reference DB explicites.

**A. BaseAgent — 2 nouvelles directives auto-injectées (1 fichier) :**
- `src/agents/base-agent.ts` — Ajout de `getDataReliabilityDirective()` et `getAnalyticalToneDirective()` (méthodes protégées). Injectées automatiquement dans `buildFullSystemPrompt()` pour tous les agents Tier 0/1 (+ marketplace-expert, document-extractor, deal-scorer, red-flag-detector, etc.).

**B. Tier 3 — Ajout explicite des 2 directives (6 fichiers) :**
- contradiction-detector, synthesis-deal-scorer, memo-generator, devils-advocate, scenario-modeler, conditions-analyst — Ajout de `${this.getDataReliabilityDirective()}` + `${this.getAnalyticalToneDirective()}`.

**C. Tier 2 standalone — Ajout des 2 directives (21 fichiers) :**
- Tous les experts sectoriels (saas, fintech, ai, healthtech, deeptech, climate, consumer, hardware, gaming, blockchain, biotech, edtech, proptech, mobility, foodtech, hrtech, legaltech, cybersecurity, spacetech, creator, general) — Variables `dataReliability` + `analyticalTone` ajoutées au site d'appel `completeJSON()`.

**D. Chat + Board — Ajout hardcodé (2 fichiers) :**
- `deal-chat-agent.ts`, `board-member.ts` — Texte des 2 directives ajouté directement dans `buildSystemPrompt()`.

**E. base-sector-expert.ts — Ajout des 2 directives (1 fichier) :**
- `src/agents/tier2/base-sector-expert.ts` — Ajouté dans `buildSectorExpertPrompt()`.

**F. Narrative Sanitizer post-LLM (2 fichiers) :**
- `src/agents/orchestration/result-sanitizer.ts` — Nouvelle fonction `sanitizeAgentNarratives()` avec 22 patterns prescriptifs (FR + EN). Scanne récursivement les champs narratifs (narrative, summary, nextSteps, forNegotiation, etc.) et remplace le langage directif par des formulations analytiques.
- `src/agents/orchestrator/index.ts` — Intégration à 5 points de collecte des résultats (Tier 1, Tier 2, Tier 3, quick analysis). Log `[NarrativeSanitizer]` si violations corrigées.

**G. DB Cross-Reference prompts (6 fichiers) :**
- team-investigator, legal-regulatory, tech-stack-dd, tech-ops-dd, gtm-analyst, cap-table-auditor — Ajout d'une section "CROSS-REFERENCE DB OBLIGATOIRE" explicite dans le prompt.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 6 standalone Tier 2 experts (batch 3)

**Contexte :** Suite des batches 1 et 2. Ajout des deux directives `dataReliability` (classification de fiabilite des donnees) et `analyticalTone` (ton analytique obligatoire) aux 6 derniers experts Tier 2 standalone restants. Les variables sont injectees avant `citationDemand`/`structuredUncertainty` dans le `systemPrompt` concatenation du `complete()` call.

**Fichiers modifies (6) :**
- `src/agents/tier2/hrtech-expert.ts`
- `src/agents/tier2/legaltech-expert.ts`
- `src/agents/tier2/cybersecurity-expert.ts`
- `src/agents/tier2/spacetech-expert.ts`
- `src/agents/tier2/creator-expert.ts`
- `src/agents/tier2/general-expert.ts`

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 8 standalone Tier 2 experts (batch 2)

**Contexte :** Suite du batch 1. Ajout des deux directives (`dataReliability` + `analyticalTone`) aux 8 experts Tier 2 standalone restants, avant `citationDemand`/`structuredUncertainty`, et injection dans le `systemPrompt` concatenation.

**Fichiers modifies (8) :**
- `src/agents/tier2/hardware-expert.ts`
- `src/agents/tier2/gaming-expert.ts`
- `src/agents/tier2/blockchain-expert.ts`
- `src/agents/tier2/biotech-expert.ts`
- `src/agents/tier2/edtech-expert.ts`
- `src/agents/tier2/proptech-expert.ts`
- `src/agents/tier2/mobility-expert.ts`
- `src/agents/tier2/foodtech-expert.ts`

**Adaptations par fichier :**
- hardware/gaming/biotech: `system + dataReliability + analyticalTone + citationDemand + structuredUncertainty`
- blockchain: `buildBlockchainSystemPrompt(stage) + dataReliability + analyticalTone + ...`
- edtech/proptech/foodtech: `systemPromptText + dataReliability + analyticalTone + ...`
- mobility: `systemPrompt + dataReliability + analyticalTone + ...`

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 7 standalone Tier 2 experts (batch 1)

**Contexte :** Les experts Tier 2 standalone (object-based, pas BaseAgent) appendaient manuellement les directives anti-hallucination au call site. Ajout de deux nouvelles directives (`dataReliability` + `analyticalTone`) avant `citationDemand`/`structuredUncertainty`, et injection dans le `systemPrompt` concatenation.

**Fichiers modifies (7) :**
- `src/agents/tier2/saas-expert.ts`
- `src/agents/tier2/fintech-expert.ts`
- `src/agents/tier2/ai-expert.ts`
- `src/agents/tier2/healthtech-expert.ts`
- `src/agents/tier2/deeptech-expert.ts`
- `src/agents/tier2/climate-expert.ts`
- `src/agents/tier2/consumer-expert.ts`

**Note :** marketplace-expert.ts extends BaseAgent (class-based) et utilise `this.llmCompleteJSON()` -- il n'a PAS le pattern standalone `citationDemand`/`structuredUncertainty` au call site. Les directives pour cet agent passent par le mecanisme BaseAgent.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to Tier 2 base, chat agent, board member

**Contexte :** Ajout de deux nouvelles sections de directive (CLASSIFICATION DE FIABILITÉ DES DONNÉES + TON ANALYTIQUE OBLIGATOIRE) dans les prompts systeme de 3 fichiers, avant les blocs anti-hallucination existants.

**Fichiers modifies (3) :**
- `src/agents/tier2/base-sector-expert.ts` — `buildSectorExpertPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives. Propage aux experts crees via `createSectorExpert()`.
- `src/agents/chat/deal-chat-agent.ts` — `buildSystemPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives (hardcoded, pas via BaseAgent methods).
- `src/agents/board/board-member.ts` — `buildSystemPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives (hardcoded, pas via BaseAgent methods).

**Note :** Les 21 experts Tier 2 individuels (saas-expert, fintech-expert, etc.) ont chacun leur propre `buildSystemPrompt()` avec directives hardcoded. Ils n'utilisent PAS `buildSectorExpertPrompt()` de base-sector-expert.ts. Ils necessitent une modification individuelle separee.

**`npx tsc --noEmit` : OK.**

