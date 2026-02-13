/**
 * RED FLAG DEDUPLICATION SERVICE - Types
 *
 * Types pour la déduplication des red flags entre agents.
 * Problème résolu : 8 agents détectent le même problème → 8 pénalités.
 * Solution : chaque agent publie ses red flags, le service déduplique par topic.
 */

export type RedFlagSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/** Red flag publié par un agent individuel */
export interface AgentRedFlagEntry {
  /** ID unique: "{agentName}::{topic}" */
  id: string;
  /** Agent qui a détecté ce red flag */
  agentSource: string;
  /** Topic de dédup (ex: "churn", "no_vesting", "inconsistent_data") */
  topic: string;
  /** Catégorie de red flag (alignée avec red-flag-taxonomy.ts) */
  category: string;
  /** Sous-catégorie (ex: "retention", "vesting", "disclosure") */
  subcategory?: string;
  /** Titre court du red flag */
  title: string;
  /** Description détaillée */
  description: string;
  /** Sévérité (déjà calibrée au stage par l'agent) */
  severity: RedFlagSeverity;
  /** Preuves / sources */
  evidence: RedFlagEvidence[];
  /** Impact estimé (texte libre) */
  impact?: string;
  /** Question à poser au fondateur */
  questionForFounder?: string;
}

export interface RedFlagEvidence {
  source: string;
  quote?: string;
  type?: "document" | "data" | "calculation" | "external" | "inference";
}

/** Red flag consolidé après déduplication */
export interface ConsolidatedRedFlag {
  /** Topic de dédup (clé unique) */
  topic: string;
  /** Catégorie */
  category: string;
  /** Sous-catégorie */
  subcategory?: string;
  /** Titre (du premier agent qui l'a détecté ou le plus spécifique) */
  title: string;
  /** Description consolidée */
  description: string;
  /** Sévérité = max des sévérités détectées par tous les agents */
  severity: RedFlagSeverity;
  /** Tous les agents qui ont détecté ce red flag */
  detectedBy: string[];
  /** Nombre d'agents qui l'ont détecté (signal de confiance) */
  detectionCount: number;
  /** Toutes les preuves consolidées */
  evidence: RedFlagEvidence[];
  /** Impact consolidé */
  impact?: string;
  /** Questions à poser (dédupliquées) */
  questionsForFounder: string[];
}

/** Résumé de la déduplication pour le scoring */
export interface DedupSummary {
  /** Nombre total de red flags bruts (avant dédup) */
  totalRaw: number;
  /** Nombre de red flags consolidés (après dédup) */
  totalConsolidated: number;
  /** Taux de dédup (1 - consolidated/raw) */
  dedupRate: number;
  /** Par sévérité */
  bySeverity: Record<RedFlagSeverity, number>;
}
