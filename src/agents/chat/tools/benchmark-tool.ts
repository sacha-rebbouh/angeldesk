/**
 * Benchmark Tool - Compare deal metrics to sector benchmarks
 *
 * Fetches benchmarks from SectorBenchmark table and compares deal metrics
 * to P25/Median/P75 percentiles.
 */

import { prisma } from '@/lib/prisma';

// ============================================================================
// TYPES
// ============================================================================

export interface DealData {
  arr?: number;
  mrr?: number;
  growthRate?: number;
  nrr?: number; // Net Revenue Retention
  grossMargin?: number;
  burnMultiple?: number;
  ltv?: number;
  cac?: number;
  ltvCacRatio?: number;
  paybackMonths?: number;
  churnRate?: number;
  arpu?: number;
  employees?: number;
  arrPerEmployee?: number;
  valuationMultiple?: number;
  stage?: string;
}

export type MetricAssessment =
  | 'bottom_quartile'
  | 'below_average'
  | 'average'
  | 'above_average'
  | 'top_quartile';

export interface MetricComparison {
  name: string;
  displayName: string;
  dealValue: number | null;
  p25: number;
  median: number;
  p75: number;
  percentile: number | null; // null if dealValue is missing
  assessment: MetricAssessment | 'insufficient_data';
  unit: string;
  interpretation: string;
}

export interface BenchmarkComparison {
  sector: string;
  sectorDisplayName: string;
  stage: string | null;
  benchmarkSource: string | null;
  benchmarkVersion: number;
  metrics: MetricComparison[];
  overallPosition: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

// Benchmark data structure from SectorBenchmark.data JSON
interface SectorBenchmarkData {
  primaryMetrics?: {
    [key: string]: {
      p25: number;
      median: number;
      p75: number;
      unit?: string;
      description?: string;
    };
  };
  secondaryMetrics?: {
    [key: string]: {
      p25: number;
      median: number;
      p75: number;
      unit?: string;
      description?: string;
    };
  };
  exitMultiples?: {
    [key: string]: {
      p25: number;
      median: number;
      p75: number;
    };
  };
}

// ============================================================================
// METRIC DEFINITIONS
// ============================================================================

const METRIC_DISPLAY_NAMES: Record<string, { displayName: string; unit: string; higherIsBetter: boolean }> = {
  arr: { displayName: 'ARR', unit: '€', higherIsBetter: true },
  mrr: { displayName: 'MRR', unit: '€', higherIsBetter: true },
  growthRate: { displayName: 'Growth Rate YoY', unit: '%', higherIsBetter: true },
  nrr: { displayName: 'Net Revenue Retention', unit: '%', higherIsBetter: true },
  grossMargin: { displayName: 'Gross Margin', unit: '%', higherIsBetter: true },
  burnMultiple: { displayName: 'Burn Multiple', unit: 'x', higherIsBetter: false },
  ltv: { displayName: 'LTV', unit: '€', higherIsBetter: true },
  cac: { displayName: 'CAC', unit: '€', higherIsBetter: false },
  ltvCacRatio: { displayName: 'LTV/CAC Ratio', unit: 'x', higherIsBetter: true },
  paybackMonths: { displayName: 'CAC Payback', unit: 'mois', higherIsBetter: false },
  churnRate: { displayName: 'Churn Rate', unit: '%', higherIsBetter: false },
  arpu: { displayName: 'ARPU', unit: '€/mois', higherIsBetter: true },
  employees: { displayName: 'Headcount', unit: 'personnes', higherIsBetter: false },
  arrPerEmployee: { displayName: 'ARR per Employee', unit: '€', higherIsBetter: true },
  valuationMultiple: { displayName: 'Valuation Multiple', unit: 'x ARR', higherIsBetter: false },
};

// Sector normalization mapping
const SECTOR_MAPPING: Record<string, string[]> = {
  'saas': ['saas', 'saas b2b', 'b2b saas', 'software', 'enterprise software'],
  'fintech': ['fintech', 'finance', 'financial services', 'payments', 'insurtech', 'banking'],
  'marketplace': ['marketplace', 'marketplaces', 'platform', 'two-sided marketplace'],
  'ai': ['ai', 'ml', 'machine learning', 'artificial intelligence', 'llm', 'generative ai'],
  'healthtech': ['healthtech', 'health tech', 'digital health', 'medtech', 'healthcare'],
  'deeptech': ['deeptech', 'deep tech', 'hard tech', 'science-based'],
  'climate': ['climate', 'cleantech', 'clean tech', 'greentech', 'sustainability', 'energy'],
  'consumer': ['consumer', 'd2c', 'dtc', 'e-commerce', 'ecommerce', 'retail'],
  'hardware': ['hardware', 'iot', 'robotics', 'electronics', 'devices'],
  'gaming': ['gaming', 'games', 'mobile games', 'video games', 'esports'],
  'blockchain': ['blockchain', 'web3', 'crypto', 'defi', 'nft', 'dao'],
  'biotech': ['biotech', 'life sciences', 'pharma', 'drug discovery'],
  'edtech': ['edtech', 'education', 'learning', 'e-learning'],
  'proptech': ['proptech', 'real estate', 'construction tech'],
  'mobility': ['mobility', 'transportation', 'logistics', 'automotive'],
  'foodtech': ['foodtech', 'food tech', 'agtech', 'agriculture'],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize sector name for database lookup
 */
function normalizeSector(sector: string): string {
  const normalized = sector.toLowerCase().trim();

  for (const [canonical, variants] of Object.entries(SECTOR_MAPPING)) {
    if (variants.some(v => normalized.includes(v) || v.includes(normalized))) {
      return canonical;
    }
  }

  return normalized;
}

/**
 * Calculate percentile position of a value within P25/Median/P75
 */
function calculatePercentile(
  value: number,
  p25: number,
  median: number,
  p75: number,
  higherIsBetter: boolean
): number {
  // Handle inverted metrics (where lower is better)
  if (!higherIsBetter) {
    // Swap p25 and p75 conceptually
    const temp = p25;
    p25 = p75;
    p75 = temp;
  }

  if (value <= p25) {
    // Below P25: scale from 0-25
    if (p25 === 0) return 0;
    return Math.max(0, (value / p25) * 25);
  } else if (value <= median) {
    // Between P25 and median: scale from 25-50
    const range = median - p25;
    if (range === 0) return 25;
    return 25 + ((value - p25) / range) * 25;
  } else if (value <= p75) {
    // Between median and P75: scale from 50-75
    const range = p75 - median;
    if (range === 0) return 50;
    return 50 + ((value - median) / range) * 25;
  } else {
    // Above P75: scale from 75-100
    const above = value - p75;
    const topRange = p75 - median; // Use same range as median-to-p75
    if (topRange === 0) return 100;
    return Math.min(100, 75 + (above / topRange) * 25);
  }
}

/**
 * Determine assessment based on percentile and metric direction
 */
function assessMetric(
  percentile: number,
  higherIsBetter: boolean
): MetricAssessment {
  // For "lower is better" metrics, percentile interpretation is inverted
  const effectivePercentile = higherIsBetter ? percentile : (100 - percentile);

  if (effectivePercentile >= 75) return 'top_quartile';
  if (effectivePercentile >= 50) return 'above_average';
  if (effectivePercentile >= 35) return 'average';
  if (effectivePercentile >= 25) return 'below_average';
  return 'bottom_quartile';
}

/**
 * Generate interpretation text for a metric
 */
function interpretMetric(
  name: string,
  assessment: MetricAssessment | 'insufficient_data',
  dealValue: number | null,
  median: number,
  unit: string
): string {
  const metricInfo = METRIC_DISPLAY_NAMES[name] || { displayName: name, higherIsBetter: true };

  if (assessment === 'insufficient_data' || dealValue === null) {
    return `Donnée non disponible pour ${metricInfo.displayName}.`;
  }

  const diff = dealValue - median;
  const diffPct = median !== 0 ? Math.abs((diff / median) * 100).toFixed(0) : '0';
  const direction = diff > 0 ? 'au-dessus' : 'en-dessous';

  const assessmentText: Record<MetricAssessment, string> = {
    top_quartile: 'excellent (top 25%)',
    above_average: 'bon (au-dessus de la médiane)',
    average: 'dans la moyenne',
    below_average: 'sous la moyenne',
    bottom_quartile: 'faible (quartile inférieur)',
  };

  return `${metricInfo.displayName}: ${dealValue}${unit} - ${assessmentText[assessment]}. ` +
         `${diffPct}% ${direction} de la médiane du secteur (${median}${unit}).`;
}

/**
 * Generate overall position summary
 */
function generateOverallPosition(metrics: MetricComparison[]): string {
  const assessments = metrics
    .filter(m => m.assessment !== 'insufficient_data')
    .map(m => m.assessment);

  if (assessments.length === 0) {
    return 'Données insuffisantes pour évaluer la position globale.';
  }

  const scores: Record<MetricAssessment, number> = {
    top_quartile: 5,
    above_average: 4,
    average: 3,
    below_average: 2,
    bottom_quartile: 1,
  };

  const avgScore = assessments.reduce((sum, a) => sum + scores[a as MetricAssessment], 0) / assessments.length;

  if (avgScore >= 4.5) {
    return 'Performance exceptionnelle - Top 10% du secteur sur la plupart des métriques.';
  } else if (avgScore >= 4) {
    return 'Très bonne performance - Au-dessus de la médiane sur la majorité des métriques.';
  } else if (avgScore >= 3.5) {
    return 'Bonne performance - Légèrement au-dessus de la médiane du secteur.';
  } else if (avgScore >= 3) {
    return 'Performance moyenne - Dans la norme du secteur.';
  } else if (avgScore >= 2.5) {
    return 'Performance mitigée - En dessous de la médiane sur plusieurs métriques importantes.';
  } else {
    return 'Performance préoccupante - Métriques significativement sous les standards du secteur.';
  }
}

/**
 * Identify strengths based on metric assessments
 */
function identifyStrengths(metrics: MetricComparison[]): string[] {
  return metrics
    .filter(m => m.assessment === 'top_quartile' || m.assessment === 'above_average')
    .map(m => {
      const info = METRIC_DISPLAY_NAMES[m.name] || { displayName: m.name };
      return `${info.displayName}: ${m.dealValue}${m.unit} (${m.percentile?.toFixed(0)}e percentile)`;
    });
}

/**
 * Identify weaknesses based on metric assessments
 */
function identifyWeaknesses(metrics: MetricComparison[]): string[] {
  return metrics
    .filter(m => m.assessment === 'bottom_quartile' || m.assessment === 'below_average')
    .map(m => {
      const info = METRIC_DISPLAY_NAMES[m.name] || { displayName: m.name };
      return `${info.displayName}: ${m.dealValue}${m.unit} vs médiane ${m.median}${m.unit}`;
    });
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(
  metrics: MetricComparison[],
  sector: string
): string[] {
  const recommendations: string[] = [];

  // Check specific metrics
  const growthMetric = metrics.find(m => m.name === 'growthRate');
  const nrrMetric = metrics.find(m => m.name === 'nrr');
  const burnMetric = metrics.find(m => m.name === 'burnMultiple');
  const ltvCacMetric = metrics.find(m => m.name === 'ltvCacRatio');

  if (growthMetric?.assessment === 'bottom_quartile' || growthMetric?.assessment === 'below_average') {
    recommendations.push(
      `Creuser les causes du growth rate inférieur à la médiane. ` +
      `Demander le détail par cohorte et par canal d'acquisition.`
    );
  }

  if (nrrMetric?.assessment === 'bottom_quartile' || nrrMetric?.assessment === 'below_average') {
    recommendations.push(
      `Le NRR faible (${nrrMetric.dealValue}%) indique des problèmes de rétention ou d'expansion. ` +
      `Analyser le churn par segment et les opportunités d'upsell.`
    );
  }

  if (burnMetric && burnMetric.dealValue && burnMetric.dealValue > 2) {
    recommendations.push(
      `Burn multiple élevé (${burnMetric.dealValue}x). ` +
      `Vérifier l'efficacité des dépenses marketing et la trajectoire vers la profitabilité.`
    );
  }

  if (ltvCacMetric && ltvCacMetric.dealValue && ltvCacMetric.dealValue < 3) {
    recommendations.push(
      `LTV/CAC ratio de ${ltvCacMetric.dealValue}x sous le seuil de 3x recommandé. ` +
      `Unit economics à approfondir avant d'investir.`
    );
  }

  // Sector-specific recommendations
  if (sector.includes('saas') || sector.includes('software')) {
    const arrPerEmp = metrics.find(m => m.name === 'arrPerEmployee');
    if (arrPerEmp?.dealValue && arrPerEmp.dealValue < 100000) {
      recommendations.push(
        `ARR/employé de ${(arrPerEmp.dealValue / 1000).toFixed(0)}K€ est bas pour le SaaS. ` +
        `Objectif: 150K€+ à ce stade.`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      `Métriques globalement solides. Approfondir les détails opérationnels ` +
      `(cohorts, unit economics par segment, pipeline) pour valider la qualité.`
    );
  }

  return recommendations;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Compare deal metrics to sector benchmarks
 *
 * @param dealData - Deal metrics to compare
 * @param sector - Sector for benchmark lookup
 * @returns Detailed benchmark comparison
 */
export async function compareToBenchmarks(
  dealData: DealData,
  sector: string
): Promise<BenchmarkComparison> {
  const normalizedSector = normalizeSector(sector);

  // Fetch sector benchmark from database
  const sectorBenchmark = await prisma.sectorBenchmark.findFirst({
    where: {
      sector: {
        contains: normalizedSector,
        mode: 'insensitive',
      },
    },
  });

  // Use default benchmarks if sector not found
  const benchmarkData: SectorBenchmarkData = sectorBenchmark?.data as SectorBenchmarkData || getDefaultBenchmarks();

  const allMetrics = {
    ...benchmarkData.primaryMetrics,
    ...benchmarkData.secondaryMetrics,
  };

  // Map deal data to benchmark metrics
  const metricMapping: Record<string, keyof DealData> = {
    arr: 'arr',
    growthRate: 'growthRate',
    nrr: 'nrr',
    grossMargin: 'grossMargin',
    burnMultiple: 'burnMultiple',
    ltvCacRatio: 'ltvCacRatio',
    paybackMonths: 'paybackMonths',
    churnRate: 'churnRate',
    arrPerEmployee: 'arrPerEmployee',
    valuationMultiple: 'valuationMultiple',
  };

  const comparisons: MetricComparison[] = [];

  for (const [metricKey, dealKey] of Object.entries(metricMapping)) {
    const benchmark = allMetrics[metricKey];
    if (!benchmark) continue;

    const dealValue = dealData[dealKey] as number | undefined;
    const metricInfo = METRIC_DISPLAY_NAMES[metricKey] || {
      displayName: metricKey,
      unit: '',
      higherIsBetter: true,
    };

    let percentile: number | null = null;
    let assessment: MetricAssessment | 'insufficient_data' = 'insufficient_data';

    if (dealValue !== undefined && dealValue !== null) {
      percentile = calculatePercentile(
        dealValue,
        benchmark.p25,
        benchmark.median,
        benchmark.p75,
        metricInfo.higherIsBetter
      );
      assessment = assessMetric(percentile, metricInfo.higherIsBetter);
    }

    const interpretation = interpretMetric(
      metricKey,
      assessment,
      dealValue ?? null,
      benchmark.median,
      benchmark.unit || metricInfo.unit
    );

    comparisons.push({
      name: metricKey,
      displayName: metricInfo.displayName,
      dealValue: dealValue ?? null,
      p25: benchmark.p25,
      median: benchmark.median,
      p75: benchmark.p75,
      percentile: percentile !== null ? Math.round(percentile) : null,
      assessment,
      unit: benchmark.unit || metricInfo.unit,
      interpretation,
    });
  }

  return {
    sector: normalizedSector,
    sectorDisplayName: sectorBenchmark?.sector || `${sector} (benchmarks génériques)`,
    stage: dealData.stage || null,
    benchmarkSource: sectorBenchmark?.source || 'Benchmarks internes Angel Desk',
    benchmarkVersion: sectorBenchmark?.version || 1,
    metrics: comparisons,
    overallPosition: generateOverallPosition(comparisons),
    strengths: identifyStrengths(comparisons),
    weaknesses: identifyWeaknesses(comparisons),
    recommendations: generateRecommendations(comparisons, normalizedSector),
  };
}

/**
 * Get default benchmarks for sectors without specific data
 */
function getDefaultBenchmarks(): SectorBenchmarkData {
  return {
    primaryMetrics: {
      growthRate: { p25: 50, median: 100, p75: 150, unit: '%' },
      nrr: { p25: 100, median: 110, p75: 130, unit: '%' },
      grossMargin: { p25: 60, median: 70, p75: 80, unit: '%' },
    },
    secondaryMetrics: {
      burnMultiple: { p25: 1, median: 1.5, p75: 2.5, unit: 'x' },
      ltvCacRatio: { p25: 2, median: 3, p75: 5, unit: 'x' },
      paybackMonths: { p25: 12, median: 18, p75: 24, unit: 'mois' },
      churnRate: { p25: 2, median: 5, p75: 8, unit: '%' },
      arrPerEmployee: { p25: 80000, median: 120000, p75: 180000, unit: '€' },
    },
  };
}

// ============================================================================
// QUICK LOOKUP FUNCTIONS
// ============================================================================

/**
 * Get available sectors with benchmarks
 */
export async function getAvailableSectors(): Promise<string[]> {
  const benchmarks = await prisma.sectorBenchmark.findMany({
    select: { sector: true },
    orderBy: { sector: 'asc' },
    take: 100, // Safety limit - benchmark tables should be small
  });

  return benchmarks.map(b => b.sector);
}

/**
 * Get benchmark data for a specific metric across all sectors
 */
export async function getMetricAcrossSectors(
  metricName: string
): Promise<Array<{ sector: string; p25: number; median: number; p75: number }>> {
  const benchmarks = await prisma.sectorBenchmark.findMany({
    take: 100, // Safety limit - benchmark tables should be small
  });

  return benchmarks
    .map(b => {
      const data = b.data as SectorBenchmarkData;
      const metric = data.primaryMetrics?.[metricName] || data.secondaryMetrics?.[metricName];

      if (!metric) return null;

      return {
        sector: b.sector,
        p25: metric.p25,
        median: metric.median,
        p75: metric.p75,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
}

// ============================================================================
// TOOL DEFINITION (for chat agent)
// ============================================================================

export const benchmarkToolDefinition = {
  name: 'benchmark_comparison',
  description: `Compare les métriques d'un deal aux benchmarks du secteur (P25/Médiane/P75).
Utile pour évaluer si une startup performe bien vs le marché, identifier les forces et faiblesses.`,
  parameters: {
    type: 'object' as const,
    properties: {
      sector: {
        type: 'string',
        description: 'Secteur du deal (ex: SaaS, FinTech, Marketplace, AI)',
      },
      arr: {
        type: 'number',
        description: 'ARR actuel en euros',
      },
      growthRate: {
        type: 'number',
        description: 'Taux de croissance YoY en %',
      },
      nrr: {
        type: 'number',
        description: 'Net Revenue Retention en %',
      },
      grossMargin: {
        type: 'number',
        description: 'Marge brute en %',
      },
      burnMultiple: {
        type: 'number',
        description: 'Burn multiple (net burn / net new ARR)',
      },
      ltvCacRatio: {
        type: 'number',
        description: 'Ratio LTV/CAC',
      },
      paybackMonths: {
        type: 'number',
        description: 'CAC payback en mois',
      },
      churnRate: {
        type: 'number',
        description: 'Taux de churn mensuel en %',
      },
      arrPerEmployee: {
        type: 'number',
        description: 'ARR par employé en euros',
      },
      valuationMultiple: {
        type: 'number',
        description: 'Multiple de valorisation (x ARR)',
      },
      stage: {
        type: 'string',
        enum: ['seed', 'series_a', 'series_b', 'later'],
        description: 'Stage de la startup',
      },
    },
    required: ['sector'],
  },
};
