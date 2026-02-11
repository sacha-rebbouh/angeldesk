# Audit des Failles — Angel Desk
## 9 Personas, 9 Perspectives

**Date:** 2026-02-11
**Scope:** Analyse IA + UX/Produit
**Methode:** Chaque persona explore le codebase avec son angle specifique et remonte ses findings.

**Contexte recent:** Un systeme de classification de fiabilite des donnees (6 niveaux: AUDITED > VERIFIED > DECLARED > PROJECTED > ESTIMATED > UNVERIFIABLE) vient d'etre implemente pour eviter que les projections soient traitees comme des faits averes.

---

## Table des matieres

1. [Fondateur Roublard](#1-fondateur-roublard)
2. [BA Novice](#2-ba-novice)
3. [BA Expert](#3-ba-expert)
4. [VC Partner](#4-vc-partner)
5. [Auditeur Big4](#5-auditeur-big4)
6. [Concurrent du Secteur](#6-concurrent-du-secteur)
7. [Utilisateur Quotidien UX](#7-utilisateur-quotidien-ux)
8. [Journaliste d'Investigation](#8-journaliste-dinvestigation)
9. [Data Scientist QA](#9-data-scientist-qa)

---

## Statut des agents

| # | Persona | Statut | Nb Failles |
|---|---------|--------|------------|
| 1 | Fondateur Roublard | EN COURS | - |
| 2 | BA Novice | EN COURS | - |
| 3 | BA Expert | EN COURS | - |
| 4 | VC Partner | TERMINE | 14 |
| 5 | Auditeur Big4 | EN COURS | - |
| 6 | Concurrent du Secteur | EN COURS | - |
| 7 | Utilisateur Quotidien UX | EN COURS | - |
| 8 | Journaliste d'Investigation | EN COURS | - |
| 9 | Data Scientist QA | EN COURS | - |

---

## 4. VC Partner

**Persona:** VC Partner Tier 1 europeen (Series A/B), 5000+ deals vus, 50 investissements, equipe de 10 analystes.
**Angle:** Failles methodologiques vs standard professionnel VC. Quoi ne tiendrait pas devant un IC (Investment Committee)?

### CRITICAL (4 failles)

#### 4.1 SCORING ENTIEREMENT DELEGUE AU LLM — ZERO DETERMINISME

**Standard VC:** Un scoring defensible repose sur des calculs deterministes, reproductibles. Meme deal 2 fois = meme score a +/-2 points.

**Ce que fait Angel Desk:** Chaque agent Tier 1 demande au LLM de produire un score 0-100 dans le JSON. Le LLM "choisit" le score. Le scoring service (`/src/scoring/`) existe mais n'est PAS utilise par les agents Tier 1 — systeme parallele non integre.

**Fichiers:**
- `src/agents/tier1/financial-auditor.ts` (L42-47): Poids definis dans le code mais envoyes au LLM dans le prompt
- `src/scoring/services/score-aggregator.ts` (L44-135): Service d'aggregation existant mais non utilise dans le flow
- `src/agents/orchestrator/index.ts`: Score final vient du `synthesis-deal-scorer` (aussi un LLM)

**Impact:** Un deal analyse 3 fois donne 3 scores differents (55, 68, 72). Indefendable devant un IC.

**Correction:** Separer extraction (LLM) et scoring (code deterministe). Le LLM extrait les metriques brutes. Le code calcule les scores. Integrer le `score-aggregator.ts` existant dans le pipeline reel.

---

#### 4.2 BENCHMARKS HARD-CODES ET OBSOLETES

**Standard VC:** Benchmarks trimestriels, sources et dates. En 2024-2025, les multiples SaaS ont baisse de 30-40% vs 2021.

**Ce que fait Angel Desk:** Benchmarks dans `src/services/benchmarks/config.ts` sont des constantes hard-codees avec sources generiques ("First Round 2024", "SaaStr 2024"). `dynamic-benchmarks.ts` utilise Perplexity/Sonar (web search) — LLM synthetise des benchmarks non-verifiables.

**Fichiers:**
- `src/services/benchmarks/config.ts` (L20-289): Valeurs hard-codees
- `src/services/benchmarks/dynamic-benchmarks.ts` (L60-92): Web search via Perplexity

**Correction:** APIs structurees (Carta, OpenView). Chaque benchmark avec `lastUpdated` + `expiresAt`. Alerte si > 6 mois.

---

#### 4.3 ABSENCE DE VALIDATION DES OUTPUTS LLM

**Standard VC:** Chaque chiffre verifie par un pair. Calculs reproductibles.

**Ce que fait Angel Desk:** Le LLM produit scores, percentiles, calculs — RIEN n'est verifie post-generation. Si le LLM dit "percentile: 85" mais le vrai (calculable a partir valeur + benchmark) est 42, personne ne detecte.

**Fichiers:**
- `src/agents/tier1/financial-auditor.ts` (L378+): `execute()` utilise directement le resultat LLM
- `src/agents/base-agent.ts` (L335-375): `llmCompleteJSON` ne valide que le parsing JSON

**Correction:** Couche de validation post-LLM: recalcul independant des percentiles, IRR, dilution, LTV/CAC. Flag si ecart > 10%.

---

#### 4.4 ANALYSE DE MARCHE PURE TOP-DOWN

**Standard VC:** IC exige bottom-up: clients cible x prix x conversion = SAM realiste. TAM top-down = ceiling check.

**Ce que fait Angel Desk:** `market-intelligence` valide les TAM/SAM/SOM du deck mais n'a aucune donnee pour construire une estimation bottom-up. Detecte la methodologie mais ne peut pas la verifier.

**Fichiers:**
- `src/agents/tier1/market-intelligence.ts` (L56-75): Schema de sortie sans source de donnees pour valider

**Correction:** Integrer Statista API, estimates publiques. Forcer estimation bottom-up independante.

---

### HIGH (5 failles)

#### 4.5 PAS DE SCORING COMPARATIF

Le score est absolu (0-100) sans positionnement reel vs pipeline du BA. La DB interne (1500+ deals) n'est pas utilisee pour un ranking reel. Les percentiles affiches sont generes par le LLM.

**Correction:** Calculer les scores de chaque deal en DB, positionner en percentile reel.

#### 4.6 DD TECHNIQUE SANS ACCES AU CODE

`tech-stack-dd` et `tech-ops-dd` analysent ce que le fondateur DIT dans le deck. Pour la majorite des startups, le code est prive. Score technique base sur des claims = noter un chef sans gouter son plat.

**Correction:** Transparence + suggestion d'audit technique independant. Baisser le poids Product/Tech sans acces au code.

#### 4.7 COHERENCE INTER-AGENTS INSUFFISANTE

Le `contradiction-detector` (Tier 3, LLM) detecte les contradictions apres coup mais peut rater les subtiles. `tier3-coherence.ts` ajuste les probas scenarios mais ne reconcilie PAS les scores Tier 1 entre eux. Financial-auditor 75/100 + team-investigator 30/100 = pas de flag automatique.

**Correction:** Layer deterministe entre Tier 1 et Tier 3: detection automatique ecarts > 20 points, reconciliation forcee.

#### 4.8 PAS DE GESTION FOLLOW-ON / RE-ANALYSE

`isUpdate` flag existe mais pas de comparaison Delta. Le BA ne voit pas "score passe de 65 a 72 car NRR augmente de 110% a 130%".

**Correction:** Snapshot structure des metriques cles. Sur re-analyse, calcul du delta + presentation.

#### 4.9 MEMO NON PRESENTABLE A UN IC

Le `memo-generator` depend de 17 appels LLM sequentiels. Chaque etape peut introduire des erreurs non-detectees. Preuves de troncature JSON frequente (lignes 337-358).

**Correction:** Memo regenere a partir du fact store verifie, pas des outputs LLM bruts.

---

### MEDIUM (5 failles)

#### 4.10 PAS DE RISK FRAMEWORK COHERENT
Red flags distribues entre 13 agents avec nomenclatures differentes. Pas de matrice probabilite x impact unifiee.

#### 4.11 DILUTION ET IRR MAL MODELISES
LLM calcule IRR et dilutions (formules dans les prompts). Pas de verification mathematique.

#### 4.12 CONTEXT ENGINE FRAGILE
30+ connecteurs, beaucoup down. Si 80% echouent, analyse se fait quand meme. Pas assez penalisant.

#### 4.13 PONDERATION NON ADAPTEE AU STAGE
Poids fixes (Team 25%, Market 15%, etc.) identiques Pre-Seed et Series B. Devrait varier radicalement.

#### 4.14 LEGAL-REGULATORY SANS ACCES AUX REGISTRES
Analyse basee sur le deck. Pas d'API INPI (brevets), BODACC (procedures), Societe.com (litiges).

---

### VERDICT VC PARTNER

> L'architecture est ambitieuse et la couverture fonctionnelle impressionnante (40 agents, fact store, coherence engine). Mais le fondement methodologique a un defaut structurel: **le LLM est juge et partie**. Il extrait les donnees, calcule les scores, et genere les conclusions — sans couche de verification deterministe. C'est comme avoir un analyste qui ecrit son propre peer review.
>
> **La correction #1 qui change tout:** Separer extraction (LLM) et scoring (code deterministe). Le LLM extrait les metriques brutes. Le code calcule les percentiles, scores, IRR, dilutions. Le LLM synthetise en langage naturel a partir des scores calcules.

| Severite | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH | 5 |
| MEDIUM | 5 |

---

(Les sections suivantes seront ajoutees au fur et a mesure que les agents terminent)

