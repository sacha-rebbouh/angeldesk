// Test specific patterns that are failing

const testCases = [
  "[EARLY STAGE] 15 millions de dollars pour LAGO et sa solution de paiement pour offres complexes",
  "[GROWTH] 300 millions de plus pour développer ELECTRA en Europe",
  "[SCALE] HIBOO veut optimiser l'usage d'engins de chantier afin de réduire les émissions inutiles de CO2.",
  "[SERIE B] 385 millions d'euros pour MISTRAL.AI. SALESFORCE et BNP PARIBAS montent à bord.",
  "[SERIE A] 10 millions d'euros pour le service de consigne de la startup LE FOURGON"
];

function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

for (const title of testCases) {
  const cleanTitle = cleanHtmlEntities(title);
  console.log("\n=== Testing:", cleanTitle.substring(0, 70) + "...");

  // Pattern 1
  const tagAmountPourMatch = cleanTitle.match(/^\[(?:SERI?E\s*[A-D]|S[ée]rie\s*[A-D]|SCALE|SEED|GROWTH|IPO|PRE[\s\-]?SEED|BRIDGE|EARLY\s*STAGE|LATE\s*STAGE)\]\s+[\d,\.]+\s*millions?[^]*?pour\s+([A-ZÀ-Ÿ0-9][A-Za-zÀ-ÿ0-9\.\-&]+)(?:\s+(?:afin|et|qui|en|à|aux|optimise|veut|pour|une|,)|\.|,|\s*$)/i);
  if (tagAmountPourMatch) {
    console.log("  Pattern 1 matched:", tagAmountPourMatch[1]);
  }

  // Pattern 1b - descriptor
  const tagPourDescMatch = cleanTitle.match(/(?:la\s+startup|l['']?edtech|l['']?fintech|l['']?healthtech|la\s+plateforme|la\s+société)\s+(?:[a-zà-ÿ\s\-\'\"]*\s+)?([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9\s]+)(?:\s*$|\.)/);
  if (tagPourDescMatch) {
    console.log("  Pattern 1b matched:", tagPourDescMatch[1]);
  }

  // Pattern 1c - all caps at end
  const tagAllCapsMatch = cleanTitle.match(/\s([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9\.\-&]+)(?:\s+(?:en|aux?|à|et|qui)\s|\s*[,\.]|\s*$)/);
  if (tagAllCapsMatch && !/^(SERIE|SEED|SCALE|GROWTH|IPO|BRIDGE|EUR|USD|M|SALESFORCE|BNP)$/i.test(tagAllCapsMatch[1])) {
    console.log("  Pattern 1c matched:", tagAllCapsMatch[1]);
  }

  // Pattern 2 - company after tag
  const bracketCompanyMatch = cleanTitle.match(/^\[(?:SERI?E\s*[A-D]|S[ée]rie\s*[A-D]|SCALE|SEED|GROWTH|IPO|PRE[\s\-]?SEED|BRIDGE|EARLY\s*STAGE|LATE\s*STAGE)\]\s+([A-ZÀ-Ÿ0-9][A-Za-zÀ-ÿ0-9\s\-\.&]*?)(?:\s+(?:lève|veut|met|donne|a levé|annonce|boucle|sécurise|étend|finalise|voit)|,|\s*$)/i);
  if (bracketCompanyMatch) {
    console.log("  Pattern 2 matched:", bracketCompanyMatch[1]);
  }

  if (!tagAmountPourMatch && !tagPourDescMatch && !tagAllCapsMatch && !bracketCompanyMatch) {
    console.log("  NO MATCH");
  }
}
