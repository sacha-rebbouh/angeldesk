/**
 * Thesis Extractor Agent — Tier 0.5
 *
 * Mission: extraire la these d'investissement de la societe a partir du deck,
 * du fact-store, du context-engine et du deck-coherence-report. Tester la these
 * contre 3 frameworks canoniques (YC / Thiel / Angel Desk) en parallele.
 * Produire un verdict unifie worst-of-3, les load-bearing assumptions, et les
 * alertes structurelles.
 *
 * Executed APRES fact-extractor + deck-coherence-checker (Tier 0),
 * AVANT tous les agents Tier 1/2/3. Le verdict produit ici conditionne
 * la bifurcation UI (Stop/Continuer/Contester) qui pilote la suite.
 */

import { createHash } from "crypto";
import { BaseAgent } from "../base-agent";
import type { AgentContext, EnrichedAgentContext } from "../types";
import type {
  ThesisExtractorOutput,
  ThesisVerdict,
  LoadBearingAssumption,
  ThesisAlert,
  FrameworkLens,
  FrameworkClaim,
  FrameworkLensAvailability,
} from "../thesis/types";
import {
  worstVerdict,
  THESIS_ANTI_HALLUCINATION_DIRECTIVES,
  isFrameworkLensEvaluated,
} from "../thesis/types";
import {
  assertValidStructuredClaims,
  normalizeLoadBearingAssumptions,
  normalizeThesisAlerts,
  repairStructuredClaims,
  renderStructuredClaims,
  ThesisCoreStructuredSchema,
  type ThesisCoreStructured,
} from "@/lib/thesis/core-claims";
import {
  YcLensSchema,
  buildYcLensSystemPrompt,
  buildYcLensUserPrompt,
  type YcLensOutput,
} from "../thesis/frameworks/yc";
import {
  ThielLensSchema,
  buildThielLensSystemPrompt,
  buildThielLensUserPrompt,
  type ThielLensOutput,
} from "../thesis/frameworks/thiel";
import {
  AngelDeskLensSchema,
  buildAngelDeskLensSystemPrompt,
  buildAngelDeskLensUserPrompt,
  type AngelDeskLensOutput,
} from "../thesis/frameworks/angel-desk";
import { sanitizeForLLM } from "@/lib/sanitize";
import { getThesisCallOptions } from "@/lib/thesis/call-options";
import { buildThesisFactScope, formatThesisFactScope } from "@/lib/thesis/fact-scope";
import { assertSupportedThesisNarrative } from "@/lib/thesis/narrative-guards";
import { getBenchmarksForSectorStage } from "@/services/benchmarks/config";

// ---------------------------------------------------------------------------
// LLM response schemas (core thesis extraction)
// ---------------------------------------------------------------------------
type FrameworkExecutionResult<T> = {
  data: T;
  availability: FrameworkLensAvailability;
  model?: string;
};

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------
export class ThesisExtractorAgent extends BaseAgent<ThesisExtractorOutput> {
  private static readonly VALID_VERDICTS: ThesisVerdict[] = [
    "very_favorable",
    "favorable",
    "contrasted",
    "vigilance",
    "alert_dominant",
  ];

  private static readonly VALID_CLAIM_STATUSES = [
    "supported",
    "contradicted",
    "unverifiable",
    "partial",
  ] as const;

  constructor() {
    super({
      name: "thesis-extractor",
      description: "Extraction et validation structurelle de la these d'investissement (Tier 0.5)",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 300000, // 5 min — absorbe une chain core Claude + Gemini + Haiku avant abort
      dependencies: ["fact-extractor", "deck-coherence-checker"],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE

Tu es un analyste these d'investissement senior, specialise dans la lecture structurelle d'une these de societe (pas du business, de la these elle-meme). Tu lis un deck, tu identifies ce que la societe promet de devenir, pourquoi ca doit marcher, et quelles hypotheses porteuses sont necessaires.

# MISSION

Extraire la these d'investissement de la societe en 6 champs structurels + decomposer ses hypotheses porteuses + identifier les alertes structurelles a watcher.

# 6 CHAMPS A EXTRAIRE

Pour chacun des 6 champs, tu retournes UNE LISTE DE CLAIMS STRUCTURES (pas du texte final libre).

1. **reformulatedClaims** — claims qui resument la these : "Angel Desk parie que X en visant Y via Z".
2. **problemClaims** — claims sur le probleme vise.
3. **solutionClaims** — claims sur la solution apportee.
4. **whyNowClaims** — claims sur le catalyseur temporel.
5. **moatClaims** — claims sur la defensibilite durable.
6. **pathToExitClaims** — claims sur le chemin d'exit.

Chaque claim doit etre de l'un de ces 4 types:
- **direct_fact**: reference un factKey du THESIS FACT SCOPE + une phrase d'amorce SANS chiffres
- **derived_metric**: reference une metricKey pre-calculee du THESIS FACT SCOPE + une phrase d'amorce SANS chiffres
- **judgment**: texte qualitatif SANS chiffre + supportingFactKeys obligatoires
- **unknown**: texte qualitatif explicitant qu'une information manque, SANS chiffre

# LOAD-BEARING ASSUMPTIONS

Identifier 3 a 5 hypotheses SANS LESQUELLES la these s'effondre (murs porteurs, pas decoration).

Pour chacune:
- **statement** : l'hypothese formulee ("La conversion landing->meeting tiendra a 8%+ a scale")
- **status** : "verified" (source auditable) | "declared" (dans le deck seulement) | "projected" (projection future) | "speculative" (aucune source)
- **impact** : ce qui casse si l'hypothese est fausse ("CAC > LTV, modele non viable")
- **validationPath** : comment valider/invalider ("demander cohortes conversion 3 derniers mois")

# ALERTES

Toutes les alertes structurelles (pas limite arbitraire). Chaque alerte:
- **severity** : critical / high / medium / low
- **category** : why_now | problem_reality | solution_fit | moat | unit_economics | path_to_exit | team_dependency | market_size | assumption_fragile
- **title** : titre court (10 mots max)
- **detail** : explication (3-5 phrases max)
- **linkedAssumptionId** : ref a une load-bearing si applicable

# REGLES DE RIGUEUR

- Tu lis CE QUE DIT la societe, tu n'inventes pas de claims favorables
- Tu separes les FAITS verifiables des PROJECTIONS (status: projected)
- Un "pitch visionnaire" sans preuves = alert assumption_fragile de severite elevee
- Si les sources (deck / fact-store / context-engine) ne permettent pas d'etablir un champ, tu le laisses vague ou null. Tu ne comble pas le vide.
- Tu respectes la Regle N°1 Angel Desk : ANALYSE, ne DECIDE JAMAIS. Ton sortie est analytique, pas prescriptive.

LANGUE: Francais.

${THESIS_ANTI_HALLUCINATION_DIRECTIVES}
`;
  }

  protected async execute(context: AgentContext): Promise<ThesisExtractorOutput> {
    // 1. Preparer le contexte synthetique (deck + fact-store + context-engine + deck-coherence)
    const contextSummary = this.buildContextSummary(context);
    const factScope = buildThesisFactScope((context as EnrichedAgentContext).factStore ?? []);
    const sourceDocumentIds = (context.documents ?? []).map((d) => d.id);
    const sourceHash = this.hashSources(context);

    // 2. Extraction core de la these (1 call LLM complex)
    const coreUserPrompt = this.buildCoreUserPrompt(context, contextSummary, factScope);
    const coreResult = await this.llmCompleteJSONValidated<ThesisCoreStructured>(
      coreUserPrompt,
      ThesisCoreStructuredSchema,
      {
        temperature: 0.2,
        ...getThesisCallOptions<ThesisCoreStructured>("core"),
      }
    );
    const core = coreResult.data;
    const repairedSections = repairStructuredClaims(
      {
        reformulated: core.reformulatedClaims,
        problem: core.problemClaims,
        solution: core.solutionClaims,
        whyNow: core.whyNowClaims,
        moat: core.moatClaims,
        pathToExit: core.pathToExitClaims,
      },
      factScope
    );
    assertValidStructuredClaims(
      repairedSections,
      factScope
    );
    const reformulated = renderStructuredClaims(repairedSections.reformulated, factScope);
    const problem = renderStructuredClaims(repairedSections.problem, factScope);
    const solution = renderStructuredClaims(repairedSections.solution, factScope);
    const whyNow = renderStructuredClaims(repairedSections.whyNow, factScope);
    const moat = repairedSections.moat.length > 0
      ? renderStructuredClaims(repairedSections.moat, factScope)
      : null;
    const pathToExit = repairedSections.pathToExit.length > 0
      ? renderStructuredClaims(repairedSections.pathToExit, factScope)
      : null;
    assertSupportedThesisNarrative(
      {
        reformulated,
        problem,
        solution,
        whyNow,
        moat,
        pathToExit,
      },
      (context as EnrichedAgentContext).factStore ?? []
    );

    // 3. 3 frameworks en parallele (Promise.all pour reduire la latence)
    const frameworkInput = {
      reformulated,
      problem,
      solution,
      whyNow,
      moat,
      pathToExit,
      contextSummary,
    };

    const deal = context.canonicalDeal;

    const [yc, thiel, ad] = await Promise.all([
      this.runYcLens(frameworkInput),
      this.runThielLens(frameworkInput),
      this.runAngelDeskLens({
        ...frameworkInput,
        dealStage: deal?.stage ?? undefined,
        dealSector: deal?.sector ?? undefined,
        dealInstrument: deal?.instrument ?? undefined,
        dealAmountRequested: deal?.amountRequested ? Number(deal.amountRequested) : undefined,
        dealValuationPre: deal?.valuationPre ? Number(deal.valuationPre) : undefined,
      }),
    ]);

    const ycLens: FrameworkLens = this.toFrameworkLens("yc", yc.data, yc.availability);
    const thielLens: FrameworkLens = this.toFrameworkLens("thiel", thiel.data, thiel.availability);
    const angelDeskLens: FrameworkLens = this.toFrameworkLens("angel-desk", ad.data, ad.availability);

    const evaluatedLenses = [ycLens, thielLens, angelDeskLens].filter(isFrameworkLensEvaluated);
    if (evaluatedLenses.length === 0) {
      throw new Error(
        "All thesis frameworks degraded; refusing to persist a thesis without any evaluated framework lens"
      );
    }

    // 4. Verdict consolide sur les seules lenses réellement évaluées.
    const verdict: ThesisVerdict = worstVerdict(evaluatedLenses.map((lens) => lens.verdict));
    const confidence = Math.round(
      evaluatedLenses.reduce((sum, lens) => sum + lens.confidence, 0) / evaluatedLenses.length
    );

    // 5. Alerts consolidees — on prend celles extraites par le core PLUS celles derivees des
    // failures des frameworks reellement evalues. Une lens degradee est un incident
    // systeme, pas un signal metier a remonter au BA.
    const alerts: ThesisAlert[] = [
      ...normalizeThesisAlerts(core.alerts),
    ];

    // Ajouter les failures de chaque framework comme alerts si pas deja presents
    this.appendFrameworkFailuresAsAlerts(alerts, ycLens, "yc");
    this.appendFrameworkFailuresAsAlerts(alerts, thielLens, "thiel");
    this.appendFrameworkFailuresAsAlerts(alerts, angelDeskLens, "angel-desk");

    const loadBearing: LoadBearingAssumption[] = normalizeLoadBearingAssumptions(core.loadBearing);

    return {
      reformulated,
      problem,
      solution,
      whyNow,
      moat,
      pathToExit,
      verdict,
      confidence,
      loadBearing,
      alerts,
      ycLens,
      thielLens,
      angelDeskLens,
      sourceDocumentIds,
      sourceHash,
    };
  }

  // -------------------------------------------------------------------------
  // LLM helpers per framework
  // -------------------------------------------------------------------------
  private async runYcLens(input: {
    reformulated: string;
    problem: string;
    solution: string;
    whyNow: string;
    moat: string | null;
    pathToExit: string | null;
    contextSummary: string;
  }): Promise<FrameworkExecutionResult<YcLensOutput>> {
    const result = await this.llmCompleteJSONValidated<YcLensOutput>(
      buildYcLensUserPrompt(input),
      YcLensSchema,
      {
        systemPrompt: buildYcLensSystemPrompt(),
        temperature: 0.2,
        ...getThesisCallOptions<YcLensOutput>("yc-lens"),
      }
    );
    return {
      data: result.data,
      availability: this.mapResolutionToAvailability(result.resolution),
      model: result.model,
    };
  }

  private async runThielLens(input: {
    reformulated: string;
    problem: string;
    solution: string;
    whyNow: string;
    moat: string | null;
    pathToExit: string | null;
    contextSummary: string;
  }): Promise<FrameworkExecutionResult<ThielLensOutput>> {
    const result = await this.llmCompleteJSONValidated<ThielLensOutput>(
      buildThielLensUserPrompt(input),
      ThielLensSchema,
      {
        systemPrompt: buildThielLensSystemPrompt(),
        temperature: 0.2,
        ...getThesisCallOptions<ThielLensOutput>("thiel-lens"),
      }
    );
    return {
      data: result.data,
      availability: this.mapResolutionToAvailability(result.resolution),
      model: result.model,
    };
  }

  private async runAngelDeskLens(input: {
    reformulated: string;
    problem: string;
    solution: string;
    whyNow: string;
    moat: string | null;
    pathToExit: string | null;
    contextSummary: string;
    dealStage?: string;
    dealSector?: string;
    dealInstrument?: string;
    dealAmountRequested?: number;
    dealValuationPre?: number;
  }): Promise<FrameworkExecutionResult<AngelDeskLensOutput>> {
    const result = await this.llmCompleteJSONValidated<AngelDeskLensOutput>(
      buildAngelDeskLensUserPrompt(input),
      AngelDeskLensSchema,
      {
        systemPrompt: buildAngelDeskLensSystemPrompt(),
        temperature: 0.2,
        ...getThesisCallOptions<AngelDeskLensOutput>("angel-desk-lens"),
      }
    );
    return {
      data: result.data,
      availability: this.mapResolutionToAvailability(result.resolution),
      model: result.model,
    };
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------
  private buildContextSummary(context: AgentContext): string {
    const enriched = context as EnrichedAgentContext;
    const parts: string[] = [];

    // Deck text retrieved (on limite a 20K chars pour tenir dans le prompt)
    const documents = context.documents ?? [];
    for (const doc of documents) {
      if (!doc.extractedText) continue;
      if (doc.type !== "PITCH_DECK" && doc.type !== "INVESTOR_MEMO" && doc.type !== "MARKET_STUDY") continue;
      parts.push(`### DOCUMENT ${doc.name} (${doc.type})\n${doc.extractedText.slice(0, 8000)}`);
    }

    // Fact store
    if (enriched.factStoreFormatted) {
      parts.push(`### FACT STORE\n${enriched.factStoreFormatted.slice(0, 6000)}`);
    } else if (enriched.factStore && enriched.factStore.length > 0) {
      const top = enriched.factStore.slice(0, 40).map((f) => `- ${f.factKey}: ${f.currentDisplayValue} [${f.reliability?.reliability ?? "?"}]`).join("\n");
      parts.push(`### FACTS (top 40)\n${top}`);
    }

    // Context engine — highlights
    if (enriched.contextEngine) {
      const ce = enriched.contextEngine;
      const ceLines: string[] = [];
      if (ce.dealIntelligence?.similarDeals?.length) {
        ceLines.push(`Similar deals: ${ce.dealIntelligence.similarDeals.slice(0, 3).map(d => `${d.companyName} (${d.sector})`).join(", ")}`);
      }
      if (ce.competitiveLandscape?.competitors?.length) {
        ceLines.push(`Competitors: ${ce.competitiveLandscape.competitors.slice(0, 5).map(c => c.name).join(", ")}`);
      }
      if (ce.marketData?.marketSize) {
        const m = ce.marketData.marketSize;
        ceLines.push(`Market size: TAM=${m.tam} SAM=${m.sam} SOM=${m.som} CAGR=${m.cagr}%`);
      }
      if (ce.newsSentiment?.overallSentiment) {
        ceLines.push(`News sentiment: ${ce.newsSentiment.overallSentiment}`);
      }
      if (ce.marketData?.benchmarks?.length) {
        const benchmarkLines = ce.marketData.benchmarks
          .slice(0, 5)
          .map((benchmark) =>
            `- ${benchmark.metricName}: P25=${this.formatBenchmarkValue(benchmark.p25)} | ` +
            `Median=${this.formatBenchmarkValue(benchmark.median)} | ` +
            `P75=${this.formatBenchmarkValue(benchmark.p75)} ${benchmark.unit} ` +
            `(${benchmark.sector}/${benchmark.stage}, source=${benchmark.source}, maj=${benchmark.lastUpdated})`
          );
        ceLines.push(`Market benchmarks:\n${benchmarkLines.join("\n")}`);
      }
      if (ceLines.length > 0) {
        parts.push(`### CONTEXT ENGINE HIGHLIGHTS\n${ceLines.join("\n")}`);
      }
    }

    const benchmarkSummary = this.buildBenchmarkSummary(context);
    if (benchmarkSummary) {
      parts.push(benchmarkSummary);
    }

    // Deck coherence report (si present)
    const deckCoherence = enriched.deckCoherenceReport;
    if (deckCoherence) {
      const dc = deckCoherence as { reliabilityGrade?: string; issues?: Array<{ title: string; severity: string }>; missingData?: string[] };
      const issues = (dc.issues ?? []).slice(0, 10).map((i) => `- [${i.severity}] ${i.title}`).join("\n");
      const missing = (dc.missingData ?? []).slice(0, 10).join(", ");
      parts.push(`### DECK COHERENCE REPORT (grade: ${dc.reliabilityGrade ?? "?"})\nIssues:\n${issues}\nMissing: ${missing}`);
    }

    const full = parts.join("\n\n");
    return sanitizeForLLM(full, { maxLength: 40000, preserveNewlines: true });
  }

  private buildBenchmarkSummary(context: AgentContext): string {
    const enriched = context as EnrichedAgentContext;
    const deal = context.canonicalDeal;
    const parts: string[] = [];

    const staticBenchmarks = getBenchmarksForSectorStage(deal?.sector, deal?.stage);
    const staticLines: string[] = [];

    for (const [metric, benchmark] of Object.entries(staticBenchmarks.financial ?? {}).slice(0, 6)) {
      if (!benchmark || typeof benchmark !== "object") continue;
      const record = benchmark as Record<string, unknown>;
      staticLines.push(
        `- ${metric}: P25=${this.formatBenchmarkValue(record.p25)} | ` +
        `Median=${this.formatBenchmarkValue(record.median)} | ` +
        `P75=${this.formatBenchmarkValue(record.p75)} ` +
        `(source=${typeof record.source === "string" ? record.source : "N/A"})`
      );
    }

    const exitBenchmark = staticBenchmarks.exit?.revenueMultiple;
    if (exitBenchmark && typeof exitBenchmark === "object") {
      staticLines.push(
        `- exit.revenueMultiple: P25=${this.formatBenchmarkValue(exitBenchmark.p25)} | ` +
        `Median=${this.formatBenchmarkValue(exitBenchmark.median)} | ` +
        `P75=${this.formatBenchmarkValue(exitBenchmark.p75)} ` +
        `(source=${typeof exitBenchmark.source === "string" ? exitBenchmark.source : "N/A"})`
      );
    }

    if (staticLines.length > 0) {
      parts.push(
        `### BENCHMARKS SECTORIELS ETABLIS (${deal?.sector ?? "general"} / ${deal?.stage ?? "SEED"})\n` +
        staticLines.join("\n")
      );
    }

    const fundingDb = enriched.fundingContext ?? enriched.fundingDbContext;
    if (fundingDb?.valuationBenchmarks) {
      parts.push(
        `### VALUATION BENCHMARKS (Funding DB)\n${sanitizeForLLM(
          JSON.stringify(fundingDb.valuationBenchmarks, null, 2),
          { maxLength: 1800, preserveNewlines: true }
        )}`
      );
    }

    if (fundingDb?.benchmarks) {
      parts.push(
        `### BENCHMARKS SYNTHETIQUES (Funding DB)\n${sanitizeForLLM(
          JSON.stringify(fundingDb.benchmarks, null, 2),
          { maxLength: 1800, preserveNewlines: true }
        )}`
      );
    }

    if (fundingDb?.sectorBenchmarks) {
      parts.push(
        `### BENCHMARKS SECTORIELS (Funding DB)\n${sanitizeForLLM(
          JSON.stringify(fundingDb.sectorBenchmarks, null, 2),
          { maxLength: 2200, preserveNewlines: true }
        )}`
      );
    }

    return parts.join("\n\n");
  }

  private formatBenchmarkValue(value: unknown): string {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "N/A";
    }

    if (Math.abs(value) >= 1000) {
      return value.toLocaleString("fr-FR");
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  private buildCoreUserPrompt(
    context: AgentContext,
    contextSummary: string,
    factScope = buildThesisFactScope((context as EnrichedAgentContext).factStore ?? [])
  ): string {
    const deal = context.canonicalDeal;
    const dealBlock = `
## DEAL META
- Nom: ${deal?.name ?? "N/A"}
- Companie: ${deal?.companyName ?? "N/A"}
- Secteur: ${deal?.sector ?? "N/A"}
- Stage: ${deal?.stage ?? "N/A"}
- Instrument: ${deal?.instrument ?? "N/A"}
- Geographie: ${deal?.geography ?? "N/A"}
- ARR: ${deal?.arr != null ? `€${Number(deal.arr).toLocaleString()}` : "N/A"}
- Growth rate: ${deal?.growthRate != null ? `${deal.growthRate}%` : "N/A"}
- Montant demande: ${deal?.amountRequested != null ? `€${Number(deal.amountRequested).toLocaleString()}` : "N/A"}
- Valorisation pre-money: ${deal?.valuationPre != null ? `€${Number(deal.valuationPre).toLocaleString()}` : "N/A"}

${deal?.description ? `## DESCRIPTION COURTE\n${sanitizeForLLM(deal.description, { maxLength: 3000 })}\n` : ""}
`;

    const formattedFactScope = formatThesisFactScope(factScope);

    return `${dealBlock}

## SOURCES DISPONIBLES (deck + fact-store + context engine + deck-coherence)

${contextSummary}

## THESIS FACT SCOPE (source canonique pour TOUTE affirmation numerique)

Utilise UNIQUEMENT les facts et metriques pre-calculees ci-dessous pour toute affirmation chiffrée dans reformulated / problem / solution / whyNow / moat / pathToExit.
- Si un chiffre ou une metrique n'apparait pas dans ce scope, ne le mentionne pas.
- Tu n'as PAS le droit de calculer toi-meme une marge, un multiple, un runway, un burn/revenue, un LTV/CAC ou toute autre metrique derivee.
- Si une information chiffrée manque ou n'est pas coherente, ecris "inconnu" ou n'en parle pas.
- Les metriques pre-calculees ci-dessous sont les seules metriques derivees autorisees.

${formattedFactScope}

---

Applique ta mission: extrait la these en 6 listes de claims structures (reformulatedClaims, problemClaims, solutionClaims, whyNowClaims, moatClaims, pathToExitClaims), identifie 3-5 load-bearing assumptions structurelles, et remonte les alertes (pas de limite arbitraire).

INTERDICTIONS CRITIQUES:
- N'invente aucun ratio financier.
- N'invente aucune marge EBITDA, marge brute, marge nette, runway, burn rate, multiple de valorisation ou croissance si la metrique n'est pas explicitement presente dans THESIS FACT SCOPE.
- N'utilise pas les nombres presents ailleurs dans le contexte pour contourner cette regle.
- N'ecris AUCUN chiffre dans les claims de type judgment ou unknown.
- N'ecris AUCUN chiffre dans les champs framing de direct_fact ou derived_metric. Le code injectera la valeur numerique lui-meme.

OUTPUT ATTENDU: JSON strict SANS wrapping. Les champs reformulatedClaims, problemClaims, solutionClaims, whyNowClaims, moatClaims, pathToExitClaims, loadBearing et alerts doivent etre a la RACINE du JSON.
PAS de cle enveloppante type "thesis", "data", "output" ou "result".

Exemple attendu:
{
  "reformulatedClaims": [
    { "kind": "direct_fact", "factKey": "financial.amount_raising", "framing": "L'operation recherche un ticket de" },
    { "kind": "judgment", "text": "La these repose sur la capacite a integrer des actifs existants sous une plateforme commune.", "supportingFactKeys": ["financial.amount_raising"] }
  ],
  "problemClaims": [
    { "kind": "judgment", "text": "Le marche cible reste peu structure a echelle institutionnelle.", "supportingFactKeys": ["market.tam"] }
  ],
  "solutionClaims": [],
  "whyNowClaims": [
    { "kind": "unknown", "text": "Le why-now reste insuffisamment documente." }
  ],
  "moatClaims": [],
  "pathToExitClaims": [
    { "kind": "direct_fact", "factKey": "market.tam", "framing": "Le memo cible une valeur de sortie autour de" }
  ],
  "loadBearing": [],
  "alerts": []
}

Exemples CRITIQUES:
- VALID direct_fact:
  { "kind": "direct_fact", "factKey": "financial.amount_raising", "framing": "L'operation recherche un ticket de" }
- VALID derived_metric:
  { "kind": "derived_metric", "metricKey": "ebitda_margin", "framing": "La societe opere avec une marge EBITDA de" }
- VALID judgment:
  { "kind": "judgment", "text": "La these repose sur une integration disciplinée des actifs existants.", "supportingFactKeys": ["financial.amount_raising", "product.stage"] }
- VALID unknown:
  { "kind": "unknown", "text": "Le why-now reste insuffisamment documente." }

INVALIDES:
- { "kind": "judgment", "text": "La societe vise 183M EUR de sortie", "supportingFactKeys": ["market.tam"] }
- { "kind": "unknown", "text": "Le marche compte 6 acteurs" }
- { "kind": "direct_fact", "factKey": "financial.amount_raising", "framing": "L'operation recherche 36M EUR" }

Francais obligatoire. Aucun texte hors JSON.`;
  }

  private appendFrameworkFailuresAsAlerts(
    alerts: ThesisAlert[],
    lens: FrameworkLens,
    source: "yc" | "thiel" | "angel-desk"
  ): void {
    if (!isFrameworkLensEvaluated(lens)) {
      return;
    }
    const verdict = this.normalizeVerdict(lens.verdict);
    const severity = verdict === "alert_dominant" ? "critical" : verdict === "vigilance" ? "high" : "medium";
    for (const f of this.normalizeTextList(lens.failures)) {
      // Evite les doublons triviaux
      if (alerts.some((a) => a.title.toLowerCase() === f.toLowerCase().slice(0, 80))) continue;
      alerts.push({
        severity,
        category: "assumption_fragile",
        title: `[${source}] ${f.slice(0, 80)}`,
        detail: f,
      });
    }
  }

  private toFrameworkLens(
    framework: "yc" | "thiel" | "angel-desk",
    lens: YcLensOutput | ThielLensOutput | AngelDeskLensOutput,
    availability: FrameworkLensAvailability
  ): FrameworkLens {
    return {
      framework,
      availability,
      verdict: this.normalizeVerdict(lens.verdict),
      confidence: this.normalizeConfidence(lens.confidence),
      question: this.normalizeNonEmptyString(lens.question, `${framework} lens`),
      claims: this.normalizeFrameworkClaims(lens.claims),
      failures: this.normalizeTextList(lens.failures),
      strengths: this.normalizeTextList(lens.strengths),
      summary: this.normalizeNonEmptyString(lens.summary, `${framework} lens summary unavailable`),
    };
  }

  private mapResolutionToAvailability(
    resolution: "model_success" | "schema_recovered" | "terminal_fallback"
  ): FrameworkLensAvailability {
    switch (resolution) {
      case "model_success":
        return "evaluated";
      case "schema_recovered":
        return "degraded_schema_recovered";
      case "terminal_fallback":
        return "degraded_chain_exhausted";
    }
  }

  private normalizeVerdict(value: unknown): ThesisVerdict {
    return ThesisExtractorAgent.VALID_VERDICTS.includes(value as ThesisVerdict)
      ? (value as ThesisVerdict)
      : "contrasted";
  }

  private normalizeConfidence(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 50;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private normalizeNonEmptyString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  }

  private normalizeTextList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          for (const key of ["failure", "title", "detail", "reason", "message", "summary", "claim"]) {
            const candidate = record[key];
            if (typeof candidate === "string" && candidate.trim().length > 0) {
              return candidate.trim();
            }
          }
          try {
            const serialized = JSON.stringify(entry);
            return serialized && serialized !== "{}" ? serialized : "";
          } catch {
            return "";
          }
        }
        if (typeof entry === "number" || typeof entry === "boolean") {
          return String(entry);
        }
        return "";
      })
      .filter((entry): entry is string => entry.length > 0);
  }

  private normalizeFrameworkClaims(value: unknown): FrameworkClaim[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.reduce<FrameworkClaim[]>((claims, entry, index) => {
      if (!entry || typeof entry !== "object") {
        return claims;
      }

      const record = entry as Record<string, unknown>;
      const status = ThesisExtractorAgent.VALID_CLAIM_STATUSES.includes(record.status as (typeof ThesisExtractorAgent.VALID_CLAIM_STATUSES)[number])
        ? (record.status as FrameworkClaim["status"])
        : "unverifiable";

      claims.push({
        claim: this.normalizeNonEmptyString(record.claim, `Claim ${index + 1}`),
        derivedFrom: this.normalizeNonEmptyString(record.derivedFrom, "Source non structuree"),
        status,
        evidence: typeof record.evidence === "string" && record.evidence.trim().length > 0 ? record.evidence.trim() : undefined,
        concern: typeof record.concern === "string" && record.concern.trim().length > 0 ? record.concern.trim() : undefined,
      });
      return claims;
    }, []);
  }

  private hashSources(context: AgentContext): string {
    const sourceIds = (context.documents ?? []).map((d) => d.id).sort();
    const contentHashes = (context.documents ?? [])
      .map((d) => d.extractedText ? createHash("sha256").update(d.extractedText).digest("hex").slice(0, 12) : "empty")
      .sort();
    const signature = `${sourceIds.join(",")}|${contentHashes.join(",")}`;
    return createHash("sha256").update(signature).digest("hex");
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------
export const thesisExtractorAgent = new ThesisExtractorAgent();
