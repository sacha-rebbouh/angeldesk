/**
 * RED FLAG DEDUPLICATION SERVICE
 *
 * Service in-memory pour dédupliquer les red flags entre agents.
 * Instancié une fois par analyse, partagé entre tous les agents.
 *
 * Règles de dédup :
 * - Même `topic` → consolidé en 1 finding
 * - Severity = max des sévérités détectées
 * - Evidence = union des evidences
 * - Sources = liste de tous les agents qui l'ont détecté
 */

import type {
  AgentRedFlagEntry,
  ConsolidatedRedFlag,
  DedupSummary,
  RedFlagEvidence,
  RedFlagSeverity,
} from "./types";

const SEVERITY_ORDER: Record<RedFlagSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function maxSeverity(a: RedFlagSeverity, b: RedFlagSeverity): RedFlagSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

export class RedFlagDedup {
  /** Map: topic → list of raw entries from different agents */
  private entries = new Map<string, AgentRedFlagEntry[]>();
  /** Cached consolidated result (invalidated on register) */
  private _consolidatedCache: ConsolidatedRedFlag[] | null = null;

  /**
   * Publie un red flag détecté par un agent.
   * Si un red flag avec le même topic existe déjà, il sera consolidé lors de getConsolidated().
   */
  register(entry: AgentRedFlagEntry): void {
    const existing = this.entries.get(entry.topic) ?? [];
    // Éviter les doublons du même agent (même agent, même topic)
    if (!existing.some((e) => e.agentSource === entry.agentSource)) {
      existing.push(entry);
      this._consolidatedCache = null; // Invalidate cache
    }
    this.entries.set(entry.topic, existing);
  }

  /**
   * Publie plusieurs red flags d'un coup (typiquement tous les red flags d'un agent).
   */
  registerBatch(entries: AgentRedFlagEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  /**
   * Retourne les red flags consolidés après déduplication.
   * Triés par sévérité (CRITICAL > HIGH > MEDIUM > LOW).
   */
  getConsolidated(): ConsolidatedRedFlag[] {
    if (this._consolidatedCache) return this._consolidatedCache;
    const consolidated: ConsolidatedRedFlag[] = [];

    for (const [topic, entries] of this.entries) {
      if (entries.length === 0) continue;

      // Sévérité = max de toutes les détections
      let highestSeverity: RedFlagSeverity = "LOW";
      const detectedBy: string[] = [];
      const allEvidence: RedFlagEvidence[] = [];
      const questions: string[] = [];

      for (const entry of entries) {
        highestSeverity = maxSeverity(highestSeverity, entry.severity);
        if (!detectedBy.includes(entry.agentSource)) {
          detectedBy.push(entry.agentSource);
        }
        allEvidence.push(...entry.evidence);
        if (entry.questionForFounder && !questions.includes(entry.questionForFounder)) {
          questions.push(entry.questionForFounder);
        }
      }

      // Prendre le titre/description le plus détaillé (le plus long)
      const bestEntry = entries.reduce((best, e) =>
        e.description.length > best.description.length ? e : best
      );

      // Consolider les impacts
      const impacts = entries
        .filter((e) => e.impact)
        .map((e) => e.impact!)
        .filter((impact, i, arr) => arr.indexOf(impact) === i);

      consolidated.push({
        topic,
        category: bestEntry.category,
        subcategory: bestEntry.subcategory,
        title: bestEntry.title,
        description: bestEntry.description,
        severity: highestSeverity,
        detectedBy,
        detectionCount: detectedBy.length,
        evidence: deduplicateEvidence(allEvidence),
        impact: impacts.length > 0 ? impacts.join(" | ") : undefined,
        questionsForFounder: questions,
      });
    }

    // Tri par sévérité puis par nombre de détections
    consolidated.sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.detectionCount - a.detectionCount;
    });

    this._consolidatedCache = consolidated;
    return consolidated;
  }

  /**
   * Retourne un résumé de la déduplication.
   */
  getSummary(): DedupSummary {
    const consolidated = this.getConsolidated();
    let totalRaw = 0;
    for (const entries of this.entries.values()) {
      totalRaw += entries.length;
    }

    const bySeverity: Record<RedFlagSeverity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const rf of consolidated) {
      bySeverity[rf.severity]++;
    }

    return {
      totalRaw,
      totalConsolidated: consolidated.length,
      dedupRate: totalRaw > 0 ? Math.round((1 - consolidated.length / totalRaw) * 100) / 100 : 0,
      bySeverity,
    };
  }

  /**
   * Retourne le nombre total de red flags bruts enregistrés.
   */
  get rawCount(): number {
    let total = 0;
    for (const entries of this.entries.values()) {
      total += entries.length;
    }
    return total;
  }

  /**
   * Formate les red flags consolidés pour injection dans un prompt LLM.
   */
  formatForPrompt(maxEntries = 15): string {
    const consolidated = this.getConsolidated();

    if (consolidated.length === 0) {
      return "Aucun red flag détecté par les agents.";
    }

    const summary = this.getSummary();
    const lines: string[] = [
      `**${summary.totalConsolidated} red flags consolidés** (dédupliqués depuis ${summary.totalRaw} détections brutes)`,
      `Répartition : ${summary.bySeverity.CRITICAL} CRITICAL, ${summary.bySeverity.HIGH} HIGH, ${summary.bySeverity.MEDIUM} MEDIUM, ${summary.bySeverity.LOW} LOW`,
      "",
    ];

    const toShow = consolidated.slice(0, maxEntries);

    for (const rf of toShow) {
      lines.push(`### [${rf.severity}] ${rf.title}`);
      lines.push(`Détecté par : ${rf.detectedBy.join(", ")} (${rf.detectionCount} agents)`);
      lines.push(rf.description);
      if (rf.evidence.length > 0) {
        const topEvidence = rf.evidence.slice(0, 3);
        lines.push("Preuves : " + topEvidence.map((e) => `[${e.source}]${e.quote ? ` "${e.quote}"` : ""}`).join(" | "));
      }
      if (rf.impact) {
        lines.push(`Impact : ${rf.impact}`);
      }
      lines.push("");
    }

    if (consolidated.length > maxEntries) {
      lines.push(`... et ${consolidated.length - maxEntries} red flags supplémentaires`);
    }

    return lines.join("\n");
  }

  /**
   * Reset le service (pour réutilisation).
   */
  clear(): void {
    this.entries.clear();
    this._consolidatedCache = null;
  }
}

/**
 * Infer a canonical dedup topic from a red flag title.
 * Maps common patterns (French & English) to canonical topics.
 * Used by both backend (synthesis prompt) and frontend (red flags summary).
 */
export function inferRedFlagTopic(title: string, category?: string): string {
  const lower = title.toLowerCase();

  const topicPatterns: [RegExp, string][] = [
    [/churn|attrition|retention/, "churn"],
    [/vesting|cliff/, "vesting"],
    [/esop|pool.*option|stock.*option/, "esop"],
    [/valorisation|valuation|valo|multiple.*arr|multiple.*marché/, "valuation"],
    [/burn.*rate|cash.*burn|runway/, "burn_rate"],
    [/arr|mrr|revenue|chiffre.*affaire|reporting.*financ/, "revenue_metrics"],
    [/unit.*eco|ltv.*cac|cac|ltv/, "unit_economics"],
    [/incohéren|inconsisten|contradict|écart|divergen/, "data_inconsistency"],
    [/fondateur.*men|mensonge|falsif|intégrité/, "founder_integrity"],
    [/ip|propriété.*intellectuel|brevet|patent/, "ip_ownership"],
    [/concurrent|competi/, "competition"],
    [/marché|market.*size|tam|sam/, "market_size"],
    [/equipe|team.*size|fondateur.*solo/, "team"],
    [/dilution/, "dilution"],
    [/dette.*tech|technical.*debt/, "tech_debt"],
    [/concentration.*client|customer.*concentration/, "customer_concentration"],
    [/legal|juridique|rgpd|gdpr/, "legal_compliance"],
    [/scalab|non.*scalable|modèle.*service/, "scalability"],
    [/gtm|go.*to.*market|croissance|growth/, "gtm"],
    [/marge|margin/, "margin"],
    [/structure.*invest|toxique|ratchet|liquidat/, "deal_structure"],
  ];

  for (const [pattern, topic] of topicPatterns) {
    if (pattern.test(lower)) return topic;
  }

  return `${category ?? "other"}::${lower.slice(0, 40).replace(/[^a-z0-9]/g, "_")}`;
}

/** Déduplique les evidences (même source + même quote = 1 seule) */
function deduplicateEvidence(evidence: RedFlagEvidence[]): RedFlagEvidence[] {
  const seen = new Set<string>();
  const result: RedFlagEvidence[] = [];

  for (const e of evidence) {
    const key = `${e.source}::${e.quote ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }

  return result;
}
