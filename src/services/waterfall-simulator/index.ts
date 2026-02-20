/**
 * Waterfall Simulator — Calcul de distribution des proceeds à la sortie
 * + Simulateur de dilution pour l'onglet Conditions
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LiquidationPreference {
  multiple: number;
  type: "non_participating" | "participating" | "capped_participating";
  cap?: number;
}

export interface WaterfallInvestor {
  name: string;
  investedAmount: number;
  ownershipPercent: number;
  liquidationPreference: LiquidationPreference;
  isBA: boolean;
}

export interface WaterfallFounder {
  name: string;
  ownershipPercent: number;
}

export interface WaterfallInput {
  exitValuation: number;
  investors: WaterfallInvestor[];
  founders: WaterfallFounder[];
  esopPercent: number;
}

export interface Distribution {
  name: string;
  amount: number;
  role: "investor" | "founder" | "esop";
  ownershipPercent: number;
}

export interface BAReturn {
  amount: number;
  multiple: number;
}

export interface WaterfallScenario {
  exitValuation: number;
  distributions: Distribution[];
  baReturn: BAReturn | null;
  warnings: string[];
}

export interface DilutionInput {
  preMoneyValuation: number;
  investmentAmount: number;
  existingShares?: number;
  esopPercent?: number;
  existingInvestors?: { name: string; ownershipPercent: number }[];
}

export interface DilutionResult {
  postMoneyValuation: number;
  newInvestorPercent: number;
  founderDilution: number;
  capTable: { name: string; percent: number; type: "founder" | "investor" | "esop" | "new_investor" }[];
}

// ============================================================================
// WATERFALL SIMULATION
// ============================================================================

export function simulateWaterfall(
  input: WaterfallInput,
  exitValuations: number[],
): WaterfallScenario[] {
  return exitValuations.map((exitVal) => simulateOneScenario(input, exitVal));
}

function simulateOneScenario(input: WaterfallInput, exitValuation: number): WaterfallScenario {
  const warnings: string[] = [];
  const totalOwnership =
    input.investors.reduce((s, i) => s + i.ownershipPercent, 0) +
    input.founders.reduce((s, f) => s + f.ownershipPercent, 0) +
    input.esopPercent;

  // Zero exit: everyone gets nothing
  if (exitValuation <= 0) {
    return {
      exitValuation,
      distributions: buildZeroDistributions(input),
      baReturn: input.investors.find((i) => i.isBA) ? { amount: 0, multiple: 0 } : null,
      warnings,
    };
  }

  // Step 1: Non-participating investors decide: convert to common or take pref
  const converts = new Set<string>();
  for (const inv of input.investors) {
    if (inv.liquidationPreference.type === "non_participating") {
      const pref = inv.investedAmount * inv.liquidationPreference.multiple;
      const proRata = (inv.ownershipPercent / totalOwnership) * exitValuation;
      if (proRata > pref) {
        converts.add(inv.name);
      }
    }
    if (inv.liquidationPreference.multiple > 1) {
      warnings.push(
        `${inv.name} a une preference de liquidation ${inv.liquidationPreference.multiple}x (${inv.liquidationPreference.type})`,
      );
    }
  }

  // Step 2: Pay prefs to non-converting non-participating + all participating investors
  let remaining = exitValuation;
  const prefPaid = new Map<string, number>();

  // Sort by multiple descending for pref payment priority
  const sortedInvestors = [...input.investors].sort(
    (a, b) => b.liquidationPreference.multiple - a.liquidationPreference.multiple,
  );

  for (const inv of sortedInvestors) {
    if (converts.has(inv.name)) {
      prefPaid.set(inv.name, 0);
      continue;
    }
    const pref = inv.investedAmount * inv.liquidationPreference.multiple;
    const payment = Math.min(pref, remaining);
    prefPaid.set(inv.name, payment);
    remaining -= payment;
  }

  // Step 3: Distribute remainder pro-rata among equity holders
  // Pool participants: converted investors + participating investors + founders + ESOP
  // Non-converting non-participating investors do NOT participate in the pool
  const poolParticipants: { name: string; ownershipPercent: number }[] = [];

  for (const inv of input.investors) {
    const isNonParticipating = inv.liquidationPreference.type === "non_participating";
    const didConvert = converts.has(inv.name);
    // Pool includes: converted non-participating + all participating/capped
    if (didConvert || !isNonParticipating) {
      poolParticipants.push({ name: inv.name, ownershipPercent: inv.ownershipPercent });
    }
  }
  for (const f of input.founders) {
    poolParticipants.push({ name: f.name, ownershipPercent: f.ownershipPercent });
  }
  if (input.esopPercent > 0) {
    poolParticipants.push({ name: "ESOP", ownershipPercent: input.esopPercent });
  }

  const poolTotalOwnership = poolParticipants.reduce((s, p) => s + p.ownershipPercent, 0);
  const poolShares = new Map<string, number>();

  if (poolTotalOwnership > 0 && remaining > 0) {
    for (const p of poolParticipants) {
      poolShares.set(p.name, (p.ownershipPercent / poolTotalOwnership) * remaining);
    }
  }

  // Step 4: Compute investor totals, enforce caps, redistribute excess
  const investorAmounts = new Map<string, number>();
  let excess = 0;

  for (const inv of input.investors) {
    const pref = prefPaid.get(inv.name) ?? 0;
    const poolShare = poolShares.get(inv.name) ?? 0;

    if (inv.liquidationPreference.type === "non_participating") {
      // Non-participating: takes pref (if didn't convert) or pool share (if converted)
      investorAmounts.set(inv.name, converts.has(inv.name) ? poolShare : pref);
    } else if (inv.liquidationPreference.type === "participating") {
      // Participating: pref + pool share (double-dip)
      investorAmounts.set(inv.name, pref + poolShare);
    } else {
      // Capped participating: min(pref + pool share, cap * invested)
      const capAmount = (inv.liquidationPreference.cap ?? Infinity) * inv.investedAmount;
      const uncapped = pref + poolShare;
      if (uncapped > capAmount) {
        excess += uncapped - capAmount;
        investorAmounts.set(inv.name, capAmount);
      } else {
        investorAmounts.set(inv.name, uncapped);
      }
    }
  }

  // Redistribute excess from capped investors to non-capped pool participants
  if (excess > 0) {
    const nonCappedParticipants = poolParticipants.filter((p) => {
      const inv = input.investors.find((i) => i.name === p.name);
      if (!inv) return true; // founders, ESOP
      if (inv.liquidationPreference.type === "capped_participating") return false;
      if (inv.liquidationPreference.type === "non_participating" && !converts.has(inv.name)) return false;
      return true;
    });

    const nonCappedOwnership = nonCappedParticipants.reduce((s, p) => s + p.ownershipPercent, 0);
    if (nonCappedOwnership > 0) {
      for (const p of nonCappedParticipants) {
        const extraShare = (p.ownershipPercent / nonCappedOwnership) * excess;
        const isInvestor = input.investors.some((i) => i.name === p.name);
        if (isInvestor) {
          investorAmounts.set(p.name, (investorAmounts.get(p.name) ?? 0) + extraShare);
        } else {
          poolShares.set(p.name, (poolShares.get(p.name) ?? 0) + extraShare);
        }
      }
    }
  }

  // Step 5: Build distributions
  const distributions: Distribution[] = [];

  for (const inv of input.investors) {
    distributions.push({
      name: inv.name,
      amount: investorAmounts.get(inv.name) ?? 0,
      role: "investor",
      ownershipPercent: inv.ownershipPercent,
    });
  }

  for (const f of input.founders) {
    distributions.push({
      name: f.name,
      amount: poolShares.get(f.name) ?? 0,
      role: "founder",
      ownershipPercent: f.ownershipPercent,
    });
  }

  if (input.esopPercent > 0) {
    distributions.push({
      name: "ESOP",
      amount: poolShares.get("ESOP") ?? 0,
      role: "esop",
      ownershipPercent: input.esopPercent,
    });
  }

  // BA return
  const baInvestor = input.investors.find((i) => i.isBA);
  let baReturn: BAReturn | null = null;
  if (baInvestor) {
    const baAmount = investorAmounts.get(baInvestor.name) ?? 0;
    baReturn = {
      amount: baAmount,
      multiple: baInvestor.investedAmount > 0 ? baAmount / baInvestor.investedAmount : 0,
    };
  }

  return { exitValuation, distributions, baReturn, warnings };
}

function buildZeroDistributions(input: WaterfallInput): Distribution[] {
  return [
    ...input.investors.map((inv) => ({
      name: inv.name,
      amount: 0,
      role: "investor" as const,
      ownershipPercent: inv.ownershipPercent,
    })),
    ...input.founders.map((f) => ({
      name: f.name,
      amount: 0,
      role: "founder" as const,
      ownershipPercent: f.ownershipPercent,
    })),
    {
      name: "ESOP",
      amount: 0,
      role: "esop" as const,
      ownershipPercent: input.esopPercent,
    },
  ];
}

// ============================================================================
// DILUTION SIMULATION
// ============================================================================

export function simulateDilution(input: DilutionInput): DilutionResult {
  const { preMoneyValuation, investmentAmount, esopPercent = 0, existingInvestors = [] } = input;

  const postMoneyValuation = preMoneyValuation + investmentAmount;
  const newInvestorPercent = (investmentAmount / postMoneyValuation) * 100;

  const existingInvestorsTotal = existingInvestors.reduce((s, i) => s + i.ownershipPercent, 0);
  const foundersPercent = 100 - existingInvestorsTotal - esopPercent;
  const dilutionFactor = preMoneyValuation / postMoneyValuation;

  const capTable: DilutionResult["capTable"] = [];

  const founderPostPercent = foundersPercent * dilutionFactor;
  capTable.push({ name: "Fondateurs", percent: founderPostPercent, type: "founder" });

  for (const inv of existingInvestors) {
    capTable.push({
      name: inv.name,
      percent: inv.ownershipPercent * dilutionFactor,
      type: "investor",
    });
  }

  if (esopPercent > 0) {
    capTable.push({ name: "ESOP", percent: esopPercent * dilutionFactor, type: "esop" });
  }

  capTable.push({ name: "Nouvel investisseur", percent: newInvestorPercent, type: "new_investor" });

  return {
    postMoneyValuation,
    newInvestorPercent,
    founderDilution: foundersPercent - founderPostPercent,
    capTable,
  };
}
