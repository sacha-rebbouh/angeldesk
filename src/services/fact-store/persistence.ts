// ═══════════════════════════════════════════════════════════════════════
// FACT STORE - PERSISTENCE
// CRUD operations for FactEvent using Prisma
// Event sourcing pattern: facts are immutable, append-only
// ═══════════════════════════════════════════════════════════════════════

import { prisma } from '@/lib/prisma';
import type { FactEvent } from '@prisma/client';
import type {
  ExtractedFact,
  FactEventType,
  FactCategory,
  FactEventRecord,
} from './types';

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface GetFactEventsOptions {
  factKey?: string;
  category?: FactCategory;
  limit?: number;
  includeSuperseded?: boolean;
  eventType?: FactEventType;
}

export interface CreateFactEventResult {
  success: boolean;
  event?: FactEvent;
  error?: string;
}

export interface MarkSupersededResult {
  success: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Creates a new FactEvent in the database.
 * Facts are immutable - once created, they can only be superseded, not modified.
 *
 * @param dealId - The deal this fact belongs to
 * @param fact - The extracted fact data
 * @param eventType - Type of event (CREATED, SUPERSEDED, etc.)
 * @param createdBy - Who created this fact ('system' or 'ba')
 * @param supersedesEventId - Optional ID of the event this supersedes
 * @param reason - Optional reason for the event
 * @returns CreateFactEventResult with the created event or error
 */
export async function createFactEvent(
  dealId: string,
  fact: ExtractedFact,
  eventType: FactEventType,
  createdBy: 'system' | 'ba',
  supersedesEventId?: string,
  reason?: string
): Promise<CreateFactEventResult> {
  try {
    const event = await prisma.factEvent.create({
      data: {
        dealId,
        factKey: fact.factKey,
        category: fact.category,
        value: fact.value as object,
        displayValue: fact.displayValue,
        unit: fact.unit,
        source: fact.source,
        sourceDocumentId: fact.sourceDocumentId,
        sourceConfidence: fact.sourceConfidence,
        extractedText: fact.extractedText,
        eventType,
        supersedesEventId,
        createdBy,
        reason,
      },
    });

    return { success: true, event };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error creating fact event';
    return { success: false, error: message };
  }
}

/**
 * Creates multiple FactEvents in a single transaction.
 * Useful for batch extraction from documents.
 *
 * @param dealId - The deal these facts belong to
 * @param facts - Array of extracted facts
 * @param eventType - Type of event for all facts
 * @param createdBy - Who created these facts
 * @returns Array of created events
 */
export async function createFactEventsBatch(
  dealId: string,
  facts: ExtractedFact[],
  eventType: FactEventType,
  createdBy: 'system' | 'ba'
): Promise<{ success: boolean; events?: FactEvent[]; error?: string }> {
  try {
    const events = await prisma.$transaction(
      facts.map((fact) =>
        prisma.factEvent.create({
          data: {
            dealId,
            factKey: fact.factKey,
            category: fact.category,
            value: fact.value as object,
            displayValue: fact.displayValue,
            unit: fact.unit,
            source: fact.source,
            sourceDocumentId: fact.sourceDocumentId,
            sourceConfidence: fact.sourceConfidence,
            extractedText: fact.extractedText,
            eventType,
            createdBy,
          },
        })
      )
    );

    return { success: true, events };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error creating fact events batch';
    return { success: false, error: message };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retrieves fact events for a deal with optional filtering.
 *
 * @param dealId - The deal to get events for
 * @param options - Optional filters (factKey, category, limit, etc.)
 * @returns Array of FactEvents
 */
export async function getFactEvents(
  dealId: string,
  options: GetFactEventsOptions = {}
): Promise<FactEvent[]> {
  const { factKey, category, limit, includeSuperseded = true, eventType } = options;

  const where: Record<string, unknown> = { dealId };

  if (factKey) {
    where.factKey = factKey;
  }

  if (category) {
    where.category = category;
  }

  if (eventType) {
    where.eventType = eventType;
  }

  // If not including superseded, filter out events that have been superseded
  if (!includeSuperseded) {
    // Get IDs of superseded events
    const supersededEventIds = await prisma.factEvent.findMany({
      where: {
        dealId,
        supersedesEventId: { not: null },
      },
      select: { supersedesEventId: true },
    });

    const supersededIds = supersededEventIds
      .map((e) => e.supersedesEventId)
      .filter((id): id is string => id !== null);

    if (supersededIds.length > 0) {
      where.id = { notIn: supersededIds };
    }
  }

  const events = await prisma.factEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return events;
}

/**
 * Retrieves a single fact event by ID.
 *
 * @param id - The event ID
 * @returns The FactEvent or null if not found
 */
export async function getFactEventById(id: string): Promise<FactEvent | null> {
  return prisma.factEvent.findUnique({
    where: { id },
  });
}

/**
 * Gets all events for a specific fact key within a deal.
 * Useful for building the event history of a fact.
 *
 * @param dealId - The deal ID
 * @param factKey - The fact key (e.g., 'financial.arr')
 * @returns Array of events ordered by creation date
 */
export async function getFactEventHistory(
  dealId: string,
  factKey: string
): Promise<FactEvent[]> {
  return prisma.factEvent.findMany({
    where: {
      dealId,
      factKey,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Gets the latest event for each unique factKey in a deal.
 * This is the foundation for computing current facts.
 *
 * @param dealId - The deal ID
 * @returns Map of factKey to latest FactEvent
 */
export async function getLatestFactEvents(
  dealId: string
): Promise<Map<string, FactEvent>> {
  const events = await prisma.factEvent.findMany({
    where: { dealId },
    orderBy: { createdAt: 'desc' },
  });

  const latestByKey = new Map<string, FactEvent>();

  for (const event of events) {
    if (!latestByKey.has(event.factKey)) {
      latestByKey.set(event.factKey, event);
    }
  }

  return latestByKey;
}

// ═══════════════════════════════════════════════════════════════════════
// UPDATE (Supersession)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Marks an event as superseded by creating a new SUPERSEDED event.
 * In event sourcing, we don't modify existing events - we create new ones.
 *
 * @param eventId - The event being superseded
 * @param newEventId - The new event that supersedes it
 * @param reason - Reason for supersession
 * @returns Result indicating success or failure
 */
export async function markAsSuperseded(
  eventId: string,
  newEventId: string,
  reason: string
): Promise<MarkSupersededResult> {
  try {
    // Verify both events exist
    const [originalEvent, newEvent] = await Promise.all([
      prisma.factEvent.findUnique({ where: { id: eventId } }),
      prisma.factEvent.findUnique({ where: { id: newEventId } }),
    ]);

    if (!originalEvent) {
      return { success: false, error: `Original event ${eventId} not found` };
    }

    if (!newEvent) {
      return { success: false, error: `New event ${newEventId} not found` };
    }

    // Update the new event to reference the superseded event
    await prisma.factEvent.update({
      where: { id: newEventId },
      data: {
        supersedesEventId: eventId,
        reason,
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error marking event as superseded';
    return { success: false, error: message };
  }
}

/**
 * Creates a supersession event - a new fact that supersedes an existing one.
 * This is the primary way to "update" a fact in event sourcing.
 *
 * @param dealId - The deal ID
 * @param newFact - The new fact value
 * @param supersededEventId - The event being superseded
 * @param createdBy - Who created this supersession
 * @param reason - Reason for the supersession
 * @returns The created supersession event
 */
export async function createSupersessionEvent(
  dealId: string,
  newFact: ExtractedFact,
  supersededEventId: string,
  createdBy: 'system' | 'ba',
  reason: string
): Promise<CreateFactEventResult> {
  return createFactEvent(
    dealId,
    newFact,
    'SUPERSEDED',
    createdBy,
    supersededEventId,
    reason
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Converts a Prisma FactEvent to a FactEventRecord for API consumption.
 *
 * @param event - The Prisma FactEvent
 * @returns A FactEventRecord
 */
export function toFactEventRecord(event: FactEvent): FactEventRecord {
  return {
    id: event.id,
    factKey: event.factKey,
    category: event.category as FactCategory,
    value: event.value,
    displayValue: event.displayValue,
    unit: event.unit ?? undefined,
    source: event.source as ExtractedFact['source'],
    sourceDocumentId: event.sourceDocumentId ?? undefined,
    sourceConfidence: event.sourceConfidence,
    extractedText: event.extractedText ?? undefined,
    eventType: event.eventType as FactEventType,
    supersedesEventId: event.supersedesEventId ?? undefined,
    createdAt: event.createdAt,
    createdBy: event.createdBy as 'system' | 'ba',
    reason: event.reason ?? undefined,
  };
}

/**
 * Gets statistics about fact events for a deal.
 *
 * @param dealId - The deal ID
 * @returns Object with counts by category and event type
 */
export async function getFactEventStats(dealId: string): Promise<{
  totalEvents: number;
  byCategory: Record<string, number>;
  byEventType: Record<string, number>;
  uniqueFactKeys: number;
}> {
  const events = await prisma.factEvent.findMany({
    where: { dealId },
    select: {
      category: true,
      eventType: true,
      factKey: true,
    },
  });

  const byCategory: Record<string, number> = {};
  const byEventType: Record<string, number> = {};
  const factKeys = new Set<string>();

  for (const event of events) {
    byCategory[event.category] = (byCategory[event.category] || 0) + 1;
    byEventType[event.eventType] = (byEventType[event.eventType] || 0) + 1;
    factKeys.add(event.factKey);
  }

  return {
    totalEvents: events.length,
    byCategory,
    byEventType,
    uniqueFactKeys: factKeys.size,
  };
}

/**
 * Checks if a fact key already has events for a deal.
 *
 * @param dealId - The deal ID
 * @param factKey - The fact key to check
 * @returns True if events exist for this fact key
 */
export async function hasFactEvents(
  dealId: string,
  factKey: string
): Promise<boolean> {
  const count = await prisma.factEvent.count({
    where: {
      dealId,
      factKey,
    },
  });

  return count > 0;
}

/**
 * Gets all fact keys that have events for a deal.
 *
 * @param dealId - The deal ID
 * @returns Array of unique fact keys
 */
export async function getFactKeysForDeal(dealId: string): Promise<string[]> {
  const events = await prisma.factEvent.findMany({
    where: { dealId },
    select: { factKey: true },
    distinct: ['factKey'],
  });

  return events.map((e) => e.factKey);
}
