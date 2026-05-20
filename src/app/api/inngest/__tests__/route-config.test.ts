import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src", "app", "api", "inngest", "route.ts"), "utf8");

describe("/api/inngest route config", () => {
  it("allows long-running analysis steps on Vercel", () => {
    expect(source).toMatch(/export\s+const\s+maxDuration\s*=\s*300\s*;/);
    expect(source).toContain("leave Analysis rows stuck RUNNING");
  });
});
