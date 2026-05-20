"use client";

/**
 * B17.1 — Admin Analysis Debug Console (client).
 *
 * Polls /api/admin/analyses/:id/debug every 10s. Renders 5 sections:
 *   1. Header (status + manual refresh + auto-refresh indicator)
 *   2. Anomalies (top, only if non-empty)
 *   3. Summary (key/value grid)
 *   4. Agents table (with status badges)
 *   5. LLM calls table (filters: errors-only, unknown-only)
 *   6. Checkpoint card
 *
 * STRICTLY READ-ONLY: no mutation, no useMutation, no POST/DELETE/PATCH.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type AgentStatus = "success" | "failed" | "unknown";

type Anomaly = {
  type:
    | "unknown_agent_calls"
    | "agent_errors"
    | "total_cost_exceeded"
    | "slow_llm_call"
    | "high_input_tokens"
    | "completed_with_errors"
    | "checkpoint_divergence";
  severity: "warn" | "high";
  message: string;
  count?: number;
  data?: Record<string, unknown>;
};

type Summary = {
  id: string;
  dealId: string;
  status: string;
  mode: string | null;
  type: string;
  totalAgents: number;
  completedAgents: number;
  totalCost: number | null;
  totalTimeMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  thesisId: string | null;
  thesisDecision: string | null;
  thesisDecisionAt: string | null;
  refundedAt: string | null;
  refundAmount: number | null;
  hasSummary: boolean;
  hasResults: boolean;
  hasNegotiationStrategy: boolean;
};

type AgentRow = {
  agentName: string;
  callCount: number;
  errorCount: number;
  totalCost: number;
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  latestModel: string | null;
  latestCreatedAt: string | null;
  status: AgentStatus;
};

type LLMCall = {
  id: string;
  agentName: string;
  model: string;
  isError: boolean;
  errorType: string | null;
  errorMessage: string | null;
  durationMs: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  finishReason: string | null;
  createdAt: string;
};

type Checkpoint = {
  id: string;
  state: string;
  completedAgents: string[];
  pendingAgents: string[];
  failedAgents: unknown;
  createdAt: string;
};

type DebugData = {
  summary: Summary;
  agents: AgentRow[];
  llmCalls: LLMCall[];
  checkpoint: Checkpoint | null;
  anomalies: Anomaly[];
  meta: {
    llmCallsLimit: number;
    llmCallsReturned: number;
    llmCallsTotal: number;
    generatedAt: string;
  };
};

const POLL_MS = 10_000;

function fmtNumber(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusBadgeVariant(status: AgentStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") return "destructive";
  if (status === "unknown") return "outline";
  return "secondary";
}

function severityClass(sev: Anomaly["severity"]): string {
  return sev === "high"
    ? "border-red-300 bg-red-50 dark:bg-red-950/20"
    : "border-amber-300 bg-amber-50 dark:bg-amber-950/20";
}

export function AnalysisDebugConsole({ analysisId }: { analysisId: string }) {
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [unknownOnly, setUnknownOnly] = useState(false);

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.admin.analysisDebug(analysisId),
    queryFn: async (): Promise<DebugData> => {
      const r = await fetch(`/api/admin/analyses/${analysisId}/debug`, {
        method: "GET",
      });
      if (!r.ok) {
        throw new Error(`Debug API returned ${r.status}`);
      }
      const body = (await r.json()) as { data: DebugData };
      return body.data;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const filteredCalls = useMemo<LLMCall[]>(() => {
    if (!data) return [];
    return data.llmCalls.filter((c) => {
      if (errorsOnly && !c.isError) return false;
      if (unknownOnly && c.agentName !== "unknown") return false;
      return true;
    });
  }, [data, errorsOnly, unknownOnly]);

  if (isLoading && !data) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (error && !data) {
    return (
      <div className="text-sm text-destructive" role="alert">
        Failed to load debug data: {(error as Error).message}
      </div>
    );
  }
  if (!data) {
    return null;
  }

  const { summary, agents, anomalies, checkpoint, meta } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant="outline">{summary.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {summary.completedAgents}/{summary.totalAgents} agents
          </span>
          <span className="text-sm text-muted-foreground">
            auto-refresh {POLL_MS / 1000}s · last update {fmtDate(new Date(dataUpdatedAt).toISOString())}
          </span>
        </div>
        <Button
          onClick={onRefresh}
          variant="outline"
          size="sm"
          disabled={isFetching}
          aria-label="Refresh now"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anomalies détectées ({anomalies.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {anomalies.map((a, idx) => (
              <div
                key={`${a.type}-${idx}`}
                className={`border rounded-md p-3 text-sm ${severityClass(a.severity)}`}
                data-anomaly-type={a.type}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={a.severity === "high" ? "destructive" : "outline"} className="uppercase text-[10px]">
                    {a.severity}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{a.type}</span>
                  {a.count != null && (
                    <span className="text-xs text-muted-foreground">· count {a.count}</span>
                  )}
                </div>
                <div>{a.message}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <KV k="status" v={summary.status} />
            <KV k="mode" v={summary.mode ?? "—"} />
            <KV k="type" v={summary.type} />
            <KV k="agents" v={`${summary.completedAgents}/${summary.totalAgents}`} />
            <KV k="totalCost" v={summary.totalCost != null ? `$${fmtNumber(summary.totalCost)}` : "—"} />
            <KV k="totalTimeMs" v={fmtMs(summary.totalTimeMs)} />
            <KV k="startedAt" v={fmtDate(summary.startedAt)} />
            <KV k="completedAt" v={fmtDate(summary.completedAt)} />
            <KV k="thesisDecision" v={summary.thesisDecision ?? "—"} />
            <KV k="thesisDecisionAt" v={fmtDate(summary.thesisDecisionAt)} />
            <KV
              k="refund"
              v={summary.refundedAt ? `${summary.refundAmount ?? "?"} @ ${fmtDate(summary.refundedAt)}` : "—"}
            />
            <KV
              k="hasSummary / hasResults / hasNegotiation"
              v={`${summary.hasSummary ? "✓" : "·"} / ${summary.hasResults ? "✓" : "·"} / ${summary.hasNegotiationStrategy ? "✓" : "·"}`}
            />
          </dl>
        </CardContent>
      </Card>

      {/* Agents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents ({agents.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 pr-3">agentName</th>
                <th className="text-right py-2 px-3">calls</th>
                <th className="text-right py-2 px-3">errors</th>
                <th className="text-right py-2 px-3">cost ($)</th>
                <th className="text-right py-2 px-3">total dur</th>
                <th className="text-right py-2 px-3">in tok</th>
                <th className="text-right py-2 px-3">out tok</th>
                <th className="text-left py-2 px-3">latest model</th>
                <th className="text-left py-2 px-3">latest at</th>
                <th className="text-left py-2 pl-3">status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {agents.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-3 text-center text-muted-foreground">
                    no LLM calls recorded for this analysis
                  </td>
                </tr>
              )}
              {agents.map((a) => (
                <tr key={a.agentName} data-agent-name={a.agentName}>
                  <td className="py-1.5 pr-3 font-mono text-xs">{a.agentName}</td>
                  <td className="py-1.5 px-3 text-right">{a.callCount}</td>
                  <td className="py-1.5 px-3 text-right">{a.errorCount > 0 ? <span className="text-destructive">{a.errorCount}</span> : a.errorCount}</td>
                  <td className="py-1.5 px-3 text-right">{fmtNumber(a.totalCost)}</td>
                  <td className="py-1.5 px-3 text-right">{fmtMs(a.totalDurationMs)}</td>
                  <td className="py-1.5 px-3 text-right">{a.totalInputTokens.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right">{a.totalOutputTokens.toLocaleString()}</td>
                  <td className="py-1.5 px-3 font-mono text-xs">{a.latestModel ?? "—"}</td>
                  <td className="py-1.5 px-3 text-xs text-muted-foreground">{fmtDate(a.latestCreatedAt)}</td>
                  <td className="py-1.5 pl-3"><Badge variant={statusBadgeVariant(a.status)}>{a.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* LLM calls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">
              LLM calls ({meta.llmCallsReturned}/{meta.llmCallsTotal})
            </CardTitle>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={errorsOnly}
                  onChange={(e) => setErrorsOnly(e.target.checked)}
                  aria-label="Errors only"
                />
                Errors only
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unknownOnly}
                  onChange={(e) => setUnknownOnly(e.target.checked)}
                  aria-label="Unknown only"
                />
                Unknown only
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 pr-3">at</th>
                <th className="text-left py-2 px-3">agent</th>
                <th className="text-left py-2 px-3">model</th>
                <th className="text-left py-2 px-3">err</th>
                <th className="text-left py-2 px-3">errType</th>
                <th className="text-left py-2 px-3">msg</th>
                <th className="text-right py-2 px-3">dur</th>
                <th className="text-right py-2 px-3">cost</th>
                <th className="text-right py-2 px-3">in</th>
                <th className="text-right py-2 px-3">out</th>
                <th className="text-left py-2 pl-3">finish</th>
              </tr>
            </thead>
            <tbody className="divide-y" data-testid="llm-calls-tbody">
              {filteredCalls.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-3 text-center text-muted-foreground">
                    no calls match the current filters
                  </td>
                </tr>
              )}
              {filteredCalls.map((c) => (
                <tr key={c.id} data-call-id={c.id} data-agent-name={c.agentName} data-is-error={c.isError ? "true" : "false"}>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                  <td className="py-1.5 px-3 font-mono text-xs">{c.agentName}</td>
                  <td className="py-1.5 px-3 font-mono text-xs">{c.model}</td>
                  <td className="py-1.5 px-3">{c.isError ? <Badge variant="destructive">err</Badge> : "—"}</td>
                  <td className="py-1.5 px-3 text-xs">{c.errorType ?? "—"}</td>
                  <td className="py-1.5 px-3 text-xs max-w-[260px] truncate" title={c.errorMessage ?? ""}>{c.errorMessage ?? "—"}</td>
                  <td className="py-1.5 px-3 text-right">{fmtMs(c.durationMs)}</td>
                  <td className="py-1.5 px-3 text-right">{fmtNumber(c.cost)}</td>
                  <td className="py-1.5 px-3 text-right">{c.inputTokens.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right">{c.outputTokens.toLocaleString()}</td>
                  <td className="py-1.5 pl-3 text-xs">{c.finishReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Checkpoint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest checkpoint</CardTitle>
        </CardHeader>
        <CardContent>
          {!checkpoint ? (
            <div className="text-sm text-muted-foreground">No checkpoint recorded.</div>
          ) : (
            <div className="space-y-2 text-sm" data-testid="checkpoint-card">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline">{checkpoint.state}</Badge>
                <span className="font-mono text-xs">{checkpoint.id}</span>
                <span className="text-xs text-muted-foreground">at {fmtDate(checkpoint.createdAt)}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">completedAgents ({checkpoint.completedAgents.length})</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {checkpoint.completedAgents.map((a) => (
                    <Badge key={`c-${a}`} variant="secondary" className="font-mono text-[10px]">{a}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">pendingAgents ({checkpoint.pendingAgents.length})</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {checkpoint.pendingAgents.map((a) => (
                    <Badge key={`p-${a}`} variant="outline" className="font-mono text-[10px]">{a}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">failedAgents (raw)</div>
                <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto">{JSON.stringify(checkpoint.failedAgents, null, 2)}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-mono text-xs break-all">{v}</dd>
    </div>
  );
}
