/**
 * F75: FOMO / artificial urgency detector.
 * Pre-LLM detection of pressure tactics in documents.
 * Runs before agents to flag suspicious patterns.
 */

export interface FOMODetection {
  detected: boolean;
  patterns: {
    pattern: string;
    location: string;
    excerpt: string;
    severity: "HIGH" | "MEDIUM";
  }[];
  overallRisk: "NONE" | "LOW" | "MEDIUM" | "HIGH";
}

const FOMO_PATTERNS = [
  { regex: /round\s+(ferme|close|closing|clos)\s+(dans|in|within)\s+\d+\s+(jours?|days?|semaines?|weeks?)/gi, severity: "HIGH" as const },
  { regex: /derniers?\s+tickets?\s+(disponibles?|restants?)/gi, severity: "HIGH" as const },
  { regex: /last\s+(tickets?|spots?|allocations?)\s+(available|remaining|left)/gi, severity: "HIGH" as const },
  { regex: /over\s*subscri(bed|pt)/gi, severity: "MEDIUM" as const },
  { regex: /sur\s*souscri(t|ption)/gi, severity: "MEDIUM" as const },
  { regex: /first\s+come\s+first\s+serve/gi, severity: "HIGH" as const },
  { regex: /premier\s+arriv[ée]\s+premier\s+servi/gi, severity: "HIGH" as const },
  { regex: /prix\s+(va|vont)\s+(augmenter|changer)/gi, severity: "MEDIUM" as const },
  { regex: /(price|terms?)\s+will\s+(increase|change)/gi, severity: "MEDIUM" as const },
  { regex: /ne\s+(ratez|manquez)\s+pas\s+(cette|cette)\s+opportunit[ée]/gi, severity: "MEDIUM" as const },
  { regex: /once\s+in\s+a\s+lifetime/gi, severity: "MEDIUM" as const },
  { regex: /plusieurs\s+term\s*sheets?/gi, severity: "MEDIUM" as const },
  { regex: /multiple\s+term\s*sheets?/gi, severity: "MEDIUM" as const },
  { regex: /un\s+investisseur\s+(majeur|important)\s+(a\s+dej[àa]|has\s+already)/gi, severity: "MEDIUM" as const },
];

export function detectFOMO(text: string, location = "document"): FOMODetection {
  const patterns: FOMODetection["patterns"] = [];

  for (const { regex, severity } of FOMO_PATTERNS) {
    // Reset regex lastIndex since we reuse them
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
      const start = Math.max(0, match.index - 50);
      const end = Math.min(text.length, match.index + match[0].length + 50);
      patterns.push({
        pattern: match[0],
        location,
        excerpt: text.slice(start, end).replace(/\n/g, " ").trim(),
        severity,
      });
    }
  }

  const highCount = patterns.filter(p => p.severity === "HIGH").length;
  const overallRisk: FOMODetection["overallRisk"] =
    highCount >= 2 ? "HIGH" :
    highCount >= 1 || patterns.length >= 3 ? "MEDIUM" :
    patterns.length > 0 ? "LOW" : "NONE";

  return { detected: patterns.length > 0, patterns, overallRisk };
}
