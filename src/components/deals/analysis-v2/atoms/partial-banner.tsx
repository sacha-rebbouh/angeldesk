import type { ReactNode } from "react";

type PartialBannerProps = {
  tone: "vigilance" | "alert" | "info";
  title: string;
  children?: ReactNode;
};

const TONE_STYLES = {
  vigilance: { bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)", ink: "var(--av-vigilance)" },
  alert: { bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)", ink: "var(--av-alert)" },
  info: { bg: "var(--av-info-soft)", edge: "var(--av-info-edge)", ink: "var(--av-info)" },
};

export function PartialBanner({ tone, title, children }: PartialBannerProps) {
  const style = TONE_STYLES[tone];
  return (
    <div
      role="note"
      className="flex flex-col gap-1 rounded-xl px-4 py-3"
      style={{ background: style.bg, border: `1px solid ${style.edge}` }}
    >
      <strong className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: style.ink }}>
        {title}
      </strong>
      {children ? <div className="text-[13px] leading-relaxed text-[var(--av-ink)]">{children}</div> : null}
    </div>
  );
}
