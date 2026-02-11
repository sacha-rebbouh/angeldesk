# Wave 2 - Agent H2 - Qualite d'Analyse

**9 failles HIGH (F34, F35, F36, F37, F38, F39, F40, F41, F55)**

---

## F34 - Projections non cross-validees avec le GTM analyst

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/financial-auditor.ts`

Le financial-auditor produit une section `projections` (lignes 88-93, type `LLMFinancialAuditResponse`) avec les champs `realistic`, `assumptions` et `concerns`. Cependant, il analyse les projections **en isolation complete** du GTM analyst.

**Probleme precis**: Dans la methode `execute()` (lignes 378-576), le prompt demande a l'agent de "Verifier les projections" (Etape 4, lignes 241-244) mais n'injecte **aucune donnee GTM**. L'agent n'a pas acces aux resultats de `gtm-analyst` car il tourne en parallele dans le Tier 1.

```typescript
// Ligne 378-576: execute() du financial-auditor
// AUCUNE reference aux donnees GTM:
// - Pas de context.previousResults?.["gtm-analyst"]
// - Pas de section GTM dans le prompt
// - Les hypotheses de croissance sont evaluees sans sales pipeline, CAC, cycle de vente
```

La validation des projections se fait donc uniquement sur des criteres mathematiques internes (hockey stick, % de croissance) sans les confronter aux capacites reelles GTM (taille equipe sales, pipeline, cycle de vente, CAC).

**Fichier secondaire**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/gtm-analyst.ts`
Le GTM analyst produit des donnees critiques (sales motion, canaux, pipeline) qui pourraient invalider ou confirmer les projections financieres.

### Correction

La cross-validation ne peut pas se faire pendant le Tier 1 (execution parallele). Il faut ajouter un **module de cross-validation Tier 1 post-execution** dans l'orchestrateur, qui s'execute APRES le Tier 1 et AVANT le Tier 3.

**1. Creer un nouveau module**: `src/agents/orchestration/tier1-cross-validation.ts`

```typescript
/**
 * TIER 1 CROSS-VALIDATION ENGINE - Module deterministe (NO LLM)
 *
 * Verifie la coherence inter-agents Tier 1 APRES leur execution parallele.
 * S'execute entre Tier 1 et Tier 2/3.
 *
 * Cross-validations implementees:
 * - financial-auditor projections vs gtm-analyst capacites
 * - financial-auditor metrics vs customer-intel retention
 * - team-investigator gaps vs tech-stack-dd requirements
 */

import type { AgentResult } from "../types";

export interface CrossValidationResult {
  validations: CrossValidation[];
  adjustments: ScoreAdjustment[];
  warnings: string[];
}

export interface CrossValidation {
  id: string;
  type: "PROJECTION_VS_GTM" | "METRICS_VS_RETENTION" | "TEAM_VS_TECH";
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  agent1: string;
  agent1Claim: string;
  agent2: string;
  agent2Data: string;
  verdict: "COHERENT" | "MINOR_DIVERGENCE" | "MAJOR_DIVERGENCE" | "CONTRADICTION";
  detail: string;
  suggestedScoreAdjustment?: number; // -X points sur l'agent concerne
}

export interface ScoreAdjustment {
  agentName: string;
  field: string;
  before: number;
  after: number;
  reason: string;
  crossValidationId: string;
}

export function runTier1CrossValidation(
  allResults: Record<string, AgentResult>
): CrossValidationResult {
  const validations: CrossValidation[] = [];
  const adjustments: ScoreAdjustment[] = [];
  const warnings: string[] = [];

  // --- CROSS-VALIDATION 1: Projections financieres vs GTM ---
  const finResult = allResults["financial-auditor"];
  const gtmResult = allResults["gtm-analyst"];

  if (finResult?.success && gtmResult?.success) {
    const finData = (finResult as { data?: Record<string, unknown> }).data;
    const gtmData = (gtmResult as { data?: Record<string, unknown> }).data;

    if (finData && gtmData) {
      const projections = (finData.findings as Record<string, unknown>)?.projections as
        { realistic?: boolean; assumptions?: string[]; concerns?: string[] } | undefined;

      // Extraire les donnees GTM pertinentes
      const gtmFindings = gtmData.findings as Record<string, unknown> | undefined;
      const salesMotion = gtmFindings?.salesMotion as Record<string, unknown> | undefined;
      const channels = gtmFindings?.channels as unknown[] | undefined;

      // Regle: Si projections "realistes" mais GTM montre des gaps critiques
      const gtmScore = (gtmData.score as { value?: number })?.value ?? 50;
      const finScore = (finData.score as { value?: number })?.value ?? 50;

      // Divergence: projections realistes mais score GTM < 40
      if (projections?.realistic === true && gtmScore < 40) {
        validations.push({
          id: "CV-001",
          type: "PROJECTION_VS_GTM",
          severity: "CRITICAL",
          agent1: "financial-auditor",
          agent1Claim: "Projections jugees realistes",
          agent2: "gtm-analyst",
          agent2Data: `Score GTM = ${gtmScore}/100 (insuffisant pour supporter les projections)`,
          verdict: "MAJOR_DIVERGENCE",
          detail: `Le financial-auditor juge les projections realistes mais le GTM analyst attribue un score de ${gtmScore}/100. Les projections de croissance ne sont pas soutenues par la capacite commerciale.`,
          suggestedScoreAdjustment: -10,
        });

        // Ajuster le score du financial-auditor si la divergence est majeure
        if (finScore > 50) {
          adjustments.push({
            agentName: "financial-auditor",
            field: "score.value",
            before: finScore,
            after: Math.max(30, finScore - 10),
            reason: `Projections realistes mais GTM score ${gtmScore} < 40 = incoherence`,
            crossValidationId: "CV-001",
          });
        }
      }

      // Divergence: croissance projetee > 200% mais pas d'equipe sales suffisante
      const teamSize = (salesMotion as Record<string, unknown>)?.teamSize;
      if (typeof teamSize === "number" && teamSize <= 1) {
        const finProjectionsRealistic = projections?.realistic;
        if (finProjectionsRealistic) {
          validations.push({
            id: "CV-002",
            type: "PROJECTION_VS_GTM",
            severity: "HIGH",
            agent1: "financial-auditor",
            agent1Claim: "Projections jugees realistes",
            agent2: "gtm-analyst",
            agent2Data: `Equipe sales: ${teamSize} personne(s)`,
            verdict: "MAJOR_DIVERGENCE",
            detail: "Les projections financieres sont validees mais l'equipe commerciale est sous-dimensionnee pour les atteindre.",
          });
        }
      }
    }
  } else {
    if (!finResult?.success) warnings.push("financial-auditor indisponible pour cross-validation");
    if (!gtmResult?.success) warnings.push("gtm-analyst indisponible pour cross-validation");
  }

  // --- CROSS-VALIDATION 2: Metrics financieres vs retention client ---
  const custResult = allResults["customer-intel"];
  if (finResult?.success && custResult?.success) {
    const finData = (finResult as { data?: Record<string, unknown> }).data;
    const custData = (custResult as { data?: Record<string, unknown> }).data;

    if (finData && custData) {
      const custFindings = custData.findings as Record<string, unknown> | undefined;
      const pmf = custFindings?.pmf as { pmfVerdict?: string; pmfScore?: number } | undefined;

      // Si financial-auditor donne un bon score mais PMF = NOT_DEMONSTRATED
      const finScore = (finData.score as { value?: number })?.value ?? 50;
      if (finScore > 65 && pmf?.pmfVerdict === "NOT_DEMONSTRATED") {
        validations.push({
          id: "CV-003",
          type: "METRICS_VS_RETENTION",
          severity: "HIGH",
          agent1: "financial-auditor",
          agent1Claim: `Score financier = ${finScore}/100`,
          agent2: "customer-intel",
          agent2Data: `PMF = NOT_DEMONSTRATED (score ${pmf.pmfScore ?? 0})`,
          verdict: "MAJOR_DIVERGENCE",
          detail: "Les metriques financieres semblent saines mais le PMF n'est pas demontre. Les chiffres actuels pourraient ne pas etre reproductibles.",
        });
      }
    }
  }

  return { validations, adjustments, warnings };
}
```

**2. Integrer dans l'orchestrateur**: `src/agents/orchestrator/index.ts`

Apres l'execution du Tier 1 et avant le Tier 2/3, ajouter l'appel:

```typescript
// Apres la boucle Tier 1 (apres toutes les phases A/B/C/D)
import { runTier1CrossValidation } from "../orchestration/tier1-cross-validation";

// ... apres execution Tier 1 ...
const crossValidation = runTier1CrossValidation(allResults);

// Appliquer les ajustements de score
for (const adj of crossValidation.adjustments) {
  const result = allResults[adj.agentName];
  if (result?.success && "data" in result) {
    const data = result.data as Record<string, unknown>;
    const scoreObj = data.score as { value?: number } | undefined;
    if (scoreObj && typeof scoreObj.value === "number") {
      scoreObj.value = adj.after;
    }
  }
}

// Injecter les resultats dans le contexte pour Tier 3
enrichedContext.tier1CrossValidation = crossValidation;
```

**3. Injecter dans le prompt du synthesis-deal-scorer**: `src/agents/tier3/synthesis-deal-scorer.ts`

Ajouter une section dans le prompt `execute()` (apres ligne 710):

```typescript
// Dans la methode execute(), ajouter apres coherenceSection:
const crossValidationSection = this.formatCrossValidation(context);

// Dans le prompt, ajouter:
// ## CROSS-VALIDATION TIER 1
// ${crossValidationSection}
```

### Dependances
- F39 (coherence inter-agents): Ce mecanisme de cross-validation est complementaire au module deterministe de coherence.
- F55 (tests de coherence): Les cross-validations alimentent les tests de variance.

### Verification
1. Creer un deal test avec projections optimistes (ARR x3) mais faible equipe sales (1 personne).
2. Verifier que la cross-validation detecte la divergence PROJECTION_VS_GTM.
3. Verifier que le score du financial-auditor est ajuste a la baisse.
4. Verifier que le synthesis-deal-scorer recoit et integre la cross-validation dans son analyse.

---

## F35 - Dynamique cofondateurs insuffisamment capturee, pas de template de reference check

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/team-investigator.ts`

La section `cofounderDynamics` (lignes 155-168 de l'interface `LLMTeamInvestigatorResponse`) capture: `foundersCount`, `equitySplit`, `vestingInPlace`, `workingHistoryTogether`, `relationshipStrength`, `potentialConflicts`. C'est correct mais insuffisant.

**Probleme 1**: Pas de **decision-making dynamics** (qui tranche? comment gerent-ils les desaccords? qui a le pouvoir de veto?).

**Probleme 2**: Le prompt mentionne "questions de REFERENCE CHECK" (ligne 384) mais ne genere **aucun template structure** de reference check. Les questions generees sont des questions generiques pour le fondateur, pas un guide d'appel reference.

```typescript
// Ligne 384 du buildSystemPrompt():
// "6. Les questions doivent être des questions de REFERENCE CHECK (à poser à des anciens collègues)"
// Mais le format de sortie "questions" (lignes 218-224) ne contient PAS de structure specifique
// reference check: pas de "qui appeler", pas de "template d'appel", pas de "red flags dans la reponse"
```

**Probleme 3**: La methode `normalizeFindings` (lignes 1111-1304) normalise `cofounderDynamics` sans ajouter de protocole de reference check.

### Correction

**1. Enrichir l'interface `cofounderDynamics`** dans l'interface LLM (team-investigator.ts):

Apres la ligne 167 (`soloFounderRisk?: string;`), ajouter:

```typescript
    // Decision-making dynamics (NOUVEAU)
    decisionMaking: {
      primaryDecisionMaker: string; // Qui tranche en dernier recours?
      decisionProcess: string; // Consensus, vote, CEO decide?
      conflictResolutionHistory: string; // Ont-ils deja eu un desaccord majeur? Comment resolu?
      vetoRights: string; // Qui a un droit de veto (formel ou informel)?
      riskIfDisagreement: string; // Que se passe-t-il si les fondateurs divergent?
    };
```

**2. Ajouter un format `referenceCheckTemplate`** dans l'interface LLM:

Apres `benchmarkComparison` (ligne 193), ajouter:

```typescript
    referenceCheckTemplate: {
      whoToCall: {
        name: string;
        relationship: string; // "ex-collegue chez Google", "co-fondateur venture precedente"
        contactMethod: string; // "LinkedIn", "email via fondateur", "publiquement disponible"
        priority: "CRITICAL" | "HIGH" | "MEDIUM";
      }[];
      scriptTemplate: {
        introduction: string;
        questions: {
          question: string;
          whatToLookFor: string;
          redFlagAnswer: string;
        }[];
        closingQuestion: string;
      };
      minimumReferencesNeeded: number;
      founderSpecificQuestions: {
        founderName: string;
        specificQuestions: string[];
      }[];
    };
```

**3. Enrichir le system prompt** (`buildSystemPrompt()`, apres ligne 312):

Ajouter dans la section "Etape 4: Dynamique Cofondateurs":

```
## Etape 4b: Decision-Making Dynamics (NOUVEAU)
- Qui prend les decisions strategiques? (CEO seul, consensus, vote?)
- Comment gerent-ils les desaccords? (Historique visible dans interviews/articles)
- Y a-t-il un desequilibre de pouvoir? (CEO dominant vs CTO silencieux)
- Le BA doit savoir: que se passe-t-il si les fondateurs divergent sur la strategie?

## Etape 7: Generation du Template Reference Check
- Identifier 2-3 personnes a appeler (ex-collegues, anciens investisseurs, co-fondateurs precedents)
- Generer un script d'appel avec questions specifiques par fondateur
- Chaque question doit avoir un "red flag answer" (ce qui serait inquietant)
- Minimum: 2 references par fondateur principal
```

**4. Normaliser dans `normalizeFindings()`** (lignes 1229-1252):

Ajouter apres `soloFounderRisk` (ligne 1251):

```typescript
      decisionMaking: {
        primaryDecisionMaker: findings?.cofounderDynamics?.decisionMaking?.primaryDecisionMaker ?? "Unknown",
        decisionProcess: findings?.cofounderDynamics?.decisionMaking?.decisionProcess ?? "Unknown",
        conflictResolutionHistory: findings?.cofounderDynamics?.decisionMaking?.conflictResolutionHistory ?? "Unknown",
        vetoRights: findings?.cofounderDynamics?.decisionMaking?.vetoRights ?? "Unknown",
        riskIfDisagreement: findings?.cofounderDynamics?.decisionMaking?.riskIfDisagreement ?? "Unknown",
      },
```

**5. Mettre a jour les types** dans `src/agents/types.ts`:

Ajouter les champs `decisionMaking` et `referenceCheckTemplate` aux interfaces `TeamInvestigatorFindings` et `CofounderDynamics`.

### Dependances
- F41 (memo depuis fact store): Le memo doit inclure les resultats du reference check template.

### Verification
1. Lancer une analyse sur un deal avec 2+ cofondateurs.
2. Verifier que le champ `decisionMaking` est rempli dans la reponse.
3. Verifier que `referenceCheckTemplate` contient au moins 2 personnes a appeler avec script.
4. Verifier que le template inclut des `redFlagAnswer` specifiques.

---

## F36 - PMF evalue sans protocole de collecte de donnees manquantes

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/customer-intel.ts`

Les tests PMF (lignes 316-323 du system prompt) definissent 6 tests: NRR > 120%, Sean Ellis > 40%, Organic/Referral > 20%, Sales cycle raccourcissant, Churn < 5%, NPS > 50.

**Probleme precis**: Quand un test renvoie `NOT_TESTABLE` (lignes 1084-1091 dans `transformPMF()`), le systeme se contente de l'enregistrer sans generer de **protocole de collecte** indiquant au BA comment obtenir la donnee manquante.

```typescript
// Ligne 1084-1091: transformPMF()
pmfTests: Array.isArray(pmf?.pmfTests)
  ? pmf.pmfTests.map((t) => ({
      test: t.test ?? "",
      result: validResults.includes(t.result as typeof validResults[number])
        ? t.result as typeof validResults[number]
        : "NOT_TESTABLE",
      evidence: t.evidence ?? "",
      // MANQUANT: Pas de "howToCollect" ou "dataCollectionProtocol"
    }))
  : [],
```

Quand le verdict est `NOT_DEMONSTRATED` (score 0-15, ligne 1052-1053), le BA recoit "Donnees insuffisantes" sans savoir **exactement quoi demander** au fondateur pour pouvoir tester le PMF.

### Correction

**1. Enrichir le type `PMFTest`** dans l'interface LLM et le type de sortie:

```typescript
// Dans l'interface pmfTests (customer-intel.ts, section du prompt ligne 607-628)
// Ajouter a chaque test:
"pmfTests": [
  {
    "test": "NRR > 120%",
    "result": "PASS|FAIL|PARTIAL|NOT_TESTABLE",
    "evidence": "Donnees si disponibles",
    "dataCollectionProtocol": {
      "dataNeeded": "NRR mensuel sur les 12 derniers mois, par cohorte",
      "howToRequest": "Demander un export du MRR par cohorte mensuelle depuis le CRM (HubSpot/Salesforce)",
      "questionForFounder": "Pouvez-vous nous fournir l'evolution du MRR par cohorte sur les 12 derniers mois?",
      "acceptableFormats": ["Export CSV du CRM", "Tableau MRR par mois avec detail expansion/contraction"],
      "redFlagIfRefused": "Un fondateur qui refuse de fournir ses donnees de retention cache un probleme",
      "estimatedTimeToCollect": "1-2 jours ouvrables",
      "alternativeProxy": "A defaut de NRR exact, demander le taux de renouvellement des contrats sur les 12 derniers mois"
    }
  }
]
```

**2. Modifier le system prompt** (apres la section "Tests PMF" ligne 314-323):

Ajouter dans les instructions:

```
### PROTOCOLE DE COLLECTE (OBLIGATOIRE POUR CHAQUE TEST NOT_TESTABLE)
Pour CHAQUE test marque NOT_TESTABLE, tu DOIS generer un dataCollectionProtocol avec:
- dataNeeded: Quelle donnee exacte est necessaire
- howToRequest: Comment le BA peut l'obtenir (quel export, quel outil)
- questionForFounder: Question non-confrontationnelle a poser
- acceptableFormats: Quels formats sont acceptables
- redFlagIfRefused: Ce que ca revele si le fondateur refuse
- estimatedTimeToCollect: Delai raisonnable
- alternativeProxy: Proxy acceptable si la donnee exacte n'est pas disponible
```

**3. Enrichir `transformPMF()`** (lignes 1034-1094):

```typescript
private transformPMF(pmf: LLMCustomerIntelResponse["findings"]["pmf"]): PMFAnalysis {
  // ... existing code ...

  return {
    // ... existing fields ...
    pmfTests: Array.isArray(pmf?.pmfTests)
      ? pmf.pmfTests.map((t) => ({
          test: t.test ?? "",
          result: validResults.includes(t.result as typeof validResults[number])
            ? t.result as typeof validResults[number]
            : "NOT_TESTABLE",
          evidence: t.evidence ?? "",
          dataCollectionProtocol: t.result === "NOT_TESTABLE" || t.result === "not_testable"
            ? {
                dataNeeded: t.dataCollectionProtocol?.dataNeeded ?? "Non specifie",
                howToRequest: t.dataCollectionProtocol?.howToRequest ?? "Demander directement au fondateur",
                questionForFounder: t.dataCollectionProtocol?.questionForFounder ?? "",
                acceptableFormats: t.dataCollectionProtocol?.acceptableFormats ?? [],
                redFlagIfRefused: t.dataCollectionProtocol?.redFlagIfRefused ?? "",
                estimatedTimeToCollect: t.dataCollectionProtocol?.estimatedTimeToCollect ?? "Non estime",
                alternativeProxy: t.dataCollectionProtocol?.alternativeProxy,
              }
            : undefined,
        }))
      : [],
  };
}
```

**4. Mettre a jour le type `PMFAnalysis`** dans `src/agents/types.ts`:

Ajouter `dataCollectionProtocol?` au type de chaque PMF test.

### Dependances
- F35 (reference check template): Meme pattern de "guide actionnable pour le BA".
- F41 (memo): Le memo doit inclure les protocoles de collecte comme next steps.

### Verification
1. Lancer une analyse sur un deal avec peu de donnees clients (pas de NRR, pas de churn mentionne).
2. Verifier que les tests PMF `NOT_TESTABLE` contiennent un `dataCollectionProtocol` complet.
3. Verifier que chaque protocole a un `questionForFounder` et un `redFlagIfRefused`.
4. Verifier que le protocole est actionnable (le BA sait exactement quoi demander).

---

## F37 - Pas de scoring comparatif reel vs pipeline BA utilisant la DB

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/synthesis-deal-scorer.ts`

Les champs `comparativeRanking` (lignes 1353-1362 dans `transformResponse()`) sont des **fallbacks a 50** quand le LLM ne fournit pas de valeur:

```typescript
// Lignes 1353-1362
comparativeRanking: {
  percentileOverall: data.findings?.marketPosition?.percentileOverall ??
                    data.comparativeRanking?.percentileOverall ?? 50, // FALLBACK LLM
  percentileSector: data.findings?.marketPosition?.percentileSector ??
                   data.comparativeRanking?.percentileSector ?? 50, // FALLBACK LLM
  percentileStage: data.findings?.marketPosition?.percentileStage ??
                  data.comparativeRanking?.percentileStage ?? 50, // FALLBACK LLM
  similarDealsAnalyzed: data.findings?.marketPosition?.similarDealsAnalyzed ??
                       data.comparativeRanking?.similarDealsAnalyzed ?? 0,
},
```

Le `MarketPosition` (lignes 85-99) est entierement genere par le LLM. Il n'y a **aucun calcul deterministe** qui positionne le deal par rapport aux deals reels de la Funding DB.

**Fichier secondaire**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestrator/index.ts`

L'orchestrateur charge les `fundingDbContext` (via `querySimilarDeals`) mais ces donnees sont transmises au LLM sous forme de texte. Le percentile est ensuite "devine" par le LLM au lieu d'etre calcule.

### Correction

**1. Creer un service de calcul de percentile deterministe**: `src/services/funding-db/percentile-calculator.ts`

```typescript
/**
 * Calcul deterministe du percentile d'un deal vs la Funding DB.
 * Aucun LLM utilise - pur calcul statistique.
 */

export interface DealPercentileResult {
  percentileOverall: number;
  percentileSector: number;
  percentileStage: number;
  similarDealsAnalyzed: number;
  sectorDealsCount: number;
  stageDealsCount: number;
  valuationPercentile: number | null;
  scoreDistribution: {
    p25: number;
    median: number;
    p75: number;
  };
  method: "EXACT" | "INTERPOLATED" | "INSUFFICIENT_DATA";
  calculationDetail: string;
}

export async function calculateDealPercentile(
  dealScore: number,
  dealSector: string | null,
  dealStage: string | null,
  dealValuation: number | null,
): Promise<DealPercentileResult> {
  // 1. Recuperer tous les deals de la DB avec un score existant
  const { prisma } = await import("@/lib/prisma");

  // Recuperer les analyses completees avec scores
  const analyses = await prisma.analysis.findMany({
    where: {
      status: "COMPLETED",
      results: { not: null },
    },
    include: {
      deal: {
        select: { sector: true, stage: true, valuationPre: true },
      },
    },
    orderBy: { completedAt: "desc" },
    take: 500, // Limiter pour performance
  });

  // Extraire les scores des analyses
  const allScores: number[] = [];
  const sectorScores: number[] = [];
  const stageScores: number[] = [];

  for (const analysis of analyses) {
    const results = analysis.results as Record<string, unknown> | null;
    if (!results) continue;

    // Extraire le score global du synthesis-deal-scorer
    const scorer = results["synthesis-deal-scorer"] as { data?: { overallScore?: number } } | undefined;
    const score = scorer?.data?.overallScore;
    if (typeof score !== "number") continue;

    allScores.push(score);

    if (dealSector && analysis.deal.sector?.toLowerCase().includes(dealSector.toLowerCase())) {
      sectorScores.push(score);
    }
    if (dealStage && analysis.deal.stage?.toLowerCase() === dealStage.toLowerCase()) {
      stageScores.push(score);
    }
  }

  // Calculer les percentiles
  const calcPercentile = (scores: number[], value: number): number => {
    if (scores.length === 0) return 50; // Pas assez de donnees
    const sorted = [...scores].sort((a, b) => a - b);
    const below = sorted.filter(s => s < value).length;
    return Math.round((below / sorted.length) * 100);
  };

  const calcDistribution = (scores: number[]) => {
    if (scores.length === 0) return { p25: 0, median: 0, p75: 0 };
    const sorted = [...scores].sort((a, b) => a - b);
    return {
      p25: sorted[Math.floor(sorted.length * 0.25)] ?? 0,
      median: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p75: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
    };
  };

  const percentileOverall = calcPercentile(allScores, dealScore);
  const percentileSector = sectorScores.length >= 5
    ? calcPercentile(sectorScores, dealScore)
    : percentileOverall; // Fallback si pas assez de deals secteur
  const percentileStage = stageScores.length >= 5
    ? calcPercentile(stageScores, dealScore)
    : percentileOverall;

  const method = allScores.length >= 20 ? "EXACT"
    : allScores.length >= 5 ? "INTERPOLATED"
    : "INSUFFICIENT_DATA";

  return {
    percentileOverall,
    percentileSector,
    percentileStage,
    similarDealsAnalyzed: allScores.length,
    sectorDealsCount: sectorScores.length,
    stageDealsCount: stageScores.length,
    valuationPercentile: null, // A implementer quand la DB a assez de donnees
    scoreDistribution: calcDistribution(allScores),
    method,
    calculationDetail: `Score ${dealScore} positionne au P${percentileOverall} sur ${allScores.length} deals (${sectorScores.length} dans le secteur, ${stageScores.length} au meme stage). Methode: ${method}.`,
  };
}
```

**2. Integrer dans `synthesis-deal-scorer.ts`**: Apres l'appel LLM (ligne 777), **overrider** les percentiles avec le calcul deterministe:

```typescript
// Dans transformResponse(), REMPLACER les lignes 1353-1362:
// D'abord calculer les percentiles deterministes
const dbPercentile = await calculateDealPercentile(
  overallScore,
  context.deal.sector,
  context.deal.stage,
  context.deal.valuationPre ? Number(context.deal.valuationPre) : null,
);

comparativeRanking: {
  percentileOverall: dbPercentile.percentileOverall,
  percentileSector: dbPercentile.percentileSector,
  percentileStage: dbPercentile.percentileStage,
  similarDealsAnalyzed: dbPercentile.similarDealsAnalyzed,
},
```

Note: Comme `transformResponse` est synchrone, il faudra soit rendre `execute()` responsable de l'appel async au percentile calculator et passer le resultat a `transformResponse`, soit rendre `transformResponse` async.

### Dependances
- F40 (delta re-analyse): Le percentile historique permet de comparer les positions entre analyses.

### Verification
1. Lancer 5+ analyses sur des deals differents.
2. Verifier que le percentile est calcule par le service, pas par le LLM.
3. Verifier que le `method` est "EXACT" ou "INTERPOLATED" (pas "INSUFFICIENT_DATA" si assez de deals).
4. Verifier que le `calculationDetail` montre le calcul.
5. Verifier que les percentiles changent quand on ajoute un nouveau deal a la DB.

---

## F38 - Tech DD sans acces code, pas de transparence sur la limitation

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/tech-stack-dd.ts`

Le system prompt (lignes 54-162) demande d'analyser la stack technique mais **ne mentionne jamais** la limitation fondamentale: l'agent analyse uniquement les **claims du deck** et n'a **aucun acces au code source**.

```typescript
// Ligne 54-162: buildSystemPrompt()
// Aucune mention de:
// - "Tu n'as PAS acces au code source"
// - "Ton analyse est basee UNIQUEMENT sur les documents fournis"
// - "Tes conclusions sur la qualite du code sont des INFERENCES, pas des faits"
```

Le scoring framework (lignes 96-102) attribue 36% a "Stack Technique" et 28% a "Dette Technique" sans **ponderer par le niveau de confiance**. Un score de 85/100 en "Dette Technique" base uniquement sur un deck est trompeur.

**Fichier secondaire**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/tech-ops-dd.ts`

Meme probleme: l'agent tech-ops-dd analyse la maturite technique sans acces au code.

### Correction

**1. Ajouter une section de transparence dans le system prompt** de `tech-stack-dd.ts`:

Apres la ligne 65 ("Les startups mentent souvent sur leur maturite technique"), ajouter:

```
# TRANSPARENCE SUR LES LIMITATIONS (OBLIGATOIRE)

## DISCLAIMER CRITIQUE:
Tu n'as PAS acces au code source de la startup. Ton analyse est basee UNIQUEMENT sur:
- Le pitch deck (slides techniques)
- La documentation technique si fournie
- Les claims du fondateur
- Le Context Engine (donnees externes)

## IMPACT SUR LE SCORING:
- Toute evaluation de la qualite du code est une INFERENCE, pas un fait
- Les scores de "Dette Technique" doivent etre marques comme "INFERRED_FROM_DECK"
- Le score global ne peut PAS depasser 75/100 sans acces au code
- Si le deck ne mentionne AUCUNE technologie: score max 50/100

## DANS LE NARRATIVE:
TOUJOURS inclure un paragraphe de transparence:
"Cette analyse est basee uniquement sur les documents fournis. Sans acces au code source,
les evaluations de dette technique et qualite de code sont des inferences basees sur
les indices indirects (taille equipe vs features, technos mentionnees, etc.).
Une revue de code par un CTO externe est recommandee avant investissement."
```

**2. Capper le score dans `normalizeResponse()`** (lignes 390-517):

Apres le calcul du score (ligne 401-412), ajouter:

```typescript
// CAP: Sans acces au code, le score technique ne peut pas depasser 75
const hasCodeAccess = false; // Toujours false pour l'instant
if (!hasCodeAccess) {
  score.value = Math.min(score.value, 75);

  // Ajouter la limitation dans meta
  if (!meta.limitations.includes("Analyse basee uniquement sur les documents, pas d'acces au code source")) {
    meta.limitations.push("Analyse basee uniquement sur les documents, pas d'acces au code source");
  }

  // Reduire la confiance
  meta.confidenceLevel = Math.min(meta.confidenceLevel, 60);
}
```

**3. Ajouter un champ `analysisReliability`** dans les findings:

```typescript
// Dans TechStackDDFindings, ajouter:
analysisReliability: {
  codeAccess: false,
  maxReliableScore: 75,
  inferredFields: ["codeQuality", "testCoverage", "technicalDebt.level"],
  verificationNeeded: [
    "Revue de code par CTO externe",
    "Audit de securite independant",
    "Verification de la couverture de tests",
  ],
  disclaimer: string;
}
```

**4. Appliquer la meme correction a `tech-ops-dd.ts`**: Meme pattern de transparence et de cap de score.

**5. Impacter le `synthesis-deal-scorer.ts`**: Dans la section Product/Tech (poids 15%), mentionner dans le prompt que le score est base sur des inferences si aucun acces code:

```typescript
// Dans le prompt de synthesis-deal-scorer, section Product/Tech:
// "ATTENTION: Si tech-stack-dd et tech-ops-dd n'ont pas eu acces au code,
// la dimension Product/Tech a une confiance reduite. Le score de cette dimension
// doit etre marque comme 'inference-based' dans la justification."
```

### Dependances
- F41 (memo depuis fact store): Le memo doit afficher clairement la limitation.

### Verification
1. Lancer une analyse sur un deal classique (deck sans details techniques).
2. Verifier que le score tech ne depasse pas 75.
3. Verifier que la limitation "pas d'acces au code" apparait dans `meta.limitations`.
4. Verifier que la `confidenceLevel` est cap a 60.
5. Verifier que le narrative contient le disclaimer de transparence.
6. Verifier que le memo final mentionne cette limitation.

---

## F39 - Coherence inter-agents insuffisante (couche deterministe manquante pour Tier 1)

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/contradiction-detector.ts`

Le contradiction-detector est **100% LLM** (ligne 352: `await this.llmCompleteJSON<LLMContradictionResponse>(prompt)`). Il n'y a aucune couche deterministe pre-LLM qui detecte les divergences de scores entre agents Tier 1.

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestration/tier3-coherence.ts`

Ce module deterministe (NO LLM) existe mais ne gere que la coherence **inter-Tier 3** (scenario-modeler vs devils-advocate vs synthesis-deal-scorer, lignes 1-14). Il ne gere **pas** la coherence Tier 1.

**Probleme precis**: Si le `financial-auditor` donne un score de 80/100 et le `customer-intel` donne un score de 25/100 pour le meme deal, aucun mecanisme deterministe ne detecte cette divergence de 55 points **avant** que le contradiction-detector (LLM) ne s'en occupe.

Le LLM peut rater des divergences numeriques evidentes car il ne "calcule" pas — il infere.

### Correction

Ce correctif est couvert par F34 (creation du module `tier1-cross-validation.ts`). En complement, il faut ajouter un **detecteur de divergence de scores deterministe**.

**1. Ajouter un detecteur de divergence dans `tier1-cross-validation.ts`**:

```typescript
// Ajouter a la fin de runTier1CrossValidation():

// --- DIVERGENCE DETECTOR: Scores Tier 1 ---
// Detecter les divergences de scores > 30 points entre agents Tier 1
const tier1Agents = [
  "financial-auditor", "team-investigator", "competitive-intel",
  "market-intelligence", "tech-stack-dd", "tech-ops-dd",
  "legal-regulatory", "gtm-analyst", "customer-intel",
  "exit-strategist", "deck-forensics", "cap-table-auditor",
];

const agentScores: { name: string; score: number }[] = [];
for (const agentName of tier1Agents) {
  const result = allResults[agentName];
  if (!result?.success) continue;
  const data = (result as { data?: Record<string, unknown> }).data;
  const score = (data?.score as { value?: number })?.value;
  if (typeof score === "number") {
    agentScores.push({ name: agentName, score });
  }
}

// Detecter les divergences majeures (> 30 points)
for (let i = 0; i < agentScores.length; i++) {
  for (let j = i + 1; j < agentScores.length; j++) {
    const delta = Math.abs(agentScores[i].score - agentScores[j].score);
    if (delta > 30) {
      validations.push({
        id: `CV-DIV-${i}-${j}`,
        type: "METRICS_VS_RETENTION" as const,
        severity: delta > 50 ? "CRITICAL" : "HIGH",
        agent1: agentScores[i].name,
        agent1Claim: `Score = ${agentScores[i].score}/100`,
        agent2: agentScores[j].name,
        agent2Data: `Score = ${agentScores[j].score}/100`,
        verdict: delta > 50 ? "CONTRADICTION" : "MAJOR_DIVERGENCE",
        detail: `Divergence de ${delta} points entre ${agentScores[i].name} (${agentScores[i].score}) et ${agentScores[j].name} (${agentScores[j].score}). Necessite investigation.`,
      });
    }
  }
}

// Detecter les agents outliers (score > 2 ecarts-types de la moyenne)
if (agentScores.length >= 5) {
  const mean = agentScores.reduce((s, a) => s + a.score, 0) / agentScores.length;
  const stdDev = Math.sqrt(agentScores.reduce((s, a) => s + Math.pow(a.score - mean, 2), 0) / agentScores.length);

  for (const agent of agentScores) {
    if (Math.abs(agent.score - mean) > 2 * stdDev) {
      warnings.push(`OUTLIER: ${agent.name} score ${agent.score} est a ${((agent.score - mean) / stdDev).toFixed(1)} ecarts-types de la moyenne (${mean.toFixed(0)} +/- ${stdDev.toFixed(0)})`);
    }
  }
}
```

**2. Injecter les divergences dans le prompt du `contradiction-detector.ts`**:

Dans `formatAllInputs()` (ligne 362), ajouter une section:

```typescript
// Ajouter apres Section 6 (Fact Store):
const crossValidation = context.tier1CrossValidation;
if (crossValidation && crossValidation.validations.length > 0) {
  sections.push(`## DIVERGENCES TIER 1 PRE-DETECTEES (Deterministe)
Les divergences suivantes ont ete detectees par le module de cross-validation:
${crossValidation.validations.map(v =>
  `- [${v.severity}] ${v.agent1} vs ${v.agent2}: ${v.detail}`
).join("\n")}

IMPORTANT: Confirme ou infirme ces divergences avec ton analyse approfondie.`);
}
```

### Dependances
- F34 (cross-validation projections vs GTM): Meme module.
- F55 (tests de coherence): Les divergences alimentent les tests.

### Verification
1. Creer un scenario ou le financial-auditor score 80 et le customer-intel score 30.
2. Verifier que la divergence est detectee par le module deterministe.
3. Verifier que le contradiction-detector recoit les divergences pre-detectees.
4. Verifier que le synthesis-deal-scorer integre les ajustements.

---

## F40 - Pas de gestion de la re-analyse follow-on/delta

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestrator/index.ts`

Le flag `isUpdate` existe (ligne 168) mais n'est utilise que pour le Tier 0 fact extraction (ligne 2062: `if (isUpdate) { existingFacts = await getCurrentFacts(deal.id) }`). Il n'y a **aucune comparaison** entre l'analyse precedente et la nouvelle.

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/prisma/schema.prisma`

Le modele `Analysis` (lignes 214-239) stocke `results` en JSON mais il n'y a **pas de champ snapshot** pour la comparaison, pas de `previousAnalysisId`, et pas de modele `AnalysisSnapshot`.

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/delta-indicator.tsx`

Le composant UI existe (82 lignes) et affiche des deltas (fleches vertes/rouges + pourcentages). Mais il n'a **aucune source de donnees** car le backend ne produit pas de deltas.

### Correction

**1. Ajouter des champs au schema Prisma**:

```prisma
model Analysis {
  // ... champs existants ...

  // NOUVEAU: Support re-analyse
  previousAnalysisId String?
  previousAnalysis   Analysis? @relation("AnalysisChain", fields: [previousAnalysisId], references: [id])
  nextAnalyses       Analysis[] @relation("AnalysisChain")
  isUpdate           Boolean @default(false)

  // Snapshot des scores pour comparaison rapide
  scoreSnapshot      Json?   // { overallScore, dimensionScores, redFlagCount, verdict }
}
```

**2. Creer un service de calcul de delta**: `src/services/analysis-delta/index.ts`

```typescript
export interface AnalysisDelta {
  previousAnalysisId: string;
  previousDate: string;
  currentDate: string;

  scoreDelta: {
    overall: { previous: number; current: number; delta: number; deltaPercent: number };
    dimensions: {
      dimension: string;
      previous: number;
      current: number;
      delta: number;
      significance: "MAJOR_IMPROVEMENT" | "IMPROVEMENT" | "STABLE" | "DECLINE" | "MAJOR_DECLINE";
    }[];
  };

  verdictChange: {
    previous: string;
    current: string;
    changed: boolean;
    direction: "UPGRADE" | "DOWNGRADE" | "STABLE";
  };

  redFlagDelta: {
    new: string[]; // Red flags apparus
    resolved: string[]; // Red flags disparus
    unchanged: string[];
    criticalDelta: number; // +/- red flags CRITICAL
  };

  factDelta: {
    newFacts: number;
    changedFacts: number;
    significantChanges: { factKey: string; oldValue: string; newValue: string; impact: string }[];
  };

  summary: string; // "Score ameliore de 52 a 68 (+16pts). 2 red flags resolus, 1 nouveau. Verdict passe de weak_pass a conditional_pass."
}

export async function calculateAnalysisDelta(
  currentAnalysisId: string,
  previousAnalysisId: string
): Promise<AnalysisDelta | null> {
  const { prisma } = await import("@/lib/prisma");

  const [current, previous] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: currentAnalysisId } }),
    prisma.analysis.findUnique({ where: { id: previousAnalysisId } }),
  ]);

  if (!current?.results || !previous?.results) return null;

  const currentResults = current.results as Record<string, unknown>;
  const previousResults = previous.results as Record<string, unknown>;

  // Extraire les scores du synthesis-deal-scorer
  const extractScore = (results: Record<string, unknown>) => {
    const scorer = results["synthesis-deal-scorer"] as { data?: { overallScore?: number; verdict?: string; dimensionScores?: { dimension: string; score: number }[] } } | undefined;
    return scorer?.data;
  };

  const currScore = extractScore(currentResults);
  const prevScore = extractScore(previousResults);

  if (!currScore || !prevScore) return null;

  const overallDelta = (currScore.overallScore ?? 0) - (prevScore.overallScore ?? 0);

  // Calculer les deltas par dimension
  const dimensionDeltas = (currScore.dimensionScores ?? []).map(curr => {
    const prev = (prevScore.dimensionScores ?? []).find(d => d.dimension === curr.dimension);
    const delta = curr.score - (prev?.score ?? curr.score);
    return {
      dimension: curr.dimension,
      previous: prev?.score ?? 0,
      current: curr.score,
      delta,
      significance: delta > 15 ? "MAJOR_IMPROVEMENT" as const
        : delta > 5 ? "IMPROVEMENT" as const
        : delta < -15 ? "MAJOR_DECLINE" as const
        : delta < -5 ? "DECLINE" as const
        : "STABLE" as const,
    };
  });

  // Extraire les red flags
  const extractRedFlags = (results: Record<string, unknown>): string[] => {
    const flags: string[] = [];
    for (const [, result] of Object.entries(results)) {
      const data = (result as { data?: { redFlags?: { title?: string }[] } })?.data;
      if (Array.isArray(data?.redFlags)) {
        flags.push(...data.redFlags.map(rf => rf.title ?? "").filter(Boolean));
      }
    }
    return [...new Set(flags)];
  };

  const currFlags = extractRedFlags(currentResults);
  const prevFlags = extractRedFlags(previousResults);

  return {
    previousAnalysisId,
    previousDate: previous.completedAt?.toISOString() ?? "",
    currentDate: current.completedAt?.toISOString() ?? "",
    scoreDelta: {
      overall: {
        previous: prevScore.overallScore ?? 0,
        current: currScore.overallScore ?? 0,
        delta: overallDelta,
        deltaPercent: prevScore.overallScore ? Math.round((overallDelta / prevScore.overallScore) * 100) : 0,
      },
      dimensions: dimensionDeltas,
    },
    verdictChange: {
      previous: prevScore.verdict ?? "unknown",
      current: currScore.verdict ?? "unknown",
      changed: prevScore.verdict !== currScore.verdict,
      direction: (currScore.overallScore ?? 0) > (prevScore.overallScore ?? 0)
        ? "UPGRADE" : (currScore.overallScore ?? 0) < (prevScore.overallScore ?? 0) ? "DOWNGRADE" : "STABLE",
    },
    redFlagDelta: {
      new: currFlags.filter(f => !prevFlags.includes(f)),
      resolved: prevFlags.filter(f => !currFlags.includes(f)),
      unchanged: currFlags.filter(f => prevFlags.includes(f)),
      criticalDelta: 0, // A calculer avec les severites
    },
    factDelta: { newFacts: 0, changedFacts: 0, significantChanges: [] },
    summary: `Score ${overallDelta >= 0 ? "ameliore" : "degrade"} de ${prevScore.overallScore} a ${currScore.overallScore} (${overallDelta >= 0 ? "+" : ""}${overallDelta}pts).`,
  };
}
```

**3. Integrer dans l'orchestrateur**: Dans la methode qui lance l'analyse (apres `completeAnalysis`):

```typescript
// Apres completeAnalysis(), si isUpdate:
if (isUpdate) {
  // Trouver l'analyse precedente
  const previousAnalysis = await prisma.analysis.findFirst({
    where: {
      dealId,
      status: "COMPLETED",
      id: { not: analysis.id },
    },
    orderBy: { completedAt: "desc" },
  });

  if (previousAnalysis) {
    // Lier les analyses
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { previousAnalysisId: previousAnalysis.id, isUpdate: true },
    });

    // Calculer le delta
    const delta = await calculateAnalysisDelta(analysis.id, previousAnalysis.id);

    // Stocker le delta dans les resultats
    if (delta) {
      const updatedResults = { ...analysisResults, _analysisDelta: delta };
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: { results: updatedResults as unknown as Prisma.InputJsonValue },
      });
    }
  }
}
```

**4. Exposer via API**: Creer un endpoint `/api/deals/[id]/analysis-delta` qui renvoie le delta pour alimenter le `DeltaIndicator`.

### Dependances
- F37 (scoring comparatif): Le percentile historique est enrichi par le delta.
- F41 (memo): Le memo doit inclure une section "Evolution depuis la derniere analyse".

### Verification
1. Lancer une premiere analyse sur un deal.
2. Modifier le deal (ajouter un document, changer la valo).
3. Lancer une re-analyse avec `isUpdate: true`.
4. Verifier que `previousAnalysisId` est renseigne.
5. Verifier que le delta est calcule et stocke dans `results._analysisDelta`.
6. Verifier que le `DeltaIndicator` fonctionne avec les donnees du delta.

---

## F41 - Memo non genere depuis le fact store verifie

### Diagnostic

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/memo-generator.ts`

La methode `execute()` (lignes 398-590) construit un prompt massif a partir des outputs agents (via `extractTier1Insights`, `extractTier2Insights`, `extractTier3Insights`) puis appelle un **unique LLM** qui synthetise tout.

Le fact store est injecte via `this.formatFactStoreData(context)` (ligne 448) mais c'est juste **une section de texte** dans un prompt de milliers de tokens. Le LLM peut:
- Ignorer des facts du fact store
- Halluciner des chiffres qui ne sont dans aucune source
- Tronquer des donnees importantes
- Presenter des projections comme des faits (meme si le fact store les marque `PROJECTED`)

```typescript
// Ligne 448: Le fact store est juste du texte dans le prompt
${this.formatFactStoreData(context) ?? ""}
// Le LLM peut l'ignorer ou le deformer
```

**Fichier**: `/Users/sacharebbouh/Desktop/angeldesk/src/services/fact-store/types.ts`

Le fact store a une infrastructure robuste avec `DataReliability` (lignes 54-60) et `ReliabilityClassification` (lignes 63-74), mais le memo-generator ne l'exploite pas pour **forcer** les chiffres du memo a venir du fact store.

### Correction

La correction consiste a faire du fact store la **source de verite** pour les chiffres du memo, au lieu de laisser le LLM les regenerer.

**1. Creer un pre-processeur de memo deterministe**: `src/agents/tier3/memo-fact-anchoring.ts`

```typescript
/**
 * MEMO FACT ANCHORING - Pre-processeur deterministe (NO LLM)
 *
 * Extrait du fact store les donnees verifiees qui DOIVENT apparaitre dans le memo.
 * Le LLM ne peut PAS modifier ces chiffres, seulement les contextualiser.
 */

import type { CurrentFact } from "@/services/fact-store/types";

export interface AnchoredMemoData {
  // Chiffres verifies qui ne peuvent PAS etre modifies par le LLM
  verifiedMetrics: {
    key: string;
    displayValue: string;
    reliability: string;
    source: string;
    isProjection: boolean;
  }[];

  // Chiffres qui DOIVENT etre marques comme projections
  projections: {
    key: string;
    displayValue: string;
    projectionPercent?: number;
    warning: string;
  }[];

  // Donnees non verifiables qui doivent etre signalees
  unverifiable: {
    key: string;
    displayValue: string;
    reason: string;
  }[];

  // Template de section financiere avec chiffres ancres
  financialSectionTemplate: string;
}

export function buildAnchoredMemoData(
  facts: CurrentFact[]
): AnchoredMemoData {
  const verifiedMetrics: AnchoredMemoData["verifiedMetrics"] = [];
  const projections: AnchoredMemoData["projections"] = [];
  const unverifiable: AnchoredMemoData["unverifiable"] = [];

  for (const fact of facts) {
    const reliability = fact.reliability?.reliability ?? "DECLARED";
    const isProjection = fact.reliability?.isProjection ?? false;

    if (reliability === "AUDITED" || reliability === "VERIFIED") {
      verifiedMetrics.push({
        key: fact.factKey,
        displayValue: fact.currentDisplayValue,
        reliability,
        source: fact.currentSource,
        isProjection: false,
      });
    } else if (isProjection || reliability === "PROJECTED") {
      projections.push({
        key: fact.factKey,
        displayValue: fact.currentDisplayValue,
        projectionPercent: fact.reliability?.temporalAnalysis?.projectionPercent,
        warning: `Ce chiffre est une PROJECTION (fiabilite: ${reliability}). ${fact.reliability?.reasoning ?? ""}`,
      });
    } else if (reliability === "UNVERIFIABLE") {
      unverifiable.push({
        key: fact.factKey,
        displayValue: fact.currentDisplayValue,
        reason: fact.reliability?.reasoning ?? "Source non verifiable",
      });
    } else {
      // DECLARED ou ESTIMATED
      verifiedMetrics.push({
        key: fact.factKey,
        displayValue: fact.currentDisplayValue,
        reliability,
        source: fact.currentSource,
        isProjection,
      });
    }
  }

  // Generer un template de section financiere avec chiffres ancres
  const financialFacts = facts.filter(f => f.category === "FINANCIAL");
  const financialLines = financialFacts.map(f => {
    const rel = f.reliability?.reliability ?? "DECLARED";
    const marker = rel === "PROJECTED" ? " [PROJECTION]" : rel === "ESTIMATED" ? " [ESTIME]" : "";
    return `- ${f.factKey}: ${f.currentDisplayValue}${marker} (Source: ${f.currentSource}, Fiabilite: ${rel})`;
  });

  const financialSectionTemplate = financialLines.length > 0
    ? `## CHIFFRES ANCRES DU FACT STORE (NE PAS MODIFIER)\n${financialLines.join("\n")}`
    : "";

  return { verifiedMetrics, projections, unverifiable, financialSectionTemplate };
}
```

**2. Modifier `memo-generator.ts`** pour utiliser le pre-processeur:

Dans `execute()`, avant l'appel LLM (avant ligne 586):

```typescript
// Importer et utiliser le fact anchoring
import { buildAnchoredMemoData } from "./memo-fact-anchoring";

// Dans execute(), apres les extractions d'insights:
const factStore = context.factStoreFormatted ? context.factStore ?? [] : [];
const anchoredData = buildAnchoredMemoData(factStore as CurrentFact[]);

// Ajouter dans le prompt (apres la section Fact Store):
const anchoredSection = anchoredData.financialSectionTemplate
  ? `\n${anchoredData.financialSectionTemplate}\n
REGLE ABSOLUE: Les chiffres ci-dessus proviennent du Fact Store verifie.
Tu DOIS les utiliser tels quels dans le memo. Tu ne peux PAS les arrondir, les modifier, ou les ignorer.
Si un chiffre est marque [PROJECTION], tu DOIS le presenter comme tel dans le memo.
Si un chiffre est marque [ESTIME], tu DOIS mentionner qu'il s'agit d'une estimation.`
  : "";
```

**3. Ajouter une validation post-LLM**: Apres la reponse du LLM, verifier que les chiffres ancres sont presents:

```typescript
// Dans normalizeResponse(), ajouter une verification:
private validateFactAnchoring(
  memoData: MemoGeneratorData,
  anchoredData: AnchoredMemoData
): string[] {
  const warnings: string[] = [];

  // Verifier que les metriques verifiees apparaissent dans le memo
  for (const metric of anchoredData.verifiedMetrics) {
    const memoText = JSON.stringify(memoData);
    if (!memoText.includes(metric.displayValue)) {
      warnings.push(`Metrique verifiee absente du memo: ${metric.key} = ${metric.displayValue}`);
    }
  }

  // Verifier que les projections sont marquees comme telles
  for (const proj of anchoredData.projections) {
    const memoText = JSON.stringify(memoData);
    if (memoText.includes(proj.displayValue) && !memoText.toLowerCase().includes("projection")) {
      warnings.push(`Projection presentee sans avertissement: ${proj.key} = ${proj.displayValue}`);
    }
  }

  return warnings;
}
```

### Dependances
- F34 (cross-validation): Les resultats de cross-validation enrichissent le fact store.
- F40 (delta): Le memo doit ancrer les deltas sur des faits verifies.

### Verification
1. Lancer une analyse complete sur un deal avec des donnees financieres.
2. Verifier que les chiffres du memo correspondent exactement au fact store.
3. Verifier que les projections sont marquees `[PROJECTION]` dans le memo.
4. Verifier que les metriques `UNVERIFIABLE` sont signalees.
5. Creer un cas ou le deck annonce "CA 500K" mais le fact store a "CA 380K DECLARED + 120K PROJECTED" et verifier que le memo mentionne la distinction.

---

## F55 - Pas de test de coherence pour detection de variance entre analyses

### Diagnostic

Il n'existe **aucun mecanisme automatise** qui detecte les variances significatives entre deux executions de la meme analyse sur le meme deal. Si on lance 2 fois la meme analyse, les scores peuvent varier de +/-20 points sans qu'aucune alerte ne soit levee.

**Fichiers concernes**:
- `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestrator/index.ts` - Aucun check de variance post-analyse.
- `/Users/sacharebbouh/Desktop/angeldesk/prisma/schema.prisma` - Le modele `Analysis` stocke un `dealFingerprint` (ligne 237) pour le cache, mais pas pour la detection de variance.

La variance peut venir de:
- Temperature LLM non-zero
- Prompts ambigus qui produisent des interpretations differentes
- Donnees Context Engine qui changent entre 2 appels
- Ordering non-deterministe des agents paralleles

### Correction

**1. Creer un service de detection de variance**: `src/services/analysis-variance/index.ts`

```typescript
/**
 * ANALYSIS VARIANCE DETECTOR
 *
 * Compare deux analyses sur le meme deal pour detecter des variances
 * inacceptables qui indiqueraient un probleme de reproductibilite.
 *
 * Seuils:
 * - Score global: > 10 points = WARNING, > 20 points = CRITICAL
 * - Score dimension: > 15 points = WARNING, > 25 points = CRITICAL
 * - Verdict change: TOUJOURS CRITICAL
 * - Red flags: CRITICAL flag present/absent entre 2 runs = CRITICAL
 */

export interface VarianceReport {
  dealId: string;
  analysisId1: string;
  analysisId2: string;
  fingerprint1: string | null;
  fingerprint2: string | null;
  fingerprintMatch: boolean; // true si meme fingerprint = meme donnees

  overallScoreVariance: {
    score1: number;
    score2: number;
    delta: number;
    severity: "OK" | "WARNING" | "CRITICAL";
  };

  dimensionVariances: {
    dimension: string;
    score1: number;
    score2: number;
    delta: number;
    severity: "OK" | "WARNING" | "CRITICAL";
  }[];

  verdictVariance: {
    verdict1: string;
    verdict2: string;
    changed: boolean;
    severity: "OK" | "CRITICAL";
  };

  redFlagVariance: {
    onlyInRun1: string[];
    onlyInRun2: string[];
    criticalFlipped: boolean;
    severity: "OK" | "WARNING" | "CRITICAL";
  };

  overallSeverity: "OK" | "WARNING" | "CRITICAL";
  reproducible: boolean; // true si variance acceptable
  explanation: string;
  recommendation: string;
}

export async function detectVariance(
  analysisId1: string,
  analysisId2: string
): Promise<VarianceReport | null> {
  const { prisma } = await import("@/lib/prisma");

  const [a1, a2] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: analysisId1 } }),
    prisma.analysis.findUnique({ where: { id: analysisId2 } }),
  ]);

  if (!a1?.results || !a2?.results) return null;
  if (a1.dealId !== a2.dealId) return null;

  const r1 = a1.results as Record<string, unknown>;
  const r2 = a2.results as Record<string, unknown>;

  // Extraire les scores
  const extractData = (results: Record<string, unknown>) => {
    const scorer = results["synthesis-deal-scorer"] as {
      data?: { overallScore?: number; verdict?: string; dimensionScores?: { dimension: string; score: number }[] }
    } | undefined;
    return scorer?.data;
  };

  const d1 = extractData(r1);
  const d2 = extractData(r2);
  if (!d1 || !d2) return null;

  const scoreDelta = Math.abs((d1.overallScore ?? 0) - (d2.overallScore ?? 0));
  const scoreSeverity = scoreDelta > 20 ? "CRITICAL" : scoreDelta > 10 ? "WARNING" : "OK";

  const verdictChanged = d1.verdict !== d2.verdict;
  const verdictSeverity = verdictChanged ? "CRITICAL" : "OK";

  // Dimension variances
  const dimVariances = (d1.dimensionScores ?? []).map(dim1 => {
    const dim2 = (d2.dimensionScores ?? []).find(d => d.dimension === dim1.dimension);
    const delta = Math.abs(dim1.score - (dim2?.score ?? dim1.score));
    return {
      dimension: dim1.dimension,
      score1: dim1.score,
      score2: dim2?.score ?? 0,
      delta,
      severity: (delta > 25 ? "CRITICAL" : delta > 15 ? "WARNING" : "OK") as "OK" | "WARNING" | "CRITICAL",
    };
  });

  // Red flag variance
  const extractFlags = (results: Record<string, unknown>): { title: string; severity: string }[] => {
    const flags: { title: string; severity: string }[] = [];
    for (const result of Object.values(results)) {
      const data = (result as { data?: { redFlags?: { title?: string; severity?: string }[] } })?.data;
      if (Array.isArray(data?.redFlags)) {
        flags.push(...data.redFlags.map(rf => ({ title: rf.title ?? "", severity: rf.severity ?? "MEDIUM" })));
      }
    }
    return flags;
  };

  const flags1 = extractFlags(r1).map(f => f.title);
  const flags2 = extractFlags(r2).map(f => f.title);
  const onlyIn1 = flags1.filter(f => !flags2.includes(f));
  const onlyIn2 = flags2.filter(f => !flags1.includes(f));

  // Check if any CRITICAL flag flipped
  const criticalFlags1 = extractFlags(r1).filter(f => f.severity === "CRITICAL").map(f => f.title);
  const criticalFlags2 = extractFlags(r2).filter(f => f.severity === "CRITICAL").map(f => f.title);
  const criticalFlipped = criticalFlags1.some(f => !criticalFlags2.includes(f)) ||
                          criticalFlags2.some(f => !criticalFlags1.includes(f));

  const overallSeverity =
    scoreSeverity === "CRITICAL" || verdictSeverity === "CRITICAL" || criticalFlipped
      ? "CRITICAL"
      : scoreSeverity === "WARNING" || dimVariances.some(d => d.severity === "WARNING")
        ? "WARNING"
        : "OK";

  return {
    dealId: a1.dealId,
    analysisId1,
    analysisId2,
    fingerprint1: a1.dealFingerprint,
    fingerprint2: a2.dealFingerprint,
    fingerprintMatch: a1.dealFingerprint === a2.dealFingerprint,
    overallScoreVariance: {
      score1: d1.overallScore ?? 0,
      score2: d2.overallScore ?? 0,
      delta: scoreDelta,
      severity: scoreSeverity as "OK" | "WARNING" | "CRITICAL",
    },
    dimensionVariances: dimVariances,
    verdictVariance: {
      verdict1: d1.verdict ?? "unknown",
      verdict2: d2.verdict ?? "unknown",
      changed: verdictChanged,
      severity: verdictSeverity as "OK" | "CRITICAL",
    },
    redFlagVariance: {
      onlyInRun1: onlyIn1,
      onlyInRun2: onlyIn2,
      criticalFlipped,
      severity: criticalFlipped ? "CRITICAL" : onlyIn1.length + onlyIn2.length > 3 ? "WARNING" : "OK",
    },
    overallSeverity,
    reproducible: overallSeverity === "OK",
    explanation: `Variance de ${scoreDelta} points sur le score global. ${verdictChanged ? "Le verdict a change!" : "Verdict stable."} ${criticalFlipped ? "ATTENTION: des red flags CRITICAL ont flip entre les runs." : ""}`,
    recommendation: overallSeverity === "CRITICAL"
      ? "Variance inacceptable. Verifier les prompts et la temperature LLM. Relancer l'analyse."
      : overallSeverity === "WARNING"
        ? "Variance notable. Les resultats sont utilisables mais la reproductibilite devrait etre amelioree."
        : "Variance acceptable. Les resultats sont reproductibles.",
  };
}
```

**2. Ajouter un endpoint API**: `src/app/api/deals/[id]/variance/route.ts`

```typescript
// GET /api/deals/[id]/variance
// Compare les 2 dernieres analyses du deal et renvoie le rapport de variance
```

**3. Integrer dans l'orchestrateur** (optionnel, pour logging):

Apres `completeAnalysis()`, si une analyse precedente avec le meme fingerprint existe, calculer automatiquement la variance et la loguer:

```typescript
// Post-analysis variance check
const previousSameFingerprint = await prisma.analysis.findFirst({
  where: {
    dealId,
    status: "COMPLETED",
    dealFingerprint: fingerprint,
    id: { not: analysis.id },
  },
  orderBy: { completedAt: "desc" },
});

if (previousSameFingerprint) {
  const variance = await detectVariance(analysis.id, previousSameFingerprint.id);
  if (variance && variance.overallSeverity !== "OK") {
    console.warn(`[Orchestrator] Variance ${variance.overallSeverity} detectee:`, variance.explanation);
  }
}
```

### Dependances
- F40 (delta re-analyse): La variance est un sous-ensemble du delta (meme fingerprint).
- F39 (coherence): Les variances inacceptables peuvent indiquer un probleme de coherence.

### Verification
1. Lancer 2 analyses identiques sur le meme deal (sans modifier le deal entre les 2).
2. Appeler l'endpoint de variance.
3. Verifier que la variance est < 10 points sur le score global (sinon = bug).
4. Si variance > 10: investiguer la temperature LLM et le non-determinisme des prompts.
5. Tester avec un deal modifie: la variance devrait etre attendue et le fingerprint different.

---

## Resume des dependances entre failles

```
F34 (cross-validation projections) ──────┐
                                          ├──> Module tier1-cross-validation.ts
F39 (coherence inter-agents) ─────────────┘
                                          │
F55 (tests de variance) ─────────────────>│ (alimente par les divergences)
                                          │
F37 (scoring comparatif DB) ──────────────> Service percentile-calculator.ts
                                          │
F40 (delta re-analyse) ──────────────────>│ (utilise les percentiles historiques)
                                          │
F41 (memo depuis fact store) ────────────>│ (ancre les chiffres verifies)
    │
    ├── F35 (template reference check) ──> Integre dans le memo
    └── F36 (protocole collecte PMF) ────> Integre dans les next steps du memo

F38 (transparence tech DD) ──────────────> Cap de score + disclaimer
```
