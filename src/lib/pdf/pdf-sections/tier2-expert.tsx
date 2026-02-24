/**
 * Tier 2 Sector Expert Section — Full sector analysis with extended data
 */

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { colors, styles as gs } from "../pdf-theme";
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
import { s, sup, formatValue, fmtPct } from "../pdf-helpers";
import { AGENT_DISPLAY_NAMES } from "@/lib/format-utils";
import type { AgentResult } from "../generate-analysis-pdf";

export function Tier2ExpertSection({
  tier2Results,
  dealName,
}: {
  tier2Results: Record<string, AgentResult>;
  dealName: string;
}) {
  if (Object.keys(tier2Results).length === 0) return null;

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Expert Sectoriel (Tier 2)</SectionTitle>

      {Object.entries(tier2Results).map(([agentName, result]) => {
        if (!result.success || !result.data) return null;

        const data = result.data as Record<string, unknown>;
        const ext = result._extended as Record<string, unknown> | undefined;
        const displayName = AGENT_DISPLAY_NAMES[agentName] ?? agentName;

        return (
          <View key={agentName}>
            <SubsectionTitle>{displayName}</SubsectionTitle>

            {/* Executive summary */}
            {!!data.executiveSummary && (
              <Text style={[gs.body, { color: colors.muted, marginBottom: 6 }]}>
                {String(data.executiveSummary)}
              </Text>
            )}

            {/* Score + maturity */}
            {data.sectorScore !== undefined && (
              <LabelValue label="Score sectoriel" value={`${data.sectorScore}/100`} />
            )}
            {!!data.sectorMaturity && (
              <LabelValue label="Maturité du secteur" value={s(data.sectorMaturity)} />
            )}

            {/* Extended verdict */}
            <ExtendedVerdict ext={ext} />

            {/* Key metrics */}
            <KeyMetrics keyMetrics={data.keyMetrics} />

            {/* Extended unit economics */}
            <UnitEconomics unitEcon={ext?.unitEconomics} />

            {/* Extended valuation analysis */}
            <ValuationAnalysis valuation={ext?.valuationAnalysis} />

            {/* Regulatory environment */}
            <RegulatoryEnvironment regulatory={data.regulatoryEnvironment} />

            {/* Sector dynamics */}
            <SectorDynamics dynamics={data.sectorDynamics} />

            {/* Sector fit */}
            <SectorFit fit={data.sectorFit} />

            {/* Data completeness */}
            <DataCompleteness
              completeness={data.dataCompleteness ?? ext?.dataCompleteness}
            />

            {/* Red flags */}
            <SectorRedFlags redFlags={data.sectorRedFlags} />

            {/* Opportunities */}
            <SectorOpportunities opportunities={data.sectorOpportunities} />

            {/* Questions */}
            <SectorQuestions questions={data.sectorQuestions} />

            {/* GTM Assessment (SaaS) */}
            <GtmAssessment gtm={ext?.gtmAssessment} />

            {/* Exit Potential (SaaS) */}
            <ExitPotential exitPot={ext?.exitPotential} />

            {/* Sector-specific data */}
            <SectorSpecificExtended agentName={agentName} ext={ext} />

            {/* DB Cross-reference */}
            <DbCrossRef dbRef={data.dbCrossReference ?? ext?.dbCrossReference} />
            <DbComparison dbComp={ext?.dbComparison} />
          </View>
        );
      })}
    </PdfPage>
  );
}

// --- Sub-components ---

function ExtendedVerdict({ ext }: { ext?: Record<string, unknown> }) {
  const verdict = ext?.verdict as {
    recommendation?: string;
    confidence?: string;
    keyInsight?: string;
    topStrength?: string;
    topConcern?: string;
  } | undefined;
  if (!verdict) return null;
  return (
    <>
      <H3>Verdict sectoriel</H3>
      <LabelValue label="Recommandation" value={s(verdict.recommendation).replace(/_/g, " ")} />
      <LabelValue label="Confiance" value={s(verdict.confidence)} />
      {verdict.keyInsight && <BodyText>{verdict.keyInsight}</BodyText>}
      {verdict.topStrength && <LabelValue label="Force principale" value={verdict.topStrength} />}
      {verdict.topConcern && <LabelValue label="Préoccupation" value={verdict.topConcern} />}
    </>
  );
}

function KeyMetrics({ keyMetrics }: { keyMetrics: unknown }) {
  const metrics = keyMetrics as Array<{
    metricName: string;
    value: unknown;
    assessment: string;
    sectorContext?: string;
    sectorBenchmark?: { p25?: number; median?: number; p75?: number; topDecile?: number };
  }> | undefined;
  if (!metrics || metrics.length === 0) return null;

  const hasBenchmarks = metrics.some((m) => m.sectorBenchmark);
  return (
    <>
      <H3>Métriques clés</H3>
      {hasBenchmarks ? (
        <PdfTable
          columns={[
            { header: "Métrique", width: 20 },
            { header: "Valeur", width: 13 },
            { header: "Eval.", width: 14 },
            { header: "P25", width: 10 },
            { header: "Médian", width: 13 },
            { header: "P75", width: 10 },
            { header: "Top 10%", width: 10 },
          ]}
          rows={metrics.slice(0, 12).map((m) => [
            m.metricName,
            m.value != null ? String(m.value) : "N/A",
            (m.assessment ?? "").replace(/_/g, " "),
            m.sectorBenchmark?.p25 !== undefined ? String(m.sectorBenchmark.p25) : "",
            m.sectorBenchmark?.median !== undefined ? String(m.sectorBenchmark.median) : "",
            m.sectorBenchmark?.p75 !== undefined ? String(m.sectorBenchmark.p75) : "",
            m.sectorBenchmark?.topDecile !== undefined ? String(m.sectorBenchmark.topDecile) : "",
          ])}
        />
      ) : (
        <PdfTable
          columns={[
            { header: "Métrique", width: 25 },
            { header: "Valeur", width: 20 },
            { header: "Évaluation", width: 20 },
            { header: "Contexte", width: 35 },
          ]}
          rows={metrics.slice(0, 12).map((m) => [
            m.metricName,
            m.value != null ? String(m.value) : "N/A",
            (m.assessment ?? "").replace(/_/g, " "),
            m.sectorContext ?? "",
          ])}
        />
      )}
    </>
  );
}

function UnitEconomics({ unitEcon }: { unitEcon: unknown }) {
  const ue = unitEcon as Record<string, unknown> | undefined;
  if (!ue) return null;

  const ueVal = (field: unknown): string => {
    if (field === null || field === undefined) return "N/A";
    if (typeof field === "object" && field !== null) {
      const obj = field as Record<string, unknown>;
      if (obj.value !== undefined) return s(obj.value);
      return "N/A";
    }
    return String(field);
  };
  const ueDetail = (field: unknown): string => {
    if (typeof field === "object" && field !== null) {
      const obj = field as Record<string, unknown>;
      const parts: string[] = [];
      if (obj.assessment) parts.push(String(obj.assessment));
      else if (obj.confidence) parts.push(String(obj.confidence));
      if (obj.calculation) parts.push(String(obj.calculation));
      if (obj.vsMedian) parts.push(`vs median: ${obj.vsMedian}`);
      if (obj.verdict) parts.push(String(obj.verdict));
      return parts.join(" — ") || "";
    }
    return "";
  };

  const rows: string[][] = [];
  if (ue.cac !== undefined) rows.push(["CAC", ueVal(ue.cac), ueDetail(ue.cac)]);
  if (ue.ltv !== undefined) rows.push(["LTV", ueVal(ue.ltv), ueDetail(ue.ltv)]);
  if (ue.ltvCacRatio !== undefined) rows.push(["LTV:CAC", ueVal(ue.ltvCacRatio), ueDetail(ue.ltvCacRatio)]);
  if (ue.cacPaybackMonths !== undefined) rows.push(["Payback (mois)", ueVal(ue.cacPaybackMonths), ueDetail(ue.cacPaybackMonths)]);
  if (ue.burnMultiple !== undefined) rows.push(["Burn Multiple", ueVal(ue.burnMultiple), ueDetail(ue.burnMultiple)]);
  if (ue.magicNumber !== undefined) rows.push(["Magic Number", ueVal(ue.magicNumber), ueDetail(ue.magicNumber)]);
  if (ue.revenuePerTransaction !== undefined) rows.push(["Rev/Transaction", ueVal(ue.revenuePerTransaction), ueDetail(ue.revenuePerTransaction)]);
  if (ue.contributionMargin !== undefined) rows.push(["Marge contribution", ueVal(ue.contributionMargin), ueDetail(ue.contributionMargin)]);

  if (rows.length === 0 && !ue.overallAssessment) return null;

  return (
    <>
      <H3>Unit Economics</H3>
      {ue.overallAssessment && <BodyText>{String(ue.overallAssessment)}</BodyText>}
      {rows.length > 0 && (
        <PdfTable
          columns={[
            { header: "Métrique", width: 25 },
            { header: "Valeur", width: 20 },
            { header: "Détail", width: 55 },
          ]}
          rows={rows}
        />
      )}
    </>
  );
}

function ValuationAnalysis({ valuation }: { valuation: unknown }) {
  const v = valuation as {
    askMultiple?: number;
    medianSectorMultiple?: number;
    medianMultiple?: number;
    percentilePosition?: number;
    percentile?: number;
    verdict?: string;
    negotiationLeverage?: string;
    justifiedRange?: { low?: number; fair?: number; high?: number } | string;
  } | undefined;
  if (!v) return null;

  return (
    <>
      <H3>Analyse valorisation</H3>
      {v.verdict && <LabelValue label="Verdict" value={sup(v.verdict)} />}
      {v.askMultiple !== undefined && <LabelValue label="Multiple demandé" value={`${v.askMultiple}x`} />}
      {(() => {
        const m = v.medianSectorMultiple ?? v.medianMultiple;
        return m !== undefined ? <LabelValue label="Multiple médian secteur" value={`${m}x`} /> : null;
      })()}
      {(() => {
        const p = v.percentilePosition ?? v.percentile;
        return p !== undefined ? <LabelValue label="Percentile" value={`P${p}`} /> : null;
      })()}
      {v.justifiedRange && (
        <LabelValue
          label="Fourchette justifiée"
          value={
            typeof v.justifiedRange === "object"
              ? `${v.justifiedRange.low ?? "?"}x — ${v.justifiedRange.fair ?? "?"}x — ${v.justifiedRange.high ?? "?"}x`
              : String(v.justifiedRange)
          }
        />
      )}
      {v.negotiationLeverage && <LabelValue label="Levier négociation" value={v.negotiationLeverage} />}
    </>
  );
}

function RegulatoryEnvironment({ regulatory }: { regulatory: unknown }) {
  const r = regulatory as {
    complexity?: string;
    keyRegulations?: string[];
    complianceRisks?: string[];
  } | undefined;
  if (!r) return null;

  return (
    <>
      <H3>Environnement régulatoire</H3>
      {r.complexity && <LabelValue label="Complexité" value={sup(r.complexity)} />}
      {r.keyRegulations && r.keyRegulations.length > 0 && <BulletList items={r.keyRegulations.slice(0, 5)} />}
      {r.complianceRisks && r.complianceRisks.length > 0 && (
        <>
          <H3>Risques de conformité</H3>
          <BulletList items={r.complianceRisks.slice(0, 5)} />
        </>
      )}
    </>
  );
}

function SectorDynamics({ dynamics }: { dynamics: unknown }) {
  const d = dynamics as {
    competitionIntensity?: string;
    consolidationTrend?: string;
    barrierToEntry?: string;
    typicalExitMultiple?: number;
  } | undefined;
  if (!d) return null;
  return (
    <>
      <H3>Dynamiques sectorielles</H3>
      {d.competitionIntensity && <LabelValue label="Concurrence" value={sup(d.competitionIntensity)} />}
      {d.consolidationTrend && <LabelValue label="Consolidation" value={d.consolidationTrend} />}
      {d.barrierToEntry && <LabelValue label="Barrière entrée" value={sup(d.barrierToEntry)} />}
      {d.typicalExitMultiple && <LabelValue label="Multiple exit typique" value={`${d.typicalExitMultiple}x`} />}
    </>
  );
}

function SectorFit({ fit }: { fit: unknown }) {
  const f = fit as {
    score?: number;
    strengths?: string[];
    weaknesses?: string[];
    sectorTiming?: string;
  } | undefined;
  if (!f) return null;
  return (
    <>
      <H3>Adéquation sectorielle</H3>
      {f.score !== undefined && <LabelValue label="Score fit" value={`${f.score}/100`} />}
      {f.sectorTiming && <LabelValue label="Timing" value={sup(f.sectorTiming)} />}
      {f.strengths && f.strengths.length > 0 && <BulletList items={f.strengths.slice(0, 3).map((st) => `+ ${st}`)} />}
      {f.weaknesses && f.weaknesses.length > 0 && <BulletList items={f.weaknesses.slice(0, 3).map((w) => `- ${w}`)} />}
    </>
  );
}

function DataCompleteness({ completeness }: { completeness: unknown }) {
  const c = completeness as {
    level?: string;
    availableDataPoints?: number;
    expectedDataPoints?: number;
    missingCritical?: string[];
    scoreCapped?: boolean;
    rawScore?: number;
    cappedScore?: number;
  } | undefined;
  if (!c) return null;
  return (
    <>
      <H3>Complétude des données</H3>
      <LabelValue label="Niveau" value={sup(c.level)} />
      {c.availableDataPoints && c.expectedDataPoints && (
        <LabelValue label="Points de données" value={`${c.availableDataPoints}/${c.expectedDataPoints}`} />
      )}
      {c.scoreCapped && c.rawScore !== undefined && (
        <LabelValue label="Score brut vs plafonne" value={`${c.rawScore} → ${c.cappedScore ?? "N/A"} (plafonné)`} />
      )}
      {c.missingCritical && c.missingCritical.length > 0 && <BulletList items={c.missingCritical.slice(0, 5)} />}
    </>
  );
}

function SectorRedFlags({ redFlags }: { redFlags: unknown }) {
  const rf = redFlags as Array<{ flag: string; severity: string; sectorReason?: string }> | undefined;
  if (!rf || rf.length === 0) return null;
  return (
    <>
      <H3>Red Flags sectoriels</H3>
      <PdfTable
        columns={[
          { header: "Red Flag", width: 35 },
          { header: "Sévérité", width: 15 },
          { header: "Raison", width: 50 },
        ]}
        rows={rf.map((r) => [r.flag, r.severity, r.sectorReason ?? ""])}
      />
    </>
  );
}

function SectorOpportunities({ opportunities }: { opportunities: unknown }) {
  const ops = opportunities as Array<{ opportunity: string; potential: string; reasoning?: string }> | undefined;
  if (!ops || ops.length === 0) return null;
  return (
    <>
      <H3>Opportunités</H3>
      <BulletList items={ops.map((o) => `[${sup(o.potential)}] ${s(o.opportunity)}${o.reasoning ? ` — ${s(o.reasoning)}` : ""}`)} />
    </>
  );
}

function SectorQuestions({ questions }: { questions: unknown }) {
  const qs = questions as Array<{ question: string; category: string; priority: string }> | undefined;
  if (!qs || qs.length === 0) return null;
  return (
    <>
      <H3>Questions sectorielles</H3>
      <PdfTable
        columns={[
          { header: "Question", width: 55 },
          { header: "Catégorie", width: 25 },
          { header: "Priorité", width: 20 },
        ]}
        rows={qs.slice(0, 10).map((q) => [q.question, q.category, q.priority])}
      />
    </>
  );
}

function GtmAssessment({ gtm }: { gtm: unknown }) {
  const g = gtm as { model?: string; efficiency?: string; salesCycleMonths?: number; keyInsight?: string } | undefined;
  if (!g) return null;
  return (
    <>
      <H3>GTM Assessment</H3>
      {g.model && <LabelValue label="Modèle" value={sup(g.model).replace(/_/g, " ")} />}
      {g.efficiency && <LabelValue label="Efficacité" value={sup(g.efficiency)} />}
      {g.salesCycleMonths !== undefined && <LabelValue label="Cycle de vente" value={`${g.salesCycleMonths} mois`} />}
      {g.keyInsight && <BodyText>{g.keyInsight}</BodyText>}
    </>
  );
}

function ExitPotential({ exitPot }: { exitPot: unknown }) {
  const e = exitPot as { typicalMultiple?: number; likelyAcquirers?: string[]; timeToExit?: string; exitReadiness?: string } | undefined;
  if (!e) return null;
  return (
    <>
      <H3>Potentiel de sortie</H3>
      {e.typicalMultiple && <LabelValue label="Multiple typique" value={`${e.typicalMultiple}x`} />}
      {e.timeToExit && <LabelValue label="Horizon" value={e.timeToExit} />}
      {e.exitReadiness && <LabelValue label="Maturité exit" value={sup(e.exitReadiness).replace(/_/g, " ")} />}
      {e.likelyAcquirers && e.likelyAcquirers.length > 0 && <LabelValue label="Acquéreurs potentiels" value={e.likelyAcquirers.join(", ")} />}
    </>
  );
}

function DbCrossRef({ dbRef }: { dbRef: unknown }) {
  const d = dbRef as { claims?: Array<{ claim?: string; dbVerdict?: string; evidence?: string }>; hiddenCompetitors?: string[] } | undefined;
  if (!d?.claims || d.claims.length === 0) return null;
  return (
    <>
      <H3>Cross-reference DB</H3>
      <PdfTable
        columns={[
          { header: "Claim", width: 35 },
          { header: "Verdict", width: 20 },
          { header: "Evidence", width: 45 },
        ]}
        rows={d.claims.slice(0, 8).map((c) => [s(c.claim), s(c.dbVerdict), s(c.evidence)])}
      />
    </>
  );
}

function DbComparison({ dbComp }: { dbComp: unknown }) {
  const d = dbComp as {
    similarDealsFound?: number;
    thisDealsPosition?: string;
    bestComparable?: { name?: string; outcome?: string };
    concerningComparable?: { name?: string; whatHappened?: string };
  } | undefined;
  if (!d) return null;
  return (
    <>
      <H3>Comparaison DB</H3>
      {d.similarDealsFound !== undefined && <LabelValue label="Deals similaires" value={String(d.similarDealsFound)} />}
      {d.thisDealsPosition && <LabelValue label="Position" value={d.thisDealsPosition} />}
      {d.bestComparable?.name && <LabelValue label="Meilleur comparable" value={`${d.bestComparable.name} (${s(d.bestComparable.outcome)})`} />}
      {d.concerningComparable?.name && <LabelValue label="Comparable préoccupant" value={`${d.concerningComparable.name}: ${s(d.concerningComparable.whatHappened)}`} />}
    </>
  );
}

// --- Sector-specific extended data ---

function SectorSpecificExtended({ agentName, ext }: { agentName: string; ext?: Record<string, unknown> }) {
  if (!ext) return null;

  return (
    <>
      {/* AI Expert */}
      {agentName.includes("ai") && <AiExtended ext={ext} />}
      {/* Blockchain */}
      {agentName.includes("blockchain") && <BlockchainExtended ext={ext} />}
      {/* Fintech */}
      {agentName.includes("fintech") && <FintechExtended ext={ext} />}
      {/* PropTech */}
      {agentName.includes("proptech") && <PropTechExtended ext={ext} />}
      {/* EdTech */}
      {agentName.includes("edtech") && <EdTechExtended ext={ext} />}
      {/* Biotech */}
      {agentName.includes("biotech") && <BiotechExtended ext={ext} />}
      {/* SaaS (cohort, moat) */}
      <SaasCohort ext={ext} />
    </>
  );
}

function AiExtended({ ext }: { ext: Record<string, unknown> }) {
  const verdict = ext.aiVerdict as { isRealAI?: boolean; technicalCredibility?: string; moatStrength?: string; recommendation?: string; keyInsight?: string } | undefined;
  const moat = ext.aiMoat as { overallMoatScore?: number; dataFlywheel?: boolean; networkEffects?: boolean; apiDependency?: string; moatAssessment?: string } | undefined;
  const model = ext.aiModelApproach as { type?: string; baseModel?: string; moatLevel?: string; proprietaryComponents?: string[] } | undefined;
  const infra = ext.aiInfraCosts as { gpuProvider?: string; monthlyComputeCost?: number; scalingModel?: string; costAssessment?: string } | undefined;
  const redFlags = ext.aiRedFlags as { noMLTeam?: boolean; justAPIWrapper?: boolean; noProprietaryData?: boolean; unrealisticAccuracyClaims?: boolean; redFlagSummary?: string } | undefined;

  return (
    <>
      {verdict && (
        <>
          <H3>Verdict IA</H3>
          <LabelValue label="IA véritable" value={verdict.isRealAI ? "OUI" : "NON"} />
          {verdict.technicalCredibility && <LabelValue label="Crédibilité technique" value={sup(verdict.technicalCredibility)} />}
          {verdict.moatStrength && <LabelValue label="Force du moat" value={sup(verdict.moatStrength)} />}
          {verdict.keyInsight && <BodyText>{verdict.keyInsight}</BodyText>}
        </>
      )}
      {moat && (
        <>
          <H3>Moat IA</H3>
          {moat.overallMoatScore !== undefined && <LabelValue label="Score moat" value={`${moat.overallMoatScore}/100`} />}
          {moat.dataFlywheel !== undefined && <LabelValue label="Data flywheel" value={moat.dataFlywheel ? "OUI" : "NON"} />}
          {moat.networkEffects !== undefined && <LabelValue label="Effets de réseau" value={moat.networkEffects ? "OUI" : "NON"} />}
          {moat.apiDependency && <LabelValue label="Dépendance API" value={sup(moat.apiDependency)} />}
          {moat.moatAssessment && <BodyText>{moat.moatAssessment}</BodyText>}
        </>
      )}
      {model && (
        <>
          <H3>Approche modèle</H3>
          {model.type && <LabelValue label="Type" value={sup(model.type).replace(/_/g, " ")} />}
          {model.baseModel && <LabelValue label="Modèle de base" value={model.baseModel} />}
          {model.moatLevel && <LabelValue label="Niveau moat" value={sup(model.moatLevel)} />}
          {model.proprietaryComponents && model.proprietaryComponents.length > 0 && <LabelValue label="Composants propriétaires" value={model.proprietaryComponents.join(", ")} />}
        </>
      )}
      {infra && (
        <>
          <H3>Infrastructure &amp; Coûts IA</H3>
          {infra.gpuProvider && <LabelValue label="Fournisseur GPU" value={infra.gpuProvider} />}
          {infra.monthlyComputeCost !== undefined && <LabelValue label="Coût mensuel compute" value={`${infra.monthlyComputeCost}€`} />}
          {infra.scalingModel && <LabelValue label="Modèle de scaling" value={sup(infra.scalingModel)} />}
          {infra.costAssessment && <BodyText>{infra.costAssessment}</BodyText>}
        </>
      )}
      {redFlags && (
        <>
          {(() => {
            const items: string[] = [];
            if (redFlags.noMLTeam) items.push("Pas d'équipe ML");
            if (redFlags.justAPIWrapper) items.push("Simple wrapper API");
            if (redFlags.noProprietaryData) items.push("Pas de données propriétaires");
            if (redFlags.unrealisticAccuracyClaims) items.push("Claims de précision irréalistes");
            if (items.length === 0) return null;
            return (
              <>
                <H3>Red Flags IA</H3>
                <BulletList items={items} />
              </>
            );
          })()}
          {redFlags.redFlagSummary && <BodyText>{redFlags.redFlagSummary}</BodyText>}
        </>
      )}
    </>
  );
}

function BlockchainExtended({ ext }: { ext: Record<string, unknown> }) {
  const tokenomics = ext.tokenomics as { hasToken?: boolean; tokenType?: string; tokenUtility?: string; distributionAssessment?: string; vestingSchedule?: string } | undefined;
  const security = ext.blockchainSecurity as { auditStatus?: string; bugBounty?: boolean; smartContractRisk?: string; attackVectors?: string[] } | undefined;
  const decentralization = ext.decentralization as { level?: string; nodeCount?: number; governanceModel?: string } | undefined;

  return (
    <>
      {tokenomics && (
        <>
          <H3>Tokenomics</H3>
          {tokenomics.hasToken !== undefined && <LabelValue label="Token" value={tokenomics.hasToken ? "OUI" : "NON"} />}
          {tokenomics.tokenType && <LabelValue label="Type" value={sup(tokenomics.tokenType)} />}
          {tokenomics.tokenUtility && <LabelValue label="Utilité" value={tokenomics.tokenUtility} />}
          {tokenomics.distributionAssessment && <LabelValue label="Distribution" value={tokenomics.distributionAssessment} />}
        </>
      )}
      {security && (
        <>
          <H3>Sécurité Blockchain</H3>
          {security.auditStatus && <LabelValue label="Audit" value={sup(security.auditStatus)} />}
          {security.bugBounty !== undefined && <LabelValue label="Bug bounty" value={security.bugBounty ? "OUI" : "NON"} />}
          {security.smartContractRisk && <LabelValue label="Risque smart contract" value={sup(security.smartContractRisk)} />}
          {security.attackVectors && security.attackVectors.length > 0 && <BulletList items={security.attackVectors.slice(0, 4)} />}
        </>
      )}
      {decentralization && (
        <>
          <H3>Décentralisation</H3>
          {decentralization.level && <LabelValue label="Niveau" value={sup(decentralization.level)} />}
          {decentralization.nodeCount !== undefined && <LabelValue label="Noeuds" value={String(decentralization.nodeCount)} />}
          {decentralization.governanceModel && <LabelValue label="Gouvernance" value={decentralization.governanceModel} />}
        </>
      )}
    </>
  );
}

function FintechExtended({ ext }: { ext: Record<string, unknown> }) {
  const reg = ext.regulatoryDetails as { licenses?: Array<{ license?: string; status?: string; jurisdiction?: string; risk?: string }>; overallRisk?: string; verdict?: string } | undefined;
  const bigTech = ext.bigTechThreat as { level?: string; players?: string[]; rationale?: string } | undefined;

  return (
    <>
      {reg && (
        <>
          <H3>Détails régulatoires Fintech</H3>
          {reg.overallRisk && <LabelValue label="Risque régulatoire" value={sup(reg.overallRisk)} />}
          {reg.verdict && <BodyText>{reg.verdict}</BodyText>}
          {reg.licenses && reg.licenses.length > 0 && (
            <PdfTable
              columns={[
                { header: "Licence", width: 25 },
                { header: "Statut", width: 20 },
                { header: "Juridiction", width: 30 },
                { header: "Risque", width: 25 },
              ]}
              rows={reg.licenses.slice(0, 6).map((l) => [s(l.license), s(l.status), s(l.jurisdiction), s(l.risk)])}
            />
          )}
        </>
      )}
      {bigTech && (
        <>
          <H3>Menace Big Tech</H3>
          {bigTech.level && <LabelValue label="Niveau" value={sup(bigTech.level)} />}
          {bigTech.players && bigTech.players.length > 0 && <LabelValue label="Acteurs" value={bigTech.players.join(", ")} />}
          {bigTech.rationale && <BodyText>{bigTech.rationale}</BodyText>}
        </>
      )}
    </>
  );
}

function PropTechExtended({ ext }: { ext: Record<string, unknown> }) {
  const cycle = ext.proptechCycleAnalysis as { currentCyclePhase?: string; interestRateSensitivity?: string; resilienceScore?: number; cycleRiskAssessment?: string } | undefined;
  if (!cycle) return null;
  return (
    <>
      <H3>Analyse du cycle immobilier</H3>
      {cycle.currentCyclePhase && <LabelValue label="Phase du cycle" value={sup(cycle.currentCyclePhase)} />}
      {cycle.interestRateSensitivity && <LabelValue label="Sensibilité taux" value={sup(cycle.interestRateSensitivity)} />}
      {cycle.resilienceScore !== undefined && <LabelValue label="Score résilience" value={`${cycle.resilienceScore}/100`} />}
      {cycle.cycleRiskAssessment && <BodyText>{cycle.cycleRiskAssessment}</BodyText>}
    </>
  );
}

function EdTechExtended({ ext }: { ext: Record<string, unknown> }) {
  const engagement = ext.edtechEngagement as { completionRate?: { value?: number; vsIndustry?: string }; activeUsersRatio?: { ratio?: number }; learningOutcomes?: { assessment?: string }; retentionCohorts?: { d7Retention?: number; d30Retention?: number } } | undefined;
  if (!engagement) return null;
  return (
    <>
      <H3>Engagement &amp; Résultats</H3>
      {engagement.completionRate?.value !== undefined && <LabelValue label="Taux de complétion" value={`${engagement.completionRate.value}% (${s(engagement.completionRate.vsIndustry)})`} />}
      {engagement.activeUsersRatio?.ratio !== undefined && <LabelValue label="Ratio utilisateurs actifs" value={`${engagement.activeUsersRatio.ratio}%`} />}
      {engagement.learningOutcomes?.assessment && <LabelValue label="Résultats apprentissage" value={sup(engagement.learningOutcomes.assessment)} />}
      {engagement.retentionCohorts?.d7Retention !== undefined && <LabelValue label="Rétention D7" value={`${engagement.retentionCohorts.d7Retention}%`} />}
      {engagement.retentionCohorts?.d30Retention !== undefined && <LabelValue label="Rétention D30" value={`${engagement.retentionCohorts.d30Retention}%`} />}
    </>
  );
}

function BiotechExtended({ ext }: { ext: Record<string, unknown> }) {
  const pipeline = ext.pipeline as { stage?: string; compounds?: number; leadIndication?: string; probabilityOfSuccess?: number; timeToMarket?: string } | undefined;
  if (!pipeline) return null;
  return (
    <>
      <H3>Pipeline thérapeutique</H3>
      {pipeline.stage && <LabelValue label="Phase" value={sup(pipeline.stage)} />}
      {pipeline.compounds !== undefined && <LabelValue label="Composés" value={String(pipeline.compounds)} />}
      {pipeline.leadIndication && <LabelValue label="Indication principale" value={pipeline.leadIndication} />}
      {pipeline.probabilityOfSuccess !== undefined && <LabelValue label="Prob. de succès" value={`${pipeline.probabilityOfSuccess}%`} />}
      {pipeline.timeToMarket && <LabelValue label="Délai mise sur marché" value={pipeline.timeToMarket} />}
    </>
  );
}

function SaasCohort({ ext }: { ext: Record<string, unknown> }) {
  const cohort = ext.cohortHealth as { nrrTrend?: string; churnTrend?: string; expansionTrend?: string; concern?: string } | undefined;
  const compMoat = ext.saasCompetitiveMoat as { dataNetworkEffects?: boolean; switchingCostLevel?: string; categoryLeaderPotential?: boolean; moatAssessment?: string } | undefined;
  const implication = ext.investmentImplication as string | undefined;

  return (
    <>
      {cohort && (
        <>
          <H3>Santé des cohortes</H3>
          {cohort.nrrTrend && <LabelValue label="Tendance NRR" value={sup(cohort.nrrTrend)} />}
          {cohort.churnTrend && <LabelValue label="Tendance churn" value={sup(cohort.churnTrend)} />}
          {cohort.expansionTrend && <LabelValue label="Tendance expansion" value={sup(cohort.expansionTrend)} />}
          {cohort.concern && <BodyText>{cohort.concern}</BodyText>}
        </>
      )}
      {compMoat && (
        <>
          <H3>Moat concurrentiel SaaS</H3>
          {compMoat.dataNetworkEffects !== undefined && <LabelValue label="Data network effects" value={compMoat.dataNetworkEffects ? "OUI" : "NON"} />}
          {compMoat.switchingCostLevel && <LabelValue label="Coûts de changement" value={sup(compMoat.switchingCostLevel)} />}
          {compMoat.categoryLeaderPotential !== undefined && <LabelValue label="Potentiel leader" value={compMoat.categoryLeaderPotential ? "OUI" : "NON"} />}
          {compMoat.moatAssessment && <BodyText>{compMoat.moatAssessment}</BodyText>}
        </>
      )}
      {implication && <LabelValue label="Implication investissement" value={sup(implication).replace(/_/g, " ")} />}
    </>
  );
}
