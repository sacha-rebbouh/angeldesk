"use client";

/**
 * Phase 8 — Corpus Control Panel (deal-level surface).
 *
 * Renders the EvidenceHealthReport for the current deal: contradictions
 * across documents, missing evidence, freshness rollup. Positioning rule
 * (CLAUDE.md): analytical tone only — no GO/NO_GO, no "investir"/"rejeter".
 *
 * Empty-state handling: renders nothing when there is nothing to flag.
 * Loading + error states are minimal — the panel is a pre-analysis corpus
 * quality surface and should never block the page.
 */
import { memo, useMemo } from "react";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldCheck,
  ScrollText,
  CalendarClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  ContradictionFinding,
  EvidenceHealthReport,
  EvidenceHealthSeverity,
  MissingEvidenceFinding,
} from "@/services/evidence";
import { useEvidenceHealth } from "@/hooks/use-evidence-health";

interface EvidenceHealthPanelProps {
  dealId: string;
}

const SEVERITY_STYLE: Record<EvidenceHealthSeverity, { badge: string; icon: typeof AlertTriangle; color: string }> = {
  HIGH: { badge: "border-red-300 bg-red-50 text-red-700", icon: AlertTriangle, color: "text-red-600" },
  MEDIUM: { badge: "border-amber-300 bg-amber-50 text-amber-700", icon: AlertCircle, color: "text-amber-600" },
  LOW: { badge: "border-slate-300 bg-slate-50 text-slate-700", icon: Info, color: "text-slate-600" },
};

export const EvidenceHealthPanel = memo(function EvidenceHealthPanel({ dealId }: EvidenceHealthPanelProps) {
  const { data, isLoading, error } = useEvidenceHealth(dealId);

  // Loading / empty / error — keep the panel quiet so it never breaks the page.
  if (isLoading || error || !data) return null;

  const { report } = data;
  const totalFindings = report.contradictions.length + report.missing.length + report.freshness.total;
  if (totalFindings === 0) return null;

  return (
    <Card className="border-slate-200 bg-slate-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-slate-600" />
          Contrôle du corpus
          <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
            {totalFindings} signal{totalFindings > 1 ? "aux" : ""}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Contrôle automatique avant analyse IA : fraîcheur, contradictions et pièces manquantes dans le corpus. Ces
          signaux ne remplacent pas l’analyse d’investissement ; ils indiquent ce qu’il faut vérifier dans le dossier.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.contradictions.length > 0 && <ContradictionsBlock items={report.contradictions} />}
        {report.missing.length > 0 && <MissingBlock items={report.missing} />}
        {report.freshness.total > 0 && <FreshnessBlock report={report} />}
      </CardContent>
    </Card>
  );
});

// ============================================================
// Blocks
// ============================================================

function ContradictionsBlock({ items }: { items: ContradictionFinding[] }) {
  return (
    <section>
      <SectionTitle icon={ScrollText} label={`Contradictions détectées (${items.length})`} />
      <ul className="mt-2 space-y-2">
        {items.map((c, idx) => {
          const style = SEVERITY_STYLE[c.severity];
          const Icon = style.icon;
          return (
            <li
              key={`${c.kind}-${c.subject}-${c.year ?? "undated"}-${idx}`}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-sm"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.color)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {formatSubject(c.subject)}
                    {c.year !== null ? ` ${c.year}` : " (non datée)"}
                  </span>
                  <Badge variant="outline" className={style.badge}>
                    {c.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.reason}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MissingBlock({ items }: { items: MissingEvidenceFinding[] }) {
  return (
    <section>
      <SectionTitle icon={AlertCircle} label={`Pièces ou repères manquants (${items.length})`} />
      <ul className="mt-2 space-y-2">
        {items.map((m, idx) => {
          const style = SEVERITY_STYLE[m.severity];
          const Icon = style.icon;
          return (
            <li
              key={`${m.kind}-${idx}`}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-sm"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.color)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={style.badge}>
                    {m.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.message}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FreshnessBlock({ report }: { report: EvidenceHealthReport }) {
  const rows = useMemo(() => {
    const counts = report.freshness.countsByKind;
    return [
      { kind: "cap_table_stale", label: "Cap table périmée", count: counts.cap_table_stale },
      { kind: "balance_sheet_stale", label: "Bilan périmé", count: counts.balance_sheet_stale },
      { kind: "forecast_now_historical", label: "Forecast déjà entamé", count: counts.forecast_now_historical },
    ].filter((r) => r.count > 0);
  }, [report.freshness.countsByKind]);

  return (
    <section>
      <SectionTitle icon={CalendarClock} label={`Fraîcheur (${report.freshness.total})`} />
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.kind} className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
            <span>{r.label}</span>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              {r.count}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: typeof AlertTriangle; label: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <Icon className="h-4 w-4 text-slate-600" />
      {label}
    </h3>
  );
}

function formatSubject(subject: string): string {
  if (subject === "VALUATION") return "Valorisation";
  return subject;
}
