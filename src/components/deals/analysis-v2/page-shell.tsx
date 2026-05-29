import "./tokens.css";

import { DecisionStrip } from "./decision-strip";
import { TabsNav } from "./tabs-nav";
import { ExportPdfButton } from "./export-pdf-button";
import { RelaunchAnalysisButton } from "./relaunch-analysis-button";
import { DecisionSection } from "./sections/decision-section";
import { ThesisSection } from "./sections/thesis-section";
import { SignalsSection } from "./sections/signals-section";
import { EvidenceSection } from "./sections/evidence-section";
import { MemoSection } from "./sections/memo-section";
import { PartialBanner } from "./atoms/partial-banner";
import type { AnalysisV2ViewModel } from "./lib/selectors";

type Props = {
  dealName: string;
  vm: AnalysisV2ViewModel;
  hideHeader?: boolean;
  dealId?: string;
};

const MODE_LABELS_FR: Record<string, string> = {
  full_analysis: "Deep Dive thèse-first",
  tier3_synthesis: "Synthèse Tier 3",
  tier2_sector: "Expert sectoriel",
  extraction: "Extraction documents",
};

function formatModeLabel(mode: string | null | undefined): string {
  if (!mode) return "";
  const key = mode.trim().toLowerCase();
  return MODE_LABELS_FR[key] ?? key.replace(/_/g, " ");
}

function HeaderBar({ dealName, vm }: Props) {
  const { header, coverage } = vm.decisionStrip;
  const modeLabel = formatModeLabel(header.mode);
  return (
    <header className="flex flex-col gap-2">
      <span className="av-eyebrow">Analyse complète{modeLabel ? ` · ${modeLabel}` : ""}</span>
      <h1 className="av-h1">{dealName}</h1>
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--av-muted)] av-tabular">
        {header.completedAt ? (
          <span>Analyse complétée le {header.completedAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</span>
        ) : null}
        {coverage.isThesisOnly ? (
          <span>· Thèse seule (Tier 1/3 non lancés)</span>
        ) : (
          <span>· {coverage.ok} / {coverage.total} agents aboutis</span>
        )}
        {coverage.incompleteAgents.length > 0 ? (
          <span>· {coverage.incompleteAgents.length} non aboutis</span>
        ) : null}
        {header.totalDurationMin != null ? <span>· {header.totalDurationMin} min de calcul</span> : null}
        {header.totalCostUsd != null ? <span>· ${header.totalCostUsd.toFixed(2)}</span> : null}
      </div>
    </header>
  );
}

export function AnalysisV2PageShell(props: Props) {
  // En mode embedded (hideHeader=true, ex: tab "Analyse IA" de /deals/[id]),
  // on supprime les marges négatives et min-h-screen qui font déborder le
  // composant hors de son conteneur parent (chevauche les onglets + breadcrumb).
  // Embedded : panel à coins arrondis avec padding, pour ne pas coller aux onglets parents.
  // Standalone (preview) : marges négatives pour pleine largeur + min-h-screen.
  const wrapperClass = props.hideHeader
    ? "analysis-v2 rounded-xl p-4 sm:p-6"
    : "analysis-v2 -m-4 min-h-screen p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8";
  return (
    <div className={wrapperClass}>
      <a href="#main" className="av-skip-link">Aller au contenu</a>
      <main id="main" className="mx-auto flex max-w-[1440px] flex-col gap-6">
        {props.hideHeader ? null : <HeaderBar {...props} />}
        {props.vm.decisionStrip.coverage.incompleteAgents.length > 0 ? (
          <PartialBanner tone="vigilance" title="Analyse incomplète">
            {props.vm.decisionStrip.coverage.incompleteAgents.length} agent
            {props.vm.decisionStrip.coverage.incompleteAgents.length > 1 ? "s n'ont" : " n'a"} pas abouti sur cette
            analyse : {props.vm.decisionStrip.coverage.incompleteAgents.map((a) => a.label).join(", ")}. Les signaux et
            le score consolidé ci-dessous sont donc partiels.
          </PartialBanner>
        ) : null}
        <DecisionStrip model={props.vm.decisionStrip} />
        <TabsNav
          rightSlot={
            props.dealId ? (
              <div className="flex items-center gap-2">
                <ExportPdfButton dealId={props.dealId} />
                <RelaunchAnalysisButton dealId={props.dealId} />
              </div>
            ) : undefined
          }
        />
        <DecisionSection model={props.vm.decisionSection} />
        <ThesisSection model={props.vm.thesisSection} />
        <SignalsSection model={props.vm.signalsSection} />
        <EvidenceSection evidence={props.vm.evidenceSection} />
        <MemoSection model={props.vm.memoSection} />
        <footer className="rounded-xl bg-[var(--av-surface-muted)] p-4 text-center text-[13px] text-[var(--av-muted)]">
          Angel Desk consolide signaux, preuves, contradictions et zones d'incertitude. Il ne décide pas à votre place.
        </footer>
      </main>
    </div>
  );
}
