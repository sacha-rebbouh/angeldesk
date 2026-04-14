/**
 * URL Validator — SSRF Protection
 *
 * Prevents Server-Side Request Forgery by blocking requests to private/internal IPs.
 */

import { lookup } from "dns/promises";
import { Agent } from "undici";

// ============================================================================
// PRIVATE IP RANGES
// ============================================================================

/** Check if an IPv4 address falls in a private range */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

  const [a, b] = parts;

  return (
    a === 127 ||                           // 127.0.0.0/8    loopback
    a === 10 ||                            // 10.0.0.0/8     private
    (a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0/12  private
    (a === 192 && b === 168) ||            // 192.168.0.0/16 private
    (a === 169 && b === 254) ||            // 169.254.0.0/16 link-local
    a === 0                                // 0.0.0.0/8
  );
}

/** Check if an IPv6 address is private */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||               // loopback
    normalized.startsWith("fc") ||        // fc00::/7 unique local
    normalized.startsWith("fd") ||        // fc00::/7 unique local
    normalized.startsWith("fe80")         // fe80::/10 link-local
  );
}

/** Hostnames that are always private */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type PublicAddress = {
  address: string;
  family: 4 | 6;
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a URL points to a private/internal IP address.
 * Checks the hostname string directly and resolves DNS to verify the IP.
 */
export async function isPrivateUrl(urlString: string): Promise<boolean> {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname;

    // Block obviously private hostnames
    if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
      return true;
    }

    // Check if hostname is a literal IP
    if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
      return true;
    }

    await resolvePublicAddresses(hostname);

    return false;
  } catch {
    // Invalid URL
    return true;
  }
}

/**
 * Validate that a URL is public and safe to fetch.
 * Returns { valid: true } or { valid: false, reason: "..." }
 */
export async function validatePublicUrl(
  urlString: string
): Promise<{ valid: boolean; reason?: string }> {
  // Must be a valid URL
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }

  // Only allow http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  // Check private/internal
  const isPrivate = await isPrivateUrl(urlString);
  if (isPrivate) {
    return { valid: false, reason: `Blocked private/internal URL: ${parsed.hostname}` };
  }

  return { valid: true };
}

async function resolvePublicAddresses(hostname: string): Promise<PublicAddress[]> {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error(`Blocked private/internal hostname: ${hostname}`);
  }

  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    throw new Error(`Blocked private/internal IP: ${hostname}`);
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`DNS resolution returned no records for ${hostname}`);
  }

  for (const { address } of addresses) {
    if (isPrivateIPv4(address) || isPrivateIPv6(address)) {
      throw new Error(`Blocked private/internal DNS result for ${hostname}: ${address}`);
    }
  }

  return addresses.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
}

async function createPinnedDispatcher(urlString: string): Promise<Agent> {
  const { hostname } = new URL(urlString);
  const [address] = await resolvePublicAddresses(hostname);

  return new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, address.address, address.family);
      },
    },
  });
}

export interface FetchWithValidatedRedirectsOptions {
  maxRedirects?: number;
}

export interface FetchWithValidatedRedirectsResult {
  response: Response;
  finalUrl: string;
  redirectCount: number;
}

/**
 * Fetch a public URL while following redirects manually and validating each hop.
 */
export async function fetchWithValidatedRedirects(
  urlString: string,
  init: RequestInit,
  options: FetchWithValidatedRedirectsOptions = {}
): Promise<FetchWithValidatedRedirectsResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const visited = new Set<string>();
  let currentUrl = urlString;
  let redirectCount = 0;

  while (true) {
    const validation = await validatePublicUrl(currentUrl);
    if (!validation.valid) {
      throw new Error(validation.reason || `Blocked URL: ${currentUrl}`);
    }

    if (visited.has(currentUrl)) {
      throw new Error(`Redirect loop detected: ${currentUrl}`);
    }
    visited.add(currentUrl);

    const dispatcher = await createPinnedDispatcher(currentUrl);
    const response = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
      dispatcher,
    } as RequestInit & { dispatcher: Agent });

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirectCount >= maxRedirects) {
        throw new Error(`Too many redirects (max ${maxRedirects})`);
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`Redirect response missing Location header: ${currentUrl}`);
      }

      const nextUrl = new URL(location, currentUrl);
      nextUrl.hash = "";
      currentUrl = nextUrl.toString();
      redirectCount++;
      continue;
    }

    return {
      response,
      finalUrl: currentUrl,
      redirectCount,
    };
  }
}

/**
 * Validate LinkedIn profile URLs passed to enrichment providers.
 */
export function validateLinkedInProfileUrl(
  urlString: string
): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "LinkedIn URL must use HTTPS" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) {
    return { valid: false, reason: "Only LinkedIn hosts are accepted" };
  }

  const path = parsed.pathname.toLowerCase();
  if (!path.startsWith("/in/") && !path.startsWith("/pub/")) {
    return { valid: false, reason: "Only LinkedIn profile URLs are accepted" };
  }

  return { valid: true };
}
