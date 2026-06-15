# Refonte Front Angel Desk — Plan v4

Plan d'exécution en slices indépendants pour aligner le front avec la cascade doctrinale 2026-05-20.

## Source De Vérité

- En cas de conflit entre ce plan et la doctrine (`docs-doctrine/angeldesk-strategic-pivot.md`, `CLAUDE.md`, `reference.yaml` sections alignées par la cascade 2026-05-20), la doctrine gagne.
- En cas de conflit entre ce plan et le code réel (drift d'implémentation, fichier introuvable, comportement runtime divergent de ce que le plan suppose), Claude documente le drift et demande validation avant patch. Ne pas tenter de réconcilier silencieusement.

## Contexte

La cascade doctrinale 2026-05-20 a aligné le récit produit (`reference.yaml` §§ 3-11, 19-22, 26-34, `CLAUDE.md`, docs-doctrine). Le runtime n'a pas suivi. Le front raconte encore l'ancienne histoire : score + verdict redondants en hero, thesis-gating qui interrompt, claims publics et juridiques non audités, parcours mémo défendable cassé.

Découvertes clés de l'exploration code :

1. `ui-configs.ts` + `pdf-helpers.ts` sont déjà refondus 2 axes (`RECOMMENDATION_CONFIG`, `VERDICT_CONFIG`, `THESIS_VERDICT_CONFIG`, `READINESS_LABELS`, `ALERT_SIGNAL_LABELS`, `recLabel`) tous mappés sur `very_favorable` / `favorable` / `contrasted` / `vigilance` / `alert_dominant`. Le drift n'est pas dans les configs centrales, il est dans les composants UI qui ne les utilisent pas encore.
2. Visualisation 2D inexistante. `ScoreBadge` et `ScoreDisplay` restent mono-axe. C'est un manque, pas un drift à retirer.
3. `Deep Dive` (165 refs, OpenAPI publique) et `Live Coaching` (route page + lib folder) sont coûteux à migrer. `AI Board` (40 refs, route interne) reste discutable mais hors scope refonte. Aucun renommage des labels in-app dans les Phases 1-5.
4. Job-to-be-done de Pauline cassé. Le produit optimise pour verdict-first, pas pour mémo défendable. Export PDF caché derrière dropdown, pas de feedback de génération, pas de chemin guidé.

Star metric finale (post-refonte parcours mémo) : `defensible_memo_export_rate` = dossiers analysés avec PDF complet généré / dossiers analysés. À formaliser dans §33 `metrics_registry.engagement`.

Star metric différée (instrumentation ultérieure) : `memo_used_rate` = part des PDF effectivement téléchargés, partagés, ou ouverts après génération.

Star metric intermédiaire (jusqu'à Phase 3) : 0 claim banni §26 `banned_phrasings_table` / §28 `banned_in_gtm` / §32 `banned_regulatory_claims` sur les surfaces publiques critiques.

---

## Phase 0 — Cadrage En Parallèle

Objectif : figer les décisions pendant que Phase 1 avance. Phase 0 tourne en parallèle ; seule la décision billing bloque la copy de la modal d'achat (subset de Phase 1).

### Décisions À Trancher

- Labels in-app (`Deep Dive`, `Live Coaching`, `AI Board`) : aucun renommage dans les Phases 1-5. Décision marque produit à documenter séparément (mini ADR), pas dans le scope de cette refonte.
- Billing : flow `mailto:` assumé temporairement OU Stripe prioritaire ? Décision bloquante uniquement pour la modal d'achat de crédits, pas pour le reste de Phase 1.
- Mémo PDF : livrable principal ou export annexe ? Si principal, Phase 3 et Phase 4 se coordonnent autour de ce livrable (CTA visible, sortie de parcours, scope export).
- Visualisation : commencer par orientation + solidité textuelle. Quadrant 2D = décision UX séparée, après validation utilisateur en Phase 3.

### Sortie Attendue

- Un mini ADR / brief de 1 page actant ces décisions.
- Aucun refactor côté code.

### Risque

- Décisions retardées sur billing = blocage partiel de la modal d'achat (composant unique). Le reste de Phase 1 avance.

---

## Phase 1 — Public / Legal / Pricing De-risk

Objectif : retirer les claims dangereux visibles. Pas de refonte UX profonde. Ne pas bloquer sur l'audit légal externe : l'audit sert à réintroduire éventuellement des claims, pas à les supprimer.

### Définition "Surface Publique Critique"

Phase 1 couvre exclusivement les surfaces suivantes. Ne pas élargir, ne pas omettre :

- Landing publique : `src/app/page.tsx`
- Page pricing in-app : `src/app/(dashboard)/pricing/pricing-content.tsx`
- Page confidentialité : `src/app/(dashboard)/legal/confidentialite/page.tsx`
- Dialog consentement LinkedIn : `src/components/shared/linkedin-consent-dialog.tsx`
- Route backend enrich qui expose Art. 6.1.f : `src/app/api/deals/[dealId]/founders/[founderId]/enrich/route.ts`
- Modal achat de crédits : `src/components/credits/credit-purchase-modal.tsx` (bloqué par décision billing Phase 0)
- Boutons CTA pricing si wording partagé via composants (à grepper en début de Phase 1)

### Règle Stricte De Réécriture

Ne pas créer de nouvelle doctrine. Phase 1 = supprimer ou neutraliser les claims ; ne pas remplacer par un claim nouveau non présent dans la doctrine (`reference.yaml` §§ 3 + 21 + 26 + 27 + 32 + docs-doctrine). Si une formulation de remplacement n'est pas déjà actée doctrinalement, choisir la formulation minimale (page vide / catégories sèches / contact RGPD).

### À Retirer Ou Reformuler

- "5 analyses gratuites"
- "Commencer gratuitement" si lié à une offre gratuite publique
- "1 Deep Dive offert"
- "20 agents / 41 expertises"
- "Exports compliance / audit trail"
- "Remboursement automatique"
- "Art. 6.1.f" en claim user-facing non audité (dialog + route enrich)
- Claims provider / région / chiffrement non prouvés : "Neon Francfort", "DPA / SCCs", "AES-256-GCM"

### Règle De Remplacement Page Confidentialité

Ne PAS afficher de claims "à confirmer" en public. Page minimale : catégories de traitement, droits utilisateur, contact RGPD, formulation minimale. L'audit légal externe sert à réintroduire éventuellement des claims chiffrement / DPA / région, pas à les supprimer.

### Exit Criteria

- Plus aucun claim banni sur les surfaces Phase 1 (vérifié par render/DOM guards ciblés).
- Flow `mailto:` explicité dans la modal d'achat après décision Phase 0 billing.
- Tests de rendu ciblés vérifient l'absence des chaînes bannies (pas grep global `src/`).

### Risques Restants

- Audit légal externe pas rendu : non bloquant ; la page `legal/confidentialite` reste en mode minimal.
- Risque d'apparaître vide sur certaines surfaces : à arbitrer fichier par fichier (mieux vide que faux).

---

## Phase 2 — Modèle UI Décisionnel

Objectif : définir la nouvelle grammaire produit avant de refondre tous les écrans. Ne pas refondre `tier3-results` tant que cette grammaire n'est pas posée.

### Table De Mapping Legacy → New

| Legacy à retirer / requalifier | New / doctrine | Contexte |
| --- | --- | --- |
| `recommendation` prescriptive (`PASS` / `GO`) | `orientation` (profil de signal) | Tier 3 hero, PDF executive-summary, badges |
| `confidence` décisionnelle (axe scoring user-facing) | Retirée ; `solidité_des_preuves` si donnée backend disponible, sinon "solidité à qualifier" | Hero scoring, Tier 3, vote board, thesis cards |
| `confidence` extraction / document metadata | "Fiabilité d'extraction" / "niveau d'inférence" | Document metadata dialog, extraction audit, ReAct trace viewer |
| `dealbreaker` / `dealbreakers` | "Risque critique" / "condition à examiner" | Tier 3 kill reasons, PDF questions / negotiation |
| `red flag` / `red flags` (label user-facing) | "Signal d'alerte" / "signaux d'alerte" | Early warnings panel, PDF red-flags section, dashboard |
| Score global en hero | Score secondaire / détail dans dimensions | Tier 3 hero, ScoreBadge, PDF score-breakdown |

### À Produire

- `orientation` = profil de signal (`very_favorable` / `favorable` / `contrasted` / `vigilance` / `alert_dominant`) déjà en configs.
- `solidité_des_preuves` = qualité / support des sources. Règle critique : si aucune source de solidité n'est disponible côté backend, afficher "solidité à qualifier" ou ne pas afficher l'axe. Ne pas inventer une solidité pseudo-précise.
- Score numérique = secondaire, déplacé en détail.
- Recommandation prescriptive = remplacée par profil / repères / points à examiner.

### Scope Code Minimal

- `src/lib/ui-configs.ts` (ajouts d'enums solidité si nécessaire ; pas de refonte des enums existants déjà alignés)
- `src/lib/pdf/pdf-helpers.ts` (ajout `proofLabel()`, à utiliser uniquement si solidité fournie)
- `src/components/shared/score-badge.tsx` (refondu ou nouveau composant `OrientationSolidityDisplay`)

### À Éviter

- Pas encore de refonte massive `tier3-results.tsx`.
- Pas de quadrant 2D obligatoire : décision UX séparée (validation utilisateur en Phase 3).
- Ne pas migrer tous les `confidence` mécaniquement (cf. Phase 5).
- Ne pas fabriquer de solidité quand le backend ne la fournit pas.

### Exit Criteria

- Une API UI claire pour afficher orientation + solidité (composant ou pattern documenté).
- `proofLabel()` disponible dans `pdf-helpers.ts`, avec fallback "solidité à qualifier" si donnée absente.
- Score visuellement subordonné dans les nouveaux composants (taille, hiérarchie).

### Risques Restants

- Innovation produit sans benchmark (Orientation × Solidité). Phase 2 limite intentionnellement à orientation + solidité textuelle, pas 2D.
- Si scope code minimal dérape vers refonte Tier 3 : couper.

---

## Phase 3 — Core Results / Pauline Flow

Objectif : rendre l'écran de résultat utile pour Pauline : comprendre, défendre, exporter. Découpé pour éviter un refactor géant.

### Contrainte De Non-régression Fonctionnelle

Tier 3 est critique pour la valeur perçue.

> Aucune suppression de données affichées sans replacement visible. La refonte change la hiérarchie et le wording, jamais la complétude des données disponibles. Toute information actuellement visible (signaux, dimensions, contradictions, questions, risques, conditions, comparables, percentiles, sources) doit rester accessible ; la refonte décide seulement où l'afficher et comment la nommer.

Si une suppression est strictement nécessaire (donnée vraiment redondante ou bannie doctrinalement), elle doit être justifiée explicitement dans le diagnostic du slice et validée séparément.

### 3A — Extraction / Séparation Composants Sans Changer L'UX

Scope :

- `src/components/deals/tier3-results.tsx`
- Centralisation des configs locales (`RECOMMENDATION_BADGE_CONFIG`, `PRIORITY_BADGE_CONFIG`, `OWNER_BADGE_CONFIG`, `MEMO_RECOMMENDATION_CONFIG`) vers `src/lib/ui-configs.ts`.

Travail : split en sous-composants (hero, dimensions, comparative ranking, risques critiques, conditions, skepticism, kill reasons) sans changement visuel ni changement de comportement.

Exit criteria :

- `tier3-results.tsx` réduit à un orchestrateur de sous-composants.
- Configs locales migrées vers `ui-configs.ts`.
- Pas de régression visuelle (test de rendu vs version précédente).

### 3B — Refonte Hero Et Score/Verdict

Scope : sous-composant hero issu de 3A.

Travail :

- Hero = profil de signal + solidité (si fournie) + synthèse sourcée.
- Score numérique déplacé dans la section dimensions, plus en hero.
- Suppression de la redondance score / verdict (un seul affichage).

Exit criteria :

- Pas de `Recommandation: PASS/GO` exposée en hero.
- Pas de score/verdict redondant.
- Pauline lit en 30 secondes : orientation + solidité + synthèse.

### 3C — Contradictions / Questions / Risques Critiques

Scope : sections skepticism, contradictions, questions ouvertes, kill reasons.

Travail :

- Remonter contradictions et questions ouvertes du bas de page vers le niveau des dimensions (cf. §20 `confrontation_mechanisms` : désaccord est une feature).
- Renommer "Kill reasons" / "dealbreakers" → "risques critiques" / "conditions à examiner".
- Thesis-gating : ne pas masquer les preuves, contradictions, questions et raisons de fragilité. Le score peut rester non applicable si la thèse est fragile (gating sur le score doctrinalement acceptable, gating sur les preuves non).

Exit criteria :

- Contradictions / questions / risques visibles sans clic supplémentaire.
- Plus de wording `dealbreaker` user-facing.
- Thesis-gating recadré : preuves et questions toujours visibles, score peut être marqué "non applicable".

### 3D — CTA Mémo PDF

Scope : sortie de `tier3-results` refondu.

Travail :

- CTA principal "Préparer le mémo" visible en sortie d'écran.
- Préparation Phase 4 (route ou modal, selon décision Phase 0).

Exit criteria :

- CTA mémo PDF clairement visible (pas dropdown caché).
- Lien fonctionnel vers le flow mémo (même si la refonte PDF de Phase 4 n'est pas encore terminée).

### Risques Restants Phase 3

- `tier3-results.tsx` est un fichier très large. Découpe 3A → 3B → 3C → 3D conçue pour limiter le risque.
- Tests utilisateur Pauline indispensables après 3B et 3C (au moins 2 responsables d'investissement micro-fonds dans le réseau Sacha).

---

## Phase 4 — Mémo Défendable / PDF

Objectif : faire du PDF un livrable crédible, pas un export caché.

### 4A — Helpers PDF + Labels Communs

Scope :

- `src/lib/pdf/pdf-helpers.ts`
- Audit des labels partagés entre sections PDF (cohérence avec Phase 2 API UI).

Travail :

- Si pas déjà fait en Phase 2 : ajouter `proofLabel()` (avec fallback "solidité à qualifier").
- S'assurer que toutes les sections PDF utilisent les helpers `recLabel()` / `proofLabel()` et les configs `ui-configs.ts`.

Exit criteria :

- Helpers PDF disponibles et utilisés au moins par 1 section pilote.

### 4B — Executive Summary + Score Breakdown

Scope :

- `src/lib/pdf/pdf-sections/executive-summary.tsx`
- `src/lib/pdf/pdf-sections/score-breakdown.tsx`

Travail :

- Retrait "Recommandation" hardcodée + "Score global — Confiance".
- Refonte cover + executive summary en cohérence avec Tier 3 refondu.
- Profil de signal en cover. Score subordonné en breakdown.

Bannis dans le PDF (décisionnel uniquement) :

- "Score global — Confiance"
- "Recommandation" prescriptive
- "Confiance" comme axe décisionnel

À conserver si contextualisé :

- "Fiabilité d'extraction", "Niveau d'inférence" : confidence technique, pas axe décisionnel.

Exit criteria :

- Cover + executive summary cohérent doctrine.
- Score subordonné, pas en hero.

### 4C — Tier 2 / Tier 3 / Early Warnings

Scope :

- `src/lib/pdf/pdf-sections/tier2-expert.tsx`
- `src/lib/pdf/pdf-sections/tier3-synthesis.tsx`
- `src/lib/pdf/pdf-sections/early-warnings.tsx`
- `src/lib/pdf/pdf-sections/red-flags.tsx`

Travail :

- Retrait `LabelValue label="Recommandation"` et `label="Confiance"` hardcodés.
- Utilisation systématique de `recLabel()` + `proofLabel()`.
- Renommer "Red flags" → "Signaux d'alerte" en wording français (concept gardé, anglicisme retiré en label public).

Exit criteria :

- 4 sections cohérentes avec Phase 3 hierarchy.

### 4D — Questions / Negotiation

Scope :

- `src/lib/pdf/pdf-sections/questions.tsx`
- `src/lib/pdf/pdf-sections/negotiation.tsx`

Travail :

- Retrait `dealbreakers` → "risques critiques" / "conditions à examiner".
- Recadrer la section négociation en "Repères de négociation sourcés" (cf. §27 `banned_in_this_section` + §22).

Exit criteria :

- PDF complet aligné doctrine.
- Le mémo peut être montré à un comité d'investissement sans claims oraculaires.

### Preview PDF

Reportée par défaut. Le premier objectif est un parcours mémo défendable visible, pas forcément une preview parfaite. Si la preview dérape techniquement (limites `@react-pdf/renderer`), reporter à un futur slice. CTA "Préparer le mémo" peut exister sans preview live au premier passage.

---

## Phase 5 — Satellites In-app

Objectif : harmoniser Board, Live, thesis, documents, traces.

Surfaces :

- Board views (`vote-board.tsx`, `views/timeline-view.tsx`, `views/chat-view.tsx`)
- Live post-call (`post-call-report.tsx`, `post-call-reanalysis.tsx`)
- Thesis components (`thesis-hero.tsx`, `thesis-review.tsx`, `thesis-revision.tsx`)
- Document metadata / extraction audit (`document-metadata-dialog.tsx`, `document-extraction-audit-dialog.tsx`, `document-attachments-panel.tsx`)
- ReAct trace viewer (`react-trace-viewer.tsx`)
- Term sheet suggestions (`conditions/term-sheet-suggestions.tsx`)
- Early warnings (`early-warnings-panel.tsx`)
- Deck coherence (`deck-coherence-report.tsx`)

### Règle Critique — 3 Familles De Confidence

- Confidence extraction / document metadata : peut rester comme champ technique si bien nommé ("fiabilité d'extraction", "niveau d'inférence"). Ne pas migrer mécaniquement.
- Confidence modèle / vote / Board : à requalifier en solidité / degré d'accord / stabilité du signal.
- Confidence comme axe décisionnel public : à retirer complètement (banni §8).

### Exit Criteria

- Plus de "Confiance" comme label décisionnel central user-facing.
- Les labels techniques restent contextualisés (extraction / inférence / metadata) sans être confondus avec un axe décisionnel.
- "Red flags" user-facing devient majoritairement "signaux d'alerte" en label public (concept gardé).

### Risques Restants

- Risque de remplacer tous les `confidence` par le même mot et casser la précision technique des composants extraction.
- Mitigation : audit composant par composant, classification dans une des 3 familles avant patch.

---

## Phase 6 — Onboarding / Navigation / Polish

Objectif : cohérence produit globale. Découpée parce que l'onboarding first-run n'est pas localisé précisément à date.

### 6A — Localisation Onboarding Et Surfaces First-run

Scope : identifier les écrans first-run (post-signup), tour produit éventuel, états vides, placeholders, exemples dans `src/app/(dashboard)/*` et `src/components/*`. Aucune refonte.

Travail :

- Grep ciblé sur les mentions persona / exemples Marie / onboarding tour.
- Identification du flow first-run actuel (route, composants, providers).
- Inventaire des entry points analyses (création dossier, premiers écrans après signup).

Exit criteria :

- Inventaire écrit du flow first-run actuel.
- Liste des composants à toucher en 6B.
- Décision à acter : refonte onboarding existante OU création d'un nouveau flow first-run.

### 6B — Refonte Onboarding + Navigation + Polish

Scope :

- Sidebar : `src/components/layout/sidebar.tsx`
- Settings : `src/app/(dashboard)/settings/page.tsx`
- Onboarding (selon localisation 6A)
- Credit badge : `src/components/credits/credit-badge.tsx`
- Analysis entry points (selon inventaire 6A)

Changements :

- Recentrer Pauline (cf. §27 `primary_strategic_persona`) sans supprimer Marie `funnel_entry`.
- Labels in-app assumés (cf. Phase 0 décision actée séparément).
- Quick Scan deprecated : décision séparée (cf. §21 `legacy_usage_surfaces_to_audit`), pas refactor opportuniste.

Exit criteria :

- Premier parcours utilisateur cohérent (signup → premier dossier → analyse → mémo PDF).
- Pas de persona BA solo au centre des exemples / placeholders / tour.
- Pas de promesse pricing non alignée dans les écrans onboarding.

---

## Protocole D'Exécution Pour Claude

Pour chaque phase / sous-slice, donner à Claude uniquement la portion courante et imposer :

- Ne touche pas aux phases / slices suivants.
- Ne fais pas de refactor large hors scope.
- Commence par lire les fichiers concernés.
- Retourne :
  1. Diagnostic réel depuis le code (pas extrapolation de la doctrine).
  2. Patch proposé.
  3. Liste des fichiers modifiés.
  4. Validations exécutées (type check, render guards, tests).
  5. Risques restants.

L'utilisateur audite le plan / diff avant que Claude continue au slice suivant.

### Règle De Commit / Slice

Un slice = un commit possible. Ne pas mélanger Phase 1 legal/pricing avec Phase 2 UI model dans un même commit, ni 3A split Tier 3 avec 3B refonte hero. Chaque slice produit un diff cohérent, isolable, auditable, et réversible indépendamment.

### Règle D'Arrêt

Claude s'arrête et demande validation dans les cas suivants, sans tenter de continuer :

1. Fin de slice atteinte : ne pas entamer le slice suivant sans audit utilisateur explicite.
2. Conflit doctrine vs code : tout drift entre ce que le plan suppose et le code réel (fichier introuvable, comportement runtime divergent, label déjà refondu autrement, etc.).
3. Claim doctrine ambigu : si la formulation à appliquer n'est pas explicitement actée dans la doctrine (`reference.yaml` / docs-doctrine / `CLAUDE.md`), Claude ne l'invente pas ; il s'arrête et demande.
4. Scope qui déborde : si le slice révèle qu'un fichier hors scope est aussi affecté, Claude documente et s'arrête, ne touche pas le fichier hors scope.
5. Régression fonctionnelle suspectée : si la refonte d'un slice supprimerait une information utilisateur actuellement visible sans replacement clair, Claude s'arrête et demande arbitrage.
6. Test guard rouge : si un render guard détecte un claim banni ou une chaîne attendue manquante, Claude s'arrête et investigue, ne force pas le passage.

---

## Tests : Render / DOM Guards Ciblés

Snapshot pur = fragile. Préférer tests de rendu ciblés qui vérifient :

- L'absence de chaînes bannies (cf. §26 `banned_phrasings_table` + §28 `banned_in_gtm` + §32 `banned_regulatory_claims`) sur la surface testée.
- La présence des labels doctrinaux attendus (`very_favorable`, `contrasted`, `vigilance`, `signaux d'alerte`, etc.).

Implémentation suggérée :

- React Testing Library + assertions `queryByText` / `getByText` ciblées par surface.
- Word boundaries (`\b...\b`) sur les regex de chaînes bannies (éviter faux positifs sur `password`, `passage`, `Live Coaching` in-app légitime).
- Tests à ajouter dans `__tests__/doctrine-guards/` (à créer en Phase 1).

---

## Risques Cachés Transversaux

### R1. Pauline Vs Marie — Tradeoff GTM

Recentrer Pauline en onboarding peut perdre l'acquisition Marie (`funnel_entry` §27 / §4). À arbitrer côté GTM avant Phase 6.

### R2. Innovation Produit Sans Benchmark

Aucun concurrent (PitchBook, Crunchbase, Dealroom, AlphaSense, Hebbia) ne fait Orientation × Solidité explicitement. Phase 2 limite à orientation + solidité textuelle, quadrant 2D reporté en décision UX séparée.

### R3. PDF Preview Reportée

`@react-pdf/renderer` ne supporte pas preview side-by-side natif. Phase 4 reporte la preview si elle dérape ; le premier objectif est un parcours mémo défendable visible.

### R4. Backend Confidence → Solidité Des Preuves

Les schémas Zod LLM (`thesis-extractor`, `financial-auditor-schema`) demandent encore `confidence: number`. Pas bloquant pour les Phases 2-5 (alias possible côté UI, fallback "solidité à qualifier") mais à inscrire au backlog backend séparé.

### R5. Quick Scan Deprecated

Marqué deprecated dans `types.ts` mais encore utilisé via `deal-limits/index.ts:51`. Décision Phase 6 séparée, pas refactor opportuniste pendant les autres phases.

### R6. Tests Guards Faux Positifs

Grep naïf sur tout `src/` va attraper `password`, `passage`, `Live Coaching` légitime in-app, etc. Utiliser word boundaries + scope par surface (render guards UI/PDF), pas grep global.

### R7. Backend Solidité Non Fournie

Si Phase 3B se déclenche avant que le backend ne fournisse `solidite_des_preuves`, l'UI affiche "solidité à qualifier" ou n'affiche pas l'axe. Ne pas fabriquer de valeur.

---

## Fichiers Critiques Touchés

### Phase 1

- `src/app/page.tsx`
- `src/app/(dashboard)/pricing/pricing-content.tsx`
- `src/app/(dashboard)/legal/confidentialite/page.tsx`
- `src/components/shared/linkedin-consent-dialog.tsx`
- `src/app/api/deals/[dealId]/founders/[founderId]/enrich/route.ts`
- `src/components/credits/credit-purchase-modal.tsx` (post-décision billing Phase 0)
- `__tests__/doctrine-guards/*` (nouveaux)

### Phase 2

- `src/lib/ui-configs.ts`
- `src/lib/pdf/pdf-helpers.ts`
- `src/components/shared/score-badge.tsx` ou nouveau `OrientationSolidityDisplay`

### Phase 3

- 3A : `src/components/deals/tier3-results.tsx` (split) + `src/lib/ui-configs.ts`
- 3B : sous-composants hero issus de 3A
- 3C : sous-composants skepticism / contradictions / questions / kill reasons
- 3D : CTA mémo PDF

### Phase 4

- 4A : `src/lib/pdf/pdf-helpers.ts`
- 4B : `pdf-sections/executive-summary.tsx`, `pdf-sections/score-breakdown.tsx`
- 4C : `pdf-sections/tier2-expert.tsx`, `pdf-sections/tier3-synthesis.tsx`, `pdf-sections/early-warnings.tsx`, `pdf-sections/red-flags.tsx`
- 4D : `pdf-sections/questions.tsx`, `pdf-sections/negotiation.tsx`

### Phase 5

- 3 vues Board AI (`vote-board.tsx`, `views/timeline-view.tsx`, `views/chat-view.tsx`)
- 2 composants Live (`post-call-report.tsx`, `post-call-reanalysis.tsx`)
- 3 composants thesis-* + 3 composants document-* + `react-trace-viewer` + `term-sheet-suggestions` + `early-warnings-panel` + `deck-coherence-report`

### Phase 6

- `src/components/layout/sidebar.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- Onboarding first-run (à localiser)
- `src/components/credits/credit-badge.tsx`

---

## Vérification End-to-end

Après toutes les phases :

- Lancer le dev server (`npm run dev -- -p 3003`), tester chaque parcours utilisateur de bout en bout.
- Render guards ciblés (`__tests__/doctrine-guards/`) sur surfaces user-facing.
- Test PDF rendering sur 3 dossiers réels.
- Test utilisateur final Pauline (2 responsables d'investissement micro-fonds dans le réseau Sacha) après Phase 3B/3C et Phase 4D.
- `npx tsc --noEmit` après chaque slice.
- Render guards permanents en CI : aucune mention de claim banni §26 / §28 / §32 sur surfaces user-facing actives.
