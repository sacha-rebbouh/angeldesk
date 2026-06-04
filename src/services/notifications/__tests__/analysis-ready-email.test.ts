import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma + deps avant import (hoisted).
const prismaMocks = vi.hoisted(() => ({
  analysisUpdateMany: vi.fn(),
  analysisUpdate: vi.fn(),
  analysisFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  dealFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      updateMany: prismaMocks.analysisUpdateMany,
      update: prismaMocks.analysisUpdate,
      findUnique: prismaMocks.analysisFindUnique,
    },
    user: { findUnique: prismaMocks.userFindUnique },
    deal: { findUnique: prismaMocks.dealFindUnique },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const emailMocks = vi.hoisted(() => ({
  isEmailConfigured: vi.fn(),
  sendAnalysisReadyEmail: vi.fn(),
}));
vi.mock("../email", () => ({
  isEmailConfigured: emailMocks.isEmailConfigured,
  sendAnalysisReadyEmail: emailMocks.sendAnalysisReadyEmail,
}));

import { sendAnalysisReadyNotification } from "../analysis-ready-email";

// step Inngest factice : exécute la fn inline (pas de durabilité en unit test).
const fakeStep = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

const BASE = { analysisId: "a1", userId: "u1", dealId: "d1", step: fakeStep };

describe("sendAnalysisReadyNotification — claim atomique idempotent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailMocks.isEmailConfigured.mockReturnValue(true);
    emailMocks.sendAnalysisReadyEmail.mockResolvedValue({ success: true, id: "email_1" });
    prismaMocks.analysisFindUnique.mockResolvedValue({ analysisReadyEmailSentAt: null });
    prismaMocks.userFindUnique.mockResolvedValue({ email: "ba@example.com" });
    prismaMocks.dealFindUnique.mockResolvedValue({ name: "Deal X", companyName: "Acme" });
    prismaMocks.analysisUpdate.mockResolvedValue({});
  });

  it("claim gagnant (count=1) + email configuré → envoie une fois (avec clé d'idempotence) et pose sentAt", async () => {
    prismaMocks.analysisUpdateMany.mockResolvedValueOnce({ count: 1 }); // claim
    await sendAnalysisReadyNotification(BASE);
    expect(emailMocks.sendAnalysisReadyEmail).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendAnalysisReadyEmail).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "analysis-ready/a1" })
    );
    expect(prismaMocks.analysisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ analysisReadyEmailSentAt: expect.any(Date) }),
      })
    );
  });

  it("re-check : un gagnant concurrent a déjà posé sentAt → pas de renvoi", async () => {
    prismaMocks.analysisUpdateMany.mockResolvedValueOnce({ count: 1 }); // claim gagné (mémoïsé)
    prismaMocks.analysisFindUnique.mockResolvedValueOnce({ analysisReadyEmailSentAt: new Date() });
    await sendAnalysisReadyNotification(BASE);
    expect(emailMocks.sendAnalysisReadyEmail).not.toHaveBeenCalled();
    expect(prismaMocks.analysisUpdate).not.toHaveBeenCalled();
  });

  it("claim perdu (count=0) → aucun envoi, pas de sentAt", async () => {
    prismaMocks.analysisUpdateMany.mockResolvedValueOnce({ count: 0 });
    await sendAnalysisReadyNotification(BASE);
    expect(emailMocks.sendAnalysisReadyEmail).not.toHaveBeenCalled();
    expect(prismaMocks.analysisUpdate).not.toHaveBeenCalled();
  });

  it("échec d'envoi Resend → relâche le claim (claimedAt=null) et throw (retry)", async () => {
    prismaMocks.analysisUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // claim gagnant
      .mockResolvedValueOnce({ count: 1 }); // reset
    emailMocks.sendAnalysisReadyEmail.mockResolvedValueOnce({ success: false, error: "boom" });

    await expect(sendAnalysisReadyNotification(BASE)).rejects.toThrow(/Resend/i);

    expect(prismaMocks.analysisUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "a1", analysisReadyEmailSentAt: null }),
        data: { analysisReadyEmailClaimedAt: null },
      })
    );
    // sentAt JAMAIS posé sur un envoi échoué.
    expect(prismaMocks.analysisUpdate).not.toHaveBeenCalled();
  });

  it("email non configuré → consomme le claim (sentAt) sans appeler Resend", async () => {
    prismaMocks.analysisUpdateMany.mockResolvedValueOnce({ count: 1 });
    emailMocks.isEmailConfigured.mockReturnValue(false);
    await sendAnalysisReadyNotification(BASE);
    expect(emailMocks.sendAnalysisReadyEmail).not.toHaveBeenCalled();
    expect(prismaMocks.analysisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ analysisReadyEmailSentAt: expect.any(Date) }),
      })
    );
  });

  it("destinataire introuvable → consomme le claim sans envoyer", async () => {
    prismaMocks.analysisUpdateMany.mockResolvedValueOnce({ count: 1 });
    prismaMocks.userFindUnique.mockResolvedValueOnce(null);
    await sendAnalysisReadyNotification(BASE);
    expect(emailMocks.sendAnalysisReadyEmail).not.toHaveBeenCalled();
    expect(prismaMocks.analysisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ analysisReadyEmailSentAt: expect.any(Date) }),
      })
    );
  });
});
