"use client";

import { useState, useMemo, useCallback, memo } from "react";
import {
  Handshake,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRightLeft,
  ChevronDown,
  Target,
  Shield,
  TrendingUp,
  Lightbulb,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  NegotiationStrategy,
  NegotiationPoint,
  Dealbreaker,
  TradeOff,
} from "@/services/negotiation/strategist";

// =============================================================================
// Types
// =============================================================================

interface NegotiationPanelProps {
  strategy: NegotiationStrategy;
  onUpdatePointStatus?: (pointId: string, status: NegotiationPoint["status"]) => void;
  className?: string;
}

// =============================================================================
// Config Constants (extracted to module level for performance)
// =============================================================================

const LEVERAGE_CONFIG = {
  strong: { color: "bg-green-100 text-green-800 border-green-200", label: "Fort" },
  moderate: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Modere" },
  weak: { color: "bg-red-100 text-red-800 border-red-200", label: "Faible" },
} as const;

const PRIORITY_CONFIG = {
  must_have: { color: "bg-red-100 text-red-800", label: "Must Have" },
  nice_to_have: { color: "bg-orange-100 text-orange-800", label: "Nice to Have" },
  optional: { color: "bg-blue-100 text-blue-800", label: "Optionnel" },
} as const;

const STATUS_CONFIG = {
  to_negotiate: { color: "bg-gray-100 text-gray-800", label: "A negocier" },
  obtained: { color: "bg-green-100 text-green-800", label: "Obtenu" },
  refused: { color: "bg-red-100 text-red-800", label: "Refuse" },
  compromised: { color: "bg-yellow-100 text-yellow-800", label: "Compromis" },
} as const;

const CATEGORY_ICONS = {
  valuation: TrendingUp,
  terms: Shield,
  governance: Target,
  rights: Lightbulb,
  protection: Shield,
  other: Handshake,
} as const;

// =============================================================================
// Memoized Helper Components
// =============================================================================

const LeverageBadge = memo(function LeverageBadge({
  leverage
}: {
  leverage: NegotiationStrategy["overallLeverage"]
}) {
  const { color, label } = LEVERAGE_CONFIG[leverage] ?? { color: "bg-gray-100 text-gray-800", label: "Inconnu" };
  return (
    <Badge variant="outline" className={cn("text-sm font-medium", color)}>
      Leverage: {label}
    </Badge>
  );
});

const PriorityBadge = memo(function PriorityBadge({
  priority
}: {
  priority: NegotiationPoint["priority"]
}) {
  const { color, label } = PRIORITY_CONFIG[priority] ?? { color: "bg-gray-100 text-gray-800", label: "Autre" };
  return (
    <Badge variant="outline" className={cn("text-xs", color)}>
      {label}
    </Badge>
  );
});

const StatusBadge = memo(function StatusBadge({
  status
}: {
  status: NegotiationPoint["status"]
}) {
  const { color, label } = STATUS_CONFIG[status] ?? { color: "bg-gray-100 text-gray-800", label: "Inconnu" };
  return (
    <Badge variant="outline" className={cn("text-xs", color)}>
      {label}
    </Badge>
  );
});

const CategoryIcon = memo(function CategoryIcon({
  category
}: {
  category: NegotiationPoint["category"]
}) {
  const Icon = CATEGORY_ICONS[category] || Handshake;
  return <Icon className="h-4 w-4 text-muted-foreground" />;
});

// =============================================================================
// Memoized Card Components
// =============================================================================

interface NegotiationPointCardProps {
  point: NegotiationPoint;
  onUpdateStatus?: (pointId: string, status: NegotiationPoint["status"]) => void;
}

const NegotiationPointCard = memo(function NegotiationPointCard({
  point,
  onUpdateStatus,
}: NegotiationPointCardProps) {
  const [isExpanded, setIsExpanded] = useState(point.priority === "must_have");

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleStatusChange = useCallback((status: NegotiationPoint["status"]) => {
    onUpdateStatus?.(point.id, status);
  }, [onUpdateStatus, point.id]);

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      point.priority === "must_have" ? "border-red-200" :
      point.priority === "nice_to_have" ? "border-orange-200" :
      "border-gray-200"
    )}>
      <button
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={`Point de negociation: ${point.topic}`}
        className="w-full flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        <CategoryIcon category={point.category} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-sm">{point.topic}</span>
            <PriorityBadge priority={point.priority} />
            <StatusBadge status={point.status} />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {point.currentSituation}
          </p>
        </div>
        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
          isExpanded && "rotate-180"
        )} />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t space-y-3">
          {/* Current situation */}
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Situation actuelle:</p>
            <p className="text-sm">{point.currentSituation}</p>
          </div>

          {/* Market benchmark */}
          {point.marketBenchmark && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Benchmark marche:</p>
              <p className="text-sm text-blue-600">{point.marketBenchmark}</p>
            </div>
          )}

          {/* Argument */}
          <div className="p-2 rounded bg-amber-50 border border-amber-100">
            <p className="text-xs font-medium text-amber-800 mb-1">Argument:</p>
            <p className="text-sm text-amber-700">{point.argument}</p>
          </div>

          {/* Ask */}
          <div className="p-2 rounded bg-green-50 border border-green-100">
            <p className="text-xs font-medium text-green-800 mb-1">Ce qu&apos;on demande:</p>
            <p className="text-sm text-green-700 font-medium">{point.ask}</p>
          </div>

          {/* Fallback */}
          {point.fallback && (
            <div className="p-2 rounded bg-gray-50 border border-gray-100">
              <p className="text-xs font-medium text-gray-800 mb-1">Position de repli:</p>
              <p className="text-sm text-gray-700">{point.fallback}</p>
            </div>
          )}

          {/* Estimated impact */}
          {point.estimatedImpact && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Impact estime:</span> {point.estimatedImpact.description}
              {point.estimatedImpact.valueRange && ` (${point.estimatedImpact.valueRange})`}
            </div>
          )}

          {/* Status buttons */}
          {onUpdateStatus && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                size="sm"
                variant={point.status === "obtained" ? "default" : "outline"}
                className={cn("text-xs", point.status === "obtained" && "bg-green-600")}
                onClick={() => handleStatusChange("obtained")}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Obtenu
              </Button>
              <Button
                size="sm"
                variant={point.status === "refused" ? "default" : "outline"}
                className={cn("text-xs", point.status === "refused" && "bg-red-600")}
                onClick={() => handleStatusChange("refused")}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Refuse
              </Button>
              <Button
                size="sm"
                variant={point.status === "compromised" ? "default" : "outline"}
                className={cn("text-xs", point.status === "compromised" && "bg-yellow-600")}
                onClick={() => handleStatusChange("compromised")}
              >
                <ArrowRightLeft className="h-3 w-3 mr-1" />
                Compromis
              </Button>
              {point.status !== "to_negotiate" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => handleStatusChange("to_negotiate")}
                >
                  Reset
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const DealbreakerCard = memo(function DealbreakerCard({
  dealbreaker
}: {
  dealbreaker: Dealbreaker
}) {
  return (
    <div className="border border-red-200 rounded-lg p-3 bg-red-50/50">
      <div className="flex items-start gap-2">
        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm text-red-800">{dealbreaker.condition}</p>
          <p className="text-xs text-red-700 mt-1">{dealbreaker.description}</p>
          {dealbreaker.resolvable && dealbreaker.resolutionPath && (
            <p className="text-xs text-red-600 mt-2">
              <span className="font-medium">Resolution possible:</span> {dealbreaker.resolutionPath}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

const TradeOffCard = memo(function TradeOffCard({
  tradeoff
}: {
  tradeoff: TradeOff
}) {
  return (
    <div className="border rounded-lg p-3 bg-purple-50/50 border-purple-200">
      <div className="flex items-center gap-2 mb-2">
        <ArrowRightLeft className="h-4 w-4 text-purple-600" />
        <Badge variant="outline" className={cn(
          "text-xs",
          tradeoff.netBenefit === "positive" ? "bg-green-100 text-green-800" :
          tradeoff.netBenefit === "neutral" ? "bg-gray-100 text-gray-800" :
          "bg-red-100 text-red-800"
        )}>
          {tradeoff.netBenefit === "positive" ? "Benefice +" :
           tradeoff.netBenefit === "neutral" ? "Neutre" : "Risque"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium text-red-700 mb-1">Tu cedes:</p>
          <p className="text-red-600">{tradeoff.give}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-green-700 mb-1">Tu obtiens:</p>
          <p className="text-green-600">{tradeoff.get}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{tradeoff.rationale}</p>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export function NegotiationPanel({
  strategy,
  onUpdatePointStatus,
  className,
}: NegotiationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Group points by priority
  const groupedPoints = useMemo(() => {
    const mustHave = strategy.negotiationPoints.filter(p => p.priority === "must_have");
    const niceToHave = strategy.negotiationPoints.filter(p => p.priority === "nice_to_have");
    const optional = strategy.negotiationPoints.filter(p => p.priority === "optional");
    return { mustHave, niceToHave, optional };
  }, [strategy.negotiationPoints]);

  // Calculate progress
  const progress = useMemo(() => {
    const total = strategy.negotiationPoints.length;
    const obtained = strategy.negotiationPoints.filter(p => p.status === "obtained").length;
    const refused = strategy.negotiationPoints.filter(p => p.status === "refused").length;
    const compromised = strategy.negotiationPoints.filter(p => p.status === "compromised").length;
    return { total, obtained, refused, compromised };
  }, [strategy.negotiationPoints]);

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <button
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-label="Afficher le plan de negociation"
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-lg">Plan de Negociation</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <LeverageBadge leverage={strategy.overallLeverage} />
            <Badge variant="outline" className="text-xs">
              {strategy.negotiationPoints.length} points
            </Badge>
            <ChevronDown className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )} />
          </div>
        </button>
        <CardDescription className="text-left">
          Strategie de negociation basee sur l&apos;analyse
        </CardDescription>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Leverage Rationale */}
          <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
            <p className="text-sm text-indigo-800">{strategy.leverageRationale}</p>
          </div>

          {/* Progress Stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-2 rounded-lg bg-gray-50 border text-center">
              <div className="text-lg font-bold text-gray-600">{progress.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
            <div className="p-2 rounded-lg bg-green-50 border border-green-100 text-center">
              <div className="text-lg font-bold text-green-600">{progress.obtained}</div>
              <div className="text-xs text-green-500">Obtenus</div>
            </div>
            <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-100 text-center">
              <div className="text-lg font-bold text-yellow-600">{progress.compromised}</div>
              <div className="text-xs text-yellow-500">Compromis</div>
            </div>
            <div className="p-2 rounded-lg bg-red-50 border border-red-100 text-center">
              <div className="text-lg font-bold text-red-600">{progress.refused}</div>
              <div className="text-xs text-red-500">Refuses</div>
            </div>
          </div>

          {/* Improved Deal Score */}
          {strategy.improvedDealScore && (
            <div className="p-3 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
              <p className="text-xs font-medium text-green-800 mb-2">Score du deal si points obtenus:</p>
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-gray-600">{strategy.improvedDealScore.before}</div>
                <TrendingUp className="h-5 w-5 text-green-600" />
                <div className="text-2xl font-bold text-green-600">{strategy.improvedDealScore.after}</div>
                <Badge className="bg-green-600">+{strategy.improvedDealScore.improvement}</Badge>
              </div>
            </div>
          )}

          {/* Key Arguments */}
          {strategy.keyArguments.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Arguments cles
              </h4>
              <ul className="space-y-1">
                {strategy.keyArguments.map((arg, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-amber-500">•</span>
                    {arg}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dealbreakers */}
          {strategy.dealbreakers.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Dealbreakers ({strategy.dealbreakers.length})
              </h4>
              <div className="space-y-2">
                {strategy.dealbreakers.map((db) => (
                  <DealbreakerCard key={db.id} dealbreaker={db} />
                ))}
              </div>
            </div>
          )}

          {/* Negotiation Points by Priority */}
          {groupedPoints.mustHave.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 text-red-700">
                Must Have ({groupedPoints.mustHave.length})
              </h4>
              <div className="space-y-2">
                {groupedPoints.mustHave.map((point) => (
                  <NegotiationPointCard
                    key={point.id}
                    point={point}
                    onUpdateStatus={onUpdatePointStatus}
                  />
                ))}
              </div>
            </div>
          )}

          {groupedPoints.niceToHave.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 text-orange-700">
                Nice to Have ({groupedPoints.niceToHave.length})
              </h4>
              <div className="space-y-2">
                {groupedPoints.niceToHave.map((point) => (
                  <NegotiationPointCard
                    key={point.id}
                    point={point}
                    onUpdateStatus={onUpdatePointStatus}
                  />
                ))}
              </div>
            </div>
          )}

          {groupedPoints.optional.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 text-blue-700">
                Optionnel ({groupedPoints.optional.length})
              </h4>
              <div className="space-y-2">
                {groupedPoints.optional.map((point) => (
                  <NegotiationPointCard
                    key={point.id}
                    point={point}
                    onUpdateStatus={onUpdatePointStatus}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Trade-offs */}
          {strategy.tradeoffs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1 text-purple-700">
                <ArrowRightLeft className="h-4 w-4" />
                Trade-offs suggeres ({strategy.tradeoffs.length})
              </h4>
              <div className="space-y-2">
                {strategy.tradeoffs.map((to) => (
                  <TradeOffCard key={to.id} tradeoff={to} />
                ))}
              </div>
            </div>
          )}

          {/* Suggested Approach */}
          {strategy.suggestedApproach && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <p className="text-xs font-medium text-blue-800 mb-1">Approche recommandee:</p>
              <p className="text-sm text-blue-700">{strategy.suggestedApproach}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
