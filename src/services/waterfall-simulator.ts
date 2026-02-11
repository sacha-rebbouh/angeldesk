/**
 * F76: Liquidation waterfall simulator.
 * Calculates exact payouts for each stakeholder across exit scenarios.
 * Pure TypeScript — no LLM involved.
 */

export interface WaterfallInput {
  exitValuation: number;
  investors: {
    name: string;
    investedAmount: number;
    ownershipPercent: number;
    liquidationPreference: {
      multiple: number;
      type: "non_participating" | "participating" | "capped_participating";
      cap?: number;
    };
    isBA: boolean;
  }[];
  founders: {
    name: string;
    ownershipPercent: number;
  }[];
  esopPercent: number;
}

export interface WaterfallScenario {
  exitValuation: number;
  exitMultiple: number;
  distributions: {
    name: string;
    role: "investor" | "founder" | "esop";
    amount: number;
    percentOfExit: number;
    returnMultiple: number | null;
    calculation: string;
  }[];
  baReturn: {
    amount: number;
    multiple: number;
    percentOfExit: number;
    calculation: string;
  } | null;
  warnings: string[];
}

export function simulateWaterfall(
  input: WaterfallInput,
  exitValuations: number[]
): WaterfallScenario[] {
  return exitValuations.map(exitVal => simulateSingleWaterfall(input, exitVal));
}

function simulateSingleWaterfall(input: WaterfallInput, exitValuation: number): WaterfallScenario {
  const totalInvested = input.investors.reduce((sum, inv) => sum + inv.investedAmount, 0);
  const totalInvestorPct = input.investors.reduce((sum, inv) => sum + inv.ownershipPercent, 0);
  const postMoney = totalInvestorPct > 0 ? totalInvested / (totalInvestorPct / 100) : totalInvested;
  const exitMultiple = postMoney > 0 ? exitValuation / postMoney : 0;

  let remaining = exitValuation;
  const distributions: WaterfallScenario["distributions"] = [];
  const warnings: string[] = [];

  // STEP 1: Liquidation Preferences (senior first)
  const sortedInvestors = [...input.investors].sort(
    (a, b) => b.liquidationPreference.multiple - a.liquidationPreference.multiple
  );

  for (const inv of sortedInvestors) {
    const prefAmount = inv.investedAmount * inv.liquidationPreference.multiple;

    if (inv.liquidationPreference.type === "non_participating") {
      const proRata = exitValuation * (inv.ownershipPercent / 100);
      const payout = Math.min(remaining, Math.max(prefAmount, proRata));
      remaining -= payout;

      distributions.push({
        name: inv.name,
        role: "investor",
        amount: Math.round(payout),
        percentOfExit: (payout / exitValuation) * 100,
        returnMultiple: payout / inv.investedAmount,
        calculation: `MAX(pref=${formatK(prefAmount)}, pro-rata=${formatK(proRata)}) = ${formatK(payout)}`,
      });
    } else if (inv.liquidationPreference.type === "participating") {
      const pref = Math.min(remaining, prefAmount);
      remaining -= pref;

      const proRata = remaining * (inv.ownershipPercent / 100);
      remaining -= proRata;

      const totalPayout = pref + proRata;
      distributions.push({
        name: inv.name,
        role: "investor",
        amount: Math.round(totalPayout),
        percentOfExit: (totalPayout / exitValuation) * 100,
        returnMultiple: totalPayout / inv.investedAmount,
        calculation: `Pref ${formatK(pref)} + Pro-rata ${formatK(proRata)} = ${formatK(totalPayout)} (DOUBLE-DIP)`,
      });

      if (inv.liquidationPreference.multiple > 1) {
        warnings.push(
          `${inv.name} a une preference de liquidation ${inv.liquidationPreference.multiple}x PARTICIPATING - impact significatif sur le retour du BA.`
        );
      }
    } else if (inv.liquidationPreference.type === "capped_participating") {
      const pref = Math.min(remaining, prefAmount);
      remaining -= pref;

      const proRata = remaining * (inv.ownershipPercent / 100);
      const cap = (inv.liquidationPreference.cap ?? 3) * inv.investedAmount;
      const totalPayout = Math.min(pref + proRata, cap);
      const actualProRata = totalPayout - pref;
      remaining -= actualProRata;

      distributions.push({
        name: inv.name,
        role: "investor",
        amount: Math.round(totalPayout),
        percentOfExit: (totalPayout / exitValuation) * 100,
        returnMultiple: totalPayout / inv.investedAmount,
        calculation: `MIN(Pref ${formatK(pref)} + Pro-rata ${formatK(actualProRata)}, Cap ${formatK(cap)}) = ${formatK(totalPayout)}`,
      });
    }
  }

  // STEP 2: Founders & ESOP get the rest pro-rata
  const totalFounderESOPPct = input.founders.reduce((sum, f) => sum + f.ownershipPercent, 0) + input.esopPercent;

  if (totalFounderESOPPct > 0) {
    for (const founder of input.founders) {
      const share = remaining * (founder.ownershipPercent / totalFounderESOPPct);
      distributions.push({
        name: founder.name,
        role: "founder",
        amount: Math.round(share),
        percentOfExit: (share / exitValuation) * 100,
        returnMultiple: null,
        calculation: `${(founder.ownershipPercent / totalFounderESOPPct * 100).toFixed(1)}% du reste (${formatK(remaining)}) = ${formatK(share)}`,
      });
    }

    if (input.esopPercent > 0) {
      const esopShare = remaining * (input.esopPercent / totalFounderESOPPct);
      distributions.push({
        name: "ESOP",
        role: "esop",
        amount: Math.round(esopShare),
        percentOfExit: (esopShare / exitValuation) * 100,
        returnMultiple: null,
        calculation: `${(input.esopPercent / totalFounderESOPPct * 100).toFixed(1)}% du reste = ${formatK(esopShare)}`,
      });
    }
  }

  // BA return
  const baInvestor = input.investors.find(i => i.isBA);
  const baDistribution = baInvestor
    ? distributions.find(d => d.name === baInvestor.name)
    : null;
  const baReturn = baDistribution ? {
    amount: baDistribution.amount,
    multiple: baDistribution.returnMultiple ?? 0,
    percentOfExit: baDistribution.percentOfExit,
    calculation: baDistribution.calculation,
  } : null;

  return {
    exitValuation,
    exitMultiple: Math.round(exitMultiple * 10) / 10,
    distributions,
    baReturn,
    warnings,
  };
}

function formatK(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${value.toFixed(0)}`;
}
