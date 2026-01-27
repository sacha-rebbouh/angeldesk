/**
 * Benchmark Injector
 *
 * Utilitaire pour injecter les benchmarks dans les prompts des agents tier2.
 *
 * ARCHITECTURE:
 * - Standards etablis (sector-standards.ts) -> Formules, seuils, regles
 * - Benchmarks dynamiques (dynamic-benchmarks.ts) -> Donnees de marche actuelles via recherche web
 *
 * USAGE:
 * const injection = await getBenchmarkInjection("SaaS", "SEED");
 * const prompt = `${systemPrompt}\n\n${injection}`;
 */

import {
  getSectorStandards,
  getBenchmarkSearchQueries,
  type SectorStandards,
} from "./sector-standards";
import {
  searchSectorBenchmarksCached,
  formatBenchmarksForPrompt,
  type DynamicBenchmarkResult,
} from "@/services/benchmarks/dynamic-benchmarks";

// ============================================================================
// TYPES
// ============================================================================

export interface BenchmarkInjection {
  /** Contenu formate pour injection dans le prompt */
  content: string;
  /** Standards etablis utilises */
  standards: SectorStandards | null;
  /** Benchmarks dynamiques (si recherche effectuee) */
  dynamicBenchmarks: DynamicBenchmarkResult | null;
  /** Recherche web effectuee ? */
  usedWebSearch: boolean;
}

// ============================================================================
// FORMAT STANDARDS
// ============================================================================

function formatStandardsForPrompt(standards: SectorStandards, stage: string): string {
  // Format metrics definitions
  const primaryMetrics = standards.primaryMetrics
    .map(
      (m) => `
### ${m.name} (${m.unit})
- **Description**: ${m.description}
- **Direction**: ${m.direction === "higher_better" ? "↑ Plus haut = mieux" : m.direction === "lower_better" ? "↓ Plus bas = mieux" : "🎯 Valeur cible"}
- **Contexte sectoriel**: ${m.sectorContext}
- **Recherche pour benchmarks**: ${m.searchKeywords.join(", ")}`
    )
    .join("\n");

  const secondaryMetrics = standards.secondaryMetrics
    .map(
      (m) => `
### ${m.name} (${m.unit})
- **Description**: ${m.description}
- **Contexte**: ${m.sectorContext}`
    )
    .join("\n");

  // Format unit economics formulas
  const formulas = standards.unitEconomicsFormulas
    .map(
      (f) => `
- **${f.name}** = ${f.formula}
  - Concernant: ${f.thresholds.concerning}
  - Bon: ${f.thresholds.good}
  - Excellent: ${f.thresholds.excellent}
  - [Source: ${f.source}]`
    )
    .join("\n");

  // Format red flag rules
  const redFlags = standards.redFlagRules
    .map(
      (r) =>
        `- ⚠️ **${r.severity.toUpperCase()}**: Si ${r.metric} ${r.condition === "below" ? "<" : ">"} ${r.threshold} → ${r.reason} [${r.source}]`
    )
    .join("\n");

  // Format risks and success patterns
  const risks = standards.sectorRisks.map((r) => `- ${r}`).join("\n");
  const successPatterns = standards.successPatterns.map((p) => `- ${p}`).join("\n");

  return `
## STANDARDS ${standards.sector.toUpperCase()} - Stage ${stage}

### METRIQUES PRIMAIRES (a evaluer obligatoirement)
${primaryMetrics}

### METRIQUES SECONDAIRES
${secondaryMetrics}

### FORMULES UNIT ECONOMICS (STANDARDS DE L'INDUSTRIE)
Ces formules sont des standards etablis qui ne changent pas:
${formulas}

### RED FLAGS AUTOMATIQUES
Si ces conditions sont detectees, c'est un red flag:
${redFlags}

### RISQUES SECTORIELS A SURVEILLER
${risks}

### PATTERNS DE SUCCES DU SECTEUR
${successPatterns}

### ACQUEREURS TYPIQUES
${standards.typicalAcquirers.join(", ")}
`;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Genere l'injection de benchmarks complete pour un prompt d'agent
 *
 * @param sector - Le secteur (SaaS, Fintech, AI, etc.)
 * @param stage - Le stage (SEED, SERIES_A, etc.)
 * @param options - Options de configuration
 * @returns L'injection formatee pour le prompt
 *
 * @example
 * const injection = await getBenchmarkInjection("SaaS", "SEED");
 * const systemPrompt = `Tu es un expert SaaS.\n\n${injection.content}`;
 */
export async function getBenchmarkInjection(
  sector: string,
  stage: string = "SEED",
  options: {
    /** Effectuer une recherche web pour les benchmarks actuels ? */
    useWebSearch?: boolean;
    /** Timeout pour la recherche web (ms) */
    webSearchTimeout?: number;
  } = {}
): Promise<BenchmarkInjection> {
  const { useWebSearch = true, webSearchTimeout = 15000 } = options;

  // 1. Get established standards (always available, no network call)
  const standards = getSectorStandards(sector);

  // 2. Optionally search for dynamic benchmarks
  let dynamicBenchmarks: DynamicBenchmarkResult | null = null;
  let usedWebSearch = false;

  if (useWebSearch) {
    try {
      // Use Promise.race with timeout
      const searchPromise = searchSectorBenchmarksCached(sector, stage);
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Benchmark search timeout")), webSearchTimeout)
      );

      dynamicBenchmarks = await Promise.race([searchPromise, timeoutPromise]);
      usedWebSearch = true;
    } catch (error) {
      console.warn(
        `[BenchmarkInjector] Web search failed for ${sector}/${stage}:`,
        error
      );
      // Continue without dynamic benchmarks
    }
  }

  // 3. Build the injection content
  let content = "";

  // Standards are always included
  if (standards) {
    content += formatStandardsForPrompt(standards, stage);
  } else {
    content += `
## STANDARDS SECTORIELS
**Note**: Pas de standards pre-definis pour le secteur "${sector}".
Utiliser les principes generaux d'evaluation startup.
`;
  }

  // Dynamic benchmarks added if available
  if (dynamicBenchmarks) {
    content += "\n\n---\n";
    content += formatBenchmarksForPrompt(dynamicBenchmarks);
  } else if (useWebSearch) {
    content += `
## BENCHMARKS DE MARCHE ACTUELS
**Note**: La recherche de benchmarks en temps reel n'a pas abouti.
Pour les percentiles de marche (P25, median, P75), faire une recherche manuelle avec ces termes:
${standards ? getBenchmarkSearchQueries(sector).map((q) => `- "${q}"`).join("\n") : "- Rechercher '[secteur] benchmarks [annee]'"}

**IMPORTANT**: Ne pas inventer de chiffres. Si les donnees de marche ne sont pas disponibles, l'indiquer clairement.
`;
  }

  // Add instructions
  content += `

---

## INSTRUCTIONS BENCHMARK

1. **Standards etablis** (formules, seuils, red flags): Utiliser directement, ce sont des regles stables.

2. **Donnees de marche** (percentiles, exits recents): ${
    usedWebSearch && dynamicBenchmarks
      ? "Utiliser les donnees de la recherche ci-dessus, TOUJOURS citer la source."
      : "Recherche non disponible - NE PAS inventer de chiffres. Indiquer 'Donnees de marche non disponibles' si necessaire."
  }

3. **En cas de doute**: Il vaut mieux dire "je n'ai pas de donnee recente pour ce benchmark" que d'inventer un chiffre.

4. **Citations obligatoires**: Chaque chiffre de benchmark doit avoir sa source et son annee.
`;

  return {
    content,
    standards,
    dynamicBenchmarks,
    usedWebSearch,
  };
}

/**
 * Version synchrone qui n'utilise que les standards (pas de recherche web)
 * Utile pour les cas ou la latence est critique
 */
export function getStandardsOnlyInjection(sector: string, stage: string = "SEED"): string {
  const standards = getSectorStandards(sector);

  if (!standards) {
    return `
## STANDARDS SECTORIELS
**Note**: Pas de standards pre-definis pour le secteur "${sector}".
Utiliser les principes generaux d'evaluation startup.

**Pour les benchmarks de marche**: Effectuer une recherche en ligne, ne pas inventer de chiffres.
`;
  }

  return formatStandardsForPrompt(standards, stage) + `

---

## NOTE IMPORTANTE

Les donnees ci-dessus sont des **standards etablis** (formules, seuils, regles).

Pour les **donnees de marche actuelles** (percentiles P25/median/P75, exits recents, multiples de valorisation):
- Ces donnees changent chaque annee
- NE PAS utiliser de chiffres sans source verifiee
- Rechercher en ligne avec: ${getBenchmarkSearchQueries(sector).map((q) => `"${q}"`).join(", ")}
- Si pas de donnee, indiquer clairement "benchmark de marche non disponible"
`;
}
