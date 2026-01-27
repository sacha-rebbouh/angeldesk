/**
 * Dynamic Benchmarks Service
 *
 * Ce service recherche les benchmarks de marche en temps reel via web search.
 * Il NE contient PAS de donnees hardcodees - uniquement de la recherche.
 *
 * PHILOSOPHIE:
 * - Les donnees de marche changent chaque annee
 * - Seule une recherche web peut donner des donnees actuelles
 * - Chaque resultat inclut sa source et sa date
 *
 * USAGE:
 * const benchmarks = await searchSectorBenchmarks("SaaS", "SEED");
 * // Retourne les benchmarks actuels avec sources
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const SEARCH_MODEL = "perplexity/sonar";

// ============================================================================
// TYPES
// ============================================================================

export interface DynamicBenchmarkResult {
  sector: string;
  stage: string;
  searchedAt: string;
  benchmarks: BenchmarkData[];
  exits: ExitData[];
  sources: string[];
  rawResponse: string;
}

export interface BenchmarkData {
  metric: string;
  value: string | number;
  percentile?: string;
  context: string;
  source: string;
  year: number;
}

export interface ExitData {
  company: string;
  acquirer: string;
  value?: string;
  multiple?: string;
  year: number;
  source: string;
}

// ============================================================================
// WEB SEARCH
// ============================================================================

function getApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

async function webSearch(query: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://angeldesk.app",
      "X-Title": "Angel Desk Benchmark Search",
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
      temperature: 0.1,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============================================================================
// BENCHMARK SEARCH QUERIES
// ============================================================================

const SECTOR_SEARCH_TEMPLATES: Record<string, string[]> = {
  SaaS: [
    "SaaS startup benchmarks {year} NRR ARR growth gross margin by stage seed series A",
    "OpenView SaaS benchmarks {year} median metrics",
    "SaaS exits acquisitions {year} multiples",
  ],
  Fintech: [
    "Fintech startup benchmarks {year} take rate default rate TPV by stage",
    "a16z fintech benchmarks {year}",
    "Fintech acquisitions {year} multiples",
  ],
  Marketplace: [
    "Marketplace startup benchmarks {year} GMV take rate liquidity",
    "a16z marketplace 100 {year} metrics",
    "Marketplace acquisitions {year}",
  ],
  AI: [
    "AI startup benchmarks {year} gross margin inference cost",
    "GenAI LLM company metrics {year}",
    "AI acquisitions {year} multiples Anthropic OpenAI",
  ],
  HealthTech: [
    "Digital health startup benchmarks {year} outcomes adoption",
    "Rock Health digital health funding {year}",
    "Healthcare technology acquisitions {year}",
  ],
  DeepTech: [
    "DeepTech hard tech startup benchmarks {year} TRL funding",
    "SBIR STTR funding statistics {year}",
    "DeepTech acquisitions {year}",
  ],
  Climate: [
    "Climate tech startup benchmarks {year} carbon cost",
    "BloombergNEF climate investment {year}",
    "Climate tech exits {year}",
  ],
  Consumer: [
    "D2C ecommerce benchmarks {year} CAC LTV repeat rate",
    "Consumer brand acquisitions {year}",
    "Ecommerce unit economics {year}",
  ],
  Gaming: [
    "Mobile game benchmarks {year} retention ARPDAU LTV CPI",
    "GameAnalytics benchmarks {year}",
    "Gaming acquisitions {year} multiples",
  ],
  Hardware: [
    "Hardware startup benchmarks {year} gross margin attach rate",
    "IoT unit economics {year}",
    "Hardware acquisitions {year}",
  ],
};

function getSectorQueries(sector: string): string[] {
  const currentYear = new Date().getFullYear();
  const normalized = normalizeSector(sector);
  const templates = SECTOR_SEARCH_TEMPLATES[normalized] || SECTOR_SEARCH_TEMPLATES.SaaS;
  return templates.map((t) => t.replace("{year}", String(currentYear)));
}

function normalizeSector(sector: string): string {
  const s = sector.toLowerCase().trim();

  if (s.includes("saas") || s.includes("b2b software")) return "SaaS";
  if (s.includes("fintech") || s.includes("financial")) return "Fintech";
  if (s.includes("marketplace") || s.includes("platform")) return "Marketplace";
  if (s.includes("ai") || s.includes("ml") || s.includes("llm") || s.includes("genai"))
    return "AI";
  if (s.includes("health") || s.includes("medical") || s.includes("digital health"))
    return "HealthTech";
  if (s.includes("deep") || s.includes("hard tech") || s.includes("frontier"))
    return "DeepTech";
  if (s.includes("climate") || s.includes("clean") || s.includes("green")) return "Climate";
  if (s.includes("consumer") || s.includes("d2c") || s.includes("ecommerce"))
    return "Consumer";
  if (s.includes("gaming") || s.includes("game")) return "Gaming";
  if (s.includes("hardware") || s.includes("iot")) return "Hardware";

  return "SaaS"; // Default
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================

/**
 * Recherche les benchmarks actuels pour un secteur et stage donnes
 *
 * @param sector - Le secteur (SaaS, Fintech, etc.)
 * @param stage - Le stage (SEED, SERIES_A, etc.)
 * @returns Les benchmarks trouves avec sources
 *
 * @example
 * const result = await searchSectorBenchmarks("SaaS", "SEED");
 * console.log(result.benchmarks); // NRR median, ARR growth, etc.
 * console.log(result.sources); // URLs des sources
 */
export async function searchSectorBenchmarks(
  sector: string,
  stage: string = "SEED"
): Promise<DynamicBenchmarkResult> {
  const normalizedSector = normalizeSector(sector);
  const queries = getSectorQueries(sector);
  const currentYear = new Date().getFullYear();

  // Build comprehensive search query
  const searchQuery = `
You are a startup benchmark research assistant. Find CURRENT ${currentYear} benchmark data for ${normalizedSector} startups at ${stage} stage.

Search for the following queries and compile the results:
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

IMPORTANT INSTRUCTIONS:
1. Only include data from ${currentYear - 1} or ${currentYear} sources
2. For each metric, cite the EXACT source (report name, URL if available)
3. Include percentiles where available (P25, median, P75)
4. List recent exits/acquisitions (last 2 years) with multiples if known
5. If you cannot find recent data for a metric, say "Data not found for ${currentYear}"

Format your response as:

## BENCHMARKS (${normalizedSector} - ${stage})

### Key Metrics
- [Metric Name]: [Value] (Source: [Source Name, Year])
- ...

### Percentile Distribution (if available)
- [Metric]: P25=[X], Median=[Y], P75=[Z] (Source: [Source])
- ...

### Recent Exits (${currentYear - 1}-${currentYear})
- [Company] acquired by [Acquirer] for [Value] ([Multiple]x) - [Year]
- ...

### Sources
- [Full source citations with URLs where available]
`;

  try {
    const rawResponse = await webSearch(searchQuery);

    return {
      sector: normalizedSector,
      stage,
      searchedAt: new Date().toISOString(),
      benchmarks: parseBenchmarksFromResponse(rawResponse),
      exits: parseExitsFromResponse(rawResponse),
      sources: parseSourcesFromResponse(rawResponse),
      rawResponse,
    };
  } catch (error) {
    console.error(`[DynamicBenchmarks] Search failed for ${sector}/${stage}:`, error);

    return {
      sector: normalizedSector,
      stage,
      searchedAt: new Date().toISOString(),
      benchmarks: [],
      exits: [],
      sources: [],
      rawResponse: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Formate les benchmarks pour injection dans un prompt d'agent
 */
export function formatBenchmarksForPrompt(result: DynamicBenchmarkResult): string {
  if (result.benchmarks.length === 0 && result.exits.length === 0) {
    return `
## BENCHMARKS ${result.sector} (${result.stage})
**Note**: La recherche de benchmarks a echoue. Utiliser les standards de l'industrie.
Recherche effectuee le: ${result.searchedAt}
`;
  }

  const benchmarkLines = result.benchmarks.map((b) => {
    const percentile = b.percentile ? ` (${b.percentile})` : "";
    return `- **${b.metric}**${percentile}: ${b.value} [Source: ${b.source}, ${b.year}]`;
  });

  const exitLines = result.exits.map((e) => {
    const multiple = e.multiple ? ` (${e.multiple})` : "";
    const value = e.value ? ` for ${e.value}` : "";
    return `- ${e.company} → ${e.acquirer}${value}${multiple} (${e.year})`;
  });

  return `
## BENCHMARKS ${result.sector} (${result.stage})
**Recherche effectuee le**: ${new Date(result.searchedAt).toLocaleDateString("fr-FR")}

### Metriques cles
${benchmarkLines.length > 0 ? benchmarkLines.join("\n") : "- Pas de donnees disponibles"}

### Exits recents
${exitLines.length > 0 ? exitLines.join("\n") : "- Pas de donnees disponibles"}

### Sources
${result.sources.map((s) => `- ${s}`).join("\n") || "- Sources non disponibles"}

**IMPORTANT**: Ces donnees viennent d'une recherche web. Verifier les sources avant de les citer.
`;
}

// ============================================================================
// PARSING HELPERS (best effort extraction from LLM response)
// ============================================================================

function parseBenchmarksFromResponse(response: string): BenchmarkData[] {
  const benchmarks: BenchmarkData[] = [];
  const currentYear = new Date().getFullYear();

  // Simple regex patterns to extract benchmark data
  // Format: "Metric: Value (Source: SourceName, Year)"
  const metricPattern = /[-•]\s*\*?\*?([^:*]+)\*?\*?:\s*([^([\n]+)(?:\(Source:\s*([^,)]+)(?:,\s*(\d{4}))?\))?/gi;

  let match;
  while ((match = metricPattern.exec(response)) !== null) {
    const [, metric, value, source, year] = match;
    if (metric && value) {
      benchmarks.push({
        metric: metric.trim(),
        value: value.trim(),
        context: "",
        source: source?.trim() || "Web search",
        year: year ? parseInt(year) : currentYear,
      });
    }
  }

  // Also try to extract percentile data
  const percentilePattern =
    /[-•]\s*\*?\*?([^:*]+)\*?\*?:\s*P25\s*=\s*([^,]+),?\s*Median\s*=\s*([^,]+),?\s*P75\s*=\s*([^\n(]+)/gi;

  while ((match = percentilePattern.exec(response)) !== null) {
    const [, metric, p25, median, p75] = match;
    if (metric && median) {
      benchmarks.push({
        metric: `${metric.trim()} (P25)`,
        value: p25.trim(),
        percentile: "P25",
        context: "",
        source: "Web search",
        year: currentYear,
      });
      benchmarks.push({
        metric: `${metric.trim()} (Median)`,
        value: median.trim(),
        percentile: "Median",
        context: "",
        source: "Web search",
        year: currentYear,
      });
      benchmarks.push({
        metric: `${metric.trim()} (P75)`,
        value: p75.trim(),
        percentile: "P75",
        context: "",
        source: "Web search",
        year: currentYear,
      });
    }
  }

  return benchmarks;
}

function parseExitsFromResponse(response: string): ExitData[] {
  const exits: ExitData[] = [];
  const currentYear = new Date().getFullYear();

  // Pattern: "Company acquired by Acquirer for $XB (Yx) - 2024"
  const exitPattern =
    /[-•]\s*([A-Za-z0-9\s.]+?)\s*(?:acquired by|→|->)\s*([A-Za-z0-9\s.]+?)(?:\s*for\s*\$?([\d.]+[BMK]?))?(?:\s*\(([\d.]+)x\))?[^\d]*(\d{4})?/gi;

  let match;
  while ((match = exitPattern.exec(response)) !== null) {
    const [, company, acquirer, value, multiple, year] = match;
    if (company && acquirer) {
      exits.push({
        company: company.trim(),
        acquirer: acquirer.trim(),
        value: value?.trim(),
        multiple: multiple ? `${multiple}x` : undefined,
        year: year ? parseInt(year) : currentYear,
        source: "Web search",
      });
    }
  }

  return exits;
}

function parseSourcesFromResponse(response: string): string[] {
  const sources: string[] = [];

  // Look for sources section
  const sourcesSection = response.match(/###?\s*Sources[\s\S]*$/i);
  if (sourcesSection) {
    const sourceLines = sourcesSection[0].split("\n");
    for (const line of sourceLines) {
      const trimmed = line.replace(/^[-•*]\s*/, "").trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.length > 10) {
        sources.push(trimmed);
      }
    }
  }

  // Also extract any URLs mentioned
  const urlPattern = /https?:\/\/[^\s)]+/gi;
  const urls = response.match(urlPattern);
  if (urls) {
    for (const url of urls) {
      if (!sources.includes(url)) {
        sources.push(url);
      }
    }
  }

  return sources.slice(0, 10); // Limit to 10 sources
}

// ============================================================================
// CACHE (optional - for performance)
// ============================================================================

const benchmarkCache = new Map<
  string,
  { result: DynamicBenchmarkResult; timestamp: number }
>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Recherche avec cache (24h TTL)
 */
export async function searchSectorBenchmarksCached(
  sector: string,
  stage: string = "SEED"
): Promise<DynamicBenchmarkResult> {
  const cacheKey = `${normalizeSector(sector)}-${stage}`;
  const cached = benchmarkCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[DynamicBenchmarks] Cache hit for ${cacheKey}`);
    return cached.result;
  }

  const result = await searchSectorBenchmarks(sector, stage);

  benchmarkCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Vide le cache (utile pour forcer une nouvelle recherche)
 */
export function clearBenchmarkCache(): void {
  benchmarkCache.clear();
}
