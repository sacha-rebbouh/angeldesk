import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("src/app/api/analyze/route.ts", "utf8");
const inngestSource = readFileSync("src/lib/inngest.ts", "utf8");

describe("Codex live incident — resume billing guards", () => {
  it("resume re-debits only the refunded amount, not the full analysis price", () => {
    expect(routeSource).toContain("const refundAmount = resumeCandidate.refundAmount ?? fullCost");
    expect(routeSource).toContain("const amountToRedebit = Math.max(0, Math.min(refundAmount, fullCost))");
    expect(routeSource).toContain("deductCreditAmount(user.id, resumeAction, amountToRedebit");
    expect(routeSource).not.toContain("const resumeDeduction = await recordDealAnalysis(user.id, requestedTier, dealId, type");
  });

  it("resume event carries the partial amount so async compensation cannot over-refund", () => {
    expect(routeSource).toContain("resumeRefundAmount: resumeRedebitedAmount");
    expect(inngestSource).toContain("resumeRefundAmount?: number | null");
    expect(inngestSource).toContain("refundAmount: typeof resumeRefundAmount === \"number\" ? resumeRefundAmount : undefined");
  });

  it("Inngest resume compensation refunds the explicit amount when present", () => {
    expect(inngestSource).toContain("refundAmount?: number");
    expect(inngestSource).toContain("refundCreditAmount(params.userId, action, refundAmount");
    expect(inngestSource).toContain("data: { refundedAt: new Date(), refundAmount: refundAmount ?? CREDIT_COSTS[action] ?? null }");
  });
});
