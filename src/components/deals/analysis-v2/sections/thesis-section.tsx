import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";

import { PartialBanner } from "../atoms/partial-banner";
import { StatusPill } from "../atoms/status-pill";
import { capitalizeFirstMeaningfulChar } from "../lib/presentation";
import type { ThesisSectionModel } from "../lib/selectors";

// « declared » = annoncé par le fondateur, NON vérifié → c'est une zone
// d'incertitude, pas un état neutre. On le rend en tonalité vigilance (#12).
const STATUS_ICON = {
  declared: { icon: CircleDashed, label: "Déclaré · non vérifié", color: "var(--av-vigilance)" },
  verified: { icon: CheckCircle2, label: "Vérifié", color: "var(--av-favorable)" },
  contradicted: { icon: XCircle, label: "Contredit", color: "var(--av-alert)" },
};

function formatLargeNumbersInText(text: string): string {
  return text.replace(/\b(\d{7,})\b/g, (match) => {
    const n = Number(match);
    if (!Number.isFinite(n)) return match;
    if (n >= 1_000_000_000) {
      return `${(n / 1_000_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Md`;
    }
    if (n >= 1_000_000) {
      return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
    }
    return n.toLocaleString("fr-FR");
  });
}

export function ThesisSection({ model }: { model: ThesisSectionModel }) {
  return (
    <section id="these" className="flex scroll-mt-44 flex-col gap-5">
      <header className="flex flex-col gap-1">
        <span className="av-eyebrow">Section 2</span>
        <h2 className="av-h2">Thèse de l'investisseur</h2>
        <p className="av-note">
          Reformulation de la thèse, hypothèses porteuses et alertes structurelles. Le statut "réconcilié" indique si
          la thèse a été confrontée aux résultats des agents.
        </p>
      </header>

      {!model.reconciled && model.reconciliationReason ? (
        <PartialBanner tone="vigilance" title="Réconciliation thèse non effectuée">
          {model.reconciliationReason}
        </PartialBanner>
      ) : null}

      {model.reconciled && model.reconciliationDegraded ? (
        <PartialBanner tone="info" title="Réconciliation en mode déterministe">
          La synthèse rédigée par modèle était indisponible. Le verdict et les points de friction ci-dessous ont été
          établis à partir des signaux structurés des agents (plancher de verdict + contradictions), sans rédaction par
          un modèle.
        </PartialBanner>
      ) : null}

      {model.cards.length === 0 ? (
        <PartialBanner tone="info" title="Aucune thèse enregistrée">
          Le module thèse n'a pas produit de contenu pour ce dossier.
        </PartialBanner>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {model.cards.map((card) => (
            <article
              key={card.key}
              className="flex flex-col gap-2 rounded-xl bg-[var(--av-surface)] p-4"
              style={{ border: "1px solid var(--av-line)", boxShadow: "var(--av-shadow-soft)" }}
            >
              <span className="av-eyebrow">{card.title}</span>
              <p className="text-[14px] leading-relaxed text-[var(--av-ink)]">{capitalizeFirstMeaningfulChar(formatLargeNumbersInText(card.body))}</p>
            </article>
          ))}
        </div>
      )}

      {model.loadBearing.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="av-h3">Hypothèses porteuses</h3>
          <div
            className="overflow-hidden rounded-xl bg-[var(--av-surface)]"
            style={{ border: "1px solid var(--av-line)", boxShadow: "var(--av-shadow-soft)" }}
          >
            <ul className="divide-y" style={{ borderColor: "var(--av-line)" }}>
              {model.loadBearing.map((lb) => {
                const meta = STATUS_ICON[lb.status];
                const Icon = meta.icon;
                return (
                  <li key={lb.id} className="grid items-start gap-3 px-4 py-3 sm:grid-cols-[24px_minmax(0,1fr)_auto]">
                    <Icon size={18} aria-hidden="true" style={{ color: meta.color, marginTop: 2 }} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[var(--av-ink)]">{capitalizeFirstMeaningfulChar(formatLargeNumbersInText(lb.statement))}</p>
                      {lb.impact ? (
                        <p className="mt-1 text-[12px] text-[var(--av-muted)]">Impact : {formatLargeNumbersInText(lb.impact)}</p>
                      ) : null}
                      {lb.validationPath ? (
                        <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5 text-[12px] leading-relaxed text-[var(--av-ink)]">
                          <span
                            className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: "var(--av-vigilance)", background: "var(--av-vigilance-soft)", border: "1px solid var(--av-vigilance-edge)" }}
                          >
                            À vérifier
                          </span>
                          <span>{formatLargeNumbersInText(lb.validationPath)}</span>
                        </p>
                      ) : null}
                    </div>
                    <span
                      className="inline-flex h-fit items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: meta.color, border: `1px solid ${meta.color}40` }}
                    >
                      {meta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {model.alerts.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="av-h3">Alertes thèse</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {model.alerts.slice(0, 12).map((alert) => (
              <li key={alert.id}>
                <article
                  className="flex flex-col gap-1.5 rounded-xl bg-[var(--av-surface)] p-3"
                  style={{ border: "1px solid var(--av-line)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[14px] font-semibold leading-snug text-[var(--av-ink)]">{alert.title}</h4>
                    <StatusPill severity={alert.severity} label={alert.severityLabel} />
                  </div>
                  {alert.detail ? <p className="text-[12px] leading-relaxed text-[var(--av-muted)]">{formatLargeNumbersInText(alert.detail)}</p> : null}
                  {alert.category ? (
                    <span className="inline-flex w-fit items-center rounded-md bg-[var(--av-surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--av-muted)]" style={{ border: "1px solid var(--av-line)" }}>
                      {alert.category}
                    </span>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
