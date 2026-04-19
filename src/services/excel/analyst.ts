import { completeJSON, ensureLLMContext } from "@/services/openrouter/router";
import type { ModelKey } from "@/services/openrouter/client";

import type { ExcelExtractionResult } from "./extractor";
import type { ExcelFinancialAudit } from "./financial-audit";
import type { ExcelModelIntelligence } from "./model-intelligence";

export interface ExcelAnalystReport {
  executiveSummary: string;
  topRedFlags: string[];
  topGreenFlags: string[];
  keyQuestions: string[];
  priorityChecks: string[];
  confidence: "low" | "medium" | "high";
  reasoningNotes: string[];
}

interface DisconnectedCalcCluster {
  sheet: string;
  label: string;
  count: number;
  sampleCells: string[];
  crossSheetRefCount: number;
  reason: string;
}

interface HardcodeCluster {
  sheet: string;
  classification: string;
  count: number;
  sampleCells: string[];
  sampleLabels: string[];
  maxGlobalOutputReach: number;
  samplePaths: string[];
}

export const EXCEL_ANALYST_MODEL_CHAIN: readonly ModelKey[] = [
  "CLAUDE_SONNET_45",
  "GPT_54",
  "GEMINI_31_PRO",
];

export async function generateExcelAnalystReport(params: {
  extraction: ExcelExtractionResult;
  intelligence: ExcelModelIntelligence;
  financialAudit: ExcelFinancialAudit;
}): Promise<{ report: ExcelAnalystReport; cost: number } | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const prompt = buildExcelAnalystPrompt(params);

  return ensureLLMContext("excel-model-analyst", async () => {
    let lastError: unknown = null;
    for (const model of EXCEL_ANALYST_MODEL_CHAIN) {
      try {
        return {
          ...(await generateExcelAnalystReportForModel(params, model))!,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Excel analyst completion failed");
  });
}

export async function generateExcelAnalystReportForModel(
  params: {
    extraction: ExcelExtractionResult;
    intelligence: ExcelModelIntelligence;
    financialAudit: ExcelFinancialAudit;
  },
  model: ModelKey
): Promise<{ report: ExcelAnalystReport; cost: number; model: string; usage?: { inputTokens: number; outputTokens: number } } | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const prompt = buildExcelAnalystPrompt(params);

  return ensureLLMContext("excel-model-analyst", async () => {
    const result = await runExcelAnalystCompletion(prompt, model);
    return result;
  });
}

function getExcelAnalystCompletionOptions() {
  return {
    complexity: "complex" as const,
    maxTokens: 3200,
    temperature: 0.2,
    systemPrompt: [
      "Tu es un senior analyst / IC reviewer specialise en audit de modeles financiers d'investissement.",
      "Tu n'analyses PAS un workbook brut: tu analyses des artefacts structures extraits du modele.",
      "Ton travail est de challenger la logique economique, pas de reformuler platement les outputs.",
      "Tu dois privilegier la rigueur, identifier les vraies fragilites, et eviter toute complaisance.",
      "Ne donne jamais de jugement rassurant sans preuve.",
      "N'infere PAS une incoherence inter-feuilles si les unites, echelles ou perimetres ne sont pas explicitement alignes dans les artefacts.",
      "Ne traite PAS automatiquement un hardcode dans une feuille de sortie comme une manipulation: certaines valeurs peuvent etre statiques, de reference ou descriptives. Ne remonte un red flag que si le lien critique avec les outputs est explicitement montre.",
      "Quand un hardcode correspond a une hypothese d'underwriting embarquee dans une matrice de synthese, formule-le comme hypothese embarquee / override a verifier, pas comme fraude ou manipulation, sauf preuve explicite contraire.",
      "Si reconciliationFlags est vide, tu ne dois PAS affirmer une rupture prouvee entre actifs et synthese.",
      "Si hardcodes est vide ou seulement faiblement materiel, tu ne dois PAS construire un red flag principal sur des hardcodes hypothetique.",
      "Ne transforme PAS automatiquement un bloc de calculs deconnectes en omission materielle: si l'audit parle d'un bloc interne de synthese ou de calculs orphelins a verifier, formule-le comme risque local / helper a verifier, pas comme rupture prouvee de consolidation.",
      "Si le flag de coherence est 'Calculs orphelins à vérifier', tu ne dois PAS employer les mots rupture, omission, fantome ou consolidation incomplete comme fait prouve.",
      "Quand plusieurs cellules deconnectees appartiennent au meme libelle ou au meme bloc, traite-les comme un seul cluster de risque a verifier, pas comme plusieurs defauts independants.",
      "Chaque red flag doit citer une preuve explicite presente dans les artefacts: cellule, feuille, dependance ou flag d'audit.",
      "Si les artefacts sont ambigus, formule l'incertitude et demande le check prioritaire au lieu d'affirmer.",
      "Traite `provedFindings` comme la source principale des red flags. Traite `reviewArtifacts` comme des points de revue, jamais comme une preuve autonome d'un problème majeur.",
      "N'utilise PAS `outputs` ou `keyMetrics` comme preuve autonome si `canonicalOutputs` ou `provedFindings` n'etayent pas la conclusion.",
      "Le résumé exécutif doit tenir en 90 mots maximum.",
      "Chaque tableau topRedFlags, topGreenFlags, keyQuestions, priorityChecks, reasoningNotes doit contenir 4 éléments maximum.",
      "Chaque élément de tableau doit tenir en 35 mots maximum.",
      "Ne renvoie JAMAIS de bloc Markdown, jamais de ```json, jamais de texte avant ou après l'objet JSON.",
      "Rends un JSON strict conforme au schema demande.",
    ].join("\n"),
  };
}

async function runExcelAnalystCompletion(
  prompt: string,
  model: ModelKey
): Promise<{ report: ExcelAnalystReport; cost: number; model: string; usage?: { inputTokens: number; outputTokens: number } }> {
  const baseOptions = getExcelAnalystCompletionOptions();

  try {
    const result = await completeJSON<ExcelAnalystReport>(prompt, {
      ...baseOptions,
      model,
    });

    return {
      report: result.data,
      cost: result.cost,
      model: result.model ?? model,
      usage: result.usage,
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Failed to parse LLM response")) {
      throw error;
    }

    const retryPrompt = [
      prompt,
      "",
      "[CRITIQUE]",
      "Ta réponse précédente n'était pas un JSON parseable.",
      "Réponds avec UN SEUL objet JSON valide, sans markdown, sans ```json, sans commentaire.",
      "Raccourcis ta sortie: résumé <= 90 mots, 4 éléments max par tableau, 35 mots max par élément.",
    ].join("\n");

    const retryResult = await completeJSON<ExcelAnalystReport>(retryPrompt, {
      ...baseOptions,
      model,
      temperature: 0,
      maxTokens: 2400,
    });

    return {
      report: retryResult.data,
      cost: retryResult.cost,
      model: retryResult.model ?? model,
      usage: retryResult.usage,
    };
  }
}

export function buildExcelAnalystPrompt(params: {
  extraction: ExcelExtractionResult;
  intelligence: ExcelModelIntelligence;
  financialAudit: ExcelFinancialAudit;
}): string {
  const { extraction, intelligence, financialAudit } = params;
  const materialHardcodes = intelligence.hardcodes.top.filter((signal) =>
    signal.globalOutputReachCount > 0 && signal.classification !== "presentation_reference"
  );
  const hardcodeClusters = summarizeHardcodes(materialHardcodes);
  const disconnectedClusters = summarizeDisconnectedCalcs(intelligence.disconnectedCalcs);
  const provedDependencyFlags = financialAudit.dependencyFlags.filter((flag) =>
    /Hardcodes materiels sur chemins critiques|Output dépendant de hardcodes/i.test(flag.title)
  );
  const reviewArtifacts = [
    ...financialAudit.consistencyFlags.filter((flag) => /orphelins|synthese interne/i.test(flag.title)),
    ...financialAudit.dependencyFlags.filter((flag) => /Structures masquées|Références Excel avancées/i.test(flag.title)),
  ];

  const payload = {
    workbook: {
      sheetCount: extraction.metadata.sheetCount,
      hiddenSheetCount: extraction.metadata.hiddenSheetCount,
      formulaCount: extraction.metadata.formulaCount,
      warnings: intelligence.warnings,
    },
    workbookMap: intelligence.workbookMap,
    drivers: intelligence.drivers.top.slice(0, 12),
    canonicalOutputs: intelligence.outputs.canonical.slice(0, 8),
    outputs: intelligence.outputs.top
      .filter((output) => output.scope === "global" && output.metricFamily !== "other")
      .slice(0, 8),
    hardcodes: hardcodeClusters,
    hiddenStructures: intelligence.hiddenStructures.slice(0, 15),
    disconnectedCalcs: disconnectedClusters,
    evidenceBoundaries: {
      reconciliationProved: financialAudit.reconciliationFlags.length > 0,
      provedReconciliationMismatchCount: financialAudit.reconciliationFlags.length,
      provedDependencyFlagCount: provedDependencyFlags.length,
      materialHardcodePathCount: materialHardcodes.reduce((count, signal) => count + signal.sampleGlobalOutputPaths.length, 0),
      orphanCalcsVerifyOnly: financialAudit.consistencyFlags.some((flag) => flag.title === "Calculs orphelins à vérifier"),
      summaryUnderwritingEmbeds: hardcodeClusters.some((cluster) => cluster.classification === "local_underwriting"),
    },
    provedFindings: {
      reconciliationFlags: financialAudit.reconciliationFlags.slice(0, 10),
      dependencyFlags: provedDependencyFlags.slice(0, 10),
      criticalDependencies: intelligence.criticalDependencies
        .filter((dependency) =>
          dependency.sampleHardcodePaths.length > 0 ||
          dependency.transitiveHardcodedPrecedentCount > 0 ||
          dependency.hardcodedPrecedentCount > 0
        )
        .slice(0, 8),
    },
    reviewArtifacts,
    financialAudit: {
      overallRisk: financialAudit.overallRisk,
      consistencyFlags: financialAudit.consistencyFlags.slice(0, 10),
      reconciliationFlags: financialAudit.reconciliationFlags.slice(0, 10),
      plausibilityFlags: financialAudit.plausibilityFlags.slice(0, 10),
      heroicAssumptionFlags: financialAudit.heroicAssumptionFlags.slice(0, 10),
      dependencyFlags: financialAudit.dependencyFlags.slice(0, 10),
      greenFlags: financialAudit.greenFlags.slice(0, 10),
      keyMetrics: financialAudit.keyMetrics
        .filter((metric) => metric.sheetRole === "OUTPUTS" || metric.sheetRole === "INPUTS")
        .filter((metric) => metric.category !== "other")
        .slice(0, 10),
      topSensitivities: financialAudit.topSensitivities.slice(0, 8),
      warnings: financialAudit.warnings,
    },
  };

  return [
    "Analyse ce modele financier d'investissement a partir des artefacts structures ci-dessous.",
    "Objectif: produire un jugement de senior analyste sur la solidite du modele, ses fragilites, et les checks prioritaires a effectuer.",
    "Tu dois notamment:",
    "- prioriser les vrais red flags",
    "- distinguer les green flags qui meritent confiance",
    "- poser les questions qui feraient tomber un chateau de cartes",
    "- proposer les checks prioritaires avant utilisation live",
    "",
    "Schema attendu:",
    '{ "executiveSummary": string, "topRedFlags": string[], "topGreenFlags": string[], "keyQuestions": string[], "priorityChecks": string[], "confidence": "low"|"medium"|"high", "reasoningNotes": string[] }',
    "",
    "Artefacts structures:",
    JSON.stringify(payload),
  ].join("\n");
}

function summarizeDisconnectedCalcs(disconnectedCalcs: ExcelModelIntelligence["disconnectedCalcs"]): DisconnectedCalcCluster[] {
  const clusters = new Map<string, DisconnectedCalcCluster>();

  for (const signal of disconnectedCalcs) {
    const key = `${signal.sheet}::${signal.label || signal.reason}`;
    const existing = clusters.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.sampleCells.length < 5) existing.sampleCells.push(signal.cell);
      existing.crossSheetRefCount = Math.max(existing.crossSheetRefCount, signal.crossSheetRefCount);
      continue;
    }

    clusters.set(key, {
      sheet: signal.sheet,
      label: signal.label,
      count: 1,
      sampleCells: [signal.cell],
      crossSheetRefCount: signal.crossSheetRefCount,
      reason: signal.reason,
    });
  }

  return Array.from(clusters.values())
    .sort((left, right) => {
      const rightScore = right.count * 10 + right.crossSheetRefCount * 4;
      const leftScore = left.count * 10 + left.crossSheetRefCount * 4;
      return rightScore - leftScore;
    })
    .slice(0, 10);
}

function summarizeHardcodes(hardcodes: ExcelModelIntelligence["hardcodes"]["top"]): HardcodeCluster[] {
  const clusters = new Map<string, HardcodeCluster>();

  for (const signal of hardcodes) {
    const key = `${signal.sheet}::${signal.classification}`;
    const existing = clusters.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.sampleCells.length < 6) existing.sampleCells.push(signal.cell);
      if (existing.sampleLabels.length < 4 && !existing.sampleLabels.includes(signal.label)) {
        existing.sampleLabels.push(signal.label);
      }
      existing.maxGlobalOutputReach = Math.max(existing.maxGlobalOutputReach, signal.globalOutputReachCount);
      for (const path of signal.sampleGlobalOutputPaths.slice(0, 2)) {
        const formatted = path.nodes.join(" -> ");
        if (existing.samplePaths.length < 4 && !existing.samplePaths.includes(formatted)) {
          existing.samplePaths.push(formatted);
        }
      }
      continue;
    }

    clusters.set(key, {
      sheet: signal.sheet,
      classification: signal.classification,
      count: 1,
      sampleCells: [signal.cell],
      sampleLabels: [signal.label],
      maxGlobalOutputReach: signal.globalOutputReachCount,
      samplePaths: signal.sampleGlobalOutputPaths.slice(0, 2).map((path) => path.nodes.join(" -> ")),
    });
  }

  return Array.from(clusters.values())
    .sort((left, right) => {
      const rightScore = right.maxGlobalOutputReach * 20 + right.count * 5;
      const leftScore = left.maxGlobalOutputReach * 20 + left.count * 5;
      return rightScore - leftScore;
    })
    .slice(0, 10);
}
