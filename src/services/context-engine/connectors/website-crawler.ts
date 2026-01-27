/**
 * Website Crawler
 *
 * Crawl l'INTÉGRALITÉ d'un site web pour enrichir le contexte de DD.
 * Pas de paths hardcodés - on découvre et on scrape TOUT.
 *
 * Le site web est une mine d'or : c'est ce que la startup montre au MARCHÉ
 * (vs ce qu'elle raconte aux investisseurs dans le deck).
 */

import type { WebsiteContent, WebsitePage, WebsitePageType } from "../types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_PAGES: 100, // Max pages à crawler
  CONCURRENT_REQUESTS: 5, // Requêtes parallèles
  REQUEST_DELAY_MS: 100, // Délai entre batches (politesse)
  PAGE_TIMEOUT_MS: 10000, // Timeout par page
  TOTAL_TIMEOUT_MS: 120000, // Timeout total (2 min)
  MAX_CONTENT_LENGTH: 100000, // Max chars par page
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// Extensions et patterns à ignorer
const SKIP_PATTERNS = [
  /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|exe|dmg|csv)$/i,
  /\.(jpg|jpeg|png|gif|svg|webp|ico|mp4|mp3|wav|webm|ogg)$/i,
  /\.(css|js|json|xml|rss|atom)$/i,
  /\.(woff|woff2|ttf|eot|otf)$/i,
  /^mailto:/i,
  /^tel:/i,
  /^javascript:/i,
  /^#/,
  /\?(utm_|ref=|source=|campaign=|fbclid=|gclid=)/i,
];

// ============================================================================
// MAIN CRAWLER
// ============================================================================

export interface CrawlOptions {
  maxPages?: number;
  timeout?: number;
}

/**
 * Crawl l'intégralité d'un site web
 */
export async function crawlWebsite(
  websiteUrl: string,
  options: CrawlOptions = {}
): Promise<WebsiteContent> {
  const startTime = Date.now();
  const maxPages = options.maxPages || CONFIG.MAX_PAGES;
  const timeout = options.timeout || CONFIG.TOTAL_TIMEOUT_MS;

  // Normaliser l'URL de base
  const baseUrl = normalizeBaseUrl(websiteUrl);
  if (!baseUrl) {
    throw new Error(`Invalid website URL: ${websiteUrl}`);
  }

  console.log(`[WebsiteCrawler] Crawling ${baseUrl} (max ${maxPages} pages)`);

  const visited = new Set<string>();
  const queue: string[] = [baseUrl];
  const pages: WebsitePage[] = [];
  let failedCount = 0;

  // Crawler avec contrôle de concurrence
  while (queue.length > 0 && pages.length < maxPages) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      console.log(`[WebsiteCrawler] Timeout reached after ${pages.length} pages`);
      break;
    }

    // Prendre un batch d'URLs à traiter
    const batch = queue.splice(0, CONFIG.CONCURRENT_REQUESTS);

    // Marquer comme visitées
    for (const url of batch) {
      visited.add(url);
    }

    // Crawler en parallèle
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          return await crawlPage(url, baseUrl);
        } catch {
          failedCount++;
          return null;
        }
      })
    );

    // Traiter les résultats
    for (const result of results) {
      if (!result) continue;

      // Ajouter la page
      if (pages.length < maxPages) {
        pages.push(result.page);
      }

      // Ajouter les nouveaux liens à la queue
      for (const link of result.links) {
        if (!visited.has(link) && !queue.includes(link)) {
          queue.push(link);
        }
      }
    }

    // Petit délai pour ne pas surcharger le serveur
    if (queue.length > 0) {
      await sleep(CONFIG.REQUEST_DELAY_MS);
    }
  }

  const crawlDurationMs = Date.now() - startTime;
  const totalWordCount = pages.reduce((sum, p) => sum + p.wordCount, 0);

  console.log(
    `[WebsiteCrawler] Done: ${pages.length} pages, ${totalWordCount} words in ${crawlDurationMs}ms`
  );

  // Agréger les insights
  const insights = aggregateInsights(pages);

  return {
    baseUrl,
    companyName: extractCompanyName(pages),
    tagline: extractTagline(pages),
    pages,
    insights,
    crawlStats: {
      totalPages: visited.size,
      successfulPages: pages.length,
      failedPages: failedCount,
      totalWordCount,
      crawlDurationMs,
      crawledAt: new Date().toISOString(),
    },
    redFlags: [], // Pas de red flags - on enrichit, c'est tout
  };
}

// ============================================================================
// PAGE CRAWLING
// ============================================================================

interface CrawlResult {
  page: WebsitePage;
  links: string[];
}

async function crawlPage(url: string, baseUrl: string): Promise<CrawlResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.PAGE_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    // Vérifier le content-type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return null;
    }

    const html = await response.text();

    // Extraire le contenu
    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const content = extractTextContent(html);
    const links = extractInternalLinks(html, url, baseUrl);

    // Déterminer le type de page (pour catégorisation, pas pour filtrage)
    const path = new URL(url).pathname;
    const pageType = inferPageType(path, title);

    // Extraire les données structurées si possible
    const extractedData = extractStructuredData(html, pageType);

    const page: WebsitePage = {
      url,
      path,
      title,
      description,
      content: content.slice(0, CONFIG.MAX_CONTENT_LENGTH),
      pageType,
      extractedData: Object.keys(extractedData).length > 0 ? extractedData : undefined,
      scrapedAt: new Date().toISOString(),
      wordCount: content.split(/\s+/).filter(Boolean).length,
    };

    return { page, links };
  } catch {
    return null;
  }
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : "";
}

function extractMetaDescription(html: string): string | undefined {
  const patterns = [
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i,
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return decodeEntities(match[1].trim());
    }
  }
  return undefined;
}

function extractTextContent(html: string): string {
  // Supprimer les éléments non-content
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Essayer de trouver le contenu principal
  const mainPatterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*(?:id|class)=["'][^"']*(?:content|main|article|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of mainPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1].length > 500) {
      cleaned = match[1];
      break;
    }
  }

  // Convertir en texte brut
  return cleaned
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInternalLinks(html: string, currentUrl: string, baseUrl: string): string[] {
  const links: string[] = [];
  const hrefPattern = /href=["']([^"']+)["']/gi;
  const baseUrlObj = new URL(baseUrl);
  let match;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1];

    // Skip patterns indésirables
    if (SKIP_PATTERNS.some((p) => p.test(href))) {
      continue;
    }

    try {
      const absoluteUrl = new URL(href, currentUrl);

      // Même domaine seulement
      if (absoluteUrl.hostname !== baseUrlObj.hostname) {
        continue;
      }

      // Normaliser
      absoluteUrl.hash = "";
      // Garder les query params (certains sites les utilisent pour le routing)

      links.push(absoluteUrl.href);
    } catch {
      // URL invalide, skip
    }
  }

  return [...new Set(links)];
}

// ============================================================================
// STRUCTURED DATA EXTRACTION
// ============================================================================

type ExtractedData = NonNullable<WebsitePage["extractedData"]>;

function extractStructuredData(html: string, pageType: WebsitePageType): Partial<ExtractedData> {
  const data: Partial<ExtractedData> = {};

  // Toujours essayer d'extraire les témoignages (peuvent être n'importe où)
  const testimonials = extractTestimonials(html);
  if (testimonials && testimonials.length > 0) {
    data.testimonials = testimonials;
  }

  // Toujours essayer d'extraire les clients/logos
  const clients = extractClients(html);
  if (clients && clients.length > 0) {
    data.clients = clients;
  }

  // Extraction spécifique selon le type
  switch (pageType) {
    case "team":
    case "about": {
      const members = extractTeamMembers(html);
      if (members && members.length > 0) {
        data.teamMembers = members;
      }
      break;
    }

    case "pricing": {
      const plans = extractPricingPlans(html);
      if (plans && plans.length > 0) {
        data.pricingPlans = plans;
      }
      break;
    }

    case "careers": {
      const jobs = extractJobOpenings(html);
      if (jobs && jobs.length > 0) {
        data.jobOpenings = jobs;
      }
      break;
    }

    case "features":
    case "product": {
      const features = extractFeatures(html);
      if (features && features.length > 0) {
        data.features = features;
      }
      break;
    }

    case "integrations": {
      const integrations = extractIntegrations(html);
      if (integrations && integrations.length > 0) {
        data.integrations = integrations;
      }
      break;
    }
  }

  return data;
}

function extractTeamMembers(html: string): ExtractedData["teamMembers"] {
  const members: NonNullable<ExtractedData["teamMembers"]> = [];

  // Pattern: cards avec nom et rôle
  const patterns = [
    /<(?:div|article|li)[^>]*class="[^"]*(?:team|member|person|founder|employee|staff)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
    /<(?:div|article|li)[^>]*data-[^>]*(?:team|member)[^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cardHtml = match[1];

      // Nom (h2, h3, h4, strong, ou span avec classe name)
      const namePatterns = [
        /<(?:h[2-5])[^>]*>([^<]+)<\/(?:h[2-5])>/i,
        /<(?:strong|b)[^>]*>([^<]+)<\/(?:strong|b)>/i,
        /<(?:span|p)[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/(?:span|p)>/i,
      ];

      let name = "";
      for (const np of namePatterns) {
        const nm = cardHtml.match(np);
        if (nm && nm[1].trim().length > 2 && nm[1].trim().length < 50) {
          name = decodeEntities(nm[1].trim());
          break;
        }
      }

      if (!name) continue;

      // Rôle
      const rolePatterns = [
        /<(?:p|span|div)[^>]*class="[^"]*(?:role|title|position|job)[^"]*"[^>]*>([^<]+)<\/(?:p|span|div)>/i,
        /<(?:p|span)[^>]*>([^<]{5,50})<\/(?:p|span)>/i,
      ];

      let role = "";
      for (const rp of rolePatterns) {
        const rm = cardHtml.match(rp);
        if (rm && rm[1].trim() !== name) {
          role = decodeEntities(rm[1].trim());
          break;
        }
      }

      // LinkedIn
      const linkedinMatch = cardHtml.match(
        /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"']+)["']/i
      );

      members.push({
        name,
        role: role || "Team Member",
        linkedinUrl: linkedinMatch?.[1],
      });
    }
  }

  // Déduplication par nom
  const seen = new Set<string>();
  return members.filter((m) => {
    if (seen.has(m.name.toLowerCase())) return false;
    seen.add(m.name.toLowerCase());
    return true;
  });
}

function extractPricingPlans(html: string): ExtractedData["pricingPlans"] {
  const plans: NonNullable<ExtractedData["pricingPlans"]> = [];

  const patterns = [
    /<(?:div|section|article)[^>]*class="[^"]*(?:plan|pricing|tier|package|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section|article)>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const planHtml = match[1];

      // Nom du plan
      const nameMatch = planHtml.match(/<(?:h[2-5])[^>]*>([^<]+)<\/(?:h[2-5])>/i);
      if (!nameMatch) continue;
      const name = decodeEntities(nameMatch[1].trim());

      // Prix
      const pricePatterns = [
        /(?:\$|€|£|USD|EUR)\s*(\d+(?:[.,]\d{2})?)/i,
        /(\d+(?:[.,]\d{2})?)\s*(?:\$|€|£|USD|EUR)/i,
        /(\d+)\s*(?:\/\s*(?:mo|month|mois|an|year))/i,
      ];

      let price = "";
      for (const pp of pricePatterns) {
        const pm = planHtml.match(pp);
        if (pm) {
          price = pm[0];
          break;
        }
      }

      if (!price) {
        if (/free|gratuit/i.test(planHtml)) {
          price = "Free";
        } else if (/contact|enterprise|custom/i.test(planHtml)) {
          price = "Contact us";
        }
      }

      // Features (liste)
      const features: string[] = [];
      const featurePattern = /<li[^>]*>([^<]+)<\/li>/gi;
      let fm;
      while ((fm = featurePattern.exec(planHtml)) !== null) {
        const feature = decodeEntities(fm[1].trim());
        if (feature.length > 3 && feature.length < 200) {
          features.push(feature);
        }
      }

      if (name && (price || features.length > 0)) {
        plans.push({ name, price: price || "N/A", features: features.slice(0, 15) });
      }
    }
  }

  return plans.length > 0 ? plans : undefined;
}

function extractTestimonials(html: string): ExtractedData["testimonials"] {
  const testimonials: NonNullable<ExtractedData["testimonials"]> = [];

  // Blockquotes
  const blockquotePattern = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
  let match;

  while ((match = blockquotePattern.exec(html)) !== null) {
    const quoteHtml = match[1];
    const text = decodeEntities(quoteHtml.replace(/<[^>]+>/g, " ").trim());

    if (text.length < 20 || text.length > 1000) continue;

    // Chercher l'auteur après le blockquote
    const afterQuote = html.slice(match.index + match[0].length, match.index + match[0].length + 500);
    const authorMatch = afterQuote.match(/<(?:cite|span|p|div)[^>]*>([^<]{2,50})<\/(?:cite|span|p|div)>/i);

    testimonials.push({
      quote: text.slice(0, 500),
      author: authorMatch ? decodeEntities(authorMatch[1].trim()) : "Customer",
    });
  }

  // Divs avec classe testimonial/quote
  const divPattern = /<(?:div|section)[^>]*class="[^"]*(?:testimonial|quote|review)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/gi;

  while ((match = divPattern.exec(html)) !== null) {
    const quoteHtml = match[1];
    const text = decodeEntities(quoteHtml.replace(/<[^>]+>/g, " ").trim());

    if (text.length < 20 || text.length > 1000) continue;

    testimonials.push({
      quote: text.slice(0, 500),
      author: "Customer",
    });
  }

  return testimonials.length > 0 ? testimonials : undefined;
}

function extractClients(html: string): ExtractedData["clients"] {
  const clients = new Set<string>();

  // Images avec alt (logos clients)
  const imgPattern = /<img[^>]*alt=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgPattern.exec(html)) !== null) {
    const alt = decodeEntities(match[1].trim());

    // Filtrer les alts génériques
    if (
      alt.length < 2 ||
      alt.length > 50 ||
      /logo|icon|image|photo|avatar|placeholder/i.test(alt)
    ) {
      continue;
    }

    // C'est probablement un nom de client
    clients.add(alt);
  }

  return clients.size > 0 ? Array.from(clients).slice(0, 50) : undefined;
}

function extractJobOpenings(html: string): ExtractedData["jobOpenings"] {
  const jobs: NonNullable<ExtractedData["jobOpenings"]> = [];

  const patterns = [
    /<(?:div|li|article|tr)[^>]*class="[^"]*(?:job|position|opening|vacancy|role)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|article|tr)>/gi,
    /<(?:a)[^>]*href="[^"]*(?:job|career|position)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const jobHtml = match[1];

      // Titre du poste
      const titlePatterns = [
        /<(?:h[2-5]|a|strong)[^>]*>([^<]+)<\/(?:h[2-5]|a|strong)>/i,
        />([^<]{10,80})</i,
      ];

      let title = "";
      for (const tp of titlePatterns) {
        const tm = jobHtml.match(tp);
        if (tm && tm[1].trim().length > 5) {
          title = decodeEntities(tm[1].trim());
          break;
        }
      }

      if (!title || title.length < 5) continue;

      // Département (inféré du titre)
      const department = inferDepartment(title);

      // Location
      const locPatterns = [
        /<(?:span|p|div)[^>]*class="[^"]*(?:location|place|city)[^"]*"[^>]*>([^<]+)<\/(?:span|p|div)>/i,
        /(?:Remote|Paris|London|Berlin|New York|San Francisco|Remote-first)/i,
      ];

      let location: string | undefined;
      for (const lp of locPatterns) {
        const lm = jobHtml.match(lp);
        if (lm) {
          location = typeof lm[1] === "string" ? decodeEntities(lm[1].trim()) : lm[0];
          break;
        }
      }

      jobs.push({ title, department, location });
    }
  }

  // Déduplication
  const seen = new Set<string>();
  return jobs.filter((j) => {
    const key = j.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractFeatures(html: string): ExtractedData["features"] {
  const features: NonNullable<ExtractedData["features"]> = [];

  const patterns = [
    /<(?:div|section|article)[^>]*class="[^"]*(?:feature|benefit|capability|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section|article)>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const featureHtml = match[1];

      // Titre
      const titleMatch = featureHtml.match(/<(?:h[2-5])[^>]*>([^<]+)<\/(?:h[2-5])>/i);
      if (!titleMatch) continue;

      const title = decodeEntities(titleMatch[1].trim());
      if (title.length < 3 || title.length > 100) continue;

      // Description
      const descMatch = featureHtml.match(/<(?:p)[^>]*>([^<]+)<\/p>/i);
      const description = descMatch ? decodeEntities(descMatch[1].trim()) : "";

      features.push({ title, description: description.slice(0, 300) });
    }
  }

  return features.length > 0 ? features : undefined;
}

function extractIntegrations(html: string): ExtractedData["integrations"] {
  const integrations = new Set<string>();

  // Noms courants d'intégrations
  const knownIntegrations = [
    "Slack", "Microsoft Teams", "Zoom", "Google Meet",
    "Salesforce", "HubSpot", "Pipedrive", "Zendesk",
    "Zapier", "Make", "n8n", "Integromat",
    "Stripe", "PayPal", "Braintree", "Square",
    "Shopify", "WooCommerce", "Magento", "BigCommerce",
    "Google Analytics", "Segment", "Mixpanel", "Amplitude",
    "Jira", "Asana", "Monday", "Trello", "Notion", "Airtable",
    "GitHub", "GitLab", "Bitbucket",
    "AWS", "Google Cloud", "Azure", "Heroku", "Vercel",
    "Figma", "Sketch", "Adobe XD",
    "Intercom", "Drift", "Crisp",
    "Mailchimp", "SendGrid", "Postmark",
    "Twilio", "Plivo",
    "QuickBooks", "Xero",
  ];

  const htmlLower = html.toLowerCase();
  for (const integration of knownIntegrations) {
    if (htmlLower.includes(integration.toLowerCase())) {
      integrations.add(integration);
    }
  }

  return integrations.size > 0 ? Array.from(integrations) : undefined;
}

// ============================================================================
// INSIGHTS AGGREGATION
// ============================================================================

function aggregateInsights(pages: WebsitePage[]): WebsiteContent["insights"] {
  const allTeamMembers: WebsiteContent["insights"]["teamMembers"] = [];
  const allClients = new Set<string>();
  const allTestimonials: WebsiteContent["insights"]["testimonials"] = [];
  const allFeatures = new Set<string>();
  const allIntegrations = new Set<string>();
  const allJobs: { title: string; department: string }[] = [];
  const hiringDepartments = new Set<string>();

  let hasPricing = false;
  let hasFreeTier = false;
  let pricingModel: WebsiteContent["insights"]["pricingModel"];
  let hasDocumentation = false;
  let hasAPI = false;
  let blogPostCount = 0;

  for (const page of pages) {
    // Team members
    if (page.extractedData?.teamMembers) {
      for (const member of page.extractedData.teamMembers) {
        if (!allTeamMembers.some((m) => m.name.toLowerCase() === member.name.toLowerCase())) {
          allTeamMembers.push(member);
        }
      }
    }

    // Clients
    if (page.extractedData?.clients) {
      for (const client of page.extractedData.clients) {
        allClients.add(client);
      }
    }

    // Testimonials
    if (page.extractedData?.testimonials) {
      allTestimonials.push(...page.extractedData.testimonials);
    }

    // Features
    if (page.extractedData?.features) {
      for (const f of page.extractedData.features) {
        allFeatures.add(f.title);
      }
    }

    // Integrations
    if (page.extractedData?.integrations) {
      for (const i of page.extractedData.integrations) {
        allIntegrations.add(i);
      }
    }

    // Jobs
    if (page.extractedData?.jobOpenings) {
      for (const job of page.extractedData.jobOpenings) {
        allJobs.push({ title: job.title, department: job.department });
        hiringDepartments.add(job.department);
      }
    }

    // Pricing
    if (page.extractedData?.pricingPlans && page.extractedData.pricingPlans.length > 0) {
      hasPricing = true;
      for (const plan of page.extractedData.pricingPlans) {
        if (/free|gratuit|\$0|€0/i.test(plan.price)) {
          hasFreeTier = true;
        }
        if (/contact|enterprise/i.test(plan.price)) {
          pricingModel = "enterprise";
        } else if (/\//i.test(plan.price)) {
          pricingModel = pricingModel || "subscription";
        }
      }
    }

    // Page types
    if (page.pageType === "documentation") hasDocumentation = true;
    if (page.pageType === "api") hasAPI = true;
    if (page.pageType === "blog-post") blogPostCount++;
  }

  // Product description from homepage
  const homepage = pages.find((p) => p.pageType === "homepage" || p.path === "/");
  const productDescription = homepage?.description || homepage?.content?.slice(0, 500);

  return {
    productDescription,
    features: Array.from(allFeatures).slice(0, 30),
    integrations: Array.from(allIntegrations),
    hasFreeTier,
    hasPricing,
    pricingModel,
    teamSize: allTeamMembers.length > 0 ? allTeamMembers.length : undefined,
    teamMembers: allTeamMembers.slice(0, 30),
    clientCount: allClients.size > 0 ? allClients.size : undefined,
    clients: Array.from(allClients).slice(0, 50),
    testimonials: allTestimonials.slice(0, 20),
    openPositions: allJobs.length,
    hiringDepartments: Array.from(hiringDepartments),
    blogPostCount: blogPostCount > 0 ? blogPostCount : undefined,
    hasDocumentation,
    hasAPI,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.origin;
  } catch {
    return null;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function inferPageType(path: string, title: string): WebsitePageType {
  const p = path.toLowerCase();
  const t = title.toLowerCase();

  if (p === "/" || p === "/index" || p === "/home") return "homepage";
  if (p.includes("/about")) return "about";
  if (p.includes("/team") || p.includes("/people") || p.includes("/equipe")) return "team";
  if (p.includes("/pricing") || p.includes("/plans") || p.includes("/tarif")) return "pricing";
  if (p.includes("/product") || t.includes("product")) return "product";
  if (p.includes("/feature")) return "features";
  if (p.includes("/customer") || p.includes("/client") || p.includes("/case")) return "customers";
  if (p.includes("/testimonial") || p.includes("/review")) return "testimonials";
  if (p.includes("/blog") || p.includes("/article") || p.includes("/news")) {
    return p.split("/").filter(Boolean).length > 2 ? "blog-post" : "blog";
  }
  if (p.includes("/career") || p.includes("/job") || p.includes("/join")) return "careers";
  if (p.includes("/doc") || p.includes("/guide") || p.includes("/help")) return "documentation";
  if (p.includes("/api") || p.includes("/developer")) return "api";
  if (p.includes("/integration") || p.includes("/connect")) return "integrations";
  if (p.includes("/contact") || p.includes("/support")) return "contact";
  if (p.includes("/privacy") || p.includes("/terms") || p.includes("/legal")) return "legal";

  return "other";
}

function inferDepartment(title: string): string {
  const t = title.toLowerCase();

  if (/engineer|developer|devops|sre|backend|frontend|fullstack|tech lead|cto/i.test(t)) {
    return "Engineering";
  }
  if (/product|pm|ux|ui|design/i.test(t)) return "Product";
  if (/sales|account|business dev|bd|sdr|ae/i.test(t)) return "Sales";
  if (/marketing|growth|content|seo|brand/i.test(t)) return "Marketing";
  if (/support|success|cs|customer/i.test(t)) return "Customer Success";
  if (/hr|people|talent|recruit/i.test(t)) return "People";
  if (/finance|accounting|legal|ops|operation/i.test(t)) return "Operations";
  if (/data|analyst|scientist|ml|ai/i.test(t)) return "Data";

  return "Other";
}

function extractCompanyName(pages: WebsitePage[]): string | undefined {
  const homepage = pages.find((p) => p.pageType === "homepage" || p.path === "/");
  if (homepage?.title) {
    // Le nom est souvent la première partie du titre
    const parts = homepage.title.split(/[|\-–—:•]/);
    if (parts[0]) {
      return parts[0].trim();
    }
  }
  return undefined;
}

function extractTagline(pages: WebsitePage[]): string | undefined {
  const homepage = pages.find((p) => p.pageType === "homepage" || p.path === "/");
  return homepage?.description;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { WebsiteContent, WebsitePage, WebsitePageType };
