import { SEVERITY_STYLES } from "@/lib/ui-configs";

export type StatusPillSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

type StatusPillProps = {
  severity: StatusPillSeverity;
  label?: string;
  className?: string;
};

const STYLE_BY_SEVERITY: Record<StatusPillSeverity, { color: string; bg: string; border: string }> = {
  CRITICAL: { color: "var(--av-alert)", bg: "var(--av-alert-soft)", border: "var(--av-alert-edge)" },
  HIGH: { color: "var(--av-vigilance)", bg: "var(--av-vigilance-soft)", border: "var(--av-vigilance-edge)" },
  MEDIUM: { color: "var(--av-vigilance)", bg: "var(--av-vigilance-soft)", border: "var(--av-vigilance-edge)" },
  LOW: { color: "var(--av-info)", bg: "var(--av-info-soft)", border: "var(--av-info-edge)" },
  INFO: { color: "var(--av-info)", bg: "var(--av-info-soft)", border: "var(--av-info-edge)" },
};

export function StatusPill({ severity, label, className }: StatusPillProps) {
  const style = STYLE_BY_SEVERITY[severity];
  const text = label ?? SEVERITY_STYLES[severity]?.label ?? severity;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${className ?? ""}`}
      style={{
        color: style.color,
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      {text}
    </span>
  );
}
