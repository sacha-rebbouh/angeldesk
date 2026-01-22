/**
 * GitHub Connector
 *
 * Provides technical validation signals for tech startups:
 * - Repository activity (commits, contributors)
 * - Stars and forks (community interest)
 * - Issue/PR activity (engagement)
 * - Code quality signals
 *
 * API: GitHub REST API (https://api.github.com)
 * Cost: FREE (60 req/hour unauthenticated, 5000 req/hour with token)
 * Value: Technical validation for dev tools / open source startups
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

export interface GitHubRepo {
  name: string;
  fullName: string; // owner/repo
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  language: string | null;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  license: string | null;
  isArchived: boolean;
  isFork: boolean;
  defaultBranch: string;
  // Computed
  ageMonths: number;
  starsPerMonth: number;
}

export interface GitHubOrg {
  login: string;
  name: string | null;
  description: string | null;
  url: string;
  avatarUrl: string;
  publicRepos: number;
  followers: number;
  createdAt: string;
  blog: string | null;
  location: string | null;
  email: string | null;
}

export interface GitHubActivity {
  totalCommits30d: number;
  totalPRs30d: number;
  totalIssues30d: number;
  uniqueContributors: number;
  lastCommitDate: string | null;
  commitFrequency: "daily" | "weekly" | "monthly" | "inactive";
}

export interface GitHubAnalysis {
  found: boolean;
  org?: GitHubOrg;
  repos: GitHubRepo[];
  topRepo?: GitHubRepo;
  activity?: GitHubActivity;
  assessment?: {
    level: "strong" | "moderate" | "weak" | "none";
    signals: string[];
    redFlags: string[];
    techCredibility: number; // 0-100
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = "https://api.github.com";

function getAuthHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "FullInvest-Bot/1.0",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

// Rate limiting for unauthenticated requests
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second

async function rateLimitedFetch(url: string): Promise<Response | null> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (response.status === 403) {
      console.warn("[GitHub] Rate limit exceeded");
      return null;
    }

    if (!response.ok) {
      console.warn(`[GitHub] HTTP ${response.status} for ${url}`);
      return null;
    }

    return response;
  } catch (error) {
    console.error("[GitHub] Fetch error:", error);
    return null;
  }
}

const githubSource: DataSource = {
  type: "web_search",
  name: "GitHub",
  url: "https://github.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.95, // Direct from GitHub API
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Search for organizations by name
 */
export async function searchOrganizations(query: string): Promise<GitHubOrg[]> {
  const searchUrl = `${API_BASE}/search/users?q=${encodeURIComponent(query)}+type:org&per_page=5`;
  const response = await rateLimitedFetch(searchUrl);

  if (!response) return [];

  const data = await response.json();

  return (data.items || []).map((org: Record<string, unknown>) => ({
    login: org.login as string,
    name: null, // Not in search results
    description: null,
    url: org.html_url as string,
    avatarUrl: org.avatar_url as string,
    publicRepos: 0, // Not in search results
    followers: 0,
    createdAt: "",
    blog: null,
    location: null,
    email: null,
  }));
}

/**
 * Get organization details
 */
export async function getOrganization(orgName: string): Promise<GitHubOrg | null> {
  const response = await rateLimitedFetch(`${API_BASE}/orgs/${orgName}`);

  if (!response) return null;

  const org = await response.json();

  return {
    login: org.login,
    name: org.name,
    description: org.description,
    url: org.html_url,
    avatarUrl: org.avatar_url,
    publicRepos: org.public_repos,
    followers: org.followers,
    createdAt: org.created_at,
    blog: org.blog,
    location: org.location,
    email: org.email,
  };
}

/**
 * Get repositories for an organization
 */
export async function getOrgRepos(
  orgName: string,
  limit: number = 10
): Promise<GitHubRepo[]> {
  const response = await rateLimitedFetch(
    `${API_BASE}/orgs/${orgName}/repos?sort=stars&direction=desc&per_page=${limit}`
  );

  if (!response) return [];

  const repos = await response.json();

  if (!Array.isArray(repos)) return [];

  return repos.map((repo: Record<string, unknown>) => {
    const createdAt = new Date(repo.created_at as string);
    const now = new Date();
    const ageMonths = Math.max(1, Math.floor(
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
    ));

    return {
      name: repo.name as string,
      fullName: repo.full_name as string,
      description: repo.description as string | null,
      url: repo.html_url as string,
      stars: repo.stargazers_count as number,
      forks: repo.forks_count as number,
      watchers: repo.watchers_count as number,
      openIssues: repo.open_issues_count as number,
      language: repo.language as string | null,
      topics: (repo.topics as string[]) || [],
      createdAt: repo.created_at as string,
      updatedAt: repo.updated_at as string,
      pushedAt: repo.pushed_at as string,
      license: (repo.license as { spdx_id?: string } | null)?.spdx_id || null,
      isArchived: repo.archived as boolean,
      isFork: repo.fork as boolean,
      defaultBranch: repo.default_branch as string,
      ageMonths,
      starsPerMonth: Math.round((repo.stargazers_count as number) / ageMonths),
    };
  });
}

/**
 * Search for repositories by name/topic
 */
export async function searchRepos(query: string): Promise<GitHubRepo[]> {
  const searchUrl = `${API_BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=10`;
  const response = await rateLimitedFetch(searchUrl);

  if (!response) return [];

  const data = await response.json();

  if (!data.items) return [];

  return data.items.map((repo: Record<string, unknown>) => {
    const createdAt = new Date(repo.created_at as string);
    const now = new Date();
    const ageMonths = Math.max(1, Math.floor(
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
    ));

    return {
      name: repo.name as string,
      fullName: repo.full_name as string,
      description: repo.description as string | null,
      url: repo.html_url as string,
      stars: repo.stargazers_count as number,
      forks: repo.forks_count as number,
      watchers: repo.watchers_count as number,
      openIssues: repo.open_issues_count as number,
      language: repo.language as string | null,
      topics: (repo.topics as string[]) || [],
      createdAt: repo.created_at as string,
      updatedAt: repo.updated_at as string,
      pushedAt: repo.pushed_at as string,
      license: (repo.license as { spdx_id?: string } | null)?.spdx_id || null,
      isArchived: repo.archived as boolean,
      isFork: repo.fork as boolean,
      defaultBranch: repo.default_branch as string || "main",
      ageMonths,
      starsPerMonth: Math.round((repo.stargazers_count as number) / ageMonths),
    };
  });
}

/**
 * Get repository activity (commits, PRs, issues)
 */
export async function getRepoActivity(
  owner: string,
  repo: string
): Promise<GitHubActivity | null> {
  // Get recent commits
  const commitsResponse = await rateLimitedFetch(
    `${API_BASE}/repos/${owner}/${repo}/commits?per_page=100`
  );

  if (!commitsResponse) return null;

  const commits = await commitsResponse.json();

  if (!Array.isArray(commits)) return null;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentCommits = commits.filter((c: Record<string, unknown>) => {
    const date = new Date((c.commit as { author?: { date?: string } })?.author?.date || "");
    return date > thirtyDaysAgo;
  });

  const uniqueAuthors = new Set(
    commits.map((c: Record<string, unknown>) =>
      (c.author as { login?: string } | null)?.login
    ).filter(Boolean)
  );

  // Determine commit frequency
  let commitFrequency: GitHubActivity["commitFrequency"];
  if (recentCommits.length >= 20) {
    commitFrequency = "daily";
  } else if (recentCommits.length >= 4) {
    commitFrequency = "weekly";
  } else if (recentCommits.length >= 1) {
    commitFrequency = "monthly";
  } else {
    commitFrequency = "inactive";
  }

  const lastCommit = commits[0];
  const lastCommitDate = lastCommit
    ? (lastCommit.commit as { author?: { date?: string } })?.author?.date || null
    : null;

  return {
    totalCommits30d: recentCommits.length,
    totalPRs30d: 0, // Would need additional API call
    totalIssues30d: 0, // Would need additional API call
    uniqueContributors: uniqueAuthors.size,
    lastCommitDate,
    commitFrequency,
  };
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Full GitHub analysis for a company
 */
export async function analyzeGitHubPresence(
  companyName: string,
  options: {
    orgName?: string; // If known
    repoNames?: string[]; // Specific repos to check
  } = {}
): Promise<GitHubAnalysis> {
  let org: GitHubOrg | null = null;
  let repos: GitHubRepo[] = [];

  // Try to find organization
  const orgName = options.orgName || companyName.toLowerCase().replace(/\s+/g, "");
  org = await getOrganization(orgName);

  if (!org) {
    // Search for org
    const orgs = await searchOrganizations(companyName);
    if (orgs.length > 0) {
      org = await getOrganization(orgs[0].login);
    }
  }

  // Get repos
  if (org) {
    repos = await getOrgRepos(org.login);
  } else {
    // Search for repos
    repos = await searchRepos(companyName);
    // Filter to likely matches
    repos = repos.filter(r =>
      r.fullName.toLowerCase().includes(companyName.toLowerCase()) ||
      r.description?.toLowerCase().includes(companyName.toLowerCase())
    );
  }

  // Check specific repos if provided
  if (options.repoNames) {
    for (const repoName of options.repoNames) {
      const searchResults = await searchRepos(repoName);
      const match = searchResults.find(r =>
        r.name.toLowerCase() === repoName.toLowerCase()
      );
      if (match && !repos.find(r => r.fullName === match.fullName)) {
        repos.push(match);
      }
    }
  }

  if (repos.length === 0) {
    return { found: false, repos: [] };
  }

  // Find top repo by stars
  const topRepo = repos.reduce((best, repo) =>
    repo.stars > (best?.stars || 0) ? repo : best
  , repos[0]);

  // Get activity for top repo
  let activity: GitHubActivity | null = null;
  if (topRepo) {
    const [owner, repoName] = topRepo.fullName.split("/");
    activity = await getRepoActivity(owner, repoName);
  }

  // Build assessment
  const signals: string[] = [];
  const redFlags: string[] = [];
  let techCredibility = 0;

  // Stars analysis
  const totalStars = repos.reduce((sum, r) => sum + r.stars, 0);
  if (totalStars >= 10000) {
    signals.push(`Strong community: ${totalStars.toLocaleString()} total stars`);
    techCredibility += 30;
  } else if (totalStars >= 1000) {
    signals.push(`Growing community: ${totalStars.toLocaleString()} total stars`);
    techCredibility += 20;
  } else if (totalStars >= 100) {
    signals.push(`Early traction: ${totalStars.toLocaleString()} total stars`);
    techCredibility += 10;
  } else {
    redFlags.push(`Limited visibility: only ${totalStars} stars`);
  }

  // Activity analysis
  if (activity) {
    if (activity.commitFrequency === "daily") {
      signals.push("Very active development (daily commits)");
      techCredibility += 25;
    } else if (activity.commitFrequency === "weekly") {
      signals.push("Regular development (weekly commits)");
      techCredibility += 15;
    } else if (activity.commitFrequency === "inactive") {
      redFlags.push("Inactive repository (no recent commits)");
      techCredibility -= 10;
    }

    if (activity.uniqueContributors >= 10) {
      signals.push(`Strong team: ${activity.uniqueContributors} contributors`);
      techCredibility += 15;
    } else if (activity.uniqueContributors >= 3) {
      signals.push(`Growing team: ${activity.uniqueContributors} contributors`);
      techCredibility += 10;
    } else if (activity.uniqueContributors === 1) {
      redFlags.push("Single contributor (bus factor risk)");
    }
  }

  // Repo quality signals
  if (topRepo) {
    if (topRepo.starsPerMonth >= 100) {
      signals.push(`Viral growth: ${topRepo.starsPerMonth} stars/month`);
      techCredibility += 20;
    }

    if (topRepo.forks >= 100) {
      signals.push(`High engagement: ${topRepo.forks} forks`);
      techCredibility += 10;
    }

    if (topRepo.license) {
      signals.push(`Open source: ${topRepo.license} license`);
      techCredibility += 5;
    } else {
      redFlags.push("No license specified");
    }

    if (topRepo.isArchived) {
      redFlags.push("Main repository is archived");
      techCredibility -= 20;
    }
  }

  // Normalize credibility score
  techCredibility = Math.max(0, Math.min(100, techCredibility));

  // Determine level
  let level: "strong" | "moderate" | "weak" | "none";
  if (techCredibility >= 70) {
    level = "strong";
  } else if (techCredibility >= 40) {
    level = "moderate";
  } else if (techCredibility >= 20) {
    level = "weak";
  } else {
    level = "none";
  }

  return {
    found: true,
    org: org || undefined,
    repos,
    topRepo,
    activity: activity || undefined,
    assessment: {
      level,
      signals,
      redFlags,
      techCredibility,
    },
  };
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const githubConnector: Connector = {
  name: "GitHub",
  type: "web_search",

  isConfigured: () => true, // Works without token (rate limited)

  getNews: async (query: ConnectorQuery) => {
    if (!query.companyName) return [];

    const analysis = await analyzeGitHubPresence(query.companyName);

    if (!analysis.found || !analysis.topRepo) return [];

    const articles: NewsArticle[] = [];

    // Convert top repo to news item
    const repo = analysis.topRepo;
    articles.push({
      title: `${repo.fullName} - ${repo.stars.toLocaleString()} stars on GitHub`,
      description: repo.description || `${repo.language || "Multi-language"} project with ${repo.forks} forks`,
      url: repo.url,
      source: "GitHub",
      publishedAt: repo.pushedAt,
      sentiment: analysis.assessment?.level === "strong" ? "positive" : "neutral",
      relevance: 0.85,
      category: "company" as const,
    });

    return articles;
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick check if a company has GitHub presence
 */
export async function hasGitHubPresence(companyName: string): Promise<{
  hasOrg: boolean;
  hasRepos: boolean;
  topRepoStars: number;
}> {
  const orgName = companyName.toLowerCase().replace(/\s+/g, "");
  const org = await getOrganization(orgName);

  if (org) {
    const repos = await getOrgRepos(org.login, 1);
    return {
      hasOrg: true,
      hasRepos: repos.length > 0,
      topRepoStars: repos[0]?.stars || 0,
    };
  }

  // Fallback: search repos
  const repos = await searchRepos(companyName);
  const match = repos.find(r =>
    r.fullName.toLowerCase().includes(companyName.toLowerCase())
  );

  return {
    hasOrg: false,
    hasRepos: !!match,
    topRepoStars: match?.stars || 0,
  };
}

/**
 * Compare GitHub metrics to benchmarks for dev tools
 */
export function assessGitHubMetrics(
  stars: number,
  contributors: number,
  ageMonths: number
): {
  starsPercentile: number;
  growthRate: "viral" | "healthy" | "slow" | "stagnant";
  teamHealth: "strong" | "moderate" | "weak";
} {
  const starsPerMonth = stars / Math.max(1, ageMonths);

  // Stars percentile (for dev tools / open source)
  let starsPercentile: number;
  if (stars >= 50000) starsPercentile = 99;
  else if (stars >= 10000) starsPercentile = 95;
  else if (stars >= 5000) starsPercentile = 90;
  else if (stars >= 1000) starsPercentile = 75;
  else if (stars >= 500) starsPercentile = 50;
  else if (stars >= 100) starsPercentile = 25;
  else starsPercentile = 10;

  // Growth rate
  let growthRate: "viral" | "healthy" | "slow" | "stagnant";
  if (starsPerMonth >= 500) growthRate = "viral";
  else if (starsPerMonth >= 50) growthRate = "healthy";
  else if (starsPerMonth >= 10) growthRate = "slow";
  else growthRate = "stagnant";

  // Team health
  let teamHealth: "strong" | "moderate" | "weak";
  if (contributors >= 20) teamHealth = "strong";
  else if (contributors >= 5) teamHealth = "moderate";
  else teamHealth = "weak";

  return { starsPercentile, growthRate, teamHealth };
}
