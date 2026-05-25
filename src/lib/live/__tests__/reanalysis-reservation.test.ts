/**
 * Phase C slice C1a — Tests `reanalysis-reservation` helper + invariants
 * d'intégration sur les 2 chemins (route manuelle + auto post-call).
 *
 * Couvre :
 *   1. Sémantique de `reserveSessionReanalysis` :
 *      - `reserved` quand aucune réservation active.
 *      - `active` quand `reanalysisRequestedAt` est dans la stale window
 *        (30 min).
 *      - `reserved` quand réservation antérieure mais stale (au-delà 30
 *        min).
 *      - `session_not_found` quand session absente ou état invalide.
 *   2. `clearSessionReanalysisReservation` ne libère QUE si le requestId
 *      match (idempotence sous race).
 *   3. Source guards :
 *      - `route.ts` consomme le helper (pas de redéfinition locale).
 *      - `post-call-generator.ts` réserve AVANT
 *        `triggerTargetedReanalysis()` et clear sur les deux chemins
 *        (success + error).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Mocks Prisma ($transaction + liveSession.updateMany)
// ---------------------------------------------------------------------------

const { transactionMock, updateManyMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  updateManyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    liveSession: {
      updateMany: updateManyMock,
    },
  },
}));

import {
  reserveSessionReanalysis,
  clearSessionReanalysisReservation,
  REANALYSIS_STALE_WINDOW_MS,
} from "@/lib/live/reanalysis-reservation";

// ---------------------------------------------------------------------------
// Helper : fabrique un faux `tx` (transaction) qui consomme les calls et
// retourne le résultat de la fonction passée à `prisma.$transaction(fn)`.
// ---------------------------------------------------------------------------

interface TxStubState {
  /** Session retournée par `tx.liveSession.findFirst`. `null` simule une
   * session manquante / hors état autorisé. */
  session:
    | {
        id: string;
        reanalysisRequestId: string | null;
        reanalysisRequestedAt: Date | null;
      }
    | null;
}

function setupTransactionMock(state: TxStubState): {
  findFirstMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  execRawMock: ReturnType<typeof vi.fn>;
} {
  const findFirstMock = vi.fn().mockResolvedValue(state.session);
  const updateMock = vi.fn().mockResolvedValue(state.session);
  const execRawMock = vi.fn().mockResolvedValue(0);

  const tx = {
    $executeRawUnsafe: execRawMock,
    liveSession: {
      findFirst: findFirstMock,
      update: updateMock,
    },
  };

  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

  return { findFirstMock, updateMock, execRawMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// reserveSessionReanalysis — matrice complète
// ---------------------------------------------------------------------------

describe("Phase C C1a — reserveSessionReanalysis", () => {
  it("retourne `reserved` avec un nouveau requestId quand aucune réservation active", async () => {
    const { findFirstMock, updateMock, execRawMock } = setupTransactionMock({
      session: { id: "sess_1", reanalysisRequestId: null, reanalysisRequestedAt: null },
    });

    const result = await reserveSessionReanalysis("sess_1", "user_1", "targeted");

    expect(result.kind).toBe("reserved");
    if (result.kind !== "reserved") throw new Error("type guard");
    expect(typeof result.requestId).toBe("string");
    expect(result.requestId.length).toBeGreaterThan(10); // UUID

    expect(execRawMock).toHaveBeenCalledTimes(1);
    expect(execRawMock.mock.calls[0]?.[0]).toContain("pg_advisory_xact_lock");

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        id: "sess_1",
        userId: "user_1",
        status: { in: ["completed", "processing"] },
      },
      select: {
        id: true,
        reanalysisRequestId: true,
        reanalysisRequestedAt: true,
      },
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "sess_1" },
      data: {
        reanalysisRequestId: result.requestId,
        reanalysisMode: "targeted",
      },
    });
  });

  it("retourne `active` quand une réservation est dans la stale window (30 min)", async () => {
    const recentlyReserved = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    const { updateMock } = setupTransactionMock({
      session: {
        id: "sess_2",
        reanalysisRequestId: "prev-uuid",
        reanalysisRequestedAt: recentlyReserved,
      },
    });

    const result = await reserveSessionReanalysis("sess_2", "user_1", "targeted");

    expect(result.kind).toBe("active");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("retourne `reserved` quand la réservation existante est STALE (>30 min)", async () => {
    const stale = new Date(Date.now() - REANALYSIS_STALE_WINDOW_MS - 60 * 1000);
    const { updateMock } = setupTransactionMock({
      session: {
        id: "sess_3",
        reanalysisRequestId: "old-uuid",
        reanalysisRequestedAt: stale,
      },
    });

    const result = await reserveSessionReanalysis("sess_3", "user_1", "full");

    expect(result.kind).toBe("reserved");
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]?.[0]?.data?.reanalysisMode).toBe("full");
  });

  it("retourne `session_not_found` quand la session n'existe pas ou n'est pas dans completed/processing", async () => {
    setupTransactionMock({ session: null });

    const result = await reserveSessionReanalysis("sess_missing", "user_1", "targeted");

    expect(result.kind).toBe("session_not_found");
  });

  it("borne la fenêtre exactement à 30 min : 30 min + 1ms = stale (reserved), 30 min - 1ms = active", async () => {
    // 30 min - 1ms → ACTIVE
    {
      const { updateMock } = setupTransactionMock({
        session: {
          id: "sess_a",
          reanalysisRequestId: "p",
          reanalysisRequestedAt: new Date(Date.now() - REANALYSIS_STALE_WINDOW_MS + 1),
        },
      });
      const r = await reserveSessionReanalysis("sess_a", "user_1", "targeted");
      expect(r.kind).toBe("active");
      expect(updateMock).not.toHaveBeenCalled();
    }
    // 30 min + 1ms → RESERVED (stale)
    {
      const { updateMock } = setupTransactionMock({
        session: {
          id: "sess_b",
          reanalysisRequestId: "p",
          reanalysisRequestedAt: new Date(Date.now() - REANALYSIS_STALE_WINDOW_MS - 1),
        },
      });
      const r = await reserveSessionReanalysis("sess_b", "user_1", "targeted");
      expect(r.kind).toBe("reserved");
      expect(updateMock).toHaveBeenCalledTimes(1);
    }
  });
});

// ---------------------------------------------------------------------------
// clearSessionReanalysisReservation — idempotence
// ---------------------------------------------------------------------------

describe("Phase C C1a — clearSessionReanalysisReservation", () => {
  it("libère uniquement si le requestId matche encore (where strict)", async () => {
    updateManyMock.mockResolvedValue({ count: 1 });

    await clearSessionReanalysisReservation("sess_1", "uuid-abc");

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        id: "sess_1",
        reanalysisRequestId: "uuid-abc",
      },
      data: {
        reanalysisRequestId: null,
        reanalysisMode: null,
        reanalysisRequestedAt: null,
      },
    });
  });

  it("est idempotent : un updateMany avec count=0 ne lance pas (réservation déjà écrasée)", async () => {
    updateManyMock.mockResolvedValue({ count: 0 });
    await expect(
      clearSessionReanalysisReservation("sess_1", "stale-uuid"),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Source guards — assure que les 2 chemins consomment le helper et que
// l'auto-path réserve avant trigger + clear sur les 2 sorties
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), "utf-8");
}

describe("Phase C C1a — Source guard chemin manuel /api/coaching/reanalyze", () => {
  const source = loadFile("src/app/api/coaching/reanalyze/route.ts");

  it("importe `reserveSessionReanalysis` + `clearSessionReanalysisReservation` depuis le helper", () => {
    expect(/import\s*\{[^}]*reserveSessionReanalysis[^}]*\}\s*from\s*["']@\/lib\/live\/reanalysis-reservation["']/.test(source)).toBe(true);
    expect(/import\s*\{[^}]*clearSessionReanalysisReservation[^}]*\}\s*from\s*["']@\/lib\/live\/reanalysis-reservation["']/.test(source)).toBe(true);
  });

  it("ne redéfinit PAS localement la sémantique de réservation (pas de `function reserveSessionReanalysis`)", () => {
    expect(/function\s+reserveSessionReanalysis\s*\(/.test(source)).toBe(false);
    expect(/function\s+clearSessionReanalysisReservation\s*\(/.test(source)).toBe(false);
  });

  it("traite explicitement `kind === \"active\"` (409) et `kind === \"session_not_found\"` (throw legacy)", () => {
    expect(/kind\s*===\s*"active"/.test(source)).toBe(true);
    expect(/kind\s*===\s*"session_not_found"/.test(source)).toBe(true);
  });
});

describe("Phase C C1a — Source guard chemin auto post-call-generator", () => {
  const source = loadFile("src/lib/live/post-call-generator.ts");

  it("importe `reserveSessionReanalysis` + `clearSessionReanalysisReservation`", () => {
    expect(/import\s*\{[^}]*reserveSessionReanalysis[^}]*\}\s*from\s*["']@\/lib\/live\/reanalysis-reservation["']/.test(source)).toBe(true);
    expect(/import\s*\{[^}]*clearSessionReanalysisReservation[^}]*\}\s*from\s*["']@\/lib\/live\/reanalysis-reservation["']/.test(source)).toBe(true);
  });

  it("appelle `reserveSessionReanalysis(sessionId, session.userId, \"targeted\")` AVANT `triggerTargetedReanalysis`", () => {
    const reservationIndex = source.indexOf("reserveSessionReanalysis(");
    const triggerIndex = source.indexOf("triggerTargetedReanalysis(\n");
    expect(reservationIndex).toBeGreaterThan(-1);
    expect(triggerIndex).toBeGreaterThan(-1);
    expect(reservationIndex).toBeLessThan(triggerIndex);
    expect(/reserveSessionReanalysis\(\s*sessionId\s*,\s*session\.userId\s*,\s*"targeted"\s*,?\s*\)/.test(source)).toBe(true);
  });

  it("skip explicite si `kind === \"active\"` ou `kind === \"session_not_found\"` (pas de throw, pas de fatal)", () => {
    expect(/reservation\.kind\s*===\s*"active"/.test(source)).toBe(true);
    expect(/reservation\.kind\s*===\s*"session_not_found"/.test(source)).toBe(true);
    // Présence de console.warn dans les 2 branches skip
    expect(source).toContain("a reservation is already active");
    expect(source).toContain("session not found or not in completed/processing state");
  });

  it("clear la réservation sur SUCCESS et sur ERROR (idempotent)", () => {
    // Doit avoir au moins 2 appels clearSessionReanalysisReservation dans
    // les 2 branches du then/catch du fire-and-forget.
    const matches = source.match(/clearSessionReanalysisReservation\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
