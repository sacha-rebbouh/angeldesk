# Phase A — Inventaire détaillé (Slice A0)

> Produit par A0 le 2026-05-24. Lecture seule côté `src/`. Aucune modification de code.
> Source de vérité : `temp/agents-refonte.md` (plan Phase A), `docs-doctrine/angeldesk-strategic-pivot.md`, `CLAUDE.md`, `docs-private/reference.yaml` §§ 3-11 + 19-22 + 26-34.
> En cas de conflit doctrine vs code réel : drift documenté ici, arrêt sur ce point.

---

## Section 1 — Matrice exhaustive des champs problématiques Tier 3

Colonnes : fichier:ligne — champ — exemple de valeur — problème doctrinal — remplacement proposé — slice cible.

### 1.1 Synthesis Deal Scorer (A2)

| Fichier:ligne | Champ | Exemple | Problème doctrinal | Remplacement | Slice |
|---|---|---|---|---|---|
| `src/agents/tier3/schemas/synthesis-deal-scorer-schema.ts:7` | `verdict: enum(STRONG_PASS\|PASS\|CONDITIONAL_PASS\|WEAK_PASS\|FAIL)` | `"STRONG_PASS"` | Enum prescriptif legacy ; schéma Zod test-only mais contrat de prompt visible | `orientation: enum(very_favorable\|favorable\|contrasted\|vigilance\|alert_dominant)` natif. **D1 verrouillé : aucun `legacyVerdict?` bridge** ; parser tolérant de sortie LLM dégradée dans le même run (lecture seule) uniquement si nécessaire. | A2 |
| `src/agents/tier3/schemas/synthesis-deal-scorer-schema.ts:22-26` | `recommendation: { action: z.string(), conditions: z.array, nextSteps: z.array }` | `action: "investir"` ou `"STRONG_PASS"` ou `"favorable"` | `action: z.string()` libre — pas de validation | `recommendation: { orientation: enum, conditions, nextSteps }` | A2 |
| `src/agents/tier3/synthesis-deal-scorer.ts:726` | Prompt directive "Answer only if you are >90% confident, since mistakes are penalised 9 points..." | Bloc texte injecté au LLM | Auto-évaluation décisionnelle bannie (Famille C, doctrine § 5, reference.yaml § 19) | Retirer ; injecter directives 2-5 anti-hallucination via helpers BaseAgent | A2 |
| `src/agents/tier3/synthesis-deal-scorer.ts:296-728` | Prompt système complet (`buildSystemPrompt()`) | "# ROLE ET EXPERTISE ... STRONG_PASS/PASS/CONDITIONAL_PASS/WEAK_PASS/FAIL ..." | Instruit LLM en sémantique legacy PASS/FAIL ; tokens `STRONG_PASS`, `WEAK_PASS`, `CONDITIONAL_PASS` présents ; `GO/NO-GO` cités lignes 560+ comme exemples à éviter (mais paradoxe avec enum) | Extraire dans `src/agents/tier3/prompts/synthesis-deal-scorer-prompt.ts` (constante exportée — `buildSystemPrompt()` sans param, donc trivial) ; réécrire en orientation native | A2 |
| `src/agents/tier3/synthesis-deal-scorer.ts:1551-1779` | `transformResponse` + `actionMapping` 1557-1568 | Mapping `STRONG_PASS → alert_dominant`, `INVEST → favorable`, etc. | Mapping post-hoc qui compense l'écart entre prompt legacy et output orientation. Drift d'architecture | Conserver (compat lecture LLM dégradé + analyses persistées DB) ; ajouter chemin identité orientation→orientation déjà présent ligne 1564-1568 | A2 |
| `src/agents/tier3/synthesis-deal-scorer.ts:1924` | Commentaire `// Zod schema output fields (from SynthesisDealScorerResponseSchema)` | Référence morte | Suggère un lien runtime qui n'existe pas (schéma Zod test-only) | À reformuler après A2 — documentaire seulement | A2 (cosmétique) |

### 1.2 Devil's Advocate (A3)

| Fichier:ligne | Champ | Exemple | Problème | Remplacement | Slice |
|---|---|---|---|---|---|
| `src/agents/tier3/schemas/devils-advocate-schema.ts:25-28` | `overallAssessment: { verdict: z.string(), topConcerns, recommendation: z.string() }` | `recommendation: "PROCEED"` / `"STOP"` | `verdict` et `recommendation` en `z.string()` libre, sans validation | `riskPosture: enum("light"\|"elevated"\|"critical"\|"structural")` + `signalContribution: Tier3SignalContributionSchema` + `structuralRisks: array(StructuralRiskSchema)` | A3 |
| `src/agents/tier3/devils-advocate.ts:260-482` | Prompt système (`buildSystemPrompt()`) | "# ROLE ET EXPERTISE ... kill reasons ... recommendation: PROCEED\|STOP ..." | "kill reasons" partout dans le prompt (ex. lignes 291, 305-306, 331, 333, 360, 361, 396, 409, 430, 541, 575) ; énum `PROCEED\|STOP` | Extraire dans `src/agents/tier3/prompts/devils-advocate-prompt.ts` ; renommer "kill reasons" → "structural critical risks" ; remplacer énum par `riskPosture` | A3 |
| `src/agents/tier3/devils-advocate.ts:481` | Directive ">90% confident" (identique à SDS) | Bloc texte | Famille C bannie | Retirer ; directives 2-5 | A3 |
| `src/agents/tier3/devils-advocate.ts:39, 832, 954-1000, 963-973` | `KillReason` type + `KillReasonLevel` + `normalizeKillReasons` | `severityToKillReasonLevel: { CRITICAL→ABSOLUTE, HIGH→CONDITIONAL, MEDIUM→CONCERN }` | Vocabulaire prescriptif ("kill", "ABSOLUTE", "dealBreakerLevel") | Renommer sortie en `structuralRisks` + `riskPosture`. **D1 verrouillé** : `normalizeKillReasons` conservé comme **parser tolérant de sortie LLM dégradée dans le même run** (lecture seule, mapping vers `structuralRisks` natif) ; **aucun alias `killReasons` émis en sortie** ; consumers UI/PDF migrés dans le même slice ou listés comme dépendance bloquante. Si rupture inévitable sans patch consumer, documenter et arrêter pour arbitrage. | A3 |
| `src/agents/tier3/devils-advocate.ts:856-872, 1065-1075, 1095` | Derivation de score depuis kill reasons | Code fallback score | OK fonctionnellement (déterministe), terminologie à mettre à jour côté logs | Renommer logs "kill reasons" → "structural risks" ; mécanique conservée | A3 |
| `src/agents/tier3/devils-advocate.ts:230` (interface interne TS) | `recommendation: PROCEED\|PROCEED_WITH_CAUTION\|INVESTIGATE_FURTHER\|STOP` | Type littéral | Sémantique action prescriptive (interne au type, exposé via adapter) | `riskPosture: "light"\|"elevated"\|"critical"\|"structural"` ; renommer en place (type TS interne, pas drift transverse) | A3 |

### 1.3 Memo Generator (A4)

| Fichier:ligne | Champ | Exemple | Problème | Remplacement | Slice |
|---|---|---|---|---|---|
| `src/agents/tier3/schemas/memo-generator-schema.ts:14-18` | `memo.verdict: { recommendation: z.string(), score: number, conditions }` | `recommendation: "very_favorable"` parfois, `"Recommended"` parfois, `"PASS"` parfois | `recommendation: z.string()` libre — incohérence run-to-run | `memo.signalProfile: Tier3SignalContributionSchema` + `memo.score?` secondaire + `memo.conditions` | A4 |
| `src/agents/tier3/memo-generator.ts:224-447` | Prompt système (`buildSystemPrompt()`) | "# ROLE ET EXPERTISE ..." | Inclut éventuellement directives non auditées + format de verdict legacy | Extraire dans `src/agents/tier3/prompts/memo-generator-prompt.ts` ; aligner sur orientation native + `signalProfile` | A4 |
| `src/agents/tier3/memo-generator.ts:446` | Directive ">90% confident" (identique aux autres) | Bloc texte | Famille C bannie | Retirer ; directives 2-5 | A4 |
| `src/agents/tier3/memo-generator.ts:822, 870` | Lecture `killReasons` côté consolidation | `Kill Reasons: ${d.killReasons.length} identifiées` | Vocabulaire prescriptif côté output | Renommer sortie en `criticalRisks`. **D1 verrouillé : aucun alias `killReasons` émis**. Consumers PDF/UI migrés dans le même slice ou listés comme dépendance bloquante. | A4 |
| `src/agents/tier3/memo-generator.ts:863-956` | `extractRedFlagsFromAll` (consolidation déduplication) | Logique de fusion | OK fonctionnellement | Renommer sortie `killReasons` → `criticalRisks` — format natif seul. **D1 verrouillé : aucun alias legacy émis**. Parser tolérant de sortie LLM dégradée dans le même run uniquement si nécessaire, lecture seule, mapping vers format natif. | A4 |

### 1.4 Scenario Modeler (A4)

| Fichier:ligne | Champ | Exemple | Problème | Remplacement | Slice |
|---|---|---|---|---|---|
| `src/agents/tier3/schemas/scenario-modeler-schema.ts:20-25` | `recommendation: { bestScenario, worstScenario, expectedValue, verdict: z.string() }` | `verdict: "Mostly BULL"`, `"BASE dominant"` | `verdict: z.string()` libre | `recommendation: { dominantScenario: enum("BULL"\|"BASE"\|"BEAR"\|"BLACK_SWAN"), expectedValue, signalContribution: Tier3SignalContributionSchema }` | A4 |
| `src/agents/tier3/scenario-modeler.ts:226-407` | Prompt système (`buildSystemPrompt()`) | "# ROLE ET EXPERTISE ..." | À auditer pour cohérence orientation | Extraire dans `src/agents/tier3/prompts/scenario-modeler-prompt.ts` ; règle déterministe `signalContribution.orientation` dérivée des probabilités scenarios | A4 |
| `src/agents/tier3/scenario-modeler.ts:406` | Directive ">90% confident" | Bloc texte | Famille C bannie | Retirer ; directives 2-5 | A4 |

### 1.5 Contradiction Detector (A4-bis)

| Fichier:ligne | Champ | Exemple | Problème | Remplacement | Slice |
|---|---|---|---|---|---|
| `src/agents/tier3/schemas/contradiction-detector-schema.ts:25` | `summary.verdict: z.string()` libre | `"Critical: 2 contradictions ..."` | Non contraint au schéma | Conserver `summary` ; ajouter `signalContribution: Tier3SignalContributionSchema.optional()` | A4-bis |
| `src/agents/tier3/contradiction-detector.ts:146-340` | Prompt système (`buildSystemPrompt()`) | "# ROLE ET EXPERTISE ... alertSignal.recommendation: PROCEED\|...\|STOP ligne 255 ..." | Instruction LLM produit `alertSignal.recommendation: PROCEED\|...\|STOP` | Extraire dans `src/agents/tier3/prompts/contradiction-detector-prompt.ts` ; remplacer par `alertSignal.signalIntensity: low\|elevated\|high\|critical` | A4-bis |
| `src/agents/tier3/contradiction-detector.ts:339` | Directive ">90% confident" | Bloc texte | Famille C bannie | Retirer ; directives 2-5 | A4-bis |
| `src/agents/tier3/contradiction-detector.ts:112` | Bloc `alertSignal: {...}` (interface interne) | Type | Sémantique prescriptive | `alertSignal: { signalIntensity, ... }`. **D1 verrouillé** : aucun alias `recommendation` legacy émis. Parser tolérant de sortie LLM dégradée dans le même run uniquement si nécessaire (lecture seule). | A4-bis |
| `src/agents/tier3/contradiction-detector.ts:521-522, 753, 894-898` | Validation/normalisation `alertSignal.recommendation` (`validateRecommendation()` 968) | `recommendation: "PROCEED" / "STOP"` | Sémantique prescriptive en output | Sortie `signalIntensity` natif seul. **D1 verrouillé : aucun alias `recommendation` legacy émis**. Parser tolérant de sortie LLM dégradée dans le même run uniquement si nécessaire (lecture seule, mapping `PROCEED/...|STOP` → `signalIntensity` natif). | A4-bis |

### 1.6 Conditions Analyst (A4-bis)

| Fichier:ligne | Champ | Exemple | Problème | Remplacement | Slice |
|---|---|---|---|---|---|
| `src/agents/tier3/schemas/conditions-analyst-schema.ts:14, 21, 27, 39` | Sub-enums dimensionnels (`valuation.verdict: UNDERVALUED\|FAIR\|AGGRESSIVE\|VERY_AGGRESSIVE`, `instrument.assessment: STANDARD\|FAVORABLE\|UNFAVORABLE\|TOXIC`, etc.) | enum vals | **Doctrinalement OK** — dimensionnels, pas verdict global | Inchangés | — |
| `src/agents/tier3/conditions-analyst.ts:182-318` | Prompt système (`buildSystemPrompt()`) | "# ROLE ET EXPERTISE ..." | À auditer + retrait `>90% confident` | Extraire dans `src/agents/tier3/prompts/conditions-analyst-prompt.ts` ; remplacer mapping inline `alertSignal` par `signalIntensity` natif. **D1 verrouillé : aucun alias legacy émis**. | A4-bis |
| `src/agents/tier3/conditions-analyst.ts:317` | Directive ">90% confident" | Bloc texte | Famille C bannie | Retirer ; directives 2-5 | A4-bis |
| `src/agents/tier3/conditions-analyst.ts:767, 897` | Émission + normalisation `alertSignal` (mapping inline, **pas** de `validateRecommendation()` ici) | `alertSignal: { recommendation: "INVESTIGATE_FURTHER" / "PROCEED" / ... }` | Sémantique action prescriptive | Mapping inline transformé en builder `signalIntensity` natif. **D1 verrouillé : aucun alias `recommendation` legacy émis** ; pas de factorisation en fonction partagée (éviter couplage) | A4-bis |

### 1.7 Thesis Reconciler (aligné, A5 adapter affichage seulement)

| Fichier:ligne | Champ | Exemple | Problème | Remplacement | Slice |
|---|---|---|---|---|---|
| `src/agents/tier3/thesis-reconciler.ts:30` | `updatedConfidence: z.number().min(0).max(100)` | `82` | Champ runtime nommé "confidence" (Famille B — stabilité/agrégat) | **Champ source intact**. Libellé affiché via adapter `display-aliases.ts` → "Stabilité du verdict mis à jour" | A5 |
| `src/agents/tier3/thesis-reconciler.ts:28-51` | `updatedVerdict: ThesisVerdictSchema` (orientation 5 valeurs) | `"very_favorable"` | **Doctrinalement OK** | Inchangé | — |

### 1.8 Champs intacts en Phase A (mention explicite)

| Champ | Raison | Quand traiter |
|---|---|---|
| `Tier3MetaSchema.confidenceLevel` (`src/agents/tier3/schemas/common.ts:5`) | Famille A (technique) ; utilisé runtime par agents, prompts, types, tests | **Dans `src/agents/`, Phase A scope**, mais **conservé intact en Phase A** (A1 additif strict). Renommage éventuel = chantier post-Phase A dédié, à traiter séparément. |
| `Tier3MetaSchema.dataCompleteness`, `Tier3MetaSchema.limitations` | OK doctrinalement | Inchangés |
| `Tier3ScoreSchema.value`, `Tier3ScoreSchema.breakdown` | OK doctrinalement (dimensionnel) | Inchangés |
| `agents/thesis/schemas.ts` — `ThesisVerdictSchema` (orientation 5 valeurs) | Aligné depuis l'origine | Inchangé |
| `agents/thesis/schemas.ts` — `ThesisAlertSchema.severity/category` | OK doctrinalement | Inchangés |
| Sub-enums dimensionnels `conditions-analyst-schema.ts` (valuation, instrument, protections, governance) | Dimensionnels OK | Inchangés |
| `contradiction-detector-schema.ts.contradictions[].severity` (CRITICAL/HIGH/MEDIUM) | OK doctrinalement | Inchangé |

---

## Section 2 — Classification confidence A/B/C/D (Tier 3 + Thesis + services/thesis)

Familles (cf. plan Phase A §4 et §6-bis) :
- A = technique extraction/parsing/OCR/inférence (conservable, renommage contextuel via adapter affichage)
- B = accord/stabilité framework/lentille (à requalifier via adapter affichage, pas de rename runtime en Phase A)
- C = décisionnelle globale — INTERDITE
- D = interne non user-facing (conservable, à documenter)

### 2.1 Confidence Tier 3

| Fichier:ligne | Occurrence | Famille | Action Phase A |
|---|---|---|---|
| `src/agents/tier3/schemas/common.ts:5` | `Tier3MetaSchema.confidenceLevel: number(0-100)` | A | **Conserver intact** ; libellé adapter UI/PDF Phase 5 si nécessaire (hors Phase A) |
| `src/agents/tier3/synthesis-deal-scorer.ts:725-727` | Prompt directive "Confidence Threshold — Answer only if >90% confident" | **C** | **Retirer** (A2) ; directives 2-5 anti-hallucination |
| `src/agents/tier3/devils-advocate.ts:480-482` | Idem directive cross-agent | **C** | **Retirer** (A3) ; directives 2-5 |
| `src/agents/tier3/memo-generator.ts:445-447` | Idem | **C** | **Retirer** (A4) ; directives 2-5 |
| `src/agents/tier3/scenario-modeler.ts:405-407` | Idem | **C** | **Retirer** (A4) ; directives 2-5 |
| `src/agents/tier3/contradiction-detector.ts:338-340` | Idem | **C** | **Retirer** (A4-bis) ; directives 2-5 |
| `src/agents/tier3/conditions-analyst.ts:316-318` | Idem | **C** | **Retirer** (A4-bis) ; directives 2-5 |
| `src/agents/tier3/devils-advocate.ts` (champ `meta.confidenceLevel` propagé de Tier3MetaSchema) | Interne propagation | A | Inchangé en Phase A |
| `src/agents/tier3/contradiction-detector.ts` (champ interne `confidenceLevel` par contradiction si présent) | Interne | A | Inchangé en Phase A |
| `src/agents/tier3/thesis-reconciler.ts:30` | `updatedConfidence: 0-100` | **B** (agrégat verdict mis à jour) | **Conserver champ source** ; adapter affichage A5 "Stabilité du verdict mis à jour" |

### 2.2 Confidence Thesis (src/agents/thesis/)

| Fichier:ligne | Occurrence | Famille | Action Phase A |
|---|---|---|---|
| `src/agents/thesis/schemas.ts:29` | `FrameworkLensSchema.confidence: number(0-100)` | **B** (stabilité lentille framework — YC, Thiel, Angel-Desk) | **Conserver intact** ; adapter affichage A5 "Stabilité de la lentille framework" |
| `src/agents/thesis/schemas.ts:84` | `ThesisExtractorOutputSchema.confidence: number(0-100)` | **B** (agrégat thèse) | **Conserver intact** ; adapter affichage A5 "Stabilité de la thèse (agrégat)" |
| `src/agents/thesis/types.ts` | Types miroirs des schémas | B | Inchangés |
| `src/agents/thesis/frameworks/yc.ts`, `thiel.ts`, `angel-desk.ts` | Prompts produisant `confidence` lens | B (sortie LLM) | **Dans `src/agents/`, Phase A scope** ; prompts inchangés en Phase A (A5 = adapter affichage uniquement). Requalification éventuelle des prompts = chantier post-Phase A dédié, à traiter séparément. |
| `src/agents/thesis/rebuttal-judge.ts` | Logique BA challenge | B | Inchangé |
| `src/agents/thesis/prompt-formatting.ts` | Formatage prompts | — | Inchangé |

### 2.3 Confidence services/thesis

| Fichier:ligne | Occurrence | Famille | Action Phase A |
|---|---|---|---|
| `src/services/thesis/index.ts:66` | `interface ThesisRecord.confidence: number` | B (interne service) | **Conserver intact**. Hors A5 |
| `src/services/thesis/index.ts:92` | `sortBy?: "createdAt" \| "confidence" \| "verdict"` | B (API querystring) | **Hors `src/agents/**`, hors Phase A agents** ; à traiter séparément (chantier service thesis + API dédié). |
| `src/services/thesis/index.ts:105` | `interface ThesisDTO.confidence: number` | B | Inchangé |
| `src/services/thesis/index.ts:236` | `validatedOutput.confidence` (write Prisma) | B (persistance DB) | **Hors `src/agents/**`, hors Phase A agents** ; à traiter séparément (chantier migration DB Prisma dédié). |
| `src/services/thesis/index.ts:321` | Doc-commentaire "Met a jour le verdict + confidence + reconcileNotes" | B | Inchangé |
| `src/services/thesis/index.ts:349` | `confidence: reconcilerOutput.updatedConfidence` (write Prisma) | B | Inchangé |
| `src/services/thesis/index.ts:668-669` | Tri Prisma `sortBy === "confidence"` | B (API/query) | Inchangé |
| `src/services/thesis/index.ts:695` | `confidence: r.confidence` (mapping output) | B | Inchangé |
| `src/services/thesis/normalization.ts:201-207, 228, 249` | `normalizeThesisEvaluation` calcule moyenne inter-frameworks | B | **Service inchangé en Phase A**. Libellé éventuel via `display-aliases.ts` si Phase 5 expose l'agrégat |

### 2.4 Confidence Prisma (DB)

| Schéma | Champ | Action |
|---|---|---|
| `prisma/schema.prisma:469` | `Thesis.confidence: String?` | **Intact en Phase A**. **Hors `src/agents/**`** — migration éventuelle à traiter séparément (chantier migration DB Prisma dédié). |
| `prisma/schema.prisma:713` | `confidence: Int // 0-100` | Intact. Chantier B |
| Autres `confidence*` Prisma (lignes 570, 870-875, 897, 927, 939, 1102, 1318, 1424, 2031, 2034, 2525, 2594, 2622) | Familles A (technique) ou B (interne) selon contexte | **Intacts en Phase A**. **Hors `src/agents/**`** — classification fine et migration éventuelle à traiter séparément (chantier migration DB Prisma dédié). |

### 2.5 Bilan classification confidence

- **Famille C (à retirer si Phase A inclut la directive dans son scope)** — **dans le périmètre Tier 3 initial** : 6 occurrences identiques (1 par agent Tier 3 modifié) — la directive ">90% confident" copiée verbatim dans `buildSystemPrompt()` de chaque agent. Règle cross-agent §6-bis applicable. **Pour le scope cross-couche global, voir §13 corrigé post-audit** : la directive existe dans **58 fichiers absolus** (Tier 1/2/3/Live/Board = 48 + agent-like/orchestration = 10). Le choix du scope retrait est une décision utilisateur ouverte (§13.4 options i/ii/iii/iv/v/vi).
- **Famille B (à conserver runtime, libellé via adapter)** : thesis + thesis-reconciler + services/thesis. Adapter A5 = `src/services/thesis/display-aliases.ts`.
- **Famille A (intacte)** : `Tier3MetaSchema.confidenceLevel`, EvidenceLedger items `confidence`, document-extractor.
- **Famille D (intacte, documentée)** : confidence interne par contradiction si présent, propagations internes.

---

## Section 3 — Fichiers contenant kill reasons / dealbreaker — classés par slice

### 3.1 Zone PROMPT (à nettoyer via extraction fichier compagnon)

| Fichier:zones | Slice | Action |
|---|---|---|
| `src/agents/tier3/devils-advocate.ts:291, 305-306, 331, 333, 360-361, 396, 409, 430, 541, 575` (prompt système 260-482) | **A3** | Extraire dans `prompts/devils-advocate-prompt.ts` ; renommer "kill reasons" → "structural critical risks" |

### 3.2 Zone LOGIQUE COMPAT (conservée, parser/normalizer/alias)

| Fichier:zones | Slice | Action |
|---|---|---|
| `src/agents/tier3/devils-advocate.ts:39` (`import KillReason`) | A3 | Conservé |
| `src/agents/tier3/devils-advocate.ts:109` (interface field `killReasons: {...}`) | A3 | Conservé en alias output |
| `src/agents/tier3/devils-advocate.ts:832` (`type KillReasonLevel`) | A3 | Conservé (interne au type) |
| `src/agents/tier3/devils-advocate.ts:856-872, 1065-1075, 1095` (derivation score) | A3 | Mécanique conservée ; logs renommés |
| `src/agents/tier3/devils-advocate.ts:954-1000, 963-973, 1025` (`normalizeKillReasons` + sortie `killReasons` alias) | A3 | **Parser bidirectionnel** — conservé. Le fichier agent garde `killReason` en zone compat. |
| `src/agents/tier3/memo-generator.ts:822, 870` (lecture `killReasons` côté consolidation) | A4 | Sortie renommée `criticalRisks` + alias `killReasons` |
| `src/agents/tier3/memo-generator.ts:863-956` (`extractRedFlagsFromAll`) | A4 | Conservé ; sortie renommée |

### 3.3 Zone TYPES partagés

| Fichier:ligne | Slice |
|---|---|
| `src/agents/types.ts:2743, 2909, 3478, 3535-3556, 3598` (`interface KillReason`, `dealbreakers: Dealbreaker[]`, doc) | A1 (types nouveaux additifs) + A3/A4 (aliases sortie) |
| `src/agents/type-modules/tier1.ts:380` (`/** @deprecated Use criticalQuestions */ dealbreakers: Dealbreaker[]`) | A7 (Tier 1 — migration réelle D5 verrouillé ; supprimer `dealbreakers` deprecated dans le même slice que la migration `criticalQuestions`) |
| `src/agents/type-modules/tier3.ts:51-52` (`/** kill reason */ KillReason` interface complète) | A3 (alias) |
| `src/agents/type-modules/tier3.ts:57` (`DevilsAdvocateFindings.killReasons: KillReason[]`) | A3 (alias) |

### 3.4 Zone CONSUMERS (UI, PDF, services, orchestration)

| Fichier:zone | Slice | Action |
|---|---|---|
| `src/components/deals/tier3-results.tsx:527+` (NoGoReasonsCard lit `devilsData.findings.killReasons[].dealBreakerLevel`) | Phase 3C (UI) | **D1 verrouillé : aucun alias émis par Phase A**. Consumer doit lire `criticalRisks` après A3/A4 ; à patcher dans le même slice ou listé comme dépendance bloquante. |
| `src/components/deals/analysis-panel.tsx` (lecture potentielle) | Phase 3 (UI) | Idem |
| `src/components/deals/suivi-dd/use-unified-alerts.ts` (lecture) | Phase 3 (UI) | Idem |
| `src/lib/pdf/pdf-sections/tier3-synthesis.tsx` (lecture `devilsAdvocate.findings.killReasons[]`) | Phase 4C (PDF) | Idem |
| `src/lib/pdf/generate-analysis-pdf.tsx:102` (`dealbreakers: Array<...>`) | Phase 4D (PDF) | Renommage côté UI |
| `src/lib/pdf/pdf-helpers.ts:161, 164` (`absolute_dealbreaker`, `likely_dealbreaker` mapping enum EarlyWarningRecommendation) | A0 inventory + Phase 4 | Hors scope strict Phase A — relié à `EarlyWarningRecommendation` cf. §3.5 |
| `src/services/alert-resolution/alert-keys.ts:32` (`"killReason"` enum key) | A6 (sanitizer EVALUATIVE_KEYS extension) | Conservé en clé legacy ; nouvel `criticalRisk` ajouté |
| `src/agents/orchestration/result-sanitizer.ts:39` (`"killReasons"` dans EVALUATIVE_KEYS) | A6 | Conservé ; ajouter `structuralRisks`, `criticalRisks`, `signalContribution`, `evidenceSolidity` |
| `src/agents/orchestration/finding-extractor.ts:1148-1162` (`dealbreakers` extraction) | A6 ou A7 selon source | Décision ouverte (dépend décision Tier 1 §10.4) |
| `src/agents/orchestration/__tests__/tier3-coherence.test.ts:94` (`killReasons: []` fixture) | A3 | Mise à jour fixture |
| `src/agents/__tests__/sequential-pipeline.test.ts:699, 953`, `src/agents/__tests__/agent-pipeline.test.ts` | A3/A4 | Mise à jour fixtures |

### 3.5 Zone non Tier 3 (Tier 1 / early-warnings / services / live) — **décision ouverte, non tranchée**

> Wording corrigé post-audit Codex : la section initiale intitulée "HORS PHASE A" préjugeait du scope agents pour Tier 1 / Live / Board. Le scope est désormais explicitement **décision ouverte** (cf. §10.4, §13.4, §14.2). Les éléments listés ci-dessous appartiennent à des couches dont l'inclusion dans Phase A n'est pas tranchée.

| Fichier:zone | Statut | Slice |
|---|---|---|
| `src/types/index.ts:148` (`type EarlyWarningRecommendation = "investigate" \| "likely_dealbreaker" \| "absolute_dealbreaker"`) | Type cross-cutting (Tier 1 early-warnings, PDF helpers) — **hors `src/agents/**`** | Hors Phase A agents, à traiter séparément. Dépendance bloquante à inventorier si A7b Tier 1 le consomme. |
| `src/services/negotiation/strategist.ts:81-82, 176, 332, 521-553` (`dealbreakers: CriticalCondition[]` champ persistant nommé "dealbreakers" pour stored data compat — déjà documenté en commentaire) | Service negotiation persistant DB — **hors `src/agents/**`** | Hors Phase A agents, à traiter séparément (chantier service negotiation dédié). |
| `src/agents/orchestrator/types.ts:48, 66, 78, 126` (`EarlyWarning.recommendation: "investigate" \| "likely_dealbreaker" \| "absolute_dealbreaker"`) | Orchestrator early-warnings — **dans `src/agents/orchestrator/`** | Phase A (orchestration). Slice à préciser : A9 ou sous-slice dédié early-warnings. Dépendance bloquante à inventorier avec A7b si Tier 1 émet `dealbreakers` consommé ici. |
| `src/agents/orchestrator/early-warnings.ts:4, 29, 34, 49, 65, 100, 132, 403, 407, 413, 427, 453, 464` (toutes les règles de détection) | Orchestrator early-warnings — **dans `src/agents/orchestrator/`** | Phase A (orchestration). Slice à préciser : A9 ou sous-slice dédié early-warnings. Dépendance bloquante avec A7b. |
| `src/agents/orchestrator/summary.ts:69-70` (lit `dealbreakers` de question-master) | Orchestrator summary — **dans `src/agents/orchestrator/`** | Phase A (orchestration). Dépendance bloquante avec A7b (question-master migration). |
| `src/lib/live/coaching-engine.ts:39` ("dealbreaker" listé dans tokens BANNIS du prompt coaching) | Already-banned côté Live — **hors `src/agents/**`, dans Live exclu D3** | Hors Phase A (Phase B Live Coaching séparée). |
| `src/agents/tier1/question-master.ts:1275-1276, 1347` (compat dealbreakers ↔ criticalQuestions, `dealbreakers: criticalQuestions, // backward compat`) | Tier 1 backward compat — **dans `src/agents/tier1/`** | Phase A — slice A7b (Tier 1 migration). Nettoyage `dealbreakers` backward compat dans le même slice que `signalIntensity`. |
| `src/agents/tier1/schemas/question-master-schema.ts:27` (`dealbreakers: z.array(...)`) | Schéma Tier 1 — **dans `src/agents/tier1/`** | Phase A — slice A7b. |
| `src/scoring/services/agent-score-calculator.ts:307` (`metrics: ["dealbreakers_identified", "risk_coverage"]`) | Scoring metric — **hors `src/agents/**`** | Hors Phase A agents, à traiter séparément (chantier scoring dédié). |
| `src/app/api/negotiation/__tests__/route.test.ts:91, 295`, `src/app/api/negotiation/update/route.ts:111-112` (`strategy.dealbreakers = ...`) | API negotiation tests + endpoint — **hors `src/agents/**`** | Hors Phase A agents, à traiter séparément. |
| `src/lib/agent-error-impact.ts:84` ("kill reasons" dans une string descriptive) | Cosmétique — **hors `src/agents/**`** | Hors Phase A agents, cosmétique UI/error. À traiter séparément. |

**Bilan kill reasons / dealbreaker** : 30+ fichiers touchés au total. Phase A en traite 8 (zone prompt + zone parser de lecture LLM dégradée + types). **D1 verrouillé : aucun alias émis par les agents Phase A modifiés**. Les consumers UI/PDF/services lisant l'ancien champ doivent être migrés dans le même slice (A3/A4) ou listés comme dépendance bloquante avant kickoff. Si rupture inévitable, documenter et arrêter pour arbitrage.

---

## Section 4 — Inventaire consumers Tier 3 (UI + PDF + services internes)

Hérité de l'audit Explore agents (cf. plan Phase A §3). Compilation actualisée.

### 4.1 UI (composants React)

| Composant | Fichier:ligne | Champs Tier 3 lus | Dépendance legacy |
|---|---|---|---|
| `SynthesisScorerCard` | `src/components/deals/tier3-results.tsx:101+` | `overallScore`, `verdict`, `confidence`, `dimensionScores[].score`, `keyStrengths`, `keyWeaknesses`, `criticalRisks`, `investmentRecommendation.action`, `investmentRecommendation.rationale`, `comparativeRanking.*` | Forte : lit `investmentRecommendation.action` (sera l'orientation après A2) + `verdict` + `confidence` |
| `RecommendationBadge` (local) | `src/components/deals/tier3-results.tsx:89, 73-87` (RECOMMENDATION_BADGE_CONFIG hardcodé) | `investmentRecommendation.action` (orientation) | Migration vers `OrientationSolidityDisplay` en Phase 3 |
| `VerdictBadge` (local) | `src/components/deals/tier3-results.tsx:67, 174` | `verdict` string | Migration Phase 3 |
| `ConsistencyAnalysisCard` | `src/components/deals/tier3-results.tsx:655+` | `findings.consistencyAnalysis.overallScore`, `score.value`, `findings.contradictions[].severity` | Faible : lit contradictions + score (OK doctrinalement) |
| `NoGoReasonsCard` | `src/components/deals/tier3-results.tsx:527+` | `devilsData.findings.killReasons[].dealBreakerLevel`, `devilsData.findings.killReasons[].reason`, `scorerData.criticalRisks`, `contradictionData.findings.contradictions[].severity` | **Forte** : `killReasons` (alias maintenu en A3) ; Phase 3C remplacera par `criticalRisks` |
| `MemoGeneratorCard` | `src/components/deals/tier3-results.tsx:820+` | `executiveSummary.recommendation`, `executiveSummary.keyPoints`, `keyRisks[].residualRisk` | Forte : `recommendation` enum orientation (à valider en A4 sortie) |
| `MEMO_RECOMMENDATION_CONFIG` (hardcodé local) | `src/components/deals/tier3-results.tsx:823-831` | Mapping local | À migrer vers `ui-configs.ts` (Phase 3A) |
| `VerdictPanel` | `src/components/deals/verdict-panel.tsx:67` | `score`, `recommendation`, `redFlags[]`, `dimensionScores[]`, `thesisVerdict`, `thesisBypass` | Préparé Phase 2 mais pas branché ; lecteur futur de l'orientation |
| `analysis-panel.tsx` | `src/components/deals/analysis-panel.tsx` | `killReasons` (potentiellement) | A3 alias |
| `suivi-dd/use-unified-alerts.ts` | `src/components/deals/suivi-dd/use-unified-alerts.ts` | `killReasons` (hook UI) | A3 alias |
| `OrientationSolidityDisplay` (créé Phase 2) | `src/components/shared/orientation-solidity-display.tsx` | `orientation` + `evidenceSolidity` (asymétrie respectée) | **Non branché aujourd'hui** — attend producer A2/A3/A4/A4-bis/A6 |

### 4.2 PDF

| Section | Fichier:ligne | Champs Tier 3 lus | Dépendance legacy |
|---|---|---|---|
| `ScoreBreakdownSection` | `src/lib/pdf/pdf-sections/score-breakdown.tsx:22, 27+` | `overallScore`, `verdict`, `confidence`, `scoreBreakdown`, `dimensionScores[]`, `investmentRecommendation.*`, `keyStrengths`, `keyWeaknesses`, `criticalRisks` | Forte : `verdict` + `confidence` + `investmentRecommendation` |
| `Tier3SynthesisSection` | `src/lib/pdf/pdf-sections/tier3-synthesis.tsx:22+` | `findings.contradictions[]`, `findings.consistencyAnalysis`, `findings.dataGaps`, `devilsAdvocate.findings.killReasons[]`, `devilsAdvocate.findings.skepticismAssessment.score` | Forte : `killReasons` (alias A3 maintenu) |
| `ExecutiveSummarySection` | `src/lib/pdf/pdf-sections/executive-summary.tsx:21, 25, 91+` | `executiveSummary.recommendation`, `executiveSummary.keyPoints`, `investmentThesis`, `thesis.evaluationAxes.thesisQuality.verdict` | Forte : `recommendation` enum orientation |
| `RecommendationBadge` PDF | `src/lib/pdf/pdf-components.tsx:595, 616-626` | `recommendation` string (mapping hardcodé 6 valeurs) | Forte ; refactor Phase 4A pour utiliser `recLabel()` |
| `recLabel()` | `src/lib/pdf/pdf-helpers.ts:125` | Mappe `investmentRecommendation.action` orientation → labels FR | OK aligné |
| `proofLabel()` | `src/lib/pdf/pdf-helpers.ts:144` | Mappe `evidenceSolidity` → labels FR PDF | **Pas encore appelé par aucune section** (Phase 4A branchera après A6) |
| `dealbreakers` PDF | `src/lib/pdf/generate-analysis-pdf.tsx:102` | Type local | Renommé Phase 4 |
| `pdf-helpers.ts:161-164` | `absolute_dealbreaker`, `likely_dealbreaker` priorityOrder mapping | `EarlyWarningRecommendation` cross-cutting | Hors Phase A |

### 4.3 Services internes / orchestration

| Service | Fichier:ligne | Lecture Tier 3 | Phase |
|---|---|---|---|
| `result-sanitizer` | `src/agents/orchestration/result-sanitizer.ts:18-60` | `EVALUATIVE_KEYS` strippe `verdict`, `recommendation`, `alertSignal`, `killReasons`, `redFlags`, ... | A6 : ajouter `structuralRisks`, `criticalRisks`, `signalContribution`, `evidenceSolidity` ; **conserver F52/F97 intacts** |
| `result-sanitizer.ts:154-182` | Pattern sanitizer narrative (PASS/GO/STRONG_PASS/WEAK_PASS → "Signaux") | Texte LLM | A6 : ajouter patterns "kill reason" → "risque critique" |
| `finding-extractor` | `src/agents/orchestration/finding-extractor.ts:1148-1162` | Lit `dealbreakers` Tier 1 (question-master) | Décision ouverte (dépend décision Tier 1 §10.4) |
| `orchestrator/summary.ts:69-70` | Lit `dealbreakers` Tier 1 | Décision ouverte (idem) |
| `services/alert-resolution/alert-keys.ts:32` | Enum `"killReason"` clé alert | A6 (ajout clé) |
| `services/chat-context/` | Résumé Tier 3 pour chat | Hors Phase A (consume contrat stable) |
| `services/analysis-results/` | Persistance Tier 3 + lecture | Hors Phase A |
| `services/deals/canonical-read-model.ts` | Lecture verdict via API | Hors Phase A |
| `agents/tier3/synthesis-deal-scorer.ts:1672-1678` | `daResult.findings.skepticismAssessment` (lecture DA cross-agent) | A2 (lecture) ; A3 maintient le champ |

### 4.4 Tests qui touchent ces champs

| Test | Fichier | Action Phase A |
|---|---|---|
| Pipeline sequential | `src/agents/__tests__/sequential-pipeline.test.ts:699, 953` | Mise à jour fixtures avec orientation + alias kill |
| Pipeline agent | `src/agents/__tests__/agent-pipeline.test.ts` | Idem |
| Tier 3 coherence | `src/agents/orchestration/__tests__/tier3-coherence.test.ts:94` | Idem |
| Tier 1 schemas | `src/agents/tier1/schemas/__tests__/schemas.test.ts:366` | Décision Tier 1 ouverte (cf. §10.4 options A/B/C/D + §14.2 — inventaire only, pas de décision pré-établie) |
| Negotiation routes | `src/app/api/negotiation/__tests__/route.test.ts:91, 295` | Hors Phase A |
| Zod schemas | `src/agents/tier3/schemas/__tests__/schemas.test.ts` | **Seul consumer identifié des schémas Zod Tier 3 — test-only** (un test n'est pas un consumer runtime, formulation corrigée post-audit Codex) |

---

## Section 5 — Inventaire complet >90% confident cross-agent (règle §6-bis)

| Fichier:ligne | Texte exact | Slice cible |
|---|---|---|
| `src/agents/tier3/synthesis-deal-scorer.ts:725-727` | `## Anti-Hallucination Directive — Confidence Threshold\nAnswer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.` | **A2** |
| `src/agents/tier3/devils-advocate.ts:480-482` | Identique verbatim | **A3** |
| `src/agents/tier3/memo-generator.ts:445-447` | Identique verbatim | **A4** |
| `src/agents/tier3/scenario-modeler.ts:405-407` | Identique verbatim | **A4** |
| `src/agents/tier3/contradiction-detector.ts:338-340` | Identique verbatim | **A4-bis** |
| `src/agents/tier3/conditions-analyst.ts:316-318` | Identique verbatim | **A4-bis** |

**Constat (périmètre Tier 3 initial)** : la directive est strictement identique mot pour mot dans les 6 agents Tier 3. C'est manifestement un copier-coller. L'agent `src/agents/tier3/thesis-reconciler.ts` n'a pas de bloc `## Anti-Hallucination Directive — Confidence Threshold` dans son `buildSystemPrompt()`.

> **Correction round audit Codex** : la phrase initiale "Aucun agent dans `src/agents/thesis/` ne contient cette directive" était fausse. **`src/agents/thesis/types.ts:254` contient la directive** (embarquée dans la constante exportée `THESIS_ANTI_HALLUCINATION_DIRECTIVES` lignes 250-271, injectée dans tous les prompts thesis). Cette section §5 documente le **périmètre Tier 3 initial** seulement ; pour le scope global cross-couche complet (Tier 1/2/3/Live/Board + agent-like/orchestration = 58 fichiers), **se référer à §13** (mis à jour post-audit Codex).

**Recommandation A0** : la règle cross-agent §6-bis du plan est cohérente. Le guard partagé `__shared__/no-confidence-threshold.guard.test.ts` doit scanner :
- (a) tous les fichiers compagnons `src/agents/tier3/prompts/*.ts` issus de l'extraction A2/A3/A4/A4-bis
- (b) tous les agents `src/agents/tier3/*.ts` (incl. `thesis-reconciler.ts` pour empêcher régression future)

Cible regex : `/>?\s*\b9\d\s*%?\s*confident/i`, `/penalised 9 points/i`, `/Answer only if you are/i`.

---

## Section 6 — Plan d'extraction prompts compagnons par agent

### 6.1 Constat structurel

Tous les agents Tier 3 modifiés en Phase A suivent le **même pattern** :
- Méthode `protected buildSystemPrompt(): string` héritée de BaseAgent
- Retourne directement un template literal `return \`# ROLE ET EXPERTISE\n...\`;`
- **Aucun paramètre runtime injecté dans `buildSystemPrompt()`** (vérifié : signature uniformément `(): string` sans args)
- Le contexte runtime (deal name, previousResults, etc.) est injecté **séparément** via `buildUserPrompt(context: EnrichedAgentContext)` ou équivalent — pas dans le prompt système

**Conséquence** : l'extraction nominale en constante exportée (Option 2 du plan, décision Codex round 2) est **mécaniquement triviale** pour les 6 agents. Pas besoin de builder function avec paramètres ; une simple constante string suffit.

### 6.2 Bornes précises par agent

| Agent | Méthode | Début (ligne) | Fin (ligne) | Taille approx | Extraction cible |
|---|---|---|---|---|---|
| `synthesis-deal-scorer.ts` | `buildSystemPrompt()` | 296 (signature) → 297 (`return \``) | 728 (`;\n  }`) | ~430 lignes prompt | `src/agents/tier3/prompts/synthesis-deal-scorer-prompt.ts` |
| `devils-advocate.ts` | `buildSystemPrompt()` | 260 → 261 | 482 | ~220 lignes | `src/agents/tier3/prompts/devils-advocate-prompt.ts` |
| `memo-generator.ts` | `buildSystemPrompt()` | 224 → 225 | 447 | ~220 lignes | `src/agents/tier3/prompts/memo-generator-prompt.ts` |
| `scenario-modeler.ts` | `buildSystemPrompt()` | 226 → 227 | 407 | ~180 lignes | `src/agents/tier3/prompts/scenario-modeler-prompt.ts` |
| `contradiction-detector.ts` | `buildSystemPrompt()` | 146 → 147 | 340 | ~190 lignes | `src/agents/tier3/prompts/contradiction-detector-prompt.ts` |
| `conditions-analyst.ts` | `buildSystemPrompt()` | 182 → 183 | 318 | ~135 lignes | `src/agents/tier3/prompts/conditions-analyst-prompt.ts` |

### 6.3 Pattern d'extraction recommandé

Forme cible du fichier compagnon (exemple SDS) :

```ts
// src/agents/tier3/prompts/synthesis-deal-scorer-prompt.ts
// Phase A — extraction nominale du prompt système SDS (décision Codex round 2 — fichier compagnon).
// Aucune dépendance contexte runtime ; constante string statique.
// Le code agent (transformResponse, actionMapping legacy, coherence caps, thesis meta-gate)
// reste dans src/agents/tier3/synthesis-deal-scorer.ts.

export const SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT = `# ROLE ET EXPERTISE
...
[contenu réécrit en orientation native, sans STRONG_PASS/WEAK_PASS/CONDITIONAL_PASS,
sans directive >90% confident]
`;
```

Forme cible côté agent :

```ts
// src/agents/tier3/synthesis-deal-scorer.ts
import { SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT } from "./prompts/synthesis-deal-scorer-prompt";

class SynthesisDealScorerAgent extends BaseAgent {
  protected buildSystemPrompt(): string {
    return SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT;
  }
  // ... transformResponse, actionMapping legacy, etc. inchangés
}
```

### 6.4 Risque par agent

| Agent | Risque extraction | Mitigation |
|---|---|---|
| SDS (~430 lignes prompt) | Plus volumineux. Risque : oublier un `${interpolation}` qui dépendrait du contexte. | Vérifier qu'aucune interpolation `${...}` ne référence `this.*` ni paramètres dans le bloc 297-728. Si trouvée, transformer en builder typé. |
| DA, memo, scenario | Modéré (~220 lignes). | Idem. |
| CD, CA | Modéré (~135-190 lignes). | Idem. |

**Recommandation** : avant chaque extraction de slice (A2/A3/A4/A4-bis), `rg "\$\{" src/agents/tier3/<agent>.ts | rg <plage_lignes_prompt>` pour confirmer aucune interpolation contextuelle. Si interpolation présente, basculer sur **builder function typée** (`getSystemPrompt(args: {...}): string`) plutôt que constante. **Fallback marqueurs in-line** documenté dans le plan §7 est l'ultime recours si extraction trop risquée.

### 6.5 Risque transverse — `__tests__` Zod

Le fichier `src/agents/tier3/schemas/__tests__/schemas.test.ts` est le **seul consumer identifié / test-only** des schémas Zod Tier 3 (correction post-audit Codex : un test n'est pas un consumer runtime). Une modification de schéma (A2/A3/A4) doit s'accompagner d'une mise à jour de ce test pour ne pas casser le CI.

---

## Section 7 — Inventaire EvidenceLedger + EvidenceHealthBundle — mapping vers `computeEvidenceSolidity` (A6)

### 7.1 Structures lues (read-only confirmation)

**`EvidenceLedger`** (`src/services/evidence-ledger/index.ts:38-51`) :
```ts
interface EvidenceLedger {
  generatedAt: string;
  coverage: {
    factCount: number;
    documentArtifactCount: number;
    visualArtifactCount: number;
    numericClaimCount: number;
    extractionWarningCount: number;
    externalSourceIssueCount: number;
    lowReliabilityFactCount: number;
  };
  items: EvidenceLedgerItem[]; // {id, kind, label, value, source, location, reliability, confidence, warning}
  warnings: string[];
}
```
Builder : `buildEvidenceLedgerFromContext(context: EnrichedAgentContext): EvidenceLedger` (ligne 53).

**`EvidenceLedgerItem.reliability`** : enum `AUDITED | VERIFIED | DECLARED | PROJECTED | ESTIMATED | UNVERIFIABLE | ARTIFACT_HIGH | ARTIFACT_MEDIUM | ARTIFACT_LOW | SOURCE_HEALTH` (ligne 14-24).

**`EvidenceHealthBundle`** (`src/services/evidence/health-report.ts:131-134`) :
```ts
interface EvidenceHealthBundle {
  report: EvidenceHealthReport;
  byDocument: Record<string, DocumentHealthSummary>;
}
```

**`EvidenceHealthReport`** (ligne 83-87) :
```ts
interface EvidenceHealthReport {
  contradictions: ContradictionFinding[]; // {kind, subject, year, severity: 'HIGH'|'MEDIUM'|'LOW', reason, spreadRatio, signals}
  missing: MissingEvidenceFinding[];      // {kind, severity, message, affectedDocumentIds}
  freshness: FreshnessRollup;             // {countsByKind: Record<StaleWarningKind, number>, total}
}
```

Builder : `buildEvidenceHealthBundle(docContexts: Record<string, DocumentEvidenceContext>): EvidenceHealthBundle` (ligne 175).

### 7.2 Mapping vers `computeEvidenceSolidity` (A6)

Inputs disponibles vs inputs attendus par le contrat A6 (cf. plan §5 et §7) :

| Input attendu plan §5 | Source réelle | Disponible ? | Notes |
|---|---|---|---|
| `documentCoverage` (% claims critiques sourcées) | Pas de champ direct. Dérivable de `ledger.coverage` + `report.missing` | **Partiel** | Heuristique nécessaire : `coverage.factCount > 0 && lowReliabilityFactCount / factCount < seuil` + `report.missing.length === 0` ⇒ "coverage haute". Pas de pourcentage absolu. |
| `contradictionCount` | `report.contradictions.filter(c.severity === "HIGH").length` | **OUI** | Direct |
| `sourceFreshnessDays` (âge médian sources) | Pas disponible. `freshness.countsByKind` donne juste des compteurs de `StaleWarningKind` | **NON** | Approximation possible : `freshness.total === 0` ⇒ "fresh OK" ; sinon "stale présent". Pas d'âge médian. |
| `sourceReliability` (0-100 pondéré) | Dérivable de `items[].reliability` (enum) | **Partiel** | Heuristique : ratio `items.filter(r in ["AUDITED","VERIFIED"]).length / items.length` |

### 7.3 Règles déterministes compatibles avec inputs réels

**Recommandation A0** : adapter les règles plan §5 aux inputs réels disponibles.

```
computeEvidenceSolidity({ ledger, health }):
  // Garde 1 — pas d'inputs ⇒ null (jamais fabriqué)
  if (!ledger || !health) return null;
  if (ledger.items.length === 0) return null;

  // Signaux dérivés (déterministes, lecture seule, jamais score/confidence agrégés)
  const contradictionsCritical = health.report.contradictions
    .filter(c => c.severity === "HIGH").length;
  const contradictionsAll = health.report.contradictions.length;
  const missingCritical = health.report.missing
    .filter(m => m.severity === "HIGH").length;
  const staleTotal = health.report.freshness.total;
  const reliableRatio = ledger.items.length === 0 ? 0
    : ledger.items.filter(i => ["AUDITED","VERIFIED"].includes(i.reliability)).length / ledger.items.length;
  const lowReliabilityRatio = ledger.coverage.factCount === 0 ? 1
    : ledger.coverage.lowReliabilityFactCount / ledger.coverage.factCount;

  // Règles (à figer définitivement en A6 avec utilisateur)
  if (contradictionsCritical >= 2) return "contradictory";
  if (ledger.coverage.factCount === 0 && ledger.coverage.documentArtifactCount === 0) return "insufficient";
  if (lowReliabilityRatio > 0.7 || missingCritical >= 2) return "insufficient";
  if (reliableRatio >= 0.6 && contradictionsAll === 0 && staleTotal === 0) return "strong";
  if (reliableRatio >= 0.4 && contradictionsAll <= 1) return "moderate";
  if (reliableRatio >= 0.2) return "low";
  return null; // jamais fabriqué
```

**Note critique** : ces seuils sont des **propositions** — l'utilisateur tranche en A6. Le critique en A0 : aucune branche ne lit `score`, `overallScore`, `confidenceLevel`, `confidence`, `verdict`, ni aucune sortie LLM agrégée. **Source-guard test verrouille mécaniquement** cette propriété (§9 plan A6).

### 7.4 Gap critique — `documentCoverage` absolu

Le champ "documentCoverage" du plan §5 n'a **pas d'équivalent direct** dans `EvidenceLedger` / `EvidenceHealthBundle`. Seules les heuristiques relatives sont disponibles. **Décision à figer en A6** : soit (a) livrer la version minimale (`contradictory` + `insufficient` + `null` seulement) sans `strong`/`moderate`/`low`, soit (b) accepter les heuristiques relatives proposées en 7.3.

Cf. plan §A6 "Risques" : "Si la structure de `EvidenceHealthBundle` est plus pauvre que prévu, A6 peut livrer un sous-ensemble des règles déterministes et différer le reste à un slice ultérieur."

---

## Section 8 — Inventaire `validateRecommendation()`

### 8.1 Occurrences

| Fichier:ligne | Visibilité | Scope | Action Phase A |
|---|---|---|---|
| `src/agents/tier3/contradiction-detector.ts:968` (définition) | `private` (méthode de classe) | A4-bis cible | Transformer en **parser tolérant de sortie LLM dégradée dans le même run** (lecture seule). Accepte ancien `PROCEED \| PROCEED_WITH_CAUTION \| INVESTIGATE_FURTHER \| STOP` produit par LLM, mappe vers `signalIntensity` (`low \| elevated \| high \| critical`) natif. **D1 verrouillé : aucun ancien champ `recommendation` émis en sortie**. Si un consumer casse, documenter et arrêter pour arbitrage. |
| `src/agents/tier3/contradiction-detector.ts:897` (call site) | Appel local interne | A4-bis | Mise à jour pour produire `signalIntensity` natif. **D1 verrouillé : aucun alias legacy émis**. |
| `src/agents/tier1/competitive-intel.ts:898` (définition) | `private` (méthode de classe) | **Hors A4-bis — traité en A7** (D5 verrouillé : Tier 1 inclus Phase A) | Ne **pas** toucher en A4-bis. Migré en A7 (sous-slice A7b avec les 12 autres agents Tier 1). Aucun couplage à introduire avec la fonction Tier 3 homonyme. |
| `src/agents/tier1/competitive-intel.ts:800` (call site) | Appel local interne | **Hors A4-bis — traité en A7** | À mettre à jour en A7b (migration `signalIntensity` Tier 1) |

### 8.2 Confirmation séparation

- `conditions-analyst.ts` **n'a pas** de `validateRecommendation()`. Le mapping `alertSignal.recommendation` y est inline (lignes 767 + 897). A4-bis transforme ce mapping inline en builder `signalIntensity` natif. **D1 verrouillé : aucun alias legacy émis**. Pas de factorisation dans une fonction partagée (éviter introduction de couplage transverse).

- `competitive-intel.ts` Tier 1 a une fonction privée homonyme indépendante. Aucun import croisé. **Hors A4-bis, traité en A7b** (D5 verrouillé : Tier 1 dans Phase A).

### 8.3 Conclusion §8

Le plan §A4-bis a déjà la bonne formulation après round 5. Confirmation A0 :
- A4-bis modifie **uniquement** `contradiction-detector.ts:968` (fonction privée locale)
- A4-bis modifie **uniquement** le mapping inline `conditions-analyst.ts:767, 897` (pas de fonction)
- A4-bis **ne touche pas** `competitive-intel.ts:898` (Tier 1, hors A4-bis — traité en A7 ; D5 verrouillé : Tier 1 inclus Phase A)

---

## Section 9 — Décisions à trancher utilisateur (3 points)

### 9.1 (a) Stratégie compat legacy pendant la migration — **TRANCHÉ par D1 (cf. §15.1)**

> **OBSOLÈTE — Options A1/A2/A3 ci-dessous rejetées par D1 verrouillé** (cf. §15.1 décisions utilisateur). Aucune compat legacy comme contrainte produit. Breaking change accepté. Les anciens outputs persistés sont obsolètes/régénérables. **Pas de bridge `legacyVerdict`, pas d'alias `killReasons`, pas d'alias `recommendation` legacy**.

Options historiques (rejetées par D1) :

| Option | Description | Statut |
|---|---|---|
| ~~A1 — Bridge `legacyVerdict` 1 release~~ | Schémas/types Phase A acceptent `orientation` + `legacyVerdict?` deprecated. | **REJETÉE D1** |
| ~~A2 — Break strict + backfill DB script~~ | Script Prisma rewriting des analyses historiques. | **REJETÉE D1** (pas de script de purge DB dans un slice technique sans instruction explicite séparée — cf. §15.1) |
| ~~A3 — Break strict sans backfill~~ | Anciennes analyses restent en DB, UI dégradée. | **PARTIELLEMENT alignée avec D1** mais formulation initiale "UI dégradée" insuffisante. La règle finale D1 est : breaking change accepté, output natif uniquement ; si consumer casse, documenter et arrêter pour arbitrage. |

**Recommandation A0 rejetée** : l'ancienne recommandation A1 (bridge legacy) est supersedée par D1 verrouillé. Voir §15.1.

À **trancher utilisateur** : ✓ Tranché (D1).

### 9.2 (b) Périmètre service Solidité dans Phase A

**Options** :

| Option | Description | Sortie A6 |
|---|---|---|
| **B1 — Règles déterministes complètes** *(ambitieux)* | Service livre les 5 valeurs `strong`, `moderate`, `low`, `contradictory`, `insufficient` selon seuils proposés §7.3. Heuristiques relatives (`reliableRatio`, `lowReliabilityRatio`, etc.) en l'absence de pourcentages absolus. | Riche mais sensible aux seuils — risque erreurs de calibration. |
| **B2 — Sous-ensemble minimal** *(conservateur — recommandé)* | Service livre uniquement `contradictory` (si `contradictionsCritical >= 2`) + `insufficient` (si `ledger.items.length === 0` ou `lowReliabilityRatio > 0.7`) + `null` (sinon). Pas de `strong`/`moderate`/`low`. UI affiche orientation seul si solidité `null`. | Risque très faible. Pas de fausse précision. Évolution incrémentale possible. |
| **B3 — Sous-ensemble + 1 valeur "moderate" optionnelle** | B2 + une 3e valeur `moderate` (si pas de contradiction critique ET reliableRatio >= 0.4). Pas de `strong`/`low`. | Intermédiaire. |

**Recommandation A0** : Option B2 (sous-ensemble minimal). Raisons :
- Respecte strictement la doctrine "jamais fabriqué depuis score/confidence".
- Évite de prétendre une précision (strong vs moderate) qu'on ne peut pas justifier sans pourcentages absolus.
- L'asymétrie UI (Phase 2) accepte déjà `null` proprement via `showUnqualified` opt-in.
- Enrichissement à `B1` ou `B3` possible en chantier ultérieur sans refactor des consumers.

À **trancher utilisateur** avant lancement A6.

### 9.3 (c) Tier 1 / Tier 2 / Live / Board dans Phase A — **TRANCHÉ par D3/D5/D6 (cf. §15.3, §15.5, §15.6)**

> **OBSOLÈTE — Options C1/C2/C3/C4 ci-dessous rejetées par D3/D5/D6 verrouillés** (cf. §15.3, §15.5, §15.6 décisions utilisateur). Phase A inclut Tier 1 + Tier 2 + Tier 0 + Chat + Orchestration + helpers (D3/D5/D6). Live et Board sont exclus de Phase A (D3) et seront traités en Phase B séparée — **pas par classification dans Phase A**, par cadrage Phase B dédié.

Options historiques (rejetées par D3/D5/D6) :

| Option | Description | Statut |
|---|---|---|
| ~~C1 — Tier 3 only + Tier 1/Tier 2 reportés~~ | Tier 1/Tier 2/Live/Board en chantier B post-Phase A. | **REJETÉE D5/D6** (Tier 1 et Tier 2 dans Phase A) |
| ~~C2 — Tier 3 + Tier 1 migration~~ | Tier 2 + satellites reportés. | **REJETÉE D6** (Tier 2 aussi dans Phase A) |
| ~~C3 — Tier 3 + Tier 1 + Tier 2~~ | Live/Board satellites reportés à décision séparée. | **PARTIELLEMENT alignée** mais formulation finale D5/D6 inclut aussi Tier 0 + Chat + Orchestration + helpers. Pour Live/Board : D3 verrouille l'exclusion (Phase B). |
| ~~C4 — Tier 3 + inventaire satellites Live/Board seulement~~ | Tier 1/Tier 2 reportés. | **REJETÉE D5/D6** (Tier 1/Tier 2 dans Phase A) ; pour Live/Board : pas de classification en Phase A, cadrage Phase B dédié (D3) |

**Décision tranchée** : ✓ par D3 (périmètre), D5 (Tier 1 dans Phase A), D6 (Tier 2 dans Phase A). Voir §15.3, §15.5, §15.6 pour la formulation finale.

---

## Drifts / incohérences détectés par rapport au plan — **section A0 initiale, supersedée par A0-bis (§§ 10-14)**

> Cette section reflète l'état des constats à la **fin de A0 initial**. Plusieurs assertions ont été corrigées depuis par les rounds d'audit Codex sur A0-bis. Pour l'état corrigé et consolidé, **se référer à §14.1 (validations corrigées)** et **§14.2 (décisions ouvertes consolidées)**.

Confirmations validées (toujours vraies) :
- Schémas Zod Tier 3 sont test-only ✓ (vérifié : `synthesis-deal-scorer.ts:1924` est un commentaire, devils-advocate.ts n'importe pas son schéma — formulation corrigée : seul consumer identifié = test, pas runtime).
- `validateRecommendation()` privée par fichier (confirmé : 2 occurrences indépendantes — `contradiction-detector.ts:968` Tier 3 + `competitive-intel.ts:898` Tier 1, pas de partage).
- EvidenceLedger + EvidenceHealthBundle existent (confirmé).
- `proofLabel()` créé Phase 2 mais aucune section PDF ne l'appelle (confirmé : seul consumer identifié = test).
- Phase 2 commitée en `3be0a39` (confirmé via `git log`).

Constats périmètre Tier 3 initial **corrigés depuis par audit Codex** :
- ~~Directive `>90% confident` cross-agent : 6 agents Tier 3~~ → **scope cross-couche réel : 58 fichiers absolus**, cf. §13 corrigé.
- ~~Aucune incohérence majeure~~ → audit Codex a identifié plusieurs erreurs factuelles bloquantes corrigées dans les rounds A0-bis (Tier 1 = 13 occurrences `>90% confident` documentées, pas 0 ; total cross-couche corrigé de 35 vers 48 vers 58 fichiers ; lignes Tier 2 avec placeholders remplacés par fintech 360, saas 348, spacetech 538 ; wording stale "HORS Phase A" Tier 1 reformulé "décision ouverte" ; phrase "consumer runtime" schémas Zod reformulée "seul consumer identifié / test-only" ; `alertSignal.confidenceLevel` Tier 1 placement erroné corrigé vers MetaSchema partagé `common.ts:29` ; compte Tier 2 héritage 17 corrigé en 16 ; `verdict.confidence` Tier 2 annoncé "12 fichiers" reformulé "9 fichiers / 12 occurrences en 4 catégories sémantiques").

**Point d'attention pour A6** (toujours valable) : le champ `documentCoverage` du plan §5 n'a pas d'équivalent direct dans `EvidenceLedger` / `EvidenceHealthBundle`. Heuristiques relatives proposées §7.3 ou option minimaliste §9.2. À trancher utilisateur.

---

## Sortie A0 — Validations — **section initiale supersedée par §14.1 A0-bis corrigé**

> Section reflétant l'état de A0 initial. Pour l'état actuel des validations post-corrections rounds audit Codex, **se référer à §14.1 (validations A0-bis round corrigé)**.

État A0 initial :
- ✓ Fichier `docs-private/phase-a-inventory.md` existe (ce fichier).
- ✓ Aucune modification de `src/`.
- ✓ Aucun commit.
- ✓ Aucune copie de cet inventaire dans `temp/` (décision Codex).

**Statut historique** : A0 livré en première intention, puis étendu et corrigé via les rounds A0-bis. En attente de validation utilisateur sur les **8 décisions consolidées §14.2** avant lancement A1.

**Hors A0** : le fichier `.gitignore` a une modification non commitée (ajout `/temp/`) — hors scope A0, à ne pas mélanger.

---

# === A0-bis (extension read-only) ===

> Slice A0-bis ajouté à la demande utilisateur après audit Codex de l'A0 initial.
> A0 initial réduisait implicitement le travail "agents" à Tier 3 + Thesis. A0-bis couvre Tier 1 / Tier 2 / Live / Board pour permettre une décision éclairée de scope Phase A.
> **Read-only strict** : aucune modification de `src/`, aucun fichier de test touché, aucun commit. Uniquement ce fichier `docs-private/phase-a-inventory.md`.

## Section 10 — A0-bis Inventaire Tier 1 (13 agents)

### 10.1 Constat structurel commun

> **Correction round suivant audit Codex** : l'A0-bis initial affirmait à tort qu'aucun Tier 1 ne contenait la directive `>90% confident`. C'était un scan défaillant (rg trop large sur "confidence" générique, sans grep ciblé sur le pattern de la directive). Vérification rg ciblée : **les 13 agents Tier 1 contiennent la directive `>90% confident`**. Voir §10.5 ci-dessous pour les 13 occurrences exactes.

Les 13 agents Tier 1 suivent **un pattern uniforme** (vérifié par `rg`) :
- Tous étendent `BaseAgent<XData, XResult>` (cf. signature de classe ligne ~200 de chaque fichier)
- Tous ont `protected buildSystemPrompt(): string` **sans paramètre** (extraction nominale en constante exportée triviale, comme Tier 3)
- Tous ont un schéma Zod associé dans `src/agents/tier1/schemas/<agent>-schema.ts` (13 schémas individuels + `common.ts`)
- Tous ont un champ interne `alertSignal: { recommendation: enum(PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP), ... }` (sans `confidenceLevel` interne — voir correction ci-dessous)
- `confidenceLevel: number(0-100)` est dans le **MetaSchema partagé** (`src/agents/tier1/schemas/common.ts:29`), **pas dans l'`AlertSignalSchema`** (correction post-audit Codex : la formulation initiale "alertSignal contient confidenceLevel" était fausse — c'est le `meta.confidenceLevel` du schéma `common.ts` qui est propagé à tous les agents Tier 1, distinct du champ `alertSignal`)
- Tous ont une validation locale de la `recommendation` LLM (3 patterns détectés : `validateRecommendation()` privée, `normalizeRecommendation()` privée, ou validation inline via `validRecommendations.includes(...)`)
- Tous produisent `redFlags: AgentRedFlag[]` (le terme `redFlag` est structurel partagé, OK doctrinalement côté structure ; le label user-facing "red flag" → "signal d'alerte" est un chantier UI Phase 3/5)
- **Tous les 13 contiennent la directive `>90% confident`** dans leur `buildSystemPrompt()` (cf. §10.5 — copier-coller identique verbatim au Tier 2/3/Live/Board)
- `confidenceLevel: number(0-100)` au schéma `common.ts:29` — Famille A (technique extraction/parsing par dimension d'analyse) propagée à tous

### 10.2 Inventaire par agent (13)

| Agent | Fichier:ligne classe | buildSystemPrompt | Schéma Zod | alertSignal.recommendation (call site) | confidenceLevel | redFlags / dealbreakers / criticalQuestions | Validation `recommendation` LLM | Consumers directs |
|---|---|---|---|---|---|---|---|---|
| `competitive-intel` | `src/agents/tier1/competitive-intel.ts:193` | ligne 204 | `competitive-intel-schema.ts` (964 octets) | ligne 175 (interface) + 800 (call site) | `confidenceLevel: number` ligne 46 | `redFlags: AgentRedFlag[]` (terme structurel) | `validateRecommendation()` **privée** ligne 898 | Tier 3 (synthesis), UI tier1-results, PDF tier1-expert |
| `deck-forensics` | `src/agents/tier1/deck-forensics.ts:200` | ligne 212 | `deck-forensics-schema.ts` (2163 octets — plus volumineux) | ligne 182 + 818-819 | `confidenceLevel: number` ligne 107 | `redFlags: AgentRedFlag[]` lignes 84, 163, 780 | Validation **inline** via `validRecommendations.includes(...)` ligne 818-819 | Idem |
| `financial-auditor` | `src/agents/tier1/financial-auditor.ts:157` | ligne 172 | `financial-auditor-schema.ts` (1776 octets) | ligne 139 + 980-981 | `confidenceLevel: number` ligne 54 | `redFlags: AgentRedFlag[]` lignes 119, 941 | Validation **inline** ligne 980-981 | Idem + benchmark valo Funding DB |
| `team-investigator` | `src/agents/tier1/team-investigator.ts:262` | ligne 277 | `team-investigator-schema.ts` (933 octets) | ligne 244 + 1373-1374 | `confidenceLevel: number` ligne 49 | `redFlags: AgentRedFlag[]` | Validation **inline** ligne 1373-1374 | Idem |
| `market-intelligence` | `src/agents/tier1/market-intelligence.ts:178` | ligne 189 | `market-intelligence-schema.ts` (951 octets) | ligne 164 + 952-953 | `confidenceLevel: number` ligne 42 | `redFlags: AgentRedFlag[]` lignes 144, 915 | Validation **inline** ligne 952-953 | Idem + benchmark marché DB |
| `exit-strategist` | `src/agents/tier1/exit-strategist.ts:254` | ligne 265 | `exit-strategist-schema.ts` (1634 octets) | ligne 240 + 924 | `confidenceLevel: number` ligne 52 | `redFlags: AgentRedFlag[]` schema ligne 39 | `normalizeRecommendation()` **privée** ligne 924 | Idem + comparables exit DB |
| `tech-stack-dd` | `src/agents/tier1/tech-stack-dd.ts:43` | ligne 55 | `tech-stack-dd-schema.ts` (946 octets) | ligne 580 (call site) | (Famille A propagée) | `redFlags: AgentRedFlag[]` schema ligne 17 | Validation **inline** ligne 580 | Idem |
| `tech-ops-dd` | `src/agents/tier1/tech-ops-dd.ts:45` | ligne 57 | `tech-ops-dd-schema.ts` (1280 octets) | ligne 673 (call site) | (Famille A propagée) | `redFlags: AgentRedFlag[]` ligne 641 + schema ligne 27 | Validation **inline** ligne 673 | Idem |
| `legal-regulatory` | `src/agents/tier1/legal-regulatory.ts:219` | ligne 230 | `legal-regulatory-schema.ts` (1805 octets) | ligne 205 + 907-909 | `confidenceLevel: number` ligne 44 | `redFlags: AgentRedFlag[]` lignes 185, 865 | Validation **inline** ligne 907-909 | Idem |
| `gtm-analyst` | `src/agents/tier1/gtm-analyst.ts:241` | ligne 252 | `gtm-analyst-schema.ts` (1517 octets) | ligne 227 + 747 | `confidenceLevel: number` ligne 35 | `redFlags: AgentRedFlag[]` | `normalizeRecommendation()` **privée** ligne 747 | Idem |
| `customer-intel` | `src/agents/tier1/customer-intel.ts:261` | ligne 276 | `customer-intel-schema.ts` (1535 octets) | ligne 242 + 955-956 | `confidenceLevel: number` ligne 45 | `redFlags: AgentRedFlag[]` + `metrics[].result: PASS\|FAIL\|PARTIAL\|NOT_TESTABLE` lignes 625-651 (tag de validation, pas prescription d'investissement) | Validation **inline** ligne 955-956 | Idem |
| `cap-table-auditor` | `src/agents/tier1/cap-table-auditor.ts:333` | ligne 345 | `cap-table-auditor-schema.ts` (1323 octets) | ligne 315 + 938-942 | `confidenceLevel: number` ligne 263 | `redFlags: AgentRedFlag[]` lignes 250, 296, 911 | Validation **inline** ligne 938-942 | Idem |
| `question-master` | `src/agents/tier1/question-master.ts:228` | ligne 248 | `question-master-schema.ts` (1640 octets — contient encore `dealbreakers: z.array(...)` ligne 27) | ligne 210 + 1109-1110 | `confidenceLevel: number` ligne 52 | `criticalQuestions: array` ligne 139 + `redFlags: array` ligne 190 + **`dealbreakers: criticalQuestions` backward compat** ligne 1347, accepte legacy ligne 1275-1276 (`findings.criticalQuestions ?? findings.dealbreakers`) | Validation **inline** ligne 1109-1110 | Idem + lecture `dealbreakers` par `orchestrator/summary.ts:69-70`, `finding-extractor.ts:1148-1162` |

### 10.3 Famille doctrinale du problème par champ Tier 1

| Champ | Famille | Statut doctrinal | Localisation |
|---|---|---|---|
| `alertSignal.recommendation: PROCEED\|PROCEED_WITH_CAUTION\|INVESTIGATE_FURTHER\|STOP` | **Recommandation actionnelle** (C en lecture user-facing si exposé) | Prescriptif, contraire au strate 2 doctrine. F52 strippe avant injection downstream, mais user-facing `tier1-results.tsx` reste exposé | 13 agents Tier 1 + `validateRecommendation()` Tier 1/Tier 3 |
| `meta.confidenceLevel: number(0-100)` (au schéma partagé `src/agents/tier1/schemas/common.ts:29`, **pas dans AlertSignalSchema** — correction post-audit Codex) | A (technique) → en pratique D si non user-facing | Conservable | `schemas/common.ts:29` propagé partout via MetaSchema partagé |
| `confidenceLevel: number(0-100)` (interne meta agent) | A (technique extraction/parsing du LLM) | Conservable, à documenter | 13 interfaces internes |
| `redFlags: AgentRedFlag[]` | Structure OK (sévérité + preuve + impact + question) | **Structure conservable**. Label "red flag" → "signal d'alerte" est un chantier UI (Phase 3/5), pas un drift de contrat | Tier 1 + Tier 3 + types partagés |
| `dealbreakers: Dealbreaker[]` (question-master backward compat) | Champ legacy | À supprimer ou conserver en alias selon décision | `question-master.ts:1347`, schema ligne 27, types `tier1.ts:380` deprecated |
| `criticalQuestions` | Replacement de `dealbreakers` | OK doctrinalement | `question-master.ts:139, 1277+` |
| `customer-intel metrics[].result: PASS\|FAIL\|PARTIAL\|NOT_TESTABLE` | Tag de résultat de test, pas une recommandation d'investissement | OK comme tag analytique. Renommage `testOutcome` lèverait l'ambiguïté nominale | `customer-intel.ts:625-651` |

### 10.5 Inventaire exact directive `>90% confident` Tier 1 (correction round audit Codex)

Pattern verbatim identique aux Tier 2/3/Live/Board : `"Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of \"I don't know\" receives 0 points."`.

| Fichier:ligne | Pattern d'injection |
|---|---|
| `src/agents/tier1/cap-table-auditor.ts:486` | dans `buildSystemPrompt()` |
| `src/agents/tier1/competitive-intel.ts:319` | dans `buildSystemPrompt()` |
| `src/agents/tier1/customer-intel.ts:394` | dans `buildSystemPrompt()` |
| `src/agents/tier1/deck-forensics.ts:321` | dans `buildSystemPrompt()` |
| `src/agents/tier1/exit-strategist.ts:438` | dans `buildSystemPrompt()` |
| `src/agents/tier1/financial-auditor.ts:374` | dans `buildSystemPrompt()` |
| `src/agents/tier1/gtm-analyst.ts:448` | dans `buildSystemPrompt()` |
| `src/agents/tier1/legal-regulatory.ts:404` | dans `buildSystemPrompt()` |
| `src/agents/tier1/market-intelligence.ts:302` | dans `buildSystemPrompt()` |
| `src/agents/tier1/question-master.ts:489` | dans `buildSystemPrompt()` |
| `src/agents/tier1/team-investigator.ts:626` | dans `buildSystemPrompt()` |
| `src/agents/tier1/tech-ops-dd.ts:188` | dans `buildSystemPrompt()` |
| `src/agents/tier1/tech-stack-dd.ts:194` | dans `buildSystemPrompt()` |

**13 occurrences confirmées par `rg -n ">90% confident" src/agents/tier1/`**. Famille C (auto-évaluation décisionnelle bannie). Aucune compatibilité legacy à conserver pour cette directive — son retrait sur Tier 1 est doctrinalement sans ambiguïté, **si l'utilisateur décide de l'inclure dans le scope Phase A** (cf. §13 options i/ii/iii/iv).

### 10.4 Slice future proposée Tier 1 — **sans décider de migration**

> ⚠ Présenté sans recommandation d'exécution. Décision suspendue jusqu'à arbitrage utilisateur (§9.3 corrigé).

**Option Tier 1.A — Pas de migration (statu quo en Phase A)** : Tier 1 reste comme aujourd'hui. F52 continue de stripper avant injection downstream. Chantier B post-Phase A peut traiter si décision utilisateur.

**Option Tier 1.B — Migration uniforme `alertSignal.recommendation` → `alertSignal.signalIntensity`** : 13 agents Tier 1 + leurs schémas Zod + leurs 3 patterns de validation. Émettre `signalIntensity: low\|elevated\|high\|critical` natif. **D1 verrouillé : aucun alias `recommendation` legacy émis** ; consumers migrés dans le même slice ou listés comme dépendance bloquante. Pattern symétrique à A4-bis (CD/CA). Surface : 13 fichiers agents + 13 schémas + types `AgentAlertSignal` partagé (à vérifier où il est défini). Blast radius significatif.

**Option Tier 1.C — Migration `alertSignal` + question-master dealbreakers cleanup** : 1.B + suppression définitive du fallback `findings.dealbreakers` ligne 1275-1276 + de l'alias `dealbreakers: criticalQuestions, // backward compat` ligne 1347. Impact orchestrator/summary.ts (lit `dealbreakers`) et finding-extractor.ts (lit `dealbreakers`).

**Option Tier 1.D — Migration prompts (statu quo `alertSignal`)** : laisser `alertSignal.recommendation` runtime, mais auditer les prompts `buildSystemPrompt()` des 13 Tier 1 pour s'assurer qu'aucune instruction prescriptive future-facing ne soit présente. Plus léger, ne touche pas les contrats. À vérifier en A0-ter ou phase dédiée si choisi.

---

## Section 11 — A0-bis Inventaire Tier 2

### 11.1 Compte réel (vérifié par `rg --files`)

- **Fichiers agents experts** : 22 `*-expert.ts` (1 mismatch potentiel : `general-expert` = fallback ; les 21 autres sont sectoriels)
  - `ai`, `biotech`, `blockchain`, `climate`, `consumer`, `creator`, `cybersecurity`, `deeptech`, `edtech`, `fintech`, `foodtech`, `gaming`, `general`, `hardware`, `healthtech`, `hrtech`, `legaltech`, `marketplace`, `mobility`, `proptech`, `saas`, `spacetech`
- **Fichier de base/contrat** : `src/agents/tier2/base-sector-expert.ts` — définit `SectorExpertOutputSchema` (ligne 23) + `SectorExpertResult` (ligne 699) + `SectorConfig` (ligne 315)
- **Support files** : `types.ts`, `index.ts`, `output-mapper.ts`, `benchmark-injector.ts`, `sector-benchmarks.ts`, `sector-standards.ts`

**Confirmation doctrine vs code** :
- CLAUDE.md mentionne *"21 lentilles spécialisées + general-expert"* → 22 experts. **Confirmé** (22 `*-expert.ts` files).
- Plan Phase A mentionnait parfois *"22 experts"* parfois *"28 experts"* → **22 est le bon chiffre**. Les mentions "28" dans des outputs d'agents Explore antérieurs étaient erronées.

### 11.2 Contrat de base — `base-sector-expert.ts`

`SectorExpertOutputSchema` (`base-sector-expert.ts:23+`) définit un schéma **commun à tous les experts** :
- `sectorFit.verdict: z.enum(["strong", "moderate", "weak", "poor"])` (ligne 26) — verdict de fit sectoriel **dimensionnel**, pas une recommandation d'action. **Doctrinalement OK** (4 valeurs descriptives, pas STRONG_FIT/...).
- `sectorFit.reasoning: z.string()` (ligne 28)
- Sous-champs `verdict: z.string()` libre lignes 157, 185 (oneliner verdict, pricing verdict)
- Pas de `confidence` au niveau top de SectorExpertOutputSchema (vérifier — à confirmer par lecture intégrale du schéma)

### 11.3 Variantes de schéma override par expert — **Niveau 1 : schéma LLM uniquement**

> **Clarification 3 niveaux Tier 2 (correction post-audit Codex round 4)** : il faut distinguer rigoureusement 3 niveaux distincts qui étaient confondus dans les rounds précédents.
>
> - **Niveau 1 — Schéma LLM** : ce que l'agent demande au LLM de retourner (Zod schema). Documenté ici en §11.3.
> - **Niveau 2 — Runtime `result._extended.verdict` émis vers UI/PDF** : ce que l'agent construit dans le champ `_extended` du `SectorExpertResult` retourné (sous-objet typé `ExtendedSectorData`). Documenté en §11.7-corrigé.
> - **Niveau 3 — Consumers UI/PDF** : ce que `tier2-results.tsx` (`VerdictHero` lit `result._extended.verdict` ligne 1091) et `pdf-sections/tier2-expert.tsx` (`ExtendedVerdict` lit `ext?.verdict` ligne 117-118) consomment. Documenté en §11.8-corrigé.
>
> `data.verdict` (champ `SectorExpertData.verdict` dans `types.ts:272-274`) **n'est pas le canal user-facing principal** — il existe au type, mais l'affichage UI/PDF ne le lit pas.
>
> Les 3 niveaux **ne se recoupent pas mécaniquement** — un schéma LLM verdict.recommendation déclaré n'est pas forcément propagé vers `_extended.verdict` (la propagation dépend de la construction du `_extended` par chaque expert ; `output-mapper.ts` n'écrit ni `data.verdict` ni `_extended.verdict`).

**Niveau 1 — 6 experts surchargent le contrat de base avec leur propre `verdict.recommendation` enum LLM** :

| Expert | Schéma LLM surchargé | Variante enum | Caractère |
|---|---|---|---|
| `blockchain-expert.ts:310-311` | `verdict: z.object({ recommendation: z.enum(["STRONG_FIT", "GOOD_FIT", "MODERATE_FIT", "POOR_FIT", "NOT_RECOMMENDED"]), confidence: z.enum(["high", "medium", "low"]) })` | Standard | Fit sectoriel + prescription mixte |
| `fintech-expert.ts:265-267` | Identique standard | Standard | Idem |
| `legaltech-expert.ts:387-389` | Identique standard | Standard | Idem |
| `mobility-expert.ts:337-339` | Identique standard | Standard | Idem |
| `ai-expert.ts:163` | `recommendation: z.enum(["STRONG_AI_PLAY", "SOLID_AI_PLAY", "AI_CONCERNS", "NOT_REAL_AI"])` | **Variante AI** (4 valeurs domaine) | Recommandation orientée tech AI plutôt que fit sectoriel |
| `cybersecurity-expert.ts:188` | `recommendation: z.enum(["STRONG_SECURITY_PLAY", "SOLID_SECURITY_PLAY", "SECURITY_CONCERNS", "AVOID"])` | **Variante Security** | Idem AI mais domaine sécurité, dernier mot "AVOID" plus directif que "NOT_REAL_AI" |

**16 experts restants** (biotech, climate, consumer, creator, deeptech, edtech, foodtech, gaming, general, hardware, healthtech, hrtech, marketplace, proptech, saas, spacetech) **n'ont pas de surcharge de schéma verdict LLM**. Ils utilisent le contrat de base `SectorExpertOutputSchema` avec `sectorFit.verdict: strong|moderate|weak|poor` (dimensionnel). Exemples :
- `saas-expert.ts:150` : `verdict: z.enum(["attractive", "fair", "stretched", "excessive"])` — c'est un verdict **pricing/valuation** sectoriel local (pas un verdict global d'investissement), différent de `sectorFit.verdict`.
- `general-expert.ts:180` : `verdict: z.enum(["attractive", "fair", "stretched", "excessive", "cannot_assess"])` — idem pricing.
- `general-expert.ts:135` + `fintech-expert.ts:70/76/82` : `verdict: z.string()` libre dans sous-sections (one-liner free-form, OK structurellement).

> **Important** : ces 16 experts n'ayant pas de schéma LLM `verdict.recommendation`, leur éventuel `_extended.verdict` émis vers UI/PDF est nécessairement **dérivé d'autre chose** (score, transformations locales) — voir §11.7.

### 11.4 Confidence Tier 2

`confidence: z.enum(["high", "medium", "low"])` — **correction post-audit Codex** : présent dans **9 fichiers distincts (12 occurrences au total)**, classés en 3 catégories sémantiques distinctes :

**(a) Catégorie 1 — `verdict.confidence` global (schéma override `verdict.recommendation`)** — 4 fichiers, 4 occurrences :
- `src/agents/tier2/blockchain-expert.ts:312` (suite à `verdict.recommendation: STRONG_FIT/...` ligne 311)
- `src/agents/tier2/fintech-expert.ts:267` (idem)
- `src/agents/tier2/legaltech-expert.ts:389` (idem)
- `src/agents/tier2/mobility-expert.ts:339` (idem)

**(b) Catégorie 2 — `confidence` de sous-objets sectoriels** (typiquement claims / metrics / signaux dans des sous-schémas locaux à l'expert) — 4 fichiers, 7 occurrences :
- `src/agents/tier2/saas-expert.ts:66, 71` (2 occurrences — sous-objets pricing/metrics)
- `src/agents/tier2/edtech-expert.ts:73, 78` (2 occurrences — sous-objets)
- `src/agents/tier2/hrtech-expert.ts:75, 85` (2 occurrences — sous-objets)
- `src/agents/tier2/foodtech-expert.ts:78` (1 occurrence — sous-objet)

**(c) Catégorie 3 — `confidence` de benchmark** — 1 fichier, 1 occurrence :
- `src/agents/tier2/general-expert.ts:39` (explicitement `.describe("Confiance dans ce benchmark")`)

**(d) Catégorie 4 — mappings runtime du sous-champ `confidence` du verdict exposé UI/PDF** :
- `types.ts:272-274` déclare `SectorExpertData.verdict.confidence`, mais ce **n'est pas le canal principal UI/PDF** — l'affichage du verdict Tier 2 passe par `result._extended.verdict` (cf. §11.7).
- `output-mapper.ts` **ne mappe ni `data.verdict`, ni `_extended.verdict`, ni `verdict.confidence`** (la seule mention de `verdict` ligne 138 lit `executiveSummary.verdict` string pour construire `executiveSummary`, hors champs `verdict.*`).
- Les mappings runtime pertinents passent par `_extended.verdict.confidence` chez les experts qui construisent `_extended` localement (par exemple `blockchain-expert.ts:1027` propage `parsedOutput.verdict` complet, incluant la sous-clé `confidence` du schéma override ; les autres experts qui construisent `_extended.verdict` par dérivation peuvent ou non émettre une sous-clé `confidence` — à vérifier expert par expert en A0-ter).
- Pas une définition supplémentaire de schéma Zod ; à classifier séparément si migration ultérieure.

**Total Zod schéma confidence enum Tier 2** : 9 fichiers / 12 occurrences (vs annoncé erroné "12 fichiers" — 9 fichiers est le compte de fichiers distincts ; 12 est le compte d'occurrences cumulées).

**Famille doctrinale** : **B** (stabilité/accord sur le fit secteur ou sur un sous-objet). Pas un axe décisionnel global. Nom `confidence` ambigu — pourrait être requalifié contextuellement (ex. `fitStability` pour catégorie 1, `claimStability` ou `metricStability` pour catégorie 2, `benchmarkStability` pour catégorie 3). Migration uniforme non triviale : décision à figer par catégorie avant tout patch.

### 11.5 Directive `>90% confident` Tier 2 — **présente dans TOUS les fichiers expert**

| Fichier | Ligne | Texte |
|---|---|---|
| `src/agents/tier2/ai-expert.ts:399` | Identique verbatim Tier 3 |
| `src/agents/tier2/base-sector-expert.ts:518` | Identique |
| `src/agents/tier2/biotech-expert.ts:495` | Identique |
| `src/agents/tier2/blockchain-expert.ts:622` | Identique |
| `src/agents/tier2/climate-expert.ts:414` | Identique |
| `src/agents/tier2/consumer-expert.ts:431` | Identique |
| `src/agents/tier2/creator-expert.ts:459` | Identique |
| `src/agents/tier2/cybersecurity-expert.ts:416` | Identique |
| `src/agents/tier2/deeptech-expert.ts:389` | Identique |
| `src/agents/tier2/edtech-expert.ts:429` | Identique |
| `src/agents/tier2/fintech-expert.ts:360` | Identique |
| `src/agents/tier2/foodtech-expert.ts:428` | Identique |
| `src/agents/tier2/gaming-expert.ts:471` | Identique |
| `src/agents/tier2/general-expert.ts:362` | Identique |
| `src/agents/tier2/hardware-expert.ts:999` | Identique |
| `src/agents/tier2/healthtech-expert.ts:349` | Identique |
| `src/agents/tier2/hrtech-expert.ts:483` | Identique |
| `src/agents/tier2/legaltech-expert.ts:523` | Identique |
| `src/agents/tier2/marketplace-expert.ts:379` | Identique |
| `src/agents/tier2/mobility-expert.ts:428` | Identique |
| `src/agents/tier2/proptech-expert.ts:444` | Identique |
| `src/agents/tier2/saas-expert.ts:348` | Identique |
| `src/agents/tier2/spacetech-expert.ts:538` | Identique |

→ **23 fichiers Tier 2 sur 23** contiennent la directive (incl. `base-sector-expert.ts:518`). Cross-couche confirmée : la règle Phase A §6-bis du plan était sous-estimée (focalisée sur Tier 3 seul). Voir §13 mise à jour scope cross-couche.

### 11.6 Prompts Tier 2 — structure d'extraction

Tous les Tier 2 utilisent **un pattern différent de Tier 1/Tier 3** : la fonction est **`function buildSystemPrompt(stage?: string): string` au niveau module** (pas méthode de classe). Vérifié pour saas, foodtech, cybersecurity, general, hrtech, ai, edtech, proptech, ... Signature variable :
- Avec paramètre : `buildSystemPrompt(stage: string)` (ex. `saas-expert.ts:285`, `ai-expert.ts:326`, `cybersecurity-expert.ts:349`, etc.)
- Sans paramètre : `buildSystemPrompt()` (ex. `general-expert.ts:251`)

→ Extraction nominale en **fichier compagnon** moins triviale qu'en Tier 3 : si signature paramétrée, devient une **fonction builder typée** `getSystemPrompt(args: { stage: string }): string`. Pas un blocker, mais à figer par expert.

### 11.7 Runtime `result._extended.verdict` — canal réel UI/PDF — **Niveau 2 corrigé post-audit Codex round 5**

> **Correction d'une erreur factuelle bloquante (cumulée sur rounds précédents)** : le canal user-facing du verdict Tier 2 **n'est pas `data.verdict` / `SectorExpertData.verdict`**, c'est `result._extended.verdict`. L'erreur du round 4 était de croire que les consumers UI/PDF lisaient `data.verdict` ; ils lisent en réalité `result._extended.verdict`.
>
> Vérifié par lecture directe :
> - `src/components/deals/tier2-results.tsx:117` : `_extended?: ExtendedSectorData` (champ du type result)
> - `src/components/deals/tier2-results.tsx:1061` : `const extended = result._extended`
> - `src/components/deals/tier2-results.tsx:1091` : `<VerdictHero verdict={extended.verdict} sectorScore={data.sectorScore} />`
> - `src/lib/pdf/pdf-sections/tier2-expert.tsx:39` : `const ext = result._extended as Record<string, unknown>`
> - `src/lib/pdf/pdf-sections/tier2-expert.tsx:62` : `<ExtendedVerdict ext={ext} />`
> - `src/lib/pdf/pdf-sections/tier2-expert.tsx:117-118` : `function ExtendedVerdict({ ext }: { ext?: ... })` lit `ext?.verdict`
>
> **Conséquence majeure** : le verdict LLM (ou dérivé) Tier 2 arrive bien à l'UI et au PDF via `_extended.verdict`. L'affirmation du round 4 que "les 4 experts standard (blockchain, fintech, legaltech, mobility) perdent leur verdict en route" est **fausse** — ils le placent dans `_extended.verdict`, qui est précisément le canal user-facing.

**Inventaire vérifié des experts qui émettent `result._extended.verdict` (Niveau 2 corrigé)** :

| Expert | Ligne `_extended` | Source du verdict | Niveau 1 schéma LLM verdict.recommendation ? |
|---|---|---|---|
| `src/agents/tier2/blockchain-expert.ts:1054` (`_extended: extendedData`, où `extendedData.verdict = parsedOutput.verdict` ligne 1027) | LLM | **LLM** (schéma `verdict.recommendation: STRONG_FIT/...` ligne 311) | ✓ Oui (Standard) |
| `src/agents/tier2/fintech-expert.ts:703` (`_extended: { ..., verdict: parsedOutput.verdict, ... }` cf. ligne 708 pour assignment précis) | LLM | **LLM** (schéma `verdict.recommendation: STRONG_FIT/...` ligne 266) | ✓ Oui (Standard) |
| `src/agents/tier2/legaltech-expert.ts:894` (`_extended: { ..., verdict: parsedOutput.verdict, ... }` ligne 909) | LLM | **LLM** (schéma `verdict.recommendation: STRONG_FIT/...` ligne 388) | ✓ Oui (Standard) |
| `src/agents/tier2/mobility-expert.ts:820` (`_extended: { ..., verdict: parsedOutput.verdict, ... }` ligne 847) | LLM | **LLM** (schéma `verdict.recommendation: STRONG_FIT/...` ligne 338) | ✓ Oui (Standard) |
| `src/agents/tier2/ai-expert.ts:856` (`_extended: buildExtendedData(parsedOutput, ...)`, verdict construit/transformé en `aiVerdict` ligne 726) | LLM (variante AI) | **LLM** (schéma `recommendation: STRONG_AI_PLAY/...` ligne 163) | ✓ Oui (Variante AI) |
| `src/agents/tier2/cybersecurity-expert.ts:820` (`_extended: buildExtendedData(parsedOutput, ...)`, verdict via transformation security ligne 667) | LLM (variante Security) | **LLM** (schéma `recommendation: STRONG_SECURITY_PLAY/.../AVOID` ligne 188) | ✓ Oui (Variante Security) |
| `src/agents/tier2/creator-expert.ts:676` (`_extended: extendedData`, verdict ligne 652-654 `recommendation: sectorScore >= 70 ? "GOOD_FIT" : ...`) | **Dérivé du score** | **Dérivation runtime**, pas LLM | ✗ Non (pas de schéma override) |
| `src/agents/tier2/general-expert.ts:1052` (`_extended: { ..., verdict: ... }` ligne 1091, mix pricing `valuationAnalysis.verdict` + dérivation) | Mappé/dérivé | Construction interne (mélange pricing `valuationAnalysis.verdict === "cannot_assess" ? "fair" : ...` + dérivation) | ✗ Non |
| `src/agents/tier2/hrtech-expert.ts:864` (`_extended: { ..., verdict: ... }` ligne 897) | Dérivé/mappé | Construction interne | ✗ Non |
| `src/agents/tier2/proptech-expert.ts:855` (`_extended: { ..., verdict: ... }` ligne 889, cf. aussi `valuationAnalysis.verdict` ligne 872) | Mix valuation + dérivation | Construction interne | ✗ Non |

**Croisements Niveaux 1 / 2 corrigés (post-round 5)** :

- **N1 ∩ N2 (schéma LLM ET _extended.verdict émis vers UI/PDF)** : **6 experts** — `blockchain`, `fintech`, `legaltech`, `mobility`, `ai-expert`, `cybersecurity-expert`. **Tous** les experts ayant un schéma LLM `verdict.recommendation` override émettent aussi via `_extended.verdict`. Le verdict LLM arrive bien à l'UI/PDF pour ces 6 experts.
- **N1 \ N2 (schéma LLM mais pas dans `_extended.verdict`)** : **0 expert** — l'affirmation du round 4 que blockchain/fintech/legaltech/mobility "perdent leur verdict en route" est rétractée.
- **N2 \ N1 (`_extended.verdict` émis sans schéma LLM `verdict.recommendation` override)** : **4 experts** — `creator-expert` (dérivé score), `general-expert`, `hrtech-expert`, `proptech-expert` (dérivés/mappés en construction interne).
- **Total runtime `_extended.verdict` émis vers UI/PDF (Niveau 2)** : **10 experts** vérifiés.

**Experts qui n'émettent pas `_extended.verdict`** : 12 experts (22 total − 10 vérifiés) — à confirmer en A0-ter si nécessaire. Pour les agents `biotech-expert`, `climate-expert`, `consumer-expert`, `deeptech-expert`, `edtech-expert`, `foodtech-expert`, `gaming-expert`, `hardware-expert`, `healthtech-expert`, `marketplace-expert`, `saas-expert`, `spacetech-expert`, le contenu exact de leur `_extended` (s'il existe) est **à vérifier**, pas affirmé.

**Helpers de `output-mapper.ts`** : `mapMaturity`, `mapAssessment`, `mapSeverity`, `mapCompetition`, `mapConsolidation`, `mapBarrier` (lignes 16-50) — opèrent sur d'autres champs (maturity, assessment, severity, etc.). `output-mapper.ts` **ne renseigne ni `data.verdict` ni `_extended.verdict`**. La seule mention de `verdict` ligne 138 lit `executiveSummary.verdict` (string libre) pour construire le champ `executiveSummary` de la sortie. `index.ts` idem.

**Conséquence pour le drift** : le drift "verdict.recommendation prescriptif" atteint user-facing UI/PDF via **10 experts** qui émettent `_extended.verdict` (Niveau 2 corrigé). 6 d'entre eux (les 4 standard + AI + Cybersecurity) ont une chaîne LLM → `_extended.verdict` → UI complète. 4 d'entre eux (creator, general, hrtech, proptech) le construisent par dérivation locale. **Le `AVOID` de `cybersecurity-expert` arrive bien jusqu'à l'UI/PDF.**

### 11.8 Consumers Tier 2 directs — **Niveau 3 corrigé post-audit Codex round 5**

| Consumer | Fichier:ligne | Lecture | Comportement si `_extended.verdict` absent |
|---|---|---|---|
| UI | `src/components/deals/tier2-results.tsx:1061` (`const extended = result._extended`) + ligne 1091 (`<VerdictHero verdict={extended.verdict} ... />`) | **`result._extended.verdict`** (le composant `VerdictHero` consomme le sous-champ `verdict` de `extended`). Le champ `data.verdict` du type `SectorExpertData` existe mais n'est pas le canal principal lu par cette UI. | Si `extended` ou `extended.verdict` absent → `VerdictHero` ne rend pas le badge verdict |
| PDF | `src/lib/pdf/pdf-sections/tier2-expert.tsx:39` (`const ext = result._extended as Record<string, unknown>`) + ligne 62 (`<ExtendedVerdict ext={ext} />`) + ligne 117-118 (`function ExtendedVerdict({ ext })` lit `ext?.verdict`) | **`result._extended.verdict`** via composant `ExtendedVerdict` | Idem |
| Tier 3 synthesis | `src/agents/tier3/synthesis-deal-scorer.ts` (`previousResults["sector-expert"]`) | Lit l'output Tier 2 brut, **peut accéder à `result._extended.verdict`** ainsi qu'à `data.verdict` si présent. F52 strippe les évaluations `verdict`/`recommendation` côté flux interne sauf si `skipSanitization` ; Tier 3 accède au full via F97 | Comportement détaillé à confirmer en A0-ter sur quels sous-champs Tier 3 utilise réellement |
| Tests | `src/agents/tier2/__tests__/...` (lecture à confirmer en A0-ter) | Tests d'intégration | — |

**Canal user-facing principal Tier 2** : `result._extended.verdict`, **pas `data.verdict`** (le doc précédent affirmait à tort que UI/PDF lisaient `data.verdict?.recommendation`). Le verdict LLM des 6 experts N1 (blockchain, fintech, legaltech, mobility, ai, cybersecurity) **arrive bien à l'UI/PDF via `_extended.verdict`**. Les 4 experts N2-only (creator, general, hrtech, proptech) y arrivent aussi par construction interne dérivée. Total : **10 experts vérifiés exposent le verdict user-facing**, cf. §11.7.

### 11.9 Distinction "fit sectoriel" acceptable vs wording ambigu

**Doctrinalement OK** :
- `sectorFit.verdict: strong\|moderate\|weak\|poor` (contrat de base) — verdict descriptif, pas prescriptif
- Sub-verdicts pricing/valuation (`attractive\|fair\|stretched\|excessive`) — dimensionnels
- `confidence: high\|medium\|low` — stabilité/accord, pas axe décisionnel

**Wording ambigu** :
- `verdict.recommendation: STRONG_FIT\|GOOD_FIT\|MODERATE_FIT\|POOR_FIT\|NOT_RECOMMENDED` (4 experts en variante standard côté **schéma LLM Niveau 1** : blockchain, fintech, legaltech, mobility) — sémantique fit-secteur OK, mais le **nom `recommendation`** collisione avec Tier 1 `alertSignal.recommendation` (action). Renommage `sectorFitAssessment` lèverait l'ambiguïté. **Note Niveau 2 corrigée post-round 5** : ces 4 experts standard **émettent bien leur verdict LLM vers UI/PDF via `_extended.verdict`** (cf. §11.7 corrigé). L'ambiguïté nominale est exposée user-facing pour ces 4 experts comme pour `ai-expert` et `cybersecurity-expert` (chaîne LLM → `_extended.verdict` → UI complète pour les 6).
- `recommendation: STRONG_AI_PLAY\|SOLID_AI_PLAY\|AI_CONCERNS\|NOT_REAL_AI` (ai-expert) — sémantique tech-fit OK
- `recommendation: STRONG_SECURITY_PLAY\|SOLID_SECURITY_PLAY\|SECURITY_CONCERNS\|AVOID` (cybersecurity-expert) — `AVOID` est **plus directif** que les autres variantes ; à interroger doctrinalement

**Cross-couche directive `>90% confident`** : 23/23 fichiers Tier 2 — drift majeur déjà documenté §11.5, à inclure dans toute décision Phase A même si Tier 2 n'est pas migré.

### 11.10 Slice future proposée Tier 2 — **sans décider de migration, options revues 3 niveaux (canal réel `_extended.verdict`)**

> ⚠ Présenté sans recommandation d'exécution. Options revues post-audit Codex round 5 pour refléter le canal user-facing réel : `result._extended.verdict` (pas `data.verdict`).

**Option Tier 2.A — Pas de migration de schéma** : statu quo. Si choix doctrine est "fit sectoriel = OK", aucun travail. Note corrigée : le verdict des 6 experts N1 (blockchain, fintech, legaltech, mobility, ai, cybersecurity) **arrive bien à l'UI/PDF via `_extended.verdict`** ; l'impact user-facing du drift `verdict.recommendation` est **plus important que ne le suggéraient les rounds précédents** (10 experts émettent vers `_extended.verdict`).

**Option Tier 2.B — Renommage `recommendation` → `sectorFitAssessment` au schéma LLM (Niveau 1)** : 6 experts surchargent leur schéma LLM (blockchain, fintech, legaltech, mobility, ai, cybersecurity). Coût : 6 fichiers + types `SectorExpertOutput` (par expert). **Impact UI/PDF immédiat pour les 6**, parce que leur verdict LLM arrive jusqu'à `_extended.verdict` consommé par `VerdictHero` (UI) et `ExtendedVerdict` (PDF). Renommage doctrinal du schéma LLM avec changement visible côté UI pour les 6 experts.

**Option Tier 2.B-bis — Renommage `verdict` côté runtime `_extended.verdict` (Niveau 2)** : modifier la construction de `_extended.verdict` (et `extendedData.verdict` correspondant) chez les **10 experts** qui l'émettent (blockchain:1027/1054, fintech:703-708, legaltech:894-909, mobility:820-847, ai:856, cybersecurity:820, creator:676 [652-654], general:1052/1091, hrtech:864/897, proptech:855/889) + composants UI (`VerdictHero` dans `tier2-results.tsx:1091`) + PDF (`ExtendedVerdict` dans `pdf-sections/tier2-expert.tsx:117-118`) + type `ExtendedSectorData` (à localiser). **D1 verrouillé : aucun alias `verdict` legacy émis** ; consumers UI/PDF migrés dans le même slice ou listés comme dépendance bloquante. Couvre l'impact user-facing réel.

**Option Tier 2.B-ter — RETIRÉE** : l'hypothèse de "branchement runtime des 4 experts standard pour propager leur verdict LLM vers UI" était fondée sur l'erreur factuelle du round 4. **Vérifié post-round 5** : ces 4 experts (blockchain, fintech, legaltech, mobility) émettent **déjà** leur verdict LLM via `_extended.verdict`. Pas de branchement supplémentaire requis. Option supprimée.

**Option Tier 2.C — Cybersecurity-expert `AVOID` requalifié** : `cybersecurity-expert` est explicitement directif côté UI (`AVOID` arrive bien via Niveau 1 → `_extended.verdict` → `VerdictHero`). Renommage `AVOID` → `HIGH_CONCERNS` (cohérent avec autres variantes). Faible blast radius. **Vérifié confirmé** post-round 5.

**Option Tier 2.D — Retrait directive `>90% confident` sur tous les fichiers Tier 2** : 23 fichiers à patcher (incluant base-sector-expert.ts). Pas de compat à garder (Famille C, bannie). Indépendant des options A/B/C de schéma. Voir §13 pour la règle cross-couche.

**Option Tier 2.E — Migration confidence enum** : couvre les 4 catégories §11.4 (verdict.confidence global override = 4 fichiers ; confidence sous-objets sectoriels = 4 fichiers / 7 occurrences ; confidence benchmark = 1 fichier ; mappings runtime UI). Renommage contextuel par catégorie (`fitStability`, `claimStability`/`metricStability`, `benchmarkStability`). 9 fichiers Tier 2 + types UI. **Pas via `output-mapper.ts`** (qui n'écrit pas `confidence`). Pas un renommage uniforme — décision par catégorie requise.

**Décisions implicites à expliciter** :
- Si seule Option B est retenue (schéma LLM N1) sans B-bis : drift LLM corrigé pour les 6 experts overrides. `_extended.verdict` runtime continue d'émettre l'ancien enum tant que la construction côté agent (`parsedOutput.verdict` ou dérivations) n'est pas mise à jour — donc le badge UI continue de montrer l'ancien wording. Effet UI/PDF partiel.
- Si seule Option B-bis est retenue (runtime `_extended.verdict` N2) sans B : UI/PDF cohérents, mais schéma LLM des 6 overrides reste `STRONG_FIT/...` / `STRONG_AI_PLAY/...` / `STRONG_SECURITY_PLAY/.../AVOID`. Potentiel drift downstream Tier 3 si SDS lit ces champs.
- Option B + B-bis combinées = migration LLM + runtime cohérente (option la plus propre mais non décidée).
- Option B-bis seule suffit à corriger l'affichage user-facing si la priorité est UI/PDF immédiat.

---

## Section 12 — A0-bis Satellites hors agents : Live Coaching / Board

> ⚠ Inventaire only. **Aucun patch Live/Board sans décision utilisateur séparée** (consigne explicite du brief A0-bis).

### 12.1 Live Coaching — fichiers et drifts

**Localisation** : `src/lib/live/*.ts` (pas de dossier `src/agents/live/`).

Fichiers principaux (vérifiés par `ls`) :
- `coaching-engine.ts`
- `post-call-reanalyzer.ts`
- `post-call-generator.ts`
- `transcript-condenser.ts`
- `visual-processor.ts`
- `utterance-router.ts`
- `types.ts`
- `__tests__/` (suite tests)

**Drifts détectés** :

| Fichier:ligne | Drift | Famille |
|---|---|---|
| `src/lib/live/coaching-engine.ts:39` | Liste **bannis** : `JAMAIS : "investir", "rejeter", "passer", "dealbreaker".` | Aligné doctrine côté tokens bannis ; OK |
| `src/lib/live/coaching-engine.ts:59` | Directive `>90% confident` | **C** — à retirer |
| `src/lib/live/post-call-reanalyzer.ts:286` | Directive `>90% confident` | **C** |
| `src/lib/live/post-call-reanalyzer.ts:304` | "Rate your overall response confidence: HIGH / MEDIUM / LOW" | B (directive 4 anti-hallucination self-audit — acceptable) |
| `src/lib/live/post-call-reanalyzer.ts:320` | `confidenceChange : évolution du niveau de confiance (before/after/reason)` | B (stabilité analyse, contextualisé) |
| `src/lib/live/post-call-generator.ts:29` | Directive `>90% confident` | **C** |
| `src/lib/live/post-call-generator.ts:47, 66, 223, 246, 377, 381` | `confidenceDelta` field — évolution before/after | B (stabilité) |
| `src/lib/live/transcript-condenser.ts:33` | Directive `>90% confident` | **C** |
| `src/lib/live/transcript-condenser.ts:51` | "Rate your overall response confidence: HIGH / MEDIUM / LOW" | B (directive 4) |
| `src/lib/live/transcript-condenser.ts:149, 163, 172, 211, 233, 311, 313` | `confidenceDelta`, `keyFacts.confidence: "verbatim"\|"inferred"` | A (verbatim/inferred = technique extraction) + B (delta) |
| `src/lib/live/visual-processor.ts:206` | Directive `>90% confident` | **C** |
| `src/lib/live/visual-processor.ts:224` | "Rate your overall response confidence: HIGH / MEDIUM / LOW" | B (directive 4) |
| `src/lib/live/utterance-router.ts:62-199` | `confidence: number` pour routage classification utterance | **A** (technique classification routing — `confidence: 1.0` filler, `0.9` small talk, `0.8` domain keywords, LLM variable). User-facing : caché derrière le routage |
| `src/lib/live/types.ts:233, 255, 278, 290` | `confidenceDelta`, `keyFacts[].confidence: "verbatim"\|"inferred"`, `confidenceChange.before/after/reason` | B (stabilité) + A (technique verbatim/inferred) |

**Résumé Live** :
- **Directive `>90% confident` : 5 fichiers** (coaching-engine, post-call-reanalyzer, post-call-generator, transcript-condenser, visual-processor)
- **Confidence Famille A** (technique routage / classification verbatim) : 1 fichier (utterance-router)
- **Confidence Famille B** (stabilité analyse / delta) : 4 fichiers (post-call-reanalyzer, post-call-generator, transcript-condenser, types)
- **Confidence Famille C** : aucune dans Live (la directive `>90% confident` est dans les prompts, pas un axe décisionnel exposé)
- **Tokens prescriptifs bannis** : déjà gérés ligne 39 (coaching-engine bani "dealbreaker", "investir", "rejeter", "passer")

### 12.2 Board — fichiers et drifts

**Localisation** : `src/agents/board/*.ts`.

Fichiers principaux :
- `board-orchestrator.ts`
- `board-member.ts`
- `context-compressor.ts`
- `types.ts`
- `index.ts`
- `__tests__/`

**Drifts détectés** :

| Fichier:ligne | Drift | Famille |
|---|---|---|
| `src/agents/board/board-member.ts:249` | Directive `>90% confident` | **C** — à retirer |
| `src/agents/board/board-member.ts:267` | "Rate your overall response confidence: HIGH / MEDIUM / LOW" | B (directive 4) |
| `src/agents/board/board-member.ts:289, 297` | Consignes au LLM : "Analyse ce deal et forme ton verdict independant" + "N'ancre jamais ton verdict sur un score unique ou une recommandation deja formulee" | Doctrinalement **aligné** (anti-anchoring) |
| `src/agents/board/board-member.ts:302, 522` | `verdict: "VERY_FAVORABLE" \| "FAVORABLE" \| "CONTRASTED" \| "VIGILANCE" \| "ALERT_DOMINANT" \| "NEED_MORE_INFO"` (UPPERCASE) | **Aligné orientation** (5 valeurs canoniques) + 1 valeur supplémentaire `NEED_MORE_INFO`. UPPERCASE vs `very_favorable` lowercase Tier 3 — incohérence cosmétique de casing |
| `src/agents/board/board-member.ts:303, 522, 354, 338, 434-435, 523` | `confidence: 0-100` (numérique) au verdict board-member | B (stabilité vote board) |
| `src/agents/board/types.ts:126-127, 141-147, 241-242, 313-314, 340, 349-350` | Types `BoardMemberInitialAnalysis`, `BoardMemberDebateResponse`, `BoardMemberFinalVote`, `BoardVerdictResult` — tous ont `verdict: BoardVerdictType` + `confidence: number(0-100)` | B (stabilité) |
| `src/agents/board/types.ts:276` | `recommendations: string[]` — recommandations textuelles **non typées** | À auditer en cas de décision migration (potentiellement prescriptif) |
| `src/agents/board/context-compressor.ts` | Compresse contexte thèse pour board members — consume `ThesisAxisEvaluation.verdict` | Lecture seule, déjà aligné orientation |
| `src/agents/board/types.ts:379` | `"verdict_reached"` event type | Cosmétique, OK |
| `src/agents/board/types.ts:395` | `verdict?: BoardVerdictResult` | OK |

**Résumé Board** :
- **Directive `>90% confident` : 1 fichier** (board-member.ts:249)
- **Verdict Board** : enum UPPERCASE `VERY_FAVORABLE\|...\|ALERT_DOMINANT\|NEED_MORE_INFO` (6 valeurs) — **aligné orientation cible** + 1 valeur supplémentaire. Incohérence de casing avec Tier 3 (lowercase) à harmoniser éventuellement
- **Confidence Board** : numérique 0-100 — Famille B (stabilité vote board member) ; ambiance "vote weighted by confidence". Pas un axe décisionnel global au sens Pauline, mais affiché dans les vues board
- **Recommendations textuelles non typées** : `types.ts:276 recommendations: string[]` — à auditer doctrinalement

### 12.3 Nature des champs Live + Board — synthèse

| Couche | Confidence Famille A | Confidence Famille B | Confidence Famille C (directive prompt) | Verdict aligné orientation ? |
|---|---|---|---|---|
| Live | `utterance-router.confidence` (routage), `keyFacts.confidence: verbatim/inferred` | `confidenceDelta` (post-call), `confidenceChange` | 5 fichiers (coaching-engine, post-call-reanalyzer, post-call-generator, transcript-condenser, visual-processor) | N/A (pas de verdict global Live — c'est du coaching temps-réel + post-call) |
| Board | — | `board-member.confidence: 0-100` (stabilité vote) | 1 fichier (board-member.ts:249) | **Oui** : verdict UPPERCASE 6 valeurs (5 orientation + NEED_MORE_INFO) |

### 12.4 Note explicite — pas de patch sans décision séparée

Conformément au brief A0-bis : aucun patch Live ni Board ne doit être lancé sans une décision utilisateur **explicite et séparée** des décisions §9.3 Phase A agents. Ces composants sont satellites (production temps-réel + délibération multi-modèle), avec leur propre cycle de validation produit. Inclus uniquement comme inventaire ; toute migration relève d'un chantier dédié.

---

## Section 13 — Mise à jour cross-couche §5 (>90% confident) — **CORRIGÉE post-audit Codex**

L'A0-bis initial sous-estimait massivement le scope. Total cross-couche corrigé (vérifié par `rg -n ">90% confident" src/agents/ src/lib/live/`) :

### 13.1 Périmètre Tier 1 / Tier 2 / Tier 3 / Live / Board

| Couche | Nombre de fichiers contenant `>90% confident` | Détail |
|---|---|---|
| Tier 1 | **13** | Tous les 13 agents (cf. §10.5 inventaire détaillé) |
| Tier 2 | **23** | Tous les 22 experts + `base-sector-expert.ts:518` (§11.5) |
| Tier 3 | **6** | SDS, DA, memo, scenario, CD, CA (déjà §5) |
| Live | **5** | coaching-engine, post-call-reanalyzer, post-call-generator, transcript-condenser, visual-processor (§12.1) |
| Board | **1** | board-member.ts:249 (§12.2) |
| Thesis (agents/) | **1** | `src/agents/thesis/types.ts:254` — la directive est embarquée dans la **constante exportée `THESIS_ANTI_HALLUCINATION_DIRECTIVES`** lignes 250-271 (cf. CLAUDE.md §5 directives) |
| **Total scope Tier1/Tier2/Tier3/Live/Board** | **48 fichiers** | Pattern copier-coller identique verbatim (sans compter thesis/types.ts) |

### 13.2 Other agent-like / orchestration prompts — hors Tier 1/2/3

Inventaire des fichiers agent-like ou helpers de prompts qui contiennent aussi la directive `>90% confident`. **Pas forcément à migrer maintenant, mais à classifier explicitement avant toute décision de scope Phase A.**

| Fichier:ligne | Rôle | Nature | Occurrences | Décision ouverte |
|---|---|---|---|---|
| `src/agents/tier0/fact-extractor.ts:441` | Agent Tier 0 extraction de faits structurés | Agent | 1 | Inclure ou différer ? |
| `src/agents/tier0/deck-coherence-checker.ts:226` | Agent Tier 0 cohérence deck | Agent | 1 | Idem |
| `src/agents/document-extractor.ts:527` | Agent base Tier 0 extraction documentaire | Agent | 1 | Idem |
| `src/agents/deal-scorer.ts:83` | Agent Tier 0 scoring initial | Agent | 1 | Idem |
| `src/agents/red-flag-detector.ts:72` | Agent Tier 0 détection précoce signaux d'alerte | Agent | 1 | Idem |
| `src/agents/chat/deal-chat-agent.ts:359` | Agent Chat IA conversationnel utilisateur | Agent | 1 | Idem |
| `src/agents/orchestration/reflexion.ts:209, 369, 882, 972, 1060` | Engine Reflexion (auto-critique itérative inter-rounds) | Orchestration | **5** | Idem |
| `src/agents/orchestration/consensus-engine.ts:187, 343, 1109, 1277, 1471, 1683` | Engine Consensus (détection contradictions cross-phase + débat de résolution). **Inclus Phase A** — utilisé par `src/agents/orchestrator/index.ts:25, 1978, 3814-3855` (orchestrator global, pas Board exclusif), `src/agents/orchestration/index.ts:35-44` (exports), `src/agents/orchestration/reflexion.ts:26` (import par Reflexion). Pas exclusivement Board. | Orchestration | **6** | Inclus dans A9 (orchestration Phase A) |
| `src/agents/orchestration/prompts/anti-hallucination.ts:14` | **Helper partagé** d'injection des directives anti-hallucination 2-5 (utilisé par board-orchestrator, fact-extractor) | Helper de prompt | 1 | **Critique** — c'est le helper que le plan Phase A §6-bis veut utiliser pour injecter les directives 2-5. Or il contient lui-même la directive 1 (`>90% confident`). À requalifier en premier — sinon le retrait ailleurs est annulé par ce helper. |
| `src/agents/thesis/types.ts:254` | Constante exportée `THESIS_ANTI_HALLUCINATION_DIRECTIVES` (lignes 250-271) injectée dans tous prompts thesis | Helper de prompt | 1 | Idem — embarque la directive dans la constante doctrinale thesis |

**Total agent-like / orchestration hors Tier 1/2/3** : **10 fichiers, 19 occurrences**.

**Total absolu repo** : **58 fichiers** contiennent la directive `>90% confident` (48 Tier1/2/3/Live/Board + 10 agent-like/orchestration). Hors fichier test compagnons éventuels (à vérifier si nécessaire).

### 13.3 Implication critique pour le plan Phase A

- La règle cross-agent §6-bis du plan (guard partagé scannant `src/agents/tier3/prompts/*.ts` + `src/agents/tier3/*.ts`) est **insuffisante** si le scope ne reste pas Tier 3-only.
- **Le helper `src/agents/orchestration/prompts/anti-hallucination.ts:14` est particulièrement structurant** : c'est précisément le mécanisme prévu par le plan pour injecter les directives 2-5 (abstention, citation, self-audit, structured uncertainty) lors de la migration. Mais il contient la directive 1 bannie. Tout retrait ailleurs serait silencieusement contredit par ce helper s'il est utilisé. Doit être traité en priorité.
- La constante `THESIS_ANTI_HALLUCINATION_DIRECTIVES` (`thesis/types.ts:254`) joue un rôle analogue côté thesis.

### 13.4 Décision utilisateur attendue (révisée) — retrait `>90% confident` Phase A

- (i) **Tier 3 uniquement** — 6 fichiers (statu quo plan actuel). Risque : helper `anti-hallucination.ts` non traité réinjecte la directive si Tier 3 l'utilise.
- (ii) **Tier 3 + Tier 2** — 29 fichiers.
- (iii) **Tier 3 + Tier 2 + Live** — 34 fichiers.
- (iv) **Tier 3 + Tier 2 + Live + Board** — 35 fichiers (couches user-facing).
- (v) **Tier 1/2/3 + Live + Board** — 48 fichiers (toutes couches agents principales).
- (vi) **Éradication complète** (48 + helpers + autres agent-like) — 58 fichiers. Inclut le helper `anti-hallucination.ts:14` et la constante `thesis/types.ts:254`.

**Sans décision utilisateur explicite, aucune option ne doit être retenue par défaut.** À trancher en même temps que §9.3 options C1-C4 (révisées) et que la décision sur le scope agent-like / orchestration.

---

## Section 14 — Bilan A0-bis et décisions ouvertes — **MIS À JOUR post-audit Codex round suivant**

### 14.1 Validations A0-bis (round corrigé)

- ✓ Fichier `docs-private/phase-a-inventory.md` étendu avec Sections 10, 11, 12, 13, 14 + corrections audit Codex appliquées
- ✓ §9.3 corrigé : recommandation C1 supprimée, remplacée par "Décision suspendue jusqu'à A0-bis"
- ✓ §10.1 corrigé : ne dit plus "aucun Tier 1 ne contient `>90% confident`" (assertion factuellement fausse de l'A0-bis initial)
- ✓ §10.5 ajouté : 13 occurrences exactes Tier 1 avec fichier:ligne (vérifié `rg -n ">90% confident" src/agents/tier1/`)
- ✓ §11.5 corrigé : placeholders supprimés ; fintech 360, saas 348, spacetech 538 ajoutés
- ✓ §13 corrigé : Tier 1 = 13 (pas 0), Total scope Tier1/2/3/Live/Board = 48 (pas 35)
- ✓ §13.2 ajouté : inventaire "Other agent-like / orchestration prompts" (10 fichiers, 19 occurrences, incluant le helper `anti-hallucination.ts:14` et la constante `thesis/types.ts:254`)
- ✓ Phrase "seul consumer runtime" → "seul consumer identifié / test-only" corrigée (2 occurrences)
- ✓ Wording "HORS PHASE A" Tier 1 réconcilié : remplacé par "Décision Tier 1 ouverte"
- ✓ Aucune modification de `src/` (vérifiable par `git status`)
- ✓ Aucun commit
- ✓ Inventaire 13 agents Tier 1 (compte réel vérifié)
- ✓ Inventaire 22 agents Tier 2 (compte réel vérifié : 22 = 21 sectoriels + 1 general-expert ; CLAUDE.md confirmé)
- ✓ Inventaire Live + Board en mode satellites, sans patch
- ✓ Cross-couche `>90% confident` consolidé : **48 fichiers Tier1/2/3/Live/Board + 10 fichiers agent-like/orchestration = 58 fichiers absolus**

### 14.2 Décisions ouvertes (à trancher post-audit Codex A0-bis corrigé)

> ⚠ Toutes les décisions Tier 1/Tier 2/cross-couche/agent-like sont **suspendues** jusqu'à validation finale de l'inventaire corrigé par l'utilisateur. A0-bis initial était factuellement incorrect sur le scope Tier 1 ; les options ci-dessous ne doivent pas être tranchées en se référant à la version pré-correction.

1. **§9.3 (options C1, C2, C3, C4) — TRANCHÉ** par D3/D5/D6 (cf. §15.3, §15.5, §15.6). Périmètre agents Phase A verrouillé : Tier 0 + Tier 1 + Tier 2 + Tier 3 + thesis + chat + orchestration + helpers ; Live et Board exclus (Phase B séparée). Anciennes options C1-C4 marquées obsolètes en §9.3.
2. **Tier 1 (options A/B/C/D)** : migration ou statu quo (cf. §10.4). À reconsidérer maintenant que la directive `>90% confident` est avérée sur les 13 agents.
3. **Tier 2 (options A, B [N1 LLM], B-bis [N2 runtime `_extended.verdict`], C [Cybersecurity `AVOID`], D [retrait `>90% confident` 23 fichiers], E [confidence 4 catégories])** : migration partielle, totale, ou statu quo. Options revues post-audit round 5 pour refléter le canal user-facing réel `result._extended.verdict` (pas `data.verdict`). Option B-ter retirée (l'hypothèse de "branchement runtime des 4 experts standard" était fondée sur l'erreur factuelle round 4 ; ces experts émettent déjà `_extended.verdict`). Cf. §11.10.
4. **Cross-couche `>90% confident` (options i/ii/iii/iv/v/vi)** : élargies §13.4 — incluent maintenant l'option (v) Tier 1/2/3 + Live + Board = 48 fichiers, et l'option (vi) éradication complète avec helpers = 58 fichiers.
5. **Live / Board** : aucun patch sans décision explicite séparée (cf. §12.4).
6. **Helper `src/agents/orchestration/prompts/anti-hallucination.ts:14`** : décision critique — le helper que le plan Phase A §6-bis veut utiliser pour injecter les directives 2-5 contient lui-même la directive 1 bannie. À traiter avant tout retrait ailleurs, ou bien à requalifier explicitement.
7. **Constante `src/agents/thesis/types.ts:254` `THESIS_ANTI_HALLUCINATION_DIRECTIVES`** : embarque la directive dans le bloc doctrinal thesis. Décision séparée requise.
8. **Tier 0 / Chat / Reflexion / Consensus** : 10 fichiers agent-like / orchestration listés §13.2 — à inclure ou exclure du scope par décision utilisateur.

### 14.3 Hors A0-bis (corrigé)

A0-bis ne tranche **aucune décision** de migration. Son seul rôle est d'établir une vue **factuellement correcte** des agents (toutes couches) pour permettre un arbitrage informé. L'A0-bis initial a été rejeté par audit Codex pour erreurs factuelles bloquantes (Tier 1 = 13 occurrences `>90% confident` documentées alors que A0-bis annonçait 0 ; total cross-couche initial 35 corrigé en 48 puis 58 ; lignes Tier 2 avec placeholders supprimés ; wording stale "HORS Phase A" Tier 1 reformulé "décision ouverte" ; phrase "consumer runtime" schémas Zod reformulée "seul consumer identifié / test-only" ; `alertSignal.confidenceLevel` Tier 1 placement erroné corrigé vers MetaSchema partagé ; comptes Tier 2 héritage 17 corrigés en 16 ; `verdict.confidence` Tier 2 annoncé "12 fichiers" reformulé "9 fichiers / 12 occurrences avec 4 catégories sémantiques distinctes" ; round 4 erreur sur `data.verdict` comme canal UI corrigée en `result._extended.verdict` au round 5 ; round 6 résidus `data.verdict` dans §11.3/§11.4 corrigés). Les rounds successifs corrigent ces erreurs.

A0-bis a été **validé par utilisateur** comme inventaire prêt pour arbitrage. Les décisions §9 / §13 / §14 ont ensuite été tranchées explicitement par l'utilisateur (cf. §15 ci-dessous). A1 reste bloqué jusqu'à audit Codex du plan révisé selon ces décisions.

---

## Section 15 — Décisions utilisateur verrouillées (post-validation A0-bis)

> Arbitrage utilisateur reçu et acté. Les options ouvertes des §§9.3, 10.4, 11.10, 13.4 sont **désormais closes** par les décisions ci-dessous, qui priment sur les recommandations par défaut antérieures.

### 15.1 Q1 — Compat legacy / backfill agents

**Décision verrouillée** : **pas de compat legacy agents comme contrainte produit.** Phase A peut introduire des breaking changes sur les contrats de sortie agents. Les anciens outputs persistés peuvent être considérés comme obsolètes et régénérables.

Interprétation stricte :
- Phase A peut casser les anciens contrats agents (`STRONG_PASS`, `PASS`, `PROCEED`, `STOP`, `killReasons`, etc.).
- **Ne pas concevoir un bridge `legacyVerdict` long terme** ni un backfill préalable comme prérequis.
- **Ne pas inventer une couche legacy silencieuse** pour préserver un ancien contrat prescriptif.
- Si un consumer runtime casse immédiatement sur dépendance d'un champ legacy, documenter la dépendance précisément et **demander arbitrage avant patch** ; ne pas réintroduire d'alias legacy silencieux.
- Pas de script de suppression DB ou de purge de données dans un slice technique sans instruction explicite séparée.

**Conséquence pour le plan Phase A** :
- Toutes les mentions "bridge `legacyVerdict` 1 release recommandé" comme choix par défaut sont supprimées.
- Remplacées par : "**breaking contract accepté**, à condition que les consumers directs soient migrés dans le même slice ou explicitement listés comme dépendance bloquante".

### 15.2 Q2 — Service Solidité des preuves

**Décision verrouillée** : **service minimal au départ.**

Contrat agents cible initial :
- `evidenceSolidity: "contradictory"` si contradictions suffisamment établies
- `evidenceSolidity: "insufficient"` si données/preuves insuffisantes
- `evidenceSolidity: null` si non qualifiable
- **Ne pas émettre `strong`, `moderate`, `low`** tant que les signaux nécessaires ne sont pas robustes

**Règle stricte** : aucun mapping depuis `score`, `overallScore`, `confidence`, `confidenceLevel`, ou une auto-évaluation LLM vers `evidenceSolidity`. Verrouillé mécaniquement par source-guard test (cf. plan A6).

Motif : A0-bis a confirmé que `documentCoverage` absolu n'existe pas tel quel dans `EvidenceLedger` / `EvidenceHealthBundle`. Le service doit rester conservateur.

### 15.3 Q3 — Périmètre Phase A

**Décision verrouillée** : **Phase A couvre tous les agents, hors Live Coaching et hors Board.**

**Inclus Phase A** :
- `src/agents/tier0/**`
- `src/agents/tier1/**`
- `src/agents/tier2/**`
- `src/agents/tier3/**`
- `src/agents/thesis/**`
- `src/agents/chat/**`
- `src/agents/orchestration/**`
- `src/agents/base/**` si utilisé comme agent/prompt partagé
- helpers/constants de prompt utilisés par ces agents, **notamment** :
  - `src/agents/orchestration/prompts/anti-hallucination.ts`
  - constantes doctrinales prompt dans `src/agents/thesis/types.ts` (constante `THESIS_ANTI_HALLUCINATION_DIRECTIVES` lignes 250-271) si elles injectent la directive bannie

**Exclus Phase A** (réservés à Phase B séparée) :
- `src/agents/board/**` — Board AI
- `src/lib/live/**` — Live Coaching runtime/UI
- Tous les composants Live Coaching et Board

**Aucun patch Board/Live en Phase A**, même si des occurrences doctrinales y sont inventoriées (cf. §12.1, §12.2 : 5 fichiers Live + 1 fichier Board avec `>90% confident` — restent intacts en Phase A).

### 15.4 Q4 — Directive `>90% confident`

**Décision verrouillée** : **remplacer la directive brute partout dans le périmètre Phase A** par un gate de preuve structuré.

On ne supprime **pas** le principe anti-hallucination. On supprime la formulation `Answer only if you are >90% confident` parce qu'elle repose sur une **confiance auto-déclarée du modèle** (Famille C bannie).

**Directive de remplacement cible (gate de preuve structuré)** :
- n'affirmer que ce qui est supporté par une **source**, une **observation**, ou une **inférence explicitement marquée**
- si la preuve manque → retourner `unknown` / `missing_evidence` / `open_question` (ou équivalent typé par l'agent)
- si l'information est inférée → la marquer comme **inférence** explicite
- si les sources divergent → exposer la **contradiction**
- faire un **self-audit final** des claims
- **ne jamais utiliser une auto-confiance LLM** comme vérité, score décisionnel ou solidité des preuves

Cette règle s'applique à **tout le périmètre Phase A** défini en §15.3 — incluant Tier 0, Tier 1, Tier 2, Tier 3, Thesis, Chat, Orchestration, helpers. Elle **ne s'applique pas** encore à Live Coaching / Board (Phase B).

**Inventaire à éradiquer en Phase A (depuis §13)** :
- Tier 1 : 13 fichiers
- Tier 2 : 23 fichiers
- Tier 3 : 6 fichiers
- Tier 0 : 2 fichiers (`fact-extractor.ts:441`, `deck-coherence-checker.ts:226`)
- Chat : 1 fichier (`deal-chat-agent.ts:359`)
- Base agents : 3 fichiers (`deal-scorer.ts:83`, `document-extractor.ts:527`, `red-flag-detector.ts:72`)
- Orchestration : 3 fichiers (`reflexion.ts` 5 occurrences, `consensus-engine.ts` 6 occurrences, `prompts/anti-hallucination.ts:14` — helper partagé)
- Thesis : 1 fichier (`types.ts:254` — constante exportée `THESIS_ANTI_HALLUCINATION_DIRECTIVES`)

**Total Phase A** : 52 fichiers = 58 fichiers absolus avec `>90% confident` − 6 fichiers exclus (5 Live + 1 Board). **`consensus-engine.ts` inclus Phase A** (call sites vérifiés post-audit Codex v8 : `src/agents/orchestrator/index.ts:25, 1978, 3814, 3815, 3831, 3855` + `src/agents/orchestration/index.ts:35-44` + `src/agents/orchestration/reflexion.ts:26` — pas exclusivement Board).

### 15.5 Q5 — Tier 1

**Décision verrouillée** : Tier 1 est **dans Phase A**.

À traiter :
- Retirer/remplacer la directive `>90% confident` selon §15.4 (13 fichiers)
- Inventorier puis préparer la migration de `alertSignal.recommendation: PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP` vers une sémantique non prescriptive (par exemple `signalIntensity: low|elevated|high|critical`)

**Point à verrouiller dans le plan** : si la migration du contrat Tier 1 est trop large pour le même slice que le remplacement `>90% confident`, elle doit être **isolée dans un sous-slice Phase A dédié**. Ne pas la repousser hors Phase A par défaut.

### 15.6 Q6 — Tier 2

**Décision verrouillée** : Tier 2 est **dans Phase A**.

À traiter :
- Retirer/remplacer la directive `>90% confident` selon §15.4 (23 fichiers)
- Traiter les verdicts prescriptifs exposés via `_extended.verdict` (canal user-facing confirmé §11.7-corrigé), notamment le cas `cybersecurity-expert AVOID` qui arrive bien jusqu'à UI/PDF via `VerdictHero` + `ExtendedVerdict`
- Ne plus présenter Tier 2 comme hors scope ou simple classification

**Point à verrouiller dans le plan** : la migration Tier 2 doit distinguer les **3 niveaux** :
- Niveau 1 : schéma LLM (6 experts overrides — cf. §11.3)
- Niveau 2 : runtime `_extended.verdict` (10 experts émetteurs vérifiés — cf. §11.7)
- Niveau 3 : consumers UI/PDF (`VerdictHero` ligne 1091, `ExtendedVerdict` lignes 117-118 — cf. §11.8)

Si le refactor complet Tier 2 est trop large pour un seul slice, proposer des **sous-slices Phase A**, pas un report implicite hors Phase A.

### 15.7 Conséquence opérationnelle

Le plan `temp/agents-refonte.md` doit être refondu pour :
- Supprimer toute mention de bridge legacy comme défaut
- Refondre le périmètre §15.3 (scope étendu, exclusions Live/Board explicites)
- Refondre la règle §6-bis avec la directive de remplacement gate de preuve structuré §15.4
- Ajouter sous-slices Tier 1 (cf. §15.5) et Tier 2 (cf. §15.6) en Phase A
- Ajouter slice Tier 0 + Chat + Orchestration + helpers prompts cross-agent
- Refondre service Solidité minimal §15.2 (3 valeurs seulement)
- Remplacer "options A/B/C/D/E" par décisions verrouillées + sous-slices exécutables

A1 reste bloqué jusqu'à audit Codex du plan révisé selon ces 7 décisions.

