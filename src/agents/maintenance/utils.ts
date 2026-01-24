/**
 * Database Maintenance System - Shared Utilities
 *
 * Utilitaires partagés pour tous les agents de maintenance
 */

import {
  STAGE_NORMALIZATION,
  COUNTRY_NORMALIZATION,
  INDUSTRY_TAXONOMY,
  ACTIVITY_STATUS_TO_COMPANY_STATUS,
  type Industry,
  type AgentError,
} from './types'
import type { CompanyStatus } from '@prisma/client'

// ============================================================================
// STRING NORMALIZATION
// ============================================================================

/**
 * Normalise un nom de company pour créer un slug
 * - Lowercase
 * - Remove accents
 * - Remove legal suffixes (SAS, SARL, Inc, Ltd, etc.)
 * - Remove special characters
 * - Trim and collapse spaces
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(
      /\b(sas|sarl|sa|sasu|eurl|inc|incorporated|ltd|limited|llc|gmbh|ag|bv|nv|plc|corp|corporation|co|company)\b\.?/gi,
      ''
    )
    .replace(/[^\w\s-]/g, '') // Remove special chars except hyphen
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim hyphens
    .trim()
}

/**
 * Génère un slug unique à partir d'un nom
 */
export function generateSlug(name: string): string {
  return normalizeCompanyName(name)
}

/**
 * Normalise un stage de funding
 */
export function normalizeStage(stage: string | null | undefined): string | null {
  if (!stage) return null

  const normalized = stage.toLowerCase().trim()
  return STAGE_NORMALIZATION[normalized] || stage.toUpperCase().replace(/\s+/g, '_')
}

/**
 * Normalise un nom de pays
 */
export function normalizeCountry(country: string | null | undefined): string | null {
  if (!country) return null

  const normalized = country.toLowerCase().trim()
  return COUNTRY_NORMALIZATION[normalized] || capitalizeWords(country)
}

/**
 * Valide et normalise une industrie selon la taxonomie
 */
export function normalizeIndustry(industry: string | null | undefined): Industry | null {
  if (!industry) return null

  const normalized = industry.toLowerCase().trim()

  // Exact match (case-insensitive)
  const exactMatch = INDUSTRY_TAXONOMY.find((i) => i.toLowerCase() === normalized)
  if (exactMatch) return exactMatch

  // Partial match
  const partialMatch = INDUSTRY_TAXONOMY.find(
    (i) => normalized.includes(i.toLowerCase()) || i.toLowerCase().includes(normalized)
  )
  if (partialMatch) return partialMatch

  // Fuzzy mapping for common variations
  const fuzzyMappings: Record<string, Industry> = {
    saas: 'SaaS B2B',
    'software as a service': 'SaaS B2B',
    fintech: 'FinTech Payments',
    finance: 'FinTech Payments',
    'financial services': 'FinTech Payments',
    health: 'HealthTech',
    healthcare: 'HealthTech',
    medical: 'MedTech',
    ai: 'AI Pure-Play',
    'artificial intelligence': 'AI Pure-Play',
    'machine learning': 'AI Pure-Play',
    ml: 'AI Pure-Play',
    ecommerce: 'E-commerce',
    'e commerce': 'E-commerce',
    retail: 'Retail Tech',
    marketplace: 'Marketplace B2B',
    cyber: 'Cybersecurity',
    security: 'Cybersecurity',
    hr: 'HRTech',
    'human resources': 'HRTech',
    recruitment: 'Recruiting',
    education: 'EdTech',
    'real estate': 'PropTech',
    property: 'PropTech',
    logistics: 'Logistics',
    delivery: 'Delivery',
    transport: 'Mobility',
    transportation: 'Mobility',
    clean: 'CleanTech',
    green: 'GreenTech',
    sustainability: 'GreenTech',
    food: 'FoodTech',
    agriculture: 'AgriTech',
    legal: 'LegalTech',
    gaming: 'Gaming',
    games: 'Gaming',
    travel: 'TravelTech',
    tourism: 'TravelTech',
    marketing: 'MarTech',
    advertising: 'AdTech',
    sales: 'Sales Tech',
    data: 'Data & Analytics',
    analytics: 'Data & Analytics',
    cloud: 'Cloud Infrastructure',
    infrastructure: 'Cloud Infrastructure',
    devtools: 'Developer Tools',
    developer: 'Developer Tools',
  }

  for (const [key, value] of Object.entries(fuzzyMappings)) {
    if (normalized.includes(key)) {
      return value
    }
  }

  return null // Industry not in taxonomy
}

/**
 * Mappe un activity_status vers CompanyStatus
 */
export function mapActivityToCompanyStatus(
  activityStatus: string | null | undefined
): CompanyStatus | null {
  if (!activityStatus) return null

  const normalized = activityStatus.toLowerCase().trim()
  return ACTIVITY_STATUS_TO_COMPANY_STATUS[normalized] || null
}

// ============================================================================
// TEXT UTILITIES
// ============================================================================

/**
 * Capitalise chaque mot
 */
export function capitalizeWords(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Tronque un texte à une longueur maximale
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Extrait le texte brut d'un HTML
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================================
// NUMBER PARSING
// ============================================================================

/**
 * Parse un montant de levée de fonds
 * Supporte: "5M€", "$10 million", "15 millions d'euros", etc.
 */
export function parseFundingAmount(text: string): { amount: number; currency: string } | null {
  if (!text) return null

  const normalized = text.toLowerCase().trim()

  // Detect currency
  let currency = 'USD'
  if (normalized.includes('€') || normalized.includes('eur')) {
    currency = 'EUR'
  } else if (normalized.includes('£') || normalized.includes('gbp')) {
    currency = 'GBP'
  }

  // Extract number and multiplier
  const patterns = [
    // "5M€", "$10M", "€15M"
    /[\$€£]?\s*(\d+(?:[.,]\d+)?)\s*[mk](?:illion)?s?\s*[\$€£]?/i,
    // "5 millions", "10 million"
    /(\d+(?:[.,]\d+)?)\s*(?:millions?|m)/i,
    // "5 milliards", "10 billion"
    /(\d+(?:[.,]\d+)?)\s*(?:milliards?|billions?|b)/i,
    // Plain number with currency
    /[\$€£]\s*(\d+(?:[.,]\d+)?)/,
    /(\d+(?:[.,]\d+)?)\s*[\$€£]/,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) {
      let amount = parseFloat(match[1].replace(',', '.'))

      // Apply multiplier
      if (/milliard|billion|b/i.test(normalized)) {
        amount *= 1_000_000_000
      } else if (/million|m/i.test(normalized)) {
        amount *= 1_000_000
      } else if (/k/i.test(normalized)) {
        amount *= 1_000
      }

      return { amount, currency }
    }
  }

  return null
}

/**
 * Convertit un montant en USD
 * Taux approximatifs - en production utiliser une API de taux de change
 */
export function convertToUSD(amount: number, currency: string): number {
  const rates: Record<string, number> = {
    USD: 1,
    EUR: 1.08, // 1 EUR = 1.08 USD
    GBP: 1.27, // 1 GBP = 1.27 USD
    CHF: 1.12,
    CAD: 0.74,
    AUD: 0.65,
    JPY: 0.0067,
    CNY: 0.14,
    INR: 0.012,
    BRL: 0.2,
  }

  const rate = rates[currency.toUpperCase()] || 1
  return amount * rate
}

/**
 * Formate un montant pour l'affichage
 */
export function formatAmount(amount: number, currency = 'USD'): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
  }

  const symbol = symbols[currency] || currency + ' '

  if (amount >= 1_000_000_000) {
    return `${symbol}${(amount / 1_000_000_000).toFixed(1)}B`
  } else if (amount >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(1)}M`
  } else if (amount >= 1_000) {
    return `${symbol}${(amount / 1_000).toFixed(0)}K`
  }

  return `${symbol}${amount.toFixed(0)}`
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Retourne le début de la semaine (lundi)
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Retourne la fin de la semaine (dimanche)
 */
export function getWeekEnd(date: Date = new Date()): Date {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

/**
 * Vérifie si deux dates sont le même jour
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Retourne la différence en jours entre deux dates
 */
export function daysDiff(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Formate une durée en ms pour l'affichage
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}min`
  return `${(ms / 3600_000).toFixed(1)}h`
}

// ============================================================================
// SIMILARITY / DEDUPLICATION
// ============================================================================

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length

  if (m === 0) return n
  if (n === 0) return m

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }

  return dp[m][n]
}

/**
 * Calcule la similarité Levenshtein entre deux chaînes (0-1)
 */
export function levenshteinSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  if (s1 === s2) return 1

  const maxLen = Math.max(s1.length, s2.length)
  if (maxLen === 0) return 1

  const distance = levenshteinDistance(s1, s2)
  return 1 - distance / maxLen
}

/**
 * Calcule la similarité Jaro entre deux chaînes (0-1)
 * Meilleur pour les noms similaires avec transpositions
 */
export function jaroSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1
  const s1Matches = new Array(s1.length).fill(false)
  const s2Matches = new Array(s2.length).fill(false)

  let matches = 0
  let transpositions = 0

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, s2.length)

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0

  // Count transpositions
  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  return (
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  )
}

/**
 * Calcule la similarité Jaro-Winkler entre deux chaînes (0-1)
 * Donne plus de poids aux préfixes communs (meilleur pour les noms de sociétés)
 */
export function jaroWinklerSimilarity(str1: string, str2: string, prefixScale = 0.1): number {
  const jaroScore = jaroSimilarity(str1, str2)

  if (jaroScore === 1) return 1

  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  // Find common prefix (up to 4 chars)
  let prefix = 0
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) {
      prefix++
    } else {
      break
    }
  }

  return jaroScore + prefix * prefixScale * (1 - jaroScore)
}

/**
 * Calcule le code Soundex d'une chaîne (similarité phonétique)
 */
export function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '')

  if (s.length === 0) return '0000'

  const codes: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  }

  let result = s[0]
  let prevCode = codes[s[0]] || ''

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]]
    if (code && code !== prevCode) {
      result += code
    }
    prevCode = code || ''
  }

  return (result + '0000').slice(0, 4)
}

/**
 * Calcule le code Double Metaphone d'une chaîne (meilleur que Soundex pour les noms étrangers)
 * Retourne [primary, alternate] codes
 */
export function doubleMetaphone(str: string): [string, string] {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '')

  if (s.length === 0) return ['', '']

  let primary = ''
  let alternate = ''
  let i = 0

  // Skip initial silent letters
  if (['GN', 'KN', 'PN', 'WR', 'PS'].some((prefix) => s.startsWith(prefix))) {
    i = 1
  }

  // Handle initial X -> S
  if (s[0] === 'X') {
    primary += 'S'
    alternate += 'S'
    i = 1
  }

  while (i < s.length && (primary.length < 4 || alternate.length < 4)) {
    const c = s[i]
    const next = s[i + 1] || ''
    const prev = s[i - 1] || ''

    switch (c) {
      case 'A':
      case 'E':
      case 'I':
      case 'O':
      case 'U':
        if (i === 0) {
          primary += 'A'
          alternate += 'A'
        }
        i++
        break

      case 'B':
        primary += 'P'
        alternate += 'P'
        i += next === 'B' ? 2 : 1
        break

      case 'C':
        if (next === 'H') {
          primary += 'X'
          alternate += 'X'
          i += 2
        } else if (['I', 'E', 'Y'].includes(next)) {
          primary += 'S'
          alternate += 'S'
          i += 1
        } else {
          primary += 'K'
          alternate += 'K'
          i += next === 'C' ? 2 : 1
        }
        break

      case 'D':
        if (next === 'G' && ['I', 'E', 'Y'].includes(s[i + 2] || '')) {
          primary += 'J'
          alternate += 'J'
          i += 3
        } else {
          primary += 'T'
          alternate += 'T'
          i += next === 'D' ? 2 : 1
        }
        break

      case 'F':
        primary += 'F'
        alternate += 'F'
        i += next === 'F' ? 2 : 1
        break

      case 'G':
        if (next === 'H') {
          if (i > 0 && !['A', 'E', 'I', 'O', 'U'].includes(prev)) {
            i += 2
          } else {
            primary += 'K'
            alternate += 'K'
            i += 2
          }
        } else if (next === 'N') {
          primary += 'N'
          alternate += 'KN'
          i += 2
        } else if (['I', 'E', 'Y'].includes(next)) {
          primary += 'J'
          alternate += 'K'
          i += 1
        } else {
          primary += 'K'
          alternate += 'K'
          i += next === 'G' ? 2 : 1
        }
        break

      case 'H':
        if (['A', 'E', 'I', 'O', 'U'].includes(next) && !['A', 'E', 'I', 'O', 'U'].includes(prev)) {
          primary += 'H'
          alternate += 'H'
        }
        i++
        break

      case 'J':
        primary += 'J'
        alternate += 'J'
        i += next === 'J' ? 2 : 1
        break

      case 'K':
        primary += 'K'
        alternate += 'K'
        i += next === 'K' ? 2 : 1
        break

      case 'L':
        primary += 'L'
        alternate += 'L'
        i += next === 'L' ? 2 : 1
        break

      case 'M':
        primary += 'M'
        alternate += 'M'
        i += next === 'M' ? 2 : 1
        break

      case 'N':
        primary += 'N'
        alternate += 'N'
        i += next === 'N' ? 2 : 1
        break

      case 'P':
        if (next === 'H') {
          primary += 'F'
          alternate += 'F'
          i += 2
        } else {
          primary += 'P'
          alternate += 'P'
          i += next === 'P' ? 2 : 1
        }
        break

      case 'Q':
        primary += 'K'
        alternate += 'K'
        i += next === 'Q' ? 2 : 1
        break

      case 'R':
        primary += 'R'
        alternate += 'R'
        i += next === 'R' ? 2 : 1
        break

      case 'S':
        if (next === 'H') {
          primary += 'X'
          alternate += 'X'
          i += 2
        } else if (['I', 'E', 'Y'].includes(next) && s[i + 2] === 'O') {
          primary += 'X'
          alternate += 'S'
          i += 3
        } else {
          primary += 'S'
          alternate += 'S'
          i += next === 'S' ? 2 : 1
        }
        break

      case 'T':
        if (next === 'H') {
          primary += '0' // theta
          alternate += 'T'
          i += 2
        } else if (next === 'I' && ['O', 'A'].includes(s[i + 2] || '')) {
          primary += 'X'
          alternate += 'X'
          i += 3
        } else {
          primary += 'T'
          alternate += 'T'
          i += next === 'T' ? 2 : 1
        }
        break

      case 'V':
        primary += 'F'
        alternate += 'F'
        i += next === 'V' ? 2 : 1
        break

      case 'W':
        if (['A', 'E', 'I', 'O', 'U'].includes(next)) {
          primary += 'W'
          alternate += 'W'
        }
        i++
        break

      case 'X':
        primary += 'KS'
        alternate += 'KS'
        i += next === 'X' ? 2 : 1
        break

      case 'Y':
        if (['A', 'E', 'I', 'O', 'U'].includes(next)) {
          primary += 'Y'
          alternate += 'Y'
        }
        i++
        break

      case 'Z':
        primary += 'S'
        alternate += 'S'
        i += next === 'Z' ? 2 : 1
        break

      default:
        i++
    }
  }

  return [primary.slice(0, 4), alternate.slice(0, 4)]
}

/**
 * Calcule la similarité phonétique entre deux chaînes (0-1)
 */
export function phoneticSimilarity(str1: string, str2: string): number {
  // Soundex comparison
  const soundex1 = soundex(str1)
  const soundex2 = soundex(str2)
  const soundexMatch = soundex1 === soundex2 ? 1 : 0

  // Double Metaphone comparison
  const [primary1, alt1] = doubleMetaphone(str1)
  const [primary2, alt2] = doubleMetaphone(str2)

  let metaphoneScore = 0
  if (primary1 === primary2) metaphoneScore = 1
  else if (primary1 === alt2 || alt1 === primary2) metaphoneScore = 0.8
  else if (alt1 === alt2 && alt1 !== '') metaphoneScore = 0.6

  // Combine scores (weight metaphone higher as it's more accurate)
  return soundexMatch * 0.3 + metaphoneScore * 0.7
}

/**
 * Normalisation aggressive d'un nom de société pour comparaison
 * Enlève tous les suffixes légaux, ponctuation, et normalise les espaces
 */
export function aggressiveNormalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    // Remove all legal suffixes (extended list)
    .replace(
      /\b(sas|sarl|sa|sasu|eurl|inc|incorporated|ltd|limited|llc|llp|lp|gmbh|ag|bv|nv|plc|corp|corporation|co|company|group|groupe|holding|holdings|technologies|technology|tech|software|solutions|services|consulting|labs|lab|studio|studios|io|ai|app|apps|platform|systems|system|digital|ventures|venture|capital|partners|partner)\b\.?/gi,
      ''
    )
    // Remove common prefixes
    .replace(/^(the|la|le|les|l'|el|los|las)\s+/gi, '')
    // Remove all non-alphanumeric
    .replace(/[^\w\s]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Interface pour les détails de similarité
 */
export interface SimilarityDetails {
  levenshtein: number
  jaroWinkler: number
  phonetic: number
  normalizedMatch: boolean
  combined: number
}

/**
 * Calcule un score de similarité combiné entre deux noms de sociétés (0-1)
 * Utilise plusieurs algorithmes pondérés pour une meilleure précision
 *
 * Weights:
 * - Jaro-Winkler: 40% (best for name variations)
 * - Levenshtein: 30% (good for typos)
 * - Phonetic: 20% (catches pronunciation-similar names)
 * - Exact normalized match: 10% bonus
 */
export function combinedSimilarity(str1: string, str2: string): SimilarityDetails {
  const levenshtein = levenshteinSimilarity(str1, str2)
  const jaroWinkler = jaroWinklerSimilarity(str1, str2)
  const phonetic = phoneticSimilarity(str1, str2)

  // Check if aggressively normalized versions match exactly
  const norm1 = aggressiveNormalize(str1)
  const norm2 = aggressiveNormalize(str2)
  const normalizedMatch = norm1 === norm2 && norm1.length > 0

  // Combined score with weights
  let combined = jaroWinkler * 0.4 + levenshtein * 0.3 + phonetic * 0.2

  // Bonus for exact normalized match
  if (normalizedMatch) {
    combined = Math.min(1, combined + 0.1)
  }

  return {
    levenshtein,
    jaroWinkler,
    phonetic,
    normalizedMatch,
    combined,
  }
}

/**
 * Calcule la similarité entre deux chaînes (0-1) - fonction de compatibilité
 * Utilise maintenant le score combiné pour de meilleurs résultats
 */
export function stringSimilarity(str1: string, str2: string): number {
  return combinedSimilarity(str1, str2).combined
}

/**
 * Vérifie si deux FundingRounds sont des doublons potentiels
 */
export function areFundingRoundsSimilar(
  round1: { amount: number | null; date: Date | null; stage: string | null },
  round2: { amount: number | null; date: Date | null; stage: string | null },
  options: { amountTolerance?: number; daysTolerance?: number } = {}
): boolean {
  const { amountTolerance = 0.1, daysTolerance = 7 } = options

  // Si les montants sont connus, vérifier la tolérance
  if (round1.amount !== null && round2.amount !== null) {
    const minAmount = Math.min(round1.amount, round2.amount)
    const maxAmount = Math.max(round1.amount, round2.amount)
    const diff = (maxAmount - minAmount) / maxAmount

    if (diff > amountTolerance) return false
  }

  // Si les dates sont connues, vérifier la tolérance
  if (round1.date !== null && round2.date !== null) {
    const days = daysDiff(round1.date, round2.date)
    if (days > daysTolerance) return false
  }

  // Si les stages sont connus et différents, pas un doublon
  if (round1.stage !== null && round2.stage !== null) {
    if (normalizeStage(round1.stage) !== normalizeStage(round2.stage)) {
      return false
    }
  }

  return true
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Crée une erreur d'agent standardisée
 */
export function createAgentError(
  error: unknown,
  options: { itemId?: string; itemName?: string; phase?: string } = {}
): AgentError {
  const err = error instanceof Error ? error : new Error(String(error))

  return {
    message: err.message,
    stack: err.stack,
    itemId: options.itemId,
    itemName: options.itemName,
    phase: options.phase,
    timestamp: new Date(),
  }
}

/**
 * Wrapper pour exécuter une fonction avec timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}

/**
 * Retry une fonction avec backoff exponentiel
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; onRetry?: (attempt: number, error: Error) => void } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, onRetry } = options

  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1)
        onRetry?.(attempt, lastError)
        await sleep(delay)
      }
    }
  }

  throw lastError!
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// LOGGING
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
}

const RESET = '\x1b[0m'

/**
 * Logger pour les agents de maintenance
 */
export function createLogger(agentName: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString()
    const color = LOG_COLORS[level]
    const prefix = `${color}[${timestamp}] [${agentName}] [${level.toUpperCase()}]${RESET}`

    if (data) {
      console.log(prefix, message, JSON.stringify(data, null, 2))
    } else {
      console.log(prefix, message)
    }
  }

  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
    error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Traite un array en batches avec concurrence limitée
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: { batchSize?: number; onProgress?: (processed: number, total: number) => void } = {}
): Promise<R[]> {
  const { batchSize = 10, onProgress } = options
  const results: R[] = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map((item, idx) => processor(item, i + idx)))

    results.push(...batchResults)
    onProgress?.(Math.min(i + batchSize, items.length), items.length)
  }

  return results
}

/**
 * Traite un array en séquence avec délai optionnel
 */
export async function processSequential<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: { delayMs?: number; onProgress?: (processed: number, total: number) => void } = {}
): Promise<R[]> {
  const { delayMs = 0, onProgress } = options
  const results: R[] = []

  for (let i = 0; i < items.length; i++) {
    const result = await processor(items[i], i)
    results.push(result)
    onProgress?.(i + 1, items.length)

    if (delayMs > 0 && i < items.length - 1) {
      await sleep(delayMs)
    }
  }

  return results
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * État du circuit breaker pour un service
 */
interface CircuitBreakerState {
  failures: number
  lastFailure: Date | null
  isOpen: boolean
  openUntil: Date | null
  successCount: number
}

/**
 * Configuration du circuit breaker
 */
interface CircuitBreakerConfig {
  failureThreshold: number // Nombre de fails avant ouverture
  resetTimeoutMs: number // Temps avant de réessayer (half-open)
  successThreshold: number // Succès nécessaires pour fermer
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
  successThreshold: 2,
}

/**
 * État global des circuit breakers par service
 */
const circuitBreakers: Map<string, CircuitBreakerState> = new Map()

/**
 * Récupère ou initialise l'état d'un circuit breaker
 */
function getCircuitState(serviceName: string): CircuitBreakerState {
  let state = circuitBreakers.get(serviceName)
  if (!state) {
    state = {
      failures: 0,
      lastFailure: null,
      isOpen: false,
      openUntil: null,
      successCount: 0,
    }
    circuitBreakers.set(serviceName, state)
  }
  return state
}

/**
 * Vérifie si le circuit est ouvert (bloqué)
 * Retourne true si les appels doivent être bloqués
 */
export function isCircuitOpen(
  serviceName: string,
  config: Partial<CircuitBreakerConfig> = {}
): boolean {
  const state = getCircuitState(serviceName)
  const { resetTimeoutMs } = { ...DEFAULT_CIRCUIT_CONFIG, ...config }

  if (!state.isOpen) {
    return false
  }

  // Vérifier si le timeout est passé (half-open state)
  if (state.openUntil && new Date() >= state.openUntil) {
    // Passer en half-open: autoriser un essai
    return false
  }

  return true
}

/**
 * Enregistre un échec pour un service
 */
export function recordCircuitFailure(
  serviceName: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const state = getCircuitState(serviceName)
  const { failureThreshold, resetTimeoutMs } = { ...DEFAULT_CIRCUIT_CONFIG, ...config }

  state.failures++
  state.lastFailure = new Date()
  state.successCount = 0

  // Ouvrir le circuit si le seuil est atteint
  if (state.failures >= failureThreshold) {
    state.isOpen = true
    state.openUntil = new Date(Date.now() + resetTimeoutMs)
  }
}

/**
 * Enregistre un succès pour un service
 */
export function recordCircuitSuccess(
  serviceName: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const state = getCircuitState(serviceName)
  const { successThreshold } = { ...DEFAULT_CIRCUIT_CONFIG, ...config }

  state.successCount++

  // Fermer le circuit après suffisamment de succès
  if (state.successCount >= successThreshold) {
    state.failures = 0
    state.isOpen = false
    state.openUntil = null
  }
}

/**
 * Réinitialise le circuit breaker pour un service
 */
export function resetCircuitBreaker(serviceName: string): void {
  circuitBreakers.set(serviceName, {
    failures: 0,
    lastFailure: null,
    isOpen: false,
    openUntil: null,
    successCount: 0,
  })
}

/**
 * Récupère l'état actuel du circuit breaker (pour monitoring)
 */
export function getCircuitBreakerStatus(serviceName: string): {
  isOpen: boolean
  failures: number
  lastFailure: Date | null
  openUntil: Date | null
} {
  const state = getCircuitState(serviceName)
  return {
    isOpen: state.isOpen,
    failures: state.failures,
    lastFailure: state.lastFailure,
    openUntil: state.openUntil,
  }
}

/**
 * Wrapper pour exécuter une fonction avec circuit breaker
 */
export async function withCircuitBreaker<T>(
  serviceName: string,
  fn: () => Promise<T>,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  // Vérifier si le circuit est ouvert
  if (isCircuitOpen(serviceName, config)) {
    const state = getCircuitState(serviceName)
    throw new Error(
      `Circuit breaker open for ${serviceName}. Retry after ${state.openUntil?.toISOString()}`
    )
  }

  try {
    const result = await fn()
    recordCircuitSuccess(serviceName, config)
    return result
  } catch (error) {
    recordCircuitFailure(serviceName, config)
    throw error
  }
}

// ============================================================================
// CONTENT CHUNKING
// ============================================================================

/**
 * Représente un chunk de contenu avec ses métadonnées
 */
export interface ContentChunk {
  text: string
  index: number
  totalChunks: number
  sources: string[]
  charCount: number
  estimatedTokens: number
}

/**
 * Configuration du chunking
 */
interface ChunkingConfig {
  maxChunkLength: number // Longueur max par chunk (caractères)
  overlapLength: number // Overlap entre chunks
  separator: string // Séparateur entre sources
}

const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxChunkLength: 10000, // ~2500 tokens
  overlapLength: 500, // ~125 tokens d'overlap
  separator: '\n\n---\n\n',
}

/**
 * Découpe du contenu en chunks avec overlap
 * Préserve les limites des sources quand possible
 */
export function chunkContent(
  sources: Array<{ title: string; text: string }>,
  config: Partial<ChunkingConfig> = {}
): ContentChunk[] {
  const { maxChunkLength, overlapLength, separator } = {
    ...DEFAULT_CHUNKING_CONFIG,
    ...config,
  }

  // Préparer les sources formatées
  const formattedSources = sources.map((s) => ({
    title: s.title,
    formatted: `Source: ${s.title}\n${s.text}`,
  }))

  // Calculer la taille totale
  const totalLength = formattedSources.reduce((sum, s) => sum + s.formatted.length + separator.length, 0)

  // Si tout tient dans un chunk, retourner tel quel
  if (totalLength <= maxChunkLength) {
    const text = formattedSources.map((s) => s.formatted).join(separator)
    return [
      {
        text,
        index: 0,
        totalChunks: 1,
        sources: formattedSources.map((s) => s.title),
        charCount: text.length,
        estimatedTokens: Math.ceil(text.length / 4),
      },
    ]
  }

  // Sinon, découper intelligemment
  const chunks: ContentChunk[] = []
  let currentChunk: string[] = []
  let currentLength = 0
  let currentSources: string[] = []

  for (const source of formattedSources) {
    const sourceLength = source.formatted.length + separator.length

    // Si la source seule est trop grande, la découper
    if (sourceLength > maxChunkLength) {
      // Finir le chunk actuel s'il y en a un
      if (currentChunk.length > 0) {
        const text = currentChunk.join(separator)
        chunks.push({
          text,
          index: chunks.length,
          totalChunks: 0, // Sera mis à jour à la fin
          sources: [...currentSources],
          charCount: text.length,
          estimatedTokens: Math.ceil(text.length / 4),
        })
        currentChunk = []
        currentLength = 0
        currentSources = []
      }

      // Découper la source en morceaux
      const sourceChunks = splitLongText(source.formatted, maxChunkLength, overlapLength)
      for (const chunk of sourceChunks) {
        chunks.push({
          text: chunk,
          index: chunks.length,
          totalChunks: 0,
          sources: [source.title],
          charCount: chunk.length,
          estimatedTokens: Math.ceil(chunk.length / 4),
        })
      }
      continue
    }

    // Si ajouter cette source dépasse la limite, créer un nouveau chunk
    if (currentLength + sourceLength > maxChunkLength && currentChunk.length > 0) {
      const text = currentChunk.join(separator)
      chunks.push({
        text,
        index: chunks.length,
        totalChunks: 0,
        sources: [...currentSources],
        charCount: text.length,
        estimatedTokens: Math.ceil(text.length / 4),
      })

      // Nouveau chunk avec overlap (dernière source du chunk précédent)
      if (overlapLength > 0 && currentChunk.length > 0) {
        const lastSource = currentChunk[currentChunk.length - 1]
        if (lastSource.length <= overlapLength) {
          currentChunk = [lastSource]
          currentLength = lastSource.length
          currentSources = [currentSources[currentSources.length - 1]]
        } else {
          currentChunk = []
          currentLength = 0
          currentSources = []
        }
      } else {
        currentChunk = []
        currentLength = 0
        currentSources = []
      }
    }

    // Ajouter la source au chunk actuel
    currentChunk.push(source.formatted)
    currentLength += sourceLength
    currentSources.push(source.title)
  }

  // Ajouter le dernier chunk s'il reste du contenu
  if (currentChunk.length > 0) {
    const text = currentChunk.join(separator)
    chunks.push({
      text,
      index: chunks.length,
      totalChunks: 0,
      sources: [...currentSources],
      charCount: text.length,
      estimatedTokens: Math.ceil(text.length / 4),
    })
  }

  // Mettre à jour totalChunks
  for (const chunk of chunks) {
    chunk.totalChunks = chunks.length
  }

  return chunks
}

/**
 * Découpe un texte long en morceaux avec overlap
 */
function splitLongText(text: string, maxLength: number, overlap: number): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + maxLength

    // Essayer de couper à une limite de phrase/paragraphe
    if (end < text.length) {
      const searchStart = Math.max(start + maxLength - 200, start)
      const searchEnd = Math.min(start + maxLength + 200, text.length)
      const searchText = text.slice(searchStart, searchEnd)

      // Chercher un bon point de coupure
      const breakPoints = ['\n\n', '.\n', '. ', '\n']
      for (const bp of breakPoints) {
        const idx = searchText.lastIndexOf(bp)
        if (idx !== -1) {
          end = searchStart + idx + bp.length
          break
        }
      }
    } else {
      end = text.length
    }

    chunks.push(text.slice(start, end).trim())
    start = end - overlap

    // Éviter les boucles infinies
    if (start <= chunks.length * (maxLength - overlap) - maxLength) {
      start = end
    }
  }

  return chunks.filter((c) => c.length > 0)
}

/**
 * Estime le nombre de tokens d'un texte
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}
