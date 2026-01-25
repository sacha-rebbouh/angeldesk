/**
 * DB_COMPLETER - Prompt Cache
 *
 * Cache et optimisation du prompt d'extraction LLM.
 * Réduit la taille du prompt de ~600 tokens à ~250 tokens par appel.
 */

import { INDUSTRY_TAXONOMY, type Industry } from '../types'

// ============================================================================
// TAXONOMIE CONDENSÉE
// ============================================================================

/**
 * Catégories principales avec leurs sous-industries
 * Utilisé pour un prompt plus court
 */
export const INDUSTRY_CATEGORIES: Record<string, Industry[]> = {
  'Software/Tech': [
    'SaaS B2B',
    'SaaS B2C',
    'Developer Tools',
    'Cloud Infrastructure',
    'Data & Analytics',
    'AI Pure-Play',
    'Cybersecurity',
    'Enterprise Software',
  ],
  FinTech: [
    'FinTech Payments',
    'FinTech Banking',
    'FinTech Lending',
    'FinTech Insurance',
    'FinTech WealthTech',
  ],
  Health: ['HealthTech', 'MedTech', 'BioTech', 'Pharma', 'Mental Health'],
  Commerce: ['E-commerce', 'Marketplace B2C', 'Marketplace B2B', 'Retail Tech', 'D2C Brands'],
  'Marketing/Sales': ['MarTech', 'AdTech', 'Sales Tech'],
  'HR/Work': ['HRTech', 'Recruiting', 'Future of Work', 'Corporate Learning'],
  'Real Estate': ['PropTech', 'ConstructionTech', 'Smart Building'],
  'Transport/Logistics': ['Logistics', 'Delivery', 'Mobility', 'Automotive'],
  Sustainability: ['CleanTech', 'Energy', 'GreenTech', 'AgriTech', 'FoodTech'],
  Other: [
    'EdTech',
    'LegalTech',
    'GovTech',
    'SpaceTech',
    'Defense',
    'Gaming',
    'Entertainment',
    'Social',
    'Consumer Apps',
    'Hardware',
    'DeepTech',
    'Robotics',
    'TravelTech',
  ],
}

/**
 * Liste condensée des catégories pour le prompt
 * Format: "Category (sub1, sub2, ...)"
 */
let _cachedTaxonomyString: string | null = null

export function getCondensedTaxonomy(): string {
  if (_cachedTaxonomyString) {
    return _cachedTaxonomyString
  }

  const lines: string[] = []
  for (const [category, industries] of Object.entries(INDUSTRY_CATEGORIES)) {
    // Format court: juste la catégorie avec quelques exemples
    const examples = industries.slice(0, 3).join(', ')
    lines.push(`${category}: ${examples}${industries.length > 3 ? ', ...' : ''}`)
  }

  _cachedTaxonomyString = lines.join('\n')
  return _cachedTaxonomyString
}

/**
 * Liste complète pour la validation (cachée)
 */
let _cachedFullTaxonomy: Set<string> | null = null

export function getTaxonomySet(): Set<string> {
  if (_cachedFullTaxonomy) {
    return _cachedFullTaxonomy
  }

  _cachedFullTaxonomy = new Set(INDUSTRY_TAXONOMY.map((i) => i.toLowerCase()))
  return _cachedFullTaxonomy
}

// ============================================================================
// PROMPT OPTIMISÉ
// ============================================================================

/**
 * Prompt système (envoyé une seule fois, pas répété)
 * ~150 tokens au lieu de ~400
 */
export const SYSTEM_PROMPT = `Tu es un expert en startups. Extrais les données en JSON.

RÈGLES:
1. JAMAIS INVENTER - Si info absente → null
2. INDUSTRIE - Catégories: Software/Tech, FinTech, Health, Commerce, Marketing/Sales, HR/Work, Real Estate, Transport/Logistics, Sustainability, Other
3. IA comme outil ≠ "AI Pure-Play" - Classer dans le secteur du produit
4. STATUT - Chercher indices: shutdown, acquisition, pivot
5. URLs - Extraire le site officiel (pas les articles) et le profil LinkedIn company

FORMAT JSON (pas de markdown):
{
  "company_name": "string|null",
  "activity_status": "active|shutdown|acquired|pivoted|null",
  "activity_status_details": "string|null",
  "industry": "string|null",
  "sub_industry": "string|null",
  "description": "string|null",
  "business_model": "SaaS|Marketplace|Transactional|Hardware|Services|null",
  "target_market": "B2B|B2C|B2B2C|null",
  "headquarters_country": "string|null",
  "headquarters_city": "string|null",
  "founded_year": number|null,
  "founders": [{"name":"string","role":"string|null"}],
  "employees": number|null,
  "total_raised": "string|null",
  "last_round_amount": "string|null",
  "last_round_stage": "string|null",
  "investors": ["string"],
  "competitors": ["string"],
  "notable_clients": ["string"],
  "website": "string|null (site officiel, ex: https://company.com)",
  "linkedin_url": "string|null (https://linkedin.com/company/xxx)",
  "is_profitable": boolean|null,
  "confidence": 0-100,
  "data_completeness": 0-100
}`

/**
 * Construit le prompt utilisateur (contenu variable)
 * Beaucoup plus court que l'ancien prompt complet
 */
export function buildUserPrompt(companyName: string, content: string): string {
  // Tronquer le contenu si trop long (sera géré par chunking)
  const maxContentLength = 12000
  const truncatedContent =
    content.length > maxContentLength ? content.slice(0, maxContentLength) + '\n[...]' : content

  return `Analyse "${companyName}":

${truncatedContent}

JSON uniquement:`
}

// ============================================================================
// MAPPING INDUSTRY
// ============================================================================

/**
 * Mappe une réponse LLM vers la taxonomie exacte
 * Gère les variations et fautes de frappe
 */
export function mapToExactIndustry(llmIndustry: string | null): Industry | null {
  if (!llmIndustry) return null

  const normalized = llmIndustry.toLowerCase().trim()
  const taxonomySet = getTaxonomySet()

  // Match exact
  if (taxonomySet.has(normalized)) {
    return INDUSTRY_TAXONOMY.find((i) => i.toLowerCase() === normalized) || null
  }

  // Match partiel - chercher dans toutes les industries
  for (const industry of INDUSTRY_TAXONOMY) {
    const industryLower = industry.toLowerCase()
    if (normalized.includes(industryLower) || industryLower.includes(normalized)) {
      return industry
    }
  }

  // Mapping des catégories vers l'industrie la plus commune
  const categoryMappings: Record<string, Industry> = {
    'software/tech': 'SaaS B2B',
    software: 'SaaS B2B',
    tech: 'SaaS B2B',
    saas: 'SaaS B2B',
    fintech: 'FinTech Payments',
    finance: 'FinTech Payments',
    health: 'HealthTech',
    healthcare: 'HealthTech',
    medical: 'MedTech',
    commerce: 'E-commerce',
    ecommerce: 'E-commerce',
    'e-commerce': 'E-commerce',
    marketplace: 'Marketplace B2B',
    marketing: 'MarTech',
    sales: 'Sales Tech',
    hr: 'HRTech',
    'human resources': 'HRTech',
    'real estate': 'PropTech',
    property: 'PropTech',
    transport: 'Logistics',
    logistics: 'Logistics',
    delivery: 'Delivery',
    mobility: 'Mobility',
    sustainability: 'CleanTech',
    clean: 'CleanTech',
    green: 'GreenTech',
    energy: 'Energy',
    food: 'FoodTech',
    agriculture: 'AgriTech',
    education: 'EdTech',
    legal: 'LegalTech',
    government: 'GovTech',
    space: 'SpaceTech',
    gaming: 'Gaming',
    games: 'Gaming',
    entertainment: 'Entertainment',
    social: 'Social',
    consumer: 'Consumer Apps',
    hardware: 'Hardware',
    deeptech: 'DeepTech',
    robotics: 'Robotics',
    travel: 'TravelTech',
    ai: 'AI Pure-Play',
    'artificial intelligence': 'AI Pure-Play',
    cyber: 'Cybersecurity',
    security: 'Cybersecurity',
    cloud: 'Cloud Infrastructure',
    data: 'Data & Analytics',
    analytics: 'Data & Analytics',
    developer: 'Developer Tools',
    devtools: 'Developer Tools',
  }

  for (const [key, value] of Object.entries(categoryMappings)) {
    if (normalized.includes(key)) {
      return value
    }
  }

  return null
}

// ============================================================================
// STATS DU PROMPT
// ============================================================================

/**
 * Estime le nombre de tokens d'un texte
 * Approximation: 1 token ≈ 4 caractères en anglais/français
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Retourne les stats du prompt pour monitoring
 */
export function getPromptStats(): {
  systemPromptTokens: number
  taxonomyTokens: number
  totalFixedTokens: number
} {
  const systemTokens = estimateTokens(SYSTEM_PROMPT)
  const taxonomyTokens = estimateTokens(getCondensedTaxonomy())

  return {
    systemPromptTokens: systemTokens,
    taxonomyTokens: taxonomyTokens,
    totalFixedTokens: systemTokens + taxonomyTokens,
  }
}
