/**
 * Guard: Evidence Health is corpus-level, not analysis-result-level.
 * It must render on the Analyse tab even when no AI analysis has ever run.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("analysis-panel — evidence health placement", () => {
  const source = readFileSync(join(__dirname, "..", "analysis-panel.tsx"), "utf8");

  it("renders EvidenceHealthPanel before the launch card and displayedResult-gated results block", () => {
    const panelIndex = source.indexOf("<EvidenceHealthPanel dealId={dealId} />");
    const launchIndex = source.indexOf("{/* Launch Analysis Card - sticky at top */}");
    const resultsIndex = source.indexOf("{displayedResult && (");

    expect(panelIndex).toBeGreaterThan(0);
    expect(launchIndex).toBeGreaterThan(0);
    expect(resultsIndex).toBeGreaterThan(0);
    expect(panelIndex).toBeLessThan(launchIndex);
    expect(panelIndex).toBeLessThan(resultsIndex);
  });

  it("does not render a second EvidenceHealthPanel inside the results tab", () => {
    const occurrences = source.match(/<EvidenceHealthPanel dealId=\{dealId\} \/>/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});
