/**
 * Debug script to see what posts we're missing
 * Uses actual parsing functions from the connector
 */

const API_BASE = "https://www.frenchweb.fr/wp-json/wp/v2";

interface WPPost {
  id: number;
  date: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  link: string;
}

async function fetchPosts(): Promise<WPPost[]> {
  const url = `${API_BASE}/posts?categories=12024&per_page=100&page=1&_fields=id,date,title,excerpt,link`;
  const response = await fetch(url);
  return response.json();
}

// ======= COPY OF NEW PARSING FUNCTIONS =======

function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&ndash;/g, "-")
    .replace(/&#8212;/g, "—")
    .replace(/&mdash;/g, "—")
    .replace(/&#8230;/g, "...")
    .replace(/&hellip;/g, "...")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#8364;/g, "€")
    .replace(/&euro;/g, "€")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function isNonFundingArticle(title: string): boolean {
  const skipPatterns = [
    /^Ask\s+[aA]\s+VC/i,
    /^Question\s+à\s+un\s+VC/i,
    /^Ce\s+que\s+les\s+levées/i,
    /^Quelles\s+tendances/i,
    /^Comment\s+un\s+marché/i,
    /^IPO\s+tech/i,
    /^Financer\s+la\s+deeptech/i,
    /pourquoi\s+les\s+startups\s+se\s+tournent/i,
    /l['']analyse\s+de/i,
    /conclusion\s+du\s+rapport/i,
  ];
  return skipPatterns.some(pattern => pattern.test(title));
}

function parseFundingAmount(text: string): number | null {
  const cleanText = cleanHtmlEntities(text);

  // Euro patterns
  const euroPatterns = [
    /€\s*(\d+(?:[.,]\d+)?)\s*M/i,
    /(\d+(?:[.,]\d+)?)\s*M€/i,
    /(\d+(?:[.,]\d+)?)\s*millions?\s*(?:d['']euros?|€|EUR|euros?)/i,
    /lève\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    /levé\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    /qui\s+lève\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    /a\s+levé\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    /et\s+lève\s+(\d+(?:[.,]\d+)?)\s*millions?(?!\s*(?:de\s+)?dollars?)/i,
    /raised?\s+€\s*(\d+(?:[.,]\d+)?)\s*millions?/i,
    /mobilise\s+(\d+(?:[.,]\d+)?)\s*millions?/i,
    /abonde\s+de\s+(\d+(?:[.,]\d+)?)\s*millions?/i,
  ];

  for (const pattern of euroPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (amount > 0 && amount < 50000) {
        return amount * 1_000_000;
      }
    }
  }

  // Dollar patterns
  const dollarPatterns = [
    /\$\s*(\d+(?:[.,]\d+)?)\s*M/i,
    /(\d+(?:[.,]\d+)?)\s*M\$/i,
    /(\d+(?:[.,]\d+)?)\s*millions?\s*(?:de\s+)?dollars?/i,
    /raised?\s+\$\s*(\d+(?:[.,]\d+)?)\s*millions?/i,
  ];

  for (const pattern of dollarPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (amount > 0 && amount < 50000) {
        return amount * 1_000_000;
      }
    }
  }

  // Generic millions (default to EUR for French context)
  const genericMatch = cleanText.match(/(\d+(?:[.,]\d+)?)\s*millions?/i);
  if (genericMatch) {
    const amount = parseFloat(genericMatch[1].replace(",", "."));
    if (amount > 0 && amount < 50000) {
      return amount * 1_000_000;
    }
  }

  return null;
}

function extractCompanyName(title: string): string | null {
  const cleanTitle = cleanHtmlEntities(title);

  if (isNonFundingArticle(cleanTitle)) {
    return null;
  }

  // Pattern 1: "[TAG] X millions pour COMPANY" - amount before company
  // Examples: "[SERIE A] 11,3 millions d'euros pour HERO", "[Série B] 25 millions d'euros pour STOIK"
  const tagAmountPourMatch = cleanTitle.match(/^\[(?:SERI?E\s*[A-D]|S[ée]rie\s*[A-D]|SCALE|SEED|GROWTH|IPO|PRE[\s\-]?SEED|BRIDGE|EARLY\s*STAGE|LATE\s*STAGE)\]\s+[\d,\.]+\s*millions?[^]*?pour\s+([A-ZÀ-Ÿ0-9][A-Za-zÀ-ÿ0-9\s\-&\.]*?)(?:\s+(?:afin|et\s+sa|et\s+son|et\s+ses|qui|optimise|veut|pour|une|en vue)|,|\s*$)/i);
  if (tagAmountPourMatch && tagAmountPourMatch[1].length >= 1 && tagAmountPourMatch[1].length < 45) {
    let company = tagAmountPourMatch[1].trim();
    company = company.replace(/\s+(le|la|les|du|de|des|l')$/i, "").trim();
    if (company.length >= 1) {
      return company;
    }
  }

  // Pattern 1b: "[TAG] X millions pour la startup/l'edtech COMPANY" - with descriptor before company
  // Example: "[SEED] 6 millions d'euros pour l'edtech AUGMENT"
  // Example: "[SERIE A] 10 millions d'euros pour le service de consigne de la startup LE FOURGON"
  const tagPourDescMatch = cleanTitle.match(/(?:la\s+startup|l['']?edtech|l['']?fintech|l['']?healthtech|la\s+plateforme|la\s+société)\s+(?:[a-zà-ÿ\s\-\'\"]*\s+)?([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9\s]+)(?:\s*$|\.)/);
  if (tagPourDescMatch && tagPourDescMatch[1].length >= 2 && tagPourDescMatch[1].length < 40) {
    return tagPourDescMatch[1].trim();
  }

  // Pattern 2: "[TAG] COMPANY lève/veut/met/étend/voit..." - company right after tag
  const bracketCompanyMatch = cleanTitle.match(/^\[(?:SERI?E\s*[A-D]|S[ée]rie\s*[A-D]|SCALE|SEED|GROWTH|IPO|PRE[\s\-]?SEED|BRIDGE|EARLY\s*STAGE|LATE\s*STAGE)\]\s+([A-ZÀ-Ÿ0-9][A-Za-zÀ-ÿ0-9\s\-\.&]*?)(?:\s+(?:lève|veut|met|donne|a levé|annonce|boucle|sécurise|étend|finalise|voit)|,|\s*$)/i);
  if (bracketCompanyMatch && bracketCompanyMatch[1].length >= 1 && bracketCompanyMatch[1].length < 45) {
    return bracketCompanyMatch[1].trim();
  }

  // Pattern 3: "COMPANY lève/raises/annonce..." at start (no tag)
  const leveMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s+(?:lève|raises|annonce|boucle|sécurise|mobilise|a levé|vient de lever)/i);
  if (leveMatch && leveMatch[1].length > 1 && leveMatch[1].length < 45) {
    return leveMatch[1].trim();
  }

  // Pattern 4: "...avec COMPANY qui lève..." - company after "avec"
  const avecMatch = cleanTitle.match(/avec\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+)\s+qui\s+(?:lève|a levé)/i);
  if (avecMatch && avecMatch[1].length > 1) {
    return avecMatch[1].trim();
  }

  // Pattern 5: "Topic, COMPANY veut/lève..." - company after comma
  const commaMatch = cleanTitle.match(/^[^,]+,\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s+(?:veut|lève|annonce|a levé|cherche|vient de)/i);
  if (commaMatch && commaMatch[1].length > 1 && commaMatch[1].length < 45) {
    return commaMatch[1].trim();
  }

  // Pattern 6: "COMPANY veut...et lève" - company that does something then raises
  const veutLeveMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s+(?:veut|cherche|souhaite)[^]*?(?:et\s+lève|lève)/i);
  if (veutLeveMatch && veutLeveMatch[1].length > 1 && veutLeveMatch[1].length < 45) {
    return veutLeveMatch[1].trim();
  }

  // Pattern 7: "France 2030 abonde...COMPANY, qui a levé" - government funding mentions
  const abondeMatch = cleanTitle.match(/abonde[^,]*\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+),?\s+qui\s+a\s+levé/i);
  if (abondeMatch && abondeMatch[1].length > 1) {
    return abondeMatch[1].trim();
  }

  // Pattern 8: "COMPANY, description qui/et lève..." - comma after company name
  const companyCommaMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+),\s+[^,]+(?:,\s+)?(?:lève|qui\s+lève|et\s+lève|a levé)/i);
  if (companyCommaMatch && companyCommaMatch[1].length > 1 && companyCommaMatch[1].length < 35) {
    return companyCommaMatch[1].trim();
  }

  // Pattern 9: "COMPANY: description" - colon format
  const colonMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?):/);
  if (colonMatch && colonMatch[1].length > 1 && colonMatch[1].length < 35) {
    return colonMatch[1].trim();
  }

  // Pattern 10: "...met la main sur COMPANY..." - acquisition
  const acquisitionMatch = cleanTitle.match(/met\s+la\s+main\s+sur\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+)/i);
  if (acquisitionMatch && acquisitionMatch[1].length > 1) {
    return acquisitionMatch[1].trim();
  }

  // Pattern 11: "COMPANY / COMPANY2 / ..." - multiple companies (take first)
  const slashMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s*\/\s*[A-ZÀ-Ÿ]/);
  if (slashMatch && slashMatch[1].length > 1 && slashMatch[1].length < 35) {
    return slashMatch[1].trim();
  }

  // Pattern 12: "X millions pour COMPANY" without tag
  const millionsPourMatch = cleanTitle.match(/[\d,\.]+\s*millions?[^]*?(?:pour|chez)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-&]+?)(?:,|\s+et\s|\s+qui\s|\s+afin\s|\s*$)/i);
  if (millionsPourMatch && millionsPourMatch[1].length > 1 && millionsPourMatch[1].length < 45) {
    let company = millionsPourMatch[1].trim();
    company = company.replace(/\s+(le|la|les|du|de|des|l')$/i, "").trim();
    if (!/^(les|des|le|la|une?|son|sa|ses|l')\s/i.test(company) && company.length > 1) {
      return company;
    }
  }

  // Pattern 13: "COMPANY finalise/clôture/conclut une levée"
  const finaliseMatch = cleanTitle.match(/^([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-\.&]+?)\s+(?:finalise|clôture|conclut|réalise)[^]*?(?:levée|tour|round)/i);
  if (finaliseMatch && finaliseMatch[1].length > 1 && finaliseMatch[1].length < 45) {
    return finaliseMatch[1].trim();
  }

  // Pattern 14: "Levée de fonds pour COMPANY" or "Tour de table pour COMPANY"
  const leveePourMatch = cleanTitle.match(/(?:levée|tour|round)[^]*?pour\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-&]+?)(?:,|\s+qui|\s*$)/i);
  if (leveePourMatch && leveePourMatch[1].length > 1 && leveePourMatch[1].length < 45) {
    let company = leveePourMatch[1].trim();
    if (!/^(les|des|le|la|une?|son|sa|ses|l')\s/i.test(company)) {
      return company;
    }
  }

  // Pattern 15: Try to extract company from "pour COMPANY" anywhere in title (fallback)
  const pourMatch = cleanTitle.match(/pour\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\s\-&]+?)(?:,|\s+et\s|\s+qui\s|\s+pour\s|\s+afin\s|\s*$)/i);
  if (pourMatch && pourMatch[1].length > 1 && pourMatch[1].length < 45) {
    if (!/^(les|des|le|la|une?|son|sa|ses|l')\s/i.test(pourMatch[1])) {
      return pourMatch[1].trim();
    }
  }

  // Pattern 16: "chez COMPANY" - company mentioned with "chez"
  const chezMatch = cleanTitle.match(/chez\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9\-&]+)/i);
  if (chezMatch && chezMatch[1].length > 1 && chezMatch[1].length < 35) {
    return chezMatch[1].trim();
  }

  // Pattern 17 (FALLBACK): Find ALL-CAPS company name (4+ chars) at end of title
  // Example: "[GROWTH] 300 millions de plus pour développer ELECTRA en Europe"
  // Only use this if no other pattern matched - it's less reliable
  const allCapsMatch = cleanTitle.match(/\s([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9\.\-&]{3,})(?:\s+(?:en|aux?|à|et|qui)\s|\s*[,\.]|\s*$)/);
  if (allCapsMatch && allCapsMatch[1].length >= 4 && allCapsMatch[1].length < 30) {
    const word = allCapsMatch[1];
    // Exclude common words that aren't company names
    if (!/^(SERIE|SEED|SCALE|GROWTH|IPO|BRIDGE|EUR|USD|BPI|FRANCE|EUROPE|SALESFORCE|BNP|PARIBAS|AMAZON|GOOGLE|MICROSOFT)$/i.test(word)) {
      return word.trim();
    }
  }

  return null;
}

// ======= END PARSING FUNCTIONS =======

async function debug() {
  console.log("Fetching 100 posts from FrenchWeb...\n");
  const posts = await fetchPosts();

  const parsed: string[] = [];
  const notParsed: { title: string; cleanTitle: string; excerpt: string }[] = [];

  for (const post of posts) {
    const title = post.title.rendered;
    const cleanTitle = cleanHtmlEntities(title);
    const excerpt = cleanHtmlEntities(post.excerpt.rendered).substring(0, 200);
    const fullText = `${cleanTitle} ${excerpt}`;

    const company = extractCompanyName(title);
    const amount = parseFundingAmount(fullText);

    if (company && amount) {
      parsed.push(`✅ ${company}: €${(amount / 1_000_000).toFixed(1)}M`);
    } else if (company && !amount) {
      // Has company but no amount
      notParsed.push({ title, cleanTitle, excerpt });
    } else {
      notParsed.push({ title, cleanTitle, excerpt });
    }
  }

  console.log(`PARSED: ${parsed.length}/100\n`);
  console.log("Sample parsed:");
  parsed.slice(0, 15).forEach(p => console.log(`  ${p}`));

  console.log(`\n${"=".repeat(60)}\n`);
  console.log(`NOT PARSED: ${notParsed.length}/100\n`);
  console.log("Titles we're missing (clean version):\n");

  for (const item of notParsed.slice(0, 25)) {
    console.log(`❌ ${item.cleanTitle}`);

    // Check if there's an amount
    const amount = parseFundingAmount(item.excerpt);
    if (amount) {
      console.log(`   └─ HAS AMOUNT in excerpt: €${(amount / 1_000_000).toFixed(1)}M`);
    }

    // Check if it's marked as skipped
    if (isNonFundingArticle(item.cleanTitle)) {
      console.log(`   └─ SKIPPED (non-funding article)`);
    }
  }
}

debug().catch(console.error);
