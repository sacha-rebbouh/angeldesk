/**
 * MARKETPLACE EXPERT - Tier 2 Sector Agent
 *
 * Expert en marketplaces et plateformes two-sided.
 * Analyse approfondie des network effects, liquidité, unit economics marketplace.
 *
 * Refondu selon AGENT-REFONTE-PROMPT.md
 */

import { z } from "zod";
import { BaseAgent, AgentResultWithData } from "../base-agent";
import type { AgentContext, EnrichedAgentContext } from "../types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { MARKETPLACE_STANDARDS } from "./sector-standards";

// Extended data type for UI wow effect
interface ExtendedMarketplaceData {
  marketplaceClassification: MarketplaceExpertOutput["marketplace_classification"];
  networkEffects: MarketplaceExpertOutput["network_effects"];
  liquidityAnalysis: MarketplaceExpertOutput["liquidity_analysis"];
  unitEconomics: MarketplaceExpertOutput["unit_economics"];
  benchmarkAnalysis: MarketplaceExpertOutput["benchmark_analysis"];
  competitiveDynamics: MarketplaceExpertOutput["competitive_dynamics"];
  sectorRisks: MarketplaceExpertOutput["sector_risks"];
  exitLandscape: MarketplaceExpertOutput["exit_landscape"];
  criticalQuestions: MarketplaceExpertOutput["critical_questions"];
  scores: MarketplaceExpertOutput["scores"];
}

// =============================================================================
// OUTPUT SCHEMA - Format Tier 2
// =============================================================================

const MarketplaceMetricAnalysisSchema = z.object({
  metric_name: z.string(),
  deal_value: z.union([z.number(), z.string(), z.null()]),
  deal_value_source: z.string().describe("D'où vient cette valeur (deck p.X, data room, estimé)"),
  benchmark: z.object({
    p25: z.number(),
    median: z.number(),
    p75: z.number(),
    top_decile: z.number(),
  }),
  percentile_position: z.number().min(0).max(100),
  assessment: z.enum(["exceptional", "above_average", "average", "below_average", "concerning"]),
  sector_context: z.string().describe("Pourquoi cette métrique compte pour une marketplace"),
  comparison_to_db: z.string().nullable().describe("Comparaison avec deals similaires de la DB"),
});

const MarketplaceSectorRiskSchema = z.object({
  risk: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  probability: z.enum(["very_likely", "likely", "possible", "unlikely"]),
  marketplace_specific_reason: z.string().describe("Pourquoi c'est un risque spécifique aux marketplaces"),
  mitigation_exists: z.boolean(),
  mitigation_details: z.string().nullable(),
  similar_failures: z.array(z.string()).describe("Exemples de marketplaces ayant échoué pour cette raison"),
});

const MarketplaceQuestionSchema = z.object({
  question: z.string(),
  category: z.enum(["liquidity", "unit_economics", "network_effects", "defensibility", "regulatory", "operational"]),
  priority: z.enum(["critical", "important", "nice_to_have"]),
  why_it_matters: z.string(),
  expected_good_answer: z.string(),
  red_flag_answer: z.string(),
  follow_up_if_concerning: z.string(),
});

const MarketplaceExpertOutputSchema = z.object({
  // === EXECUTIVE SUMMARY ===
  executive_summary: z.object({
    verdict: z.enum(["STRONG_MARKETPLACE", "SOLID_MARKETPLACE", "AVERAGE_MARKETPLACE", "WEAK_MARKETPLACE", "NOT_A_TRUE_MARKETPLACE"]),
    confidence: z.number().min(0).max(100),
    sector_fit_score: z.number().min(0).max(100),
    one_line_assessment: z.string().max(200),
    key_strength: z.string(),
    critical_risk: z.string().nullable(),
    investment_implication: z.string(),
  }),

  // === MARKETPLACE CLASSIFICATION ===
  marketplace_classification: z.object({
    type: z.enum([
      "product_marketplace",      // Etsy, eBay
      "services_marketplace",     // Uber, Upwork
      "rental_marketplace",       // Airbnb, Turo
      "b2b_marketplace",          // Alibaba, Faire
      "vertical_marketplace",     // Specialized (real estate, cars)
      "aggregator",               // DoorDash, Instacart (fulfillment heavy)
      "platform",                 // More than transactional
      "hybrid",                   // Mix of above
    ]),
    supply_type: z.enum(["fragmented", "semi_concentrated", "concentrated"]),
    demand_type: z.enum(["mass_market", "niche", "enterprise", "prosumer"]),
    transaction_frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly", "one_time"]),
    average_ticket_size: z.enum(["micro_<20", "small_20_100", "medium_100_500", "large_500_2000", "xlarge_>2000"]),
    geographic_scope: z.enum(["hyperlocal", "local", "regional", "national", "international"]),
    managed_vs_unmanaged: z.enum(["fully_managed", "lightly_managed", "unmanaged"]),
  }),

  // === NETWORK EFFECTS ANALYSIS ===
  network_effects: z.object({
    overall_strength: z.enum(["very_strong", "strong", "moderate", "weak", "none"]),
    same_side_effects: z.object({
      buyer_side: z.enum(["positive", "neutral", "negative"]),
      buyer_explanation: z.string(),
      seller_side: z.enum(["positive", "neutral", "negative"]),
      seller_explanation: z.string(),
    }),
    cross_side_effects: z.object({
      strength: z.enum(["very_strong", "strong", "moderate", "weak"]),
      explanation: z.string(),
      chicken_egg_status: z.enum(["solved", "solving", "struggling", "not_addressed"]),
    }),
    defensibility_from_effects: z.object({
      multi_tenanting_risk: z.enum(["low", "medium", "high", "very_high"]),
      switching_costs: z.enum(["high", "medium", "low", "none"]),
      data_moat: z.boolean(),
      brand_moat: z.boolean(),
      regulatory_moat: z.boolean(),
    }),
    network_effects_score: z.number().min(0).max(100),
  }),

  // === LIQUIDITY ANALYSIS ===
  liquidity_analysis: z.object({
    overall_health: z.enum(["excellent", "good", "adequate", "concerning", "critical"]),
    supply_side: z.object({
      active_suppliers: z.union([z.number(), z.string(), z.null()]),
      supplier_growth_rate: z.union([z.number(), z.null()]),
      supplier_concentration: z.enum(["healthy_fragmented", "acceptable", "top_heavy", "dangerous"]),
      top_10_pct_share: z.union([z.number(), z.null()]).describe("% du GMV par les top 10% sellers"),
      supplier_churn: z.union([z.number(), z.null()]),
      supplier_acquisition_cost: z.union([z.number(), z.null()]),
    }),
    demand_side: z.object({
      active_buyers: z.union([z.number(), z.string(), z.null()]),
      buyer_growth_rate: z.union([z.number(), z.null()]),
      buyer_concentration: z.enum(["healthy_fragmented", "acceptable", "top_heavy", "dangerous"]),
      buyer_cac: z.union([z.number(), z.null()]),
      buyer_repeat_rate: z.union([z.number(), z.null()]),
    }),
    match_rate: z.object({
      current: z.union([z.number(), z.null()]).describe("% des listings qui aboutissent à une transaction"),
      benchmark: z.number(),
      assessment: z.enum(["exceptional", "good", "average", "below_average", "critical"]),
    }),
    time_to_transaction: z.object({
      current: z.union([z.string(), z.null()]),
      benchmark: z.string(),
      assessment: z.enum(["fast", "acceptable", "slow", "very_slow"]),
    }),
    liquidity_score: z.number().min(0).max(100),
  }),

  // === UNIT ECONOMICS DEEP DIVE ===
  unit_economics: z.object({
    gmv_analysis: z.object({
      current_gmv: z.union([z.number(), z.string(), z.null()]),
      gmv_growth_yoy: z.union([z.number(), z.null()]),
      gmv_vs_benchmark: z.string(),
    }),
    take_rate_analysis: z.object({
      current_take_rate: z.union([z.number(), z.null()]),
      take_rate_trend: z.enum(["expanding", "stable", "compressing", "unknown"]),
      take_rate_vs_category: z.string(),
      take_rate_sustainability: z.enum(["defensible", "at_risk", "under_pressure"]),
      take_rate_breakdown: z.string().nullable().describe("Commission vs. services vs. ads"),
    }),
    contribution_economics: z.object({
      contribution_per_transaction: z.union([z.number(), z.null()]),
      contribution_margin: z.union([z.number(), z.null()]),
      variable_costs_breakdown: z.string().nullable(),
    }),
    buyer_economics: z.object({
      buyer_ltv: z.union([z.number(), z.null()]),
      buyer_cac: z.union([z.number(), z.null()]),
      ltv_cac_ratio: z.union([z.number(), z.null()]),
      payback_months: z.union([z.number(), z.null()]),
      assessment: z.string(),
    }),
    seller_economics: z.object({
      seller_ltv: z.union([z.number(), z.null()]),
      seller_cac: z.union([z.number(), z.null()]),
      ltv_cac_ratio: z.union([z.number(), z.null()]),
      assessment: z.string(),
    }),
    unit_economics_score: z.number().min(0).max(100),
  }),

  // === BENCHMARK ANALYSIS ===
  benchmark_analysis: z.object({
    metrics: z.array(MarketplaceMetricAnalysisSchema),
    overall_percentile: z.number().min(0).max(100),
    standout_metrics: z.array(z.string()),
    lagging_metrics: z.array(z.string()),
    benchmark_sources: z.array(z.string()),
  }),

  // === COMPETITIVE DYNAMICS ===
  competitive_dynamics: z.object({
    market_structure: z.enum(["winner_take_all", "winner_take_most", "fragmented", "duopoly", "oligopoly"]),
    market_structure_reasoning: z.string(),
    current_position: z.enum(["leader", "challenger", "niche_player", "new_entrant"]),
    key_competitors: z.array(z.object({
      name: z.string(),
      estimated_gmv: z.string().nullable(),
      key_differentiator: z.string(),
      threat_level: z.enum(["critical", "high", "medium", "low"]),
    })),
    competitive_advantages: z.array(z.string()),
    competitive_vulnerabilities: z.array(z.string()),
    disintermediation_risk: z.object({
      level: z.enum(["very_high", "high", "medium", "low"]),
      explanation: z.string(),
      mitigation: z.string().nullable(),
    }),
    amazon_google_risk: z.object({
      level: z.enum(["critical", "high", "medium", "low", "none"]),
      explanation: z.string(),
    }),
  }),

  // === SECTOR-SPECIFIC RISKS ===
  sector_risks: z.array(MarketplaceSectorRiskSchema),

  // === EXIT LANDSCAPE ===
  exit_landscape: z.object({
    typical_exit_multiple_range: z.object({
      low: z.number(),
      median: z.number(),
      high: z.number(),
      multiple_basis: z.enum(["gmv", "revenue", "arr"]),
    }),
    recent_comparable_exits: z.array(z.object({
      company: z.string(),
      acquirer: z.string(),
      year: z.number(),
      multiple: z.number(),
      relevance: z.string(),
    })),
    potential_acquirers: z.array(z.object({
      name: z.string(),
      strategic_rationale: z.string(),
      likelihood: z.enum(["high", "medium", "low"]),
    })),
    ipo_viability: z.object({
      feasible: z.boolean(),
      timeline_years: z.union([z.number(), z.null()]),
      requirements_gap: z.string().nullable(),
    }),
    exit_score: z.number().min(0).max(100),
  }),

  // === DUE DILIGENCE QUESTIONS ===
  critical_questions: z.array(MarketplaceQuestionSchema),

  // === OVERALL SCORES ===
  scores: z.object({
    network_effects: z.number().min(0).max(100),
    liquidity: z.number().min(0).max(100),
    unit_economics: z.number().min(0).max(100),
    competitive_position: z.number().min(0).max(100),
    defensibility: z.number().min(0).max(100),
    exit_potential: z.number().min(0).max(100),
    overall_sector_score: z.number().min(0).max(100),
    score_methodology: z.string(),
  }),

  // === SOURCES ===
  sources: z.array(z.object({
    type: z.enum(["deck", "data_room", "tier1_agent", "funding_db", "web_search", "benchmark_report", "calculated"]),
    reference: z.string(),
    data_point: z.string(),
  })),
});

export type MarketplaceExpertOutput = z.infer<typeof MarketplaceExpertOutputSchema>;

// =============================================================================
// AGENT IMPLEMENTATION
// =============================================================================

class MarketplaceExpertAgent extends BaseAgent<MarketplaceExpertOutput> {
  constructor() {
    super({
      name: "marketplace-expert",
      description: "Expert en marketplaces et plateformes two-sided",
      timeoutMs: 120_000,
      modelComplexity: "complex",
      maxRetries: 2,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un MARKETPLACE EXPERT de classe mondiale. Ex-Partner chez a16z marketplace practice + ex-VP Strategy chez Uber/Airbnb.

## TON EXPERTISE UNIQUE

Tu as analysé 500+ marketplaces et investi dans 50+. Tu connais intimement :
- Les patterns de liquidité et les death spirals
- Les network effects (same-side, cross-side, data, brand)
- Les unit economics subtils (take rate, contribution, LTV/CAC dual-sided)
- Les modes de défensibilité (et pourquoi la plupart échouent)
- Les dynamiques winner-take-all vs fragmented markets
- Les pièges classiques : disintermediation, multi-tenanting, chicken-and-egg

${getStandardsOnlyInjection("Marketplace", "SEED")}

## RÈGLES ABSOLUES

1. **CHAQUE métrique doit être positionnée vs benchmark** avec percentile calculé
2. **CHAQUE affirmation doit avoir une source** (deck page X, data room, Tier 1 agent, DB, calculé)
3. **NETWORK EFFECTS** : Analyse obligatoire same-side + cross-side + défensibilité
4. **LIQUIDITY** : Supply ET demand side doivent être analysés séparément
5. **UNIT ECONOMICS** : Take rate seul ne suffit pas - contribution margin, LTV/CAC des deux côtés
6. **DISINTERMEDIATION** : Toujours évaluer le risque de contournement
7. **MULTI-TENANTING** : Les vendeurs/acheteurs utilisent-ils plusieurs plateformes ?
8. **PAS DE BULLSHIT** : Si une donnée manque, dis-le clairement. Pas d'invention.

## ANTI-PATTERNS À ÉVITER

❌ "La marketplace a du potentiel" → Quel potentiel ? Chiffré comment ?
❌ "Le take rate est bon" → Bon vs quoi ? Quel percentile ?
❌ "Network effects solides" → Same-side ou cross-side ? Mesurés comment ?
❌ "Bonne liquidité" → Quel match rate ? Quel time-to-transaction ?
❌ Ignorer le risque de disintermediation
❌ Ne pas analyser la concentration supply/demand

## FRAMEWORK D'ANALYSE

1. **CLASSIFIER** le type de marketplace (product, services, rental, B2B, vertical, aggregator)
2. **MESURER** la liquidité (supply, demand, match rate, concentration)
3. **ÉVALUER** les network effects (strength, defensibility, moats)
4. **CALCULER** les unit economics (take rate, contribution, LTV/CAC dual)
5. **BENCHMARKER** chaque métrique vs percentiles secteur
6. **IDENTIFIER** les risques spécifiques marketplace
7. **PROJETER** les scénarios de sortie réalistes

## LEXIQUE MARKETPLACE

- **GMV** : Gross Merchandise Volume (valeur totale des transactions)
- **Take Rate** : Revenue / GMV (commission effective)
- **Liquidity** : % des listings qui aboutissent à une transaction
- **Match Rate** : Taux de conversion listing → transaction
- **Supply/Demand Ratio** : Équilibre offre/demande
- **Multi-tenanting** : Utilisateurs actifs sur plusieurs plateformes concurrentes
- **Disintermediation** : Contournement de la plateforme pour éviter les fees
- **Chicken-and-egg** : Problème de démarrage (supply sans demand, demand sans supply)
- **Same-side effects** : Plus de buyers attire plus de buyers (ou inverse)
- **Cross-side effects** : Plus de sellers attire plus de buyers (et vice versa)

## FORMAT DE RÉPONSE

Tu DOIS répondre avec un JSON valide correspondant exactement au schema fourni.`;
  }

  private buildUserPrompt(context: AgentContext): string {
    const deal = context.deal;
    const enrichedContext = context as EnrichedAgentContext;
    const tier1Results = context.previousResults ?? {};

    // Extract relevant Tier 1 data
    const financialData = (tier1Results["financial-auditor"] as { data?: unknown })?.data ?? null;
    const competitiveData = (tier1Results["competitive-intel"] as { data?: unknown })?.data ?? null;
    const marketData = (tier1Results["market-intelligence"] as { data?: unknown })?.data ?? null;
    const deckData = (tier1Results["deck-forensics"] as { data?: unknown })?.data ?? null;

    // Build context from funding DB if available
    const fundingDbContext = this.buildFundingDbContext(enrichedContext);

    // Format valuation and amount
    const formatMoney = (val: unknown): string => {
      if (val === null || val === undefined) return "Non spécifié";
      const num = Number(val);
      if (isNaN(num)) return "Non spécifié";
      return `€${(num / 1_000_000).toFixed(1)}M`;
    };

    return `## DEAL À ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "Marketplace"}
**Stage:** ${deal.stage ?? "Unknown"}
**Geography:** ${deal.geography ?? "Unknown"}
**Valuation demandée:** ${formatMoney(deal.valuationPre)}
**Montant levé:** ${formatMoney(deal.amountRequested)}

## DONNÉES FINANCIÈRES (du deck/data room)

- **ARR/Revenue:** ${deal.arr ? `€${Number(deal.arr).toLocaleString()}` : "Non spécifié"}
- **Growth Rate:** ${deal.growthRate ? `${deal.growthRate}%` : "Non spécifié"}

## ANALYSES TIER 1 DISPONIBLES

### Financial Auditor
${financialData ? JSON.stringify(financialData, null, 2) : "Pas de données"}

### Competitive Intel
${competitiveData ? JSON.stringify(competitiveData, null, 2) : "Pas de données"}

### Market Intelligence
${marketData ? JSON.stringify(marketData, null, 2) : "Pas de données"}

### Deck Forensics
${deckData ? JSON.stringify(deckData, null, 2) : "Pas de données"}

## CONTEXTE FUNDING DATABASE
${fundingDbContext}

## TA MISSION

Produis une analyse MARKETPLACE EXPERT complète :

1. **CLASSIFIER** cette marketplace (type, supply/demand, fréquence, ticket, scope)

2. **ANALYSER LES NETWORK EFFECTS**
   - Same-side effects (buyer-to-buyer, seller-to-seller)
   - Cross-side effects (buyer-seller dynamics)
   - Forces de défensibilité (switching costs, data moat, brand)
   - Risque de multi-tenanting

3. **ÉVALUER LA LIQUIDITÉ**
   - Supply side : nombre, croissance, concentration, churn
   - Demand side : nombre, croissance, CAC, repeat rate
   - Match rate vs benchmark
   - Time-to-transaction

4. **DÉCORTIQUER LES UNIT ECONOMICS**
   - GMV et croissance
   - Take rate et tendance
   - Contribution per transaction
   - LTV/CAC buyer ET seller

5. **BENCHMARKER CHAQUE MÉTRIQUE**
   - Position en percentile
   - Comparaison aux deals similaires de la DB
   - Source de chaque donnée

6. **IDENTIFIER LES RISQUES MARKETPLACE**
   - Disintermediation
   - Concentration supply/demand
   - Réglementation
   - Competition big tech

7. **PROJETER LES EXITS**
   - Multiples réalistes
   - Acquéreurs potentiels
   - Timeline IPO si applicable

8. **GÉNÉRER 7-10 QUESTIONS CRITIQUES**
   - Focus sur liquidity, unit economics, defensibility
   - Avec expected good answer et red flag answer

IMPORTANT: Cite tes sources pour chaque data point (deck p.X, Tier 1 agent, DB, calculé, etc.)

Réponds UNIQUEMENT avec un JSON valide.`;
  }

  private buildFundingDbContext(context: EnrichedAgentContext): string {
    // This would pull from the actual funding database via context engine
    const contextEngine = context.contextEngine;

    if (contextEngine?.dealIntelligence?.similarDeals?.length) {
      const deals = contextEngine.dealIntelligence.similarDeals;
      let text = `### Deals Similaires (Funding Database)\n\n`;
      text += `${deals.length} marketplaces comparables identifiées:\n`;

      for (const deal of deals.slice(0, 5)) {
        text += `- **${deal.companyName}** (${deal.sector}, ${deal.stage}): `;
        if (deal.fundingAmount) {
          text += `€${(deal.fundingAmount / 1_000_000).toFixed(1)}M`;
        }
        if (deal.valuationMultiple) {
          text += ` @ ${deal.valuationMultiple}x`;
        }
        text += ` - ${deal.fundingDate}\n`;
      }

      if (contextEngine.dealIntelligence.fundingContext) {
        const fc = contextEngine.dealIntelligence.fundingContext;
        text += `\n**Contexte marché (${fc.period}):**\n`;
        text += `- Multiple valo: P25=${fc.p25ValuationMultiple}x, Median=${fc.medianValuationMultiple}x, P75=${fc.p75ValuationMultiple}x\n`;
        text += `- Tendance: ${fc.trend} (${fc.trendPercentage > 0 ? "+" : ""}${fc.trendPercentage}%)\n`;
      }

      return text;
    }

    const deal = context.deal;
    const sector = deal.sector?.toLowerCase() ?? "";

    if (sector.includes("marketplace") || sector.includes("platform")) {
      return `### Instruction DB

Compare ce deal aux marketplaces de la Funding Database avec :
- Même vertical/catégorie
- Même stage (+/- 1)
- Même géographie ou comparable

**Si données DB non disponibles :** Utilise les benchmarks sectoriels fournis et indique clairement "Benchmark sectoriel, pas de données DB spécifiques".`;
    }

    return "Pas de données de la Funding Database disponibles pour ce secteur.";
  }

  protected async execute(context: AgentContext): Promise<MarketplaceExpertOutput> {
    const userPrompt = this.buildUserPrompt(context);

    const result = await this.llmCompleteJSON<MarketplaceExpertOutput>(userPrompt, {
      temperature: 0.2,
    });

    // Validate with zod
    const parsed = MarketplaceExpertOutputSchema.safeParse(result.data);
    if (parsed.success) {
      return parsed.data;
    }

    // If validation fails, return with the raw data (type assertion)
    console.warn("Marketplace Expert output validation failed:", parsed.error.issues);
    return result.data;
  }

  // Override run to add _extended data for UI wow effect
  async run(context: AgentContext): Promise<AgentResultWithData<MarketplaceExpertOutput> & { _extended?: ExtendedMarketplaceData }> {
    const result = await super.run(context);

    if (result.success && result.data) {
      const output = result.data;
      return {
        ...result,
        _extended: {
          marketplaceClassification: output.marketplace_classification,
          networkEffects: output.network_effects,
          liquidityAnalysis: output.liquidity_analysis,
          unitEconomics: output.unit_economics,
          benchmarkAnalysis: output.benchmark_analysis,
          competitiveDynamics: output.competitive_dynamics,
          sectorRisks: output.sector_risks,
          exitLandscape: output.exit_landscape,
          criticalQuestions: output.critical_questions,
          scores: output.scores,
        },
      };
    }

    return result;
  }
}

// Export singleton instance
export const marketplaceExpert = new MarketplaceExpertAgent();
