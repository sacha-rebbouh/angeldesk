import type { ReactNode } from "react";

import { StatusPill, type StatusPillSeverity } from "./status-pill";

type Tag = {
  label: string;
  tone?: "neutral" | "favorable" | "vigilance" | "alert" | "info";
};

type RankRowProps = {
  rank: number;
  title: string;
  description?: string;
  severity: StatusPillSeverity;
  severityLabel?: string;
  tags?: Tag[];
  rightSlot?: ReactNode;
};

const TAG_STYLES: Record<NonNullable<Tag["tone"]>, { bg: string; edge: string; color: string }> = {
  neutral: { bg: "var(--av-surface)", edge: "var(--av-line)", color: "var(--av-muted)" },
  favorable: { bg: "var(--av-favorable-soft)", edge: "var(--av-favorable-edge)", color: "var(--av-favorable)" },
  vigilance: { bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)", color: "var(--av-vigilance)" },
  alert: { bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)", color: "var(--av-alert)" },
  info: { bg: "var(--av-info-soft)", edge: "var(--av-info-edge)", color: "var(--av-info)" },
};

function TagBadge({ tag }: { tag: Tag }) {
  const style = TAG_STYLES[tag.tone ?? "neutral"];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{ background: style.bg, border: `1px solid ${style.edge}`, color: style.color }}
    >
      {tag.label}
    </span>
  );
}

export function RankRow({ rank, title, description, severity, severityLabel, tags, rightSlot }: RankRowProps) {
  return (
    <article
      className="grid items-start gap-4 rounded-xl border bg-[var(--av-surface)] p-4 sm:grid-cols-[40px_minmax(0,1fr)_auto]"
      style={{ borderColor: "var(--av-line)" }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--av-ink)] text-sm font-bold text-white av-tabular">
        {rank}
      </div>
      <div className="min-w-0">
        <h4 className="text-[15px] font-semibold leading-snug text-[var(--av-ink)]">{title}</h4>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--av-muted)]">{description}</p>
        ) : null}
        {tags && tags.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((tag, idx) => (
              <TagBadge key={`${tag.label}-${idx}`} tag={tag} />
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-2">
        <StatusPill severity={severity} label={severityLabel} />
        {rightSlot}
      </div>
    </article>
  );
}
