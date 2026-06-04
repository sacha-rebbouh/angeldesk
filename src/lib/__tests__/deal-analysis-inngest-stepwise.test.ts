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
  compensateFailedAnalysis: vi.fn(),
}));

vi.mock("@/agents", () => ({ orchestrator: { runAnalysis: mocks.runAnalysis } }));
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
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// step-runner NON mocké : on veut le vrai InngestStepRunner pour l'assertion instanceof.
const { InngestStepRunner } = await import("@/agents/orchestrator/step-runner");
const { dealAnalysisFunction } = await import("../inngest");

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

  it("ON : échec → refund (step refund-on-failure), sans run-analysis externe", async () => {
    mocks.runAnalysis.mockResolvedValue({ success: false, sessionId: "a1" });
    const { stepRunCalls } = await invokeHandler({ ...baseData, type: "full_analysis", stepwise: true });

    expect(stepRunCalls).not.toContain("run-analysis");
    expect(stepRunCalls).toContain("refund-on-failure");
    expect(mocks.compensateFailedAnalysis).toHaveBeenCalledTimes(1);
  });
});
