# Wave 3 - M2 : UX Advanced (10 failles MEDIUM)

> Spec de correction detaillee produite par l'Agent M2.
> Date : 2026-02-11
> Scope : F72, F73, F83, F85, F86, F87, F88, F89, F91, F92

---

## Table des matieres

1. [F72 - Memo non personnalise au profil BA](#f72)
2. [F73 - Questions non priorisees](#f73)
3. [F83 - Pas d'API publique ni integrations](#f83)
4. [F85 - Gestion erreur agent minimale](#f85)
5. [F86 - Chat IA deconnecte du contexte visuel](#f86)
6. [F87 - Dashboard pauvre en informations](#f87)
7. [F88 - Formulaire creation deal sans guidance](#f88)
8. [F89 - Table deals sans colonne score ni tri avance](#f89)
9. [F91 - Mobile UX degradee](#f91)
10. [F92 - Transparence couts unilaterale](#f92)

---

<a id="f72"></a>
## F72 -- Memo non personnalise au profil BA

### Diagnostic

**Fichiers concernes :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/memo-generator.ts`
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx`
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/settings/investment-preferences-form.tsx`

**Probleme identifie :**

Le memo-generator dispose d'une methode `formatBAInvestmentSection()` (lignes 983-1043) qui inclut une section "Profil Investisseur BA" basique dans le prompt LLM. Cependant :

1. **Pas de "portfolio overlap"** : Aucune reference au portefeuille existant du BA (deals deja analyses sur la plateforme). La methode ne recupere pas les deals precedents pour identifier les chevauchements sectoriels ou thematiques.

2. **Pas de "these d'investissement"** : Le formulaire de preferences (`investment-preferences-form.tsx`) ne capture que les champs basiques (ticket, stages, secteurs, risk tolerance, holding period). Il n'y a pas de champ "these d'investissement" (ex: "Je cible les SaaS B2B vertical en Europe avec NRR > 120%").

3. **Memo generique** : La section BA dans le prompt (ligne 447: `${baSection}`) se limite a un calcul de ticket et un alignement secteur/stage. Le LLM ne recoit pas d'instruction pour personnaliser la recommandation en fonction du profil specifique du BA.

4. **Affichage tier3-results.tsx** : Le composant MemoCard (dans tier3-results.tsx) affiche le memo sans section dediee au profil investisseur.

**Code problematique (memo-generator.ts, lignes 983-1043) :**
```typescript
private formatBAInvestmentSection(
  prefs: BAPreferences | undefined,
  deal: EnrichedAgentContext["deal"]
): string {
  // ... calcul ticket et alignement basique
  // Manque: portfolio overlap, these d'investissement, fit score
}
```

### Correction

#### 1. Etendre le type BAPreferences

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/services/benchmarks/types.ts`**

Ajouter les champs suivants au type `BAPreferences` :
```typescript
export interface BAPreferences {
  // ... champs existants ...

  /** These d'investissement libre du BA (ex: "SaaS B2B vertical, NRR > 120%, Europe") */
  investmentThesis?: string;

  /** Secteurs exclus (deja existant) */
  excludedSectors: Sector[];

  /** Co-investissement prefere (solo, syndicate, club deal) */
  coInvestmentPreference?: "solo" | "syndicate" | "club_deal";

  /** Portfolio actuel - noms des societes deja investies (pour overlap detection) */
  portfolioCompanies?: string[];

  /** Criteres "must-have" pour investir */
  mustHaveCriteria?: string[];
}
```

#### 2. Ajouter le champ "these d'investissement" au formulaire

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/settings/investment-preferences-form.tsx`**

Ajouter apres la section "Horizon d'investissement" (ligne 293) :
```tsx
{/* Investment Thesis */}
<div className="space-y-4">
  <h3 className="text-sm font-medium">These d&apos;investissement</h3>
  <textarea
    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    placeholder="Ex: Je cible les SaaS B2B vertical en Europe, series Seed/A, avec NRR > 120% et fondateurs techniques ayant deja scale un produit."
    value={currentPrefs.investmentThesis ?? ""}
    onChange={(e) => handleChange("investmentThesis", e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    Decrivez vos criteres d&apos;investissement. Le memo sera personnalise en fonction.
  </p>
</div>

{/* Must-Have Criteria */}
<div className="space-y-4">
  <h3 className="text-sm font-medium">Criteres obligatoires (must-have)</h3>
  <Input
    placeholder="Ex: Fondateur technique, ARR > 200K, marche Europe"
    value={(currentPrefs.mustHaveCriteria ?? []).join(", ")}
    onChange={(e) => handleChange("mustHaveCriteria", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
  />
  <p className="text-xs text-muted-foreground">
    Separez par des virgules. Le memo verifiera ces criteres.
  </p>
</div>
```

#### 3. Enrichir le prompt du memo-generator avec le profil complet

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/memo-generator.ts`**

Remplacer la methode `formatBAInvestmentSection` (lignes 983-1043) :

```typescript
private formatBAInvestmentSection(
  prefs: BAPreferences | undefined,
  deal: EnrichedAgentContext["deal"],
  previousDeals?: Array<{ name: string; sector: string; stage: string }>
): string {
  const amount = deal.amountRequested ? Number(deal.amountRequested) : 0;
  const valuation = deal.valuationPre ? Number(deal.valuationPre) : 0;
  const postMoney = valuation + amount;

  const lines: string[] = [];

  if (!prefs) {
    const genericTicket = Math.min(amount * 0.1, 50000);
    const genericOwnership = postMoney > 0 ? (genericTicket / postMoney) * 100 : 0;
    return `**Ticket suggere (calcul generique):** EUR${genericTicket.toLocaleString()} pour ${genericOwnership.toFixed(2)}% du capital post-money.

Note: Preferences BA non configurees - calcul base sur 10% du round plafonne a 50K EUR.`;
  }

  const ticketSize = calculateBATicketSize(amount, prefs);
  const ownership = postMoney > 0 ? (ticketSize / postMoney) * 100 : 0;

  // --- Section Ticket ---
  lines.push(`### Votre investissement potentiel`);
  lines.push(`- Ticket recommande: EUR${ticketSize.toLocaleString()}`);
  lines.push(`- Part au capital (post-money): ${ownership.toFixed(2)}%`);

  // --- Section These d'investissement ---
  if (prefs.investmentThesis) {
    lines.push(`\n### These d'investissement du BA`);
    lines.push(`"${prefs.investmentThesis}"`);
    lines.push(`\n**INSTRUCTION LLM:** Compare ce deal a la these ci-dessus. Indique clairement:`);
    lines.push(`- Ce qui COLLE avec la these (avec preuves)`);
    lines.push(`- Ce qui NE COLLE PAS (avec preuves)`);
    lines.push(`- Score d'alignement these (0-100%)`);
  }

  // --- Section Must-Have ---
  if (prefs.mustHaveCriteria && prefs.mustHaveCriteria.length > 0) {
    lines.push(`\n### Criteres obligatoires du BA`);
    for (const criterion of prefs.mustHaveCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push(`\n**INSTRUCTION LLM:** Pour chaque critere, indique MET / NON MET / INDETERMINE avec justification.`);
  }

  // --- Section Portfolio Overlap ---
  if (previousDeals && previousDeals.length > 0) {
    lines.push(`\n### Portfolio existant du BA (${previousDeals.length} deals)`);
    const sameSector = previousDeals.filter(d =>
      d.sector?.toLowerCase() === deal.sector?.toLowerCase()
    );
    const sameStage = previousDeals.filter(d =>
      d.stage?.toLowerCase() === deal.stage?.toLowerCase()
    );
    lines.push(`- Deals dans le meme secteur (${deal.sector}): ${sameSector.length}`);
    if (sameSector.length > 0) {
      lines.push(`  - ${sameSector.map(d => d.name).join(", ")}`);
    }
    lines.push(`- Deals au meme stage (${deal.stage}): ${sameStage.length}`);
    lines.push(`\n**INSTRUCTION LLM:** Analyse le portfolio overlap:`);
    lines.push(`- Synergies potentielles avec les deals existants`);
    lines.push(`- Risque de concentration sectorielle`);
    lines.push(`- Complementarite du portfolio`);
  }

  // --- Scenarios de retour ---
  const exitMultiples = [5, 10, 20];
  lines.push(`\n### Scenarios de retour (pour EUR${ticketSize.toLocaleString()} investi)`);
  for (const mult of exitMultiples) {
    const exitValue = ticketSize * mult;
    const irr = Math.pow(mult, 1 / prefs.expectedHoldingPeriod) - 1;
    lines.push(
      `- Exit x${mult}: EUR${exitValue.toLocaleString()} (IRR ~${(irr * 100).toFixed(0)}% sur ${prefs.expectedHoldingPeriod} ans)`
    );
  }

  // --- Alignement ---
  lines.push(`\n### Alignement avec votre profil`);
  const sectorLower = (deal.sector ?? "").toLowerCase();
  const isPreferredSector = prefs.preferredSectors.some((s) =>
    sectorLower.includes(s.toLowerCase())
  );
  const isExcludedSector = prefs.excludedSectors.some((s) =>
    sectorLower.includes(s.toLowerCase())
  );

  if (isExcludedSector) {
    lines.push(`- ATTENTION: Secteur ${deal.sector} est dans vos exclusions`);
  } else if (isPreferredSector) {
    lines.push(`- OK: Secteur ${deal.sector} correspond a vos preferences`);
  } else {
    lines.push(`- NEUTRE: Secteur ${deal.sector} n'est ni prefere ni exclu`);
  }

  lines.push(`- Tolerance au risque: ${prefs.riskTolerance}/5`);

  return lines.join("\n");
}
```

#### 4. Ajouter la recuperation des deals precedents dans execute()

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/memo-generator.ts`**

Dans la methode `execute()`, avant l'appel a `formatBAInvestmentSection`, ajouter :
```typescript
// Recuperer les deals precedents du BA pour portfolio overlap
const previousDeals = context.userDeals?.map(d => ({
  name: d.name,
  sector: d.sector ?? "",
  stage: d.stage ?? "",
})) ?? [];

const baSection = this.formatBAInvestmentSection(context.baPreferences, deal, previousDeals);
```

> Note : il faudra aussi enrichir `EnrichedAgentContext` avec un champ `userDeals` dans `src/agents/types.ts` et le peupler dans l'orchestrateur.

#### 5. Ajouter une section LLM dans le format de sortie

Ajouter au format JSON du prompt (section "questionsForFounder") :
```json
"investorFit": {
  "thesisAlignmentScore": 0-100,
  "thesisAlignmentDetails": "Ce qui colle / ne colle pas",
  "mustHaveChecklist": [
    {"criterion": "...", "status": "MET|NOT_MET|UNDETERMINED", "justification": "..."}
  ],
  "portfolioOverlap": {
    "synergies": ["..."],
    "concentrationRisk": "LOW|MEDIUM|HIGH",
    "recommendation": "..."
  }
}
```

#### 6. Afficher la section dans tier3-results.tsx

Ajouter un composant `InvestorFitCard` dans le MemoCard qui affiche :
- Score d'alignement these (barre de progression)
- Checklist must-have (vert/rouge/gris)
- Portfolio overlap (synergies + risque de concentration)

### Dependances
- F88 (formulaire deal) : les preferences BA doivent etre accessibles
- Schema Prisma : champ `investmentPreferences` (JSON) deja existant, juste etendre le contenu

### Verification
1. Creer un profil BA avec une these d'investissement dans `/settings`
2. Analyser un deal (full_analysis)
3. Verifier que le memo contient une section "Alignement avec votre these"
4. Verifier que la checklist must-have est presente
5. Verifier qu'avec 2+ deals, le portfolio overlap est mentionne

---

<a id="f73"></a>
## F73 -- Questions non priorisees

### Diagnostic

**Fichiers concernes :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/memo-generator.ts` (lignes 888-977)
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx` (lignes 724-749)
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/founder-responses.tsx`
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx` (lignes 1127-1173)

**Probleme identifie :**

1. **Consolidation backend OK mais non exposee** : Le `memo-generator` consolide les questions de tous les agents (methode `consolidateQuestions`, lignes 888-977) avec deduplication et tri par priorite. Cependant, cette consolidation est enfouie dans le prompt LLM et le resultat JSON `questionsForFounder` est limite a MAX 6 items (ligne 347).

2. **Pas de vue "Top 10 Questions"** : L'interface `analysis-panel.tsx` extrait les questions uniquement du `question-master` (lignes 724-749) et les affiche dans l'onglet "Reponses Fondateur" sans consolidation cross-agents.

3. **Questions dispersees** : Le Devil's Advocate genere ses propres questions (tier3-results.tsx, lignes 1127-1173), le memo genere les siennes, et le question-master aussi. Pas de vue unifiee.

4. **Pas d'algorithme de priorisation explicite** : Les questions sont triees par priorite brute (CRITICAL > HIGH > MEDIUM) mais sans scoring multi-criteres (impact sur la decision, nombre d'agents ayant pose une question similaire, lien avec les red flags).

**Code problematique (analysis-panel.tsx, lignes 724-749) :**
```typescript
// Extrait UNIQUEMENT du question-master, ignore les autres agents
const founderQuestions = useMemo((): AgentQuestion[] => {
  if (!displayedResult?.results) return [];
  const questionMasterResult = displayedResult.results["question-master"];
  // ...
}, [displayedResult]);
```

### Correction

#### 1. Creer un algorithme de priorisation cross-agents

**Nouveau fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/lib/question-consolidator.ts`**

```typescript
import type { AgentQuestion } from "@/components/deals/founder-responses";

interface RawAgentQuestion {
  question: string;
  priority?: string;
  category?: string;
  context?: string;
  whatToLookFor?: string;
  source?: string;
}

interface ConsolidatedQuestion extends AgentQuestion {
  /** Score de priorisation (0-100) */
  priorityScore: number;
  /** Nombre d'agents ayant pose une question similaire */
  crossAgentCount: number;
  /** Agents sources */
  sources: string[];
  /** Lie a un red flag ? */
  linkedToRedFlag: boolean;
  /** Impact sur la decision (debloque un PASS/INVEST) */
  decisionImpact: "BLOCKER" | "SIGNIFICANT" | "MINOR";
}

/**
 * Consolide et priorise les questions de TOUS les agents.
 * Algorithme de scoring :
 * - Base: CRITICAL=40, HIGH=30, MEDIUM=20, LOW=10
 * - Cross-agent bonus: +10 par agent supplementaire ayant pose une question similaire
 * - Red flag link: +15 si la question est liee a un red flag
 * - Decision impact: BLOCKER=+20, SIGNIFICANT=+10, MINOR=0
 */
export function consolidateAndPrioritizeQuestions(
  results: Record<string, { success: boolean; data?: unknown }>,
  redFlagTitles: string[]
): ConsolidatedQuestion[] {
  const allQuestions: Array<RawAgentQuestion & { agentName: string }> = [];

  // Extraire les questions de TOUS les agents
  for (const [agentName, result] of Object.entries(results)) {
    if (!result.success || !result.data) continue;
    const data = result.data as Record<string, unknown>;

    const questionArrays = [
      data.questions,
      data.questionsForFounder,
      data.criticalQuestions,
      data.followUpQuestions,
      (data.findings as Record<string, unknown>)?.founderQuestions,
    ];

    for (const questions of questionArrays) {
      if (!Array.isArray(questions)) continue;
      for (const q of questions) {
        if (typeof q === "string") {
          allQuestions.push({ question: q, agentName });
        } else if (q && typeof q === "object" && "question" in q) {
          allQuestions.push({ ...q, agentName });
        }
      }
    }
  }

  // Dedupliquer par similarite textuelle
  const consolidated = deduplicateQuestions(allQuestions);

  // Scorer chaque question
  const scored = consolidated.map((q) => {
    let score = 0;

    // Base score par priorite
    const prio = (q.priority ?? "MEDIUM").toUpperCase();
    if (prio === "CRITICAL") score += 40;
    else if (prio === "HIGH" || prio === "MUST_ASK") score += 30;
    else if (prio === "MEDIUM" || prio === "SHOULD_ASK") score += 20;
    else score += 10;

    // Bonus cross-agent
    score += Math.min((q.sources.length - 1) * 10, 30);

    // Bonus lien red flag
    const linkedToRedFlag = redFlagTitles.some(
      (rf) => q.question.toLowerCase().includes(rf.toLowerCase().slice(0, 20))
    );
    if (linkedToRedFlag) score += 15;

    // Decision impact heuristique
    const decisionImpact: "BLOCKER" | "SIGNIFICANT" | "MINOR" =
      prio === "CRITICAL" ? "BLOCKER" :
      prio === "HIGH" ? "SIGNIFICANT" : "MINOR";
    if (decisionImpact === "BLOCKER") score += 20;
    else if (decisionImpact === "SIGNIFICANT") score += 10;

    return {
      ...q,
      priorityScore: Math.min(score, 100),
      linkedToRedFlag,
      decisionImpact,
    };
  });

  // Trier par score decroissant
  return scored.sort((a, b) => b.priorityScore - a.priorityScore);
}

function deduplicateQuestions(
  questions: Array<RawAgentQuestion & { agentName: string }>
): Array<ConsolidatedQuestion> {
  const seen = new Map<string, ConsolidatedQuestion>();

  for (const q of questions) {
    if (!q.question) continue;
    const key = q.question.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);

    if (!seen.has(key)) {
      seen.set(key, {
        id: `cq-${seen.size + 1}`,
        question: q.question,
        category: mapCategory(q.category ?? inferCategory(q.agentName)),
        priority: mapPriority(q.priority ?? "MEDIUM"),
        agentSource: q.agentName,
        priorityScore: 0,
        crossAgentCount: 1,
        sources: [q.agentName],
        linkedToRedFlag: false,
        decisionImpact: "MINOR",
      });
    } else {
      const existing = seen.get(key)!;
      existing.crossAgentCount += 1;
      if (!existing.sources.includes(q.agentName)) {
        existing.sources.push(q.agentName);
      }
      // Garder la priorite la plus haute
      const newPrio = mapPriority(q.priority ?? "MEDIUM");
      if (prioRank(newPrio) < prioRank(existing.priority)) {
        existing.priority = newPrio;
      }
    }
  }

  return Array.from(seen.values());
}

function mapCategory(cat: string): AgentQuestion["category"] {
  const upper = cat.toUpperCase();
  const valid = ["FINANCIAL", "TEAM", "MARKET", "PRODUCT", "LEGAL", "TRACTION", "OTHER"];
  return valid.includes(upper) ? upper as AgentQuestion["category"] : "OTHER";
}

function mapPriority(p: string): AgentQuestion["priority"] {
  const upper = p.toUpperCase();
  if (upper === "CRITICAL") return "CRITICAL";
  if (upper === "HIGH" || upper === "MUST_ASK") return "HIGH";
  if (upper === "MEDIUM" || upper === "SHOULD_ASK") return "MEDIUM";
  return "LOW";
}

function prioRank(p: AgentQuestion["priority"]): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[p];
}

function inferCategory(agentName: string): string {
  if (agentName.includes("team") || agentName.includes("founder")) return "TEAM";
  if (agentName.includes("financial") || agentName.includes("cap-table")) return "FINANCIAL";
  if (agentName.includes("market") || agentName.includes("competitive")) return "MARKET";
  if (agentName.includes("legal")) return "LEGAL";
  if (agentName.includes("tech")) return "PRODUCT";
  return "OTHER";
}
```

#### 2. Modifier analysis-panel.tsx pour utiliser la consolidation

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx`**

Remplacer le `founderQuestions` useMemo (lignes 724-749) :

```typescript
import { consolidateAndPrioritizeQuestions } from "@/lib/question-consolidator";

// Extract and consolidate questions from ALL agents (not just question-master)
const { founderQuestions, top10Questions } = useMemo(() => {
  if (!displayedResult?.results) return { founderQuestions: [], top10Questions: [] };

  // Collect red flag titles for cross-referencing
  const redFlagTitles: string[] = [];
  for (const result of Object.values(displayedResult.results)) {
    if (!result.success || !result.data) continue;
    const data = result.data as Record<string, unknown>;
    if (Array.isArray(data.redFlags)) {
      for (const rf of data.redFlags as Array<{ title?: string }>) {
        if (rf.title) redFlagTitles.push(rf.title);
      }
    }
  }

  const consolidated = consolidateAndPrioritizeQuestions(displayedResult.results, redFlagTitles);

  return {
    founderQuestions: consolidated,
    top10Questions: consolidated.slice(0, 10),
  };
}, [displayedResult]);
```

#### 3. Ajouter un composant "Top 10 Questions" dans l'onglet Resultats

Ajouter dans la TabsContent "results" de analysis-panel.tsx, apres les Tier3Results :

```tsx
{/* Top 10 Questions Consolidees */}
{top10Questions.length > 0 && displayedResult.success && (
  <Card className="border-2 border-blue-100">
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          Top 10 Questions a Poser
        </CardTitle>
        <Badge variant="outline">{top10Questions.length} questions consolidees</Badge>
      </div>
      <CardDescription>
        Questions priorisees de {new Set(top10Questions.flatMap(q => q.sources)).size} agents
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        {top10Questions.map((q, i) => (
          <div key={q.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{q.question}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={q.priority === "CRITICAL" ? "destructive" : q.priority === "HIGH" ? "default" : "secondary"} className="text-xs">
                  {q.priority}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {q.sources.length > 1
                    ? `${q.sources.length} agents (${q.sources.join(", ")})`
                    : q.agentSource}
                </span>
                {q.linkedToRedFlag && (
                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                    Lie a un red flag
                  </Badge>
                )}
              </div>
            </div>
            <div className="shrink-0">
              <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center">
                <span className="text-xs font-bold text-blue-700">{q.priorityScore}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)}
```

### Dependances
- F72 (memo) : le memo genere aussi des questions qui doivent etre incluses
- F85 (erreurs) : si un agent echoue, ses questions manquent -- le Top 10 doit mentionner les agents manquants

### Verification
1. Lancer une analyse full_analysis (Tier 1 + 2 + 3)
2. Verifier que la section "Top 10 Questions a Poser" apparait dans l'onglet Resultats
3. Verifier que les questions viennent de PLUSIEURS agents (pas uniquement question-master)
4. Verifier que les questions liees a des red flags sont marquees
5. Verifier que le score de priorisation est coherent (CRITICAL + multi-agents > MEDIUM + single)

---

<a id="f83"></a>
## F83 -- Pas d'API publique ni integrations

### Diagnostic

**Fichiers concernes :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/app/api/` (routes internes uniquement)

**Probleme identifie :**

Aucune API publique documentee. Toutes les routes API sont internes (protegees par `requireAuth()` via session Clerk). Pas de system de tokens API, pas de documentation OpenAPI, pas de webhooks pour integrations tierces.

### Correction (SPEC UNIQUEMENT - pas d'implementation)

#### Spec d'API REST publique Angel Desk

##### Authentication
- **Methode** : API Key (Bearer token dans le header `Authorization`)
- **Generation** : Page `/settings/api` pour generer/revoquer des cles
- **Format** : `adk_live_xxxxxxxxxxxxxxxxxxxx` (prefix + 24 chars aleatoires)
- **Stockage** : Table `ApiKey` avec hash bcrypt, userId, name, lastUsedAt, createdAt, expiresAt
- **Rate Limits** :
  - FREE : 100 requetes/heure
  - PRO : 1000 requetes/heure
  - Headers standard : `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

##### Base URL
```
https://api.angeldesk.io/v1
```

##### Endpoints

**Deals**
```
GET    /v1/deals                    # Liste des deals (pagination, filtres)
POST   /v1/deals                    # Creer un deal
GET    /v1/deals/:id                # Detail d'un deal
PATCH  /v1/deals/:id                # Modifier un deal
DELETE /v1/deals/:id                # Supprimer un deal
```

**Analyses**
```
POST   /v1/deals/:id/analyses       # Lancer une analyse
GET    /v1/deals/:id/analyses       # Historique des analyses
GET    /v1/deals/:id/analyses/:aid  # Resultat detaille d'une analyse
```

**Documents**
```
POST   /v1/deals/:id/documents      # Upload un document (multipart)
GET    /v1/deals/:id/documents      # Liste des documents
DELETE /v1/deals/:id/documents/:did # Supprimer un document
```

**Red Flags**
```
GET    /v1/deals/:id/red-flags      # Red flags d'un deal
PATCH  /v1/deals/:id/red-flags/:rid # Marquer comme resolu/ignore
```

**Webhooks**
```
POST   /v1/webhooks                 # Enregistrer un webhook
GET    /v1/webhooks                 # Liste des webhooks
DELETE /v1/webhooks/:id             # Supprimer un webhook
```

**Events webhook** :
- `analysis.completed`
- `analysis.failed`
- `red_flag.detected`
- `deal.created`
- `deal.updated`

##### Format de reponse standard
```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-02-11T10:00:00Z"
  }
}
```

##### Erreurs
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retryAfter": 60
  }
}
```

##### Integrations cibles (Phase 2)
- **CRM** : HubSpot, Pipedrive (sync deals bidirectionnel)
- **Airtable** : Export analyses et red flags
- **Slack** : Notifications temps reel (analyse terminee, red flag critique)
- **DocuSign** : Lien direct pour signature term sheet
- **Zapier** : Connecteur generique via webhooks

##### Implementation technique
- Nouveau middleware `/src/middleware/api-auth.ts` pour valider les API keys
- Routes dans `/src/app/api/v1/` (separation des routes internes)
- Table Prisma `ApiKey` et `Webhook`
- Rate limiter Redis (ou in-memory pour MVP)

### Dependances
- Aucune autre faille directement liee
- PRO-only : les API keys ne sont disponibles que pour les utilisateurs PRO

### Verification
- N/A (spec uniquement, pas d'implementation)
- A verifier via Postman/curl une fois implemente

---

<a id="f85"></a>
## F85 -- Gestion erreur agent minimale

### Diagnostic

**Fichiers concernes :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx` (lignes 1243-1267, 1273-1298)
- `/Users/sacharebbouh/Desktop/angeldesk/src/lib/analysis-constants.ts` (lignes 166-186 : `formatErrorMessage`)

**Probleme identifie :**

1. **Badge d'erreur tronque** (analysis-panel.tsx, lignes 1260-1263) :
```tsx
{agentResult.error && (
  <Badge variant="destructive" className="max-w-[200px] truncate" title={agentResult.error}>
    {formatErrorMessage(agentResult.error)}
  </Badge>
)}
```
Le badge est limite a 200px avec `truncate`. L'utilisateur voit "Timeout" ou "Erreur serveur" sans plus de detail.

2. **formatErrorMessage trop simplifie** (analysis-constants.ts, lignes 166-186) :
```typescript
export function formatErrorMessage(error: string): string {
  if (error.includes("timeout") || error.includes("Timeout")) {
    return "Timeout";
  }
  // ... autres cas aussi generiques
}
```
Aucune indication de quel agent a echoue, ni pourquoi, ni quel est l'impact sur l'analyse globale.

3. **Pas d'impact communique** : L'utilisateur ne sait pas que l'echec du `financial-auditor` signifie l'absence de toute metrique financiere dans l'analyse.

### Correction

#### 1. Creer un mapping impact par agent

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/lib/agent-error-impact.ts`**

```typescript
/** Impact de l'echec de chaque agent sur l'analyse globale */
export const AGENT_ERROR_IMPACT: Record<string, {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  missingAnalysis: string;
  recommendation: string;
}> = {
  "financial-auditor": {
    severity: "CRITICAL",
    missingAnalysis: "Audit financier complet (metriques, valorisation, unit economics)",
    recommendation: "Relancez l'analyse. Sans audit financier, le scoring et le memo sont incomplets.",
  },
  "team-investigator": {
    severity: "CRITICAL",
    missingAnalysis: "Investigation equipe (verification background, red flags fondateurs)",
    recommendation: "Relancez l'analyse. L'equipe represente 25% du score final.",
  },
  "deck-forensics": {
    severity: "HIGH",
    missingAnalysis: "Analyse forensique du deck (coherence chiffres, red flags visuels)",
    recommendation: "Les chiffres du deck n'ont pas ete verifies automatiquement.",
  },
  "competitive-intel": {
    severity: "HIGH",
    missingAnalysis: "Intelligence concurrentielle (concurrents, moat, menaces)",
    recommendation: "L'analyse concurrentielle est manquante. Verifiez manuellement.",
  },
  "market-intelligence": {
    severity: "MEDIUM",
    missingAnalysis: "Analyse de marche (TAM/SAM/SOM, timing, tendances)",
    recommendation: "Les donnees de marche ne sont pas disponibles dans cette analyse.",
  },
  "tech-stack-dd": {
    severity: "MEDIUM",
    missingAnalysis: "Due diligence technique (stack, scalabilite, dette technique)",
    recommendation: "L'evaluation technique est manquante.",
  },
  "tech-ops-dd": {
    severity: "MEDIUM",
    missingAnalysis: "Operations techniques (maturite, securite, IP)",
    recommendation: "L'evaluation ops/securite est manquante.",
  },
  "legal-regulatory": {
    severity: "MEDIUM",
    missingAnalysis: "Analyse legale et reglementaire",
    recommendation: "Les risques legaux n'ont pas ete evalues.",
  },
  "cap-table-auditor": {
    severity: "MEDIUM",
    missingAnalysis: "Audit cap table (dilution, clauses, droits)",
    recommendation: "La table de capitalisation n'a pas ete auditee.",
  },
  "gtm-analyst": {
    severity: "LOW",
    missingAnalysis: "Analyse Go-to-Market (strategie, canaux, CAC)",
    recommendation: "L'analyse GTM est manquante mais non bloquante.",
  },
  "customer-intel": {
    severity: "LOW",
    missingAnalysis: "Intelligence client (retention, NPS, concentration)",
    recommendation: "Les metriques client ne sont pas disponibles.",
  },
  "exit-strategist": {
    severity: "LOW",
    missingAnalysis: "Strategie de sortie (acquireurs, timeline, multiples)",
    recommendation: "L'analyse de sortie est manquante.",
  },
  "question-master": {
    severity: "LOW",
    missingAnalysis: "Generation des questions pour le fondateur",
    recommendation: "Les questions automatiques ne sont pas disponibles.",
  },
  "synthesis-deal-scorer": {
    severity: "CRITICAL",
    missingAnalysis: "Score final synthetique et recommandation",
    recommendation: "Le score final n'a pas pu etre calcule. Relancez l'analyse.",
  },
  "scenario-modeler": {
    severity: "HIGH",
    missingAnalysis: "Modelisation des scenarios (BULL/BASE/BEAR/CATASTROPHIC)",
    recommendation: "Les scenarios de retour ne sont pas disponibles.",
  },
  "devils-advocate": {
    severity: "HIGH",
    missingAnalysis: "Analyse contradictoire (kill reasons, blind spots)",
    recommendation: "L'avocat du diable n'a pas pu challenger la these.",
  },
  "contradiction-detector": {
    severity: "MEDIUM",
    missingAnalysis: "Detection des contradictions entre agents",
    recommendation: "Les contradictions n'ont pas ete detectees automatiquement.",
  },
  "memo-generator": {
    severity: "HIGH",
    missingAnalysis: "Memo d'investissement complet",
    recommendation: "Le memo n'a pas pu etre genere. Les resultats individuels restent disponibles.",
  },
};

export function getAgentErrorImpact(agentName: string) {
  return AGENT_ERROR_IMPACT[agentName] ?? {
    severity: "LOW" as const,
    missingAnalysis: `Analyse de ${agentName}`,
    recommendation: "Un agent a echoue. Resultats partiels disponibles.",
  };
}

export function formatDetailedError(agentName: string, error: string): {
  shortMessage: string;
  detailedMessage: string;
  impact: typeof AGENT_ERROR_IMPACT[string];
  errorType: "timeout" | "rate_limit" | "auth" | "server" | "credits" | "unknown";
} {
  let errorType: "timeout" | "rate_limit" | "auth" | "server" | "credits" | "unknown" = "unknown";
  let shortMessage = error;

  if (error.includes("timeout") || error.includes("Timeout")) {
    errorType = "timeout";
    shortMessage = "Delai depasse";
  } else if (error.includes("429") || error.includes("rate limit")) {
    errorType = "rate_limit";
    shortMessage = "Limite API atteinte";
  } else if (error.includes("401") || error.includes("Unauthorized")) {
    errorType = "auth";
    shortMessage = "Erreur d'authentification";
  } else if (error.includes("500") || error.includes("Internal")) {
    errorType = "server";
    shortMessage = "Erreur serveur LLM";
  } else if (error.includes("402") || error.includes("credits")) {
    errorType = "credits";
    shortMessage = "Credits insuffisants";
  }

  const impact = getAgentErrorImpact(agentName);

  return {
    shortMessage,
    detailedMessage: error,
    impact,
    errorType,
  };
}
```

#### 2. Remplacer le badge d'erreur dans analysis-panel.tsx

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx`**

Remplacer les blocs de badge d'erreur (lignes 1260-1263 et 1290-1293) par :

```tsx
import { formatDetailedError, getAgentErrorImpact } from "@/lib/agent-error-impact";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Dans le rendu de chaque agent (ligne ~1248-1266) :
{agentResult.error && (() => {
  const errorInfo = formatDetailedError(name, agentResult.error);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="destructive"
            className={cn(
              "cursor-help",
              errorInfo.impact.severity === "CRITICAL" && "bg-red-600 animate-pulse",
              errorInfo.impact.severity === "HIGH" && "bg-orange-600",
            )}
          >
            {errorInfo.shortMessage}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm p-3">
          <div className="space-y-2">
            <p className="font-semibold text-sm">
              {formatAgentName(name)} - {errorInfo.shortMessage}
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Impact :</strong> {errorInfo.impact.missingAnalysis}
            </p>
            <p className="text-xs">
              {errorInfo.impact.recommendation}
            </p>
            {errorInfo.detailedMessage !== errorInfo.shortMessage && (
              <p className="text-xs text-muted-foreground/70 font-mono">
                {errorInfo.detailedMessage.slice(0, 200)}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
})()}
```

#### 3. Ajouter un bandeau resume des erreurs en haut des resultats

Ajouter dans analysis-panel.tsx, dans la TabsContent "results", avant les Tier3Results :

```tsx
{/* Error Summary Banner - Show if any agent failed */}
{(() => {
  const failedAgents = displayedResult?.results
    ? Object.entries(displayedResult.results).filter(([, r]) => !r.success)
    : [];
  if (failedAgents.length === 0) return null;

  const criticalFailures = failedAgents.filter(([name]) =>
    getAgentErrorImpact(name).severity === "CRITICAL"
  );

  return (
    <Card className={criticalFailures.length > 0 ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className={cn("h-5 w-5 shrink-0 mt-0.5", criticalFailures.length > 0 ? "text-red-600" : "text-amber-600")} />
          <div>
            <p className="font-medium text-sm">
              {failedAgents.length} agent{failedAgents.length > 1 ? "s" : ""} en echec
              {criticalFailures.length > 0 && ` dont ${criticalFailures.length} critique${criticalFailures.length > 1 ? "s" : ""}`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {failedAgents.map(([name]) => {
                const impact = getAgentErrorImpact(name);
                return (
                  <li key={name} className="text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] mr-1">{impact.severity}</Badge>
                    <strong>{formatAgentName(name)}</strong>: {impact.missingAnalysis}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
})()}
```

### Dependances
- F73 (questions) : si question-master echoue, le Top 10 doit mentionner la source manquante

### Verification
1. Simuler un timeout sur un agent (augmenter artificiellement le timeout a 1ms)
2. Verifier que le badge affiche "Delai depasse" au lieu de "Timeout"
3. Survoler le badge : verifier que le tooltip montre l'impact et la recommandation
4. Verifier le bandeau resume en haut des resultats

---

<a id="f86"></a>
## F86 -- Chat IA deconnecte du contexte visuel

### Diagnostic

**Fichiers concernes :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/chat/deal-chat-panel.tsx` (lignes 479-545)
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/chat/chat-wrapper.tsx`
- `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/[dealId]/page.tsx` (ligne 404)

**Probleme identifie :**

1. **Chat en overlay plein ecran** : Le `DealChatPanel` (lignes 479-484) utilise un positionnement `fixed` qui recouvre completement le contenu sur mobile et 40% de l'ecran sur desktop :
```tsx
<Card className={cn(
  "fixed inset-0 md:inset-auto md:right-4 md:top-20 md:bottom-4 md:w-[40%] md:min-w-[360px] md:max-w-[600px]",
  "flex flex-col z-50 shadow-lg border bg-background py-0 gap-0 rounded-none md:rounded-xl"
)}>
```

2. **Pas de split view** : L'utilisateur ne peut pas voir les resultats d'analyse ET poser des questions en meme temps. Il doit fermer le chat pour consulter les resultats, puis le rouvrir.

3. **Le chat ne sait pas ce que l'utilisateur regarde** : Le chat n'a pas d'information sur l'onglet actif (Overview, Analyse IA, Documents, etc.) ni sur la section visible.

### Correction

#### 1. Transformer le layout de la page deal en split view conditionnel

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/[dealId]/page.tsx`**

Modifier la fin du fichier (ligne 400+) :

Remplacer :
```tsx
{/* Chat IA flottant - accessible sur tous les onglets */}
<ChatWrapper dealId={deal.id} dealName={deal.name} />
```

Par :
```tsx
{/* Chat IA avec mode split view */}
<ChatWrapper dealId={deal.id} dealName={deal.name} mode="split" />
```

#### 2. Modifier ChatWrapper pour supporter le mode split

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/chat/chat-wrapper.tsx`**

```tsx
"use client";

import { memo, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles, PanelRightOpen, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DealChatPanel = dynamic(
  () =>
    import("./deal-chat-panel").then((mod) => ({
      default: mod.DealChatPanel,
    })),
  { ssr: false }
);

function prefetchChatPanel() {
  import("./deal-chat-panel");
}

interface ChatWrapperProps {
  dealId: string;
  dealName: string;
  mode?: "overlay" | "split";
}

export const ChatWrapper = memo(function ChatWrapper({
  dealId,
  dealName,
  mode = "overlay",
}: ChatWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  // Mode split: affiche le chat en panneau lateral droit
  if (mode === "split" && isOpen) {
    return (
      <div className="fixed inset-y-0 right-0 z-40 hidden lg:flex lg:w-[400px] xl:w-[450px] border-l bg-background shadow-xl">
        <DealChatPanel
          dealId={dealId}
          dealName={dealName}
          isOpen={isOpen}
          onClose={handleClose}
          variant="inline"
        />
      </div>
    );
  }

  return (
    <>
      {!isOpen && (
        <Button
          onClick={handleOpen}
          onMouseEnter={prefetchChatPanel}
          size="lg"
          className="fixed right-4 bottom-4 z-40 h-12 rounded-full shadow-lg gap-2 px-5"
          aria-label="Ouvrir l'analyste IA"
        >
          <Sparkles className="size-5" />
          <span className="text-sm font-medium hidden sm:inline">Analyste IA</span>
        </Button>
      )}
      <DealChatPanel
        dealId={dealId}
        dealName={dealName}
        isOpen={isOpen}
        onClose={handleClose}
      />
    </>
  );
});
```

#### 3. Modifier DealChatPanel pour supporter la variante "inline"

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/chat/deal-chat-panel.tsx`**

Ajouter la prop `variant` a l'interface :
```typescript
interface DealChatPanelProps {
  dealId: string;
  dealName: string;
  isOpen: boolean;
  onClose: () => void;
  variant?: "overlay" | "inline";
}
```

Modifier le rendu du Card (lignes 479-484) :
```tsx
<Card
  className={cn(
    variant === "inline"
      ? "flex flex-col h-full border-0 shadow-none py-0 gap-0 rounded-none"
      : "fixed inset-0 md:inset-auto md:right-4 md:top-20 md:bottom-4 md:w-[40%] md:min-w-[360px] md:max-w-[600px] flex flex-col z-50 shadow-lg border bg-background py-0 gap-0 rounded-none md:rounded-xl"
  )}
>
```

#### 4. Ajuster le layout de la page deal pour le split view

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/[dealId]/page.tsx`**

Envelopper le contenu principal pour qu'il se redimensionne quand le chat est ouvert. Cela necessite de remonter le state `isOpen` du chat au niveau de la page, soit via un Context, soit via un composant client wrapper.

**Alternative plus simple** : Ajouter une classe CSS sur le contenu principal via un cookie/query param, ou simplement laisser le split view en positionnement fixe et ajouter un padding-right conditionnel sur le main content via CSS media queries :

```css
/* Dans globals.css ou via un composant */
@media (min-width: 1024px) {
  .chat-split-open {
    padding-right: 420px; /* lg:w-[400px] + margin */
    transition: padding-right 300ms ease;
  }
}
```

### Dependances
- F91 (mobile) : sur mobile, conserver le mode overlay plein ecran (bottom sheet)
- Le split view est desactive sous `lg` breakpoint (1024px)

### Verification
1. Ouvrir un deal, cliquer sur le bouton chat
2. Sur desktop large (>1024px) : verifier que le chat s'ouvre en panneau lateral droit
3. Les resultats d'analyse restent visibles a gauche
4. Sur mobile (<768px) : le chat reste en overlay plein ecran
5. Fermer le chat : le contenu reprend toute la largeur

---

<a id="f87"></a>
## F87 -- Dashboard pauvre en informations

### Diagnostic

**Fichier concerne :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/dashboard/page.tsx`

**Probleme identifie :**

Le dashboard (lignes 59-155) affiche :
1. **3 stats basiques** : Total Deals, Red Flags, Plan (lignes 77-116)
2. **Deals recents** : Liste des 5 derniers deals (lignes 118-153)

**Manque :**
- Pas de deals par statut (pipeline view)
- Pas de top red flags consolides
- Pas de metriques portfolio (investissement total, score moyen, repartition sectorielle)
- Pas de prioritisation (quel deal regarder en premier)
- Pas d'analyses recentes (timeline des dernieres analyses)

### Correction

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/dashboard/page.tsx`**

Remplacer `getDashboardStats` pour recuperer plus de donnees :

```typescript
async function getDashboardStats(userId: string) {
  noStore();
  const [
    totalDeals,
    activeDeals,
    recentDeals,
    redFlagsCount,
    dealsByStatus,
    topRedFlags,
    recentAnalyses,
    sectorDistribution,
  ] = await Promise.all([
    prisma.deal.count({ where: { userId } }),
    prisma.deal.count({
      where: {
        userId,
        status: { in: ["SCREENING", "ANALYZING", "IN_DD"] },
      },
    }),
    prisma.deal.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        redFlags: {
          where: { status: "OPEN" },
          select: { severity: true },
        },
      },
    }),
    prisma.redFlag.count({
      where: {
        deal: { userId },
        status: "OPEN",
      },
    }),
    // Deals par statut
    prisma.deal.groupBy({
      by: ["status"],
      where: { userId },
      _count: { id: true },
    }),
    // Top 5 red flags critiques
    prisma.redFlag.findMany({
      where: {
        deal: { userId },
        status: "OPEN",
        severity: { in: ["CRITICAL", "HIGH"] },
      },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      take: 5,
      include: {
        deal: { select: { name: true, id: true } },
      },
    }),
    // 5 dernieres analyses completees
    prisma.analysis.findMany({
      where: {
        deal: { userId },
        status: "COMPLETED",
      },
      orderBy: { completedAt: "desc" },
      take: 5,
      include: {
        deal: { select: { name: true, id: true } },
      },
    }),
    // Repartition par secteur
    prisma.deal.groupBy({
      by: ["sector"],
      where: { userId, sector: { not: null } },
      _count: { id: true },
    }),
  ]);

  // Calculer le score moyen du portfolio
  const dealsWithScores = await prisma.deal.findMany({
    where: { userId, globalScore: { not: null } },
    select: { globalScore: true },
  });
  const avgScore = dealsWithScores.length > 0
    ? Math.round(dealsWithScores.reduce((sum, d) => sum + (d.globalScore ?? 0), 0) / dealsWithScores.length)
    : null;

  return {
    totalDeals,
    activeDeals,
    recentDeals,
    redFlagsCount,
    dealsByStatus,
    topRedFlags,
    recentAnalyses,
    sectorDistribution,
    avgScore,
  };
}
```

Enrichir le JSX avec de nouvelles sections (apres les Stats Cards, avant les Recent Deals) :

```tsx
{/* Pipeline Overview */}
<div className="grid gap-4 md:grid-cols-5">
  {["SCREENING", "ANALYZING", "IN_DD", "INVESTED", "PASSED"].map((status) => {
    const count = dealsByStatus.find(d => d.status === status)?._count?.id ?? 0;
    return (
      <Card key={status} className="text-center">
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold">{count}</div>
          <p className="text-xs text-muted-foreground">{getStatusLabel(status)}</p>
        </CardContent>
      </Card>
    );
  })}
</div>

{/* Two-column layout: Top Red Flags + Recent Analyses */}
<div className="grid gap-4 md:grid-cols-2">
  {/* Top Red Flags */}
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        Red Flags prioritaires
      </CardTitle>
    </CardHeader>
    <CardContent>
      {topRedFlags.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun red flag critique</p>
      ) : (
        <div className="space-y-2">
          {topRedFlags.map((rf) => (
            <Link key={rf.id} href={`/deals/${rf.deal.id}`} className="block">
              <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <Badge className={getSeverityColor(rf.severity)} variant="secondary">
                  {rf.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{rf.title}</p>
                  <p className="text-xs text-muted-foreground">{rf.deal.name}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </CardContent>
  </Card>

  {/* Recent Analyses */}
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        Analyses recentes
      </CardTitle>
    </CardHeader>
    <CardContent>
      {recentAnalyses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune analyse</p>
      ) : (
        <div className="space-y-2">
          {recentAnalyses.map((a) => (
            <Link key={a.id} href={`/deals/${a.deal.id}`} className="block">
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{a.deal.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.completedAt ? formatDistanceToNow(a.completedAt, { addSuffix: true, locale: fr }) : ""}
                  </p>
                </div>
                <Badge variant="outline">{formatAnalysisMode(a.mode ?? a.type)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
</div>

{/* Portfolio Metrics (if user has scored deals) */}
{avgScore !== null && (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">Metriques Portfolio</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{avgScore}/100</div>
          <p className="text-xs text-muted-foreground">Score moyen</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{sectorDistribution.length}</div>
          <p className="text-xs text-muted-foreground">Secteurs couverts</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{dealsWithScores.length}</div>
          <p className="text-xs text-muted-foreground">Deals scores</p>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

### Dependances
- F89 (table deals) : les memes donnees de tri/filtrage sont utiles dans les deux
- Import necessaires : `Brain`, `getSeverityColor`, `formatDistanceToNow`, `fr`, `formatAnalysisMode`

### Verification
1. Acceder au dashboard avec plusieurs deals dans differents statuts
2. Verifier que la barre pipeline affiche les bons comptes par statut
3. Verifier que les top red flags sont affiches avec liens
4. Verifier que les analyses recentes sont listees
5. Verifier les metriques portfolio (score moyen, secteurs)

---

<a id="f88"></a>
## F88 -- Formulaire creation deal sans guidance

### Diagnostic

**Fichier concerne :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/new/page.tsx`

**Probleme identifie :**

1. **Pas de jauge de completude** : L'utilisateur ne sait pas quel pourcentage d'information il a rempli et n'a aucune idee de ce qui est "suffisant" pour une bonne analyse.

2. **Pas de tooltips explicatifs** : Les champs financiers (ARR, croissance YoY, valorisation pre-money, montant demande) n'ont aucune explication. Un BA debutant ne sait pas ce qu'est l'ARR ni pourquoi c'est important.

3. **Pas d'indicateur minimal vs optimal** : Le formulaire ne distingue pas les champs "minimum pour une analyse basique" des champs "necessaires pour une analyse optimale".

4. **Validation minimaliste** : Seul le nom est requis (ligne 176: `if (!formData.name.trim())`).

### Correction

#### 1. Ajouter un systeme de completude

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/new/page.tsx`**

Ajouter apres la definition de `formData` :

```typescript
// Completeness tracking
const completeness = useMemo(() => {
  const fields = {
    // Champs minimaux (poids: 2)
    name: { filled: !!formData.name.trim(), weight: 2, level: "minimum" as const },
    sector: { filled: !!formData.sector, weight: 2, level: "minimum" as const },
    stage: { filled: !!formData.stage, weight: 2, level: "minimum" as const },
    description: { filled: !!formData.description.trim(), weight: 2, level: "minimum" as const },
    // Champs optimaux (poids: 1)
    companyName: { filled: !!formData.companyName.trim(), weight: 1, level: "optimal" as const },
    website: { filled: !!formData.website.trim(), weight: 1, level: "optimal" as const },
    geography: { filled: !!formData.geography.trim(), weight: 1, level: "optimal" as const },
    arr: { filled: !!formData.arr, weight: 1.5, level: "optimal" as const },
    growthRate: { filled: !!formData.growthRate, weight: 1, level: "optimal" as const },
    amountRequested: { filled: !!formData.amountRequested, weight: 1.5, level: "optimal" as const },
    valuationPre: { filled: !!formData.valuationPre, weight: 1.5, level: "optimal" as const },
  };

  const totalWeight = Object.values(fields).reduce((sum, f) => sum + f.weight, 0);
  const filledWeight = Object.values(fields).reduce((sum, f) => sum + (f.filled ? f.weight : 0), 0);
  const percentage = Math.round((filledWeight / totalWeight) * 100);

  const minFields = Object.entries(fields).filter(([, f]) => f.level === "minimum");
  const minFilled = minFields.filter(([, f]) => f.filled).length;
  const isMinimumMet = minFilled === minFields.length;

  return {
    percentage,
    isMinimumMet,
    minFilled,
    minTotal: minFields.length,
    level: percentage >= 80 ? "optimal" as const : percentage >= 50 ? "good" as const : "basic" as const,
    fields,
  };
}, [formData]);
```

#### 2. Ajouter la barre de completude en haut du formulaire

Apres le titre "Nouveau deal" et avant le `<form>` :

```tsx
{/* Completeness Bar */}
<Card className={cn(
  "border-2",
  completeness.level === "optimal" ? "border-green-200 bg-green-50" :
  completeness.level === "good" ? "border-blue-200 bg-blue-50" :
  "border-gray-200"
)}>
  <CardContent className="py-3">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Completude du deal</span>
        <Badge variant={completeness.level === "optimal" ? "default" : "secondary"}>
          {completeness.percentage}%
        </Badge>
      </div>
      <span className="text-xs text-muted-foreground">
        {completeness.isMinimumMet
          ? "Donnees minimales OK - Ajoutez les financiers pour une meilleure analyse"
          : `${completeness.minFilled}/${completeness.minTotal} champs minimaux remplis`}
      </span>
    </div>
    <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300",
          completeness.level === "optimal" ? "bg-green-500" :
          completeness.level === "good" ? "bg-blue-500" : "bg-gray-400"
        )}
        style={{ width: `${completeness.percentage}%` }}
      />
    </div>
    <div className="flex justify-between mt-1">
      <span className="text-[10px] text-muted-foreground">Minimal</span>
      <span className="text-[10px] text-muted-foreground">Optimal</span>
    </div>
  </CardContent>
</Card>
```

#### 3. Ajouter des tooltips sur les champs financiers

Creer un composant helper :

```tsx
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function FieldLabel({ htmlFor, children, tooltip, recommended }: {
  htmlFor: string;
  children: React.ReactNode;
  tooltip?: string;
  recommended?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{children}</Label>
      {recommended && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-600 border-blue-200">
          Recommande
        </Badge>
      )}
      {tooltip && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
```

Utiliser sur chaque champ financier :

```tsx
<FieldLabel
  htmlFor="arr"
  tooltip="Annual Recurring Revenue - Revenu annuel recurrent. C'est la metrique cle pour les SaaS. Si la startup n'est pas SaaS, utilisez le CA annuel."
  recommended
>
  ARR (EUR)
</FieldLabel>

<FieldLabel
  htmlFor="growthRate"
  tooltip="Taux de croissance annuel du revenu (year-over-year). Un SaaS Seed typique croit de 100-200%/an."
>
  Croissance YoY (%)
</FieldLabel>

<FieldLabel
  htmlFor="amountRequested"
  tooltip="Montant total que la startup cherche a lever dans ce round. Inclut tous les investisseurs, pas seulement votre ticket."
  recommended
>
  Montant demande (EUR)
</FieldLabel>

<FieldLabel
  htmlFor="valuationPre"
  tooltip="Valorisation de l'entreprise AVANT l'investissement (pre-money). Post-money = Pre-money + Montant leve. Votre % = Ticket / Post-money."
  recommended
>
  Valorisation pre-money (EUR)
</FieldLabel>
```

### Dependances
- F72 (memo) : les champs manquants impactent la qualite du memo
- F89 (table) : les champs remplis determinent les colonnes disponibles pour le filtrage

### Verification
1. Acceder a `/deals/new`
2. Verifier que la barre de completude affiche 0% au depart
3. Remplir le nom : la barre progresse
4. Remplir nom + secteur + stage + description : le message "Donnees minimales OK" apparait
5. Survoler l'icone info a cote d'ARR : le tooltip s'affiche
6. Remplir tous les champs : la barre atteint 100% en vert

---

<a id="f89"></a>
## F89 -- Table deals sans colonne score ni tri avance

### Diagnostic

**Fichiers concernes :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deals-table.tsx`
- `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/page.tsx`

**Probleme identifie :**

1. **Pas de colonne score** : La table (deals-table.tsx, lignes 64-75 headers) n'inclut pas le `globalScore` du deal. Les colonnes sont : Nom, Secteur, Stade, Valorisation, Statut, Alerts, Mis a jour.

2. **Pas de filtres avances** : La page deals (deals/page.tsx) passe tous les deals sans filtrage client-side. Pas de filtre par secteur, stage, score minimum, ou date.

3. **Pas de tri** : Les colonnes de la table ne sont pas cliquables pour trier.

### Correction

#### 1. Ajouter le score aux donnees passees a la table

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/page.tsx`**

Modifier la query `getDeals` pour inclure `globalScore` :
```typescript
async function getDeals(userId: string) {
  noStore();
  const deals = await prisma.deal.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      documents: { select: { id: true } },
      redFlags: {
        where: { status: "OPEN" },
        select: { severity: true },
      },
    },
  });

  return deals.map((deal) => ({
    ...deal,
    valuationPre: deal.valuationPre ? Number(deal.valuationPre) : null,
    globalScore: deal.globalScore,  // Ajouter le score
  }));
}
```

#### 2. Etendre l'interface Deal dans deals-table.tsx

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deals-table.tsx`**

```typescript
interface Deal {
  id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  valuationPre: number | string | null;
  status: string;
  website: string | null;
  updatedAt: Date;
  redFlags: { severity: string }[];
  globalScore: number | null;  // Ajout
}
```

#### 3. Ajouter filtres et tri

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deals-table.tsx`**

Ajouter les state de filtres et le tri :

```typescript
import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, X } from "lucide-react";
import { ScoreBadge } from "@/components/shared/score-badge";

type SortField = "name" | "sector" | "stage" | "valuationPre" | "status" | "globalScore" | "updatedAt";
type SortDir = "asc" | "desc";

export const DealsTable = memo(function DealsTable({ deals }: DealsTableProps) {
  const router = useRouter();
  // ... existing useDealActions

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [scoreMin, setScoreMin] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }, [sortField]);

  // Available sectors/stages for filters
  const availableSectors = useMemo(() => {
    const sectors = new Set(deals.map(d => d.sector).filter(Boolean) as string[]);
    return Array.from(sectors).sort();
  }, [deals]);

  const availableStages = useMemo(() => {
    const stages = new Set(deals.map(d => d.stage).filter(Boolean) as string[]);
    return Array.from(stages).sort();
  }, [deals]);

  // Filtered and sorted deals
  const filteredDeals = useMemo(() => {
    let result = [...deals];

    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.sector?.toLowerCase().includes(q))
      );
    }

    // Sector filter
    if (sectorFilter !== "all") {
      result = result.filter(d => d.sector === sectorFilter);
    }

    // Stage filter
    if (stageFilter !== "all") {
      result = result.filter(d => d.stage === stageFilter);
    }

    // Score minimum
    if (scoreMin) {
      const min = parseInt(scoreMin, 10);
      if (!isNaN(min)) {
        result = result.filter(d => (d.globalScore ?? 0) >= min);
      }
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "globalScore":
          cmp = (a.globalScore ?? 0) - (b.globalScore ?? 0);
          break;
        case "valuationPre":
          cmp = (Number(a.valuationPre) || 0) - (Number(b.valuationPre) || 0);
          break;
        case "updatedAt":
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        default:
          cmp = String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? ""));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [deals, searchQuery, sectorFilter, stageFilter, scoreMin, sortField, sortDir]);

  // Sort icon helper
  const SortIcon = useCallback(({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  }, [sortField, sortDir]);

  // ... rest of component with the table using filteredDeals
```

Ajouter le bloc de filtres AVANT la table :
```tsx
{/* Search and Filters */}
<div className="space-y-3 mb-4">
  <div className="flex items-center gap-2">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Rechercher un deal..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-9"
      />
    </div>
    <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
      <Filter className="h-4 w-4 mr-1" />
      Filtres
    </Button>
  </div>
  {showFilters && (
    <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/50 border">
      <Select value={sectorFilter} onValueChange={setSectorFilter}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Secteur" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les secteurs</SelectItem>
          {availableSectors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={stageFilter} onValueChange={setStageFilter}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les stages</SelectItem>
          {availableStages.map(s => <SelectItem key={s} value={s}>{getStageLabel(s)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        type="number"
        placeholder="Score min"
        value={scoreMin}
        onChange={(e) => setScoreMin(e.target.value)}
        className="w-[100px]"
      />
      {(sectorFilter !== "all" || stageFilter !== "all" || scoreMin) && (
        <Button variant="ghost" size="sm" onClick={() => { setSectorFilter("all"); setStageFilter("all"); setScoreMin(""); }}>
          <X className="h-3 w-3 mr-1" /> Reinitialiser
        </Button>
      )}
    </div>
  )}
</div>
```

Ajouter la colonne Score dans le header :
```tsx
<TableHead className="hidden sm:table-cell cursor-pointer" onClick={() => handleSort("globalScore")}>
  <span className="flex items-center">Score <SortIcon field="globalScore" /></span>
</TableHead>
```

Et la cellule correspondante dans chaque row :
```tsx
<TableCell className="hidden sm:table-cell">
  {deal.globalScore ? (
    <ScoreBadge score={deal.globalScore} size="sm" />
  ) : (
    <span className="text-muted-foreground text-xs">-</span>
  )}
</TableCell>
```

### Dependances
- F87 (dashboard) : les memes filtres et metriques
- F88 (formulaire) : les champs remplis determinent les filtres disponibles

### Verification
1. Acceder a `/deals` avec 5+ deals
2. Verifier la colonne "Score" avec les badges colores
3. Cliquer sur les headers de colonnes : verifier le tri (asc/desc)
4. Ouvrir les filtres : filtrer par secteur, verifier que la table se met a jour
5. Filtrer par score min : seuls les deals au-dessus s'affichent
6. Barre de recherche : taper un nom de deal, verifier le filtrage

---

<a id="f91"></a>
## F91 -- Mobile UX degradee

### Diagnostic

**Fichiers concernes :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deals-table.tsx` (colonnes cachees avec `hidden sm:table-cell`)
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/chat/deal-chat-panel.tsx` (overlay plein ecran `fixed inset-0`)
- `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/[dealId]/page.tsx` (TabsList non scrollable)
- `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/layout.tsx` (layout basique)

**Problemes identifies :**

1. **Table : colonnes cachees sans alternative** : Sur mobile (< sm), les colonnes Secteur, Stade, Valorisation, Mis a jour sont cachees. L'utilisateur ne voit que Nom, Statut, Alerts. Pas de vue "cards" alternative.

2. **Chat plein ecran** : Sur mobile, `fixed inset-0` occupe 100% de l'ecran sans moyen de voir le contenu sous-jacent.

3. **Tabs non scrollables** : La TabsList dans `deals/[dealId]/page.tsx` (ligne 175) contient 6 onglets (Vue d'ensemble, Analyse IA, Documents, Team, Red Flags, AI Board). Sur mobile, ils debordent sans scroll horizontal.

4. **Layout general** : Le `main` dans layout.tsx (ligne 12) n'a pas de contraintes specifiques mobile.

### Correction

#### 1. Vue cards pour mobile dans deals-table.tsx

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deals-table.tsx`**

Ajouter une vue alternative pour mobile (sous le breakpoint `md`). Garder la table pour desktop.

Apres le bloc de filtres, remplacer le rendu par :

```tsx
{/* Mobile: Card view */}
<div className="md:hidden space-y-2">
  {filteredDeals.map((deal) => {
    const criticalFlags = deal.redFlags.filter(
      (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
    ).length;

    return (
      <div
        key={deal.id}
        role="link"
        tabIndex={0}
        onClick={() => router.push(`/deals/${deal.id}`)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/deals/${deal.id}`); } }}
        className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors active:bg-muted"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-sm truncate flex-1">{deal.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            {deal.globalScore ? (
              <ScoreBadge score={deal.globalScore} size="sm" />
            ) : null}
            <Badge variant="secondary" className={cn("text-xs", getStatusColor(deal.status))}>
              {getStatusLabel(deal.status)}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {deal.sector && <span>{deal.sector}</span>}
          {deal.stage && <><span>•</span><span>{getStageLabel(deal.stage)}</span></>}
          {deal.valuationPre && <><span>•</span><span>{formatCurrencyEUR(deal.valuationPre)}</span></>}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true, locale: fr })}
          </span>
          {criticalFlags > 0 && (
            <div className="flex items-center gap-1 text-destructive text-xs">
              <AlertTriangle className="h-3 w-3" />
              <span>{criticalFlags} alerte{criticalFlags > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      </div>
    );
  })}
</div>

{/* Desktop: Table view */}
<div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0">
  <Table>
    {/* ... existing table ... */}
  </Table>
</div>
```

#### 2. Chat mobile : bottom sheet au lieu de plein ecran

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/chat/deal-chat-panel.tsx`**

Modifier le positionnement mobile (ligne 480-484) :

```tsx
<Card
  className={cn(
    variant === "inline"
      ? "flex flex-col h-full border-0 shadow-none py-0 gap-0 rounded-none"
      : cn(
          // Mobile: bottom sheet (75vh height, not full screen)
          "fixed left-0 right-0 bottom-0 h-[75vh] rounded-t-2xl",
          // Desktop: side panel
          "md:inset-auto md:right-4 md:top-20 md:bottom-4 md:left-auto md:h-auto md:w-[40%] md:min-w-[360px] md:max-w-[600px] md:rounded-xl",
          "flex flex-col z-50 shadow-lg border bg-background py-0 gap-0"
        )
  )}
>
```

Ajouter un handle visuel en haut pour mobile :
```tsx
{/* Mobile drag handle */}
<div className="md:hidden flex justify-center py-2">
  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
</div>
```

#### 3. Tabs scrollables dans la page deal

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/[dealId]/page.tsx`**

Modifier la TabsList (ligne 175) pour etre scrollable sur mobile :

```tsx
<TabsList className="flex w-full overflow-x-auto scrollbar-hide">
```

Et ajouter dans `globals.css` :
```css
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

Alternativement, reduire les labels sur mobile :
```tsx
<TabsTrigger value="overview" className="whitespace-nowrap">
  <span className="hidden sm:inline">Vue d&apos;ensemble</span>
  <span className="sm:hidden">Vue</span>
</TabsTrigger>
```

#### 4. Stats cards responsives dans la page deal

Les 4 stats cards (ligne 114: `md:grid-cols-4`) deviennent 2x2 sur mobile :
```tsx
<div className="grid gap-4 grid-cols-2 md:grid-cols-4">
```

### Dependances
- F86 (chat split) : le split view est uniquement desktop (>= lg)
- F89 (table filtres) : les filtres doivent aussi etre responsifs

### Verification
1. Ouvrir la page deals sur mobile (< 768px) : verifier les cards au lieu de la table
2. Ouvrir un deal : verifier que les tabs sont scrollables horizontalement
3. Ouvrir le chat : verifier le bottom sheet a 75vh (pas plein ecran)
4. Le handle de drag est visible en haut du chat
5. Les stats cards sont en 2 colonnes sur mobile

---

<a id="f92"></a>
## F92 -- Transparence couts unilaterale

### Diagnostic

**Fichiers concernes :**
- `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/admin/costs/page.tsx` (admin uniquement)
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/admin/costs-dashboard-v2.tsx` (admin uniquement)
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/layout/sidebar.tsx` (lignes 180-201 : affiche `X analyses restantes` pour FREE)
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx` (lignes 1030-1063 : usage banner pour FREE)

**Probleme identifie :**

1. **Admin a un dashboard complet** : Le `/admin/costs` donne une vue detaillee des couts par utilisateur, deal, et agent. L'utilisateur final n'a aucun acces a ces informations.

2. **Sidebar : info limitee** : La sidebar (lignes 186-189) affiche uniquement `X analyses restantes ce mois` pour les utilisateurs FREE. Pas d'estimation de cout par analyse.

3. **Pas de cout estime AVANT l'analyse** : L'utilisateur lance une analyse sans savoir combien elle "coutera" en credits. Il n'y a pas de message du type "Cette analyse utilisera 1 credit sur vos 3 restants".

4. **PRO sans visibilite** : Les utilisateurs PRO n'ont aucune information sur leur utilisation (nombre d'analyses, couts LLM engendres).

### Correction

#### 1. Ajouter un indicateur de credits dans le header du layout

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/layout/sidebar.tsx`**

Remplacer le bloc "Plan Card" (lignes 180-202) par une version enrichie :

```tsx
{/* Credits & Usage Card */}
{!isPro ? (
  <div className="rounded-xl bg-gradient-to-br from-sidebar-accent to-sidebar-accent/50 p-4 border border-sidebar-border">
    <div className="flex items-center gap-2 mb-2">
      <Crown className="h-4 w-4 text-amber-400" />
      <p className="text-sm font-semibold">Plan Gratuit</p>
    </div>
    {quotaData?.data?.analyses ? (
      <>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-2 rounded-full bg-sidebar-border overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                quotaData.data.analyses.used >= quotaData.data.analyses.limit
                  ? "bg-red-500"
                  : quotaData.data.analyses.used >= quotaData.data.analyses.limit - 1
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              )}
              style={{
                width: `${Math.min((quotaData.data.analyses.used / quotaData.data.analyses.limit) * 100, 100)}%`
              }}
            />
          </div>
          <span className="text-xs font-medium">
            {quotaData.data.analyses.used}/{quotaData.data.analyses.limit}
          </span>
        </div>
        <p className="text-xs text-sidebar-foreground/70 mb-3">
          {quotaData.data.analyses.limit - quotaData.data.analyses.used} analyse{quotaData.data.analyses.limit - quotaData.data.analyses.used !== 1 ? "s" : ""} restante{quotaData.data.analyses.limit - quotaData.data.analyses.used !== 1 ? "s" : ""} ce mois
        </p>
      </>
    ) : (
      <p className="text-xs text-sidebar-foreground/70 mb-3">Chargement...</p>
    )}
    <Button
      variant="secondary"
      size="sm"
      className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
      asChild
    >
      <Link href="/pricing">Passer au Pro</Link>
    </Button>
  </div>
) : (
  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
    <div className="flex items-center gap-2 mb-1">
      <CheckCircle className="h-4 w-4 text-emerald-500" />
      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Plan Pro</span>
    </div>
    {quotaData?.data?.analyses && (
      <p className="text-xs text-muted-foreground">
        {quotaData.data.analyses.used} analyse{quotaData.data.analyses.used !== 1 ? "s" : ""} ce mois
      </p>
    )}
  </div>
)}
```

#### 2. Ajouter une estimation de cout AVANT l'analyse

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx`**

Modifier le "Launch Analysis Card" (lignes 1376-1454) pour ajouter l'estimation :

```tsx
{/* Launch Analysis Card - AFTER results */}
{!isAnalyzing && (
  <Card>
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base">
            {displayedResult ? "Relancer une analyse" : "Analyse IA"}
          </CardTitle>
          <CardDescription className="text-sm">
            {planConfig.description}
          </CardDescription>
        </div>
        <Button
          onClick={handleAnalyzeClick}
          disabled={!canRunAnalysis}
          size="default"
        >
          {!canRunAnalysis ? (
            <>
              <AlertCircle className="mr-2 h-4 w-4" />
              Limite atteinte
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              {displayedResult ? "Relancer" : "Analyser"}
            </>
          )}
        </Button>
      </div>
      {/* Cost estimation for FREE users */}
      {subscriptionPlan === "FREE" && quota && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          <span>
            Cette analyse utilisera <strong>1 credit</strong> sur vos{" "}
            <strong>{quota.analyses.limit - quota.analyses.used} restants</strong> ce mois.
          </span>
        </div>
      )}
      {/* Usage info for PRO users */}
      {subscriptionPlan !== "FREE" && quota && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {quota.analyses.used} analyse{quota.analyses.used !== 1 ? "s" : ""} effectuee{quota.analyses.used !== 1 ? "s" : ""} ce mois
            ({analysisType === "full_analysis" ? "18+ agents, ~2 min" : "12 agents, ~1 min"})
          </span>
        </div>
      )}
    </CardHeader>
    {/* ... rest ... */}
  </Card>
)}
```

#### 3. Ajouter une page "Mon utilisation" dans les settings

**Fichier : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/settings/page.tsx`**

Ajouter apres le bloc Subscription Card :

```tsx
{/* Usage Stats Card */}
<UsageStatsCard userId={user.id} isPro={isPro} />
```

**Nouveau composant : `/Users/sacharebbouh/Desktop/angeldesk/src/components/settings/usage-stats-card.tsx`**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Loader2 } from "lucide-react";

interface QuotaData {
  plan: "FREE" | "PRO";
  analyses: { used: number; limit: number };
  boards: { used: number; limit: number };
  resetsAt: string;
}

export function UsageStatsCard({ isPro }: { userId: string; isPro: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.quota.all,
    queryFn: async () => {
      const res = await fetch("/api/credits");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ data: QuotaData }>;
    },
    staleTime: 60_000,
  });

  const quota = data?.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Utilisation ce mois
        </CardTitle>
        <CardDescription>
          {quota?.resetsAt
            ? `Reinitialisation le ${new Date(quota.resetsAt).toLocaleDateString("fr-FR")}`
            : "Chargement..."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : quota ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Analyses</span>
                <span className="text-sm font-medium">
                  {quota.analyses.used}{isPro ? "" : ` / ${quota.analyses.limit}`}
                </span>
              </div>
              {!isPro && (
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min((quota.analyses.used / quota.analyses.limit) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">AI Board</span>
                <span className="text-sm font-medium">
                  {quota.boards.used}{isPro ? ` / ${quota.boards.limit}` : " / 0"}
                </span>
              </div>
              {isPro && (
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min((quota.boards.used / quota.boards.limit) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

### Dependances
- F83 (API) : les informations de quota pourraient etre exposees via l'API publique
- La sidebar est le point d'entree principal pour la visibilite des credits

### Verification
1. Connexion utilisateur FREE : verifier la barre de progression dans la sidebar
2. Page d'un deal : verifier le message "Cette analyse utilisera 1 credit sur vos X restants"
3. Connexion utilisateur PRO : verifier l'affichage "X analyses ce mois"
4. Page settings : verifier le composant "Utilisation ce mois"
5. Apres une analyse : verifier que les compteurs se mettent a jour

---

## Resume des interdependances

| Faille | Depend de | Impacte |
|--------|-----------|---------|
| F72 | F88 (formulaire) | Memo personnalise |
| F73 | F72 (memo questions), F85 (agents manquants) | Top 10 questions |
| F83 | Aucune | Spec standalone |
| F85 | Aucune | F73 (questions manquantes) |
| F86 | F91 (mobile overlay) | Chat split view |
| F87 | F89 (memes donnees) | Dashboard enrichi |
| F88 | Aucune | F72, F89 |
| F89 | F88 (champs disponibles) | F87 (memes filtres) |
| F91 | F86 (chat mobile), F89 (table mobile) | Responsivite globale |
| F92 | Aucune | Transparence pour l'utilisateur |

## Ordre de priorite d'implementation recommande

1. **F85** - Gestion erreur agent (independant, petite surface, forte valeur UX)
2. **F88** - Formulaire avec guidance (independant, ameliore l'onboarding)
3. **F92** - Transparence couts (independant, petite surface)
4. **F89** - Table deals avancee (depend legerement de F88)
5. **F87** - Dashboard enrichi (depend legerement de F89)
6. **F73** - Top 10 questions consolidees (depend de F85)
7. **F72** - Memo personnalise (depend de F88)
8. **F85** - Erreurs agents (prerequis pour F73)
9. **F86** - Chat split view (depend de F91 pour mobile)
10. **F91** - Mobile UX (large scope, a faire en parallele)
11. **F83** - API publique (spec only, pas d'implementation)
