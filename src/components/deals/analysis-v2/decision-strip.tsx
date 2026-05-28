import { BadgePair } from "./atoms/badge-pair";
import type { buildDecisionStripModel } from "./lib/selectors";
import { RECOMMENDATION_CONFIG, THESIS_VERDICT_CONFIG } from "@/lib/ui-configs";

type Model = ReturnType<typeof buildDecisionStripModel>;

function MetricCard({
  eyebrow,
  primary,
  secondary,
  tone,
  detail,
}: {
  eyebrow: string;
  primary: string;
  secondary?: string;
  tone: "favorable" | "vigilance" | "alert" | "info" | "neutral";
  detail?: string;
}) {
  const accent = (() => {
    switch (tone) {
      case "favorable":
        return "var(--av-favorable)";
      case "vigilance":
        return "var(--av-vigilance)";
      case "alert":
        return "var(--av-alert)";
      case "info":
        return "var(--av-info)";
      default:
        return "var(--av-line-strong)";
    }
  })();
  return (
    <article
      className="flex min-h-[120px] flex-col gap-2 rounded-xl bg-[var(--av-surface)] p-4"
      style={{
        border: "1px solid var(--av-line)",
        borderLeft: `4px solid ${accent}`,
        boxShadow: "var(--av-shadow-soft)",
      }}
    >
      <span className="av-eyebrow">{eyebrow}</span>
      <strong className="text-[20px] font-semibold leading-tight text-[var(--av-ink)] av-tabular">{primary}</strong>
      {secondary ? <span className="text-[13px] text-[var(--av-ink)]">{secondary}</span> : null}
      {detail ? <span className="av-note">{detail}</span> : null}
    </article>
  );
}

export function DecisionStrip({ model }: { model: Model }) {
  const { orientation, solidity, alertDistribution, coherenceScore, contradictionsCritical, totalContradictions, thesisVerdict, completion } = model;

  const orientationLabel = orientation ? RECOMMENDATION_CONFIG[orientation]?.label ?? "Non qualifiée" : "Score final indisponible";
  const orientationDetail = orientation
    ? null
    : completion.hasSynthesisScorer
      ? "Aucune orientation agrégée disponible."
      : "L'agent de synthèse n'a pas pu produire de score final sur cette analyse.";

  const alertConvergence = (() => {
    const { STOP, INVESTIGATE_FURTHER, PROCEED_WITH_CAUTION, PROCEED, total } = alertDistribution;
    if (total === 0) return "Aucun signal agrégé disponible.";
    return `${STOP} alerte${STOP > 1 ? "s" : ""} · ${INVESTIGATE_FURTHER} investigation${INVESTIGATE_FURTHER > 1 ? "s" : ""} · ${PROCEED_WITH_CAUTION} vigilance · ${PROCEED} conforme${PROCEED > 1 ? "s" : ""}`;
  })();

  const thesisLabel = thesisVerdict ? THESIS_VERDICT_CONFIG[thesisVerdict]?.label ?? thesisVerdict : "Thèse non qualifiée";
  const thesisDetail = (() => {
    if (!completion.hasThesisReconciler) return "Réconciliation thèse vs findings non effectuée.";
    return "Réconciliation thèse effectuée.";
  })();

  const coherenceLabel = coherenceScore != null ? `${coherenceScore} / 100` : "Score indisponible";
  const coherenceDetail = totalContradictions > 0
    ? `${totalContradictions} contradiction${totalContradictions > 1 ? "s" : ""} dont ${contradictionsCritical} critique${contradictionsCritical > 1 ? "s" : ""}`
    : "Aucune contradiction documentée par l'agent.";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <article
          className="flex min-h-[120px] flex-col gap-3 rounded-xl bg-[var(--av-surface)] p-4"
          style={{
            border: "1px solid var(--av-line)",
            borderLeft: `4px solid ${orientation === "alert_dominant" ? "var(--av-alert)" : orientation === "vigilance" ? "var(--av-info)" : orientation === "contrasted" ? "var(--av-vigilance)" : orientation ? "var(--av-favorable)" : "var(--av-line-strong)"}`,
            boxShadow: "var(--av-shadow-soft)",
          }}
        >
          <span className="av-eyebrow">Lecture consolidée</span>
          <BadgePair orientation={orientation} solidity={solidity} size="md" />
          <span className="av-note av-tabular">{alertConvergence}</span>
          {orientationDetail ? <span className="av-note">{orientationDetail}</span> : null}
        </article>
        <MetricCard
          eyebrow="Verdict thèse"
          primary={thesisLabel}
          tone={thesisVerdict === "alert_dominant" ? "alert" : thesisVerdict === "vigilance" ? "info" : thesisVerdict === "contrasted" ? "vigilance" : thesisVerdict ? "favorable" : "neutral"}
          detail={thesisDetail}
        />
        <MetricCard
          eyebrow="Cohérence du deck"
          primary={coherenceLabel}
          tone={coherenceScore != null ? (coherenceScore >= 80 ? "favorable" : coherenceScore >= 60 ? "info" : coherenceScore >= 40 ? "vigilance" : "alert") : "neutral"}
          detail={coherenceDetail}
        />
        <MetricCard
          eyebrow="Couverture"
          primary={model.header.completedAgents != null && model.header.totalAgents != null ? `${Math.min(model.header.completedAgents, model.header.totalAgents)} / ${model.header.totalAgents}` : "—"}
          tone={completion.failedAgents.length === 0 ? "favorable" : completion.failedAgents.length <= 2 ? "vigilance" : "alert"}
          detail={`${completion.failedAgents.length} agent${completion.failedAgents.length > 1 ? "s" : ""} en échec${model.header.totalDurationMin != null ? ` · ${model.header.totalDurationMin} min` : ""}${model.header.totalCostUsd != null ? ` · $${model.header.totalCostUsd.toFixed(2)}` : ""}`}
        />
      </div>
    </div>
  );
}
