/**
 * Shared Red Flag Consolidation
 *
 * Consolidates raw red flags from multiple agents into deduplicated entries.
 * Used by both red-flags-summary.tsx and use-unified-alerts.ts.
 */

import { inferRedFlagTopic, TOPIC_AUTHORITY } from "./dedup";
import { redFlagAlertKey } from "@/services/alert-resolution/alert-keys";

// ── Input types ──

export interface RawRedFlag {
  id?: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description?: string;
  evidence?: string;
  category?: string;
  question?: string;
  impact?: string;
}

export interface AgentRedFlagsInput {
  agentName: string;
  redFlags: RawRedFlag[];
}

// ── Output type ──

export interface ConsolidatedFlag {
  topic: string;
  alertKey: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description?: string;
  evidence?: string;
  impact?: string;
  question?: string;
  detectedBy: string[];
  duplicateCount: number;
  /** All individual red flags that were merged (for detailed display) */
  duplicates: (RawRedFlag & { agentName: string })[];
}

// ── Consolidation from AgentRedFlagsInput[] (red-flags-summary style) ──

export function consolidateRedFlagsFromAgents(agentResults: AgentRedFlagsInput[]): ConsolidatedFlag[] {
  const topicMap = new Map<string, ConsolidatedFlag>();

  for (const agent of agentResults) {
    for (const rf of agent.redFlags) {
      // Skip red flags with empty titles — they produce useless cards
      if (!rf.title?.trim()) continue;
      const topic = inferRedFlagTopic(rf.title, rf.category);
      const existing = topicMap.get(topic);

      if (existing) {
        if (!existing.detectedBy.includes(agent.agentName)) {
          existing.detectedBy.push(agent.agentName);
        }
        existing.duplicateCount++;
        existing.duplicates.push({ ...rf, agentName: agent.agentName });

        const authorities = TOPIC_AUTHORITY[topic];
        if (authorities) {
          const existingAuthIdx = authorities.indexOf(existing.detectedBy[0]);
          const newAuthIdx = authorities.indexOf(agent.agentName);
          if (newAuthIdx !== -1 && (existingAuthIdx === -1 || newAuthIdx < existingAuthIdx)) {
            existing.severity = rf.severity;
            existing.title = rf.title;
            if (rf.description) existing.description = rf.description;
            if (rf.evidence) existing.evidence = rf.evidence;
            if (rf.impact) existing.impact = rf.impact;
            if (rf.question) existing.question = rf.question;
          }
        } else {
          if (rf.description && !existing.description) existing.description = rf.description;
          if (rf.evidence && !existing.evidence) existing.evidence = rf.evidence;
          if (rf.impact && !existing.impact) existing.impact = rf.impact;
          if (rf.question && !existing.question) existing.question = rf.question;
        }
      } else {
        topicMap.set(topic, {
          topic,
          alertKey: redFlagAlertKey(rf.title, rf.category),
          severity: rf.severity,
          title: rf.title,
          description: rf.description,
          evidence: rf.evidence,
          impact: rf.impact,
          question: rf.question,
          detectedBy: [agent.agentName],
          duplicateCount: 1,
          duplicates: [{ ...rf, agentName: agent.agentName }],
        });
      }
    }
  }

  return Array.from(topicMap.values());
}

// ── Consolidation from Record<string, AgentResult> (use-unified-alerts style) ──

interface AgentResultLike {
  agentName: string;
  success: boolean;
  data?: unknown;
}

export function consolidateRedFlagsFromResults(results: Record<string, AgentResultLike>): ConsolidatedFlag[] {
  const agentInputs: AgentRedFlagsInput[] = [];

  for (const [agentName, result] of Object.entries(results)) {
    if (!result.success || !result.data) continue;
    const data = result.data as { redFlags?: RawRedFlag[] };
    if (!Array.isArray(data.redFlags)) continue;
    agentInputs.push({ agentName, redFlags: data.redFlags });
  }

  return consolidateRedFlagsFromAgents(agentInputs);
}
