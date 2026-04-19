function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function buildExcelPromptSummaryFromMetrics(metrics: unknown): string | null {
  const root = asRecord(metrics);
  if (!root) return null;

  const workbookAudit = asRecord(root.workbookAudit);
  const modelIntelligence = asRecord(root.modelIntelligence);
  const financialAudit = asRecord(root.financialAudit);
  const analystReport = asRecord(root.analystReport);

  if (!workbookAudit && !modelIntelligence && !financialAudit && !analystReport) {
    return null;
  }

  const lines: string[] = ["## WORKBOOK AUDIT STRUCTURE"];

  if (workbookAudit) {
    const warningFlags = asStringArray(workbookAudit.warningFlags).slice(0, 6);
    const outputSheets = asStringArray(workbookAudit.outputSheets).slice(0, 6);
    const assumptionSheets = asStringArray(workbookAudit.assumptionSheets).slice(0, 6);
    const hiddenSheets = asStringArray(workbookAudit.hiddenSheets).slice(0, 6);

    if (warningFlags.length > 0) lines.push(`- Workbook warning flags: ${warningFlags.join(" | ")}`);
    if (outputSheets.length > 0) lines.push(`- Output sheets: ${outputSheets.join(", ")}`);
    if (assumptionSheets.length > 0) lines.push(`- Assumption sheets: ${assumptionSheets.join(", ")}`);
    if (hiddenSheets.length > 0) lines.push(`- Hidden sheets: ${hiddenSheets.join(", ")}`);
  }

  if (modelIntelligence) {
    const hardcodes = asRecord(modelIntelligence.hardcodes);
    const highSeverityCount = typeof hardcodes?.highSeverityCount === "number" ? hardcodes.highSeverityCount : 0;
    const outputs = asRecord(modelIntelligence.outputs);
    const canonicalOutputs = Array.isArray(outputs?.canonical) ? outputs.canonical.slice(0, 5) : [];
    const disconnectedCalcs = Array.isArray(modelIntelligence.disconnectedCalcs)
      ? modelIntelligence.disconnectedCalcs.slice(0, 5)
      : [];
    const criticalDependencies = Array.isArray(modelIntelligence.criticalDependencies)
      ? modelIntelligence.criticalDependencies.slice(0, 5)
      : [];

    lines.push(`- Hardcodes haute severite: ${highSeverityCount}`);

    if (canonicalOutputs.length > 0) {
      const outputLabels = canonicalOutputs
        .map((item) => {
          const record = asRecord(item);
          const qualified = typeof record?.sheet === "string" && typeof record?.cell === "string"
            ? `${record.sheet}!${record.cell}`
            : "unknown-output";
          const family = typeof record?.metricFamily === "string" ? record.metricFamily : "other";
          return `${qualified} [${family}]`;
        });
      lines.push(`- Canonical outputs: ${outputLabels.join(" | ")}`);
    }

    if (criticalDependencies.length > 0) {
      const dependencyLabels = criticalDependencies
        .map((item) => {
          const record = asRecord(item);
          const output = typeof record?.output === "string" ? record.output : "unknown-output";
          const hardcoded = typeof record?.transitiveHardcodedPrecedentCount === "number"
            ? record.transitiveHardcodedPrecedentCount
            : typeof record?.hardcodedPrecedentCount === "number"
              ? record.hardcodedPrecedentCount
            : 0;
          const paths = Array.isArray(record?.sampleHardcodePaths)
            ? record.sampleHardcodePaths
                .map((path) => asRecord(path))
                .filter((path): path is Record<string, unknown> => Boolean(path))
                .slice(0, 1)
                .map((path) => {
                  const nodes = Array.isArray(path.nodes) ? path.nodes.filter((node): node is string => typeof node === "string") : [];
                  return nodes.length > 0 ? ` path=${nodes.join(" -> ")}` : "";
                })[0] ?? ""
            : "";
          return `${output} (transitive hardcoded precedents=${hardcoded})${paths}`;
        });
      lines.push(`- Critical dependencies: ${dependencyLabels.join(" | ")}`);
    }

    if (disconnectedCalcs.length > 0) {
      const calcLabels = disconnectedCalcs
        .map((item) => {
          const record = asRecord(item);
          const sheet = typeof record?.sheet === "string" ? record.sheet : "unknown-sheet";
          const cell = typeof record?.cell === "string" ? record.cell : "?";
          return `${sheet}!${cell}`;
        });
      lines.push(`- Disconnected calcs: ${calcLabels.join(" | ")}`);
    }
  }

  if (financialAudit) {
    const overallRisk = typeof financialAudit.overallRisk === "string" ? financialAudit.overallRisk : "unknown";
    lines.push(`- Financial audit overall risk: ${overallRisk}`);

    const criticalFlags = [
      ...(Array.isArray(financialAudit.consistencyFlags) ? financialAudit.consistencyFlags : []),
      ...(Array.isArray(financialAudit.reconciliationFlags) ? financialAudit.reconciliationFlags : []),
      ...(Array.isArray(financialAudit.plausibilityFlags) ? financialAudit.plausibilityFlags : []),
      ...(Array.isArray(financialAudit.heroicAssumptionFlags) ? financialAudit.heroicAssumptionFlags : []),
      ...(Array.isArray(financialAudit.dependencyFlags) ? financialAudit.dependencyFlags : []),
    ]
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .slice(0, 8)
      .map((flag) => {
        const severity = typeof flag.severity === "string" ? flag.severity : "unknown";
        const title = typeof flag.title === "string" ? flag.title : "flag";
        return `${severity}:${title}`;
      });

    if (criticalFlags.length > 0) {
      lines.push(`- Priority audit flags: ${criticalFlags.join(" | ")}`);
    }
  }

  if (analystReport) {
    const executiveSummary = typeof analystReport.executiveSummary === "string"
      ? analystReport.executiveSummary
      : null;
    const topRedFlags = asStringArray(analystReport.topRedFlags).slice(0, 5);
    const keyQuestions = asStringArray(analystReport.keyQuestions).slice(0, 5);

    if (executiveSummary) {
      lines.push(`- Analyst summary: ${executiveSummary}`);
    }
    if (topRedFlags.length > 0) {
      lines.push(`- Analyst red flags: ${topRedFlags.join(" | ")}`);
    }
    if (keyQuestions.length > 0) {
      lines.push(`- Analyst key questions: ${keyQuestions.join(" | ")}`);
    }
  }

  return lines.length > 1 ? lines.join("\n") : null;
}
