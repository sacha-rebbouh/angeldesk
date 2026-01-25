/**
 * Web Search Connector
 *
 * Uses OpenRouter with Perplexity models for web search capabilities.
 * This allows searching for real-time information about companies,
 * founders, and market trends.
 *
 * Requires OPENROUTER_API_KEY in .env.local
 */

import type {
  Connector,
  ConnectorQuery,
  Competitor,
  FounderBackground,
  DataSource,
} from "../types";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// Perplexity models via OpenRouter for web search
// Updated to new model naming (2025): sonar replaces llama-3.1-sonar-*
const SEARCH_MODEL = "perplexity/sonar";

function getApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

function createSource(url?: string): DataSource {
  return {
    type: "web_search",
    name: "Web Search (Perplexity)",
    url,
    retrievedAt: new Date().toISOString(),
    confidence: 0.7,
  };
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
      "X-Title": "Angel Desk Context Engine",
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
      max_tokens: 2000,
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
 * Group similar use cases into max 5 categories using a fast LLM
 * Used when there are more than 5 use cases to avoid too many searches
 */
async function groupSimilarUseCases(useCases: string[]): Promise<string[]> {
  const apiKey = getApiKey();
  if (!apiKey) return useCases.slice(0, 5);

  try {
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://angeldesk.app",
        "X-Title": "Angel Desk Use Case Grouping",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini", // Fast and cheap for this simple task
        messages: [
          {
            role: "user",
            content: `Group these ${useCases.length} use cases into exactly 5 categories by similarity.
Each category should combine related use cases into a single search-friendly phrase.

Use cases:
${useCases.map((uc, i) => `${i + 1}. ${uc}`).join("\n")}

Return ONLY 5 lines, one category per line. Each line should be a concise phrase that captures the grouped use cases.
Example format:
Whistleblowing and compliance reporting
Virtual data rooms and secure document sharing
KYC/AML identity verification
...`,
          },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.error("[WebSearch] Failed to group use cases, using first 5");
      return useCases.slice(0, 5);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the 5 lines
    const groups = content
      .split("\n")
      .map((line: string) => line.replace(/^\d+\.\s*/, "").trim())
      .filter((line: string) => line.length > 0)
      .slice(0, 5);

    if (groups.length === 0) {
      return useCases.slice(0, 5);
    }

    return groups;
  } catch (error) {
    console.error("[WebSearch] Error grouping use cases:", error);
    return useCases.slice(0, 5);
  }
}

/**
 * Parse competitor information from search results
 */
function parseCompetitors(text: string, query: ConnectorQuery): Competitor[] {
  const competitors: Competitor[] = [];
  const source = createSource();

  // Multiple patterns to catch different LLM response formats
  const patterns = [
    // Pattern 1: "1. **CompanyName** - Description" or "- **CompanyName**: Description"
    /^[\d\.\-\*\s]*\*\*([^*]+)\*\*\s*[-:–]\s*(.+)/,
    // Pattern 2: "1. CompanyName - Description" or "- CompanyName: Description"
    /^[\d\.\-\*\s]*([A-Z][a-zA-Z0-9\s\-'&\.]+?)\s*[-:–]\s*(.+)/,
    // Pattern 3: "CompanyName (description)" - parentheses format
    /^[\d\.\-\*\s]*([A-Z][a-zA-Z0-9\s\-'&\.]+?)\s*\(([^)]+)\)/,
    // Pattern 4: Bullet with name and description on same line
    /^[•●◦]\s*([A-Z][a-zA-Z0-9\s\-'&\.]+?)\s*[-:–]\s*(.+)/,
  ];

  const lines = text.split("\n").filter((l) => l.trim());
  const seenNames = new Set<string>();

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const [, rawName, description] = match;
        const name = rawName.trim().replace(/^\*\*|\*\*$/g, ""); // Remove any remaining **
        const normalizedName = name.toLowerCase();

        // Skip if already seen, too long, or is the queried company
        if (
          seenNames.has(normalizedName) ||
          name.length > 50 ||
          name.length < 2 ||
          normalizedName.includes(query.companyName?.toLowerCase() || "___") ||
          /^(the|a|an|and|or|for|with|from)\s/i.test(name) // Skip if starts with article
        ) {
          continue;
        }

        seenNames.add(normalizedName);
        competitors.push({
          name: name,
          description: description.trim(),
          positioning: description.trim(),
          overlap: "partial",
          source,
        });
        break; // Stop trying other patterns for this line
      }
    }
  }

  return competitors.slice(0, 10);
}

/**
 * Parse founder background from search results
 */
function parseFounderBackground(
  text: string,
  founderName: string
): FounderBackground | null {
  const source = createSource();

  // Extract structured information from the text
  // This is a simplified version - production would use structured LLM output

  const background: FounderBackground = {
    name: founderName,
    role: "Founder",
    previousCompanies: [],
    previousVentures: [],
    education: [],
    redFlags: [],
    investorConnections: [],
    verificationStatus: "partial",
  };

  // Look for LinkedIn URL
  const linkedinMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9\-]+)/);
  if (linkedinMatch) {
    background.linkedinUrl = `https://linkedin.com/in/${linkedinMatch[1]}`;
  }

  // Look for company mentions (very simplified)
  const companyPatterns = [
    /worked at ([A-Z][a-zA-Z]+)/gi,
    /former ([A-Z][a-zA-Z]+) employee/gi,
    /ex-([A-Z][a-zA-Z]+)/gi,
  ];

  const companies = new Set<string>();
  for (const pattern of companyPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      companies.add(match[1]);
    }
  }

  background.previousCompanies = Array.from(companies).slice(0, 5).map((c) => ({
    company: c,
    role: "Unknown",
    verified: false,
  }));

  // Look for education
  const eduPatterns = [
    /(Harvard|Stanford|MIT|Berkeley|Oxford|Cambridge|HEC|INSEAD|Polytechnique)/gi,
  ];

  const schools = new Set<string>();
  for (const pattern of eduPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      schools.add(match[1]);
    }
  }

  background.education = Array.from(schools).map((s) => ({
    institution: s,
  }));

  return background;
}

export const webSearchConnector: Connector = {
  name: "Web Search (Perplexity)",
  type: "web_search",

  isConfigured: () => !!getApiKey(),

  getCompetitors: async (query: ConnectorQuery): Promise<Competitor[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    try {
      // PRIORITÉ: USE CASES > Product Description > Tagline > Sector
      // On cherche des concurrents par ce que le produit FAIT, pas par sa tech stack

      const companyName = query.companyName || "cette startup";
      const useCases = query.useCases && query.useCases.length > 0 ? query.useCases : null;
      const productName = query.productName || null;
      const coreValueProp = query.coreValueProposition || null;
      const productDesc = query.productDescription || null;
      const geoContext = query.geography ? `in ${query.geography}` : "in Europe";

      // If we have no useful context at all, skip
      if (!useCases && !productDesc && !coreValueProp) {
        console.log("[WebSearch] Skipping competitor search - no use cases, product description, or value proposition");
        return [];
      }

      // PARALLEL SEARCH: One search per use case to get comprehensive competitors
      // Max 5 searches - if more use cases, group similar ones first
      if (useCases && useCases.length > 0) {
        console.log(`[WebSearch] Competitor search by USE CASES for: ${companyName}`);

        // Determine search groups (max 5)
        let searchGroups: string[];

        if (useCases.length <= 5) {
          // 5 or fewer use cases: one search per use case
          searchGroups = useCases;
          console.log(`[WebSearch] Running ${searchGroups.length} parallel searches for: ${searchGroups.join(" | ")}`);
        } else {
          // More than 5 use cases: group similar ones using LLM
          console.log(`[WebSearch] ${useCases.length} use cases detected, grouping into 5 categories...`);
          searchGroups = await groupSimilarUseCases(useCases);
          console.log(`[WebSearch] Grouped into: ${searchGroups.join(" | ")}`);
        }

        // Run searches in parallel - one per group
        const searchPromises = searchGroups.map(async (useCaseGroup) => {
          const searchQuery = `Find the top 5 startups and companies that offer solutions for: ${useCaseGroup}.

${geoContext}

IMPORTANT:
- Find companies that solve this SPECIFIC problem: ${useCaseGroup}
- NOT companies using the same technology (ignore blockchain/AI/cloud as search criteria)
- Include both startups AND established players
- Focus on FUNCTIONAL competitors for "${useCaseGroup}"

List exactly 5 competitors with format: "Company Name - What they do for ${useCaseGroup}"`;

          try {
            const result = await webSearch(searchQuery);
            const competitors = parseCompetitors(result, query);
            // Tag competitors with their use case group
            return competitors.map(c => ({
              ...c,
              useCase: useCaseGroup,
            }));
          } catch (err) {
            console.error(`[WebSearch] Error searching for "${useCaseGroup}":`, err);
            return [];
          }
        });

        const results = await Promise.all(searchPromises);
        const allCompetitors = results.flat();

        // Deduplicate by company name (keep first occurrence)
        const seen = new Set<string>();
        const uniqueCompetitors: Competitor[] = [];
        for (const comp of allCompetitors) {
          const normalizedName = comp.name.toLowerCase().trim();
          if (!seen.has(normalizedName)) {
            seen.add(normalizedName);
            uniqueCompetitors.push(comp);
          }
        }

        console.log(`[WebSearch] Found ${uniqueCompetitors.length} unique competitors across ${searchGroups.length} searches`);
        return uniqueCompetitors.slice(0, 20);
      }

      // FALLBACK: Single search with value prop or product description
      let searchQuery = "";

      if (coreValueProp) {
        searchQuery = `Find competitors for a company with this value proposition:
"${coreValueProp}"

${productDesc ? `Product: ${productDesc}` : ""}
${geoContext}

IMPORTANT: Find companies that solve the SAME PROBLEM, not companies using similar technology.

List 8-10 competitors with format: "Company Name - Brief description"`;
      } else {
        searchQuery = `Find competitors for this product:
${productDesc}

${geoContext}

List 8-10 competitors (startups or established players) with format: "Company Name - Brief description"`;
      }

      console.log(`[WebSearch] Competitor search (fallback) for: ${companyName}`);
      const result = await webSearch(searchQuery);
      return parseCompetitors(result, query);
    } catch (error) {
      console.error("Web search competitor error:", error);
      return [];
    }
  },

  getFounderBackground: async (
    founderName: string
  ): Promise<FounderBackground | null> => {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    try {
      const searchQuery = `Find information about ${founderName}, startup founder.
      Include: current company, previous companies worked at, previous startups founded,
      education, notable achievements, and any red flags or controversies.
      Be factual and cite sources where possible.`;

      const result = await webSearch(searchQuery);
      return parseFounderBackground(result, founderName);
    } catch (error) {
      console.error("Web search founder error:", error);
      return null;
    }
  },
};
