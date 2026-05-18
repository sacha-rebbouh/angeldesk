/**
 * Phase 3 — Promotion conditionnelle de signaux EvidenceSignal vers Document.sourceDate.
 *
 * Cadrage strict (Codex round 8) :
 *  - On ne promeut JAMAIS si Document.sourceDate est déjà set (par email
 *    inference, par saisie utilisateur, par une promotion antérieure).
 *  - On ne promeut QUE les signaux HIGH confidence.
 *  - On ne promeut QUE les signaux derivedFrom ∈ {extracted_text, source_metadata}.
 *    Le scope "filename" (MEDIUM confidence) est explicitement exclu.
 *  - L'éligibilité kind→docType est explicite (cf. PROMOTION_KINDS_BY_DOC_TYPE).
 *  - On trace l'origine de la promotion dans Document.sourceMetadata.temporal.
 *  - La mutation de Document.sourceDate invalide automatiquement le corpus
 *    snapshot (cf. src/services/corpus/index.ts:285-289 qui inclut sourceDate
 *    dans le hash).
 */
import type { DocumentType, EvidenceSignal, EvidenceSignalKind, Prisma, PrismaClient } from "@prisma/client";

export interface PromoteSourceDateInput {
  documentId: string;
  dealId: string;
  documentType: DocumentType;
  /** Document.sourceDate currently in DB. If non-null, promotion is skipped. */
  currentSourceDate: Date | null;
}

export type PromoteSourceDateOutcome =
  | { promoted: false; reason: "source_date_already_set" }
  | { promoted: false; reason: "no_eligible_signal" }
  | { promoted: false; reason: "doc_type_not_eligible" }
  | {
      promoted: true;
      newSourceDate: Date;
      signalId: string;
      kind: EvidenceSignalKind;
    };

/**
 * Kinds eligible for promotion to Document.sourceDate, keyed by DocumentType.
 *
 * Decision rationale (audit §3-§5 + Codex round 8) :
 *  - CAP_TABLE → CAP_TABLE_AS_OF (the cap table's "à jour au" date is the
 *    document's canonical reference date).
 *  - FINANCIAL_STATEMENTS → BALANCE_SHEET_AS_OF (the closing-date of the
 *    exercise is the bilan's reference).
 *  - PITCH_DECK / FINANCIAL_MODEL → DOCUMENT_DATE (e.g. footer "Confidential
 *    – March 2026"). Only HIGH confidence (footer) is allowed thanks to the
 *    derivedFrom filter (filename MEDIUM excluded).
 *
 * NOT in the map (intentional):
 *  - EMAIL_SENT_AT: emails get their sourceDate from email-source-inference
 *    at extract-time. No need to promote via this path.
 *  - FINANCIAL_PERIOD_FORECAST / FINANCIAL_PERIOD_ACTUAL: these describe
 *    PERIODS, not the document's own date. BP/forecast docs stay sourceDate=null
 *    by design (Phase 0 audit §3.2 + Codex initial plan).
 *  - VALUATION_CLAIM / METRIC_CLAIM: Phase 6 territory, not temporal.
 *  - DOCUMENT_DATE for other docTypes (LEGAL_DOCS, TERM_SHEET, etc.): not
 *    enabled in Phase 3 — to be discussed if needed.
 */
const PROMOTION_KINDS_BY_DOC_TYPE: Partial<Record<DocumentType, EvidenceSignalKind[]>> = {
  CAP_TABLE: ["CAP_TABLE_AS_OF"],
  FINANCIAL_STATEMENTS: ["BALANCE_SHEET_AS_OF"],
  PITCH_DECK: ["DOCUMENT_DATE"],
  FINANCIAL_MODEL: ["DOCUMENT_DATE"],
};

// Precision rank — DAY is more useful than MONTH which is more useful than YEAR.
const PRECISION_RANK: Record<string, number> = {
  DAY: 3,
  MONTH: 2,
  YEAR: 1,
  RANGE: 1,
  UNKNOWN: 0,
};

export async function promoteSourceDateFromSignals(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: PromoteSourceDateInput
): Promise<PromoteSourceDateOutcome> {
  if (input.currentSourceDate) {
    return { promoted: false, reason: "source_date_already_set" };
  }

  const eligibleKinds = PROMOTION_KINDS_BY_DOC_TYPE[input.documentType];
  if (!eligibleKinds || eligibleKinds.length === 0) {
    return { promoted: false, reason: "doc_type_not_eligible" };
  }

  // Fetch HIGH-confidence signals for this doc on eligible kinds.
  // Scope filter (Codex round 9 P2): allow ONLY run:* and source_metadata.
  // human:* and import:* are deliberately excluded — the cadrage was strict.
  const candidates = await prisma.evidenceSignal.findMany({
    where: {
      documentId: input.documentId,
      dealId: input.dealId,
      kind: { in: eligibleKinds },
      confidence: "HIGH",
      OR: [
        { signalScopeKey: { startsWith: "run:" } },
        { signalScopeKey: "source_metadata" },
      ],
    },
    select: {
      id: true,
      kind: true,
      asOfDate: true,
      precision: true,
      extractorVersion: true,
      signalScopeKey: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });

  const promotable = candidates.filter((s) => s.asOfDate !== null);
  if (promotable.length === 0) {
    return { promoted: false, reason: "no_eligible_signal" };
  }

  // Pick the best candidate: highest precision rank, then most recent createdAt.
  promotable.sort((a, b) => {
    const rank = (PRECISION_RANK[b.precision] ?? 0) - (PRECISION_RANK[a.precision] ?? 0);
    if (rank !== 0) return rank;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const best = promotable[0];

  // Re-read the existing sourceMetadata so we can patch (not replace) it.
  const doc = await prisma.document.findUnique({
    where: { id: input.documentId },
    select: { sourceMetadata: true, sourceDate: true },
  });
  if (!doc) return { promoted: false, reason: "no_eligible_signal" };
  if (doc.sourceDate) return { promoted: false, reason: "source_date_already_set" };

  const existingMeta = (doc.sourceMetadata && typeof doc.sourceMetadata === "object" && !Array.isArray(doc.sourceMetadata))
    ? (doc.sourceMetadata as Record<string, unknown>)
    : {};

  const patchedMeta: Record<string, unknown> = {
    ...existingMeta,
    temporal: {
      promotedBy: "evidence-engine-phase3",
      promotedAt: new Date().toISOString(),
      evidenceSignalId: best.id,
      kind: best.kind,
      precision: best.precision,
      confidence: "HIGH",
      extractorVersion: best.extractorVersion,
      signalScopeKey: best.signalScopeKey,
    },
  };

  // Atomic conditional update (Codex round 9 P1):
  //   updateMany with WHERE sourceDate IS NULL is a single SQL statement —
  //   if a concurrent writer set sourceDate between our re-read above and
  //   this update, the WHERE clause filters our row out and count === 0,
  //   so we honor "JAMAIS écraser sourceDate déjà set" even under race.
  const result = await prisma.document.updateMany({
    where: {
      id: input.documentId,
      dealId: input.dealId,
      sourceDate: null,
    },
    data: {
      sourceDate: best.asOfDate!,
      sourceMetadata: patchedMeta as Prisma.InputJsonValue,
    },
  });

  if (result.count === 0) {
    // A concurrent writer beat us to it.
    return { promoted: false, reason: "source_date_already_set" };
  }

  return {
    promoted: true,
    newSourceDate: best.asOfDate!,
    signalId: best.id,
    kind: best.kind,
  };
}

/**
 * Re-export the internal map for tests + Phase 5 read-path.
 */
export function getPromotionKindsForDocType(docType: DocumentType): EvidenceSignalKind[] {
  return PROMOTION_KINDS_BY_DOC_TYPE[docType] ?? [];
}

/**
 * Pure picker exposed for unit tests + future Phase 5 read-path.
 *
 * The scope filter MUST mirror the SQL query exactly (Codex round 10 P2):
 *   - "run:<id>" → text-derived signals from a specific extraction run
 *   - "source_metadata" → email mirror
 *
 * Excluded by design: "filename" (MEDIUM), "human:*", "import:*". Aligning
 * the picker with the SQL prevents a Phase 5 consumer from accidentally
 * surfacing a manual override or backfill batch as a promotion candidate.
 */
export function pickBestPromotionCandidate(
  candidates: Array<Pick<EvidenceSignal, "id" | "kind" | "asOfDate" | "precision" | "createdAt" | "confidence" | "signalScopeKey">>,
  docType: DocumentType
): typeof candidates[number] | null {
  const eligibleKinds = new Set(getPromotionKindsForDocType(docType));
  if (eligibleKinds.size === 0) return null;
  const filtered = candidates.filter((c) => {
    if (!eligibleKinds.has(c.kind)) return false;
    if (c.confidence !== "HIGH") return false;
    if (c.asOfDate === null) return false;
    if (c.signalScopeKey.startsWith("run:")) return true;
    if (c.signalScopeKey === "source_metadata") return true;
    return false;
  });
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => {
    const rank = (PRECISION_RANK[b.precision] ?? 0) - (PRECISION_RANK[a.precision] ?? 0);
    if (rank !== 0) return rank;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return filtered[0];
}
