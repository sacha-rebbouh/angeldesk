import { isThesisAxisUnavailable } from "@/agents/thesis/types";
import type { PdfExportData } from "./generate-analysis-pdf";

const FRAGILE_THESIS_VERDICTS = new Set(["vigilance", "alert_dominant"]);

export function hasFragileThesis(
  thesis: PdfExportData["thesis"]
): thesis is NonNullable<PdfExportData["thesis"]> {
  return (
    thesis != null &&
    !isThesisAxisUnavailable(thesis.evaluationAxes.thesisQuality) &&
    FRAGILE_THESIS_VERDICTS.has(thesis.evaluationAxes.thesisQuality.verdict)
  );
}
