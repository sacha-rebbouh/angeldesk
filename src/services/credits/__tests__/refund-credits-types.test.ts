import { describe, expect, it } from "vitest";
import { refundCredits } from "../usage-gate";

describe("refundCredits type contract", () => {
  it("requires an analysisId or an explicit idempotencyKey", () => {
    const invalidCallsMustStayRejectedByTypeScript = () => {
      // @ts-expect-error options are mandatory for every refund
      void refundCredits("user", "DEEP_DIVE", "deal");
      // @ts-expect-error an empty options object has no stable refund identity
      void refundCredits("user", "DEEP_DIVE", "deal", {});
    };

    expect(invalidCallsMustStayRejectedByTypeScript).toBeTypeOf("function");
  });
});
