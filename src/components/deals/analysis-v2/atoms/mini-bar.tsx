export type MiniBarTone = "favorable" | "vigilance" | "alert" | "info" | "neutral";

const TONE_COLOR: Record<MiniBarTone, string> = {
  favorable: "var(--av-favorable)",
  vigilance: "var(--av-vigilance)",
  alert: "var(--av-alert)",
  info: "var(--av-info)",
  neutral: "var(--av-line-strong)",
};

type MiniBarProps = {
  label: string;
  value: number | null;
  tone: MiniBarTone;
  scale?: number;
  hint?: string;
};

export function MiniBar({ label, value, tone, scale = 100, hint }: MiniBarProps) {
  const safe = value == null ? null : Math.max(0, Math.min(scale, value));
  const widthPct = safe == null ? 0 : (safe / scale) * 100;
  const display = safe == null ? "—" : `${Math.round(safe)}`;
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-2 text-[13px]">
      <span className="text-[var(--av-ink)]">{label}</span>
      <span
        className="relative h-2 overflow-hidden rounded-full"
        style={{ background: "#e7ebef" }}
        role="progressbar"
        aria-label={hint ?? label}
        aria-valuenow={safe ?? undefined}
        aria-valuemin={0}
        aria-valuemax={scale}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${widthPct}%`, background: safe == null ? "transparent" : TONE_COLOR[tone] }}
        />
      </span>
      <strong className="av-tabular text-right text-[13px] text-[var(--av-ink)]">{display}</strong>
    </div>
  );
}
