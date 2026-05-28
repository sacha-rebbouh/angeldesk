"use client";

import { memo, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileWarning,
  HelpCircle,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  verdict?: string | null;
  confidence?: number | null;
}

interface AnalysisInvestorViewProps {
  dealName: string;
  results: Record<string, AgentResult>;
  thesis?: AnalysisThesis | null;
  totalTimeMs?: number | null;
  totalCost?: number | null;
  currentScore?: number | null;
}

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

interface EvidenceItem {
  claim: string;
  source: string;
  reading: string;
  confidence: "Forte" | "Moyenne" | "Faible";
}

interface QuestionItem {
  question: string;
  context?: string;
  priority?: Severity;
}

interface DimensionItem {
  label: string;
  value: number | null;
  display: string;
  tone: "good" | "warning" | "danger" | "neutral";
}

const verdictLabels: Record<string, string> = {
  very_favorable: "Très favorable",
  favorable: "Favorable",
  contrasted: "Contrasté",
  vigilance: "Vigilance",
  alert_dominant: "Alerte dominante",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function recordAt(root: unknown, path: string[]): Record<string, unknown> | null {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return isRecord(cursor) ? cursor : null;
}

function valueAt(root: unknown, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return cursor;
}

function agentData(results: Record<string, AgentResult>, key: string): Record<string, unknown> | null {
  const result = results[key];
  if (!result?.success || !isRecord(result.data)) return null;
  return result.data;
}

function formatMoney(value: number | null): string {
  if (value == null) return "Non renseigné";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactMoney(value: number | null): string {
  if (value == null) return "n/a";
  if (Math.abs(value) >= 1_000_000) {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value / 1_000_000)} M€`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value / 1_000)} k€`;
  }
  return formatMoney(value);
}

function severityLabel(severity: Severity): string {
  const labels: Record<Severity, string> = {
    CRITICAL: "Critique",
    HIGH: "Élevé",
    MEDIUM: "Moyen",
    LOW: "Faible",
    INFO: "Info",
  };
  return labels[severity];
}

function severityFrom(value: unknown): Severity {
  const upper = text(value, "INFO").toUpperCase();
  if (upper === "CRITICAL" || upper === "HIGH" || upper === "MEDIUM" || upper === "LOW") {
    return upper;
  }
  return "INFO";
}

function severityClasses(severity: Severity): string {
  if (severity === "CRITICAL") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "HIGH") return "border-orange-200 bg-orange-50 text-orange-700";
  if (severity === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-700";
  if (severity === "LOW") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function toneClasses(tone: "good" | "warning" | "danger" | "neutral"): string {
  if (tone === "good") return "bg-emerald-500";
  if (tone === "warning") return "bg-amber-500";
  if (tone === "danger") return "bg-red-500";
  return "bg-slate-400";
}

function toneFromScore(value: number | null): DimensionItem["tone"] {
  if (value == null) return "neutral";
  if (value >= 70) return "good";
  if (value >= 40) return "warning";
  return "danger";
}

function extractScore(data: Record<string, unknown> | null): { value: number | null; grade: string | null } {
  const score = recordAt(data, ["score"]);
  return {
    value: numberValue(score?.value),
    grade: text(score?.grade) || null,
  };
}

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return "";
  const title = text(item.title)
    || text(item.highlight)
    || text(item.strength)
    || text(item.summary)
    || text(item.description);
  const detail = text(item.evidence)
    || text(item.rationale)
    || text(item.assessment);
  return [title, detail].filter(Boolean).join(" — ");
}

function stringItems(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(itemText).filter(Boolean).slice(0, limit);
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isNegativeSignal(item: string): boolean {
  const normalized = normalizeForMatch(item);
  const blockedPositiveClaimPatterns = [
    /\broi\b/,
    /\bsi maint/,
    /\bsi reel/,
    /\bsi les chiffres/,
    /\bproject/,
    /\bprojection/,
    /\bprojete/,
    /\bobjectif\s+d['’]?exit/,
  ];
  if (blockedPositiveClaimPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return [
    "risque",
    "fragile",
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
    "non realise",
    "non verifi",
    "sans aucune verification",
    "suspect",
    "preuve manquante",
    "inflation",
    "retention",
    "bloquant",
    "alerte",
    "critique",
  ].some((keyword) => normalized.includes(keyword));
}

function extractPositiveSignals(results: Record<string, AgentResult>): string[] {
  const synthesis = agentData(results, "synthesis-deal-scorer");
  const market = agentData(results, "market-intelligence");
  const customer = agentData(results, "customer-intel");
  const financial = agentData(results, "financial-auditor");
  const gtm = agentData(results, "gtm-analyst");

  return Array.from(new Set([
    ...stringItems(valueAt(synthesis, ["keyStrengths"]), 8),
    ...stringItems(valueAt(synthesis, ["findings", "topStrengths"]), 8),
    ...stringItems(valueAt(synthesis, ["investmentThesis", "strengths"]), 8),
    ...stringItems(valueAt(market, ["narrative", "keyInsights"]), 5),
    ...stringItems(valueAt(customer, ["narrative", "keyInsights"]), 5),
    ...stringItems(valueAt(gtm, ["narrative", "keyInsights"]), 5),
    ...stringItems(valueAt(market, ["findings", "topStrengths"]), 5),
    ...stringItems(valueAt(customer, ["findings", "topStrengths"]), 5),
    ...stringItems(valueAt(financial, ["findings", "topStrengths"]), 5),
    ...stringItems(valueAt(gtm, ["findings", "topStrengths"]), 5),
  ].filter((item) => !isNegativeSignal(item)))).slice(0, 5);
}

function displayDealName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function extractEvidence(results: Record<string, AgentResult>): EvidenceItem[] {
  const financial = agentData(results, "financial-auditor");
  const contradiction = agentData(results, "contradiction-detector");
  const evidence: EvidenceItem[] = [];

  for (const metric of records(valueAt(financial, ["findings", "metrics"])).slice(0, 5)) {
    const metricName = text(metric.metric);
    if (!metricName) continue;
    const reported = numberValue(metric.reportedValue);
    const calculated = numberValue(metric.calculatedValue);
    const valueLabel = calculated ?? reported;
    evidence.push({
      claim: valueLabel != null ? `${metricName}: ${formatCompactMoney(valueLabel)}` : metricName,
      source: text(metric.source, "Financial auditor"),
      reading: text(metric.assessment, "Point financier extrait des documents fournis."),
      confidence: text(metric.status).toLowerCase() === "suspicious" ? "Faible" : "Moyenne",
    });
  }

  for (const contradictionItem of records(valueAt(contradiction, ["findings", "contradictions"])).slice(0, 3)) {
    const topic = text(contradictionItem.topic, text(contradictionItem.id));
    if (!topic) continue;
    evidence.push({
      claim: topic,
      source: text(valueAt(contradictionItem, ["statement1", "location"]), "Détecteur de contradictions"),
      reading: text(contradictionItem.analysis, text(contradictionItem.implication)),
      confidence: numberValue(contradictionItem.confidenceLevel) && numberValue(contradictionItem.confidenceLevel)! >= 80 ? "Forte" : "Moyenne",
    });
  }

  return evidence.slice(0, 6);
}

function extractQuestions(results: Record<string, AgentResult>): QuestionItem[] {
  const questionMaster = agentData(results, "question-master");
  const financial = agentData(results, "financial-auditor");
  const seen = new Set<string>();
  const questions: QuestionItem[] = [];

  const addQuestion = (question: string, context?: string, priority?: Severity) => {
    const normalized = question.toLowerCase();
    if (!question || seen.has(normalized)) return;
    seen.add(normalized);
    questions.push({ question, context, priority });
  };

  for (const priority of records(valueAt(questionMaster, ["findings", "topPriorities"]))) {
    addQuestion(
      text(priority.action),
      [text(priority.deadline), text(priority.rationale)].filter(Boolean).join(" · "),
      "HIGH"
    );
  }

  for (const founderQuestion of records(valueAt(questionMaster, ["findings", "founderQuestions"]))) {
    addQuestion(
      text(founderQuestion.question),
      text(valueAt(founderQuestion, ["context", "whyItMatters"])),
      severityFrom(founderQuestion.priority)
    );
  }

  for (const question of records(financial?.questions)) {
    addQuestion(text(question.question), text(question.context), severityFrom(question.priority));
  }

  return questions.slice(0, 5);
}

function getPrimarySummary(results: Record<string, AgentResult>, thesis?: AnalysisThesis | null): string {
  const memoSummary = text(valueAt(agentData(results, "memo-generator"), ["executiveSummary", "oneLiner"]))
    || text(valueAt(agentData(results, "memo-generator"), ["investmentThesis"]));
  const synthesisSummary = text(valueAt(agentData(results, "synthesis-deal-scorer"), ["narrative", "summary"]))
    || text(valueAt(agentData(results, "synthesis-deal-scorer"), ["investmentThesis", "summary"]));
  const devilsSummary = text(valueAt(agentData(results, "devils-advocate"), ["narrative", "summary"]));
  const contradictionSummary = text(valueAt(agentData(results, "contradiction-detector"), ["narrative", "summary"]));
  const financialSummary = text(valueAt(agentData(results, "financial-auditor"), ["narrative", "summary"]));
  const marketSummary = text(valueAt(agentData(results, "market-intelligence"), ["narrative", "summary"]));
  const thesisText = text(thesis?.reformulated);
  return memoSummary || synthesisSummary || devilsSummary || contradictionSummary || financialSummary || marketSummary || thesisText || "L’analyse a été consolidée en lecture investisseur. Les détails restent disponibles dans la section complète.";
}

function getRecommendation(params: {
  criticalRisks: number;
  highRisks: number;
  financeScore: number | null;
  currentScore?: number | null;
  thesisVerdict?: string | null;
}): { title: string; note: string; tone: "good" | "warning" | "danger" } {
  if (params.thesisVerdict === "alert_dominant") {
    return {
      title: "Pause avant investissement",
      note: "La thèse contient des alertes dominantes. Le dossier doit être challengé avant comité.",
      tone: "danger",
    };
  }
  if (params.thesisVerdict === "vigilance") {
    return {
      title: "Due diligence ciblée",
      note: "Le dossier peut avancer uniquement avec des preuves complémentaires sur les points fragiles.",
      tone: "warning",
    };
  }
  if (params.criticalRisks > 0 || (params.financeScore != null && params.financeScore < 30)) {
    return {
      title: "Pause avant investissement",
      note: "Les signaux bloquants doivent être résolus avant de défendre un ticket.",
      tone: "danger",
    };
  }
  if (params.highRisks > 1 || params.thesisVerdict === "contrasted") {
    return {
      title: "Due diligence ciblée",
      note: "Le dossier peut avancer, mais seulement avec des preuves complémentaires.",
      tone: "warning",
    };
  }
  if (params.currentScore != null && params.currentScore >= 70) {
    return {
      title: "Passer en comité",
      note: "Les signaux principaux sont assez solides pour une discussion d’investissement.",
      tone: "good",
    };
  }
  return {
    title: "À creuser",
    note: "Le dossier contient des signaux utiles, mais la conviction reste incomplète.",
    tone: "warning",
  };
}

function MetricTile({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-2 text-2xl font-semibold tracking-normal",
        tone === "good" && "text-emerald-700",
        tone === "warning" && "text-amber-700",
        tone === "danger" && "text-red-700"
      )}>
        {value}
      </p>
      {note && <p className="mt-2 text-xs leading-5 text-muted-foreground">{note}</p>}
    </div>
  );
}

function DimensionBar({ item }: { item: DimensionItem }) {
  const width = item.value == null ? 12 : Math.max(6, Math.min(100, item.value));
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)_48px] items-center gap-3 text-sm">
      <span className="truncate text-muted-foreground">{item.label}</span>
      <span className="h-2 rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", toneClasses(item.tone))} style={{ width: `${width}%` }} />
      </span>
      <span className="text-right font-medium">{item.display}</span>
    </div>
  );
}

export const AnalysisInvestorView = memo(function AnalysisInvestorView({
  dealName,
  results,
  thesis,
  totalTimeMs,
  totalCost,
  currentScore,
}: AnalysisInvestorViewProps) {
  const displayedDealName = displayDealName(dealName);
  const financial = agentData(results, "financial-auditor");
  const contradiction = agentData(results, "contradiction-detector");
  const market = agentData(results, "market-intelligence");
  const customer = agentData(results, "customer-intel");
  const team = agentData(results, "team-investigator");
  const techOps = agentData(results, "tech-ops-dd");
  const deckCoherence = agentData(results, "deck-coherence-checker");

  const financeScore = extractScore(financial);
  const contradictionScore = extractScore(contradiction);
  const marketScore = extractScore(market);
  const customerScore = extractScore(customer);
  const teamScore = extractScore(team);
  const techScore = extractScore(techOps);

  const allRisks = useMemo(() => extractDecisionRisks(results), [results]);
  const risks = allRisks.slice(0, 5);
  const positiveSignals = useMemo(() => extractPositiveSignals(results), [results]);
  const evidence = useMemo(() => extractEvidence(results), [results]);
  const questions = useMemo(() => extractQuestions(results), [results]);

  const succeededCount = Object.values(results).filter((result) => result.success).length;
  const failedCount = Object.values(results).length - succeededCount;
  const criticalRisks = allRisks.filter((risk) => risk.severity === "CRITICAL").length;
  const highRisks = allRisks.filter((risk) => risk.severity === "HIGH").length;
  const coherenceScore = numberValue(deckCoherence?.coherenceScore);
  const recommendation = getRecommendation({
    criticalRisks,
    highRisks,
    financeScore: financeScore.value,
    currentScore,
    thesisVerdict: thesis?.verdict ?? null,
  });

  const dimensions: DimensionItem[] = [
    {
      label: "Marché",
      value: marketScore.value,
      display: marketScore.value != null ? String(marketScore.value) : marketScore.grade ?? "n/a",
      tone: toneFromScore(marketScore.value),
    },
    {
      label: "Clients",
      value: customerScore.value,
      display: customerScore.value != null ? String(customerScore.value) : customerScore.grade ?? "n/a",
      tone: toneFromScore(customerScore.value),
    },
    {
      label: "Finance",
      value: financeScore.value,
      display: financeScore.value != null ? String(financeScore.value) : financeScore.grade ?? "n/a",
      tone: toneFromScore(financeScore.value),
    },
    {
      label: "Équipe",
      value: teamScore.value,
      display: teamScore.value != null ? String(teamScore.value) : teamScore.grade ?? "n/a",
      tone: toneFromScore(teamScore.value),
    },
    {
      label: "Technique",
      value: techScore.value,
      display: techScore.value != null ? String(techScore.value) : techScore.grade ?? "n/a",
      tone: toneFromScore(techScore.value),
    },
  ];

  const summary = getPrimarySummary(results, thesis);
  const formattedRuntime = totalTimeMs ? `${(totalTimeMs / 60000).toFixed(1).replace(".", ",")} min` : null;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="border-b bg-muted/30 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("border", severityClasses(recommendation.tone === "danger" ? "CRITICAL" : recommendation.tone === "warning" ? "HIGH" : "LOW"))}>
                  {recommendation.title}
                </Badge>
                {thesis?.verdict && (
                  <Badge variant="secondary">
                    Thèse {verdictLabels[thesis.verdict] ?? thesis.verdict}
                  </Badge>
                )}
                {thesis?.confidence != null && (
                  <Badge variant="outline">{thesis.confidence}% de confiance</Badge>
                )}
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-normal text-foreground">
                Lecture investisseur de {displayedDealName}
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                {recommendation.note}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-background p-2 text-center lg:min-w-[280px]">
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">
                <div className="text-lg font-semibold">{succeededCount}</div>
                <div className="text-xs">disponibles</div>
              </div>
              <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                <div className="text-lg font-semibold">{failedCount}</div>
                <div className="text-xs">manquantes</div>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-slate-700">
                <div className="text-lg font-semibold">{Object.keys(results).length}</div>
                <div className="text-xs">analyses</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Score final"
            value={currentScore != null ? `${currentScore}/100` : "Non calculé"}
            note={currentScore == null ? "Score final indisponible, lecture basée sur les analyses disponibles." : "Score consolidé de l’analyse."}
            tone={currentScore == null ? "warning" : toneFromScore(currentScore)}
          />
          <MetricTile
            label="Cohérence du dossier"
            value={coherenceScore != null ? `${coherenceScore}/100` : "n/a"}
            note={criticalRisks > 0 ? `${criticalRisks} sujet${criticalRisks > 1 ? "s" : ""} critique${criticalRisks > 1 ? "s" : ""}` : "Aucune contradiction critique remontée."}
            tone={coherenceScore == null ? "neutral" : toneFromScore(coherenceScore)}
          />
          <MetricTile
            label="Finance"
            value={financeScore.value != null ? `${financeScore.value}/100` : financeScore.grade ?? "n/a"}
            note={text(valueAt(financial, ["findings", "valuation", "verdict"]), "Qualité financière à valider.")}
            tone={toneFromScore(financeScore.value)}
          />
        </div>

        <div className="border-t bg-muted/20 p-5">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold tracking-normal">Travail effectué</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Temps d’analyse</p>
              <p className="mt-1 text-lg font-semibold">{formattedRuntime ?? "n/a"}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Analyses disponibles</p>
              <p className="mt-1 text-lg font-semibold">{Object.keys(results).length}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Angles couverts</p>
              <p className="mt-1 text-sm font-medium leading-5">Finance, marché, clients, équipe, technique, risques</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Détail complet</p>
              <p className="mt-1 text-sm font-medium leading-5">Onglet “Analyses détaillées”</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <div className="space-y-5">
          <section className="rounded-xl border bg-background p-5">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold tracking-normal">Synthèse</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{summary}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Ce qui donne envie de continuer
                </div>
                {positiveSignals.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {positiveSignals.slice(0, 4).map((signal) => (
                      <li key={signal} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0" />
                        <span>{signal}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Aucun signal positif suffisamment isolé des risques n’a été consolidé.
                  </p>
                )}
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  Ce qui empêche de décider
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {risks[0]?.description || "Les points bloquants doivent être explicitement reliés à des preuves avant comité."}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-background">
            <div className="border-b p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">Ce qui peut changer la décision</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Risques classés par impact investisseur.</p>
                </div>
                <Badge variant={criticalRisks > 0 ? "destructive" : "secondary"}>
                  {criticalRisks + highRisks} prioritaire{criticalRisks + highRisks > 1 ? "s" : ""}
                </Badge>
              </div>
            </div>
            <div className="divide-y">
              {risks.length > 0 ? risks.map((risk, index) => (
                <article key={risk.id} className="grid gap-3 p-5 md:grid-cols-[36px_minmax(0,1fr)_auto]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold tracking-normal">{risk.title}</h4>
                      <Badge variant="outline" className={cn("border", severityClasses(risk.severity))}>
                        {severityLabel(risk.severity)}
                      </Badge>
                    </div>
                    {risk.description && (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{risk.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {risk.source && <Badge variant="secondary">{risk.source}</Badge>}
                      {risk.evidence && <Badge variant="outline" className="max-w-full truncate">Preuve: {risk.evidence}</Badge>}
                    </div>
                    {risk.question && (
                      <p className="mt-3 text-sm leading-6 text-foreground">
                        <span className="font-medium">À demander: </span>{risk.question}
                      </p>
                    )}
                  </div>
                  <div className="hidden items-start md:flex">
                    {risk.severity === "CRITICAL" ? (
                      <XCircle className="h-5 w-5 text-red-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    )}
                  </div>
                </article>
              )) : (
                <div className="p-5 text-sm text-muted-foreground">Aucun risque prioritaire consolidé.</div>
              )}
            </div>
          </section>

          {evidence.length > 0 && (
            <section className="rounded-xl border bg-background">
              <div className="border-b p-5">
                <div className="flex items-center gap-2">
                  <FileWarning className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold tracking-normal">Preuves utilisées</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Lecture des affirmations importantes et de leur solidité.</p>
              </div>
              <div className="divide-y">
                {evidence.map((item, index) => (
                  <div key={`${item.claim}-${index}`} className="grid gap-3 p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_96px]">
                    <div>
                      <p className="font-medium">{item.claim}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.source}</p>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{item.reading}</p>
                    <div>
                      <Badge
                        variant="outline"
                        className={cn(
                          item.confidence === "Forte" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                          item.confidence === "Moyenne" && "border-amber-200 bg-amber-50 text-amber-700",
                          item.confidence === "Faible" && "border-red-200 bg-red-50 text-red-700"
                        )}
                      >
                        {item.confidence}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border bg-background p-5">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold tracking-normal">Actions immédiates</h3>
            </div>
            <div className="mt-4 space-y-3">
              {questions.length > 0 ? questions.map((item, index) => (
                <div key={`${item.question}-${index}`} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-5">{item.question}</p>
                      {item.context && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.context}</p>}
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">Aucune question prioritaire consolidée.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-background p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold tracking-normal">Dimensions</h3>
            </div>
            <div className="mt-4 space-y-3">
              {dimensions.map((item) => (
                <DimensionBar key={item.label} item={item} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-background p-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold tracking-normal">Santé de l’analyse</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Analyses disponibles</span>
                <span className="font-medium">{succeededCount}/{Object.keys(results).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Contradictions</span>
                <span className="font-medium">{contradictionScore.value ?? contradictionScore.grade ?? "n/a"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Temps d’analyse</span>
                <span className="font-medium">{formattedRuntime ?? "n/a"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Coût d’analyse</span>
                <span className="font-medium">{totalCost != null ? `${totalCost.toFixed(2)} $` : "n/a"}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-background p-5">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold tracking-normal">À vérifier</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Les chiffres déclarés doivent être rapprochés des documents comptables.</span>
              </div>
              <div className="flex items-start gap-2">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Les métriques projetées ne doivent pas être traitées comme du réalisé.</span>
              </div>
              <div className="flex items-start gap-2">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Le détail par angle reste disponible dans “Analyses détaillées”.</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <CircleDollarSign className="h-4 w-4" />
        <span>Cette vue consolide les analyses disponibles et signale explicitement les analyses manquantes.</span>
        <TrendingUp className="ml-auto h-4 w-4 hidden sm:block" />
      </div>
    </div>
  );
});
