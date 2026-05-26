"use client";

import { memo, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Flag,
  ShieldAlert,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatAgentName } from "@/lib/format-utils";
import type { MemoGeneratorData } from "@/agents/types";

interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

interface AnalysisMemoFullProps {
  dealName: string;
  results: Record<string, AgentResult>;
  totalTimeMs?: number | null;
  totalCost?: number | null;
}

const recommendationLabels: Record<string, { label: string; className: string }> = {
  very_favorable: { label: "Signaux très favorables", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  favorable: { label: "Signaux favorables", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  contrasted: { label: "Signaux contrastés", className: "border-amber-200 bg-amber-50 text-amber-700" },
  vigilance: { label: "Vigilance requise", className: "border-blue-200 bg-blue-50 text-blue-700" },
  alert_dominant: { label: "Alertes dominantes", className: "border-red-200 bg-red-50 text-red-700" },
};

const residualRiskLabels: Record<string, { label: string; className: string }> = {
  low: { label: "Risque résiduel faible", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  medium: { label: "Risque résiduel moyen", className: "border-amber-200 bg-amber-50 text-amber-700" },
  high: { label: "Risque résiduel élevé", className: "border-red-200 bg-red-50 text-red-700" },
};

function isMemoGeneratorData(value: unknown): value is MemoGeneratorData {
  return value != null
    && typeof value === "object"
    && !Array.isArray(value)
    && "executiveSummary" in value
    && "companyOverview" in value
    && "investmentThesis" in value;
}

function formatRuntime(totalTimeMs?: number | null): string {
  if (!totalTimeMs) return "n/a";
  return `${(totalTimeMs / 60000).toFixed(1).replace(".", ",")} min`;
}

function formatCost(totalCost?: number | null): string {
  if (totalCost == null) return "n/a";
  return `${totalCost.toFixed(2)} $`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueAt(root: unknown, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return cursor;
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return "";
  const title = text(item.title)
    || text(item.flag)
    || text(item.risk)
    || text(item.question)
    || text(item.highlight)
    || text(item.summary)
    || text(item.description)
    || text(item.topic);
  const detail = text(item.description)
    || text(item.impact)
    || text(item.evidence)
    || text(item.rationale)
    || text(item.mitigation)
    || text(item.assessment);
  return [title, detail].filter(Boolean).join(" — ");
}

function stringItems(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(itemText).filter(Boolean).slice(0, limit);
}

function agentData(results: Record<string, AgentResult>, key: string): Record<string, unknown> | null {
  const result = results[key];
  if (!result?.success || !isRecord(result.data)) return null;
  return result.data;
}

function getAgentSummary(data: unknown): string {
  return text(valueAt(data, ["narrative", "summary"]))
    || text(valueAt(data, ["narrative", "oneLiner"]))
    || text(valueAt(data, ["investmentThesis", "summary"]))
    || text(valueAt(data, ["findings", "recommendation", "rationale"]))
    || text(valueAt(data, ["findings", "summary"]))
    || text(valueAt(data, ["summary"]))
    || "";
}

function getAgentInsights(data: unknown, limit = 8): string[] {
  return [
    ...stringItems(valueAt(data, ["narrative", "keyInsights"]), limit),
    ...stringItems(valueAt(data, ["executiveSummary", "keyPoints"]), limit),
    ...stringItems(valueAt(data, ["keyStrengths"]), limit),
    ...stringItems(valueAt(data, ["keyWeaknesses"]), limit),
    ...stringItems(valueAt(data, ["findings", "topStrengths"]), limit),
    ...stringItems(valueAt(data, ["findings", "topWeaknesses"]), limit),
  ].slice(0, limit);
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uniqueStrings(items: string[], limit = items.length): string[] {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit);
}

function isNegativeSignal(item: string): boolean {
  const normalized = normalizeForMatch(item);
  return [
    "risque",
    "fragilise",
    "contradiction",
    "doute",
    "chute",
    "baisse",
    "depend",
    "cache",
    "manque",
    "faible",
    "opaque",
    "opacite",
    "instabil",
    "non quantifi",
    "non prouve",
    "inflation",
    "cout",
    "retention",
    "bloquant",
    "alerte",
    "critique",
  ].some((keyword) => normalized.includes(keyword));
}

function collectStrengths(results: Record<string, AgentResult>, synthesis: Record<string, unknown> | null, limit = 10): string[] {
  const market = agentData(results, "market-intelligence");
  const customer = agentData(results, "customer-intel");
  const financial = agentData(results, "financial-auditor");
  const gtm = agentData(results, "gtm-analyst");

  return uniqueStrings([
    ...stringItems(valueAt(synthesis, ["keyStrengths"]), limit),
    ...stringItems(valueAt(synthesis, ["findings", "topStrengths"]), limit),
    ...stringItems(valueAt(synthesis, ["investmentThesis", "strengths"]), limit),
    ...stringItems(valueAt(market, ["findings", "topStrengths"]), limit),
    ...stringItems(valueAt(customer, ["findings", "topStrengths"]), limit),
    ...stringItems(valueAt(financial, ["findings", "topStrengths"]), limit),
    ...stringItems(valueAt(gtm, ["findings", "topStrengths"]), limit),
  ].filter((item) => !isNegativeSignal(item)), limit);
}

function collectWeaknesses(
  results: Record<string, AgentResult>,
  synthesis: Record<string, unknown> | null,
  devilsAdvocate: Record<string, unknown> | null,
  contradiction: Record<string, unknown> | null,
  redFlags: string[],
  limit = 12
): string[] {
  const contradictionItems = stringItems(valueAt(contradiction, ["findings", "contradictions"]), limit);
  const devilsConcerns = [
    ...stringItems(valueAt(devilsAdvocate, ["findings", "structuralRisks"]), limit),
    ...stringItems(valueAt(devilsAdvocate, ["findings", "concernsSummary", "absolute"]), limit),
    ...stringItems(valueAt(devilsAdvocate, ["findings", "concernsSummary", "conditional"]), limit),
    ...stringItems(valueAt(devilsAdvocate, ["findings", "concernsSummary", "serious"]), limit),
  ];

  return uniqueStrings([
    ...stringItems(valueAt(synthesis, ["keyWeaknesses"]), limit),
    ...stringItems(valueAt(synthesis, ["findings", "topWeaknesses"]), limit),
    ...stringItems(valueAt(synthesis, ["investmentThesis", "weaknesses"]), limit),
    ...devilsConcerns,
    ...contradictionItems,
    ...redFlags,
  ], limit);
}

function getFindingRows(data: unknown, limit = 8): Array<{ label: string; value: string }> {
  const findings = valueAt(data, ["findings"]);
  if (!isRecord(findings)) return [];

  return Object.entries(findings)
    .map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return { label: key, value: String(value) };
      }
      if (Array.isArray(value)) {
        const first = stringItems(value, 1)[0];
        return first ? { label: key, value: `${value.length} élément${value.length > 1 ? "s" : ""} — ${first}` } : null;
      }
      if (isRecord(value)) {
        const detail = text(value.summary)
          || text(value.assessment)
          || text(value.verdict)
          || text(value.rationale)
          || text(value.description)
          || text(value.status);
        return detail ? { label: key, value: detail } : null;
      }
      return null;
    })
    .filter((item): item is { label: string; value: string } => Boolean(item?.value))
    .slice(0, limit);
}

function collectRedFlags(results: Record<string, AgentResult>, limit = 18): string[] {
  const flags: string[] = [];
  for (const [agentName, result] of Object.entries(results)) {
    if (!result.success || !result.data) continue;
    const agentLabel = formatAgentName(agentName);
    const agentFlags = [
      ...stringItems(valueAt(result.data, ["redFlags"]), limit),
      ...stringItems(valueAt(result.data, ["findings", "redFlags"]), limit),
      ...stringItems(valueAt(result.data, ["criticalRisks"]), limit),
      ...stringItems(valueAt(result.data, ["findings", "structuralRisks"]), limit),
    ];
    for (const flag of agentFlags) flags.push(`${flag} (${agentLabel})`);
  }
  return Array.from(new Set(flags)).slice(0, limit);
}

function collectQuestions(results: Record<string, AgentResult>, limit = 18): string[] {
  const questions: string[] = [];
  for (const [agentName, result] of Object.entries(results)) {
    if (!result.success || !result.data) continue;
    const agentLabel = formatAgentName(agentName);
    const agentQuestions = [
      ...stringItems(valueAt(result.data, ["questions"]), limit),
      ...stringItems(valueAt(result.data, ["findings", "founderQuestions"]), limit),
      ...stringItems(valueAt(result.data, ["findings", "topPriorities"]), limit),
      ...stringItems(valueAt(result.data, ["signalProfile", "openQuestions"]), limit),
    ];
    for (const question of agentQuestions) questions.push(`${question} (${agentLabel})`);
  }
  return Array.from(new Set(questions)).slice(0, limit);
}

function FallbackAgentBlock({
  title,
  agentNames,
  results,
}: {
  title: string;
  agentNames: string[];
  results: Record<string, AgentResult>;
}) {
  const briefs = agentNames
    .map((name) => {
      const data = agentData(results, name);
      if (!data) return null;
      return {
        name,
        summary: getAgentSummary(data),
        insights: getAgentInsights(data, 5),
        findings: getFindingRows(data, 5),
      };
    })
    .filter((item): item is {
      name: string;
      summary: string;
      insights: string[];
      findings: Array<{ label: string; value: string }>;
    } => Boolean(item));

  if (briefs.length === 0) return null;

  return (
    <Section title={title} icon={FileText} aside={<Badge variant="outline">{briefs.length} agents</Badge>}>
      <div className="space-y-4">
        {briefs.map((brief) => (
          <article key={brief.name} className="rounded-lg border bg-muted/20 p-4">
            <h4 className="font-semibold tracking-normal">{formatAgentName(brief.name)}</h4>
            {brief.summary && <p className="mt-2 text-sm leading-7 text-foreground">{brief.summary}</p>}
            {brief.insights.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">Points clés</p>
                <div className="mt-2"><BulletList items={brief.insights} /></div>
              </div>
            )}
            {brief.findings.length > 0 && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {brief.findings.map((finding) => (
                  <div key={finding.label} className="rounded-md border bg-background p-3">
                    <p className="text-xs font-medium text-muted-foreground">{finding.label}</p>
                    <p className="mt-1 text-sm leading-6">{finding.value}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </Section>
  );
}

function ReconstructedMemo({
  dealName,
  results,
  totalTimeMs,
}: AnalysisMemoFullProps & { error?: string }) {
  const succeededCount = Object.values(results).filter((result) => result.success).length;
  const synthesis = agentData(results, "synthesis-deal-scorer");
  const devilsAdvocate = agentData(results, "devils-advocate");
  const contradiction = agentData(results, "contradiction-detector");
  const redFlags = collectRedFlags(results);
  const questions = collectQuestions(results);
  const synthesisSummary = getAgentSummary(synthesis)
    || getAgentSummary(devilsAdvocate)
    || getAgentSummary(contradiction)
    || "Le mémo final n’a pas été produit, mais les agents d’analyse ont retourné des sorties exploitables pour reconstituer la lecture investisseur.";
  const strengths = collectStrengths(results, synthesis);
  const weaknesses = collectWeaknesses(results, synthesis, devilsAdvocate, contradiction, redFlags);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="border-b bg-muted/30 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Mémo d’investissement
                </Badge>
                <Badge variant="secondary">{succeededCount} agents exploités</Badge>
                <Badge variant="outline">{formatRuntime(totalTimeMs)}</Badge>
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-normal text-foreground">
                Mémo consolidé — {dealName}
              </h2>
              <p className="mt-3 max-w-5xl text-sm leading-7 text-muted-foreground">
                Ce mémo consolide les sorties des agents d’analyse en un dossier lisible pour décider quoi creuser,
                quoi challenger et quelles preuves demander avant comité.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-background p-2 text-center lg:min-w-[220px]">
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">
                <div className="text-xl font-semibold">{succeededCount}</div>
                <div className="text-xs">agents exploités</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-slate-700">
                <div className="text-xl font-semibold">6</div>
                <div className="text-xs">axes couverts</div>
              </div>
            </div>
          </div>
        </div>
        <div className="p-5">
          <h3 className="text-lg font-semibold tracking-normal">Synthèse consolidée</h3>
          <p className="mt-3 text-sm leading-7 text-foreground">{synthesisSummary}</p>
        </div>
      </section>

      <Section title="Forces et faiblesses consolidées" icon={Target}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-emerald-50/50 p-4">
            <p className="text-sm font-semibold text-emerald-950">Ce qui soutient le deal</p>
            <div className="mt-3"><BulletList items={strengths} empty="Aucune force consolidée disponible." /></div>
          </div>
          <div className="rounded-lg border bg-amber-50/50 p-4">
            <p className="text-sm font-semibold text-amber-950">Ce qui fragilise la décision</p>
            <div className="mt-3"><BulletList items={weaknesses} empty="Aucune faiblesse consolidée disponible." /></div>
          </div>
        </div>
      </Section>

      <FallbackAgentBlock
        title="Finance, conditions et cap table"
        agentNames={["financial-auditor", "conditions-analyst", "cap-table-auditor"]}
        results={results}
      />
      <FallbackAgentBlock
        title="Marché, clients, GTM et concurrence"
        agentNames={["market-intelligence", "customer-intel", "gtm-analyst", "competitive-intel"]}
        results={results}
      />
      <FallbackAgentBlock
        title="Équipe, produit et technique"
        agentNames={["team-investigator", "technical-dd", "tech-stack-dd", "tech-ops-dd", "deck-forensics"]}
        results={results}
      />
      <FallbackAgentBlock
        title="Sortie et synthèse"
        agentNames={["exit-strategist", "synthesis-deal-scorer", "devils-advocate", "contradiction-detector"]}
        results={results}
      />

      <Section title="Risques consolidés" icon={ShieldAlert} aside={<Badge variant="outline">{redFlags.length} risques</Badge>}>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <BulletList items={redFlags} empty="Aucun risque consolidé disponible." />
        </div>
      </Section>

      <Section title="Questions de due diligence" icon={AlertTriangle} aside={<Badge variant="outline">{questions.length} questions</Badge>}>
        <BulletList items={questions} empty="Aucune question consolidée disponible." />
      </Section>

      <Section title="Agents exécutés" icon={FileText}>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(results).map(([name, result]) => (
            <div key={name} className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{formatAgentName(name)}</p>
                <Badge variant={result.success ? "secondary" : "destructive"}>{result.success ? "Réussi" : "Échec"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {(result.executionTimeMs / 1000).toFixed(1)}s · {result.cost.toFixed(4)} $
              </p>
              {result.error && <p className="mt-2 text-xs leading-5 text-red-700">Agent non disponible dans cette analyse.</p>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  aside,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-background">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold tracking-normal">{title}</h3>
        </div>
        {aside}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TextBlock({ children }: { children?: string | null }) {
  if (!children) return <p className="text-sm text-muted-foreground">Non renseigné dans le mémo.</p>;
  return <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{children}</p>;
}

function BulletList({
  items,
  empty = "Aucun élément renseigné.",
}: {
  items?: string[] | null;
  empty?: string;
}) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-6 text-foreground">
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MetricTable({ metrics }: { metrics: Record<string, string | number> }) {
  const entries = Object.entries(metrics);
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Aucune métrique chiffrée dans le mémo.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">{key}</p>
          <p className="mt-1 text-sm font-semibold">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}

export const AnalysisMemoFull = memo(function AnalysisMemoFull({
  dealName,
  results,
  totalTimeMs,
  totalCost,
}: AnalysisMemoFullProps) {
  const memoResult = results["memo-generator"];
  const memoData = memoResult?.success && isMemoGeneratorData(memoResult.data)
    ? memoResult.data
    : null;

  const recommendation = memoData
    ? recommendationLabels[memoData.executiveSummary.recommendation] ?? {
      label: memoData.executiveSummary.recommendation,
      className: "border-slate-200 bg-slate-50 text-slate-700",
    }
    : null;

  const successfulAgents = useMemo(
    () => Object.values(results).filter((result) => result.success).length,
    [results]
  );

  if (!memoData) {
    return (
      <ReconstructedMemo
        dealName={dealName}
        results={results}
        totalTimeMs={totalTimeMs}
        totalCost={totalCost}
        error={memoResult?.error}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="border-b bg-muted/30 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("border", recommendation?.className)}>
                  {recommendation?.label}
                </Badge>
                <Badge variant="secondary">{successfulAgents}/{Object.keys(results).length} agents réussis</Badge>
                <Badge variant="outline">{formatRuntime(totalTimeMs)}</Badge>
                <Badge variant="outline">{formatCost(totalCost)}</Badge>
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-normal text-foreground">
                Mémo d’investissement entier — {dealName}
              </h2>
              <p className="mt-3 max-w-5xl text-base leading-7 text-foreground">
                {memoData.executiveSummary.oneLiner}
              </p>
            </div>
            {memoData.signalProfile?.score != null && (
              <div className="rounded-lg border bg-background p-4 text-center lg:min-w-[160px]">
                <p className="text-xs text-muted-foreground">Score mémo</p>
                <p className="mt-1 text-3xl font-semibold tracking-normal">{memoData.signalProfile.score}/100</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-3">
          {memoData.executiveSummary.keyPoints.map((point, index) => (
            <div key={`${point}-${index}`} className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm leading-6">{point}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Section title="Société et proposition de valeur" icon={FileText}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Description</p>
            <TextBlock>{memoData.companyOverview.description}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Traction</p>
            <TextBlock>{memoData.companyOverview.traction}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Problème</p>
            <TextBlock>{memoData.companyOverview.problem}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Solution</p>
            <TextBlock>{memoData.companyOverview.solution}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4 lg:col-span-2">
            <p className="text-sm font-semibold">Business model</p>
            <TextBlock>{memoData.companyOverview.businessModel}</TextBlock>
          </div>
        </div>
      </Section>

      <Section title="Thèse d’investissement" icon={Target}>
        <TextBlock>{memoData.investmentThesis}</TextBlock>
      </Section>

      <Section title="Points forts du deal" icon={CheckCircle2} aside={<Badge variant="outline">{memoData.investmentHighlights.length} points</Badge>}>
        <div className="space-y-3">
          {memoData.investmentHighlights.length > 0 ? memoData.investmentHighlights.map((item, index) => (
            <article key={`${item.highlight}-${index}`} className="rounded-lg border bg-emerald-50/50 p-4">
              <p className="font-semibold text-emerald-950">{item.highlight}</p>
              <p className="mt-2 text-sm leading-6 text-emerald-800">{item.evidence}</p>
            </article>
          )) : <p className="text-sm text-muted-foreground">Aucun point fort renseigné.</p>}
        </div>
      </Section>

      <Section title="Risques et points bloquants" icon={ShieldAlert} aside={<Badge variant="outline">{memoData.keyRisks.length + memoData.criticalRisks.length} risques</Badge>}>
        <div className="space-y-4">
          {memoData.criticalRisks.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold">Risques critiques consolidés</p>
              <div className="space-y-3">
                {memoData.criticalRisks.map((risk, index) => (
                  <article key={`${risk.riskId}-${index}`} className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive">{risk.severity}</Badge>
                      {risk.source && <Badge variant="outline">{risk.source}</Badge>}
                    </div>
                    <p className="mt-3 text-sm font-medium leading-6 text-red-950">{risk.description}</p>
                    {risk.evidence && <p className="mt-2 text-sm leading-6 text-red-800">Preuve : {risk.evidence}</p>}
                  </article>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-3 text-sm font-semibold">Risques clés et mitigations</p>
            <div className="space-y-3">
              {memoData.keyRisks.length > 0 ? memoData.keyRisks.map((risk, index) => {
                const riskStyle = residualRiskLabels[risk.residualRisk] ?? residualRiskLabels.medium;
                return (
                  <article key={`${risk.risk}-${index}`} className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <p className="font-semibold">{risk.risk}</p>
                      <Badge variant="outline" className={cn("border", riskStyle.className)}>{riskStyle.label}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Mitigation : {risk.mitigation}</p>
                  </article>
                );
              }) : <p className="text-sm text-muted-foreground">Aucun risque clé renseigné.</p>}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Finance et valorisation" icon={CircleDollarSign}>
        <div className="space-y-4">
          <MetricTable metrics={memoData.financialSummary.currentMetrics} />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-semibold">Projections</p>
              <TextBlock>{memoData.financialSummary.projections}</TextBlock>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-semibold">Assessment valorisation</p>
              <TextBlock>{memoData.financialSummary.valuationAssessment}</TextBlock>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Équipe, marché et concurrence" icon={Flag}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Équipe</p>
            <TextBlock>{memoData.teamAssessment}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Opportunité marché</p>
            <TextBlock>{memoData.marketOpportunity}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Paysage concurrentiel</p>
            <TextBlock>{memoData.competitiveLandscape}</TextBlock>
          </div>
        </div>
      </Section>

      <Section title="Termes du deal et négociation" icon={FileText}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Valorisation</p>
            <p className="mt-2 text-sm leading-6">{memoData.dealTerms.valuation}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Taille du round</p>
            <p className="mt-2 text-sm leading-6">{memoData.dealTerms.roundSize}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Termes clés</p>
            <div className="mt-3"><BulletList items={memoData.dealTerms.keyTerms} /></div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Points de négociation</p>
            <div className="mt-3"><BulletList items={memoData.dealTerms.negotiationPoints} /></div>
          </div>
        </div>
      </Section>

      <Section title="Due diligence réalisée et restante" icon={ShieldAlert}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Vérifications réalisées</p>
            <div className="mt-3"><BulletList items={memoData.dueDiligenceFindings.completed} /></div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">À compléter</p>
            <div className="mt-3"><BulletList items={memoData.dueDiligenceFindings.outstanding} /></div>
          </div>
          <div className="rounded-lg border bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-950">Red flags</p>
            <div className="mt-3"><BulletList items={memoData.dueDiligenceFindings.redFlags} empty="Aucun red flag renseigné dans le mémo." /></div>
          </div>
        </div>
      </Section>

      <Section title="Sortie et prochaines étapes" icon={Target}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Stratégie de sortie</p>
            <TextBlock>{memoData.exitStrategy}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Prochaines étapes</p>
            <div className="mt-3"><BulletList items={memoData.nextSteps} /></div>
          </div>
        </div>
      </Section>

      <Section title="Annexes" icon={FileText}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Modèle financier</p>
            <TextBlock>{memoData.appendix.financialModel}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Deals comparables</p>
            <TextBlock>{memoData.appendix.comparableDeals}</TextBlock>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Références vérifiées</p>
            <div className="mt-3"><BulletList items={memoData.appendix.referencesChecked} /></div>
          </div>
        </div>
      </Section>
    </div>
  );
});
