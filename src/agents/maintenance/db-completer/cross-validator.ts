/**
 * DB_COMPLETER - Cross Validator
 *
 * Validation croisée des données extraites via plusieurs sources
 * Pour éviter les hallucinations du LLM et augmenter la fiabilité
 */

import type { LLMExtractionResult, WebSearchResult } from '../types'
import { createLogger, combinedSimilarity } from '../utils'
import { searchCompany, searchDuckDuckGo } from './web-search'
import { scrapeUrls } from './scraper'
import { extractWithLLM } from './llm-extract'

const logger = createLogger('DB_COMPLETER:cross-validator')

// ============================================================================
// TYPES
// ============================================================================

export interface CrossValidationResult {
  /** Validated/merged data */
  data: LLMExtractionResult
  /** Confidence score after cross-validation (0-100) */
  confidence: number
  /** Whether data was cross-validated by multiple sources */
  crossValidated: boolean
  /** Agreement score between sources (0-1) */
  agreementScore: number
  /** Number of sources that contributed data */
  sourceCount: number
  /** Sources used for validation */
  sources: string[]
  /** Fields that were validated by 2+ sources */
  validatedFields: string[]
  /** Fields with conflicting values */
  conflictingFields: string[]
}

interface SourceExtraction {
  source: string
  data: Partial<LLMExtractionResult>
  confidence: number
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Enrichit une company avec validation croisée multi-sources
 */
export async function enrichWithCrossValidation(
  companyName: string,
  existingSourceUrl?: string
): Promise<CrossValidationResult> {
  logger.info(`Starting cross-validation for "${companyName}"`)

  // Step 1: Gather data from multiple sources in parallel
  const [braveResults, ddgResults] = await Promise.all([
    searchCompany(companyName).catch(() => [] as WebSearchResult[]),
    searchDuckDuckGo(companyName).catch(() => [] as WebSearchResult[]),
  ])

  // Combine search results (deduplicate by URL)
  const allSearchResults = deduplicateByUrl([...braveResults, ...ddgResults])

  // Add existing source URL if available
  const urlsToScrape = [
    ...(existingSourceUrl ? [existingSourceUrl] : []),
    ...allSearchResults.slice(0, 4).map((r) => r.url),
  ].slice(0, 5) // Max 5 URLs

  logger.debug(`Scraping ${urlsToScrape.length} URLs for "${companyName}"`)

  // Step 2: Scrape all URLs in parallel
  const scrapedContent = await scrapeUrls(urlsToScrape)
  const successfulScrapes = scrapedContent.filter((s) => s.success)

  if (successfulScrapes.length === 0) {
    logger.warn(`No successful scrapes for "${companyName}"`)
    return createEmptyResult(companyName)
  }

  // Step 3: Extract from each source separately
  const extractions: SourceExtraction[] = []

  // Group scrapes into 2-3 source groups for separate LLM extractions
  const sourceGroups = groupSources(successfulScrapes, 2)

  for (let i = 0; i < sourceGroups.length; i++) {
    const group = sourceGroups[i]
    const combinedContent = group
      .map((s) => `Source: ${s.title}\n${s.text}`)
      .join('\n\n---\n\n')

    try {
      const response = await extractWithLLM(companyName, combinedContent)
      if (response.result) {
        extractions.push({
          source: `group_${i + 1}`,
          data: response.result,
          confidence: response.result.confidence,
        })
      }
    } catch (error) {
      logger.warn(`Extraction failed for group ${i + 1}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      })
    }
  }

  if (extractions.length === 0) {
    logger.warn(`All extractions failed for "${companyName}"`)
    return createEmptyResult(companyName)
  }

  // Step 4: Cross-validate and merge results
  const validationResult = crossValidateExtractions(extractions, companyName)

  logger.info(`Cross-validation complete for "${companyName}"`, {
    sourceCount: extractions.length,
    agreementScore: validationResult.agreementScore,
    validatedFields: validationResult.validatedFields.length,
    conflictingFields: validationResult.conflictingFields.length,
  })

  return validationResult
}

// ============================================================================
// VALIDATION LOGIC
// ============================================================================

/**
 * Cross-validate multiple extractions and merge into a single result
 */
function crossValidateExtractions(
  extractions: SourceExtraction[],
  companyName: string
): CrossValidationResult {
  if (extractions.length === 1) {
    // Single source - no cross-validation possible
    return {
      data: extractions[0].data as LLMExtractionResult,
      confidence: Math.round(extractions[0].confidence * 0.8), // Penalize single source
      crossValidated: false,
      agreementScore: 1,
      sourceCount: 1,
      sources: [extractions[0].source],
      validatedFields: [],
      conflictingFields: [],
    }
  }

  // Initialize merged result
  const merged: Partial<LLMExtractionResult> = {
    company_name: companyName,
    founders: [],
    investors: [],
    competitors: [],
    notable_clients: [],
  }

  const validatedFields: string[] = []
  const conflictingFields: string[] = []
  let agreementCount = 0
  let totalComparisons = 0

  // Fields to cross-validate
  const fieldsToValidate: Array<{
    key: keyof LLMExtractionResult
    compare: (a: unknown, b: unknown) => boolean
    merge: (values: unknown[]) => unknown
  }> = [
    {
      key: 'industry',
      compare: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
      merge: (values) => mostCommonValue(values as string[]),
    },
    {
      key: 'activity_status',
      compare: (a, b) => a === b,
      merge: (values) => mostCommonValue(values as string[]),
    },
    {
      key: 'headquarters_country',
      compare: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
      merge: (values) => mostCommonValue(values as string[]),
    },
    {
      key: 'founded_year',
      compare: (a, b) => a === b,
      merge: (values) => mostCommonValue(values as number[]),
    },
    {
      key: 'business_model',
      compare: (a, b) => a === b,
      merge: (values) => mostCommonValue(values as string[]),
    },
    {
      key: 'target_market',
      compare: (a, b) => a === b,
      merge: (values) => mostCommonValue(values as string[]),
    },
    {
      key: 'website',
      compare: (a, b) => normalizeUrl(String(a)) === normalizeUrl(String(b)),
      merge: (values) => values[0], // Take first valid URL
    },
    {
      key: 'is_profitable',
      compare: (a, b) => a === b,
      merge: (values) => mostCommonValue(values as boolean[]),
    },
  ]

  // Cross-validate each field
  for (const field of fieldsToValidate) {
    const values = extractions
      .map((e) => e.data[field.key])
      .filter((v) => v !== null && v !== undefined)

    if (values.length === 0) continue

    totalComparisons++

    if (values.length === 1) {
      // Single value - use it but don't mark as validated
      merged[field.key] = values[0] as never
    } else {
      // Multiple values - check agreement
      let agreed = true
      for (let i = 1; i < values.length; i++) {
        if (!field.compare(values[0], values[i])) {
          agreed = false
          break
        }
      }

      if (agreed) {
        agreementCount++
        validatedFields.push(field.key)
        merged[field.key] = values[0] as never
      } else {
        conflictingFields.push(field.key)
        // Use most common value for conflicts
        merged[field.key] = field.merge(values) as never
      }
    }
  }

  // Merge arrays (founders, investors, competitors)
  merged.founders = mergeFounders(
    extractions.map((e) => e.data.founders || [])
  )
  merged.investors = mergeStringArrays(
    extractions.map((e) => e.data.investors || [])
  )
  merged.competitors = mergeStringArrays(
    extractions.map((e) => e.data.competitors || [])
  )
  merged.notable_clients = mergeStringArrays(
    extractions.map((e) => e.data.notable_clients || [])
  )

  // Validate array fields
  if (merged.founders.length > 0 && extractions.filter((e) => (e.data.founders?.length || 0) > 0).length > 1) {
    validatedFields.push('founders')
  }
  if (merged.investors.length > 0 && extractions.filter((e) => (e.data.investors?.length || 0) > 0).length > 1) {
    validatedFields.push('investors')
  }

  // Use first non-null value for remaining fields
  for (const extraction of extractions) {
    if (!merged.description && extraction.data.description) {
      merged.description = extraction.data.description
    }
    if (!merged.activity_status_details && extraction.data.activity_status_details) {
      merged.activity_status_details = extraction.data.activity_status_details
    }
    if (!merged.headquarters_city && extraction.data.headquarters_city) {
      merged.headquarters_city = extraction.data.headquarters_city
    }
    if (!merged.sub_industry && extraction.data.sub_industry) {
      merged.sub_industry = extraction.data.sub_industry
    }
    if (!merged.employees && extraction.data.employees) {
      merged.employees = extraction.data.employees
    }
    if (!merged.total_raised && extraction.data.total_raised) {
      merged.total_raised = extraction.data.total_raised
    }
    if (!merged.last_round_amount && extraction.data.last_round_amount) {
      merged.last_round_amount = extraction.data.last_round_amount
    }
    if (!merged.last_round_stage && extraction.data.last_round_stage) {
      merged.last_round_stage = extraction.data.last_round_stage
    }
  }

  // Calculate agreement score
  const agreementScore = totalComparisons > 0 ? agreementCount / totalComparisons : 0

  // Calculate confidence (boost for validated fields, penalize conflicts)
  const baseConfidence =
    extractions.reduce((sum, e) => sum + e.confidence, 0) / extractions.length
  const validationBonus = validatedFields.length * 3
  const conflictPenalty = conflictingFields.length * 5
  const crossValidationBonus = extractions.length > 1 ? 10 : 0

  const confidence = Math.min(
    100,
    Math.max(0, baseConfidence + validationBonus - conflictPenalty + crossValidationBonus)
  )

  // Calculate data completeness
  const completenessFields = [
    merged.industry,
    merged.description,
    merged.activity_status,
    merged.headquarters_country,
    merged.founded_year,
    merged.website,
    (merged.founders?.length || 0) > 0,
    (merged.investors?.length || 0) > 0,
    merged.business_model,
    merged.target_market,
  ]
  const data_completeness = Math.round(
    (completenessFields.filter(Boolean).length / completenessFields.length) * 100
  )

  return {
    data: {
      ...merged,
      confidence: Math.round(confidence),
      data_completeness,
    } as LLMExtractionResult,
    confidence: Math.round(confidence),
    crossValidated: validatedFields.length > 0,
    agreementScore,
    sourceCount: extractions.length,
    sources: extractions.map((e) => e.source),
    validatedFields,
    conflictingFields,
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEmptyResult(companyName: string): CrossValidationResult {
  return {
    data: {
      company_name: companyName,
      activity_status: null,
      activity_status_details: null,
      industry: null,
      sub_industry: null,
      description: null,
      business_model: null,
      target_market: null,
      headquarters_country: null,
      headquarters_city: null,
      founded_year: null,
      founders: [],
      employees: null,
      total_raised: null,
      last_round_amount: null,
      last_round_stage: null,
      investors: [],
      competitors: [],
      notable_clients: [],
      website: null,
      linkedin_url: null,
      is_profitable: null,
      confidence: 0,
      data_completeness: 0,
    },
    confidence: 0,
    crossValidated: false,
    agreementScore: 0,
    sourceCount: 0,
    sources: [],
    validatedFields: [],
    conflictingFields: [],
  }
}

function deduplicateByUrl(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>()
  return results.filter((r) => {
    const normalized = normalizeUrl(r.url)
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/$/, '')
  } catch {
    return url.toLowerCase()
  }
}

function groupSources<T>(items: T[], minGroupSize: number): T[][] {
  if (items.length <= minGroupSize) {
    return [items]
  }

  // Split into 2-3 groups
  const groupCount = Math.min(3, Math.ceil(items.length / minGroupSize))
  const groupSize = Math.ceil(items.length / groupCount)

  const groups: T[][] = []
  for (let i = 0; i < items.length; i += groupSize) {
    groups.push(items.slice(i, i + groupSize))
  }

  return groups
}

function mostCommonValue<T>(values: T[]): T {
  const counts = new Map<T, number>()
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1)
  }

  let maxCount = 0
  let mostCommon = values[0]
  for (const [value, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      mostCommon = value
    }
  }

  return mostCommon
}

function mergeFounders(
  founderLists: Array<Array<{ name: string; role: string | null }>>
): Array<{ name: string; role: string | null }> {
  const seen = new Map<string, { name: string; role: string | null }>()

  for (const founders of founderLists) {
    for (const founder of founders) {
      const key = founder.name.toLowerCase().trim()
      if (!seen.has(key)) {
        seen.set(key, founder)
      } else if (!seen.get(key)!.role && founder.role) {
        // Update with role if we found one
        seen.set(key, founder)
      }
    }
  }

  return Array.from(seen.values())
}

function mergeStringArrays(arrays: string[][]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const arr of arrays) {
    for (const item of arr) {
      const normalized = item.toLowerCase().trim()
      if (!seen.has(normalized) && item.length > 1) {
        seen.add(normalized)
        result.push(item)
      }
    }
  }

  return result
}
