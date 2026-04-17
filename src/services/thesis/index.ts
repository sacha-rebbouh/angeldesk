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
  }): Promise<ThesisRecord> {
    const { dealId, extractorOutput } = params;

    // FIX (audit P0 #6) : advisory lock Postgres pour serialiser les create() concurrents
    // par dealId. Empeche que deux extractions simultanees aboutissent a 2 rows isLatest=true.
    // pg_advisory_xact_lock prend un BIGINT ; on hash le dealId pour obtenir un entier 64-bit.
    // Le lock est libere automatiquement a la fin de la transaction.
    const hashForLock = hashStringToBigInt(dealId);

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
          reformulated: extractorOutput.reformulated,
          problem: extractorOutput.problem,
          solution: extractorOutput.solution,
          whyNow: extractorOutput.whyNow,
          moat: extractorOutput.moat,
          pathToExit: extractorOutput.pathToExit,
          verdict: extractorOutput.verdict,
          confidence: extractorOutput.confidence,
          loadBearing: extractorOutput.loadBearing as unknown as Prisma.InputJsonValue,
          ycLens: extractorOutput.ycLens as unknown as Prisma.InputJsonValue,
          thielLens: extractorOutput.thielLens as unknown as Prisma.InputJsonValue,
          angelDeskLens: extractorOutput.angelDeskLens as unknown as Prisma.InputJsonValue,
          alerts: extractorOutput.alerts as unknown as Prisma.InputJsonValue,
          sourceDocumentIds: extractorOutput.sourceDocumentIds,
          sourceHash: extractorOutput.sourceHash,
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

  /**
   * Applique les resultats de thesis-reconciler (Tier 3) a la these latest.
   * Met a jour le verdict + confidence + reconcileNotes.
   */
  async applyReconciliation(params: {
    thesisId: string;
    reconcilerOutput: ThesisReconcilerOutput;
  }): Promise<ThesisRecord> {
    const { thesisId, reconcilerOutput } = params;
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
   * Enregistre la decision BA (stop | continue | contest).
   * Si decision = "contest", rebuttalText est requis.
   *
   * FIX (audit P1 #11) : pour "contest" on fait check + increment dans une seule tx
   * avec SELECT FOR UPDATE, ce qui previent la race "2 rebuttals concurrents bypassent
   * le cap de 3". Retourne null si cap atteint (au lieu d'incrementer).
   */
  async recordDecision(params: {
    thesisId: string;
    decision: ThesisDecision;
    rebuttalText?: string;
  }): Promise<ThesisRecord | null> {
    // Cas simple : stop / continue → update direct
    if (params.decision !== "contest") {
      const updated = await prisma.thesis.update({
        where: { id: params.thesisId },
        data: {
          decision: params.decision,
          decisionAt: new Date(),
        },
      });
      return updated as unknown as ThesisRecord;
    }

    // Cas "contest" : transaction atomique avec lock sur la row
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT id FROM "Thesis" WHERE id = $1 FOR UPDATE`,
        params.thesisId
      );
      const existing = await tx.thesis.findUnique({
        where: { id: params.thesisId },
        select: { rebuttalCount: true },
      });
      if (!existing) return null;
      if ((existing.rebuttalCount ?? 0) >= REBUTTAL_PER_DEAL_CAP) {
        return null;
      }
      const updated = await tx.thesis.update({
        where: { id: params.thesisId },
        data: {
          decision: params.decision,
          decisionAt: new Date(),
          rebuttalText: params.rebuttalText,
          rebuttalCount: { increment: 1 },
        },
      });
      return updated as unknown as ThesisRecord;
    }, { isolationLevel: "Serializable" });
  },

  /**
   * Retourne true si le BA a atteint le cap de rebuttals sur ce deal (anti-abus).
   * Check informatif seulement — recordDecision fait le check atomique definitif.
   */
  async hasReachedRebuttalCap(dealId: string): Promise<boolean> {
    const latest = await prisma.thesis.findFirst({
      where: { dealId, isLatest: true },
      select: { rebuttalCount: true },
    });
    return (latest?.rebuttalCount ?? 0) >= REBUTTAL_PER_DEAL_CAP;
  },

  /**
   * Persiste le verdict rebuttal-judge (valid | rejected).
   */
  async recordRebuttalVerdict(params: {
    thesisId: string;
    verdict: "valid" | "rejected";
  }): Promise<ThesisRecord> {
    const updated = await prisma.thesis.update({
      where: { id: params.thesisId },
      data: { rebuttalVerdict: params.verdict },
    });
    return updated as unknown as ThesisRecord;
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
  async isStale(params: { dealId: string; currentSourceHash: string }): Promise<boolean> {
    const latest = await this.getLatest(params.dealId);
    if (!latest) return false;
    return latest.sourceHash !== params.currentSourceHash;
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
