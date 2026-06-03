import { AgentCard } from "../atoms/agent-card";
import { EmptyAgentCard } from "../atoms/empty-agent-card";
import { PartialBanner } from "../atoms/partial-banner";
import type { SignalsSectionModel } from "../lib/selectors";

export function SignalsSection({ model }: { model: SignalsSectionModel }) {
  const totalCards = model.cards.length + model.emptyCards.length;
  return (
    <section id="signaux" className="flex scroll-mt-44 flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className="av-eyebrow">Section 3</span>
          <h2 className="av-h2">Signaux par dimension</h2>
          <p className="av-note">
            Chaque carte est une lentille analytique horizontale. {model.cards.length} sur {totalCards} ont produit un
            résultat exploitable. Les autres sont surfacées explicitement.
          </p>
        </div>
        {/* #17/#2 : légende des orientations pour distinguer les niveaux au-delà de la couleur. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--av-muted)]">
          {[
            { label: "Signaux favorables", color: "var(--av-favorable)" },
            { label: "Signaux contrastés", color: "var(--av-vigilance)" },
            { label: "Vigilance requise", color: "var(--av-info)" },
            { label: "Signaux d'alerte dominants", color: "var(--av-alert)" },
          ].map((o) => (
            <span key={o.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: o.color }} />
              {o.label}
            </span>
          ))}
        </div>
      </header>

      {model.cards.length === 0 ? (
        <PartialBanner tone="alert" title="Aucune lentille n'a produit de résultat exploitable">
          La page ne peut pas afficher de signaux par dimension.
        </PartialBanner>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {model.cards.map((c) => (
          <AgentCard key={c.agentLabel} signal={c} />
        ))}
        {model.emptyCards.map((ec) => (
          <EmptyAgentCard
            key={ec.agentLabel}
            agentLabel={ec.agentLabel}
            reason={ec.reason}
            errorMessage={ec.errorMessage}
          />
        ))}
        {!model.tier2.activated ? (
          <EmptyAgentCard agentLabel="Expert sectoriel" reason="not_activated" />
        ) : null}
      </div>
    </section>
  );
}
