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
const SEARCH_MODEL = "perplexity/llama-3.1-sonar-small-128k-online";

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
      "HTTP-Referer": "https://fullinvest.app",
      "X-Title": "Fullinvest Context Engine",
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
 * Parse competitor information from search results
 */
function parseCompetitors(text: string, query: ConnectorQuery): Competitor[] {
  const competitors: Competitor[] = [];
  const source = createSource();

  // Simple extraction - look for company names and descriptions
  // In production, this would use structured output from the LLM
  const lines = text.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    // Look for patterns like "CompanyName - Description" or "CompanyName: Description"
    const match = line.match(/^[\d\.\-\*]*\s*\*?\*?([A-Z][a-zA-Z0-9\s]+)\*?\*?\s*[-:]\s*(.+)/);
    if (match) {
      const [, name, description] = match;
      if (name.length < 50 && !name.toLowerCase().includes(query.companyName?.toLowerCase() || "")) {
        competitors.push({
          name: name.trim(),
          description: description.trim(),
          positioning: description.trim(),
          overlap: "partial",
          source,
        });
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
      const searchQuery = `List the main competitors of companies in the ${query.sector || "tech"} sector${
        query.subSector ? `, specifically ${query.subSector}` : ""
      }${query.geography ? ` in ${query.geography}` : ""}.
      For each competitor, provide: company name, brief description, and their positioning.
      Focus on startups and growth companies, not large incumbents.
      Format: "Company Name - Description"`;

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
