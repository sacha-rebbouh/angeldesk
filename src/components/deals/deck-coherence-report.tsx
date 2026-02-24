"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, XCircle, AlertCircle, ChevronDown, FileWarning } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DeckCoherenceReport as DeckCoherenceReportType, CoherenceIssue } from "@/agents/tier0/deck-coherence-checker";

// =============================================================================
// Types
// =============================================================================

interface DeckCoherenceReportProps {
  report: DeckCoherenceReportType;
  className?: string;
  defaultExpanded?: boolean;
}

// =============================================================================
// Module-level Config Constants (prevents recreation on each render)
// =============================================================================

const GRADE_CONFIG = {
  A: { color: "bg-green-100 text-green-800 border-green-200", label: "Excellent" },
  B: { color: "bg-blue-100 text-blue-800 border-blue-200", label: "Bon" },
  C: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Acceptable" },
  D: { color: "bg-orange-100 text-orange-800 border-orange-200", label: "Faible" },
  F: { color: "bg-red-100 text-red-800 border-red-200", label: "Insuffisant" },
} as const;

const SEVERITY_CONFIG = {
  critical: { color: "bg-red-100 text-red-800", label: "Critique" },
  warning: { color: "bg-orange-100 text-orange-800", label: "Attention" },
  info: { color: "bg-blue-100 text-blue-800", label: "Info" },
} as const;

const CATEGORY_LABELS: Record<CoherenceIssue["category"], string> = {
  financial: "Financier",
  team: "Équipe",
  market: "Marché",
  metrics: "Métriques",
  timeline: "Timeline",
};

const TYPE_CONFIG: Record<CoherenceIssue["type"], { color: string; label: string }> = {
  inconsistency: { color: "bg-purple-100 text-purple-800", label: "Incohérence" },
  missing: { color: "bg-gray-100 text-gray-800", label: "Manquant" },
  implausible: { color: "bg-pink-100 text-pink-800", label: "Implausible" },
  contradiction: { color: "bg-red-100 text-red-800", label: "Contradiction" },
};

const RECOMMENDATION_CONFIG = {
  PROCEED: {
    color: "bg-green-50 border-green-200 text-green-800",
    icon: CheckCircle,
    text: "Donnees coherentes - Analyse fiable",
  },
  PROCEED_WITH_CAUTION: {
    color: "bg-yellow-50 border-yellow-200 text-yellow-800",
    icon: AlertCircle,
    text: "Quelques incoherences mineures - Prudence recommandee",
  },
  REQUEST_CLARIFICATION: {
    color: "bg-orange-50 border-orange-200 text-orange-800",
    icon: AlertTriangle,
    text: "Incoherences detectees - Clarification necessaire avant analyse",
  },
  DATA_UNRELIABLE: {
    color: "bg-red-50 border-red-200 text-red-800",
    icon: XCircle,
    text: "Donnees peu fiables - Demander des documents supplementaires",
  },
} as const;

// =============================================================================
// Memoized Helper Components
// =============================================================================

const GradeBadge = memo(function GradeBadge({
  grade
}: {
  grade: DeckCoherenceReportType["reliabilityGrade"]
}) {
  const { color, label } = GRADE_CONFIG[grade] || GRADE_CONFIG.F;

  return (
    <Badge variant="outline" className={cn("text-sm font-bold", color)}>
      {grade} - {label}
    </Badge>
  );
});

const SeverityIcon = memo(function SeverityIcon({
  severity
}: {
  severity: CoherenceIssue["severity"]
}) {
  switch (severity) {
    case "critical":
      return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />;
    case "info":
      return <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-500 shrink-0" />;
  }
});

const SeverityBadge = memo(function SeverityBadge({
  severity
}: {
  severity: CoherenceIssue["severity"]
}) {
  const { color, label } = SEVERITY_CONFIG[severity] ?? { color: "bg-gray-100 text-gray-800", label: "Inconnu" };

  return (
    <Badge variant="outline" className={cn("text-xs", color)}>
      {label}
    </Badge>
  );
});

const CategoryBadge = memo(function CategoryBadge({
  category
}: {
  category: CoherenceIssue["category"]
}) {
  return (
    <Badge variant="secondary" className="text-xs">
      {CATEGORY_LABELS[category] ?? category}
    </Badge>
  );
});

const TypeBadge = memo(function TypeBadge({
  type
}: {
  type: CoherenceIssue["type"]
}) {
  const { color, label } = TYPE_CONFIG[type] ?? { color: "bg-gray-100 text-gray-800", label: "Autre" };

  return (
    <Badge variant="outline" className={cn("text-xs", color)}>
      {label}
    </Badge>
  );
});

const RecommendationBanner = memo(function RecommendationBanner({
  recommendation
}: {
  recommendation: DeckCoherenceReportType["recommendation"]
}) {
  const { color, icon: Icon, text } = RECOMMENDATION_CONFIG[recommendation] ?? RECOMMENDATION_CONFIG.PROCEED_WITH_CAUTION;

  return (
    <div className={cn("flex items-center gap-2 p-3 rounded-lg border", color)}>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
});

// =============================================================================
// Memoized IssueCard Component
// =============================================================================

interface IssueCardProps {
  issue: CoherenceIssue;
}

const IssueCard = memo(function IssueCard({ issue }: IssueCardProps) {
  const [isOpen, setIsOpen] = useState(issue.severity === "critical");

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const cardClassName = useMemo(() => cn(
    "border rounded-lg overflow-hidden",
    issue.severity === "critical" ? "border-red-200 bg-red-50/50" :
    issue.severity === "warning" ? "border-orange-200 bg-orange-50/50" :
    "border-gray-200"
  ), [issue.severity]);

  const chevronClassName = useMemo(() => cn(
    "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
    isOpen && "rotate-180"
  ), [isOpen]);

  return (
    <div className={cardClassName}>
      <button
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-label={`Issue: ${issue.title}`}
        className="w-full flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        <SeverityIcon severity={issue.severity} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-sm">{issue.title}</span>
            <SeverityBadge severity={issue.severity} />
            <CategoryBadge category={issue.category} />
            <TypeBadge type={issue.type} />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {issue.description}
          </p>
        </div>
        <ChevronDown className={chevronClassName} />
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-0 border-t">
          <div className="mt-3 space-y-3">
            {/* Full description */}
            <p className="text-sm text-muted-foreground">{issue.description}</p>

            {/* Values comparison */}
            {issue.values && issue.values.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Details:</p>
                <div className="space-y-1">
                  {issue.values.map((v, i) => (
                    <div key={i} className="flex flex-wrap gap-2 text-xs bg-muted/50 p-2 rounded">
                      <span className="font-medium">{v.metric}:</span>
                      <span className="text-red-600">Trouve: {v.found}</span>
                      {v.expected && (
                        <span className="text-green-600">Attendu: {v.expected}</span>
                      )}
                      {v.source && (
                        <span className="text-muted-foreground">({v.source})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pages reference */}
            {issue.pages && issue.pages.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Pages/Slides: {issue.pages.join(", ")}
              </p>
            )}

            {/* Recommendation */}
            <div className="p-2 rounded bg-blue-50 border border-blue-100">
              <p className="text-xs">
                <span className="font-medium text-blue-800">Recommandation:</span>{" "}
                <span className="text-blue-700">{issue.recommendation}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const DeckCoherenceReport = memo(function DeckCoherenceReport({
  report,
  className,
  defaultExpanded = false,
}: DeckCoherenceReportProps) {
  // Group issues by severity for display
  const groupedIssues = useMemo(() => {
    const critical = report.issues.filter(i => i.severity === "critical");
    const warning = report.issues.filter(i => i.severity === "warning");
    const info = report.issues.filter(i => i.severity === "info");
    return { critical, warning, info };
  }, [report.issues]);

  // Determine if we should show the component expanded by default
  const shouldExpandDefault = defaultExpanded || report.summary.criticalIssues > 0;
  const [isExpanded, setIsExpanded] = useState(shouldExpandDefault);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const headerChevronClassName = useMemo(() => cn(
    "h-4 w-4 text-muted-foreground transition-transform",
    isExpanded && "rotate-180"
  ), [isExpanded]);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <button
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-label="Afficher le rapport de cohérence"
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Cohérence du Deck</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <GradeBadge grade={report.reliabilityGrade} />
            <Badge variant="outline" className="text-xs">
              {report.coherenceScore}/100
            </Badge>
            <ChevronDown className={headerChevronClassName} />
          </div>
        </button>
        <CardDescription className="text-left">
          Verification automatique de la coherence des donnees
        </CardDescription>
      </CardHeader>

      {isExpanded && (
          <CardContent className="space-y-4">
            {/* Recommendation Banner */}
            <RecommendationBanner recommendation={report.recommendation} />

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2 rounded-lg bg-red-50 border border-red-100 text-center">
                <div className="text-lg font-bold text-red-600">{report.summary.criticalIssues}</div>
                <div className="text-xs text-red-700">Critiques</div>
              </div>
              <div className="p-2 rounded-lg bg-orange-50 border border-orange-100 text-center">
                <div className="text-lg font-bold text-orange-600">{report.summary.warningIssues}</div>
                <div className="text-xs text-orange-700">Attention</div>
              </div>
              <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 text-center">
                <div className="text-lg font-bold text-blue-600">{report.summary.infoIssues}</div>
                <div className="text-xs text-blue-700">Info</div>
              </div>
              <div className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-center">
                <div className="text-lg font-bold text-gray-600">{report.summary.dataCompletenessPercent}%</div>
                <div className="text-xs text-gray-700">Completude</div>
              </div>
            </div>

            {/* Missing Critical Data */}
            {report.missingCriticalData.length > 0 && (
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-sm font-medium text-gray-800 mb-2">Donnees critiques manquantes:</p>
                <div className="flex flex-wrap gap-1">
                  {report.missingCriticalData.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-white">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Issues List */}
            {report.issues.length > 0 ? (
              <div className="space-y-4">
                {/* Critical Issues */}
                {groupedIssues.critical.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-red-800 flex items-center gap-1">
                      <XCircle className="h-4 w-4" />
                      Problemes critiques ({groupedIssues.critical.length})
                    </h4>
                    <div className="space-y-2">
                      {groupedIssues.critical.map((issue, i) => (
                        <IssueCard key={issue.id || i} issue={issue} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Warning Issues */}
                {groupedIssues.warning.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-orange-800 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Points d'attention ({groupedIssues.warning.length})
                    </h4>
                    <div className="space-y-2">
                      {groupedIssues.warning.map((issue, i) => (
                        <IssueCard key={issue.id || i} issue={issue} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Info Issues */}
                {groupedIssues.info.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-blue-800 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      Informations ({groupedIssues.info.length})
                    </h4>
                    <div className="space-y-2">
                      {groupedIssues.info.map((issue, i) => (
                        <IssueCard key={issue.id || i} issue={issue} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-center">
                <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="text-sm text-green-800 font-medium">
                  Aucune incoherence detectee
                </p>
                <p className="text-xs text-green-700 mt-1">
                  Les donnees du deck semblent coherentes
                </p>
              </div>
            )}
          </CardContent>
      )}
    </Card>
  );
});
