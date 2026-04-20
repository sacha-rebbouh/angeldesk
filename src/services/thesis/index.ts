/**
 * Thesis Service — persistance et comparaison cross-deals
 *
 * Encapsule toutes les interactions avec la table Prisma Thesis :
 *  - create / update (versioning auto-incremente, isLatest mis a jour)
 *  - read (latest, by version, history)
 *  - reconcile (mise a jour post Tier 3 reconciler)
 *  - decision (stop/continue/contest)
 *  - rebuttal (increment count, persist text+verdict)
 *  - dashboard cross-deals (liste filtrable)
 *
 * Usage :
 *  import { thesisService } from "@/services/thesis";
 *  await thesisService.create({ dealId, extractorOutput });
 *  const latest = await thesisService.getLatest(dealId);
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { logger } from "@/lib/logger";
import {
  ensureCorpusSnapshotForDeal,
  loadCorpusSnapshot,
} from "@/services/corpus";
import type {
  ThesisExtractorOutput,
  ThesisReconcilerOutput,
  ThesisDecision,
  ThesisVerdict,
} from "@/agents/thesis/types";
import { REBUTTAL_PER_DEAL_CAP } from "@/agents/thesis/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hash a string into a signed 64-bit integer suitable for pg_advisory_xact_lock.
 * Uses SHA-256 then takes first 8 bytes as int64. Ensures per-dealId lock consistency.
 */
function hashStringToBigInt(input: string): string {
  const hash = createHash("sha256").update(input).digest();
  // Read signed 64-bit BE — returns a BigInt. Stringify for raw SQL injection safety
  // (BigInt is not JSON-safe; we interpolate as a numeric literal below).
  const bigint = hash.readBigInt64BE(0);
  return bigint.toString();
}

// ---------------------------------------------------------------------------
// Types shared
// ---------------------------------------------------------------------------
export interface ThesisRecord {
  id: string;
  dealId: string;
  version: number;
  isLatest: boolean;
  reformulated: string;
  problem: string;
  solution: string;
  whyNow: string;
  moat: string | null;
  pathToExit: string | null;
  verdict: string;
  confidence: number;
  loadBearing: unknown;
  ycLens: unknown;
  thielLens: unknown;
  angelDeskLens: unknown;
  alerts: unknown;
  reconciledAt: Date | null;
  reconciliationJson: unknown;
  decision: string | null;
  decisionAt: Date | null;
  rebuttalText: string | null;
  rebuttalVerdict: string | null;
  rebuttalCount: number;
  sourceDocumentIds: string[];
  sourceHash: string;
  corpusSnapshotId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThesisDashboardFilters {
  userId: string;
  verdict?: ThesisVerdict | "all";
  sector?: string | "all";
  stage?: string | "all";
  search?: string; // on deal name
  sortBy?: "createdAt" | "confidence" | "verdict";
  sortDir?: "asc" | "desc";
  take?: number;
  skip?: number;
}

export interface ThesisDashboardRow {
  thesisId: string;
  dealId: string;
  dealName: string;
  dealSector: string | null;
  dealStage: string | null;
  verdict: string;
  confidence: number;
  reformulated: string;
  decision: string | null;
  createdAt: Date;
}

type ThesisReviewDecision = Exclude<ThesisDecision, "contest">;

export interface ThesisSourceScope {
  corpusSnapshotId: string | null;
  sourceDocumentIds: string[];
  sourceHash: string;
  isCanonicalSnapshot: boolean;
}

export interface BeginRebuttalAttemptResult {
  status: "accepted" | "duplicate" | "in_progress" | "not_contestable" | "cap_reached";
  thesis: ThesisRecord;
}

export interface FinalizeRebuttalAttemptResult {
  status: "finalized" | "duplicate" | "stale" | "conflict" | "not_found";
  thesis: ThesisRecord | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const thesisService = {
  /**
   * Cree une nouvelle these (marque la precedente isLatest=false dans la meme transaction).
   * Retourne la these creee.
   */
  async create(params: {
    dealId: string;
    extractorOutput: ThesisExtractorOutput;
    corpusSnapshotId?: string | null;
    sourceDocumentIds?: string[];
    sourceHash?: string;
  }): Promise<ThesisRecord> {
    const {
      dealId,
      extractorOutput,
      corpusSnapshotId,
      sourceDocumentIds = extractorOutput.sourceDocumentIds,
      sourceHash = extractorOutput.sourceHash,
    } = params;

    // FIX (audit P0 #6) : advisory lock Postgres pour serialiser les create() concurrents
    // par dealId. Empeche que deux extractions simultanees aboutissent a 2 rows isLatest=true.
    // pg_advisory_xact_lock prend un BIGINT ; on hash le dealId pour obtenir un entier 64-bit.
    // Le lock est libere automatiquement a la fin de la transaction.
    const hashForLock = hashStringToBigInt(dealId);
    let resolvedCorpusSnapshotId = corpusSnapshotId ?? null;
    let resolvedSourceDocumentIds = [...sourceDocumentIds];
    let resolvedSourceHash = sourceHash;

    if (!resolvedCorpusSnapshotId && sourceDocumentIds.length > 0) {
      try {
        const snapshot = await ensureCorpusSnapshotForDeal({
          dealId,
          documentIds: sourceDocumentIds,
        });
        resolvedCorpusSnapshotId = snapshot?.id ?? null;
        if (snapshot) {
          resolvedSourceDocumentIds = snapshot.documentIds;
          resolvedSourceHash = snapshot.sourceHash;
        }
      } catch (error) {
        logger.warn(
          { err: error, dealId, sourceHash },
          "Failed to materialize thesis corpus snapshot; continuing with legacy persistence"
        );
      }
    } else if (resolvedCorpusSnapshotId) {
      try {
        const snapshot = await loadCorpusSnapshot(resolvedCorpusSnapshotId);
        if (snapshot) {
          resolvedSourceDocumentIds = snapshot.documentIds;
          resolvedSourceHash = snapshot.sourceHash;
        }
      } catch (error) {
        logger.warn(
          { err: error, dealId, corpusSnapshotId: resolvedCorpusSnapshotId },
          "Failed to load canonical thesis corpus snapshot; keeping provided legacy source scope"
        );
      }
    }

    // Coerce-or-default les champs JSON obligatoires au cas ou le LLM
    // retourne une sortie partielle (Zod fallback path dans base-agent).
    // Prisma rejette undefined sur un champ Json non-null ; on le force a [] / {}.
    const safeLoadBearing = Array.isArray(extractorOutput.loadBearing) ? extractorOutput.loadBearing : [];
    const safeAlerts = Array.isArray(extractorOutput.alerts) ? extractorOutput.alerts : [];
    const emptyLens = (framework: "yc" | "thiel" | "angel-desk") => ({
      framework,
      verdict: "contrasted" as const,
      confidence: 50,
      question: `${framework} lens`,
      claims: [],
      failures: [],
      strengths: [],
      summary: `${framework} lens summary unavailable`,
    });
    const safeYcLens = extractorOutput.ycLens && typeof extractorOutput.ycLens === "object"
      ? extractorOutput.ycLens
      : emptyLens("yc");
    const safeThielLens = extractorOutput.thielLens && typeof extractorOutput.thielLens === "object"
      ? extractorOutput.thielLens
      : emptyLens("thiel");
    const safeAngelDeskLens = extractorOutput.angelDeskLens && typeof extractorOutput.angelDeskLens === "object"
      ? extractorOutput.angelDeskLens
      : emptyLens("angel-desk");
    const safeVerdict: ThesisVerdict = ["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"]
      .includes(extractorOutput.verdict as ThesisVerdict)
      ? (extractorOutput.verdict as ThesisVerdict)
      : "contrasted";
    const safeConfidence = typeof extractorOutput.confidence === "number" && Number.isFinite(extractorOutput.confidence)
      ? Math.max(0, Math.min(100, Math.round(extractorOutput.confidence)))
      : 50;

    return prisma.$transaction(async (tx) => {
      // Acquire advisory lock — bloque si une autre tx tient le meme lock
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${hashForLock})`);

      // Marquer l'ancienne latest comme non-latest (toutes les rows isLatest=true si multiple
      // via race passee → on en force une seule)
      await tx.thesis.updateMany({
        where: { dealId, isLatest: true },
        data: { isLatest: false },
      });

      // Trouver la version max pour incrementer
      const previous = await tx.thesis.findFirst({
        where: { dealId },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const nextVersion = (previous?.version ?? 0) + 1;

      const created = await tx.thesis.create({
        data: {
          dealId,
          version: nextVersion,
          isLatest: true,
          reformulated: extractorOutput.reformulated ?? "",
          problem: extractorOutput.problem ?? "",
          solution: extractorOutput.solution ?? "",
          whyNow: extractorOutput.whyNow ?? "",
          moat: extractorOutput.moat ?? null,
          pathToExit: extractorOutput.pathToExit ?? null,
          verdict: safeVerdict,
          confidence: safeConfidence,
          loadBearing: safeLoadBearing as unknown as Prisma.InputJsonValue,
          ycLens: safeYcLens as unknown as Prisma.InputJsonValue,
          thielLens: safeThielLens as unknown as Prisma.InputJsonValue,
          angelDeskLens: safeAngelDeskLens as unknown as Prisma.InputJsonValue,
          alerts: safeAlerts as unknown as Prisma.InputJsonValue,
          sourceDocumentIds: resolvedSourceDocumentIds,
          sourceHash: resolvedSourceHash,
          corpusSnapshotId: resolvedCorpusSnapshotId,
        },
      });

      return created as unknown as ThesisRecord;
    }, { isolationLevel: "Serializable" });
  },

  async getLatest(dealId: string): Promise<ThesisRecord | null> {
    const record = await prisma.thesis.findFirst({
      where: { dealId, isLatest: true },
      orderBy: { version: "desc" },
    });
    return (record as unknown as ThesisRecord) ?? null;
  },

  async getById(thesisId: string): Promise<ThesisRecord | null> {
    const record = await prisma.thesis.findUnique({
      where: { id: thesisId },
    });
    return (record as unknown as ThesisRecord) ?? null;
  },

  async getHistory(dealId: string, take: number = 20): Promise<ThesisRecord[]> {
    // FIX (audit P2 #18) : cap a 20 versions. Au-dela : historique consultable via
    // endpoint dedie paginé (non-implemente — aucun deal ne devrait en avoir >20).
    const records = await prisma.thesis.findMany({
      where: { dealId },
      orderBy: { version: "desc" },
      take,
    });
    return records as unknown as ThesisRecord[];
  },

  async resolveSourceScope(
    thesisOrRecord: string | Pick<ThesisRecord, "id" | "dealId" | "corpusSnapshotId" | "sourceDocumentIds" | "sourceHash">
  ): Promise<ThesisSourceScope | null> {
    const record =
      typeof thesisOrRecord === "string"
        ? await this.getById(thesisOrRecord)
        : thesisOrRecord;

    if (!record) {
      return null;
    }

    if (record.corpusSnapshotId) {
      const snapshot = await loadCorpusSnapshot(record.corpusSnapshotId);
      if (snapshot) {
        return {
          corpusSnapshotId: snapshot.id,
          sourceDocumentIds: snapshot.documentIds,
          sourceHash: snapshot.sourceHash,
          isCanonicalSnapshot: true,
        };
      }

      logger.warn(
        {
          thesisId: record.id,
          dealId: record.dealId,
          corpusSnapshotId: record.corpusSnapshotId,
        },
        "Falling back to legacy thesis source scope because canonical snapshot could not be loaded"
      );
    }

    return {
      corpusSnapshotId: record.corpusSnapshotId ?? null,
      sourceDocumentIds: record.sourceDocumentIds,
      sourceHash: record.sourceHash,
      isCanonicalSnapshot: false,
    };
  },

  /**
   * Applique les resultats de thesis-reconciler (Tier 3) a la these latest.
   * Met a jour le verdict + confidence + reconcileNotes.
   */
  async applyReconciliation(params: {
    thesisId: string;
    reconcilerOutput: ThesisReconcilerOutput;
  }): Promise<ThesisRecord> {
    const { thesisId, reconcilerOutput } = params;
    const thesis = await prisma.thesis.findUnique({
      where: { id: thesisId },
    });

    if (!thesis) {
      throw new Error(`Thesis ${thesisId} not found`);
    }

    if (!thesis.isLatest) {
      logger.warn(
        { thesisId, dealId: thesis.dealId },
        "Skipping thesis reconciliation because the thesis is no longer latest"
      );
      return thesis as unknown as ThesisRecord;
    }

    const updated = await prisma.thesis.update({
      where: { id: thesisId },
      data: {
        reconciledAt: new Date(),
        verdict: reconcilerOutput.updatedVerdict,
        confidence: reconcilerOutput.updatedConfidence,
        reconciliationJson: reconcilerOutput as unknown as Prisma.InputJsonValue,
      },
    });
    return updated as unknown as ThesisRecord;
  },

  /**
   * Enregistre la decision BA thesis-first (stop | continue).
   * Le flux contest est gere exclusivement par /thesis/rebuttal.
   */
  async recordDecision(params: {
    thesisId: string;
    decision: ThesisReviewDecision;
  }): Promise<ThesisRecord> {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Thesis" WHERE id = ${params.thesisId} FOR UPDATE`;

      const thesis = await tx.thesis.findUnique({
        where: { id: params.thesisId },
      });

      if (!thesis) {
        throw new Error(`Thesis ${params.thesisId} not found`);
      }

      if (thesis.decision === "stop" || thesis.decision === "continue") {
        const error = new Error("Decision already recorded");
        (error as Error & { code?: string }).code = "DECISION_ALREADY_RECORDED";
        throw error;
      }

      const updated = await tx.thesis.update({
        where: { id: params.thesisId },
        data: {
          decision: params.decision,
          decisionAt: new Date(),
        },
      });

      return updated as unknown as ThesisRecord;
    }, { isolationLevel: "Serializable" });
  },

  /**
   * Retourne true si le BA a atteint le cap de rebuttals sur ce deal (anti-abus).
   * Check informatif seulement — beginRebuttalAttempt fait le check atomique definitif.
   */
  async hasReachedRebuttalCap(dealId: string): Promise<boolean> {
    const aggregate = await prisma.thesis.aggregate({
      where: { dealId },
      _sum: { rebuttalCount: true },
    });
    return (aggregate._sum.rebuttalCount ?? 0) >= REBUTTAL_PER_DEAL_CAP;
  },

  /**
   * Reserve de maniere atomique l'unique tentative de contestation
   * autorisee pour la version courante de these.
   */
  async beginRebuttalAttempt(params: {
    dealId: string;
    thesisId: string;
    rebuttalText: string;
  }): Promise<BeginRebuttalAttemptResult | null> {
    const normalizedText = params.rebuttalText.trim();

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Thesis" WHERE id = ${params.thesisId} FOR UPDATE`;

      const thesis = await tx.thesis.findUnique({
        where: { id: params.thesisId },
      });

      if (!thesis || thesis.dealId !== params.dealId) {
        return null;
      }

      if (!thesis.isLatest || thesis.decision === "stop" || thesis.decision === "continue") {
        return {
          status: "not_contestable",
          thesis: thesis as unknown as ThesisRecord,
        };
      }

      if (thesis.rebuttalText) {
        const sameText = thesis.rebuttalText.trim() === normalizedText;
        if (sameText && thesis.rebuttalVerdict) {
          return {
            status: "duplicate",
            thesis: thesis as unknown as ThesisRecord,
          };
        }
        if (sameText) {
          return {
            status: "in_progress",
            thesis: thesis as unknown as ThesisRecord,
          };
        }
        return {
          status: "not_contestable",
          thesis: thesis as unknown as ThesisRecord,
        };
      }

      const aggregate = await tx.thesis.aggregate({
        where: { dealId: params.dealId },
        _sum: { rebuttalCount: true },
      });

      if ((aggregate._sum.rebuttalCount ?? 0) >= REBUTTAL_PER_DEAL_CAP) {
        return {
          status: "cap_reached",
          thesis: thesis as unknown as ThesisRecord,
        };
      }

      const updated = await tx.thesis.update({
        where: { id: params.thesisId },
        data: {
          decision: "contest",
          decisionAt: new Date(),
          rebuttalText: normalizedText,
          rebuttalVerdict: null,
          rebuttalCount: { increment: 1 },
        },
      });

      return {
        status: "accepted",
        thesis: updated as unknown as ThesisRecord,
      };
    }, { isolationLevel: "Serializable" });
  },

  /**
   * Annule une tentative de rebuttal reservee mais non finalisee
   * (echec de debit, crash du judge, emission Inngest KO).
   */
  async cancelRebuttalAttempt(params: {
    thesisId: string;
    rebuttalText: string;
  }): Promise<ThesisRecord | null> {
    const normalizedText = params.rebuttalText.trim();

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Thesis" WHERE id = ${params.thesisId} FOR UPDATE`;

      const thesis = await tx.thesis.findUnique({
        where: { id: params.thesisId },
      });

      if (!thesis) {
        return null;
      }

      if (
        thesis.decision !== "contest" ||
        thesis.rebuttalVerdict !== null ||
        thesis.rebuttalText?.trim() !== normalizedText
      ) {
        return thesis as unknown as ThesisRecord;
      }

      const updated = await tx.thesis.update({
        where: { id: params.thesisId },
        data: {
          decision: null,
          decisionAt: null,
          rebuttalText: null,
          rebuttalVerdict: null,
          rebuttalCount: thesis.rebuttalCount > 0 ? { decrement: 1 } : undefined,
        },
      });

      return updated as unknown as ThesisRecord;
    }, { isolationLevel: "Serializable" });
  },

  /**
   * Persiste le verdict rebuttal-judge (valid | rejected) pour la tentative reservee.
   */
  async finalizeRebuttalAttempt(params: {
    thesisId: string;
    rebuttalText: string;
    verdict: "valid" | "rejected";
  }): Promise<FinalizeRebuttalAttemptResult> {
    const normalizedText = params.rebuttalText.trim();

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Thesis" WHERE id = ${params.thesisId} FOR UPDATE`;

      const thesis = await tx.thesis.findUnique({
        where: { id: params.thesisId },
      });

      if (!thesis) {
        return { status: "not_found", thesis: null };
      }

      if (
        thesis.rebuttalText?.trim() !== normalizedText ||
        thesis.decision !== "contest"
      ) {
        return { status: "stale", thesis: thesis as unknown as ThesisRecord };
      }

      if (thesis.rebuttalVerdict === params.verdict) {
        return { status: "duplicate", thesis: thesis as unknown as ThesisRecord };
      }

      if (thesis.rebuttalVerdict && thesis.rebuttalVerdict !== params.verdict) {
        logger.warn(
          { thesisId: params.thesisId, currentVerdict: thesis.rebuttalVerdict, requestedVerdict: params.verdict },
          "Ignoring conflicting rebuttal verdict finalization"
        );
        return { status: "conflict", thesis: thesis as unknown as ThesisRecord };
      }

      const updated = await tx.thesis.update({
        where: { id: params.thesisId },
        data: { rebuttalVerdict: params.verdict },
      });

      return { status: "finalized", thesis: updated as unknown as ThesisRecord };
    }, { isolationLevel: "Serializable" });
  },

  /**
   * Revertit une tentative finalisee si le dispatch du re-extract echoue
   * apres persistence du verdict. Permet de ne pas laisser une these "valid"
   * sans nouveau run planifie.
   */
  async revertRebuttalAttempt(params: {
    thesisId: string;
    rebuttalText: string;
    expectedVerdict?: "valid" | "rejected";
  }): Promise<ThesisRecord | null> {
    const normalizedText = params.rebuttalText.trim();

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Thesis" WHERE id = ${params.thesisId} FOR UPDATE`;

      const thesis = await tx.thesis.findUnique({
        where: { id: params.thesisId },
      });

      if (!thesis) {
        return null;
      }

      if (
        thesis.rebuttalText?.trim() !== normalizedText ||
        thesis.decision !== "contest"
      ) {
        return thesis as unknown as ThesisRecord;
      }

      if (params.expectedVerdict && thesis.rebuttalVerdict !== params.expectedVerdict) {
        logger.warn(
          {
            thesisId: params.thesisId,
            currentVerdict: thesis.rebuttalVerdict,
            expectedVerdict: params.expectedVerdict,
          },
          "Skipping rebuttal revert because thesis verdict no longer matches"
        );
        return thesis as unknown as ThesisRecord;
      }

      const updated = await tx.thesis.update({
        where: { id: params.thesisId },
        data: {
          decision: null,
          decisionAt: null,
          rebuttalText: null,
          rebuttalVerdict: null,
          rebuttalCount: thesis.rebuttalCount > 0 ? { decrement: 1 } : undefined,
        },
      });

      return updated as unknown as ThesisRecord;
    }, { isolationLevel: "Serializable" });
  },

  /**
   * Dashboard cross-deals : liste toutes les theses du user avec filtres.
   * Paginable. Utilise uniquement les theses isLatest=true (la version courante).
   */
  async listDashboard(filters: ThesisDashboardFilters): Promise<{
    rows: ThesisDashboardRow[];
    total: number;
  }> {
    const dealWhere: Prisma.DealWhereInput = {
      userId: filters.userId,
    };
    if (filters.sector && filters.sector !== "all") {
      dealWhere.sector = filters.sector;
    }
    if (filters.stage && filters.stage !== "all") {
      dealWhere.stage = filters.stage as Prisma.DealWhereInput["stage"];
    }
    if (filters.search && filters.search.trim()) {
      dealWhere.name = { contains: filters.search.trim(), mode: "insensitive" };
    }

    const where: Prisma.ThesisWhereInput = {
      isLatest: true,
      deal: dealWhere,
    };
    if (filters.verdict && filters.verdict !== "all") {
      where.verdict = filters.verdict;
    }

    const sortBy = filters.sortBy ?? "createdAt";
    const sortDir = filters.sortDir ?? "desc";

    const orderBy: Prisma.ThesisOrderByWithRelationInput = sortBy === "createdAt"
      ? { createdAt: sortDir }
      : sortBy === "confidence"
        ? { confidence: sortDir }
        : { verdict: sortDir };

    const [rows, total] = await Promise.all([
      prisma.thesis.findMany({
        where,
        include: {
          deal: {
            select: { name: true, sector: true, stage: true },
          },
        },
        orderBy,
        take: filters.take ?? 50,
        skip: filters.skip ?? 0,
      }),
      prisma.thesis.count({ where }),
    ]);

    return {
      rows: rows.map((r) => ({
        thesisId: r.id,
        dealId: r.dealId,
        dealName: r.deal.name,
        dealSector: r.deal.sector,
        dealStage: r.deal.stage,
        verdict: r.verdict,
        confidence: r.confidence,
        reformulated: r.reformulated,
        decision: r.decision,
        createdAt: r.createdAt,
      })),
      total,
    };
  },

  /**
   * Detecte si la these latest est stale (nouveau doc upload apres extraction).
   * Compare le sourceHash de la these a un hash calcule sur les docs courants.
   */
  async isStale(params: {
    dealId: string;
    currentSourceHash: string;
    corpusSnapshotId?: string | null;
  }): Promise<boolean> {
    const latest = await this.getLatest(params.dealId);
    if (!latest) return false;

    const sourceScope = await this.resolveSourceScope(latest);
    if (!sourceScope) return false;

    if (sourceScope.corpusSnapshotId && params.corpusSnapshotId) {
      return sourceScope.corpusSnapshotId !== params.corpusSnapshotId;
    }

    return sourceScope.sourceHash !== params.currentSourceHash;
  },

  /**
   * Retourne true si le deal a ete analyse mais n'a JAMAIS eu de these extraite
   * (deal pre-migration). Utilise par l'UI pour afficher le badge "Thesis stale".
   */
  async hasThesis(dealId: string): Promise<boolean> {
    const count = await prisma.thesis.count({ where: { dealId } });
    return count > 0;
  },
};

export type ThesisService = typeof thesisService;

// Helper : log rapide des acces (debug)
export function logThesisAccess(action: string, params: Record<string, unknown>) {
  logger.debug({ action, ...params }, "thesis service access");
}
