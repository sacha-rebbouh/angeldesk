import type { ReactNode } from "react";

export type CalloutTone = "favorable" | "vigilance" | "alert" | "info" | "neutral";

const TONE_STYLES: Record<CalloutTone, { bg: string; edge: string; ink: string }> = {
  favorable: { bg: "var(--av-favorable-soft)", edge: "var(--av-favorable-edge)", ink: "var(--av-ink)" },
  vigilance: { bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)", ink: "var(--av-ink)" },
  alert: { bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)", ink: "var(--av-ink)" },
  info: { bg: "var(--av-info-soft)", edge: "var(--av-info-edge)", ink: "var(--av-ink)" },
  neutral: { bg: "var(--av-surface-muted)", edge: "var(--av-line)", ink: "var(--av-ink)" },
};

type CalloutProps = {
  tone: CalloutTone;
  title: string;
  children: ReactNode;
  eyebrow?: string;
  className?: string;
};

export function Callout({ tone, title, children, eyebrow, className }: CalloutProps) {
  const style = TONE_STYLES[tone];
  return (
    <section
      className={`flex flex-col gap-2 rounded-xl p-4 ${className ?? ""}`}
      style={{ background: style.bg, border: `1px solid ${style.edge}`, color: style.ink }}
    >
      {eyebrow ? <span className="av-eyebrow">{eyebrow}</span> : null}
      <h3 className="av-h3">{title}</h3>
      <div className="text-[14px] leading-relaxed">{children}</div>
    </section>
  );
}
