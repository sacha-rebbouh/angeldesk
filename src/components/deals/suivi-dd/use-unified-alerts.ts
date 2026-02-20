import { useMemo } from "react";
import { devilsAdvocateAlertKey, conditionsAlertKey } from "@/services/alert-resolution/alert-keys";
import { consolidateRedFlagsFromResults } from "@/services/red-flag-dedup/consolidate";
import { inferRedFlagTopic } from "@/services/red-flag-dedup/dedup";
import type { AlertResolution } from "@/hooks/use-resolutions";
import type { AgentQuestion, QuestionResponse } from "@/components/deals/founder-responses";
import type { TermsResponse } from "@/components/deals/conditions/types";
import type { UnifiedAlert, AlertCounts } from "./unified-alert";
import { severityRank } from "./unified-alert";

// ── Severity validation ──
const VALID_SEVERITIES = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
function validatedSeverity(raw: string | undefined): UnifiedAlert["severity"] {
  const upper = raw?.toUpperCase() ?? "MEDIUM";
  return VALID_SEVERITIES.has(upper) ? upper as UnifiedAlert["severity"] : "MEDIUM";
}

// ── Types for agent results ──

interface AgentResult {
  agentName: string;
  success: boolean;
  data?: unknown;
}

interface KillReason {
  id: string;
  reason: string;
  category?: string;
  evidence: string;
  dealBreakerLevel: "ABSOLUTE" | "CONDITIONAL" | "CONCERN";
  questionToFounder?: string;
  impactIfIgnored?: string;
  resolutionPath?: string;
}

interface DAFindings {
  killReasons?: KillReason[];
  concernsSummary?: {
    absolute?: string[];
    conditional?: string[];
    serious?: string[];
    minor?: string[];
  };
}

interface DAData {
  findings?: DAFindings;
}

// ── Hook input ──

export interface UseUnifiedAlertsInput {
  results: Record<string, AgentResult> | null;
  conditionsData: TermsResponse | null | undefined;
  resolutionMap: Record<string, AlertResolution>;
  founderQuestions: AgentQuestion[];
  existingResponses: QuestionResponse[];
}

// Red flag consolidation shared from @/services/red-flag-dedup/consolidate

// ── Question linking helpers ──

function normalizeForMatch(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").trim();
}

function wordsOverlap(a: string, b: string): number {
  const wordsA = new Set(normalizeForMatch(a).split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(normalizeForMatch(b).split(/\s+/).filter(w => w.length > 3));
  let count = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) count++;
  }
  return count;
}

// ── Main hook ──

export function useUnifiedAlerts({
  results,
  conditionsData,
  resolutionMap,
  founderQuestions,
  existingResponses,
}: UseUnifiedAlertsInput) {
  return useMemo(() => {
    const alerts: UnifiedAlert[] = [];
    const linkedQuestionIds = new Set<string>();

    // Build response lookup: questionId → response
    const responseMap = new Map<string, QuestionResponse>();
    for (const r of existingResponses) {
      responseMap.set(r.questionId, r);
    }

    // ── 1. Red Flags (Tier 1) ──
    if (results) {
      const consolidated = consolidateRedFlagsFromResults(results);
      for (const flag of consolidated) {
        // Try to find a matching founder question
        let linkedQ: UnifiedAlert["linkedQuestion"] = null;
        let linkedR: UnifiedAlert["linkedResponse"] = null;

        // First: use embedded question from the red flag itself
        if (flag.question) {
          // Try to match to a consolidated question for the questionId
          const matchedQ = founderQuestions.find(q =>
            wordsOverlap(q.question, flag.question!) >= 3 ||
            normalizeForMatch(q.question).includes(normalizeForMatch(flag.question!).slice(0, 30))
          );
          if (matchedQ) {
            linkedQ = { questionId: matchedQ.id, question: flag.question, priority: matchedQ.priority, category: matchedQ.category };
            linkedQuestionIds.add(matchedQ.id);
            const resp = responseMap.get(matchedQ.id);
            if (resp?.answer) linkedR = { answer: resp.answer, status: resp.status };
          } else {
            linkedQ = { questionId: `rf-${flag.topic}`, question: flag.question, priority: "HIGH", category: "OTHER" };
          }
        }

        // Skip flags with no usable title
        if (!flag.title?.trim() && !flag.topic?.trim()) continue;

        alerts.push({
          id: flag.alertKey,
          alertKey: flag.alertKey,
          alertType: "RED_FLAG",
          severity: flag.severity,
          title: flag.title?.trim() || flag.topic.replace(/_/g, " "),
          description: flag.description,
          evidence: flag.evidence,
          impact: flag.impact,
          source: flag.detectedBy[0] ?? "unknown",
          detectedBy: flag.detectedBy,
          duplicateCount: flag.duplicateCount > 1 ? flag.duplicateCount : undefined,
          resolution: resolutionMap[flag.alertKey] ?? null,
          linkedQuestion: linkedQ,
          linkedResponse: linkedR,
        });
      }
    }

    // ── 2. Devil's Advocate (Tier 3) ──
    if (results) {
      const daResult = results["devils-advocate"];
      if (daResult?.success && daResult.data) {
        const daData = daResult.data as DAData;

        // Kill reasons
        for (const kr of daData.findings?.killReasons ?? []) {
          const alertKey = devilsAdvocateAlertKey("killReason", kr.reason);
          const severity = kr.dealBreakerLevel === "ABSOLUTE" ? "CRITICAL" : kr.dealBreakerLevel === "CONDITIONAL" ? "HIGH" : "MEDIUM";

          let linkedQ: UnifiedAlert["linkedQuestion"] = null;
          let linkedR: UnifiedAlert["linkedResponse"] = null;
          if (kr.questionToFounder) {
            const matchedQ = founderQuestions.find(q => wordsOverlap(q.question, kr.questionToFounder!) >= 3);
            if (matchedQ) {
              linkedQ = { questionId: matchedQ.id, question: kr.questionToFounder, priority: matchedQ.priority, category: matchedQ.category };
              linkedQuestionIds.add(matchedQ.id);
              const resp = responseMap.get(matchedQ.id);
              if (resp?.answer) linkedR = { answer: resp.answer, status: resp.status };
            } else {
              linkedQ = { questionId: `da-kr-${kr.id}`, question: kr.questionToFounder, priority: "CRITICAL", category: "OTHER" };
            }
          }

          alerts.push({
            id: alertKey,
            alertKey,
            alertType: "DEVILS_ADVOCATE",
            subType: "killReason",
            severity,
            title: kr.reason,
            description: kr.evidence,
            impact: kr.impactIfIgnored,
            source: "devils-advocate",
            dealBreakerLevel: kr.dealBreakerLevel,
            resolutionPath: kr.resolutionPath,
            resolution: resolutionMap[alertKey] ?? null,
            linkedQuestion: linkedQ,
            linkedResponse: linkedR,
          });
        }

        // Concerns
        const concernLevels: Array<{ items: string[]; level: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" }> = [
          { items: daData.findings?.concernsSummary?.absolute ?? [], level: "absolute", severity: "CRITICAL" },
          { items: daData.findings?.concernsSummary?.conditional ?? [], level: "conditional", severity: "HIGH" },
          { items: daData.findings?.concernsSummary?.serious ?? [], level: "serious", severity: "MEDIUM" },
          { items: daData.findings?.concernsSummary?.minor ?? [], level: "minor", severity: "LOW" },
        ];

        for (const { items, level, severity } of concernLevels) {
          for (const text of items) {
            const alertKey = devilsAdvocateAlertKey("concern", text);
            alerts.push({
              id: alertKey,
              alertKey,
              alertType: "DEVILS_ADVOCATE",
              subType: `concern-${level}`,
              severity,
              title: text,
              source: "devils-advocate",
              resolution: resolutionMap[alertKey] ?? null,
            });
          }
        }
      }
    }

    // ── 3. Conditions ──
    if (conditionsData) {
      // Conditions red flags
      for (const flag of conditionsData.redFlags ?? []) {
        const alertKey = conditionsAlertKey("redFlag", flag.title, flag.category);
        const severity = validatedSeverity(flag.severity);

        let linkedQ: UnifiedAlert["linkedQuestion"] = null;
        let linkedR: UnifiedAlert["linkedResponse"] = null;
        if (flag.question) {
          const matchedQ = founderQuestions.find(q => wordsOverlap(q.question, flag.question!) >= 3);
          if (matchedQ) {
            linkedQ = { questionId: matchedQ.id, question: flag.question, priority: matchedQ.priority, category: matchedQ.category };
            linkedQuestionIds.add(matchedQ.id);
            const resp = responseMap.get(matchedQ.id);
            if (resp?.answer) linkedR = { answer: resp.answer, status: resp.status };
          } else {
            linkedQ = { questionId: `cond-rf-${flag.id}`, question: flag.question, priority: "HIGH", category: "OTHER" };
          }
        }

        alerts.push({
          id: alertKey,
          alertKey,
          alertType: "CONDITIONS",
          subType: "redFlag",
          severity,
          title: flag.title,
          description: flag.description,
          evidence: flag.evidence,
          impact: flag.impact,
          source: "conditions-analyst",
          resolution: resolutionMap[alertKey] ?? null,
          linkedQuestion: linkedQ,
          linkedResponse: linkedR,
        });
      }

      // Negotiation advice
      for (const advice of conditionsData.negotiationAdvice ?? []) {
        const alertKey = conditionsAlertKey("negotiation", advice.point);
        const severity = validatedSeverity(advice.priority);

        alerts.push({
          id: alertKey,
          alertKey,
          alertType: "CONDITIONS",
          subType: "negotiation",
          severity,
          title: advice.point,
          description: advice.suggestedArgument,
          source: "conditions-analyst",
          suggestedArgument: advice.suggestedArgument,
          leverageSource: advice.leverageSource,
          resolution: resolutionMap[alertKey] ?? null,
        });
      }
    }

    // ── Cross-type dedup: merge DA/CONDITIONS into matching RED_FLAG ──
    // Build topic → alert index map from RED_FLAG entries
    const topicToRFIndex = new Map<string, number>();
    for (let i = 0; i < alerts.length; i++) {
      const a = alerts[i];
      if (a.alertType === "RED_FLAG" && a.alertKey.startsWith("RED_FLAG::")) {
        const topic = a.alertKey.slice("RED_FLAG::".length);
        topicToRFIndex.set(topic, i);
      }
    }

    // Merge DA/CONDITIONS entries that match an existing RF topic
    const mergedIndices = new Set<number>();
    for (let i = 0; i < alerts.length; i++) {
      const a = alerts[i];
      if (a.alertType === "RED_FLAG") continue;

      // Infer topic from this alert's title
      const topic = inferRedFlagTopic(a.title);
      const rfIdx = topicToRFIndex.get(topic);
      if (rfIdx === undefined) continue;

      const rf = alerts[rfIdx];

      // Merge: enrich the RF entry with DA/CONDITIONS data
      if (!rf.mergedFrom) rf.mergedFrom = [rf.alertType];
      rf.mergedFrom.push(a.alertType);

      // Add DA-specific fields
      if (a.dealBreakerLevel && !rf.dealBreakerLevel) rf.dealBreakerLevel = a.dealBreakerLevel;
      if (a.resolutionPath && !rf.resolutionPath) rf.resolutionPath = a.resolutionPath;
      if (a.suggestedArgument && !rf.suggestedArgument) rf.suggestedArgument = a.suggestedArgument;
      if (a.leverageSource && !rf.leverageSource) rf.leverageSource = a.leverageSource;

      // Add source to detectedBy
      if (a.source && !rf.detectedBy?.includes(a.source)) {
        rf.detectedBy = [...(rf.detectedBy ?? []), a.source];
      }

      // Prefer DA impact if RF has none
      if (a.impact && !rf.impact) rf.impact = a.impact;

      // Add linked question from DA/CONDITIONS if RF doesn't have one
      if (a.linkedQuestion && !rf.linkedQuestion) {
        rf.linkedQuestion = a.linkedQuestion;
        rf.linkedResponse = a.linkedResponse;
      }

      // Upgrade severity if the merged alert is more severe
      const sevMap = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
      if ((sevMap[a.severity] ?? 3) < (sevMap[rf.severity] ?? 3)) {
        rf.severity = a.severity;
      }

      mergedIndices.add(i);
    }

    // Remove merged entries
    const dedupedAlerts = alerts.filter((_, i) => !mergedIndices.has(i));

    // ── Sort: severity desc → open first → multi-agent first ──
    dedupedAlerts.sort((a, b) => {
      const aResolved = a.resolution ? 1 : 0;
      const bResolved = b.resolution ? 1 : 0;
      if (aResolved !== bResolved) return aResolved - bResolved;
      const sevDiff = severityRank(a.severity) - severityRank(b.severity);
      if (sevDiff !== 0) return sevDiff;
      return (b.detectedBy?.length ?? 1) - (a.detectedBy?.length ?? 1);
    });

    // ── Unlinked questions ──
    const unlinkedQuestions = founderQuestions.filter(q => !linkedQuestionIds.has(q.id));

    // ── Counts ──
    let questionsTotal = 0;
    let questionsAnswered = 0;
    for (const a of dedupedAlerts) {
      if (a.linkedQuestion) {
        questionsTotal++;
        if (a.linkedResponse?.status === "answered") questionsAnswered++;
      }
    }
    questionsTotal += unlinkedQuestions.length;
    for (const q of unlinkedQuestions) {
      const resp = responseMap.get(q.id);
      if (resp?.status === "answered") questionsAnswered++;
    }

    const counts: AlertCounts = {
      total: dedupedAlerts.length,
      open: dedupedAlerts.filter(a => !a.resolution).length,
      resolved: dedupedAlerts.filter(a => a.resolution?.status === "RESOLVED").length,
      accepted: dedupedAlerts.filter(a => a.resolution?.status === "ACCEPTED").length,
      bySeverity: {},
      byType: { RED_FLAG: 0, DEVILS_ADVOCATE: 0, CONDITIONS: 0 },
      questionsAnswered,
      questionsTotal,
    };

    for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW"]) {
      const ofSev = dedupedAlerts.filter(a => a.severity === sev);
      counts.bySeverity[sev] = {
        total: ofSev.length,
        open: ofSev.filter(a => !a.resolution).length,
      };
    }
    for (const a of dedupedAlerts) {
      // Count merged types: a RF+DA card counts in both RF and DA
      const types = a.mergedFrom ?? [a.alertType];
      for (const t of new Set(types)) {
        counts.byType[t] = (counts.byType[t] ?? 0) + 1;
      }
    }

    const progressPct = counts.total > 0 ? Math.round(((counts.resolved + counts.accepted) / counts.total) * 100) : 0;

    return { alerts: dedupedAlerts, unlinkedQuestions, counts, progressPct };
  }, [results, conditionsData, resolutionMap, founderQuestions, existingResponses]);
}
