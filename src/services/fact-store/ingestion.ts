import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { refreshCurrentFactsView, getCurrentFacts } from "./current-facts";
import { matchFactsBatch } from "./matching";
import type {
  ContradictionInfo,
  CurrentFact,
  ExtractedFact,
} from "./types";
import { canonicalizeFactKey, getFactKeyDefinition } from "./fact-keys";

export interface PersistExtractedFactsResult {
  success: boolean;
  createdCount: number;
  supersededCount: number;
  ignoredCount: number;
  pendingReviewCount: number;
  contradictions: ContradictionInfo[];
  currentFacts: CurrentFact[];
  error?: string;
}

function toJsonValue(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildFactEventCreateData(
  dealId: string,
  fact: ExtractedFact,
  eventType: string,
  createdBy: "system" | "ba",
  supersedesEventId?: string,
  reason?: string
): Prisma.FactEventUncheckedCreateInput {
  const canonicalFactKey = canonicalizeFactKey(fact.factKey);
  const definition = getFactKeyDefinition(canonicalFactKey);

  if (!definition) {
    throw new Error(`Unknown factKey "${fact.factKey}"`);
  }

  const isArrayValue = Array.isArray(fact.value);
  const isObjectValue =
    typeof fact.value === "object" &&
    fact.value !== null &&
    !isArrayValue;

  if (definition.type === "array") {
    if (!isArrayValue) {
      throw new Error(`Fact "${canonicalFactKey}" expects an array value`);
    }
  } else if (isArrayValue || isObjectValue) {
    throw new Error(`Fact "${canonicalFactKey}" expects a scalar value, received structured data`);
  }

  const displayValue = fact.displayValue && fact.displayValue !== "[object Object]"
    ? fact.displayValue
    : typeof fact.value === "string"
      ? fact.value
      : String(fact.value);

  return {
    dealId,
    factKey: canonicalFactKey,
    category: definition.category,
    value: toJsonValue(fact.value),
    displayValue,
    unit: fact.unit ?? definition.unit,
    source: fact.source,
    sourceDocumentId: fact.sourceDocumentId,
    sourceConfidence: fact.sourceConfidence,
    truthConfidence: fact.truthConfidence,
    extractedText: fact.extractedText,
    sourceMetadata: fact.sourceMetadata ? toJsonValue(fact.sourceMetadata) : undefined,
    validAt: fact.validAt,
    periodType: fact.periodType,
    periodLabel: fact.periodLabel,
    reliability: fact.reliability ? toJsonValue(fact.reliability) : undefined,
    eventType,
    supersedesEventId,
    createdBy,
    reason,
  };
}

function dedupeFactsByKey(facts: ExtractedFact[]): ExtractedFact[] {
  const byKey = new Map<string, ExtractedFact>();

  for (const fact of facts) {
    const canonicalFactKey = canonicalizeFactKey(fact.factKey);
    const normalizedFact = canonicalFactKey === fact.factKey
      ? fact
      : { ...fact, factKey: canonicalFactKey };
    const existing = byKey.get(canonicalFactKey);
    if (!existing || fact.sourceConfidence >= existing.sourceConfidence) {
      byKey.set(canonicalFactKey, normalizedFact);
    }
  }

  return Array.from(byKey.values());
}

export async function persistExtractedFactsWithMatching(
  dealId: string,
  facts: ExtractedFact[],
  createdBy: "system" | "ba" = "system"
): Promise<PersistExtractedFactsResult> {
  const dedupedFacts = dedupeFactsByKey(facts);

  if (dedupedFacts.length === 0) {
    return {
      success: true,
      createdCount: 0,
      supersededCount: 0,
      ignoredCount: 0,
      pendingReviewCount: 0,
      contradictions: [],
      currentFacts: await getCurrentFacts(dealId),
    };
  }

  try {
    const existingFacts = await getCurrentFacts(dealId);
    const matched = matchFactsBatch(dedupedFacts, existingFacts);
    const keysToUpdate = matched.toSupersede.map(({ fact }) => fact.factKey);

    const currentEvents = keysToUpdate.length > 0
      ? await prisma.factEvent.findMany({
          where: {
            dealId,
            factKey: { in: keysToUpdate },
            eventType: { notIn: ["DELETED", "SUPERSEDED", "PENDING_REVIEW"] },
          },
          orderBy: [{ factKey: "asc" }, { createdAt: "desc" }],
        })
      : [];

    const currentEventByKey = new Map<string, (typeof currentEvents)[number]>();
    for (const event of currentEvents) {
      if (!currentEventByKey.has(event.factKey)) {
        currentEventByKey.set(event.factKey, event);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const { fact } of matched.newFacts) {
        await tx.factEvent.create({
          data: buildFactEventCreateData(dealId, fact, "CREATED", createdBy),
        });
      }

      for (const { fact, result } of matched.toSupersede) {
        const currentEvent = currentEventByKey.get(fact.factKey);
        if (currentEvent) {
          await tx.factEvent.update({
            where: { id: currentEvent.id },
            data: { eventType: "SUPERSEDED" },
          });
        }

        await tx.factEvent.create({
          data: buildFactEventCreateData(
            dealId,
            fact,
            "CREATED",
            createdBy,
            currentEvent?.id,
            result.reason
          ),
        });
      }

      for (const { fact, result } of matched.needsReview) {
        await tx.factEvent.create({
          data: buildFactEventCreateData(
            dealId,
            fact,
            "PENDING_REVIEW",
            createdBy,
            undefined,
            result.reason
          ),
        });
      }
    });

    await refreshCurrentFactsView();

    return {
      success: true,
      createdCount: matched.newFacts.length,
      supersededCount: matched.toSupersede.length,
      ignoredCount: matched.toIgnore.length,
      pendingReviewCount: matched.needsReview.length,
      contradictions: matched.contradictions,
      currentFacts: await getCurrentFacts(dealId),
    };
  } catch (error) {
    return {
      success: false,
      createdCount: 0,
      supersededCount: 0,
      ignoredCount: 0,
      pendingReviewCount: 0,
      contradictions: [],
      currentFacts: [],
      error: error instanceof Error ? error.message : "Unknown error persisting extracted facts",
    };
  }
}
