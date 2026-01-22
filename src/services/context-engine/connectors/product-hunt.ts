/**
 * Product Hunt Connector
 *
 * Provides traction signals from Product Hunt launches:
 * - Product launches and rankings
 * - Upvotes and comments as traction signals
 * - Maker information
 *
 * API: GraphQL (https://api.producthunt.com/v2/api/graphql)
 * Authentication: OAuth2 (Developer token for read-only access)
 * Free tier: 450 requests/day
 *
 * Get your token at: https://www.producthunt.com/v2/oauth/applications
 */

import type {
  Connector,
  ConnectorQuery,
  NewsArticle,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

interface ProductHuntPost {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  website: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  featuredAt: string | null;
  topics: {
    nodes: {
      name: string;
    }[];
  };
  makers: {
    id: string;
    name: string;
    headline: string;
  }[];
  thumbnail: {
    url: string;
  } | null;
}

interface ProductHuntResponse {
  data: {
    posts: {
      edges: {
        node: ProductHuntPost;
      }[];
    };
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_URL = "https://api.producthunt.com/v2/api/graphql";

// Topic mappings for sector matching
const TOPIC_TO_SECTOR: Record<string, string[]> = {
  "SaaS B2B": ["saas", "b2b", "productivity", "developer tools", "marketing", "analytics"],
  "Fintech": ["fintech", "finance", "payments", "crypto", "banking", "investing"],
  "Healthtech": ["health", "fitness", "wellness", "healthcare", "medical"],
  "Marketplace": ["marketplace", "e-commerce", "retail"],
  "AI/ML": ["artificial intelligence", "machine learning", "ai", "automation"],
  "Consumer": ["social", "entertainment", "lifestyle", "travel", "food"],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getApiToken(): string | null {
  return process.env.PRODUCT_HUNT_TOKEN ?? null;
}

async function makeGraphQLRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  const token = getApiToken();
  if (!token) {
    console.warn("[ProductHunt] No API token configured");
    return null;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.warn("[ProductHunt] Invalid API token");
      } else if (response.status === 429) {
        console.warn("[ProductHunt] Rate limit exceeded");
      } else {
        console.warn(`[ProductHunt] API error: ${response.status}`);
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[ProductHunt] Request failed:", error);
    return null;
  }
}

function getSectorFromTopics(topics: { name: string }[]): string | null {
  const topicNames = topics.map((t) => t.name.toLowerCase());

  for (const [sector, keywords] of Object.entries(TOPIC_TO_SECTOR)) {
    if (keywords.some((kw) => topicNames.some((t) => t.includes(kw)))) {
      return sector;
    }
  }

  return null;
}

function calculateTractionScore(post: ProductHuntPost): number {
  // Simple scoring based on upvotes and comments
  const upvoteScore = Math.min(post.votesCount / 10, 50); // Max 50 points
  const commentScore = Math.min(post.commentsCount / 2, 30); // Max 30 points
  const featuredBonus = post.featuredAt ? 20 : 0; // Featured = +20 points

  return Math.min(100, Math.round(upvoteScore + commentScore + featuredBonus));
}

function getSentimentFromTraction(score: number): "positive" | "neutral" | "negative" {
  if (score >= 60) return "positive";
  if (score >= 30) return "neutral";
  return "negative";
}

const phSource: DataSource = {
  type: "web_search", // Similar type
  name: "Product Hunt",
  url: "https://www.producthunt.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.75, // Medium-high confidence for traction signals
};

// ============================================================================
// GRAPHQL QUERIES
// ============================================================================

const SEARCH_POSTS_QUERY = `
  query SearchPosts($query: String!, $first: Int!) {
    posts(first: $first, order: VOTES, topic: $query) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          website
          votesCount
          commentsCount
          createdAt
          featuredAt
          topics {
            nodes {
              name
            }
          }
          makers {
            id
            name
            headline
          }
          thumbnail {
            url
          }
        }
      }
    }
  }
`;

const SEARCH_BY_NAME_QUERY = `
  query SearchByName($query: String!, $first: Int!) {
    posts(first: $first, order: RANKING) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          website
          votesCount
          commentsCount
          createdAt
          featuredAt
          topics {
            nodes {
              name
            }
          }
          makers {
            id
            name
            headline
          }
          thumbnail {
            url
          }
        }
      }
    }
  }
`;

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const productHuntConnector: Connector = {
  name: "Product Hunt",
  type: "web_search",

  isConfigured: () => {
    return !!getApiToken();
  },

  getNews: async (query: ConnectorQuery): Promise<NewsArticle[]> => {
    // Search for products matching the query
    const searchTerm = query.companyName || query.sector || query.keywords?.join(" ") || "";
    if (!searchTerm) return [];

    const response = await makeGraphQLRequest<ProductHuntResponse>(SEARCH_BY_NAME_QUERY, {
      query: searchTerm,
      first: 10,
    });

    if (!response?.data?.posts?.edges) return [];

    const posts = response.data.posts.edges.map((e) => e.node);

    // Filter by company name if specified
    let filtered = posts;
    if (query.companyName) {
      const nameLower = query.companyName.toLowerCase();
      filtered = posts.filter(
        (p) =>
          p.name.toLowerCase().includes(nameLower) ||
          p.tagline.toLowerCase().includes(nameLower)
      );
    }

    // Convert to NewsArticle format
    return filtered.map((post): NewsArticle => {
      const tractionScore = calculateTractionScore(post);

      return {
        title: `${post.name}: ${post.tagline}`,
        description: `${post.description?.slice(0, 200) || post.tagline} | ${post.votesCount} upvotes, ${post.commentsCount} comments`,
        url: post.url,
        source: "Product Hunt",
        publishedAt: post.createdAt,
        sentiment: getSentimentFromTraction(tractionScore),
        relevance: query.companyName
          ? post.name.toLowerCase().includes(query.companyName.toLowerCase())
            ? 0.9
            : 0.5
          : 0.6,
        category: "company",
      };
    });
  },
};

// ============================================================================
// EXTENDED API FUNCTIONS
// For direct use when detailed product data is needed
// ============================================================================

/**
 * Search for products on Product Hunt
 */
export async function searchProducts(
  query: string,
  limit: number = 10
): Promise<ProductHuntPost[]> {
  const response = await makeGraphQLRequest<ProductHuntResponse>(SEARCH_BY_NAME_QUERY, {
    query,
    first: limit,
  });

  return response?.data?.posts?.edges.map((e) => e.node) ?? [];
}

/**
 * Get detailed traction analysis for a company
 */
export async function getProductTraction(companyName: string): Promise<{
  found: boolean;
  product?: {
    name: string;
    tagline: string;
    url: string;
    launchDate: string;
    upvotes: number;
    comments: number;
    tractionScore: number;
    topics: string[];
    makers: { name: string; headline: string }[];
  };
  competitorLaunches?: {
    name: string;
    upvotes: number;
    launchDate: string;
  }[];
} | null> {
  const posts = await searchProducts(companyName, 5);

  if (posts.length === 0) {
    return { found: false };
  }

  // Find best match
  const nameLower = companyName.toLowerCase();
  const exactMatch = posts.find((p) => p.name.toLowerCase() === nameLower);
  const partialMatch = posts.find((p) => p.name.toLowerCase().includes(nameLower));
  const match = exactMatch || partialMatch;

  if (!match) {
    return { found: false };
  }

  const tractionScore = calculateTractionScore(match);
  const sector = getSectorFromTopics(match.topics?.nodes ?? []);

  // Get competitor launches in similar topics
  let competitorLaunches: { name: string; upvotes: number; launchDate: string }[] = [];
  if (sector) {
    const sectorPosts = await searchProducts(sector, 10);
    competitorLaunches = sectorPosts
      .filter((p) => p.id !== match.id)
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        upvotes: p.votesCount,
        launchDate: p.createdAt,
      }));
  }

  return {
    found: true,
    product: {
      name: match.name,
      tagline: match.tagline,
      url: match.url,
      launchDate: match.createdAt,
      upvotes: match.votesCount,
      comments: match.commentsCount,
      tractionScore,
      topics: match.topics?.nodes.map((t) => t.name) ?? [],
      makers: match.makers?.map((m) => ({ name: m.name, headline: m.headline })) ?? [],
    },
    competitorLaunches,
  };
}

/**
 * Assess if a company has good Product Hunt presence
 */
export function assessProductHuntPresence(
  upvotes: number,
  comments: number,
  daysOld: number
): {
  assessment: "strong" | "moderate" | "weak" | "none";
  signals: string[];
} {
  const signals: string[] = [];

  // Upvote assessment
  if (upvotes >= 500) {
    signals.push("Very high upvote count (500+)");
  } else if (upvotes >= 200) {
    signals.push("Strong upvote count (200+)");
  } else if (upvotes >= 50) {
    signals.push("Moderate upvote count (50+)");
  } else if (upvotes < 20) {
    signals.push("Low upvote count");
  }

  // Comment assessment
  if (comments >= 100) {
    signals.push("High engagement (100+ comments)");
  } else if (comments >= 30) {
    signals.push("Good engagement (30+ comments)");
  } else if (comments < 10) {
    signals.push("Low engagement");
  }

  // Velocity (upvotes per day)
  const velocity = upvotes / Math.max(1, daysOld);
  if (velocity >= 10) {
    signals.push("High velocity growth");
  } else if (velocity >= 2) {
    signals.push("Steady growth");
  }

  // Overall assessment
  let assessment: "strong" | "moderate" | "weak" | "none";
  if (upvotes >= 200 && comments >= 30) {
    assessment = "strong";
  } else if (upvotes >= 50 && comments >= 10) {
    assessment = "moderate";
  } else if (upvotes >= 10) {
    assessment = "weak";
  } else {
    assessment = "none";
  }

  return { assessment, signals };
}
