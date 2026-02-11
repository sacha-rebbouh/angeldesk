"use client";

import { memo, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPercentileShort } from "@/lib/format-utils";
import { ScoreBadge } from "@/components/shared/score-badge";
import { ExpandableSection } from "@/components/shared/expandable-section";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  ShieldAlert,
  Scale,
  HelpCircle,
  Target,
  BarChart3,
  Briefcase,
  Compass,
  DollarSign,
  Calculator,
  Database,
  Zap,
  Shield,
  Building2,
  Users,
  ArrowRight,
  ChevronRight,
  Percent,
  Clock,
  Award,
  AlertCircle,
  Minus,
} from "lucide-react";
import type { SectorExpertData, SectorExpertResult, ExtendedSectorData } from "@/agents/tier2/types";
import {
  SECTOR_CONFIG,
  MATURITY_CONFIG,
  ASSESSMENT_CONFIG,
  SEVERITY_CONFIG,
  type SectorExpertType,
  type SubscriptionPlan,
} from "@/lib/analysis-constants";
import { ProTeaserSection } from "@/components/shared/pro-teaser";

// =============================================================================
// HOISTED CONFIGS - Prevent recreation on every render
// =============================================================================

const POTENTIAL_COLORS: Record<string, string> = {
  high: "border-green-200 bg-green-50",
  medium: "border-blue-200 bg-blue-50",
  low: "border-gray-200 bg-gray-50",
};

const COMPLEXITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  very_high: "bg-red-100 text-red-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  must_ask: "border-red-200 bg-red-50",
  should_ask: "border-yellow-200 bg-yellow-50",
  nice_to_have: "border-gray-200 bg-gray-50",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  technical: <Briefcase className="h-3 w-3" />,
  business: <Target className="h-3 w-3" />,
  regulatory: <Scale className="h-3 w-3" />,
  competitive: <BarChart3 className="h-3 w-3" />,
};

const TIMING_COLORS: Record<string, string> = {
  early: "bg-purple-100 text-purple-800",
  optimal: "bg-green-100 text-green-800",
  late: "bg-orange-100 text-orange-800",
};

const VERDICT_CONFIG = {
  STRONG_FIT: { color: "bg-green-500", textColor: "text-green-700", label: "Strong Fit", icon: Award },
  GOOD_FIT: { color: "bg-blue-500", textColor: "text-blue-700", label: "Good Fit", icon: CheckCircle },
  MODERATE_FIT: { color: "bg-yellow-500", textColor: "text-yellow-700", label: "Moderate Fit", icon: Minus },
  POOR_FIT: { color: "bg-orange-500", textColor: "text-orange-700", label: "Poor Fit", icon: AlertTriangle },
  NOT_RECOMMENDED: { color: "bg-red-500", textColor: "text-red-700", label: "Not Recommended", icon: XCircle },
};

const VALUATION_VERDICT_CONFIG = {
  attractive: { color: "bg-green-100 text-green-800 border-green-200", label: "Attractive" },
  fair: { color: "bg-blue-100 text-blue-800 border-blue-200", label: "Fair" },
  stretched: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Stretched" },
  excessive: { color: "bg-red-100 text-red-800 border-red-200", label: "Excessive" },
};

// =============================================================================
// TYPES
// =============================================================================

interface Tier2ResultsProps {
  results: Record<string, {
    agentName: string;
    success: boolean;
    executionTimeMs: number;
    cost: number;
    error?: string;
    data?: unknown;
    _extended?: ExtendedSectorData;
  }>;
  subscriptionPlan?: SubscriptionPlan;
}

// =============================================================================
// SUB-COMPONENTS - Memoized for performance
// =============================================================================

const MaturityBadge = memo(function MaturityBadge({ maturity }: { maturity: SectorExpertData["sectorMaturity"] }) {
  const c = MATURITY_CONFIG[maturity as keyof typeof MATURITY_CONFIG] ?? { label: maturity, color: "bg-gray-100 text-gray-800" };
  return <Badge variant="outline" className={cn("text-xs", c.color)}>{c.label}</Badge>;
});

const ASSESSMENT_ICONS: Record<string, React.ReactNode> = {
  exceptional: <TrendingUp className="h-3 w-3" />,
  above_average: <TrendingUp className="h-3 w-3" />,
  average: <BarChart3 className="h-3 w-3" />,
  below_average: <AlertTriangle className="h-3 w-3" />,
  concerning: <XCircle className="h-3 w-3" />,
};

const AssessmentBadge = memo(function AssessmentBadge({ assessment }: { assessment: SectorExpertData["keyMetrics"][0]["assessment"] }) {
  const c = ASSESSMENT_CONFIG[assessment as keyof typeof ASSESSMENT_CONFIG] ?? { label: assessment, color: "text-gray-500" };
  const icon = ASSESSMENT_ICONS[assessment] ?? null;
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", c.color)}>
      {icon}
      {c.label}
    </span>
  );
});

const SeverityBadge = memo(function SeverityBadge({ severity }: { severity: "critical" | "major" | "minor" }) {
  const c = SEVERITY_CONFIG[severity] ?? { label: severity, color: "bg-gray-100 text-gray-800" };
  return <Badge variant="outline" className={cn("text-xs", c.color)}>{c.label}</Badge>;
});

// =============================================================================
// NEW: Verdict Hero Section
// =============================================================================

const VerdictHero = memo(function VerdictHero({
  verdict,
  sectorScore,
}: {
  verdict?: ExtendedSectorData["verdict"];
  sectorScore: number;
}) {
  if (!verdict) return null;

  const config = VERDICT_CONFIG[verdict.recommendation] ?? VERDICT_CONFIG.MODERATE_FIT;
  const Icon = config.icon;

  return (
    <div className="p-6 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
      <div className="flex items-start gap-6">
        {/* Verdict Badge */}
        <div className={cn("p-4 rounded-xl", config.color, "bg-opacity-20")}>
          <Icon className={cn("h-8 w-8", config.textColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <Badge className={cn("text-sm px-3 py-1", config.color, "text-white")}>
              {config.label}
            </Badge>
            <Badge variant="outline" className="text-sm">
              Confidence: {verdict.confidence}
            </Badge>
          </div>

          <p className="text-lg font-medium text-slate-800">{verdict.keyInsight}</p>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Top Strength</p>
                <p className="text-sm text-slate-700">{verdict.topStrength}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Top Concern</p>
                <p className="text-sm text-slate-700">{verdict.topConcern}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Score */}
        <div className="text-center">
          <div className="text-4xl font-bold text-slate-800">{sectorScore}</div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Sector Score</div>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// NEW: Score Breakdown Visual
// =============================================================================

const ScoreBreakdownSection = memo(function ScoreBreakdownSection({
  breakdown,
  totalScore,
}: {
  breakdown: ExtendedSectorData["scoreBreakdown"];
  totalScore: number;
}) {
  if (!breakdown) return null;

  // Determine which scoring model is used (SaaS vs Fintech)
  const isSaaS = breakdown.unitEconomics !== undefined;
  const isFintech = breakdown.metricsScore !== undefined;

  const dimensions = isSaaS
    ? [
        { name: "Unit Economics", score: breakdown.unitEconomics ?? 0, max: 25, icon: Calculator, color: "bg-blue-500" },
        { name: "Growth", score: breakdown.growth ?? 0, max: 25, icon: TrendingUp, color: "bg-green-500" },
        { name: "Retention", score: breakdown.retention ?? 0, max: 25, icon: Users, color: "bg-purple-500" },
        { name: "GTM Efficiency", score: breakdown.gtmEfficiency ?? 0, max: 25, icon: Zap, color: "bg-orange-500" },
      ]
    : isFintech
    ? [
        { name: "Metrics", score: breakdown.metricsScore ?? 0, max: 25, icon: BarChart3, color: "bg-blue-500" },
        { name: "Regulatory", score: breakdown.regulatoryScore ?? 0, max: 25, icon: Shield, color: "bg-green-500" },
        { name: "Business Model", score: breakdown.businessModelScore ?? 0, max: 25, icon: Building2, color: "bg-purple-500" },
        { name: "Market Position", score: breakdown.marketPositionScore ?? 0, max: 25, icon: Target, color: "bg-orange-500" },
      ]
    : [];

  if (dimensions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {dimensions.map((dim) => {
          const Icon = dim.icon;
          const percentage = (dim.score / dim.max) * 100;

          return (
            <div key={dim.name} className="p-4 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">{dim.name}</span>
                </div>
                <span className="text-lg font-bold text-slate-800">{dim.score}/{dim.max}</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", dim.color)}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {breakdown.justification && (
        <p className="text-sm text-slate-600 italic">{breakdown.justification}</p>
      )}
    </div>
  );
});

// =============================================================================
// NEW: Unit Economics Deep Dive
// =============================================================================

const UnitEconomicsSection = memo(function UnitEconomicsSection({
  unitEconomics,
}: {
  unitEconomics: ExtendedSectorData["unitEconomics"];
}) {
  if (!unitEconomics) return null;

  const metrics = [
    unitEconomics.ltvCacRatio && {
      name: "LTV/CAC Ratio",
      value: unitEconomics.ltvCacRatio.value,
      assessment: unitEconomics.ltvCacRatio.assessment,
      detail: unitEconomics.ltvCacRatio.vsMedian,
      icon: Calculator,
      good: "> 3x",
    },
    unitEconomics.cacPaybackMonths && {
      name: "CAC Payback",
      value: unitEconomics.cacPaybackMonths.value ? `${unitEconomics.cacPaybackMonths.value} mo` : null,
      assessment: unitEconomics.cacPaybackMonths.assessment,
      detail: unitEconomics.cacPaybackMonths.runway,
      icon: Clock,
      good: "< 12 mo",
    },
    unitEconomics.burnMultiple && {
      name: "Burn Multiple",
      value: unitEconomics.burnMultiple.value ? `${unitEconomics.burnMultiple.value}x` : null,
      assessment: unitEconomics.burnMultiple.assessment,
      icon: TrendingDown,
      good: "< 2x",
    },
    unitEconomics.magicNumber && {
      name: "Magic Number",
      value: unitEconomics.magicNumber.value,
      assessment: unitEconomics.magicNumber.assessment,
      icon: Zap,
      good: "> 0.75",
    },
  ].filter(Boolean) as Array<{
    name: string;
    value: number | string | null;
    assessment: string;
    detail?: string;
    icon: typeof Calculator;
    good: string;
  }>;

  if (metrics.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const isGood = metric.assessment?.toLowerCase().includes("good") ||
                         metric.assessment?.toLowerCase().includes("healthy") ||
                         metric.assessment?.toLowerCase().includes("excellent") ||
                         metric.assessment?.toLowerCase().includes("strong");

          return (
            <div
              key={metric.name}
              className={cn(
                "p-4 rounded-lg border",
                isGood ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("h-4 w-4", isGood ? "text-green-600" : "text-slate-600")} />
                <span className="text-sm font-medium text-slate-700">{metric.name}</span>
              </div>
              <div className="text-2xl font-bold text-slate-800 mb-1">
                {metric.value ?? "N/A"}
              </div>
              <div className="text-xs text-slate-500">
                Benchmark: {metric.good}
              </div>
              {metric.detail && (
                <p className="text-xs text-slate-600 mt-2">{metric.detail}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* LTV & CAC Details */}
      {(unitEconomics.ltv || unitEconomics.cac) && (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
          <h4 className="text-sm font-medium text-slate-700 mb-3">Calculations</h4>
          <div className="space-y-2 text-xs text-slate-600 font-mono">
            {unitEconomics.ltv?.calculation && (
              <div>
                <span className="text-slate-500">LTV:</span> {unitEconomics.ltv.calculation}
              </div>
            )}
            {unitEconomics.cac?.calculation && (
              <div>
                <span className="text-slate-500">CAC:</span> {unitEconomics.cac.calculation}
              </div>
            )}
          </div>
        </div>
      )}

      {unitEconomics.overallAssessment && (
        <p className="text-sm text-slate-600">{unitEconomics.overallAssessment}</p>
      )}
    </div>
  );
});

// =============================================================================
// NEW: Valuation Analysis Section
// =============================================================================

const ValuationAnalysisSection = memo(function ValuationAnalysisSection({
  valuation,
}: {
  valuation: ExtendedSectorData["valuationAnalysis"];
}) {
  if (!valuation) return null;

  const verdictConfig = VALUATION_VERDICT_CONFIG[valuation.verdict] ?? VALUATION_VERDICT_CONFIG.fair;

  // Defensive: provide defaults for justifiedRange if missing
  const justifiedRange = valuation.justifiedRange ?? { low: 0, fair: 0, high: 1 };

  return (
    <div className="space-y-4">
      {/* Main Verdict */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-100">
        <div className="flex items-center gap-4">
          <DollarSign className="h-8 w-8 text-slate-600" />
          <div>
            <div className="text-sm text-slate-500">ARR Multiple Asked</div>
            <div className="text-3xl font-bold text-slate-800">{valuation.askMultiple}x</div>
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-slate-500">vs Sector Median</div>
          <div className="text-2xl font-semibold text-slate-700">{valuation.medianSectorMultiple}x</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-slate-500">Position marché</div>
          <div className="text-2xl font-semibold text-slate-700">{formatPercentileShort(valuation.percentilePosition)}</div>
        </div>
        <Badge className={cn("text-sm px-3 py-1", verdictConfig.color)}>
          {verdictConfig.label}
        </Badge>
      </div>

      {/* Fair Value Range */}
      <div className="p-4 rounded-lg bg-white border border-slate-200">
        <h4 className="text-sm font-medium text-slate-700 mb-3">Fair Value Range (ARR Multiples)</h4>
        <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden">
          {/* Scale markers */}
          <div className="absolute inset-0 flex items-center justify-between px-4 text-xs text-slate-500">
            <span>Low</span>
            <span>Fair</span>
            <span>High</span>
          </div>
          {/* Value markers */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-green-500"
            style={{ left: `${(justifiedRange.low / (justifiedRange.high * 1.2 || 1)) * 100}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-1 bg-blue-500"
            style={{ left: `${(justifiedRange.fair / (justifiedRange.high * 1.2 || 1)) * 100}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-1 bg-purple-500"
            style={{ left: `${(justifiedRange.high / (justifiedRange.high * 1.2 || 1)) * 100}%` }}
          />
          {/* Asked marker */}
          <div
            className="absolute top-0 bottom-0 w-2 bg-orange-500 rounded"
            style={{ left: `${Math.min((valuation.askMultiple / (justifiedRange.high * 1.2 || 1)) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-600">
          <span>{justifiedRange.low}x</span>
          <span>{justifiedRange.fair}x</span>
          <span>{justifiedRange.high}x</span>
        </div>
      </div>

      {/* Negotiation Leverage */}
      {valuation.negotiationLeverage && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <Target className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-amber-800">Negotiation Leverage</h4>
              <p className="text-sm text-amber-700 mt-1">{valuation.negotiationLeverage}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// NEW: DB Comparison Section
// =============================================================================

const DbComparisonSection = memo(function DbComparisonSection({
  comparison,
}: {
  comparison: ExtendedSectorData["dbComparison"];
}) {
  if (!comparison) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-100">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-slate-600" />
          <div>
            <div className="text-sm text-slate-500">Similar Deals Analyzed</div>
            <div className="text-2xl font-bold text-slate-800">{comparison.similarDealsFound}</div>
          </div>
        </div>
        <div className="text-right max-w-md">
          <div className="text-sm text-slate-500">Position vs DB</div>
          <div className="text-sm font-medium text-slate-700">{comparison.thisDealsPosition}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Best Comparable */}
        {comparison.bestComparable && (
          <div className="p-4 rounded-lg bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold text-green-800">Best Comparable</span>
            </div>
            <div className="text-lg font-bold text-green-900">{comparison.bestComparable.name}</div>
            <p className="text-xs text-green-700 mt-1">{comparison.bestComparable.similarity}</p>
            <div className="flex items-center gap-1 mt-2 text-sm text-green-800">
              <ArrowRight className="h-3 w-3" />
              {comparison.bestComparable.outcome}
            </div>
          </div>
        )}

        {/* Concerning Comparable */}
        {comparison.concerningComparable && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-semibold text-red-800">Warning Comparable</span>
            </div>
            <div className="text-lg font-bold text-red-900">{comparison.concerningComparable.name}</div>
            <p className="text-xs text-red-700 mt-1">{comparison.concerningComparable.similarity}</p>
            <div className="flex items-center gap-1 mt-2 text-sm text-red-800">
              <AlertCircle className="h-3 w-3" />
              {comparison.concerningComparable.whatHappened}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// =============================================================================
// NEW: GTM Assessment Section
// =============================================================================

const GtmAssessmentSection = memo(function GtmAssessmentSection({
  gtm,
}: {
  gtm: ExtendedSectorData["gtmAssessment"];
}) {
  if (!gtm) return null;

  const modelColors = {
    sales_led: "bg-blue-100 text-blue-800",
    product_led: "bg-purple-100 text-purple-800",
    hybrid: "bg-green-100 text-green-800",
    unclear: "bg-gray-100 text-gray-800",
  };

  const efficiencyColors = {
    efficient: "text-green-600",
    acceptable: "text-blue-600",
    inefficient: "text-red-600",
    unknown: "text-gray-600",
  };

  return (
    <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge className={cn("text-xs capitalize", modelColors[gtm.model])}>
            {gtm.model.replace("_", " ")}
          </Badge>
          <span className={cn("text-sm font-medium capitalize", efficiencyColors[gtm.efficiency])}>
            {gtm.efficiency} Sales Motion
          </span>
        </div>
        {gtm.salesCycleMonths && (
          <div className="text-right">
            <div className="text-xs text-slate-500">Sales Cycle</div>
            <div className="text-lg font-bold text-slate-800">{gtm.salesCycleMonths} mo</div>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-600">{gtm.keyInsight}</p>
    </div>
  );
});

// =============================================================================
// NEW: Cohort Health Section
// =============================================================================

const CohortHealthSection = memo(function CohortHealthSection({
  cohort,
}: {
  cohort: ExtendedSectorData["cohortHealth"];
}) {
  if (!cohort || !cohort.dataAvailable) return null;

  const trendIcons = {
    improving: TrendingUp,
    accelerating: TrendingUp,
    stable: Minus,
    declining: TrendingDown,
    worsening: TrendingDown,
    decelerating: TrendingDown,
    unknown: HelpCircle,
  };

  const trendColors = {
    improving: "text-green-600",
    accelerating: "text-green-600",
    stable: "text-blue-600",
    declining: "text-red-600",
    worsening: "text-red-600",
    decelerating: "text-orange-600",
    unknown: "text-gray-500",
  };

  const metrics = [
    { name: "NRR Trend", trend: cohort.nrrTrend },
    { name: "Churn Trend", trend: cohort.churnTrend },
    { name: "Expansion Trend", trend: cohort.expansionTrend },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {metrics.map((m) => {
          const Icon = trendIcons[m.trend] ?? Minus;
          return (
            <div key={m.name} className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
              <Icon className={cn("h-5 w-5 mx-auto mb-1", trendColors[m.trend])} />
              <div className="text-xs text-slate-500">{m.name}</div>
              <div className={cn("text-sm font-medium capitalize", trendColors[m.trend])}>
                {m.trend.replace("_", " ")}
              </div>
            </div>
          );
        })}
      </div>
      {cohort.concern && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-700">{cohort.concern}</p>
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// NEW: Competitive Moat Section
// =============================================================================

const CompetitiveMoatSection = memo(function CompetitiveMoatSection({
  moat,
}: {
  moat: ExtendedSectorData["saasCompetitiveMoat"];
}) {
  if (!moat) return null;

  const factors = [
    {
      name: "Data Network Effects",
      value: moat.dataNetworkEffects,
      type: "boolean",
    },
    {
      name: "Switching Cost",
      value: moat.switchingCostLevel,
      type: "level",
    },
    {
      name: "Integration Depth",
      value: moat.integrationDepth,
      type: "level",
    },
    {
      name: "Category Leader Potential",
      value: moat.categoryLeaderPotential,
      type: "boolean",
    },
  ];

  const levelColors = {
    high: "bg-green-100 text-green-800",
    deep: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-red-100 text-red-800",
    shallow: "bg-red-100 text-red-800",
    unknown: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {factors.map((f) => (
          <div key={f.name} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div className="text-xs text-slate-500 mb-1">{f.name}</div>
            {f.type === "boolean" ? (
              <div className="flex items-center gap-2">
                {f.value ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Yes</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-red-700">No</span>
                  </>
                )}
              </div>
            ) : (
              <Badge className={cn("text-xs capitalize", levelColors[f.value as keyof typeof levelColors])}>
                {String(f.value).replace("_", " ")}
              </Badge>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-600">{moat.moatAssessment}</p>
    </div>
  );
});

// =============================================================================
// ORIGINAL SUB-COMPONENTS (Updated for consistency)
// =============================================================================

const KeyMetricsSection = memo(function KeyMetricsSection({ metrics }: { metrics: SectorExpertData["keyMetrics"] }) {
  return (
    <div className="space-y-3">
      {metrics.map((metric, idx) => (
        <div key={idx} className="p-3 rounded-lg bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{metric.metricName}</span>
            <AssessmentBadge assessment={metric.assessment} />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Value: <span className="font-mono">{metric.value ?? "N/A"}</span></span>
            <span>Benchmark : Bas 25% = {metric.sectorBenchmark.p25}, Médiane = {metric.sectorBenchmark.median}, Top 25% = {metric.sectorBenchmark.p75}</span>
          </div>
          <p className="text-xs text-muted-foreground">{metric.sectorContext}</p>
        </div>
      ))}
    </div>
  );
});

const SectorRedFlagsSection = memo(function SectorRedFlagsSection({ redFlags }: { redFlags: SectorExpertData["sectorRedFlags"] }) {
  if (redFlags.length === 0) {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm">
        <CheckCircle className="h-4 w-4" />
        No sector-specific red flags identified
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {redFlags.map((flag, idx) => (
        <div key={idx} className="p-3 rounded-lg bg-red-50 border border-red-100 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-red-800">{flag.flag}</span>
            <SeverityBadge severity={flag.severity} />
          </div>
          <p className="text-xs text-red-700">{flag.sectorReason}</p>
        </div>
      ))}
    </div>
  );
});

const OpportunitiesSection = memo(function OpportunitiesSection({ opportunities }: { opportunities: SectorExpertData["sectorOpportunities"] }) {
  return (
    <div className="space-y-3">
      {opportunities.map((opp, idx) => (
        <div key={idx} className={cn("p-3 rounded-lg border", POTENTIAL_COLORS[opp.potential])}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm">{opp.opportunity}</span>
            <Badge variant="outline" className="text-xs capitalize">{opp.potential} potential</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{opp.reasoning}</p>
        </div>
      ))}
    </div>
  );
});

const RegulatorySection = memo(function RegulatorySection({ regulatory }: { regulatory: SectorExpertData["regulatoryEnvironment"] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Complexity:</span>
        <Badge variant="outline" className={cn("text-xs capitalize", COMPLEXITY_COLORS[regulatory.complexity])}>
          {regulatory.complexity.replace("_", " ")}
        </Badge>
      </div>

      {regulatory.keyRegulations.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Key Regulations:</p>
          <div className="flex flex-wrap gap-1">
            {regulatory.keyRegulations.map((reg, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">{reg}</Badge>
            ))}
          </div>
        </div>
      )}

      {regulatory.complianceRisks.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2 text-orange-700">Compliance Risks:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {regulatory.complianceRisks.map((risk, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {regulatory.upcomingChanges.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Upcoming Changes:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {regulatory.upcomingChanges.map((change, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <Compass className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                {change}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

const SectorDynamicsSection = memo(function SectorDynamicsSection({ dynamics }: { dynamics: SectorExpertData["sectorDynamics"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Competition</p>
          <Badge variant="outline" className="text-xs capitalize">{dynamics.competitionIntensity}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Consolidation</p>
          <Badge variant="outline" className="text-xs capitalize">{dynamics.consolidationTrend}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Barrier to Entry</p>
          <Badge variant="outline" className="text-xs capitalize">{dynamics.barrierToEntry}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Typical Exit Multiple</p>
          <span className="text-sm font-bold">{dynamics.typicalExitMultiple}x</span>
        </div>
      </div>

      {dynamics.recentExits.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Recent Exits:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {dynamics.recentExits.map((exit, idx) => (
              <li key={idx}>{exit}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

const SectorQuestionsSection = memo(function SectorQuestionsSection({ questions }: { questions: SectorExpertData["sectorQuestions"] }) {
  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div key={idx} className={cn("p-3 rounded-lg border", PRIORITY_COLORS[q.priority])}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {CATEGORY_ICONS[q.category]}
              <Badge variant="outline" className="text-xs capitalize">{q.category}</Badge>
            </div>
            <Badge variant="outline" className="text-xs capitalize">{q.priority.replace("_", " ")}</Badge>
          </div>
          <p className="font-medium text-sm mb-2">{q.question}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2 bg-green-50 rounded">
              <p className="text-green-700 font-medium mb-1">Expected Answer:</p>
              <p className="text-green-600">{q.expectedAnswer}</p>
            </div>
            <div className="p-2 bg-red-50 rounded">
              <p className="text-red-700 font-medium mb-1">Red Flag Answer:</p>
              <p className="text-red-600">{q.redFlagAnswer}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

const SectorFitSection = memo(function SectorFitSection({ fit }: { fit: SectorExpertData["sectorFit"] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Sector Fit Score</span>
        <ScoreBadge score={fit.score} size="lg" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Timing:</span>
        <Badge variant="outline" className={cn("text-xs capitalize", TIMING_COLORS[fit.sectorTiming])}>
          {fit.sectorTiming}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-green-700 mb-2">Strengths:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {fit.strengths.map((s, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-red-700 mb-2">Weaknesses:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {fit.weaknesses.map((w, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function Tier2Results({ results, subscriptionPlan = "FREE" }: Tier2ResultsProps) {
  const isFree = subscriptionPlan === "FREE";

  // Find the sector expert result (there should only be one)
  const sectorExpertEntry = useMemo(() => {
    return Object.entries(results).find(([name]) =>
      name.endsWith("-expert") && name !== "document-extractor"
    );
  }, [results]);

  // For FREE users, show a teaser instead of the full analysis
  if (isFree) {
    const [agentName] = sectorExpertEntry ?? ["unknown-expert"];
    const expertType = agentName as SectorExpertType;
    const config = SECTOR_CONFIG[expertType];
    const data = sectorExpertEntry?.[1]?.data as SectorExpertData | undefined;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">{config?.emoji ?? "🔍"}</span>
            {config?.displayName ?? "Expert Sectoriel"}
          </CardTitle>
          <CardDescription>Analyse sectorielle specialisee</CardDescription>
        </CardHeader>
        <CardContent>
          <ProTeaserSection
            title={`Analyse ${config?.displayName ?? "Expert Sectoriel"}`}
            description={data
              ? `Score secteur: ${data.sectorScore}/100 - ${data.keyMetrics.length} metriques sectorielles analysees, ${data.sectorQuestions.length} questions DD specifiques`
              : "Analyse approfondie par un expert sectoriel avec benchmarks et recommandations"}
            icon={Compass}
            previewText={data?.executiveSummary?.slice(0, 100) + "..."}
          />
        </CardContent>
      </Card>
    );
  }

  if (!sectorExpertEntry) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            Tier 2 - Expert Sectoriel
          </CardTitle>
          <CardDescription>No sector expert analysis available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No sector-specific expert was activated for this deal.
            This may be because the deal sector doesn&apos;t match any of our specialized experts.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [agentName, result] = sectorExpertEntry;
  const expertType = agentName as SectorExpertType;
  const config = SECTOR_CONFIG[expertType];

  if (!result.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">{config?.emoji ?? "🔍"}</span>
            {config?.displayName ?? agentName}
          </CardTitle>
          <CardDescription>Sector analysis failed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">{result.error ?? "Unknown error"}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = result.data as SectorExpertData;
  const extended = result._extended;

  return (
    <Card className="overflow-hidden">
      {/* Header with gradient */}
      <div className={cn("bg-gradient-to-r p-6 text-white", config?.color ?? "from-gray-500 to-gray-600")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{config?.emoji ?? "🔍"}</span>
            <div>
              <h2 className="text-xl font-bold">{config?.displayName ?? agentName}</h2>
              <p className="text-sm opacity-90">{data.sectorName} Sector Analysis</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-75">Sector Score</p>
            <p className="text-4xl font-bold">{data.sectorScore}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4">
          <MaturityBadge maturity={data.sectorMaturity} />
          <span className="text-xs opacity-75">
            Analysis completed in {(result.executionTimeMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      <CardContent className="p-6 space-y-6">
        {/* NEW: Verdict Hero (if extended data available) */}
        {extended?.verdict && (
          <VerdictHero verdict={extended.verdict} sectorScore={data.sectorScore} />
        )}

        {/* Executive Summary */}
        <div className="p-4 bg-muted/30 rounded-lg">
          <p className="text-sm leading-relaxed">{data.executiveSummary}</p>
        </div>

        {/* NEW: Score Breakdown (if extended data available) */}
        {extended?.scoreBreakdown && (
          <ExpandableSection
            title="Score Breakdown"
            icon={<BarChart3 className="h-4 w-4" />}
            defaultOpen={true}
          >
            <ScoreBreakdownSection breakdown={extended.scoreBreakdown} totalScore={data.sectorScore} />
          </ExpandableSection>
        )}

        {/* NEW: Unit Economics (if extended data available) */}
        {extended?.unitEconomics && (
          <ExpandableSection
            title="Unit Economics Deep Dive"
            icon={<Calculator className="h-4 w-4" />}
            defaultOpen={true}
          >
            <UnitEconomicsSection unitEconomics={extended.unitEconomics} />
          </ExpandableSection>
        )}

        {/* NEW: Valuation Analysis (if extended data available) */}
        {extended?.valuationAnalysis && (
          <ExpandableSection
            title="Valuation Analysis"
            icon={<DollarSign className="h-4 w-4" />}
            defaultOpen={true}
          >
            <ValuationAnalysisSection valuation={extended.valuationAnalysis} />
          </ExpandableSection>
        )}

        {/* NEW: DB Comparison (if extended data available) */}
        {extended?.dbComparison && (
          <ExpandableSection
            title="Database Comparison"
            icon={<Database className="h-4 w-4" />}
          >
            <DbComparisonSection comparison={extended.dbComparison} />
          </ExpandableSection>
        )}

        {/* NEW: GTM Assessment (if extended data available) */}
        {extended?.gtmAssessment && (
          <ExpandableSection
            title="Go-to-Market Assessment"
            icon={<Zap className="h-4 w-4" />}
          >
            <GtmAssessmentSection gtm={extended.gtmAssessment} />
          </ExpandableSection>
        )}

        {/* NEW: Cohort Health (if extended data available) */}
        {extended?.cohortHealth && extended.cohortHealth.dataAvailable && (
          <ExpandableSection
            title="Cohort Health"
            icon={<Users className="h-4 w-4" />}
          >
            <CohortHealthSection cohort={extended.cohortHealth} />
          </ExpandableSection>
        )}

        {/* NEW: Competitive Moat (if extended data available) */}
        {extended?.saasCompetitiveMoat && (
          <ExpandableSection
            title="Competitive Moat Analysis"
            icon={<Shield className="h-4 w-4" />}
          >
            <CompetitiveMoatSection moat={extended.saasCompetitiveMoat} />
          </ExpandableSection>
        )}

        {/* Expandable Sections - Original */}
        <div className="space-y-3">
          <ExpandableSection
            title={`Key Metrics (${data.keyMetrics.length})`}
            icon={<BarChart3 className="h-4 w-4" />}
          >
            <KeyMetricsSection metrics={data.keyMetrics} />
          </ExpandableSection>

          <ExpandableSection
            title={`Sector Red Flags (${data.sectorRedFlags.length})`}
            icon={<ShieldAlert className="h-4 w-4" />}
            defaultOpen={data.sectorRedFlags.length > 0}
          >
            <SectorRedFlagsSection redFlags={data.sectorRedFlags} />
          </ExpandableSection>

          <ExpandableSection
            title={`Opportunities (${data.sectorOpportunities.length})`}
            icon={<Lightbulb className="h-4 w-4" />}
          >
            <OpportunitiesSection opportunities={data.sectorOpportunities} />
          </ExpandableSection>

          <ExpandableSection
            title="Regulatory Environment"
            icon={<Scale className="h-4 w-4" />}
          >
            <RegulatorySection regulatory={data.regulatoryEnvironment} />
          </ExpandableSection>

          <ExpandableSection
            title="Sector Dynamics"
            icon={<Target className="h-4 w-4" />}
          >
            <SectorDynamicsSection dynamics={data.sectorDynamics} />
          </ExpandableSection>

          <ExpandableSection
            title={`Due Diligence Questions (${data.sectorQuestions.length})`}
            icon={<HelpCircle className="h-4 w-4" />}
          >
            <SectorQuestionsSection questions={data.sectorQuestions} />
          </ExpandableSection>

          <ExpandableSection
            title="Sector Fit Analysis"
            icon={<CheckCircle className="h-4 w-4" />}
          >
            <SectorFitSection fit={data.sectorFit} />
          </ExpandableSection>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t">
          <span>Cost: ${result.cost.toFixed(4)}</span>
          <span>Execution: {(result.executionTimeMs / 1000).toFixed(1)}s</span>
        </div>
      </CardContent>
    </Card>
  );
}
