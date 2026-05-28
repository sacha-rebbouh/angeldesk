import "./tokens.css";

import { DecisionStrip } from "./decision-strip";
import { TabsNav } from "./tabs-nav";
import { DecisionSection } from "./sections/decision-section";
import { ThesisSection } from "./sections/thesis-section";
import { SignalsSection } from "./sections/signals-section";
import { EvidenceSection } from "./sections/evidence-section";
import { MemoSection } from "./sections/memo-section";
import type { AnalysisV2ViewModel } from "./lib/selectors";

type Props = {
  dealName: string;
  vm: AnalysisV2ViewModel;
};

function HeaderBar({ dealName, vm }: Props) {
  const { header, completion } = vm.decisionStrip;
  return (
    <header className="flex flex-col gap-2">
      <span className="av-eyebrow">Analyse complète {header.mode ? `· ${header.mode.replace(/_/g, " ")}` : ""}</span>
      <h1 className="av-h1">{dealName}</h1>
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--av-muted)] av-tabular">
        {header.completedAt ? (
          <span>Analyse complétée le {header.completedAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</span>
        ) : null}
        {header.completedAgents != null && header.totalAgents != null ? (
          <span>· {header.completedAgents} / {header.totalAgents} agents exploitables</span>
        ) : null}
        {completion.failedAgents.length > 0 ? (
          <span>· {completion.failedAgents.length} en échec</span>
        ) : null}
        {header.totalDurationMin != null ? <span>· {header.totalDurationMin} min de calcul</span> : null}
        {header.totalCostUsd != null ? <span>· ${header.totalCostUsd.toFixed(2)}</span> : null}
      </div>
    </header>
  );
}

export function AnalysisV2PageShell(props: Props) {
  return (
    <div className="analysis-v2 -m-4 min-h-screen p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <a href="#main" className="av-skip-link">Aller au contenu</a>
      <main id="main" className="mx-auto flex max-w-[1440px] flex-col gap-6">
        <HeaderBar {...props} />
        <DecisionStrip model={props.vm.decisionStrip} />
        <TabsNav />
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
