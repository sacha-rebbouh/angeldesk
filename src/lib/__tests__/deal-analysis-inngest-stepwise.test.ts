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
vi.mock("@/lib/prisma", () => ({ prisma: { analysis: { findUnique: mocks.findUnique } } }));

// step-runner NON mocké : on veut le vrai InngestStepRunner pour l'assertion instanceof.
const { InngestStepRunner } = await import("@/agents/orchestrator/step-runner");
const { dealAnalysisFunction, dealAnalysisResumeFunction } = await import("../inngest");

type StepLike = { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> };

async function invokeHandler(data: Record<string, unknown>): Promise<{ stepRunCalls: string[] }> {
  const stepRunCalls: string[] = [];
  const step: StepLike = {
    run: async (name, fn) => {
      stepRunCalls.push(name);
      return fn();
    },
  };
  const handler = (dealAnalysisFunction as unknown as {
    fn: (input: { event: { data: unknown }; step: StepLike }) => Promise<unknown>;
  }).fn;
  await handler({ event: { data }, step });
  return { stepRunCalls };
}

async function invokeResumeHandler(data: Record<string, unknown>): Promise<{ stepRunCalls: string[] }> {
  const stepRunCalls: string[] = [];
  const step: StepLike = {
    run: async (name, fn) => {
      stepRunCalls.push(name);
      return fn();
    },
  };
  const handler = (dealAnalysisResumeFunction as unknown as {
    fn: (input: { event: { data: unknown }; step: StepLike }) => Promise<unknown>;
  }).fn;
  await handler({ event: { data }, step });
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
});
