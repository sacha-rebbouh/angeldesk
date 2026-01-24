/**
 * DB_SOURCER - Article Parser
 *
 * Fonctions pour extraire les informations de levée de fonds depuis du texte/HTML
 */

import type { ParsedFunding } from '../types'
import { parseFundingAmount, stripHtml, normalizeStage, normalizeCountry } from '../utils'

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse un article de levée de fonds et extrait les données structurées
 */
export function parseArticle(
  title: string,
  content: string,
  sourceUrl: string,
  sourceName: string,
  publishDate?: Date
): ParsedFunding | null {
  const cleanTitle = stripHtml(title)
  const cleanContent = stripHtml(content)
  const fullText = `${cleanTitle} ${cleanContent}`.toLowerCase()

  // Detect if it's a funding article
  if (!isFundingArticle(fullText)) {
    return null
  }

  // Extract company name
  const companyName = extractCompanyName(cleanTitle, cleanContent)
  if (!companyName) {
    return null
  }

  // Extract amount
  const amountResult = extractAmount(fullText)

  // Extract stage
  const stage = extractStage(fullText)

  // Extract investors
  const investors = extractInvestors(fullText)
  const leadInvestor = investors.length > 0 ? investors[0] : null

  // Extract description
  const description = extractDescription(cleanContent, companyName)

  return {
    companyName,
    amount: amountResult?.amount ?? null,
    currency: amountResult?.currency ?? 'EUR',
    stage: normalizeStage(stage),
    investors,
    leadInvestor,
    date: publishDate || new Date(),
    sourceUrl,
    sourceName,
    description,
  }
}

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Détecte si un article parle d'une levée de fonds
 */
function isFundingArticle(text: string): boolean {
  const fundingKeywords = [
    // French
    'lève',
    'levée',
    'levée de fonds',
    'tour de table',
    'financement',
    'série a',
    'série b',
    'série c',
    'seed',
    'amorçage',
    'million',
    'millions',
    // English
    'raises',
    'raised',
    'funding',
    'funding round',
    'series a',
    'series b',
    'series c',
    'investment',
    'venture',
    'secures',
    'closes',
  ]

  return fundingKeywords.some((keyword) => text.includes(keyword))
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extrait le nom de la company depuis le titre ou le contenu
 */
function extractCompanyName(title: string, content: string): string | null {
  // Pattern 1: "Company lève X M€"
  const frenchPattern1 = /^([A-Z][A-Za-zÀ-ÿ0-9\s\-&.]+?)\s+(?:lève|annonce|boucle)/i
  const match1 = title.match(frenchPattern1)
  if (match1) return cleanCompanyName(match1[1])

  // Pattern 2: "Company raises $X million"
  const englishPattern1 = /^([A-Z][A-Za-z0-9\s\-&.]+?)\s+(?:raises|secures|closes|announces)/i
  const match2 = title.match(englishPattern1)
  if (match2) return cleanCompanyName(match2[1])

  // Pattern 3: "La startup Company..."
  const frenchPattern2 = /(?:la startup|la fintech|la healthtech|la proptech|la société)\s+([A-Z][A-Za-zÀ-ÿ0-9\s\-&.]+?)(?:\s+lève|\s+annonce|,)/i
  const match3 = (title + ' ' + content).match(frenchPattern2)
  if (match3) return cleanCompanyName(match3[1])

  // Pattern 4: Bold/strong tags in content (often company name)
  const boldPattern = /<(?:strong|b)>([A-Z][A-Za-zÀ-ÿ0-9\s\-&.]+?)<\/(?:strong|b)>/i
  const match4 = content.match(boldPattern)
  if (match4) return cleanCompanyName(match4[1])

  // Pattern 5: First capitalized word(s) in title
  const capitalizedPattern = /^([A-Z][A-Za-zÀ-ÿ]+(?:\s+[A-Z][A-Za-zÀ-ÿ]+)?)/
  const match5 = title.match(capitalizedPattern)
  if (match5) return cleanCompanyName(match5[1])

  return null
}

/**
 * Nettoie un nom de company
 */
function cleanCompanyName(name: string): string {
  return name
    .trim()
    .replace(/[,.:;!?]$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrait le montant de la levée
 */
function extractAmount(text: string): { amount: number; currency: string } | null {
  // Pattern: "lève X millions d'euros"
  const frenchMillions = text.match(/(\d+(?:[.,]\d+)?)\s*millions?\s*(?:d'euros?|€|eur)/i)
  if (frenchMillions) {
    return { amount: parseFloat(frenchMillions[1].replace(',', '.')) * 1_000_000, currency: 'EUR' }
  }

  // Pattern: "X M€"
  const shortEuro = text.match(/(\d+(?:[.,]\d+)?)\s*m€/i)
  if (shortEuro) {
    return { amount: parseFloat(shortEuro[1].replace(',', '.')) * 1_000_000, currency: 'EUR' }
  }

  // Pattern: "€X million" or "X million euros"
  const euroMillion = text.match(/€?\s*(\d+(?:[.,]\d+)?)\s*millions?\s*(?:euros?|€)?/i)
  if (euroMillion && (text.includes('€') || text.includes('euro'))) {
    return { amount: parseFloat(euroMillion[1].replace(',', '.')) * 1_000_000, currency: 'EUR' }
  }

  // Pattern: "raises $X million"
  const dollarMillion = text.match(/\$\s*(\d+(?:[.,]\d+)?)\s*(?:m|million)/i)
  if (dollarMillion) {
    return { amount: parseFloat(dollarMillion[1].replace(',', '.')) * 1_000_000, currency: 'USD' }
  }

  // Pattern: "X million dollars"
  const millionDollar = text.match(/(\d+(?:[.,]\d+)?)\s*millions?\s*(?:dollars?|\$|usd)/i)
  if (millionDollar) {
    return { amount: parseFloat(millionDollar[1].replace(',', '.')) * 1_000_000, currency: 'USD' }
  }

  // Fallback to general parser
  return parseFundingAmount(text)
}

/**
 * Extrait le stage de la levée
 */
function extractStage(text: string): string | null {
  const stagePatterns: Array<[RegExp, string]> = [
    [/(?:série|series)\s*a/i, 'series_a'],
    [/(?:série|series)\s*b/i, 'series_b'],
    [/(?:série|series)\s*c/i, 'series_c'],
    [/(?:série|series)\s*d/i, 'series_d'],
    [/pre[- ]?seed/i, 'pre_seed'],
    [/\bseed\b/i, 'seed'],
    [/amorçage/i, 'seed'],
    [/bridge/i, 'bridge'],
    [/growth/i, 'growth'],
    [/late[- ]?stage/i, 'late_stage'],
  ]

  for (const [pattern, stage] of stagePatterns) {
    if (pattern.test(text)) {
      return stage
    }
  }

  return null
}

/**
 * Extrait les investisseurs
 */
function extractInvestors(text: string): string[] {
  const investors: string[] = []

  // Pattern: "mené par X", "led by X"
  const leadPatterns = [
    /(?:mené|menée|lead|led)\s+(?:par|by)\s+([A-Z][A-Za-zÀ-ÿ0-9\s\-&.,]+?)(?:\.|,|avec|with|alongside|et|\band\b)/i,
    /(?:avec|with)\s+([A-Z][A-Za-zÀ-ÿ0-9\s\-&.]+?)(?:\s+en\s+lead|\s+comme\s+lead)/i,
  ]

  for (const pattern of leadPatterns) {
    const match = text.match(pattern)
    if (match) {
      const investorList = match[1].split(/,|\bet\b|\band\b/).map((s) => s.trim())
      for (const inv of investorList) {
        if (inv.length > 2 && !investors.includes(inv)) {
          investors.push(inv)
        }
      }
    }
  }

  // Pattern: "investisseurs: X, Y, Z"
  const listPatterns = [
    /investisseurs?\s*:?\s*([A-Z][A-Za-zÀ-ÿ0-9\s\-&.,]+?)(?:\.|$)/i,
    /investors?\s*(?:include|:)?\s*([A-Z][A-Za-zÀ-ÿ0-9\s\-&.,]+?)(?:\.|$)/i,
  ]

  for (const pattern of listPatterns) {
    const match = text.match(pattern)
    if (match) {
      const investorList = match[1].split(/,|\bet\b|\band\b/).map((s) => s.trim())
      for (const inv of investorList) {
        if (inv.length > 2 && !investors.includes(inv)) {
          investors.push(inv)
        }
      }
    }
  }

  // Clean up investor names
  return investors
    .map((inv) =>
      inv
        .replace(/[.,;:]$/, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((inv) => inv.length > 2 && inv.length < 100)
    .slice(0, 10) // Max 10 investors
}

/**
 * Extrait une description courte de l'activité
 */
function extractDescription(content: string, companyName: string): string | null {
  // Pattern: "Company, spécialisée dans X"
  const specializedPattern = new RegExp(
    `${escapeRegex(companyName)}[,\\s]+(?:spécialisée?|specialized?|qui propose|which offers|leader)\\s+(?:dans|in)?\\s+([^.]+)`,
    'i'
  )
  const match1 = content.match(specializedPattern)
  if (match1) return cleanDescription(match1[1])

  // Pattern: "Company est une startup qui..."
  const startupPattern = new RegExp(
    `${escapeRegex(companyName)}\\s+(?:est une?|is a)\\s+([^.]+?)(?:\\.|,|qui|that)`,
    'i'
  )
  const match2 = content.match(startupPattern)
  if (match2) return cleanDescription(match2[1])

  // Take first sentence if it contains the company name
  const sentences = content.split(/(?<=[.!?])\s+/)
  for (const sentence of sentences.slice(0, 3)) {
    if (sentence.toLowerCase().includes(companyName.toLowerCase()) && sentence.length < 300) {
      return cleanDescription(sentence)
    }
  }

  return null
}

/**
 * Nettoie une description
 */
function cleanDescription(desc: string): string {
  return desc
    .trim()
    .replace(/^[,.\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Échappe les caractères spéciaux pour regex
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================================
// RSS PARSING
// ============================================================================

interface RSSItem {
  title: string
  link: string
  pubDate?: string
  description?: string
  content?: string
}

/**
 * Parse un feed RSS
 */
export function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = []

  // Simple RSS parsing (could use a library for more robustness)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]

    const title = extractXmlTag(itemXml, 'title')
    const link = extractXmlTag(itemXml, 'link')
    const pubDate = extractXmlTag(itemXml, 'pubDate')
    const description = extractXmlTag(itemXml, 'description')
    const content = extractXmlTag(itemXml, 'content:encoded') || extractXmlTag(itemXml, 'content')

    if (title && link) {
      items.push({
        title: decodeHtmlEntities(title),
        link,
        pubDate,
        description: description ? decodeHtmlEntities(description) : undefined,
        content: content ? decodeHtmlEntities(content) : undefined,
      })
    }
  }

  return items
}

/**
 * Extrait le contenu d'un tag XML
 */
function extractXmlTag(xml: string, tagName: string): string | undefined {
  // Try CDATA first
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`, 'i')
  const cdataMatch = xml.match(cdataRegex)
  if (cdataMatch) return cdataMatch[1].trim()

  // Then regular content
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim() : undefined
}

/**
 * Décode les entités HTML
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
