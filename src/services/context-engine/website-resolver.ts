/**
 * Website URL Resolver
 *
 * Résout l'URL du site web d'une startup avec plusieurs fallbacks :
 * 1. Form : URL fournie par l'utilisateur
 * 2. Form invalide : Si l'URL ne fonctionne pas, passer au deck
 * 3. Deck : Extraire depuis le pitch deck
 * 4. Autres docs : Chercher dans les documents uploadés
 * 5. Web search : Rechercher "nom + secteur" pour trouver le site
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WebsiteResolutionInput {
  /** URL fournie par l'utilisateur dans le formulaire */
  formUrl?: string;
  /** Nom de la startup */
  companyName: string;
  /** Secteur de la startup */
  sector?: string;
  /** Texte extrait des documents (pitch deck en premier) */
  documentTexts?: {
    type: "pitch_deck" | "financials" | "other";
    text: string;
  }[];
}

export interface WebsiteResolutionResult {
  /** URL résolue (ou null si non trouvée) */
  url: string | null;
  /** Source de l'URL */
  source: "form" | "deck" | "document" | "web_search" | null;
  /** URL essayée mais échouée */
  failedUrl?: string;
  /** Raison de l'échec */
  failedReason?: string;
  /** Détails de la résolution */
  details: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  VALIDATE_TIMEOUT_MS: 5000, // 5s pour valider une URL
  SEARCH_TIMEOUT_MS: 10000, // 10s pour une recherche web
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// ============================================================================
// MAIN RESOLVER
// ============================================================================

/**
 * Résout l'URL du site web avec fallbacks
 */
export async function resolveWebsiteUrl(
  input: WebsiteResolutionInput
): Promise<WebsiteResolutionResult> {
  console.log(`[WebsiteResolver] Resolving website for: ${input.companyName}`);

  // 1. Essayer l'URL du formulaire
  if (input.formUrl) {
    const normalizedUrl = normalizeUrl(input.formUrl);
    if (normalizedUrl) {
      const isValid = await validateUrl(normalizedUrl);
      if (isValid) {
        console.log(`[WebsiteResolver] Form URL valid: ${normalizedUrl}`);
        return {
          url: normalizedUrl,
          source: "form",
          details: "URL fournie par l'utilisateur et validée",
        };
      } else {
        console.log(`[WebsiteResolver] Form URL invalid: ${normalizedUrl}`);
        // Continuer avec les fallbacks
      }
    }
  }

  // 2. Extraire depuis le pitch deck
  const deckTexts = input.documentTexts?.filter((d) => d.type === "pitch_deck") || [];
  for (const deck of deckTexts) {
    const extractedUrl = extractUrlFromText(deck.text, input.companyName);
    if (extractedUrl) {
      const isValid = await validateUrl(extractedUrl);
      if (isValid) {
        console.log(`[WebsiteResolver] Deck URL valid: ${extractedUrl}`);
        return {
          url: extractedUrl,
          source: "deck",
          failedUrl: input.formUrl,
          failedReason: input.formUrl ? "URL du formulaire invalide" : undefined,
          details: "URL extraite du pitch deck",
        };
      }
    }
  }

  // 3. Extraire depuis les autres documents
  const otherDocs = input.documentTexts?.filter((d) => d.type !== "pitch_deck") || [];
  for (const doc of otherDocs) {
    const extractedUrl = extractUrlFromText(doc.text, input.companyName);
    if (extractedUrl) {
      const isValid = await validateUrl(extractedUrl);
      if (isValid) {
        console.log(`[WebsiteResolver] Document URL valid: ${extractedUrl}`);
        return {
          url: extractedUrl,
          source: "document",
          failedUrl: input.formUrl,
          failedReason: input.formUrl ? "URL du formulaire invalide" : undefined,
          details: "URL extraite d'un document",
        };
      }
    }
  }

  // 4. Recherche web
  const searchedUrl = await searchWebsiteUrl(input.companyName, input.sector);
  if (searchedUrl) {
    console.log(`[WebsiteResolver] Web search URL found: ${searchedUrl}`);
    return {
      url: searchedUrl,
      source: "web_search",
      failedUrl: input.formUrl,
      failedReason: input.formUrl ? "URL du formulaire invalide" : undefined,
      details: `URL trouvée via recherche web "${input.companyName}${input.sector ? " " + input.sector : ""}"`,
    };
  }

  // Échec total
  console.log(`[WebsiteResolver] No valid URL found for: ${input.companyName}`);
  return {
    url: null,
    source: null,
    failedUrl: input.formUrl,
    failedReason: input.formUrl ? "URL du formulaire invalide, aucune alternative trouvée" : "Aucune URL trouvée",
    details: "Aucune URL valide trouvée dans le formulaire, les documents, ou via recherche web",
  };
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Normalise une URL (ajoute https si manquant, etc.)
 */
function normalizeUrl(url: string): string | null {
  try {
    let normalized = url.trim();

    // Ajouter le protocole si manquant
    if (!normalized.match(/^https?:\/\//i)) {
      normalized = "https://" + normalized;
    }

    const parsed = new URL(normalized);

    // Vérifier que c'est un vrai domaine
    if (!parsed.hostname.includes(".")) {
      return null;
    }

    // Retourner l'origine (sans path)
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Valide qu'une URL est accessible
 */
async function validateUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.VALIDATE_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "HEAD", // HEAD est plus rapide
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Accepter 2xx et 3xx
    return response.ok || (response.status >= 300 && response.status < 400);
  } catch {
    // Essayer avec GET si HEAD échoue (certains serveurs ne supportent pas HEAD)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.VALIDATE_TIMEOUT_MS);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": CONFIG.USER_AGENT,
        },
        redirect: "follow",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// URL EXTRACTION FROM TEXT
// ============================================================================

/**
 * Extrait une URL d'un texte de document
 */
function extractUrlFromText(text: string, companyName: string): string | null {
  const companyNameLower = companyName.toLowerCase().replace(/\s+/g, "");

  // 1. Chercher des URLs explicites
  const urlPatterns = [
    // URLs complètes
    /https?:\/\/(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi,
    // www.example.com
    /www\.([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})/gi,
    // example.com (domaines courants)
    /(?:^|\s)([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|io|co|fr|eu|ai|app|dev|tech|org|net))(?:\s|$|\/)/gi,
  ];

  const foundUrls: { url: string; score: number }[] = [];

  for (const pattern of urlPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const domain = match[1] || match[0];
      const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];

      // Score basé sur la similarité avec le nom de la startup
      let score = 0;
      const domainLower = cleanDomain.toLowerCase();

      // Bonus si le domaine contient le nom de la startup
      if (domainLower.includes(companyNameLower)) {
        score += 100;
      } else if (companyNameLower.includes(domainLower.split(".")[0])) {
        score += 50;
      }

      // Bonus pour les TLDs courants pour les startups
      if (/\.(io|co|ai|app|dev|tech)$/i.test(cleanDomain)) {
        score += 20;
      }

      // Malus pour les domaines génériques
      if (/linkedin|twitter|facebook|instagram|github|medium|crunchbase|dealroom/i.test(cleanDomain)) {
        score -= 100;
      }

      // Malus pour les emails
      if (text.slice(Math.max(0, match.index - 5), match.index).includes("@")) {
        score -= 100;
      }

      if (score > 0) {
        foundUrls.push({
          url: normalizeUrl(cleanDomain) || `https://${cleanDomain}`,
          score,
        });
      }
    }
  }

  // 2. Chercher les patterns courants dans les decks
  const deckPatterns = [
    // "Visit us at example.com"
    /(?:visit|see|check|website|site|web)[:\s]+(?:us\s+at\s+)?(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})/gi,
    // "example.com" en fin de présentation
    /(?:contact|info|hello|team)@([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})/gi,
  ];

  for (const pattern of deckPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const domain = match[1];
      const normalizedUrl = normalizeUrl(domain);
      if (normalizedUrl) {
        foundUrls.push({
          url: normalizedUrl,
          score: 80, // Haute confiance car pattern explicite
        });
      }
    }
  }

  // Trier par score et retourner le meilleur
  foundUrls.sort((a, b) => b.score - a.score);

  if (foundUrls.length > 0 && foundUrls[0].score > 0) {
    return foundUrls[0].url;
  }

  return null;
}

// ============================================================================
// WEB SEARCH FALLBACK
// ============================================================================

/**
 * Recherche l'URL du site via une recherche web
 */
async function searchWebsiteUrl(companyName: string, sector?: string): Promise<string | null> {
  // Construire la requête de recherche
  const query = sector
    ? `${companyName} ${sector} official website`
    : `${companyName} startup official website`;

  console.log(`[WebsiteResolver] Searching web for: "${query}"`);

  try {
    // Utiliser Serper si disponible
    const serperKey = process.env.SERPER_API_KEY;
    if (serperKey) {
      return await searchWithSerper(query, companyName, serperKey);
    }

    // Fallback: Brave Search si disponible
    const braveKey = process.env.BRAVE_API_KEY;
    if (braveKey) {
      return await searchWithBrave(query, companyName, braveKey);
    }

    console.log(`[WebsiteResolver] No search API key available`);
    return null;
  } catch (error) {
    console.error(`[WebsiteResolver] Search failed:`, error);
    return null;
  }
}

/**
 * Recherche avec Serper (Google Search API)
 */
async function searchWithSerper(query: string, companyName: string, apiKey: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.SEARCH_TIMEOUT_MS);

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const results = data.organic || [];

    // Chercher le meilleur résultat
    const companyNameLower = companyName.toLowerCase().replace(/\s+/g, "");

    for (const result of results) {
      const link = result.link as string;
      if (!link) continue;

      // Skip les agrégateurs
      if (/linkedin|crunchbase|dealroom|twitter|facebook|angel\.co|wellfound/i.test(link)) {
        continue;
      }

      const domain = new URL(link).hostname.replace(/^www\./, "");

      // Vérifier si le domaine correspond au nom de la startup
      if (domain.toLowerCase().includes(companyNameLower) ||
          companyNameLower.includes(domain.split(".")[0])) {
        const normalizedUrl = normalizeUrl(domain);
        if (normalizedUrl) {
          const isValid = await validateUrl(normalizedUrl);
          if (isValid) {
            return normalizedUrl;
          }
        }
      }
    }

    // Sinon, prendre le premier résultat non-agrégateur
    for (const result of results) {
      const link = result.link as string;
      if (!link) continue;

      if (/linkedin|crunchbase|dealroom|twitter|facebook|angel\.co|wellfound|wikipedia/i.test(link)) {
        continue;
      }

      const url = new URL(link).origin;
      const isValid = await validateUrl(url);
      if (isValid) {
        return url;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Recherche avec Brave Search
 */
async function searchWithBrave(query: string, companyName: string, apiKey: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.SEARCH_TIMEOUT_MS);

    const params = new URLSearchParams({
      q: query,
      count: "5",
    });

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const results = data.web?.results || [];

    const companyNameLower = companyName.toLowerCase().replace(/\s+/g, "");

    for (const result of results) {
      const link = result.url as string;
      if (!link) continue;

      if (/linkedin|crunchbase|dealroom|twitter|facebook|angel\.co|wellfound/i.test(link)) {
        continue;
      }

      const domain = new URL(link).hostname.replace(/^www\./, "");

      if (domain.toLowerCase().includes(companyNameLower) ||
          companyNameLower.includes(domain.split(".")[0])) {
        const normalizedUrl = normalizeUrl(domain);
        if (normalizedUrl) {
          const isValid = await validateUrl(normalizedUrl);
          if (isValid) {
            return normalizedUrl;
          }
        }
      }
    }

    // Fallback: premier résultat non-agrégateur
    for (const result of results) {
      const link = result.url as string;
      if (!link) continue;

      if (/linkedin|crunchbase|dealroom|twitter|facebook|angel\.co|wellfound|wikipedia/i.test(link)) {
        continue;
      }

      const url = new URL(link).origin;
      const isValid = await validateUrl(url);
      if (isValid) {
        return url;
      }
    }

    return null;
  } catch {
    return null;
  }
}

