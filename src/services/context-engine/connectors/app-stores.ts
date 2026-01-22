/**
 * App Store / Google Play Store Connector
 *
 * Provides mobile app traction signals:
 * - App Store ratings and reviews
 * - Google Play Store ratings and downloads
 * - Version history (update frequency)
 * - Category rankings
 *
 * Method: Web scraping (no official API for ratings)
 * Cost: FREE
 * Value: Real traction data for mobile startups - "Do users actually use this?"
 */

import type {
  Connector,
  ConnectorQuery,
  DataSource,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface AppStoreData {
  platform: "ios" | "android";
  appName: string;
  appId: string;
  developer: string;
  rating: number; // 1-5
  ratingsCount: number;
  reviewsCount?: number;
  price: string; // "Free" or price
  category: string;
  lastUpdated?: string;
  version?: string;
  description?: string;
  // Android specific
  downloads?: string; // "1M+", "10K+", etc.
  downloadsMin?: number; // Parsed minimum
  // Computed
  url: string;
}

export interface AppTractionAnalysis {
  found: boolean;
  apps: AppStoreData[];
  combinedMetrics?: {
    totalRatings: number;
    averageRating: number;
    estimatedDownloads?: number;
    platforms: string[];
  };
  tractionAssessment?: {
    level: "strong" | "moderate" | "weak" | "none";
    signals: string[];
    redFlags: string[];
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds between requests

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function rateLimitedFetch(url: string): Promise<string | null> {
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
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
      },
    });

    if (!response.ok) {
      console.warn(`[AppStores] HTTP ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error("[AppStores] Fetch error:", error);
    return null;
  }
}

function parseDownloadsToNumber(downloads: string): number {
  const cleaned = downloads.toLowerCase().replace(/[^0-9kmb+]/g, "");

  if (cleaned.includes("b")) {
    return parseFloat(cleaned) * 1_000_000_000;
  }
  if (cleaned.includes("m")) {
    return parseFloat(cleaned) * 1_000_000;
  }
  if (cleaned.includes("k")) {
    return parseFloat(cleaned) * 1_000;
  }

  return parseInt(cleaned, 10) || 0;
}

const appStoreSource: DataSource = {
  type: "web_search",
  name: "App Stores",
  url: "https://apps.apple.com",
  retrievedAt: new Date().toISOString(),
  confidence: 0.9, // Direct from stores
};

// ============================================================================
// APP STORE (iOS) FUNCTIONS
// ============================================================================

/**
 * Search for an app on the App Store
 */
export async function searchAppStore(
  query: string,
  country: string = "fr"
): Promise<AppStoreData[]> {
  // Use iTunes Search API (official, free)
  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=${country}&entity=software&limit=5`;

  try {
    const response = await fetch(searchUrl);
    if (!response.ok) return [];

    const data = await response.json();

    return (data.results || []).map((app: Record<string, unknown>) => ({
      platform: "ios" as const,
      appName: app.trackName as string,
      appId: String(app.trackId),
      developer: app.artistName as string,
      rating: app.averageUserRating as number || 0,
      ratingsCount: app.userRatingCount as number || 0,
      price: app.formattedPrice as string || "Free",
      category: app.primaryGenreName as string || "Unknown",
      lastUpdated: app.currentVersionReleaseDate as string,
      version: app.version as string,
      description: (app.description as string || "").substring(0, 200),
      url: app.trackViewUrl as string,
    }));
  } catch (error) {
    console.error("[AppStores] iTunes API error:", error);
    return [];
  }
}

/**
 * Get detailed App Store data by app ID
 */
export async function getAppStoreApp(
  appId: string,
  country: string = "fr"
): Promise<AppStoreData | null> {
  const lookupUrl = `https://itunes.apple.com/lookup?id=${appId}&country=${country}`;

  try {
    const response = await fetch(lookupUrl);
    if (!response.ok) return null;

    const data = await response.json();
    const app = data.results?.[0];

    if (!app) return null;

    return {
      platform: "ios",
      appName: app.trackName,
      appId: String(app.trackId),
      developer: app.artistName,
      rating: app.averageUserRating || 0,
      ratingsCount: app.userRatingCount || 0,
      price: app.formattedPrice || "Free",
      category: app.primaryGenreName || "Unknown",
      lastUpdated: app.currentVersionReleaseDate,
      version: app.version,
      description: (app.description || "").substring(0, 200),
      url: app.trackViewUrl,
    };
  } catch (error) {
    console.error("[AppStores] iTunes lookup error:", error);
    return null;
  }
}

// ============================================================================
// GOOGLE PLAY STORE FUNCTIONS
// ============================================================================

/**
 * Search for an app on Google Play Store (via scraping)
 */
export async function searchPlayStore(query: string): Promise<AppStoreData[]> {
  const searchUrl = `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps&hl=en`;
  const html = await rateLimitedFetch(searchUrl);

  if (!html) return [];

  const apps: AppStoreData[] = [];

  // Extract app cards from search results
  // Pattern matches app links like /store/apps/details?id=com.example.app
  const appPattern = /\/store\/apps\/details\?id=([a-zA-Z0-9._]+)/g;
  const foundIds = new Set<string>();
  let match;

  while ((match = appPattern.exec(html)) !== null && foundIds.size < 5) {
    foundIds.add(match[1]);
  }

  // Fetch details for each app
  for (const appId of foundIds) {
    const appData = await getPlayStoreApp(appId);
    if (appData) {
      apps.push(appData);
    }
  }

  return apps;
}

/**
 * Get detailed Play Store data by package ID
 */
export async function getPlayStoreApp(packageId: string): Promise<AppStoreData | null> {
  const appUrl = `https://play.google.com/store/apps/details?id=${packageId}&hl=en`;
  const html = await rateLimitedFetch(appUrl);

  if (!html) return null;

  try {
    // Extract app name
    const nameMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)</i) ||
                      html.match(/<title>([^<]+)\s*-\s*Apps on Google Play/i);
    const appName = nameMatch ? nameMatch[1].trim() : packageId;

    // Extract rating
    const ratingMatch = html.match(/itemprop="ratingValue"[^>]*content="([0-9.]+)"/i) ||
                        html.match(/"([0-9.]+)" stars/i);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    // Extract ratings count
    const ratingsMatch = html.match(/itemprop="ratingCount"[^>]*content="(\d+)"/i) ||
                         html.match(/([\d,]+)\s*(?:ratings|reviews)/i);
    const ratingsCount = ratingsMatch
      ? parseInt(ratingsMatch[1].replace(/,/g, ""), 10)
      : 0;

    // Extract downloads
    const downloadsMatch = html.match(/([\d,]+[KMB]?\+?)\s*downloads/i) ||
                           html.match(/Installs[^>]*>([^<]+)</i);
    const downloads = downloadsMatch ? downloadsMatch[1].trim() : undefined;

    // Extract developer
    const devMatch = html.match(/itemprop="author"[^>]*>[\s\S]*?itemprop="name"[^>]*>([^<]+)</i) ||
                     html.match(/"([^"]+)"[^>]*class="[^"]*developer/i);
    const developer = devMatch ? devMatch[1].trim() : "Unknown";

    // Extract category
    const categoryMatch = html.match(/itemprop="genre"[^>]*>([^<]+)</i) ||
                          html.match(/category[^>]*>([^<]+)</i);
    const category = categoryMatch ? categoryMatch[1].trim() : "Unknown";

    // Extract last updated
    const updatedMatch = html.match(/Updated[^>]*>([^<]+)</i) ||
                         html.match(/"lastUpdated"[^>]*"([^"]+)"/i);
    const lastUpdated = updatedMatch ? updatedMatch[1].trim() : undefined;

    return {
      platform: "android",
      appName,
      appId: packageId,
      developer,
      rating,
      ratingsCount,
      price: "Free", // Most apps
      category,
      lastUpdated,
      downloads,
      downloadsMin: downloads ? parseDownloadsToNumber(downloads) : undefined,
      url: appUrl,
    };
  } catch (error) {
    console.error("[AppStores] Play Store parsing error:", error);
    return null;
  }
}

// ============================================================================
// COMBINED ANALYSIS
// ============================================================================

/**
 * Search for an app across both stores and analyze traction
 */
export async function analyzeAppTraction(
  appName: string,
  options: {
    iosAppId?: string;
    androidPackageId?: string;
    companyName?: string;
  } = {}
): Promise<AppTractionAnalysis> {
  const apps: AppStoreData[] = [];

  // Search iOS
  if (options.iosAppId) {
    const iosApp = await getAppStoreApp(options.iosAppId);
    if (iosApp) apps.push(iosApp);
  } else {
    const iosResults = await searchAppStore(appName);
    // Find best match
    const match = iosResults.find(app =>
      app.appName.toLowerCase().includes(appName.toLowerCase()) ||
      (options.companyName && app.developer.toLowerCase().includes(options.companyName.toLowerCase()))
    );
    if (match) apps.push(match);
  }

  // Search Android
  if (options.androidPackageId) {
    const androidApp = await getPlayStoreApp(options.androidPackageId);
    if (androidApp) apps.push(androidApp);
  } else {
    const androidResults = await searchPlayStore(appName);
    const match = androidResults.find(app =>
      app.appName.toLowerCase().includes(appName.toLowerCase()) ||
      (options.companyName && app.developer.toLowerCase().includes(options.companyName.toLowerCase()))
    );
    if (match) apps.push(match);
  }

  if (apps.length === 0) {
    return { found: false, apps: [] };
  }

  // Calculate combined metrics
  const totalRatings = apps.reduce((sum, app) => sum + app.ratingsCount, 0);
  const averageRating = apps.reduce((sum, app) => sum + app.rating, 0) / apps.length;
  const androidApp = apps.find(app => app.platform === "android");
  const estimatedDownloads = androidApp?.downloadsMin;

  // Assess traction
  const signals: string[] = [];
  const redFlags: string[] = [];

  // Rating analysis
  if (averageRating >= 4.5) {
    signals.push(`Excellent rating: ${averageRating.toFixed(1)}/5`);
  } else if (averageRating >= 4.0) {
    signals.push(`Good rating: ${averageRating.toFixed(1)}/5`);
  } else if (averageRating < 3.5) {
    redFlags.push(`Low rating: ${averageRating.toFixed(1)}/5`);
  }

  // Volume analysis
  if (totalRatings >= 100000) {
    signals.push(`Very high engagement: ${totalRatings.toLocaleString()} ratings`);
  } else if (totalRatings >= 10000) {
    signals.push(`Strong engagement: ${totalRatings.toLocaleString()} ratings`);
  } else if (totalRatings >= 1000) {
    signals.push(`Moderate engagement: ${totalRatings.toLocaleString()} ratings`);
  } else if (totalRatings < 100) {
    redFlags.push(`Low engagement: only ${totalRatings} ratings`);
  }

  // Downloads analysis (Android)
  if (estimatedDownloads) {
    if (estimatedDownloads >= 10_000_000) {
      signals.push(`Mass adoption: ${androidApp?.downloads} downloads`);
    } else if (estimatedDownloads >= 1_000_000) {
      signals.push(`Strong adoption: ${androidApp?.downloads} downloads`);
    } else if (estimatedDownloads >= 100_000) {
      signals.push(`Growing adoption: ${androidApp?.downloads} downloads`);
    } else if (estimatedDownloads < 10_000) {
      redFlags.push(`Limited adoption: ${androidApp?.downloads} downloads`);
    }
  }

  // Platform coverage
  const platforms = apps.map(app => app.platform);
  if (platforms.includes("ios") && platforms.includes("android")) {
    signals.push("Available on both iOS and Android");
  } else if (platforms.length === 1) {
    redFlags.push(`Only available on ${platforms[0]}`);
  }

  // Determine overall level
  let level: "strong" | "moderate" | "weak" | "none";
  if (totalRatings >= 10000 && averageRating >= 4.0) {
    level = "strong";
  } else if (totalRatings >= 1000 && averageRating >= 3.5) {
    level = "moderate";
  } else if (totalRatings >= 100) {
    level = "weak";
  } else {
    level = "none";
  }

  return {
    found: true,
    apps,
    combinedMetrics: {
      totalRatings,
      averageRating,
      estimatedDownloads,
      platforms,
    },
    tractionAssessment: {
      level,
      signals,
      redFlags,
    },
  };
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

export const appStoresConnector: Connector = {
  name: "App Stores",
  type: "web_search",

  isConfigured: () => true, // Always available

  // App stores don't fit traditional connector methods well
  // Use analyzeAppTraction() directly for detailed analysis
  getNews: async (query: ConnectorQuery) => {
    if (!query.companyName) return [];

    const analysis = await analyzeAppTraction(query.companyName);

    if (!analysis.found || !analysis.apps.length) return [];

    // Convert to news format for context engine
    return analysis.apps.map(app => ({
      title: `${app.appName} on ${app.platform === "ios" ? "App Store" : "Google Play"}`,
      description: `Rating: ${app.rating.toFixed(1)}/5 (${app.ratingsCount.toLocaleString()} ratings)${app.downloads ? ` • ${app.downloads} downloads` : ""}`,
      url: app.url,
      source: app.platform === "ios" ? "App Store" : "Google Play",
      publishedAt: app.lastUpdated || new Date().toISOString(),
      sentiment: app.rating >= 4.0 ? "positive" as const : app.rating >= 3.0 ? "neutral" as const : "negative" as const,
      relevance: 0.9,
      category: "company" as const,
    }));
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick check if a company has mobile apps
 */
export async function hasApps(companyName: string): Promise<{
  ios: boolean;
  android: boolean;
  details?: { iosApp?: AppStoreData; androidApp?: AppStoreData };
}> {
  const [iosResults, androidResults] = await Promise.all([
    searchAppStore(companyName),
    searchPlayStore(companyName),
  ]);

  const iosApp = iosResults.find(app =>
    app.appName.toLowerCase().includes(companyName.toLowerCase()) ||
    app.developer.toLowerCase().includes(companyName.toLowerCase())
  );

  const androidApp = androidResults.find(app =>
    app.appName.toLowerCase().includes(companyName.toLowerCase()) ||
    app.developer.toLowerCase().includes(companyName.toLowerCase())
  );

  return {
    ios: !!iosApp,
    android: !!androidApp,
    details: (iosApp || androidApp) ? { iosApp, androidApp } : undefined,
  };
}

/**
 * Compare app metrics to typical benchmarks
 */
export function assessAppMetrics(
  rating: number,
  ratingsCount: number,
  downloads?: number
): {
  ratingPercentile: number;
  engagementLevel: "high" | "medium" | "low";
  marketPosition: string;
} {
  // Rating percentile (most apps cluster 3.5-4.5)
  let ratingPercentile: number;
  if (rating >= 4.7) ratingPercentile = 95;
  else if (rating >= 4.5) ratingPercentile = 85;
  else if (rating >= 4.2) ratingPercentile = 70;
  else if (rating >= 4.0) ratingPercentile = 50;
  else if (rating >= 3.5) ratingPercentile = 30;
  else ratingPercentile = 10;

  // Engagement level
  let engagementLevel: "high" | "medium" | "low";
  if (ratingsCount >= 10000) engagementLevel = "high";
  else if (ratingsCount >= 1000) engagementLevel = "medium";
  else engagementLevel = "low";

  // Market position
  let marketPosition: string;
  if (downloads && downloads >= 10_000_000) {
    marketPosition = "Market leader";
  } else if (downloads && downloads >= 1_000_000) {
    marketPosition = "Established player";
  } else if (ratingsCount >= 10000) {
    marketPosition = "Growing player";
  } else if (ratingsCount >= 1000) {
    marketPosition = "Early traction";
  } else {
    marketPosition = "Pre-traction / niche";
  }

  return { ratingPercentile, engagementLevel, marketPosition };
}
