import { z } from "zod";
import { DealStage, DealStatus, FundingInstrument, Prisma } from "@prisma/client";
import type { ExtractedFact, FactCategory } from "@/services/fact-store/types";

export const updateDealSchema = z.object({
  name: z.string().min(1).optional(),
  companyName: z.string().nullable().optional(),
  website: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  description: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  stage: z.nativeEnum(DealStage).nullable().optional(),
  instrument: z.nativeEnum(FundingInstrument).nullable().optional(),
  geography: z.string().nullable().optional(),
  arr: z.number().positive().nullable().optional(),
  growthRate: z.number().nullable().optional(),
  amountRequested: z.number().positive().nullable().optional(),
  valuationPre: z.number().positive().nullable().optional(),
  status: z.nativeEnum(DealStatus).nullable().optional(),
});

export type UpdateDealInput = z.infer<typeof updateDealSchema>;

export type ManualFactOverride = {
  factKey: string;
  category: FactCategory;
  value: unknown;
  displayValue: string;
  clear: boolean;
};

const FACT_OVERRIDE_DEFS: Partial<
  Record<
    keyof UpdateDealInput,
    {
      factKey: string;
      category: FactCategory;
      displayValue: (value: NonNullable<UpdateDealInput[keyof UpdateDealInput]>) => string;
    }
  >
> = {
  companyName: {
    factKey: "company.name",
    category: "OTHER",
    displayValue: (value) => String(value),
  },
  website: {
    factKey: "other.website",
    category: "OTHER",
    displayValue: (value) => String(value),
  },
  sector: {
    factKey: "other.sector",
    category: "OTHER",
    displayValue: (value) => String(value),
  },
  stage: {
    factKey: "product.stage",
    category: "PRODUCT",
    displayValue: (value) => String(value),
  },
  geography: {
    factKey: "market.geography_primary",
    category: "MARKET",
    displayValue: (value) => String(value),
  },
  description: {
    factKey: "product.tagline",
    category: "PRODUCT",
    displayValue: (value) => String(value),
  },
  arr: {
    factKey: "financial.arr",
    category: "FINANCIAL",
    displayValue: (value) => String(value),
  },
  growthRate: {
    factKey: "financial.revenue_growth_yoy",
    category: "FINANCIAL",
    displayValue: (value) => `${value}%`,
  },
  amountRequested: {
    factKey: "financial.amount_raising",
    category: "FINANCIAL",
    displayValue: (value) => String(value),
  },
  valuationPre: {
    factKey: "financial.valuation_pre",
    category: "FINANCIAL",
    displayValue: (value) => String(value),
  },
};

function deepEqualJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildDealUpdateData(
  validatedData: UpdateDealInput,
  presentKeys: Set<string>
): Prisma.DealUpdateInput {
  const data: Prisma.DealUpdateInput = {};

  if (presentKeys.has("name")) data.name = validatedData.name;
  if (presentKeys.has("companyName")) data.companyName = validatedData.companyName ?? null;
  if (presentKeys.has("website")) data.website = validatedData.website ? validatedData.website : null;
  if (presentKeys.has("description")) data.description = validatedData.description ?? null;
  if (presentKeys.has("sector")) data.sector = validatedData.sector ?? null;
  if (presentKeys.has("stage")) data.stage = validatedData.stage ?? null;
  if (presentKeys.has("instrument")) data.instrument = validatedData.instrument ?? null;
  if (presentKeys.has("geography")) data.geography = validatedData.geography ?? null;
  if (presentKeys.has("arr")) data.arr = validatedData.arr ?? null;
  if (presentKeys.has("growthRate")) data.growthRate = validatedData.growthRate ?? null;
  if (presentKeys.has("amountRequested")) data.amountRequested = validatedData.amountRequested ?? null;
  if (presentKeys.has("valuationPre")) data.valuationPre = validatedData.valuationPre ?? null;
  if (presentKeys.has("status") && validatedData.status != null) {
    data.status = validatedData.status;
  }

  return data;
}

export function buildManualFactOverrides(
  validatedData: UpdateDealInput,
  presentKeys: Set<string>
): ManualFactOverride[] {
  const overrides: ManualFactOverride[] = [];

  for (const [field, definition] of Object.entries(FACT_OVERRIDE_DEFS) as Array<
    [keyof UpdateDealInput, NonNullable<(typeof FACT_OVERRIDE_DEFS)[keyof UpdateDealInput]>]
  >) {
    if (!presentKeys.has(field)) continue;

    const rawValue = validatedData[field];
    const normalizedValue = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    const clear = normalizedValue == null || normalizedValue === "";

    overrides.push({
      factKey: definition.factKey,
      category: definition.category,
      value: clear ? null : normalizedValue,
      displayValue: clear ? "" : definition.displayValue(normalizedValue as never),
      clear,
    });
  }

  return overrides;
}

export async function persistManualFactOverrides(
  tx: Prisma.TransactionClient,
  dealId: string,
  overrides: ManualFactOverride[],
  reasonPrefix = "Updated from deal information panel"
): Promise<void> {
  for (const override of overrides) {
    const existingFact = await tx.factEvent.findFirst({
      where: {
        dealId,
        factKey: override.factKey,
        eventType: {
          notIn: ["DELETED", "SUPERSEDED", "PENDING_REVIEW"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (override.clear) {
      if (!existingFact) continue;

      await tx.factEvent.update({
        where: { id: existingFact.id },
        data: { eventType: "SUPERSEDED" },
      });

      await tx.factEvent.create({
        data: {
          dealId,
          factKey: override.factKey,
          category: override.category,
          value: Prisma.JsonNull,
          displayValue: "",
          source: "BA_OVERRIDE",
          sourceConfidence: 100,
          truthConfidence: 100,
          eventType: "DELETED",
          supersedesEventId: existingFact.id,
          createdBy: "ba",
          reason: `${reasonPrefix}: cleared`,
        },
      });

      continue;
    }

    if (
      existingFact &&
      existingFact.source === "BA_OVERRIDE" &&
      deepEqualJson(existingFact.value, override.value) &&
      existingFact.displayValue === override.displayValue
    ) {
      continue;
    }

    if (existingFact) {
      await tx.factEvent.update({
        where: { id: existingFact.id },
        data: { eventType: "SUPERSEDED" },
      });
    }

    const fact: ExtractedFact = {
      factKey: override.factKey,
      category: override.category,
      value: override.value,
      displayValue: override.displayValue,
      source: "BA_OVERRIDE",
      sourceConfidence: 100,
      truthConfidence: 100,
    };

    await tx.factEvent.create({
      data: {
        dealId,
        factKey: fact.factKey,
        category: fact.category,
        value: fact.value as Prisma.InputJsonValue,
        displayValue: fact.displayValue,
        source: fact.source,
        sourceConfidence: fact.sourceConfidence,
        truthConfidence: fact.truthConfidence,
        eventType: "CREATED",
        supersedesEventId: existingFact?.id,
        createdBy: "ba",
        reason: reasonPrefix,
      },
    });
  }
}
