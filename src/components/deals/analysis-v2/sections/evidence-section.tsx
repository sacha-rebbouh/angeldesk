import { EvidenceRow } from "../atoms/evidence-row";
import { PartialBanner } from "../atoms/partial-banner";
import type { EvidenceRowProps } from "../atoms/evidence-row";

export function EvidenceSection({ evidence }: { evidence: EvidenceRowProps[] }) {
  return (
    <section id="preuves" className="flex scroll-mt-44 flex-col gap-5">
      <header className="flex flex-col gap-1">
        <span className="av-eyebrow">Section 4</span>
        <h2 className="av-h2">Preuves consolidées</h2>
        <p className="av-note">
          Les affirmations critiques rattachées à leur source, leur fraîcheur, la solidité des preuves et le résultat
          de la cross-référence (vérifié, contredit, partiel). Une ligne = un claim sourçable.
        </p>
      </header>

      {evidence.length === 0 ? (
        <PartialBanner tone="info" title="Aucun élément de preuve consolidé">
          Les agents Tier 0 et Tier 3 n'ont produit aucun fait ni claim exploitable sur ce dossier.
        </PartialBanner>
      ) : (
        <div
          className="overflow-hidden rounded-xl bg-[var(--av-surface)]"
          style={{ border: "1px solid var(--av-line)", boxShadow: "var(--av-shadow-soft)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr>
                  <th className="bg-[var(--av-surface-muted)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    Affirmation
                  </th>
                  <th className="bg-[var(--av-surface-muted)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    Source
                  </th>
                  <th className="bg-[var(--av-surface-muted)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    Fraîcheur
                  </th>
                  <th className="bg-[var(--av-surface-muted)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    Solidité des preuves
                  </th>
                  <th className="bg-[var(--av-surface-muted)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    Lecture
                  </th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((row, idx) => (
                  <EvidenceRow key={`${row.claim}-${idx}`} {...row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="av-note">
        Chaque affirmation est rattachée à sa source documentaire. Les preuves sont listées dans leur ordre de
        production, pas par ordre de jugement.
      </p>
    </section>
  );
}
