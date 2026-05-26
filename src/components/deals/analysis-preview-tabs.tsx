"use client";

import { memo } from "react";
import { AlertTriangle, CheckCircle, FileText, MessageSquareText, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAgentName } from "@/lib/format-utils";
import { AnalysisInvestorView } from "./analysis-investor-view";
import { AnalysisMemoFull } from "./analysis-memo-full";
import { extractDecisionRisks } from "./analysis-risk-utils";

interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

interface AnalysisThesis {
  reformulated?: string | null;
  problem?: string | null;
  solution?: string | null;
  whyNow?: string | null;
  moat?: string | null;
  pathToExit?: string | null;
  verdict?: string | null;
  confidence?: number | null;
}

interface AnalysisPreviewTabsProps {
  dealName: string;
  results: Record<string, AgentResult>;
  thesis?: AnalysisThesis | null;
  totalTimeMs?: number | null;
  totalCost?: number | null;
  currentScore?: number | null;
}

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

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  if (Array.isArray(value)) return `${value.length} élément${value.length > 1 ? "s" : ""}`;
  return "";
}

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return "";
  const title = text(item.title) || text(item.flag) || text(item.risk) || text(item.question) || text(item.highlight) || text(item.metric) || text(item.topic);
  const description = text(item.description) || text(item.impact) || text(item.assessment) || text(item.rationale) || text(item.evidence);
  return [title, description].filter(Boolean).join(" — ");
}

function stringItems(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(itemText).filter(Boolean).slice(0, limit);
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
    ].slice(0, 6),
    negotiation: stringItems(valueAt(data, ["narrative", "forNegotiation"]), 4),
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
  ]);

  return Object.entries(findings)
    .filter(([key]) => !hiddenKeys.has(key))
    .map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return { label: key, value: formatValue(value) };
      }
      if (Array.isArray(value)) {
        const first = stringItems(value, 1)[0];
        return { label: key, value: first ? `${value.length} élément${value.length > 1 ? "s" : ""} — ${first}` : formatValue(value) };
      }
      if (isRecord(value)) {
        const detail =
          text(value.summary) ||
          text(value.assessment) ||
          text(value.verdict) ||
          text(value.rationale) ||
          text(value.description) ||
          text(value.status) ||
          formatValue(value);
        return { label: key, value: detail };
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
  const redFlags = result.success
    ? extractDecisionRisks({ [name]: result }).map((risk) => [risk.title, risk.description].filter(Boolean).join(" — ")).slice(0, 6)
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
            <Badge variant={result.success ? "secondary" : "destructive"}>
              {result.success ? "Réussi" : "Échec"}
            </Badge>
            {score && <Badge variant="outline">{score}</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{result.success ? "Sortie exploitable" : "Sortie indisponible"}</span>
          </div>
        </div>
      </div>

      {result.error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
          Agent non disponible dans cette analyse.
        </p>
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

export const AnalysisPreviewTabs = memo(function AnalysisPreviewTabs({
  dealName,
  results,
  thesis,
  totalTimeMs,
  totalCost,
  currentScore,
}: AnalysisPreviewTabsProps) {
  const entries = Object.entries(results);
  const succeededCount = entries.filter(([, result]) => result.success).length;
  const failedCount = entries.length - succeededCount;

  return (
    <Tabs defaultValue="investor" className="gap-4">
      <TabsList className="flex w-full justify-start overflow-x-auto">
        <TabsTrigger value="investor">Vue investisseur</TabsTrigger>
        <TabsTrigger value="memo" className="gap-1.5">
          Mémo entier
          {results["memo-generator"]?.success && <Badge variant="secondary" className="ml-1 text-xs">1</Badge>}
        </TabsTrigger>
        <TabsTrigger value="complete" className="gap-1.5">
          Analyse complète
          <Badge variant="secondary" className="ml-1 text-xs">{entries.length}</Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="investor" className="mt-0">
        <AnalysisInvestorView
          dealName={dealName}
          results={results}
          thesis={thesis}
          totalTimeMs={totalTimeMs}
          totalCost={totalCost}
          currentScore={currentScore}
        />
      </TabsContent>

      <TabsContent value="memo" className="mt-0">
        <AnalysisMemoFull
          dealName={dealName}
          results={results}
          totalTimeMs={totalTimeMs}
          totalCost={totalCost}
        />
      </TabsContent>

      <TabsContent value="complete" className="mt-0 space-y-4">
        <section className="rounded-xl border bg-background p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-normal">Analyse complète</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Vue exhaustive lisible: chaque agent, ses conclusions, ses risques, ses questions et ses sections de sortie.
                Les données techniques ne sont plus le contenu principal de l’analyse.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{succeededCount} réussis</Badge>
              {failedCount > 0 && <Badge variant="destructive">{failedCount} échoués</Badge>}
              <Badge variant="outline">{entries.length} agents</Badge>
            </div>
          </div>
        </section>

        <div className="grid gap-3">
          {entries.map(([name, result]) => {
            return (
              <CompleteAgentCard key={name} name={name} result={result} />
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
});
