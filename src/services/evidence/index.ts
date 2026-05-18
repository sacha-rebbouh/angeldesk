export {
  runTemporalExtractor,
  TEMPORAL_EXTRACTOR_VERSION,
  type DerivedFrom,
  type ExtractedTemporalSignal,
  type TemporalExtractorInput,
} from "./temporal-extractor";
export {
  persistTemporalSignals,
  type PersistTemporalSignalsBase,
  type PersistTemporalSignalsResult,
} from "./persist-temporal-signals";
export {
  promoteSourceDateFromSignals,
  getPromotionKindsForDocType,
  pickBestPromotionCandidate,
  type PromoteSourceDateInput,
  type PromoteSourceDateOutcome,
} from "./promote-source-date";
export {
  runEvidenceForDocument,
  type RunEvidenceForDocumentInput,
  type RunEvidenceForDocumentResult,
} from "./run-evidence-for-document";
export {
  ATTACHMENT_LINKER_VERSION,
  detectAttachmentNames,
  findAttachmentMatches,
  linkEmailAttachments,
  persistAttachmentRelations,
  type AttachmentCandidate,
  type AttachmentMatch,
  type LinkEmailAttachmentsInput,
  type PersistAttachmentRelationsInput,
  type PersistAttachmentRelationsResult,
} from "./attachment-linker";
export {
  buildDealEvidenceContext,
  type DocumentEvidenceContext,
  type ResolvedDate,
  type ResolvedPeriod,
  type ResolvedClaim,
  type DetectedAttachment,
  type StaleWarning,
  type StaleWarningKind,
  type BuildDealEvidenceContextOptions,
} from "./build-evidence-context";
export {
  CLAIMS_EXTRACTOR_VERSION,
  runClaimsExtractor,
  type ClaimsExtractorInput,
  type ExtractedClaimSignal,
  type ClaimClassification,
} from "./claims-extractor";
export {
  shouldBackfillDocument,
  type BackfillSkipDecision,
  type BackfillSkipReason,
  type ShouldBackfillOptions,
} from "./backfill-skip-decision";
export {
  buildEvidenceHealthBundle,
  buildEvidenceHealthReport,
  type ContradictionFinding,
  type ContradictionKind,
  type ContradictionSignalRef,
  type DocumentHealthFreshnessEntry,
  type DocumentHealthMissingEntry,
  type DocumentHealthSummary,
  type EvidenceHealthBundle,
  type EvidenceHealthReport,
  type EvidenceHealthSeverity,
  type FreshnessRollup,
  type MissingEvidenceFinding,
  type MissingEvidenceKind,
} from "./health-report";
