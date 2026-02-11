/**
 * Financial Verification Layer
 * Recalcule cote serveur les metriques financieres produites par le LLM.
 * Flag les ecarts > 5%.
 */

import {
  calculateARR,
  calculateGrossMargin,
  calculateLTVCACRatio,
  calculatePercentageDeviation,
  type CalculationResult,
} from "./financial-calculations";
import { getBenchmarkFull } from "@/services/benchmarks";

export interface VerificationResult {
  metric: string;
  llmValue: number;
  serverValue: number;
  deviation: number;       // % d'ecart
  isDiscrepancy: boolean;  // true si ecart > 5%
  severity: "OK" | "WARNING" | "CRITICAL";
  serverCalculation: string;
  redFlag?: {
    title: string;
    description: string;
    impact: string;
  };
}

export interface FinancialVerificationReport {
  totalMetrics: number;
  verifiedMetrics: number;
  discrepancies: VerificationResult[];
  overallReliability: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Verifie les metriques financieres du LLM.
 * Recalcule chaque metrique quand les inputs sont disponibles.
 */
export function verifyFinancialMetrics(
  llmMetrics: Array<{
    metric: string;
    reportedValue?: number;
    calculatedValue?: number;
    calculation?: string;
  }>,
  rawInputs: {
    mrr?: number;
    revenue?: number;
    cogs?: number;
    ltv?: number;
    cac?: number;
    monthlyBurn?: number;
    cashOnHand?: number;
    netNewARR?: number;
    revenueGrowth?: number;
    profitMargin?: number;
    valuation?: number;
    arr?: number;
  },
  sector: string,
  stage: string,
): FinancialVerificationReport {
  const results: VerificationResult[] = [];

  // 1. Verifier ARR si MRR disponible
  if (rawInputs.mrr) {
    const serverARR = calculateARR(rawInputs.mrr, "server-verification");
    const llmARR = llmMetrics.find(m =>
      m.metric.toLowerCase().includes("arr") && !m.metric.toLowerCase().includes("growth")
    );
    if (llmARR?.calculatedValue) {
      const { deviation } = calculatePercentageDeviation(
        llmARR.calculatedValue,
        serverARR.value
      );
      results.push({
        metric: "ARR",
        llmValue: llmARR.calculatedValue,
        serverValue: serverARR.value,
        deviation,
        isDiscrepancy: deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: serverARR.calculation,
        redFlag: deviation > 5 ? {
          title: `Ecart ARR: LLM=${llmARR.calculatedValue} vs Serveur=${serverARR.value}`,
          description: `Le LLM a calcule un ARR de ${llmARR.calculatedValue} mais le calcul serveur (MRR x 12) donne ${serverARR.value}. Ecart de ${deviation.toFixed(1)}%.`,
          impact: "Le score et les benchmarks sont bases sur une metrique potentiellement fausse.",
        } : undefined,
      });
    }
  }

  // 2. Verifier Gross Margin
  if (rawInputs.revenue && rawInputs.cogs) {
    const serverGM = calculateGrossMargin(
      rawInputs.revenue, rawInputs.cogs,
      "server", "server"
    );
    const llmGM = llmMetrics.find(m =>
      m.metric.toLowerCase().includes("gross") && m.metric.toLowerCase().includes("margin")
    );
    if (llmGM?.calculatedValue) {
      const { deviation } = calculatePercentageDeviation(llmGM.calculatedValue, serverGM.value);
      results.push({
        metric: "Gross Margin",
        llmValue: llmGM.calculatedValue,
        serverValue: serverGM.value,
        deviation,
        isDiscrepancy: deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: serverGM.calculation,
        redFlag: deviation > 5 ? {
          title: `Ecart Gross Margin: LLM=${llmGM.calculatedValue.toFixed(1)}% vs Serveur=${serverGM.value.toFixed(1)}%`,
          description: `Ecart de ${deviation.toFixed(1)}% sur la marge brute.`,
          impact: "Impact sur l'evaluation de la viabilite du business model.",
        } : undefined,
      });
    }
  }

  // 3. Verifier LTV/CAC
  if (rawInputs.ltv && rawInputs.cac) {
    const serverRatio = calculateLTVCACRatio(
      rawInputs.ltv, rawInputs.cac,
      "server", "server"
    );
    const llmRatio = llmMetrics.find(m =>
      m.metric.toLowerCase().includes("ltv") && m.metric.toLowerCase().includes("cac")
    );
    if (llmRatio?.calculatedValue) {
      const { deviation } = calculatePercentageDeviation(llmRatio.calculatedValue, serverRatio.value);
      results.push({
        metric: "LTV/CAC Ratio",
        llmValue: llmRatio.calculatedValue,
        serverValue: serverRatio.value,
        deviation,
        isDiscrepancy: deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: serverRatio.calculation,
        redFlag: deviation > 5 ? {
          title: `Ecart LTV/CAC: LLM=${llmRatio.calculatedValue.toFixed(1)}x vs Serveur=${serverRatio.value.toFixed(1)}x`,
          description: `Ecart de ${deviation.toFixed(1)}% sur le ratio LTV/CAC.`,
          impact: "Impact sur l'evaluation de l'efficacite d'acquisition client.",
        } : undefined,
      });
    }
  }

  // 4. Verifier Burn Multiple
  if (rawInputs.monthlyBurn && rawInputs.netNewARR && rawInputs.netNewARR > 0) {
    const serverBurnMultiple = (rawInputs.monthlyBurn * 12) / rawInputs.netNewARR;
    const llmBM = llmMetrics.find(m => m.metric.toLowerCase().includes("burn") && m.metric.toLowerCase().includes("multiple"));
    if (llmBM?.calculatedValue) {
      const { deviation } = calculatePercentageDeviation(llmBM.calculatedValue, serverBurnMultiple);
      results.push({
        metric: "Burn Multiple",
        llmValue: llmBM.calculatedValue,
        serverValue: serverBurnMultiple,
        deviation,
        isDiscrepancy: deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: `(Monthly Burn ${rawInputs.monthlyBurn} x 12) / Net New ARR ${rawInputs.netNewARR} = ${serverBurnMultiple.toFixed(2)}x`,
        redFlag: deviation > 5 ? {
          title: `Ecart Burn Multiple: LLM=${llmBM.calculatedValue.toFixed(2)}x vs Serveur=${serverBurnMultiple.toFixed(2)}x`,
          description: `Ecart de ${deviation.toFixed(1)}% sur le burn multiple.`,
          impact: "Impact sur l'evaluation de l'efficacite du capital.",
        } : undefined,
      });
    }
  }

  // 5. Verifier Runway
  if (rawInputs.cashOnHand && rawInputs.monthlyBurn && rawInputs.monthlyBurn > 0) {
    const serverRunway = rawInputs.cashOnHand / rawInputs.monthlyBurn;
    const llmRunway = llmMetrics.find(m => m.metric.toLowerCase().includes("runway"));
    if (llmRunway?.calculatedValue) {
      const { deviation } = calculatePercentageDeviation(llmRunway.calculatedValue, serverRunway);
      results.push({
        metric: "Runway (months)",
        llmValue: llmRunway.calculatedValue,
        serverValue: serverRunway,
        deviation,
        isDiscrepancy: deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: `Cash ${rawInputs.cashOnHand} / Monthly Burn ${rawInputs.monthlyBurn} = ${serverRunway.toFixed(1)} mois`,
      });
    }
  }

  // Bilan
  const discrepancies = results.filter(r => r.isDiscrepancy);
  const overallReliability: "HIGH" | "MEDIUM" | "LOW" =
    discrepancies.some(d => d.severity === "CRITICAL") ? "LOW" :
    discrepancies.some(d => d.severity === "WARNING") ? "MEDIUM" :
    "HIGH";

  return {
    totalMetrics: llmMetrics.length,
    verifiedMetrics: results.length,
    discrepancies,
    overallReliability,
  };
}

/**
 * Extrait les raw inputs (MRR, revenue, COGS, etc.) depuis les metriques LLM.
 * Utile pour alimenter verifyFinancialMetrics.
 */
export function extractRawInputsFromMetrics(
  metrics: Array<{
    metric: string;
    reportedValue?: number;
    calculatedValue?: number;
  }>
): Record<string, number | undefined> {
  const inputs: Record<string, number | undefined> = {};

  for (const m of metrics) {
    const lower = m.metric.toLowerCase();
    const value = m.calculatedValue ?? m.reportedValue;

    if (lower.includes("mrr") && !lower.includes("growth")) inputs.mrr = value;
    if (lower.includes("revenue") && !lower.includes("growth") && !lower.includes("retention")) inputs.revenue = value;
    if (lower.includes("cogs") || lower.includes("cost of goods")) inputs.cogs = value;
    if (lower === "ltv" || lower.includes("lifetime value")) inputs.ltv = value;
    if (lower === "cac" || lower.includes("acquisition cost")) inputs.cac = value;
    if (lower.includes("monthly burn") || lower.includes("burn rate")) inputs.monthlyBurn = value;
    if (lower.includes("cash") && (lower.includes("hand") || lower.includes("position"))) inputs.cashOnHand = value;
    if (lower.includes("net new arr")) inputs.netNewARR = value;
    if (lower.includes("arr") && !lower.includes("growth") && !lower.includes("net new")) inputs.arr = value;
  }

  return inputs;
}
