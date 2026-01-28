/**
 * Fact-Checking Service
 *
 * Verifies sources cited by LLM agents using web search.
 * Used primarily by devil's advocate to validate comparable failures,
 * historical precedents, and news sources.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const SEARCH_MODEL = "perplexity/sonar";

function getApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

export interface SourceVerification {
  originalSource: string;
  verified: boolean;
  verificationDetails?: string;
  foundUrl?: string;
  confidence: number; // 0-100
}

export interface FactCheckResult {
  totalSources: number;
  verifiedCount: number;
  unverifiedCount: number;
  sources: SourceVerification[];
}

/**
 * Execute a web search query using Perplexity via OpenRouter
 */
async function webSearch(query: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://angeldesk.app",
      "X-Title": "Angel Desk Fact Checker",
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
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Verify a single source (company failure, news article, historical event)
 */
async function verifySingleSource(
  company: string,
  claim: string,
  sourceDescription: string
): Promise<SourceVerification> {
  try {
    const query = `Verify this claim about ${company}:
"${claim}"

Source cited: "${sourceDescription}"

Answer with:
1. Is this claim accurate? (YES/NO/PARTIALLY)
2. What actually happened?
3. Provide a URL to a credible source if possible.

Be concise and factual.`;

    const result = await webSearch(query);

    // Parse the result
    const isVerified = result.toLowerCase().includes("yes") &&
                       !result.toLowerCase().includes("no evidence") &&
                       !result.toLowerCase().includes("cannot verify") &&
                       !result.toLowerCase().includes("unable to verify");

    const isPartial = result.toLowerCase().includes("partially") ||
                      result.toLowerCase().includes("some aspects");

    // Extract URL if present
    const urlMatch = result.match(/https?:\/\/[^\s\])"']+/);
    const foundUrl = urlMatch ? urlMatch[0] : undefined;

    // Calculate confidence based on result quality
    let confidence = 0;
    if (isVerified) {
      confidence = foundUrl ? 90 : 70;
    } else if (isPartial) {
      confidence = foundUrl ? 60 : 40;
    } else {
      confidence = 20;
    }

    return {
      originalSource: sourceDescription,
      verified: isVerified || isPartial,
      verificationDetails: result.slice(0, 300) + (result.length > 300 ? "..." : ""),
      foundUrl,
      confidence,
    };
  } catch (error) {
    console.error(`[FactCheck] Error verifying source "${sourceDescription}":`, error);
    return {
      originalSource: sourceDescription,
      verified: false,
      verificationDetails: "Verification failed - search error",
      confidence: 0,
    };
  }
}

/**
 * Extract all sources from devil's advocate findings
 */
export function extractSourcesToVerify(findings: {
  counterArguments?: Array<{
    comparableFailure?: {
      company: string;
      outcome: string;
      source: string;
    };
  }>;
  worstCaseScenario?: {
    comparableCatastrophes?: Array<{
      company: string;
      whatHappened: string;
      source: string;
    }>;
  };
  blindSpots?: Array<{
    historicalPrecedent?: {
      company: string;
      whatHappened: string;
      source: string;
    };
  }>;
}): Array<{ company: string; claim: string; source: string }> {
  const sources: Array<{ company: string; claim: string; source: string }> = [];

  // Extract from counterArguments
  if (findings.counterArguments) {
    for (const ca of findings.counterArguments) {
      if (ca.comparableFailure?.source && ca.comparableFailure.source !== "Unknown") {
        sources.push({
          company: ca.comparableFailure.company || "Unknown",
          claim: ca.comparableFailure.outcome || "",
          source: ca.comparableFailure.source,
        });
      }
    }
  }

  // Extract from worstCaseScenario.comparableCatastrophes
  if (findings.worstCaseScenario?.comparableCatastrophes) {
    for (const cc of findings.worstCaseScenario.comparableCatastrophes) {
      if (cc.source && cc.source !== "Unknown") {
        sources.push({
          company: cc.company || "Unknown",
          claim: cc.whatHappened || "",
          source: cc.source,
        });
      }
    }
  }

  // Extract from blindSpots.historicalPrecedent
  if (findings.blindSpots) {
    for (const bs of findings.blindSpots) {
      if (bs.historicalPrecedent?.source && bs.historicalPrecedent.source !== "Unknown") {
        sources.push({
          company: bs.historicalPrecedent.company || "Unknown",
          claim: bs.historicalPrecedent.whatHappened || "",
          source: bs.historicalPrecedent.source,
        });
      }
    }
  }

  // Deduplicate by source
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = s.source.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Verify multiple sources in parallel (with concurrency limit)
 */
export async function verifySourcesBatch(
  sources: Array<{ company: string; claim: string; source: string }>,
  maxConcurrent: number = 3
): Promise<FactCheckResult> {
  if (sources.length === 0) {
    return {
      totalSources: 0,
      verifiedCount: 0,
      unverifiedCount: 0,
      sources: [],
    };
  }

  console.log(`[FactCheck] Verifying ${sources.length} sources...`);

  // Process in batches to limit concurrency
  const results: SourceVerification[] = [];

  for (let i = 0; i < sources.length; i += maxConcurrent) {
    const batch = sources.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map((s) => verifySingleSource(s.company, s.claim, s.source))
    );
    results.push(...batchResults);
  }

  const verifiedCount = results.filter((r) => r.verified).length;
  const unverifiedCount = results.filter((r) => !r.verified).length;

  console.log(`[FactCheck] Results: ${verifiedCount} verified, ${unverifiedCount} unverified`);

  return {
    totalSources: results.length,
    verifiedCount,
    unverifiedCount,
    sources: results,
  };
}

/**
 * Quick fact-check for devil's advocate output
 * Returns updated findings with verification status added
 */
export async function factCheckDevilsAdvocate(findings: {
  counterArguments?: Array<{
    comparableFailure?: {
      company: string;
      outcome: string;
      source: string;
      verified?: boolean;
      verificationUrl?: string;
    };
  }>;
  worstCaseScenario?: {
    comparableCatastrophes?: Array<{
      company: string;
      whatHappened: string;
      source: string;
      verified?: boolean;
      verificationUrl?: string;
    }>;
  };
  blindSpots?: Array<{
    historicalPrecedent?: {
      company: string;
      whatHappened: string;
      source: string;
      verified?: boolean;
      verificationUrl?: string;
    };
  }>;
}): Promise<{
  findings: typeof findings;
  factCheckResult: FactCheckResult;
}> {
  // Extract sources
  const sourcesToVerify = extractSourcesToVerify(findings);

  // Verify in parallel
  const factCheckResult = await verifySourcesBatch(sourcesToVerify);

  // Create a map for quick lookup
  const verificationMap = new Map<string, SourceVerification>();
  for (const sv of factCheckResult.sources) {
    verificationMap.set(sv.originalSource.toLowerCase(), sv);
  }

  // Update findings with verification status
  const updatedFindings = JSON.parse(JSON.stringify(findings)); // Deep clone

  // Update counterArguments
  if (updatedFindings.counterArguments) {
    for (const ca of updatedFindings.counterArguments) {
      if (ca.comparableFailure?.source) {
        const verification = verificationMap.get(ca.comparableFailure.source.toLowerCase());
        if (verification) {
          ca.comparableFailure.verified = verification.verified;
          ca.comparableFailure.verificationUrl = verification.foundUrl;
        }
      }
    }
  }

  // Update comparableCatastrophes
  if (updatedFindings.worstCaseScenario?.comparableCatastrophes) {
    for (const cc of updatedFindings.worstCaseScenario.comparableCatastrophes) {
      const verification = verificationMap.get(cc.source.toLowerCase());
      if (verification) {
        cc.verified = verification.verified;
        cc.verificationUrl = verification.foundUrl;
      }
    }
  }

  // Update blindSpots
  if (updatedFindings.blindSpots) {
    for (const bs of updatedFindings.blindSpots) {
      if (bs.historicalPrecedent?.source) {
        const verification = verificationMap.get(bs.historicalPrecedent.source.toLowerCase());
        if (verification) {
          bs.historicalPrecedent.verified = verification.verified;
          bs.historicalPrecedent.verificationUrl = verification.foundUrl;
        }
      }
    }
  }

  return {
    findings: updatedFindings,
    factCheckResult,
  };
}
