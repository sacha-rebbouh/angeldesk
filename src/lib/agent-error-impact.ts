/** Impact de l'échec de chaque agent sur l'analyse globale */
export const AGENT_ERROR_IMPACT: Record<string, {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  missingAnalysis: string;
  recommendation: string;
}> = {
  "financial-auditor": {
    severity: "CRITICAL",
    missingAnalysis: "Audit financier complet (métriques, valorisation, unit economics)",
    recommendation: "Relancez l'analyse. Sans audit financier, le scoring et le mémo sont incomplets.",
  },
  "team-investigator": {
    severity: "CRITICAL",
    missingAnalysis: "Investigation équipe (vérification background, red flags fondateurs)",
    recommendation: "Relancez l'analyse. L'équipe représente 25% du score final.",
  },
  "deck-forensics": {
    severity: "HIGH",
    missingAnalysis: "Analyse forensique du deck (cohérence chiffres, red flags visuels)",
    recommendation: "Les chiffres du deck n'ont pas été vérifiés automatiquement.",
  },
  "competitive-intel": {
    severity: "HIGH",
    missingAnalysis: "Intelligence concurrentielle (concurrents, moat, menaces)",
    recommendation: "L'analyse concurrentielle est manquante. Vérifiez manuellement.",
  },
  "market-intelligence": {
    severity: "MEDIUM",
    missingAnalysis: "Analyse de marché (TAM/SAM/SOM, timing, tendances)",
    recommendation: "Les données de marché ne sont pas disponibles dans cette analyse.",
  },
  "tech-stack-dd": {
    severity: "MEDIUM",
    missingAnalysis: "Due diligence technique (stack, scalabilité, dette technique)",
    recommendation: "L'évaluation technique est manquante.",
  },
  "tech-ops-dd": {
    severity: "MEDIUM",
    missingAnalysis: "Opérations techniques (maturité, sécurité, IP)",
    recommendation: "L'évaluation ops/sécurité est manquante.",
  },
  "legal-regulatory": {
    severity: "MEDIUM",
    missingAnalysis: "Analyse légale et réglementaire",
    recommendation: "Les risques légaux n'ont pas été évalués.",
  },
  "cap-table-auditor": {
    severity: "MEDIUM",
    missingAnalysis: "Audit cap table (dilution, clauses, droits)",
    recommendation: "La table de capitalisation n'a pas été auditée.",
  },
  "gtm-analyst": {
    severity: "LOW",
    missingAnalysis: "Analyse Go-to-Market (stratégie, canaux, CAC)",
    recommendation: "L'analyse GTM est manquante mais non bloquante.",
  },
  "customer-intel": {
    severity: "LOW",
    missingAnalysis: "Intelligence client (rétention, NPS, concentration)",
    recommendation: "Les métriques client ne sont pas disponibles.",
  },
  "exit-strategist": {
    severity: "LOW",
    missingAnalysis: "Stratégie de sortie (acquéreurs, timeline, multiples)",
    recommendation: "L'analyse de sortie est manquante.",
  },
  "question-master": {
    severity: "LOW",
    missingAnalysis: "Génération des questions pour le fondateur",
    recommendation: "Les questions automatiques ne sont pas disponibles.",
  },
  "synthesis-deal-scorer": {
    severity: "CRITICAL",
    missingAnalysis: "Score final synthétique et recommandation",
    recommendation: "Le score final n'a pas pu être calculé. Relancez l'analyse.",
  },
  "scenario-modeler": {
    severity: "HIGH",
    missingAnalysis: "Modélisation des scénarios (BULL/BASE/BEAR/CATASTROPHIC)",
    recommendation: "Les scénarios de retour ne sont pas disponibles.",
  },
  "devils-advocate": {
    severity: "HIGH",
    missingAnalysis: "Analyse contradictoire (kill reasons, blind spots)",
    recommendation: "L'avocat du diable n'a pas pu challenger la thèse.",
  },
  "contradiction-detector": {
    severity: "MEDIUM",
    missingAnalysis: "Détection des contradictions entre agents",
    recommendation: "Les contradictions n'ont pas été détectées automatiquement.",
  },
  "memo-generator": {
    severity: "HIGH",
    missingAnalysis: "Mémo d'investissement complet",
    recommendation: "Le mémo n'a pas pu être généré. Les résultats individuels restent disponibles.",
  },
};

export function getAgentErrorImpact(agentName: string) {
  return AGENT_ERROR_IMPACT[agentName] ?? {
    severity: "LOW" as const,
    missingAnalysis: `Analyse de ${agentName}`,
    recommendation: "Un agent a échoué. Résultats partiels disponibles.",
  };
}

export function formatDetailedError(agentName: string, error: string): {
  shortMessage: string;
  detailedMessage: string;
  impact: (typeof AGENT_ERROR_IMPACT)[string];
  errorType: "timeout" | "rate_limit" | "auth" | "server" | "credits" | "unknown";
} {
  let errorType: "timeout" | "rate_limit" | "auth" | "server" | "credits" | "unknown" = "unknown";
  let shortMessage = error;

  if (error.includes("timeout") || error.includes("Timeout")) {
    errorType = "timeout";
    shortMessage = "Délai dépassé";
  } else if (error.includes("429") || error.includes("rate limit")) {
    errorType = "rate_limit";
    shortMessage = "Limite API atteinte";
  } else if (error.includes("401") || error.includes("Unauthorized")) {
    errorType = "auth";
    shortMessage = "Erreur d'authentification";
  } else if (error.includes("500") || error.includes("Internal")) {
    errorType = "server";
    shortMessage = "Erreur serveur LLM";
  } else if (error.includes("402") || error.includes("credits")) {
    errorType = "credits";
    shortMessage = "Crédits insuffisants";
  }

  const impact = getAgentErrorImpact(agentName);

  return {
    shortMessage,
    detailedMessage: error,
    impact,
    errorType,
  };
}
