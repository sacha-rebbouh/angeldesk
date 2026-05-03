import { Prisma, type FactEvent } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { refreshCurrentFactsView } from "./current-facts";
import { canonicalizeFactKey, getFactKeyDefinition } from "./fact-keys";
import {
  detectFactQualityIssues,
  hasAutoQuarantineIssue,
  summarizeFactQualityIssues,
  type FactQualityIssue,
} from "./quality";
import type { FactCategory, FactSource } from "./types";

const EXCLUDED_EVENT_TYPES = ["DELETED", "SUPERSEDED", "PENDING_REVIEW"] as const;

function toJsonValue(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface SuspiciousCurrentFactCandidate {
  eventId: string;
  dealId: string;
  factKey: string;
  canonicalFactKey: string;
  category: FactCategory;
  source: FactSource;
  displayValue: string;
  value: unknown;
  sourceDocumentId?: string;
  extractedText?: string;
  createdAt: Date;
  issues: FactQualityIssue[];
  autoQuarantineRecommended: boolean;
}

export interface ListSuspiciousCurrentFactsResult {
  scannedDeals: number;
  scannedCurrentFacts: number;
  candidates: SuspiciousCurrentFactCandidate[];
  issueCounts: Record<string, number>;
}

export interface QuarantineSuspiciousCurrentFactsResult extends ListSuspiciousCurrentFactsResult {
  dryRun: boolean;
  targetedCount: number;
  remainingTargetedCount: number;
  quarantinedCount: number;
  skippedCount: number;
  quarantinedEventIds: string[];
  iterations: number;
}

function severityRank(severity: FactQualityIssue["severity"]): number {
  switch (severity) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
    default:
      return 1;
  }
}

function getRawCurrentEvents(events: FactEvent[]): FactEvent[] {
  const latestByRawKey = new Map<string, FactEvent>();

  for (const event of events) {
    const compoundKey = `${event.dealId}:${event.factKey}`;
    if (!latestByRawKey.has(compoundKey)) {
      latestByRawKey.set(compoundKey, event);
    }
  }

  return [...latestByRawKey.values()];
}

function buildCandidateFromEvent(event: FactEvent): SuspiciousCurrentFactCandidate | null {
  const canonicalFactKey = canonicalizeFactKey(event.factKey);
  const category = getFactKeyDefinition(canonicalFactKey)?.category ?? (event.category as FactCategory);
  const issues = detectFactQualityIssues({
    factKey: event.factKey,
    value: event.value,
    displayValue: event.displayValue,
    unit: event.unit,
    extractedText: event.extractedText,
    validAt: event.validAt,
    periodType: event.periodType,
    periodLabel: event.periodLabel,
    reliability: event.reliability as Record<string, unknown> | null,
    truthConfidence: event.truthConfidence,
    source: event.source,
  });

  if (issues.length === 0) {
    return null;
  }

  return {
    eventId: event.id,
    dealId: event.dealId,
    factKey: event.factKey,
    canonicalFactKey,
    category,
    source: event.source as FactSource,
    displayValue: event.displayValue,
    value: event.value,
    sourceDocumentId: event.sourceDocumentId ?? undefined,
    extractedText: event.extractedText ?? undefined,
    createdAt: event.createdAt,
    issues,
    autoQuarantineRecommended: hasAutoQuarantineIssue(issues),
  };
}

export async function listSuspiciousCurrentFacts(params: {
  dealId?: string;
  dealIds?: string[];
  limit?: number;
} = {}): Promise<ListSuspiciousCurrentFactsResult> {
  const targetDealIds = params.dealIds?.length
    ? [...new Set(params.dealIds)]
    : params.dealId
      ? [params.dealId]
      : undefined;

  const events = await prisma.factEvent.findMany({
    where: {
      ...(targetDealIds ? { dealId: { in: targetDealIds } } : {}),
      eventType: { notIn: [...EXCLUDED_EVENT_TYPES] },
    },
    orderBy: [
      { dealId: "asc" },
      { factKey: "asc" },
      { createdAt: "desc" },
    ],
  });

  const rawCurrentEvents = getRawCurrentEvents(events);
  const issueCounts: Record<string, number> = {};

  const candidates = rawCurrentEvents
    .map(buildCandidateFromEvent)
    .filter((candidate): candidate is SuspiciousCurrentFactCandidate => candidate !== null)
    .sort((left, right) => {
      const leftSeverity = Math.max(...left.issues.map((issue) => severityRank(issue.severity)));
      const rightSeverity = Math.max(...right.issues.map((issue) => severityRank(issue.severity)));
      if (leftSeverity !== rightSeverity) {
        return rightSeverity - leftSeverity;
      }
      return right.createdAt.getTime() - left.createdAt.getTime();
    });

  for (const candidate of candidates) {
    for (const issue of candidate.issues) {
      issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
    }
  }

  const limitedCandidates = params.limit ? candidates.slice(0, params.limit) : candidates;

  return {
    scannedDeals: new Set(rawCurrentEvents.map((event) => event.dealId)).size,
    scannedCurrentFacts: rawCurrentEvents.length,
    candidates: limitedCandidates,
    issueCounts,
  };
}

async function quarantineCandidate(
  tx: Prisma.TransactionClient,
  candidate: SuspiciousCurrentFactCandidate,
): Promise<boolean> {
  const current = await tx.factEvent.findUnique({
    where: { id: candidate.eventId },
  });

  if (!current || EXCLUDED_EVENT_TYPES.includes(current.eventType as (typeof EXCLUDED_EVENT_TYPES)[number])) {
    return false;
  }

  await tx.factEvent.update({
    where: { id: current.id },
    data: {
      eventType: "SUPERSEDED",
      reason: current.reason
        ? `${current.reason} | Auto-quarantined: ${summarizeFactQualityIssues(candidate.issues)}`
        : `Auto-quarantined: ${summarizeFactQualityIssues(candidate.issues)}`,
    },
  });

  await tx.factEvent.create({
    data: {
      dealId: current.dealId,
      factKey: current.factKey,
      category: current.category,
      value: toJsonValue(current.value),
      displayValue: current.displayValue,
      unit: current.unit ?? undefined,
      source: current.source,
      sourceDocumentId: current.sourceDocumentId ?? undefined,
      sourceConfidence: current.sourceConfidence,
      truthConfidence: current.truthConfidence ?? undefined,
      extractedText: current.extractedText ?? undefined,
      sourceMetadata: current.sourceMetadata
        ? toJsonValue(current.sourceMetadata)
        : undefined,
      validAt: current.validAt ?? undefined,
      periodType: current.periodType ?? undefined,
      periodLabel: current.periodLabel ?? undefined,
      reliability: current.reliability
        ? toJsonValue(current.reliability)
        : undefined,
      eventType: "PENDING_REVIEW",
      supersedesEventId: current.id,
      createdBy: "system",
      reason: `Auto-quarantined suspicious current fact: ${summarizeFactQualityIssues(candidate.issues)}`,
    },
  });

  return true;
}

export async function quarantineSuspiciousCurrentFacts(params: {
  dealId?: string;
  dealIds?: string[];
  limit?: number;
  dryRun?: boolean;
  maxIterations?: number;
} = {}): Promise<QuarantineSuspiciousCurrentFactsResult> {
  const dryRun = params.dryRun ?? true;
  const maxIterations = params.maxIterations ?? 10;
  let preview = await listSuspiciousCurrentFacts(params);
  const initialTargetedCandidates = preview.candidates.filter((candidate) => candidate.autoQuarantineRecommended);
  let remainingCandidates = initialTargetedCandidates;
  const quarantinedEventIds: string[] = [];
  let quarantinedCount = 0;
  let skippedCount = 0;
  let iterations = 0;

  if (!dryRun) {
    while (remainingCandidates.length > 0 && iterations < maxIterations) {
      iterations += 1;
      let iterationProgress = 0;

      for (const candidate of remainingCandidates) {
        const quarantined = await prisma.$transaction((tx) => quarantineCandidate(tx, candidate));
        if (quarantined) {
          quarantinedCount += 1;
          quarantinedEventIds.push(candidate.eventId);
          iterationProgress += 1;
        } else {
          skippedCount += 1;
        }
      }

      if (iterationProgress === 0) {
        break;
      }

      await refreshCurrentFactsView();
      preview = await listSuspiciousCurrentFacts(params);
      remainingCandidates = preview.candidates.filter((candidate) => candidate.autoQuarantineRecommended);
    }
  } else {
    skippedCount = initialTargetedCandidates.length;
    remainingCandidates = initialTargetedCandidates;
  }

  return {
    ...preview,
    dryRun,
    targetedCount: initialTargetedCandidates.length,
    remainingTargetedCount: remainingCandidates.length,
    quarantinedCount,
    skippedCount,
    quarantinedEventIds,
    iterations,
  };
}
