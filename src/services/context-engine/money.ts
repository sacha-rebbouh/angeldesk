import type { CompetitiveLandscape, DealIntelligence } from "./types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  GBP: "£",
  USD: "$",
};

function formatCompactAmount(value: number): string {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (absoluteValue >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (absoluteValue >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return String(value);
}

export function formatContextMoney(value: number, currency?: string): string {
  const amount = formatCompactAmount(value);
  const normalizedCurrency = currency?.trim().toUpperCase();

  if (!normalizedCurrency) {
    return `${amount} (devise non précisée)`;
  }

  const symbol = CURRENCY_SYMBOLS[normalizedCurrency];
  return symbol ? `${symbol}${amount}` : `${normalizedCurrency} ${amount}`;
}

export function formatDealIntelligenceAmountsForPrompt(
  dealIntelligence: DealIntelligence
): unknown {
  return {
    ...dealIntelligence,
    similarDeals: (dealIntelligence.similarDeals ?? []).map((deal) => ({
      ...deal,
      fundingAmount: formatContextMoney(deal.fundingAmount, deal.currency),
    })),
  };
}

export function formatCompetitiveLandscapeAmountsForPrompt(
  landscape: CompetitiveLandscape
): unknown {
  return {
    ...landscape,
    competitors: (landscape.competitors ?? []).map((competitor) => ({
      ...competitor,
      totalFunding: typeof competitor.totalFunding === "number"
        ? formatContextMoney(competitor.totalFunding, competitor.currency)
        : undefined,
      lastRoundAmount: typeof competitor.lastRoundAmount === "number"
        ? formatContextMoney(competitor.lastRoundAmount, competitor.currency)
        : undefined,
    })),
  };
}
