"use client";

import { memo } from "react";
import { AlertTriangle, CheckCircle, FileText, MessageSquareText, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatAgentName } from "@/lib/format-utils";
import { formatAgentErrorSeverity, formatDetailedError } from "@/lib/agent-error-impact";
import { extractDecisionRisks } from "./analysis-risk-utils";

interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

interface AnalysisCompleteViewProps {
  results: Record<string, AgentResult>;
  showHeader?: boolean;
}

const HIDDEN_COMPLETE_VIEW_AGENTS = new Set(["exit-strategist", "scenario-modeler"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function valueAt(root: unknown, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return cursor;
}

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return "";
  const title = text(item.title)
    || text(item.flag)
    || text(item.risk)
    || text(item.question)
    || text(item.highlight)
    || text(item.metric)
    || text(item.topic);
  const description = text(item.description)
    || text(item.impact)
    || text(item.assessment)
    || text(item.rationale)
    || text(item.evidence);
  return [title, description].filter(Boolean).join(" — ");
}

function stringItems(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(itemText).filter(Boolean).slice(0, limit);
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isBlockedGeneratedClaim(value: string): boolean {
  const normalized = normalizeForMatch(value);
  return [
    /\broi\b/,
    /\bsi maint/,
    /\bsi reel/,
    /\bproject/,
    /\bprojection/,
    /\bprojete/,
  ].some((pattern) => pattern.test(normalized));
}

function metricPart(label: string, value: unknown, suffix = ""): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${label} ${value}${suffix}`;
  }
  if (typeof value === "string" && value.trim()) {
    return `${label} ${value.trim()}${suffix}`;
  }
  return "";
}

function getNarrative(data: unknown): { summary: string; insights: string[]; negotiation: string[] } {
  return {
    summary:
      text(valueAt(data, ["narrative", "summary"])) ||
      text(valueAt(data, ["narrative", "oneLiner"])) ||
      text(valueAt(data, ["executiveSummary", "oneLiner"])) ||
      text(valueAt(data, ["investmentThesis", "summary"])) ||
      text(valueAt(data, ["summary"])) ||
      "",
    insights: [
      ...stringItems(valueAt(data, ["narrative", "keyInsights"]), 5),
      ...stringItems(valueAt(data, ["executiveSummary", "keyPoints"]), 5),
      ...stringItems(valueAt(data, ["keyStrengths"]), 3),
      ...stringItems(valueAt(data, ["findings", "topStrengths"]), 3),
    ].filter((item) => !isBlockedGeneratedClaim(item)).slice(0, 6),
    negotiation: stringItems(valueAt(data, ["narrative", "forNegotiation"]), 4)
      .filter((item) => !isBlockedGeneratedClaim(item)),
  };
}

function getFindings(data: unknown): Array<{ label: string; value: string }> {
  const findings = valueAt(data, ["findings"]);
  if (!isRecord(findings)) return [];

  const labelMap: Record<string, string> = {
    valuation: "Valorisation",
    burn: "Trésorerie",
    runway: "Runway",
    margins: "Marges",
    revenue: "Revenus",
    traction: "Traction",
    competitors: "Concurrence",
    market: "Marché",
    team: "Équipe",
    product: "Produit",
    technology: "Technologie",
    channels: "Canaux d’acquisition",
    unitEconomics: "Unit economics",
    customerSegments: "Clients",
    recommendation: "Recommandation",
    probabilityWeightedOutcome: "Scénario pondéré",
    exitOutcome: "Sortie",
    synthesis: "Synthèse",
  };
  const hiddenKeys = new Set([
    "signalContribution",
    "signalIntensity",
    "alertSignal",
    "dbCrossReference",
    "meta",
    "raw",
    "debug",
    "score",
    "redFlags",
    "questions",
    "founderQuestions",
    "topPriorities",
    "contradictions",
    "structuralRisks",
    "probabilityWeightedOutcome",
    "exitOutcome",
    "scenarios",
    "dominantScenario",
    "dominantScenarioRationale",
  ]);

  return Object.entries(findings)
    .filter(([key]) => !hiddenKeys.has(key))
    .map(([key, value]) => {
      if (key === "unitEconomics" && isRecord(value)) {
        const parts = [
          metricPart("CAC", valueAt(value, ["cac", "value"])),
          metricPart("LTV", valueAt(value, ["ltv", "value"])),
          metricPart("LTV/CAC", value.ltvCacRatio, "x"),
          metricPart("Payback CAC", value.paybackMonths, " mois"),
          text(value.assessment),
        ].filter(Boolean);
        return parts.length > 0 ? { label: key, value: parts.join(" • ") } : null;
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return { label: key, value: String(value) };
      }
      if (Array.isArray(value)) {
        const first = stringItems(value, 1)[0];
        return first ? { label: key, value: `${value.length} élément${value.length > 1 ? "s" : ""} — ${first}` } : null;
      }
      if (isRecord(value)) {
        const detail =
          text(value.summary) ||
          text(value.assessment) ||
          text(value.verdict) ||
          text(value.rationale) ||
          text(value.description) ||
          text(value.status);
        return detail ? { label: key, value: detail } : null;
      }
      return null;
    })
    .filter((item): item is { label: string; value: string } => Boolean(item?.value))
    .map((item) => ({ ...item, label: labelMap[item.label] ?? item.label }))
    .slice(0, 8);
}

function getScore(data: unknown): string {
  const value = valueAt(data, ["score", "value"]);
  const grade = text(valueAt(data, ["score", "grade"]));
  if (typeof value === "number") return grade ? `${value}/100 · ${grade}` : `${value}/100`;
  return grade;
}

function CompleteAgentCard({ name, result }: { name: string; result: AgentResult }) {
  const narrative = getNarrative(result.data);
  const findings = getFindings(result.data);
  const score = getScore(result.data);
  const errorInfo = result.error ? formatDetailedError(name, result.error) : null;
  const redFlags = result.success
    ? extractDecisionRisks({ [name]: result })
      .map((risk) => [risk.title, risk.description].filter(Boolean).join(" — "))
      .slice(0, 6)
    : [];
  const questions = [
    ...stringItems(valueAt(result.data, ["questions"]), 5),
    ...stringItems(valueAt(result.data, ["findings", "founderQuestions"]), 5),
    ...stringItems(valueAt(result.data, ["findings", "topPriorities"]), 5),
  ].slice(0, 6);

  return (
    <article className="rounded-xl border bg-background p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {result.success ? (
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <h3 className="text-lg font-semibold tracking-normal">{formatAgentName(name)}</h3>
            <Badge variant={result.success ? "secondary" : "outline"}>
              {result.success ? "Analyse disponible" : "Analyse manquante"}
            </Badge>
            {score && <Badge variant="outline">{score}</Badge>}
          </div>
        </div>
      </div>

      {errorInfo && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-950">
              {formatAgentErrorSeverity(errorInfo.impact.severity)}
            </Badge>
            <span className="font-medium">{errorInfo.shortMessage}</span>
          </div>
          <p className="mt-2 text-amber-900">
            {errorInfo.impact.missingAnalysis}
          </p>
          <p className="mt-1 text-amber-900">
            {errorInfo.impact.recommendation}
          </p>
          {errorInfo.detailedMessage !== errorInfo.shortMessage && (
            <p className="mt-2 font-mono text-xs text-amber-900/80">
              {errorInfo.detailedMessage.slice(0, 200)}
            </p>
          )}
        </div>
      )}

      {narrative.summary && (
        <p className="mt-4 text-sm leading-7 text-foreground">{narrative.summary}</p>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {narrative.insights.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Points clés
            </div>
            <ul className="space-y-2">
              {narrative.insights.map((item, index) => (
                <li key={`${item}-${index}`} className="text-sm leading-6 text-muted-foreground">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {findings.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              Observations
            </div>
            <div className="space-y-3">
              {findings.map((item) => (
                <div key={item.label}>
                  <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-sm leading-6">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {redFlags.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-950">
              <AlertTriangle className="h-4 w-4 text-red-700" />
              Risques remontés
            </div>
            <ul className="space-y-2">
              {redFlags.map((item, index) => (
                <li key={`${item}-${index}`} className="text-sm leading-6 text-red-800">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {(questions.length > 0 || narrative.negotiation.length > 0) && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="h-4 w-4 text-muted-foreground" />
              Questions et négociation
            </div>
            <ul className="space-y-2">
              {[...questions, ...narrative.negotiation].slice(0, 8).map((item, index) => (
                <li key={`${item}-${index}`} className="text-sm leading-6 text-muted-foreground">{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

export const AnalysisCompleteView = memo(function AnalysisCompleteView({ results, showHeader = true }: AnalysisCompleteViewProps) {
  const entries = Object.entries(results).filter(([name]) => !HIDDEN_COMPLETE_VIEW_AGENTS.has(name));
  const succeededCount = entries.filter(([, result]) => result.success).length;
  const unavailableCount = entries.length - succeededCount;

  return (
    <div className="space-y-4">
      {showHeader && (
        <section className="rounded-xl border bg-background p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-normal">Analyses détaillées</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Lecture détaillée par angle, avec conclusions, risques, questions et observations utiles à la décision.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{succeededCount} analyses disponibles</Badge>
              {unavailableCount > 0 && <Badge variant="outline">{unavailableCount} analyse{unavailableCount > 1 ? "s" : ""} manquante{unavailableCount > 1 ? "s" : ""}</Badge>}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-3">
        {entries.map(([name, result]) => (
          <CompleteAgentCard key={name} name={name} result={result} />
        ))}
      </div>
    </div>
  );
});
