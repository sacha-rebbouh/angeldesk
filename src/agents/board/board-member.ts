import type { ModelKey } from "@/services/openrouter/client";
import { setAgentContext, completeJSON } from "@/services/openrouter/router";
import { compressBoardContext, buildDealSummary } from "./context-compressor";
import {
  formatAxisPromptLine,
  formatFrameworkPromptLine,
} from "@/agents/thesis/prompt-formatting";
import type {
  BoardMemberConfig,
  BoardInput,
  InitialAnalysis,
  DebateResponse,
  FinalVote,
  ThesisDebateResponse,
} from "./types";

const ANALYSIS_TIMEOUT_MS = 120000; // 2 minutes
const DEBATE_TIMEOUT_MS = 90000; // 1.5 minutes
const VOTE_TIMEOUT_MS = 60000; // 1 minute
const THESIS_DEBATE_TIMEOUT_MS = 90000; // 1.5 minutes

export class BoardMember {
  readonly id: string;
  readonly modelKey: ModelKey;
  readonly name: string;
  readonly color: string;
  readonly provider: "anthropic" | "openai" | "google" | "xai";

  private totalCost = 0;

  constructor(config: BoardMemberConfig) {
    this.id = config.id;
    this.modelKey = config.modelKey;
    this.name = config.name;
    this.color = config.color;
    this.provider = config.provider;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Phase 0 (thesis-first) : Débat sur la these d'investissement AVANT l'analyse du deal.
   * Chaque membre evalue la solidite de la these (reformulation AI + 3 frameworks) et
   * exprime son niveau d'adhesion. Executé comme ROUND 0 par le BoardOrchestrator.
   */
  async debateThesis(
    input: BoardInput
  ): Promise<{ response: ThesisDebateResponse; cost: number }> {
    setAgentContext(`board-member-${this.id}`);

    if (!input.thesis) {
      throw new Error("debateThesis requires input.thesis to be set");
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildThesisDebatePrompt(input);

    const result = await Promise.race([
      completeJSON<ThesisDebateResponse>(userPrompt, {
        model: this.modelKey,
        systemPrompt,
        maxTokens: 3000,
        temperature: 0.5,
      }),
      this.timeout<never>(THESIS_DEBATE_TIMEOUT_MS, "Thesis debate timeout"),
    ]);

    this.totalCost += result.cost;

    return {
      response: result.data,
      cost: result.cost,
    };
  }

  /**
   * Phase 1: Initial independent analysis of the deal
   */
  async analyze(input: BoardInput): Promise<{ analysis: InitialAnalysis; cost: number }> {
    setAgentContext(`board-member-${this.id}`);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildAnalysisPrompt(input);

    const result = await Promise.race([
      completeJSON<InitialAnalysis>(userPrompt, {
        model: this.modelKey,
        systemPrompt,
        maxTokens: 4096,
        temperature: 0.7,
      }),
      this.timeout<never>(ANALYSIS_TIMEOUT_MS, "Analysis timeout"),
    ]);

    this.totalCost += result.cost;

    return {
      analysis: result.data,
      cost: result.cost,
    };
  }

  /**
   * Phase 2: Debate round - respond to other members' analyses
   */
  async debate(
    input: BoardInput,
    ownAnalysis: InitialAnalysis,
    othersAnalyses: { memberId: string; memberName: string; analysis: InitialAnalysis }[],
    roundNumber: number
  ): Promise<{ response: DebateResponse; cost: number }> {
    setAgentContext(`board-member-${this.id}`);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildDebatePrompt(input, ownAnalysis, othersAnalyses, roundNumber);

    const result = await Promise.race([
      completeJSON<DebateResponse>(userPrompt, {
        model: this.modelKey,
        systemPrompt,
        maxTokens: 3000,
        temperature: 0.6,
      }),
      this.timeout<never>(DEBATE_TIMEOUT_MS, "Debate timeout"),
    ]);

    this.totalCost += result.cost;

    return {
      response: result.data,
      cost: result.cost,
    };
  }

  /**
   * Phase 3: Final vote after all debate rounds
   */
  async vote(
    input: BoardInput,
    debateHistory: {
      roundNumber: number;
      responses: { memberId: string; memberName: string; response: DebateResponse }[];
    }[]
  ): Promise<{ vote: FinalVote; cost: number }> {
    setAgentContext(`board-member-${this.id}`);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildVotePrompt(input, debateHistory);

    const result = await Promise.race([
      completeJSON<FinalVote>(userPrompt, {
        model: this.modelKey,
        systemPrompt,
        maxTokens: 2000,
        temperature: 0.4,
      }),
      this.timeout<never>(VOTE_TIMEOUT_MS, "Vote timeout"),
    ]);

    this.totalCost += result.cost;

    return {
      vote: result.data,
      cost: result.cost,
    };
  }

  // ============================================================================
  // PROMPT BUILDERS
  // ============================================================================

  private buildSystemPrompt(): string {
    const providerNames: Record<string, string> = {
      anthropic: "Anthropic (Claude)",
      openai: "OpenAI (GPT)",
      google: "Google (Gemini)",
      xai: "xAI (Grok)",
    };

    return `Tu es un Senior Investment Analyst participant a un Board d'Investissement IA multi-modeles.

## CONTEXTE UNIQUE
Tu es ${this.name}, un LLM de ${providerNames[this.provider]}. Tu fais partie d'un comite de 4 modeles IA differents (Claude, GPT, Gemini, Grok) qui analysent le meme deal en parallele.

La valeur de ce board reside dans la DIVERSITE des perspectives:
- Chaque modele a ete entraine differemment
- Chaque modele peut voir des patterns que les autres ratent
- Les points de CONVERGENCE indiquent une forte confiance
- Les points de DIVERGENCE meritent une attention particuliere

## TON ROLE
Tu es un analyste senior avec 15+ ans d'experience en venture capital. Tu dois:
1. Analyser objectivement le deal avec tes propres capacites de raisonnement
2. Former un profil de signal independant (VERY_FAVORABLE / FAVORABLE / CONTRASTED / VIGILANCE / ALERT_DOMINANT / NEED_MORE_INFO)
3. Justifier chaque position avec des preuves concretes du deck ou des donnees
4. Debattre honnetement avec les autres modeles - changer d'avis si convaincu
5. Signaler ce que TU vois que les autres pourraient manquer

## CRITERES D'EVALUATION (par ordre d'importance)
1. **Equipe** (40%) - Experience, complementarite, track record, engagement
2. **Marche** (25%) - TAM/SAM/SOM, croissance, timing, concurrence
3. **Produit** (20%) - PMF, differenciation, moat, traction
4. **Financiers** (10%) - Unit economics, valorisation, terms, runway
5. **Risques** (5%) - Red flags critiques, risques critiques potentiels

## REGLES ABSOLUES
- Sois HONNETE sur ce que tu vois, meme si ca contredit les autres
- Source CHAQUE affirmation (page du deck, donnee specifique)
- Si une info manque, dis-le clairement
- Confiance = fonction de la qualite des donnees disponibles

FORMAT: Toujours repondre en JSON valide.

## CLASSIFICATION DE FIABILITÉ DES DONNÉES (OBLIGATOIRE)
Chaque donnée que tu analyses a un niveau de fiabilité. Tu DOIS en tenir compte dans ton analyse.

**6 niveaux (du plus fiable au moins fiable) :**
- **AUDITED** : Donnée auditée par un tiers indépendant (commissaire aux comptes, expert). Confiance maximale.
- **VERIFIED** : Donnée vérifiable via source externe (registre, API, base publique). Haute confiance.
- **DECLARED** : Donnée déclarée par le fondateur dans le deck, non vérifiée. Confiance modérée.
- **PROJECTED** : Projection future (CA prévisionnel, croissance attendue). Confiance faible — traiter comme hypothèse.
- **ESTIMATED** : Estimation dérivée ou calculée à partir d'autres données. Confiance faible.
- **UNVERIFIABLE** : Donnée impossible à vérifier (claims sans source, opinions). Confiance minimale.

**Règles impératives :**
1. Ne JAMAIS traiter une donnée PROJECTED ou ESTIMATED comme un fait établi.
2. Si une projection est présentée comme un fait dans le deck, le signaler comme red flag (PROJECTION_AS_FACT).
3. Pour chaque métrique clé de ton analyse, indiquer le niveau de fiabilité de la source.
4. Pondérer tes conclusions : une conclusion basée uniquement sur des données DECLARED ou inférieures doit être marquée avec prudence.
5. Si le Tier 0 (fact-extractor) a fourni des classifications de fiabilité, les RESPECTER et ne pas les surclasser.

## TON ANALYTIQUE OBLIGATOIRE (RÈGLE N°1)
Angel Desk ANALYSE et GUIDE. Angel Desk ne DÉCIDE JAMAIS. Le Business Angel est le seul décideur.

**INTERDIT dans TOUT texte généré (narrative, nextSteps, forNegotiation, rationale, summary) :**
- "Investir" / "Ne pas investir" / "Rejeter l'opportunité" / "Passer ce deal"
- "GO" / "NO-GO" / "Dealbreaker"
- Tout impératif adressé à l'investisseur ("Fuyez", "N'investissez pas", "Rejetez")
- Tout langage qui prescrit une décision

**OBLIGATOIRE :**
- Ton analytique : "Les données montrent...", "Les signaux indiquent...", "X dimensions présentent..."
- Constater des faits, rapporter des signaux, laisser le BA conclure
- Chaque phrase doit pouvoir se terminer par "...à vous de décider" sans être absurde

## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.

## Anti-Hallucination Directive — Citation Demand
For every factual claim in your response:
1. Cite a specific, verifiable source (name, publication, date)
2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true
3. If you are relying on general training data rather than a specific source, say so explicitly
Do not present unverified information as established fact.

## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.

## Anti-Hallucination Directive — Structured Uncertainty
Structure your response in three clearly labelled sections:
**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)
**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)
**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)
Every claim must be placed in one of these three categories.
Do not present speculative claims as confident ones.`;
  }

  private buildAnalysisPrompt(input: BoardInput): string {
    // Use compressed context instead of raw JSON dumps
    const compressedContext = compressBoardContext(input);

    return `ANALYSE INITIALE DU DEAL

${compressedContext}

---

Analyse ce deal et forme ton verdict independant.

Priorite de raisonnement:
1. Solidite de la these et des hypotheses porteuses
2. Qualite des preuves et fiabilite des donnees
3. Modes d'echec, contradictions et risques critiques
4. Les scores et recommandations de synthese sont des signaux secondaires seulement

N'ancre jamais ton verdict sur un score unique ou une recommandation deja formulee.

Reponds en JSON avec ce format exact:
\`\`\`json
{
  "verdict": "VERY_FAVORABLE" | "FAVORABLE" | "CONTRASTED" | "VIGILANCE" | "ALERT_DOMINANT" | "NEED_MORE_INFO",
  "confidence": <0-100>,
  "arguments": [
    {
      "point": "<argument en faveur ou contre>",
      "strength": "strong" | "moderate" | "weak",
      "evidence": "<preuve ou source>"
    }
  ],
  "concerns": [
    {
      "concern": "<preoccupation>",
      "severity": "critical" | "high" | "medium" | "low",
      "mitigation": "<comment mitiger si possible>"
    }
  ],
  "wouldChangeVerdict": [
    "<element qui te ferait changer d'avis>"
  ]
}
\`\`\``;
  }

  private buildDebatePrompt(
    input: BoardInput,
    ownAnalysis: InitialAnalysis,
    othersAnalyses: { memberId: string; memberName: string; analysis: InitialAnalysis }[],
    roundNumber: number
  ): string {
    // Use short deal summary instead of full context for debate
    const dealSummary = buildDealSummary(input);

    const othersSection = othersAnalyses
      .map(
        (o) => `
### ${o.memberName}
- Verdict: ${o.analysis.verdict} (${o.analysis.confidence}% confiance)
- Arguments principaux:
${o.analysis.arguments.map((a) => `  * [${a.strength}] ${a.point}`).join("\n")}
- Concerns:
${o.analysis.concerns.map((c) => `  * [${c.severity}] ${c.concern}`).join("\n")}
`
      )
      .join("\n");

    return `ROUND DE DEBAT ${roundNumber}

## ${dealSummary}

---

## TON ANALYSE INITIALE
- Verdict: ${ownAnalysis.verdict} (${ownAnalysis.confidence}% confiance)
- Arguments: ${ownAnalysis.arguments.map((a) => a.point).join("; ")}
- Concerns: ${ownAnalysis.concerns.map((c) => c.concern).join("; ")}

---

## ANALYSES DES AUTRES MEMBRES
${othersSection}

---

INSTRUCTIONS:
1. Lis attentivement les analyses des autres
2. Evalue si leurs arguments sont convaincants
3. Commence par les hypotheses, preuves et modes d'echec avant toute consideration de score
4. Si tu es convaincu, change de position et explique pourquoi
5. Reponds aux points specifiques des autres membres
6. Ajoute de nouveaux points si pertinent

Reponds en JSON:
\`\`\`json
{
  "positionChanged": <boolean>,
  "newVerdict": "<si change: VERY_FAVORABLE | FAVORABLE | CONTRASTED | VIGILANCE | ALERT_DOMINANT | NEED_MORE_INFO>",
  "newConfidence": <si change: 0-100>,
  "justification": "<explication de ta position actuelle>",
  "responsesToOthers": [
    {
      "targetMemberId": "<id du membre>",
      "pointAddressed": "<point auquel tu reponds>",
      "response": "<ta reponse>",
      "agreement": "agree" | "disagree" | "partially_agree"
    }
  ],
  "newPoints": [
    {
      "point": "<nouveau point>",
      "evidence": "<preuve>"
    }
  ]
}
\`\`\``;
  }

  private buildThesisDebatePrompt(input: BoardInput): string {
    const t = input.thesis!;
    const loadBearingStr = t.loadBearing
      .map((lb) => `- [${lb.status.toUpperCase()}] ${lb.statement} (impact si fausse : ${lb.impact})`)
      .join("\n");
    // FIX (audit P2 #4) : capper les alertes pour eviter de saturer le prompt Gemini/Grok
    // (context 8k-32k). Top 10 severity-sorted, le reste resume en "+N autres".
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortedAlerts = [...t.alerts].sort((a, b) =>
      (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
    );
    const topAlerts = sortedAlerts.slice(0, 10);
    const extraCount = sortedAlerts.length - topAlerts.length;
    const alertsStr = sortedAlerts.length > 0
      ? topAlerts.map((a) => `- [${a.severity.toUpperCase()}] ${a.title} — ${a.detail}`).join("\n")
        + (extraCount > 0 ? `\n- (+${extraCount} autres alertes omises pour concision)` : "")
      : "(aucune alerte)";

    return `ROUND 0 — DEBAT SUR LA THESE D'INVESTISSEMENT (thesis-first)

## Company : ${input.companyName}

## These reformulee par AI (Tier 0.5)
${t.reformulated}

### Decomposition
- **Problème** : ${t.problem}
- **Solution** : ${t.solution}
- **Why-now** : ${t.whyNow}
- **Moat** : ${t.moat ?? "Non declare"}
- **Path to exit** : ${t.pathToExit ?? "Non declare"}

### Axes canoniques
${formatAxisPromptLine("Thesis Quality", t.evaluationAxes.thesisQuality)}${formatAxisPromptLine("Investor Profile Fit", t.evaluationAxes.investorProfileFit)}${formatAxisPromptLine("Deal Accessibility", t.evaluationAxes.dealAccessibility)}

### Verdict consolide (a challenger, pas a suivre aveuglement)
- Verdict consolide : **${t.verdict}**
- Confiance : ${t.confidence}/100

### Par framework (lenses evaluees uniquement)
${formatFrameworkPromptLine("YC", t.ycLens)}
${formatFrameworkPromptLine("Thiel", t.thielLens)}
${formatFrameworkPromptLine("Angel Desk (capital prive: fit profil + accessibilite + realisme execution)", t.angelDeskLens)}

### Load-bearing assumptions (hypotheses porteuses)
${loadBearingStr}

### Alertes identifiees
${alertsStr}

---

## TA MISSION
Tu es le 1er membre a evaluer la these AVANT l'analyse des rapports Tier 1/2/3.
La question centrale : **cette these tient-elle debout comme objet structurel ?**

Ne decide pas d'investir ou pas. Evalue la SOLIDITE de la these :
1. Les hypotheses porteuses sont-elles verifiees ou purement speculatives ?
2. Le verdict consolide est-il aligne avec l'axe **Thesis Quality**, ou contaminateur par du fit/accessibility ?
3. Quelle est l'hypothese la plus fragile qui pourrait faire ecrouler la these ?
4. Quel est le defaut structurel majeur que les autres frameworks pourraient avoir rate ?
5. Si Angel Desk signale un probleme de ticket, d'horizon ou de profil investisseur, distingue explicitement s'il s'agit d'un **fit/accessibility mismatch** ou d'une vraie faiblesse de these.

Reponds en JSON strict :
\`\`\`json
{
  "agreement": "strong_agree" | "agree" | "neutral" | "disagree" | "strong_disagree",
  "thesisSolidityScore": <0-100>,
  "weakestAssumption": "<l'hypothese porteuse la plus fragile selon toi>",
  "majorCritique": "<ce qui pourrait invalider structurellement la these>",
  "recommendations": [
    "<recommandation specifique au BA, analytique, jamais prescriptive>"
  ],
  "justification": "<justification longue (min 150 mots) expliquant pourquoi la these est solide/fragile>"
}
\`\`\`

IMPORTANT : le texte que tu produis est analytique, pas prescriptif. Formule tes observations comme des signaux et points d'attention, pas comme des ordres. Termine chaque recommandation par "...a vous de decider" ou equivalent.`;
  }

  private buildVotePrompt(
    input: BoardInput,
    debateHistory: {
      roundNumber: number;
      responses: { memberId: string; memberName: string; response: DebateResponse }[];
    }[]
  ): string {
    // Use short deal summary instead of full context for vote
    const dealSummary = buildDealSummary(input);

    const debateSection = debateHistory
      .map(
        (round) => `
### Round ${round.roundNumber}
${round.responses
  .map(
    (r) => `
**${r.memberName}**: ${r.response.justification}
${r.response.positionChanged ? `(A CHANGE de position vers ${r.response.newVerdict})` : ""}
`
  )
  .join("")}
`
      )
      .join("\n");

    return `VOTE FINAL

## ${dealSummary}

---

## HISTORIQUE DU DEBAT
${debateSection}

---

INSTRUCTIONS:
C'est le moment du vote final. Apres avoir ecoute tous les debats, donne ton verdict definitif.
Le score global ou les recommandations de synthese ne sont pas des arbitres finaux: traite-les comme des signaux secondaires derriere Thesis Quality, la qualite des preuves et les risques de rupture.

Reponds en JSON:
\`\`\`json
{
  "verdict": "VERY_FAVORABLE" | "FAVORABLE" | "CONTRASTED" | "VIGILANCE" | "ALERT_DOMINANT" | "NEED_MORE_INFO",
  "confidence": <0-100>,
  "justification": "<justification finale>",
  "keyFactors": [
    {
      "factor": "<facteur de decision>",
      "weight": "high" | "medium" | "low",
      "direction": "positive" | "negative" | "neutral"
    }
  ],
  "agreementPoints": [
    "<point sur lequel tu es d'accord avec les autres>"
  ],
  "remainingConcerns": [
    "<concern qui persiste>"
  ]
}
\`\`\``;
  }

  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}
