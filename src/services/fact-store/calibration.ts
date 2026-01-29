import { prisma } from '@/lib/prisma';

// ============================================================================
// CONFIDENCE CALIBRATION ANALYTICS
// ============================================================================

export interface CalibrationMetrics {
  totalFacts: number;
  totalOverrides: number;
  overrideRate: number;

  byConfidenceBand: {
    band: string;
    totalFacts: number;
    overrides: number;
    overrideRate: number;
  }[];

  byCategory: {
    category: string;
    totalFacts: number;
    overrides: number;
    overrideRate: number;
  }[];

  topOverriddenKeys: {
    factKey: string;
    overrides: number;
    avgOriginalConfidence: number;
  }[];
}

/**
 * Calculate calibration metrics for a given time period.
 * Low override rate + high confidence = well calibrated.
 * High override rate + high confidence = over-confident (bad).
 * Low override rate + low confidence = under-confident (conservative but ok).
 */
export async function getCalibrationMetrics(
  since?: Date
): Promise<CalibrationMetrics> {
  const sinceDate = since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [allFacts, overrides] = await Promise.all([
    prisma.factEvent.findMany({
      where: {
        createdBy: { not: 'ba' },
        eventType: 'CREATED',
        createdAt: { gte: sinceDate },
      },
      select: {
        id: true,
        factKey: true,
        category: true,
        sourceConfidence: true,
        dealId: true,
      },
    }),
    prisma.factEvent.findMany({
      where: {
        source: 'BA_OVERRIDE',
        createdAt: { gte: sinceDate },
      },
      select: {
        factKey: true,
        dealId: true,
        supersedesEventId: true,
      },
    }),
  ]);

  const overriddenKeys = new Set(
    overrides.map(o => `${o.dealId}:${o.factKey}`)
  );

  const totalFacts = allFacts.length;
  const totalOverrides = overrides.length;

  // By confidence band
  const bands = [
    { label: '95-100', min: 95, max: 100 },
    { label: '85-94', min: 85, max: 94 },
    { label: '70-84', min: 70, max: 84 },
  ];

  const byConfidenceBand = bands.map(band => {
    const factsInBand = allFacts.filter(
      f => f.sourceConfidence >= band.min && f.sourceConfidence <= band.max
    );
    const overridesInBand = factsInBand.filter(
      f => overriddenKeys.has(`${f.dealId}:${f.factKey}`)
    );
    return {
      band: band.label,
      totalFacts: factsInBand.length,
      overrides: overridesInBand.length,
      overrideRate: factsInBand.length > 0
        ? Math.round((overridesInBand.length / factsInBand.length) * 100 * 10) / 10
        : 0,
    };
  });

  // By category
  const categories = [...new Set(allFacts.map(f => f.category))];
  const byCategory = categories.map(category => {
    const factsInCat = allFacts.filter(f => f.category === category);
    const overridesInCat = factsInCat.filter(
      f => overriddenKeys.has(`${f.dealId}:${f.factKey}`)
    );
    return {
      category,
      totalFacts: factsInCat.length,
      overrides: overridesInCat.length,
      overrideRate: factsInCat.length > 0
        ? Math.round((overridesInCat.length / factsInCat.length) * 100 * 10) / 10
        : 0,
    };
  }).sort((a, b) => b.overrideRate - a.overrideRate);

  // Top overridden keys
  const keyOverrides = new Map<string, { count: number; confidences: number[] }>();
  for (const fact of allFacts) {
    if (overriddenKeys.has(`${fact.dealId}:${fact.factKey}`)) {
      const existing = keyOverrides.get(fact.factKey) ?? { count: 0, confidences: [] };
      existing.count++;
      existing.confidences.push(fact.sourceConfidence);
      keyOverrides.set(fact.factKey, existing);
    }
  }

  const topOverriddenKeys = [...keyOverrides.entries()]
    .map(([factKey, data]) => ({
      factKey,
      overrides: data.count,
      avgOriginalConfidence: Math.round(
        data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length
      ),
    }))
    .sort((a, b) => b.overrides - a.overrides)
    .slice(0, 10);

  return {
    totalFacts,
    totalOverrides,
    overrideRate: totalFacts > 0
      ? Math.round((totalOverrides / totalFacts) * 100 * 10) / 10
      : 0,
    byConfidenceBand,
    byCategory,
    topOverriddenKeys,
  };
}
