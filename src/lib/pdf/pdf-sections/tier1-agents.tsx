/**
 * Tier 1 Agents Section — 13 investigation agents with specific renderers
 */

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles as gs } from "../pdf-theme";
import {
  PdfPage,
  SectionTitle,
  SubsectionTitle,
  H3,
  BulletList,
  LabelValue,
  PdfTable,
  Spacer,
  BodyText,
} from "../pdf-components";
import { s, sup, formatValue, fmtPct, fmtWeight } from "../pdf-helpers";
import { AGENT_DISPLAY_NAMES } from "@/lib/format-utils";
import { ALERT_SIGNAL_LABELS } from "@/lib/ui-configs";
import type { AgentResult } from "../generate-analysis-pdf";

export function Tier1AgentsSection({
  tier1Results,
  dealName,
}: {
  tier1Results: Record<string, AgentResult>;
  dealName: string;
}) {
  if (Object.keys(tier1Results).length === 0) return null;

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Investigation (Tier 1)</SectionTitle>

      {Object.entries(tier1Results).map(([agentName, result]) => {
        if (!result.success || !result.data) return null;
        return (
          <AgentBlock key={agentName} agentName={agentName} result={result} />
        );
      })}
    </PdfPage>
  );
}

function AgentBlock({
  agentName,
  result,
}: {
  agentName: string;
  result: AgentResult;
}) {
  const displayName = AGENT_DISPLAY_NAMES[agentName] ?? agentName;
  const data = result.data as Record<string, unknown>;

  const meta = data.meta as {
    dataCompleteness?: string;
    confidenceLevel?: number;
    limitations?: string[];
  } | undefined;

  const score = data.score as {
    value?: number;
    grade?: string;
    rationale?: string;
    breakdown?: Array<{
      criterion?: string;
      weight?: number;
      score?: number;
      justification?: string;
    }>;
  } | undefined;

  const narrative = data.narrative as {
    oneLiner?: string;
    summary?: string;
    keyInsights?: string[];
    forNegotiation?: string[];
  } | undefined;

  const findings = data.findings as Record<string, unknown> | undefined;
  const alert = data.alertSignal as {
    recommendation?: string;
    justification?: string;
    hasBlocker?: boolean;
  } | undefined;

  const dbRef = data.dbCrossReference as {
    claims?: Array<{
      claim?: string;
      dbVerdict?: string;
      evidence?: string;
    }>;
    hiddenCompetitors?: string[];
  } | undefined;

  const redFlags = data.redFlags as Array<{
    id?: string;
    severity?: string;
    title?: string;
    description?: string;
    evidence?: string;
    impact?: string;
    question?: string;
    location?: string;
  }> | undefined;

  const questions = data.questions as Array<{
    question: string;
    priority?: string;
    whatToLookFor?: string;
  }> | undefined;

  return (
    <View>
      <SubsectionTitle>{displayName}</SubsectionTitle>

      {/* Meta */}
      {meta && (
        <Text style={gs.small}>
          {[
            meta.dataCompleteness ? `Données: ${meta.dataCompleteness}` : null,
            typeof meta.confidenceLevel === "number"
              ? `Confiance: ${meta.confidenceLevel}%`
              : null,
          ]
            .filter(Boolean)
            .join(" | ")}
        </Text>
      )}

      {/* Score */}
      {score?.value !== undefined && (
        <>
          <LabelValue
            label="Score"
            value={`${score.value}/100 (${score.grade ?? "N/A"})`}
          />
          {score.rationale && (
            <Text style={[gs.small, { marginBottom: 4 }]}>
              {score.rationale}
            </Text>
          )}
          {score.breakdown && score.breakdown.length > 0 && (
            <PdfTable
              columns={[
                { header: "Critère", width: 20 },
                { header: "Poids", width: 10 },
                { header: "Score", width: 10 },
                { header: "Justification", width: 60 },
              ]}
              rows={score.breakdown.map((b) => [
                s(b.criterion),
                fmtWeight(b.weight),
                b.score !== undefined ? `${b.score}/100` : "N/A",
                s(b.justification),
              ])}
            />
          )}
        </>
      )}

      {/* Narrative */}
      {narrative?.oneLiner && (
        <Text style={[gs.bodyBold, { marginBottom: 2 }]}>
          {narrative.oneLiner}
        </Text>
      )}
      {narrative?.summary && (
        <BodyText>{narrative.summary}</BodyText>
      )}
      {narrative?.keyInsights && narrative.keyInsights.length > 0 && (
        <>
          <H3>Insights clés</H3>
          <BulletList items={narrative.keyInsights} />
        </>
      )}

      {/* Agent-specific findings */}
      {findings && (
        <AgentFindings agentName={agentName} findings={findings} />
      )}

      {/* Alert signal */}
      {alert && (
        <LabelValue
          label="Signal"
          value={`${ALERT_SIGNAL_LABELS[alert.recommendation ?? ""] ?? alert.recommendation?.replace(/_/g, " ") ?? "N/A"}${alert.hasBlocker ? " (BLOQUANT)" : ""}`}
        />
      )}
      {alert?.justification && <BodyText>{alert.justification}</BodyText>}

      {/* DB cross-reference */}
      {dbRef?.claims && dbRef.claims.length > 0 && (
        <>
          <H3>Vérification DB</H3>
          <PdfTable
            columns={[
              { header: "Claim", width: 35 },
              { header: "Verdict DB", width: 20 },
              { header: "Evidence", width: 45 },
            ]}
            rows={dbRef.claims
              .slice(0, 6)
              .map((c) => [s(c.claim), s(c.dbVerdict), s(c.evidence)])}
          />
        </>
      )}
      {dbRef?.hiddenCompetitors && dbRef.hiddenCompetitors.length > 0 && (
        <LabelValue
          label="Concurrents cachés (DB)"
          value={dbRef.hiddenCompetitors.join(", ")}
        />
      )}

      {/* Red flags */}
      {redFlags && redFlags.length > 0 && (
        <>
          <H3>Red Flags</H3>
          <PdfTable
            columns={[
              { header: "Flag", width: 30 },
              { header: "Sévérité", width: 12 },
              { header: "Evidence", width: 30 },
              { header: "Impact", width: 28 },
            ]}
            rows={redFlags.slice(0, 12).map((rf) => [
              rf.title ?? rf.description ?? "N/A",
              rf.severity ?? "N/A",
              rf.evidence ?? "",
              rf.impact ?? "",
            ])}
          />
          {redFlags
            .filter(
              (rf) => rf.severity === "CRITICAL" || rf.severity === "HIGH"
            )
            .slice(0, 5)
            .map(
              (rf, i) =>
                (rf.question || rf.description) && (
                  <View key={i} style={{ marginBottom: 4 }} wrap={false}>
                    <Text style={gs.bodyBold}>
                      {rf.title ?? "Red Flag"} [{s(rf.severity)}]
                    </Text>
                    {rf.description && <BodyText>{rf.description}</BodyText>}
                    {rf.location && (
                      <LabelValue label="Localisation" value={rf.location} />
                    )}
                    {rf.question && (
                      <LabelValue label="Question à poser" value={rf.question} />
                    )}
                  </View>
                )
            )}
        </>
      )}

      {/* Questions */}
      {questions && questions.length > 0 && (
        <>
          <H3>Questions</H3>
          <BulletList
            items={questions.map((q) => {
              let line = `[${q.priority ?? "MEDIUM"}] ${q.question}`;
              if (q.whatToLookFor)
                line += ` → Surveiller: ${q.whatToLookFor}`;
              return line;
            })}
          />
        </>
      )}

      {/* Meta limitations */}
      {meta?.limitations && meta.limitations.length > 0 && (
        <>
          <H3>Limitations</H3>
          <BulletList items={meta.limitations.slice(0, 4)} />
        </>
      )}

      {/* Negotiation arguments */}
      {narrative?.forNegotiation && narrative.forNegotiation.length > 0 && (
        <>
          <H3>Arguments pour négociation</H3>
          <BulletList items={narrative.forNegotiation} />
        </>
      )}

      <Spacer />
    </View>
  );
}

// ==========================================================================
// Agent-specific findings renderers
// ==========================================================================

function AgentFindings({
  agentName,
  findings,
}: {
  agentName: string;
  findings: Record<string, unknown>;
}) {
  switch (agentName) {
    case "financial-auditor":
      return <FinancialFindings f={findings} />;
    case "team-investigator":
      return <TeamFindings f={findings} />;
    case "competitive-intel":
      return <CompetitiveFindings f={findings} />;
    case "deck-forensics":
      return <DeckForensicsFindings f={findings} />;
    case "market-intelligence":
      return <MarketFindings f={findings} />;
    case "exit-strategist":
      return <ExitFindings f={findings} />;
    case "tech-stack-dd":
      return <TechStackFindings f={findings} />;
    case "tech-ops-dd":
      return <TechOpsFindings f={findings} />;
    case "legal-regulatory":
      return <LegalFindings f={findings} />;
    case "cap-table-auditor":
      return <CapTableFindings f={findings} />;
    case "gtm-analyst":
      return <GtmFindings f={findings} />;
    case "customer-intel":
      return <CustomerFindings f={findings} />;
    default:
      return null;
  }
}

// --- Financial Auditor ---

function FinancialFindings({ f }: { f: Record<string, unknown> }) {
  const val = f.valuation as {
    verdict?: string;
    benchmarkMultiple?: number;
    calculatedMultiple?: number;
    rationale?: string;
  } | undefined;
  const metrics = f.metrics as Array<{
    name?: string;
    metricName?: string;
    value?: unknown;
    benchmark?: string;
    status?: string;
  }> | undefined;
  const ue = f.unitEconomics as {
    ltvCacRatio?: number;
    paybackMonths?: number;
    assessment?: string;
  } | undefined;
  const projections = f.projections as {
    realistic?: boolean;
    assumptions?: string[];
    concerns?: string[];
  } | undefined;
  const burn = f.burn as {
    monthlyBurn?: number;
    runway?: number;
    burnMultiple?: number;
    efficiency?: string;
    assessment?: string;
  } | undefined;

  return (
    <>
      {val && (
        <>
          <H3>Analyse de valorisation</H3>
          {val.verdict && (
            <LabelValue label="Verdict" value={sup(val.verdict)} />
          )}
          {val.calculatedMultiple !== undefined && (
            <LabelValue
              label="Multiple calculé"
              value={`${val.calculatedMultiple}x`}
            />
          )}
          {val.benchmarkMultiple !== undefined && (
            <LabelValue
              label="Multiple benchmark"
              value={`${val.benchmarkMultiple}x`}
            />
          )}
          {val.rationale && <BodyText>{val.rationale}</BodyText>}
        </>
      )}
      {metrics && metrics.length > 0 && (
        <>
          <H3>Métriques financières</H3>
          <PdfTable
            columns={[
              { header: "Métrique", width: 25 },
              { header: "Valeur", width: 20 },
              { header: "Benchmark", width: 30 },
              { header: "Statut", width: 25 },
            ]}
            rows={metrics
              .slice(0, 10)
              .map((m) => [
                s(m.name ?? m.metricName),
                s(m.value),
                s(m.benchmark),
                s(m.status),
              ])}
          />
        </>
      )}
      {ue && (
        <>
          <H3>Unit Economics</H3>
          {ue.ltvCacRatio !== undefined && (
            <LabelValue label="LTV:CAC" value={`${ue.ltvCacRatio}`} />
          )}
          {ue.paybackMonths !== undefined && (
            <LabelValue label="Payback" value={`${ue.paybackMonths} mois`} />
          )}
          {ue.assessment && (
            <LabelValue label="Évaluation" value={ue.assessment} />
          )}
        </>
      )}
      {projections && (
        <>
          <H3>Projections</H3>
          <LabelValue
            label="Réalistes"
            value={projections.realistic ? "OUI" : "NON"}
          />
          {projections.assumptions && projections.assumptions.length > 0 && (
            <BulletList items={projections.assumptions.slice(0, 5)} />
          )}
          {projections.concerns && projections.concerns.length > 0 && (
            <BulletList items={projections.concerns.slice(0, 5)} />
          )}
        </>
      )}
      {burn && (
        <>
          <H3>Burn &amp; Runway</H3>
          {burn.monthlyBurn !== undefined && (
            <LabelValue
              label="Burn mensuel"
              value={`${(burn.monthlyBurn / 1000).toFixed(0)}K€`}
            />
          )}
          {burn.runway !== undefined && (
            <LabelValue label="Runway" value={`${burn.runway} mois`} />
          )}
          {burn.burnMultiple !== undefined && (
            <LabelValue
              label="Burn Multiple"
              value={`${burn.burnMultiple.toFixed(1)}`}
            />
          )}
          {burn.efficiency && (
            <LabelValue
              label="Efficacité"
              value={sup(burn.efficiency)}
            />
          )}
        </>
      )}
    </>
  );
}

// --- Team Investigator ---

function TeamFindings({ f }: { f: Record<string, unknown> }) {
  const profiles = f.founderProfiles as Array<{
    name?: string;
    domainExpertise?: string;
    entrepreneurialExperience?: number;
    score?: number;
  }> | undefined;
  const comp = f.teamComposition as {
    teamSize?: number;
    complementarityScore?: number;
    gaps?: unknown[];
    keyHires?: unknown[];
  } | undefined;
  const dyn = f.cofounderDynamics as {
    equitySplitAssessment?: string;
    relationshipStrength?: string;
  } | undefined;

  return (
    <>
      {profiles && profiles.length > 0 && (
        <>
          <H3>Profils fondateurs</H3>
          <PdfTable
            columns={[
              { header: "Fondateur", width: 25 },
              { header: "Expertise", width: 30 },
              { header: "Exp. entrepreneuriale", width: 25 },
              { header: "Score", width: 20 },
            ]}
            rows={profiles.slice(0, 5).map((p) => [
              s(p.name),
              s(p.domainExpertise),
              p.entrepreneurialExperience !== undefined
                ? `${p.entrepreneurialExperience}/100`
                : "N/A",
              p.score !== undefined ? `${p.score}/100` : "N/A",
            ])}
          />
        </>
      )}
      {comp && (
        <>
          <H3>Composition équipe</H3>
          {comp.teamSize != null && (
            <LabelValue label="Taille" value={String(comp.teamSize)} />
          )}
          {comp.complementarityScore !== undefined && (
            <LabelValue
              label="Complémentarité"
              value={`${comp.complementarityScore}/100`}
            />
          )}
          {comp.gaps && comp.gaps.length > 0 && (
            <LabelValue
              label="Postes manquants"
              value={comp.gaps.map((g) => formatValue(g)).join(", ")}
            />
          )}
          {comp.keyHires && comp.keyHires.length > 0 && (
            <LabelValue
              label="Recrutements clés"
              value={comp.keyHires.map((h) => formatValue(h)).join(", ")}
            />
          )}
        </>
      )}
      {dyn && (
        <>
          {dyn.equitySplitAssessment && (
            <LabelValue
              label="Répartition equity"
              value={dyn.equitySplitAssessment}
            />
          )}
          {dyn.relationshipStrength && (
            <LabelValue
              label="Solidité relation"
              value={dyn.relationshipStrength}
            />
          )}
        </>
      )}
    </>
  );
}

// --- Competitive Intel ---

function CompetitiveFindings({ f }: { f: Record<string, unknown> }) {
  const comps = f.competitors as Array<{
    name?: string;
    funding?: string;
    threatLevel?: string;
    differentiation?: string;
  }> | undefined;
  const moat = f.moatAnalysis as {
    primaryMoat?: string;
    overallStrength?: string;
    moatVerdict?: string;
  } | undefined;
  const market = f.marketStructure as {
    concentration?: string;
    entryBarriers?: string;
  } | undefined;
  const missed = f.competitorsMissedInDeck as unknown[] | undefined;

  return (
    <>
      {comps && comps.length > 0 && (
        <>
          <H3>Concurrents identifiés</H3>
          <PdfTable
            columns={[
              { header: "Concurrent", width: 20 },
              { header: "Funding", width: 20 },
              { header: "Menace", width: 15 },
              { header: "Différentiation", width: 45 },
            ]}
            rows={comps
              .slice(0, 8)
              .map((c) => [
                s(c.name),
                s(c.funding),
                s(c.threatLevel),
                s(c.differentiation),
              ])}
          />
        </>
      )}
      {moat && (
        <>
          <H3>Analyse du moat</H3>
          {moat.moatVerdict && (
            <LabelValue
              label="Verdict"
              value={sup(moat.moatVerdict).replace(/_/g, " ")}
            />
          )}
          {moat.primaryMoat && (
            <LabelValue label="Moat principal" value={moat.primaryMoat} />
          )}
          {moat.overallStrength && (
            <LabelValue label="Force globale" value={moat.overallStrength} />
          )}
        </>
      )}
      {market && (
        <>
          {market.concentration && (
            <LabelValue label="Structure marché" value={market.concentration} />
          )}
          {market.entryBarriers && (
            <LabelValue label="Barrières entrée" value={market.entryBarriers} />
          )}
        </>
      )}
      {missed && missed.length > 0 && (
        <LabelValue
          label="Concurrents omis du deck"
          value={missed.map((m) => formatValue(m)).join(", ")}
        />
      )}
    </>
  );
}

// --- Deck Forensics ---

function DeckForensicsFindings({ f }: { f: Record<string, unknown> }) {
  const narr = f.narrativeAnalysis as {
    storyCoherence?: number;
    credibilityAssessment?: string;
    criticalMissingInfo?: Array<{ info?: string; whyItMatters?: string }>;
  } | undefined;
  const claims = f.claimVerification as Array<{
    claim?: string;
    status?: string;
    evidence?: string;
  }> | undefined;
  const inconsistencies = f.inconsistencies as Array<{
    issue?: string;
    location1?: string;
    location2?: string;
    severity?: string;
  }> | undefined;
  const quality = f.deckQuality as {
    professionalism?: number;
    completeness?: number;
    transparency?: number;
    issues?: string[];
  } | undefined;

  return (
    <>
      {narr && (
        <>
          {narr.storyCoherence !== undefined && (
            <LabelValue
              label="Cohérence narrative"
              value={`${narr.storyCoherence}/100`}
            />
          )}
          {narr.credibilityAssessment && (
            <LabelValue
              label="Crédibilité"
              value={narr.credibilityAssessment}
            />
          )}
        </>
      )}
      {claims && claims.length > 0 && (
        <>
          <H3>Vérification des claims</H3>
          <PdfTable
            columns={[
              { header: "Claim", width: 35 },
              { header: "Statut", width: 20 },
              { header: "Evidence", width: 45 },
            ]}
            rows={claims
              .slice(0, 10)
              .map((c) => [s(c.claim), s(c.status), s(c.evidence)])}
          />
        </>
      )}
      {inconsistencies && inconsistencies.length > 0 && (
        <>
          <H3>Inconsistances détectées</H3>
          <PdfTable
            columns={[
              { header: "Problème", width: 40 },
              { header: "Ref. 1", width: 20 },
              { header: "Ref. 2", width: 20 },
              { header: "Sévérité", width: 20 },
            ]}
            rows={inconsistencies
              .slice(0, 10)
              .map((i) => [
                s(i.issue),
                s(i.location1),
                s(i.location2),
                s(i.severity),
              ])}
          />
        </>
      )}
      {quality && (
        <>
          <H3>Qualité du deck</H3>
          {quality.professionalism !== undefined && (
            <LabelValue
              label="Professionnalisme"
              value={`${quality.professionalism}/100`}
            />
          )}
          {quality.completeness !== undefined && (
            <LabelValue
              label="Complétude"
              value={`${quality.completeness}/100`}
            />
          )}
          {quality.transparency !== undefined && (
            <LabelValue
              label="Transparence"
              value={`${quality.transparency}/100`}
            />
          )}
          {quality.issues && quality.issues.length > 0 && (
            <BulletList items={quality.issues.slice(0, 5)} />
          )}
        </>
      )}
      {narr?.criticalMissingInfo && narr.criticalMissingInfo.length > 0 && (
        <>
          <H3>Informations critiques manquantes</H3>
          <BulletList
            items={narr.criticalMissingInfo
              .slice(0, 5)
              .map((m) => `${s(m.info)} — ${s(m.whyItMatters)}`)}
          />
        </>
      )}
    </>
  );
}

// --- Market Intelligence ---

function MarketFindings({ f }: { f: Record<string, unknown> }) {
  const market = f.marketSize as {
    tam?: { claimed?: number; validated?: number; source?: string };
    sam?: { claimed?: number; validated?: number };
    som?: { claimed?: number; validated?: number };
    discrepancyLevel?: string;
  } | undefined;
  const trends = f.fundingTrends as {
    trend?: string;
    volume?: string;
    dealCount?: unknown;
  } | undefined;
  const timing = f.timing as {
    assessment?: string;
    windowRemaining?: string;
  } | undefined;

  const fmtB = (v: number | undefined) =>
    v ? `${(v / 1_000_000_000).toFixed(1)}B$` : "N/A";

  return (
    <>
      {market && (
        <>
          <H3>Taille de marché (TAM/SAM/SOM)</H3>
          <PdfTable
            columns={[
              { header: "Segment", width: 15 },
              { header: "Annoncé", width: 25 },
              { header: "Validé", width: 25 },
              { header: "Source", width: 35 },
            ]}
            rows={[
              ...(market.tam
                ? [
                    [
                      "TAM",
                      fmtB(market.tam.claimed),
                      fmtB(market.tam.validated),
                      s(market.tam.source),
                    ],
                  ]
                : []),
              ...(market.sam
                ? [
                    [
                      "SAM",
                      fmtB(market.sam.claimed),
                      fmtB(market.sam.validated),
                      "",
                    ],
                  ]
                : []),
              ...(market.som
                ? [
                    [
                      "SOM",
                      fmtB(market.som.claimed),
                      fmtB(market.som.validated),
                      "",
                    ],
                  ]
                : []),
            ]}
          />
          {market.discrepancyLevel && (
            <LabelValue label="Écart" value={market.discrepancyLevel} />
          )}
        </>
      )}
      {trends && (
        <>
          <H3>Tendances de funding</H3>
          {trends.trend && (
            <LabelValue
              label="Tendance"
              value={
                typeof trends.trend === "string"
                  ? sup(trends.trend)
                  : formatValue(trends.trend)
              }
            />
          )}
          {trends.dealCount != null && (
            <LabelValue
              label="Nombre de deals"
              value={formatValue(trends.dealCount)}
            />
          )}
        </>
      )}
      {timing && (
        <>
          {timing.assessment && (
            <LabelValue
              label="Timing marché"
              value={sup(timing.assessment)}
            />
          )}
          {timing.windowRemaining && (
            <LabelValue
              label="Fenêtre restante"
              value={timing.windowRemaining}
            />
          )}
        </>
      )}
    </>
  );
}

// --- Exit Strategist ---

function ExitFindings({ f }: { f: Record<string, unknown> }) {
  const exitScenarios = f.scenarios as Array<{
    type?: string;
    probability?: number;
    timeline?: string;
    exitValuation?: number;
    investorReturn?: { multiple?: number; irr?: number };
  }> | undefined;
  const comparables = f.comparableExits as Array<{
    company?: string;
    exitValue?: string;
    multiple?: number;
    relevance?: number;
  }> | undefined;
  const ret = f.returnSummary as {
    expectedMultiple?: number;
    expectedIrr?: number;
    downsideMultiple?: number;
    upsideMultiple?: number;
  } | undefined;
  const mna = f.mnaMarket as { activity?: unknown; exitWindow?: string } | undefined;
  const liquidity = f.liquidity as {
    secondaryMarket?: string;
    timeToLiquidity?: string;
    liquidityRisk?: string;
  } | undefined;
  const strategic = f.strategicPositioning as {
    acquirability?: string;
    strategicValue?: string;
    synergies?: string[];
  } | undefined;

  return (
    <>
      {exitScenarios && exitScenarios.length > 0 && (
        <>
          <H3>Scénarios de sortie</H3>
          <PdfTable
            columns={[
              { header: "Type", width: 20 },
              { header: "Prob.", width: 12 },
              { header: "Timeline", width: 18 },
              { header: "Valo exit", width: 18 },
              { header: "Multiple", width: 16 },
              { header: "IRR", width: 16 },
            ]}
            rows={exitScenarios.slice(0, 6).map((sc) => [
              s(sc.type),
              fmtPct(sc.probability),
              formatValue(sc.timeline),
              typeof sc.exitValuation === "number"
                ? `${(sc.exitValuation / 1_000_000).toFixed(0)}M`
                : s(sc.exitValuation),
              sc.investorReturn?.multiple !== undefined
                ? `${sc.investorReturn.multiple.toFixed(1)}x`
                : "N/A",
              sc.investorReturn?.irr !== undefined
                ? `${sc.investorReturn.irr.toFixed(1)}%`
                : "N/A",
            ])}
          />
        </>
      )}
      {comparables && comparables.length > 0 && (
        <>
          <H3>Exits comparables</H3>
          <PdfTable
            columns={[
              { header: "Entreprise", width: 30 },
              { header: "Valeur exit", width: 25 },
              { header: "Multiple", width: 20 },
              { header: "Pertinence", width: 25 },
            ]}
            rows={comparables.slice(0, 5).map((c) => [
              s(c.company),
              s(c.exitValue),
              typeof c.multiple === "number" ? `${c.multiple}x` : s(c.multiple),
              fmtPct(c.relevance),
            ])}
          />
        </>
      )}
      {ret && (
        <>
          <H3>Résumé des retours</H3>
          {ret.expectedMultiple !== undefined && (
            <LabelValue
              label="Multiple attendu"
              value={`${ret.expectedMultiple.toFixed(1)}x`}
            />
          )}
          {ret.expectedIrr !== undefined && (
            <LabelValue
              label="IRR attendu"
              value={`${ret.expectedIrr.toFixed(1)}%`}
            />
          )}
          {ret.downsideMultiple !== undefined && (
            <LabelValue
              label="Downside"
              value={`${ret.downsideMultiple.toFixed(1)}x`}
            />
          )}
          {ret.upsideMultiple !== undefined && (
            <LabelValue
              label="Upside"
              value={`${ret.upsideMultiple.toFixed(1)}x`}
            />
          )}
        </>
      )}
      {mna && (
        <>
          {mna.activity && (
            <LabelValue
              label="Activité M&A"
              value={formatValue(mna.activity)}
            />
          )}
          {mna.exitWindow && (
            <LabelValue label="Fenêtre exit" value={mna.exitWindow} />
          )}
        </>
      )}
      {liquidity && (
        <>
          <H3>Liquidité</H3>
          {liquidity.secondaryMarket && (
            <LabelValue
              label="Marché secondaire"
              value={liquidity.secondaryMarket}
            />
          )}
          {liquidity.timeToLiquidity && (
            <LabelValue
              label="Délai liquidité"
              value={liquidity.timeToLiquidity}
            />
          )}
          {liquidity.liquidityRisk && (
            <LabelValue
              label="Risque liquidité"
              value={sup(liquidity.liquidityRisk)}
            />
          )}
        </>
      )}
      {strategic && (
        <>
          {strategic.acquirability && (
            <LabelValue
              label="Acquirabilité"
              value={sup(strategic.acquirability)}
            />
          )}
          {strategic.synergies && strategic.synergies.length > 0 && (
            <BulletList items={strategic.synergies.slice(0, 4)} />
          )}
        </>
      )}
    </>
  );
}

// --- Tech Stack DD ---

function TechStackFindings({ f }: { f: Record<string, unknown> }) {
  const stack = f.techStack as Record<string, unknown> | undefined;
  const scale = f.scalability as Record<string, unknown> | undefined;
  const debt = f.technicalDebt as Record<string, unknown> | undefined;
  const techRisks = f.technicalRisks as Array<{
    risk?: string;
    category?: string;
    severity?: string;
    probability?: string;
    mitigation?: string;
  }> | undefined;

  return (
    <>
      {stack && (
        <>
          <H3>Stack technique</H3>
          {stack.modernityScore !== undefined && (
            <LabelValue
              label="Score modernité"
              value={`${stack.modernityScore}/100`}
            />
          )}
          {stack.frontend && (
            <LabelValue label="Frontend" value={formatValue(stack.frontend)} />
          )}
          {stack.backend && (
            <LabelValue label="Backend" value={formatValue(stack.backend)} />
          )}
          {stack.infrastructure && (
            <LabelValue
              label="Infrastructure"
              value={formatValue(stack.infrastructure)}
            />
          )}
        </>
      )}
      {scale && (
        <>
          {scale.score !== undefined && (
            <LabelValue
              label="Score scalabilité"
              value={`${scale.score}/100`}
            />
          )}
          {scale.x10Readiness && (
            <LabelValue
              label="Prêt x10"
              value={formatValue(scale.x10Readiness)}
            />
          )}
          {Array.isArray(scale.bottlenecks) &&
            scale.bottlenecks.length > 0 && (
              <LabelValue
                label="Goulots"
                value={scale.bottlenecks
                  .map((b: unknown) => formatValue(b))
                  .join("; ")}
              />
            )}
        </>
      )}
      {debt?.debtLevel && (
        <LabelValue
          label="Dette technique"
          value={sup(debt.debtLevel)}
        />
      )}
      {techRisks && techRisks.length > 0 && (
        <>
          <H3>Risques techniques</H3>
          <PdfTable
            columns={[
              { header: "Risque", width: 30 },
              { header: "Catégorie", width: 15 },
              { header: "Sévérité", width: 12 },
              { header: "Prob.", width: 12 },
              { header: "Mitigation", width: 31 },
            ]}
            rows={techRisks.slice(0, 8).map((r) => [
              s(r.risk),
              s(r.category),
              s(r.severity),
              s(r.probability),
              s(r.mitigation),
            ])}
          />
        </>
      )}
    </>
  );
}

// --- Tech Ops DD ---

function TechOpsFindings({ f }: { f: Record<string, unknown> }) {
  const maturity = f.productMaturity as Record<string, unknown> | undefined;
  const security = f.security as Record<string, unknown> | undefined;
  const ip = f.ipProtection as Record<string, unknown> | undefined;
  const team = f.teamCapability as Record<string, unknown> | undefined;
  const techRisks = f.technicalRisks as Array<{
    risk?: string;
    category?: string;
    severity?: string;
    mitigation?: string;
  }> | undefined;

  return (
    <>
      {maturity && (
        <>
          {maturity.stage && (
            <LabelValue
              label="Stade produit"
              value={sup(maturity.stage)}
            />
          )}
          {maturity.stabilityScore !== undefined && (
            <LabelValue
              label="Score stabilité"
              value={`${maturity.stabilityScore}/100`}
            />
          )}
        </>
      )}
      {security && (
        <>
          {security.posture && (
            <LabelValue
              label="Posture sécurité"
              value={sup(security.posture)}
            />
          )}
          {security.securityScore !== undefined && (
            <LabelValue
              label="Score sécurité"
              value={`${security.securityScore}/100`}
            />
          )}
          {Array.isArray(security.compliance) &&
            security.compliance.length > 0 && (
              <LabelValue
                label="Conformité"
                value={security.compliance
                  .map((c: unknown) => formatValue(c))
                  .join(", ")}
              />
            )}
        </>
      )}
      {ip && (
        <>
          {ip.ipScore !== undefined && (
            <LabelValue label="Score IP" value={`${ip.ipScore}/100`} />
          )}
          {ip.patents !== undefined && (
            <LabelValue label="Brevets" value={formatValue(ip.patents)} />
          )}
        </>
      )}
      {team && (
        <>
          {team.capabilityScore !== undefined && (
            <LabelValue
              label="Score équipe tech"
              value={`${team.capabilityScore}/100`}
            />
          )}
          {Array.isArray(team.gaps) && team.gaps.length > 0 && (
            <LabelValue
              label="Gaps équipe"
              value={team.gaps
                .map((g: unknown) => formatValue(g))
                .join(", ")}
            />
          )}
        </>
      )}
      {techRisks && techRisks.length > 0 && (
        <>
          <H3>Risques techniques (ops)</H3>
          <PdfTable
            columns={[
              { header: "Risque", width: 35 },
              { header: "Catégorie", width: 15 },
              { header: "Sévérité", width: 12 },
              { header: "Mitigation", width: 38 },
            ]}
            rows={techRisks
              .slice(0, 8)
              .map((r) => [
                s(r.risk),
                s(r.category),
                s(r.severity),
                s(r.mitigation),
              ])}
          />
        </>
      )}
    </>
  );
}

// --- Legal Regulatory ---

function LegalFindings({ f }: { f: Record<string, unknown> }) {
  const structure = f.structureAnalysis as {
    entityType?: string;
    jurisdiction?: string;
    appropriateness?: string;
    vestingInPlace?: boolean;
    shareholderAgreement?: string;
    concerns?: string[];
  } | undefined;
  const compliance = f.compliance as Array<{
    area?: string;
    status?: string;
    riskLevel?: string;
  }> | undefined;
  const upcoming = f.upcomingRegulations as Array<{
    regulation?: string;
    effectiveDate?: string;
    impact?: string;
    preparedness?: string;
  }> | undefined;

  return (
    <>
      {structure && (
        <>
          <H3>Structure juridique</H3>
          {structure.entityType && (
            <LabelValue label="Type d'entité" value={structure.entityType} />
          )}
          {structure.jurisdiction && (
            <LabelValue label="Juridiction" value={structure.jurisdiction} />
          )}
          {structure.appropriateness && (
            <LabelValue
              label="Adéquation"
              value={structure.appropriateness.replace(/_/g, " ")}
            />
          )}
          {structure.vestingInPlace !== undefined && (
            <LabelValue
              label="Vesting en place"
              value={structure.vestingInPlace ? "OUI" : "NON"}
            />
          )}
          {structure.concerns && structure.concerns.length > 0 && (
            <BulletList items={structure.concerns.slice(0, 5)} />
          )}
        </>
      )}
      {compliance && compliance.length > 0 && (
        <>
          <H3>Conformité réglementaire</H3>
          <PdfTable
            columns={[
              { header: "Domaine", width: 35 },
              { header: "Statut", width: 30 },
              { header: "Risque", width: 35 },
            ]}
            rows={compliance
              .slice(0, 8)
              .map((c) => [s(c.area), s(c.status), s(c.riskLevel)])}
          />
        </>
      )}
      {upcoming && upcoming.length > 0 && (
        <>
          <H3>Réglementations à venir</H3>
          <PdfTable
            columns={[
              { header: "Réglementation", width: 35 },
              { header: "Date", width: 20 },
              { header: "Impact", width: 20 },
              { header: "Préparation", width: 25 },
            ]}
            rows={upcoming
              .slice(0, 6)
              .map((r) => [
                s(r.regulation),
                s(r.effectiveDate),
                s(r.impact),
                s(r.preparedness),
              ])}
          />
        </>
      )}
    </>
  );
}

// --- Cap Table Auditor ---

function CapTableFindings({ f }: { f: Record<string, unknown> }) {
  const ownership = f.ownershipBreakdown as Record<string, unknown> | undefined;
  const dilution = f.founderDilution as {
    currentOwnership?: number;
    projectedPostRound?: number;
    concernLevel?: string;
  } | undefined;
  const terms = f.roundTerms as {
    liquidationPreference?: string;
    antiDilution?: string;
  } | undefined;

  return (
    <>
      {ownership && (
        <>
          <H3>Répartition du capital</H3>
          <PdfTable
            columns={[
              { header: "Catégorie", width: 50 },
              { header: "Part", width: 50 },
            ]}
            rows={Object.entries(ownership)
              .slice(0, 8)
              .map(([k, v]) => [k, fmtPct(v)])}
          />
        </>
      )}
      {dilution && (
        <>
          <H3>Dilution fondateurs</H3>
          {dilution.currentOwnership !== undefined && (
            <LabelValue
              label="Détention actuelle"
              value={`${dilution.currentOwnership}%`}
            />
          )}
          {dilution.projectedPostRound !== undefined && (
            <LabelValue
              label="Post-round projeté"
              value={`${dilution.projectedPostRound}%`}
            />
          )}
          {dilution.concernLevel && (
            <LabelValue
              label="Niveau inquiétude"
              value={sup(dilution.concernLevel)}
            />
          )}
        </>
      )}
      {terms && (
        <>
          <H3>Termes du tour</H3>
          {terms.liquidationPreference && (
            <LabelValue
              label="Pref. liquidation"
              value={terms.liquidationPreference}
            />
          )}
          {terms.antiDilution && (
            <LabelValue label="Anti-dilution" value={terms.antiDilution} />
          )}
        </>
      )}
    </>
  );
}

// --- GTM Analyst ---

function GtmFindings({ f }: { f: Record<string, unknown> }) {
  const channels = f.channels as Array<{
    channel?: string;
    contribution?: number;
    cac?: number;
    payback?: number;
    efficiency?: string;
  }> | undefined;
  const motion = f.salesMotion as {
    type?: string;
    magicNumber?: number;
    salesCycle?: string;
  } | undefined;
  const expansion = f.expansion as {
    growthLevers?: string[];
  } | undefined;

  return (
    <>
      {channels && channels.length > 0 && (
        <>
          <H3>Canaux GTM</H3>
          <PdfTable
            columns={[
              { header: "Canal", width: 25 },
              { header: "Contribution", width: 18 },
              { header: "CAC", width: 18 },
              { header: "Payback", width: 18 },
              { header: "Efficacité", width: 21 },
            ]}
            rows={channels.slice(0, 6).map((c) => [
              s(c.channel),
              fmtPct(c.contribution),
              typeof c.cac === "number" ? `${c.cac}€` : s(c.cac),
              typeof c.payback === "number" ? `${c.payback}m` : s(c.payback),
              s(c.efficiency),
            ])}
          />
        </>
      )}
      {motion && (
        <>
          <H3>Sales Motion</H3>
          {motion.type && (
            <LabelValue
              label="Type"
              value={sup(motion.type).replace(/_/g, " ")}
            />
          )}
          {motion.magicNumber !== undefined && (
            <LabelValue
              label="Magic Number"
              value={`${motion.magicNumber}`}
            />
          )}
          {motion.salesCycle && (
            <LabelValue label="Cycle de vente" value={motion.salesCycle} />
          )}
        </>
      )}
      {expansion?.growthLevers && expansion.growthLevers.length > 0 && (
        <LabelValue
          label="Leviers de croissance"
          value={expansion.growthLevers.join(", ")}
        />
      )}
    </>
  );
}

// --- Customer Intel ---

function CustomerFindings({ f }: { f: Record<string, unknown> }) {
  const retention = f.retention as {
    nrr?: { reported?: number; benchmark?: number; verdict?: string };
    grossRetention?: number;
    churn?: number;
  } | undefined;
  const pmf = f.pmf as {
    score?: number;
    verdict?: string;
  } | undefined;
  const concentration = f.concentration as {
    top10Percent?: number;
    concentrationLevel?: string;
  } | undefined;
  const icp = f.icp as {
    clarity?: string;
    description?: string;
    segments?: Array<{ segment?: string; size?: string; fit?: string }>;
  } | undefined;

  return (
    <>
      {retention && (
        <>
          <H3>Rétention</H3>
          {typeof retention.nrr?.reported === "number" && (
            <LabelValue label="NRR" value={`${retention.nrr.reported}%`} />
          )}
          {typeof retention.nrr?.benchmark === "number" && (
            <LabelValue
              label="NRR benchmark"
              value={`${retention.nrr.benchmark}%`}
            />
          )}
          {retention.nrr?.verdict && (
            <LabelValue label="Verdict NRR" value={retention.nrr.verdict} />
          )}
          {retention.grossRetention != null && (
            <LabelValue
              label="Rétention brute"
              value={fmtPct(retention.grossRetention)}
            />
          )}
          {typeof retention.churn === "number" && (
            <LabelValue label="Churn" value={`${retention.churn}%`} />
          )}
        </>
      )}
      {pmf && (
        <>
          <H3>Product-Market Fit</H3>
          {pmf.score !== undefined && (
            <LabelValue label="Score PMF" value={`${pmf.score}/100`} />
          )}
          {pmf.verdict && (
            <LabelValue label="Verdict" value={pmf.verdict} />
          )}
        </>
      )}
      {concentration && (
        <>
          {concentration.concentrationLevel && (
            <LabelValue
              label="Concentration client"
              value={sup(concentration.concentrationLevel)}
            />
          )}
          {concentration.top10Percent !== undefined && (
            <LabelValue
              label="Top 10% clients"
              value={`${concentration.top10Percent}% du CA`}
            />
          )}
        </>
      )}
      {icp && (
        <>
          <H3>Profil Client Idéal (ICP)</H3>
          {icp.clarity && (
            <LabelValue label="Clarté ICP" value={sup(icp.clarity)} />
          )}
          {icp.description && <BodyText>{icp.description}</BodyText>}
          {icp.segments && icp.segments.length > 0 && (
            <PdfTable
              columns={[
                { header: "Segment", width: 35 },
                { header: "Taille", width: 30 },
                { header: "Fit", width: 35 },
              ]}
              rows={icp.segments
                .slice(0, 5)
                .map((seg) => [s(seg.segment), s(seg.size), s(seg.fit)])}
            />
          )}
        </>
      )}
    </>
  );
}
