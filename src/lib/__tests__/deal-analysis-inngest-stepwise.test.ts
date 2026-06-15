import { beforeEach, describe, expect, it, vi } from "vitest";

// D.5d-1d — contrat de branchement stepwise de `dealAnalysisFunction`. Mode STICKY :
// le handler lit `event.data.stepwise` (décidé au dispatch, immuable sur le run) — PAS
// process.env (qui ferait varier le graphe de steps en vol au flip du flag).
//   OFF (event.data.stepwise != true) : runAnalysis encapsulé dans l'unique
//     step.run('run-analysis') externe ; AUCUN stepwise/stepRunner/dispatchEventId.
//   ON  (event.data.stepwise === true) : runAnalysis appelé HORS du step.run externe,
//     avec stepwise:true + un InngestStepRunner + dispatchEventId.
// On exerce le handler directement avec un fake `step` (pas de dev-server Inngest).

const mocks = vi.hoisted(() => ({
  runAnalysis: vi.fn(),
  resumeAnalysis: vi.fn(),
  compensateFailedAnalysis: vi.fn(),
  // Statut terminal PERSISTÉ (nouvelle source de vérité du gate refund/email) + spy de l'email.
  findUnique: vi.fn(),
  // compensate-analysis-throw terminal-safe : lecture « ce dispatch a-t-il déjà LIVRÉ ? ».
  findFirst: vi.fn(),
  sendNotif: vi.fn(),
}));

vi.mock("@/agents", () => ({ orchestrator: { runAnalysis: mocks.runAnalysis, resumeAnalysis: mocks.resumeAnalysis } }));
vi.mock("@/lib/analysis-compensation", () => ({
  compensateFailedAnalysis: mocks.compensateFailedAnalysis,
  reapStaleAnalyses: vi.fn(),
}));
// Stubs pour charger inngest.ts vite (les autres fonctions du module ne tournent pas ici).
vi.mock("@/agents/maintenance/db-cleaner", () => ({ runCleaner: vi.fn() }));
vi.mock("@/agents/maintenance/db-sourcer", () => ({
  LEGACY_SOURCES: [], PAGINATED_SOURCES: [],
  processLegacySource: vi.fn(), processPaginatedSource: vi.fn(), finalizeSourcerRun: vi.fn(),
}));
vi.mock("@/agents/maintenance/db-completer", () => ({
  processCompleterBatch: vi.fn(), finalizeCompleterRun: vi.fn(), emptyBatchStats: vi.fn(),
}));
vi.mock("@/services/notifications", () => ({ notifyAgentCompleted: vi.fn(), notifyAgentFailed: vi.fn() }));
vi.mock("@/services/notifications/analysis-ready-email", () => ({ sendAnalysisReadyNotification: mocks.sendNotif }));
// prisma.analysis.findUnique : lecture du STATUT TERMINAL PERSISTÉ — nouvelle source de vérité
// du gate refund/email (vs analysisResult.success = allSuccess).
vi.mock("@/lib/prisma", () => ({
  prisma: { analysis: { findUnique: mocks.findUnique, findFirst: mocks.findFirst } },
}));

// step-runner NON mocké : on veut le vrai InngestStepRunner pour l'assertion instanceof.
const { InngestStepRunner } = await import("@/agents/orchestrator/step-runner");
const { dealAnalysisFunction, dealAnalysisResumeFunction } = await import("../inngest");

type StepLike = { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> };

async function invokeHandler(
  data: Record<string, unknown>,
  attempt?: number,
  maxAttempts?: number
): Promise<{ stepRunCalls: string[] }> {
  const stepRunCalls: string[] = [];
  const step: StepLike = {
    run: async (name, fn) => {
      stepRunCalls.push(name);
      return fn();
    },
  };
  const handler = (dealAnalysisFunction as unknown as {
    fn: (input: {
      event: { data: unknown };
      step: StepLike;
      attempt?: number;
      maxAttempts?: number;
    }) => Promise<unknown>;
  }).fn;
  await handler({ event: { data }, step, attempt, maxAttempts });
  return { stepRunCalls };
}

async function invokeResumeHandler(
  data: Record<string, unknown>,
  attempt?: number
): Promise<{ stepRunCalls: string[] }> {
  const stepRunCalls: string[] = [];
  const step: StepLike = {
    run: async (name, fn) => {
      stepRunCalls.push(name);
      return fn();
    },
  };
  const handler = (dealAnalysisResumeFunction as unknown as {
    fn: (input: { event: { data: unknown }; step: StepLike; attempt?: number }) => Promise<unknown>;
  }).fn;
  await handler({ event: { data }, step, attempt });
  return { stepRunCalls };
}

const baseData = {
  dealId: "deal_1",
  enableTrace: true,
  userId: "user_1",
  dispatchRefundKey: "refund:k",
  dispatchEventId: "analysis:deal.analyze:deal_1:attempt_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runAnalysis.mockResolvedValue({ success: true, sessionId: "a1" });
  // Défaut : statut terminal COMPLETED (analyse livrée) → chemin notify.
  mocks.findUnique.mockResolvedValue({ status: "COMPLETED" });
  // Défaut : aucun dispatch déjà livré → le catch compense comme avant.
  mocks.findFirst.mockResolvedValue(null);
});

describe("dealAnalysisFunction — D.5d-1d branchement stepwise (sticky)", () => {
  it("ON (event.data.stepwise=true) : runAnalysis HORS step.run, stepwise+InngestStepRunner+dispatchEventId", async () => {
    const { stepRunCalls } = await invokeHandler({ ...baseData, type: "full_analysis", stepwise: true });

    expect(mocks.runAnalysis).toHaveBeenCalledTimes(1);
    const arg = mocks.runAnalysis.mock.calls[0][0];
    expect(arg.stepwise).toBe(true);
    expect(arg.dispatchEventId).toBe("analysis:deal.analyze:deal_1:attempt_1");
    expect(arg.stepRunner).toBeInstanceOf(InngestStepRunner);
    expect(arg.type).toBe("full_analysis");
    // runAnalysis n'est PAS encapsulé dans le step.run externe en mode stepwise.
    expect(stepRunCalls).not.toContain("run-analysis");
  });

  it("ON : stepwiseGraphVersion (d-2a) threadé event.data → runAnalysis (routing EXACT sticky)", async () => {
    await invokeHandler({ ...baseData, type: "full_analysis", stepwise: true, stepwiseGraphVersion: 1 });
    expect(mocks.runAnalysis.mock.calls[0][0].stepwiseGraphVersion).toBe(1);
  });

  it("ON sans stepwiseGraphVersion (event legacy) : threadé undefined → routing 1-step par défaut", async () => {
    await invokeHandler({ ...baseData, type: "full_analysis", stepwise: true });
    expect(mocks.runAnalysis.mock.calls[0][0].stepwiseGraphVersion).toBeUndefined();
  });

  it("OFF (event.data.stepwise=false) : runAnalysis DANS step.run('run-analysis'), sans stepwise/stepRunner mais AVEC dispatchEventId (watchdog + idempotence retry)", async () => {
    const { stepRunCalls } = await invokeHandler({ ...baseData, type: "full_analysis", stepwise: false });

    expect(mocks.runAnalysis).toHaveBeenCalledTimes(1);
    const arg = mocks.runAnalysis.mock.calls[0][0];
    expect(arg.stepwise).toBeUndefined();
    expect(arg.stepRunner).toBeUndefined();
    // Phase 2 : dispatchEventId est désormais threadé AUSSI hors stepwise → la ligne full_analysis
    // le persiste (résolution watchdog par-analyse + get-or-create idempotent au retry worker).
    expect(arg.dispatchEventId).toBe(baseData.dispatchEventId);
    expect(stepRunCalls).toContain("run-analysis");
  });

  it("OFF (event legacy sans champ stepwise) : défaut sûr = chemin externe non-stepwise", async () => {
    const { stepRunCalls } = await invokeHandler({ ...baseData, type: "full_analysis" });

    const arg = mocks.runAnalysis.mock.calls[0][0];
    expect(arg.stepwise).toBeUndefined();
    expect(arg.stepRunner).toBeUndefined();
    expect(stepRunCalls).toContain("run-analysis");
  });

  it("ON : statut terminal FAILED → refund (refund-on-failure), pas d'email, sans run-analysis externe", async () => {
    mocks.findUnique.mockResolvedValue({ status: "FAILED" });
    const { stepRunCalls } = await invokeHandler({ ...baseData, type: "full_analysis", stepwise: true });

    expect(stepRunCalls).not.toContain("run-analysis");
    expect(stepRunCalls).toContain("refund-on-failure");
    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.sendNotif).not.toHaveBeenCalled();
  });

  it("ON : COMPLETED malgré des agents en échec (success:false) → email, JAMAIS de refund (régression refund-à-tort)", async () => {
    // Bug historique : un Deep Dive COMPLETED 22/22 avec ≥1 agent `success:false` était remboursé
    // + sans email. Le gate lit désormais le STATUT PERSISTÉ (COMPLETED), pas analysisResult.success.
    mocks.runAnalysis.mockResolvedValue({ success: false, sessionId: "a1" });
    mocks.findUnique.mockResolvedValue({ status: "COMPLETED" });
    const { stepRunCalls } = await invokeHandler({ ...baseData, type: "full_analysis", stepwise: true });

    expect(mocks.sendNotif).toHaveBeenCalledTimes(1);
    expect(stepRunCalls).not.toContain("refund-on-failure");
    expect(mocks.compensateFailedAnalysis).not.toHaveBeenCalled();
  });
});

// ===== compensate-analysis-throw — terminal-safe (gate Codex salvage) =====
// Un retry Inngest tardif peut THROW alors que l'analyse de CE dispatch a déjà été
// LIVRÉE (complétion antérieure, ou salvage watchdog COMPLETED dégradé). Le catch
// relit le statut persisté par dispatchEventId : livré → AUCUN refund.
describe("dealAnalysisFunction — compensate-analysis-throw terminal-safe", () => {
  it("throw + dispatch déjà LIVRÉ (COMPLETED, ex. salvage watchdog) → compensation SAUTÉE, throw propagé", async () => {
    mocks.runAnalysis.mockRejectedValue(new Error("late boom"));
    mocks.findFirst.mockResolvedValue({ id: "a1" });

    await expect(
      invokeHandler({ ...baseData, type: "full_analysis", stepwise: true })
    ).rejects.toThrow("late boom");

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dispatchEventId: baseData.dispatchEventId, status: "COMPLETED" },
      })
    );
    expect(mocks.compensateFailedAnalysis).not.toHaveBeenCalled();
  });

  it("throw + rien de livré pour ce dispatch → compensation/refund comme avant (clé idempotente du dispatch)", async () => {
    mocks.runAnalysis.mockRejectedValue(new Error("boom"));
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      invokeHandler({ ...baseData, type: "full_analysis", stepwise: true })
    ).rejects.toThrow("boom");

    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ refundIdempotencyKey: "refund:k" })
    );
  });

  it("throw + event legacy SANS dispatchEventId → pas de lecture statut, compensation directe (inchangé)", async () => {
    const { dispatchEventId: _omit, ...legacyData } = baseData;
    mocks.runAnalysis.mockRejectedValue(new Error("boom"));

    await expect(
      invokeHandler({ ...legacyData, type: "full_analysis", stepwise: true })
    ).rejects.toThrow("boom");

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
  });

  // Sens INVERSE de l'invariant : refund à une tentative non-finale + retry qui LIVRE
  // (même ligne via dispatchEventId) = refund+COMPLETED. Le refund n'a donc lieu
  // qu'à la DERNIÈRE tentative (attempt 0-indexé ; retries=1 → finale=1).
  it("throw à une tentative NON finale (attempt=0) → compensation DIFFÉRÉE (aucun refund), throw propagé", async () => {
    mocks.runAnalysis.mockRejectedValue(new Error("transient boom"));

    await expect(
      invokeHandler({ ...baseData, type: "full_analysis", stepwise: true }, 0)
    ).rejects.toThrow("transient boom");

    expect(mocks.compensateFailedAnalysis).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("throw à la tentative FINALE (attempt=1) → compensation", async () => {
    mocks.runAnalysis.mockRejectedValue(new Error("final boom"));

    await expect(
      invokeHandler({ ...baseData, type: "full_analysis", stepwise: true }, 1)
    ).rejects.toThrow("final boom");

    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
  });

  // Sémantique SDK (`attempt + 1 >= maxAttempts`, inngest/components/execution/v2.js) :
  // quand le runtime fournit maxAttempts, la finalité se base dessus, pas sur la
  // constante locale — sinon off-by-one si la config retries↔maxAttempts diverge.
  it("attempt=0 / maxAttempts=1 (aucun retry) → compensation immédiate", async () => {
    mocks.runAnalysis.mockRejectedValue(new Error("boom"));

    await expect(
      invokeHandler({ ...baseData, type: "full_analysis", stepwise: true }, 0, 1)
    ).rejects.toThrow("boom");

    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
  });

  it("attempt=0 / maxAttempts=2 → compensation DIFFÉRÉE (retry à venir)", async () => {
    mocks.runAnalysis.mockRejectedValue(new Error("boom"));

    await expect(
      invokeHandler({ ...baseData, type: "full_analysis", stepwise: true }, 0, 2)
    ).rejects.toThrow("boom");

    expect(mocks.compensateFailedAnalysis).not.toHaveBeenCalled();
  });

  it("attempt=1 / maxAttempts=2 (finale) → compensation", async () => {
    mocks.runAnalysis.mockRejectedValue(new Error("boom"));

    await expect(
      invokeHandler({ ...baseData, type: "full_analysis", stepwise: true }, 1, 2)
    ).rejects.toThrow("boom");

    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
  });
});

// F5 — chaînon central du guard billing resume (event → compensation). Vérifie
// que dealAnalysisResumeFunction LIT event.data.resumeRefundAmount/resumeRefundKey
// et les passe à compensateFailedAnalysis. Si ce mapping saute, le resume échoué
// rembourserait plein tarif (double-refund) — les tests des endpoints (route +
// compensateFailedAnalysis) ne le verraient pas.
describe("dealAnalysisResumeFunction — chaînon billing event→compensation (F5)", () => {
  it("passe resumeRefundAmount/resumeRefundKey de l'event à compensateFailedAnalysis (refund partiel exact)", async () => {
    mocks.resumeAnalysis.mockResolvedValue({ success: false, sessionId: "an_resume" });
    // Statut terminal FAILED → chemin refund (compensate-resume-failure).
    mocks.findUnique.mockResolvedValue({ status: "FAILED", type: "full_analysis" });

    const { stepRunCalls } = await invokeResumeHandler({
      analysisId: "an_resume",
      dealId: "deal_1",
      userId: "user_1",
      resumeRefundKey: "refund:resume:an_resume:attempt_1",
      resumeRefundAmount: 3,
    });

    expect(stepRunCalls).toContain("compensate-resume-failure");
    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisId: "an_resume",
        dealId: "deal_1",
        userId: "user_1",
        type: "full_analysis",
        refundIdempotencyKey: "refund:resume:an_resume:attempt_1",
        refundAmount: 3,
      })
    );
    expect(mocks.sendNotif).not.toHaveBeenCalled();
  });

  it("resumeRefundAmount absent → refundAmount undefined transmis (compensation bascule sur le refund plein)", async () => {
    mocks.resumeAnalysis.mockResolvedValue({ success: false, sessionId: "an_resume2" });
    mocks.findUnique.mockResolvedValue({ status: "FAILED", type: "full_analysis" });

    await invokeResumeHandler({
      analysisId: "an_resume2",
      dealId: "deal_1",
      userId: "user_1",
      resumeRefundKey: "refund:resume:an_resume2:attempt_1",
    });

    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ refundAmount: undefined })
    );
  });

  // Terminal-safe (gate Codex salvage) : resumeAnalysis peut LIVRER (COMPLETED) puis
  // throw sur un effet post-complétion — ou le salvage watchdog peut livrer pendant
  // le resume. Livré = facturé → le catch resume ne doit PAS rembourser.
  it("throw du resume + analyse déjà LIVRÉE (COMPLETED) → compensation SAUTÉE, throw propagé", async () => {
    mocks.resumeAnalysis.mockRejectedValue(new Error("late resume boom"));
    mocks.findUnique.mockResolvedValue({ status: "COMPLETED", type: "full_analysis" });

    await expect(
      invokeResumeHandler({
        analysisId: "an_resume3",
        dealId: "deal_1",
        userId: "user_1",
        resumeRefundKey: "refund:resume:an_resume3:attempt_1",
      })
    ).rejects.toThrow("late resume boom");

    expect(mocks.compensateFailedAnalysis).not.toHaveBeenCalled();
  });

  it("throw du resume + analyse NON livrée (FAILED) → compensation comme avant", async () => {
    mocks.resumeAnalysis.mockRejectedValue(new Error("resume boom"));
    mocks.findUnique.mockResolvedValue({ status: "FAILED", type: "full_analysis" });

    await expect(
      invokeResumeHandler({
        analysisId: "an_resume4",
        dealId: "deal_1",
        userId: "user_1",
        resumeRefundKey: "refund:resume:an_resume4:attempt_1",
      })
    ).rejects.toThrow("resume boom");

    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ refundIdempotencyKey: "refund:resume:an_resume4:attempt_1" })
    );
  });

  it("throw du resume à une tentative NON finale (attempt=0) → compensation DIFFÉRÉE (aucun refund)", async () => {
    mocks.resumeAnalysis.mockRejectedValue(new Error("transient resume boom"));
    mocks.findUnique.mockResolvedValue({ status: "FAILED", type: "full_analysis" });

    await expect(
      invokeResumeHandler(
        {
          analysisId: "an_resume5",
          dealId: "deal_1",
          userId: "user_1",
          resumeRefundKey: "refund:resume:an_resume5:attempt_1",
        },
        0
      )
    ).rejects.toThrow("transient resume boom");

    expect(mocks.compensateFailedAnalysis).not.toHaveBeenCalled();
  });
});
