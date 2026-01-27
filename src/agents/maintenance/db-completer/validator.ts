/**
 * DB_COMPLETER - Validator
 *
 * Valide les données extraites et met à jour la base de données.
 *
 * Améliorations:
 * - Validation activity_status avec patterns spécifiques (acquisition, shutdown)
 * - Pénalité de confidence si le LLM dit "acquired" mais pas de pattern trouvé
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { LLMExtractionResult } from '../types'
import { MAINTENANCE_CONSTANTS, INDUSTRY_TAXONOMY } from '../types'
import {
  normalizeCountry,
  normalizeStage,
  mapActivityToCompanyStatus,
  createLogger,
} from '../utils'

const logger = createLogger('DB_COMPLETER:validator')

// ============================================================================
// ACTIVITY STATUS VALIDATION PATTERNS
// ============================================================================

/**
 * Patterns pour détecter une acquisition
 * Le LLM peut dire "acquired" mais on vérifie que le texte confirme
 */
const ACQUISITION_PATTERNS = {
  fr: [
    /a été (racheté|acquis|acheté)e? par (.+)/i,
    /rachat(é|ée)? par (.+)/i,
    /fusion avec (.+)/i,
    /racheté(e)? par (.+) (en|pour|à hauteur de) /i,
    /acquis(e)? par (.+) (en|pour) (\d+|€|\$)/i,
    /cédé(e)? à (.+)/i,
    /repris(e)? par (.+)/i,
  ],
  en: [
    /acquired by (.+)/i,
    /bought by (.+)/i,
    /purchased by (.+)/i,
    /merger with (.+)/i,
    /merged with (.+)/i,
    /(was|has been|got) acquired/i,
    /acquisition by (.+)/i,
    /sold to (.+)/i,
    /taken over by (.+)/i,
  ],
}

/**
 * Patterns pour détecter un shutdown/fermeture
 */
const SHUTDOWN_PATTERNS = {
  fr: [
    /a fermé/i,
    /fermeture de/i,
    /liquidation/i,
    /cessation d'activité/i,
    /a cessé (son|ses) activité/i,
    /dépôt de bilan/i,
    /redressement judiciaire/i,
    /n'existe plus/i,
    /a mis la clé sous la porte/i,
  ],
  en: [
    /shut(ting)? down/i,
    /closed (down|its doors)/i,
    /ceased operations/i,
    /went (out of business|bankrupt)/i,
    /filed for bankruptcy/i,
    /no longer operat(ing|es)/i,
    /shuttered/i,
    /wound down/i,
    /discontinued/i,
    /out of business/i,
  ],
}

/**
 * Patterns pour détecter un pivot
 */
const PIVOT_PATTERNS = {
  fr: [
    /a pivoté/i,
    /pivot stratégique/i,
    /changement de direction/i,
    /nouvelle orientation/i,
    /rebaptisé(e)?/i,
    /devient (.+)/i,
    /se transforme en/i,
  ],
  en: [
    /pivoted to/i,
    /pivot(ed|ing)/i,
    /rebranded (as|to)/i,
    /changed direction/i,
    /transformed into/i,
    /now known as/i,
    /renamed to/i,
  ],
}

/**
 * Résultat de la validation du statut
 */
interface ActivityStatusValidation {
  status: LLMExtractionResult['activity_status']
  details: string | null
  confidence: number
  patternFound: boolean
  patternMatch?: string
}

/**
 * Valide le activity_status du LLM contre le contenu scrapé
 */
export function validateActivityStatus(
  llmStatus: LLMExtractionResult['activity_status'],
  llmDetails: string | null,
  scrapedContent: string | null
): ActivityStatusValidation {
  // Si pas de contenu scrapé, on trust le LLM avec pénalité
  if (!scrapedContent || scrapedContent.length < 50) {
    return {
      status: llmStatus,
      details: llmDetails,
      confidence: llmStatus ? 60 : 100, // Pénalité si statut sans contenu
      patternFound: false,
    }
  }

  const content = scrapedContent.toLowerCase()

  // Chercher les patterns selon le statut
  if (llmStatus === 'acquired') {
    const match = findPattern(scrapedContent, ACQUISITION_PATTERNS)
    if (match) {
      return {
        status: 'acquired',
        details: llmDetails || match.match,
        confidence: 100,
        patternFound: true,
        patternMatch: match.match,
      }
    }
    // LLM dit "acquired" mais pas de pattern → pénalité forte
    logger.debug('LLM says acquired but no pattern found, reducing confidence')
    return {
      status: llmStatus,
      details: llmDetails,
      confidence: 50, // -50% de confidence
      patternFound: false,
    }
  }

  if (llmStatus === 'shutdown') {
    const match = findPattern(scrapedContent, SHUTDOWN_PATTERNS)
    if (match) {
      return {
        status: 'shutdown',
        details: llmDetails || match.match,
        confidence: 100,
        patternFound: true,
        patternMatch: match.match,
      }
    }
    // LLM dit "shutdown" mais pas de pattern → pénalité
    return {
      status: llmStatus,
      details: llmDetails,
      confidence: 50,
      patternFound: false,
    }
  }

  if (llmStatus === 'pivoted') {
    const match = findPattern(scrapedContent, PIVOT_PATTERNS)
    if (match) {
      return {
        status: 'pivoted',
        details: llmDetails || match.match,
        confidence: 100,
        patternFound: true,
        patternMatch: match.match,
      }
    }
    return {
      status: llmStatus,
      details: llmDetails,
      confidence: 70, // Pénalité moindre pour pivot
      patternFound: false,
    }
  }

  // Si LLM dit "active", vérifier qu'il n'y a pas de pattern shutdown/acquired
  if (llmStatus === 'active' || llmStatus === null) {
    // Vérifier shutdown
    const shutdownMatch = findPattern(scrapedContent, SHUTDOWN_PATTERNS)
    if (shutdownMatch) {
      logger.info('LLM missed shutdown status, correcting', {
        pattern: shutdownMatch.match,
      })
      return {
        status: 'shutdown',
        details: shutdownMatch.match,
        confidence: 90,
        patternFound: true,
        patternMatch: shutdownMatch.match,
      }
    }

    // Vérifier acquisition
    const acquisitionMatch = findPattern(scrapedContent, ACQUISITION_PATTERNS)
    if (acquisitionMatch) {
      logger.info('LLM missed acquisition status, correcting', {
        pattern: acquisitionMatch.match,
      })
      return {
        status: 'acquired',
        details: acquisitionMatch.match,
        confidence: 90,
        patternFound: true,
        patternMatch: acquisitionMatch.match,
      }
    }

    // Pas de pattern problématique trouvé, on trust "active"
    return {
      status: llmStatus,
      details: llmDetails,
      confidence: 100,
      patternFound: false,
    }
  }

  // Fallback
  return {
    status: llmStatus,
    details: llmDetails,
    confidence: 100,
    patternFound: false,
  }
}

/**
 * Cherche un pattern dans le contenu
 */
function findPattern(
  content: string,
  patterns: { fr: RegExp[]; en: RegExp[] }
): { match: string; language: 'fr' | 'en' } | null {
  // Chercher en français
  for (const pattern of patterns.fr) {
    const match = content.match(pattern)
    if (match) {
      return {
        match: match[0],
        language: 'fr',
      }
    }
  }

  // Chercher en anglais
  for (const pattern of patterns.en) {
    const match = content.match(pattern)
    if (match) {
      return {
        match: match[0],
        language: 'en',
      }
    }
  }

  return null
}

// ============================================================================
// VALIDATION RESULT
// ============================================================================

interface ValidationResult {
  success: boolean
  fieldsUpdated: string[]
  errors?: string[]
}

/**
 * Valide les données extraites et met à jour la company
 *
 * @param companyId - ID de la company à mettre à jour
 * @param extraction - Résultat de l'extraction LLM
 * @param scrapedContent - Contenu scrapé pour validation activity_status (optionnel)
 */
export async function validateAndUpdate(
  companyId: string,
  extraction: LLMExtractionResult,
  scrapedContent?: string
): Promise<ValidationResult> {
  const errors: string[] = []
  const fieldsUpdated: string[] = []

  // Skip if confidence is too low
  if (extraction.confidence < MAINTENANCE_CONSTANTS.MIN_CONFIDENCE_THRESHOLD) {
    logger.warn(`Low confidence (${extraction.confidence}) for company ${companyId}`)
    return {
      success: false,
      fieldsUpdated: [],
      errors: [`Confidence too low: ${extraction.confidence}`],
    }
  }

  // Get current company data
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  })

  if (!company) {
    return {
      success: false,
      fieldsUpdated: [],
      errors: ['Company not found'],
    }
  }

  // Build update data - only update if new data is better
  const updateData: Record<string, unknown> = {}
  const previousData: Record<string, unknown> = {}

  // Industry
  if (
    extraction.industry &&
    INDUSTRY_TAXONOMY.includes(extraction.industry as typeof INDUSTRY_TAXONOMY[number])
  ) {
    if (!company.industry || company.industry !== extraction.industry) {
      previousData.industry = company.industry
      updateData.industry = extraction.industry
      fieldsUpdated.push('industry')
    }

    if (extraction.sub_industry && !company.subIndustry) {
      previousData.subIndustry = company.subIndustry
      updateData.subIndustry = extraction.sub_industry
      fieldsUpdated.push('subIndustry')
    }
  }

  // Description
  if (extraction.description && extraction.description.length > 20) {
    if (!company.description || extraction.description.length > company.description.length) {
      previousData.description = company.description
      updateData.description = extraction.description
      fieldsUpdated.push('description')
    }
  }

  // Tagline/shortDescription - one-liner pitch
  if (extraction.tagline && extraction.tagline.length > 5) {
    if (!company.shortDescription) {
      previousData.shortDescription = company.shortDescription
      updateData.shortDescription = extraction.tagline
      fieldsUpdated.push('tagline')  // Track as tagline in stats
    }
  }

  // Use cases - CRITICAL for competitor matching
  if (extraction.use_cases && extraction.use_cases.length > 0) {
    const currentUseCases = company.useCases || []
    const newUseCases = [...new Set([...currentUseCases, ...extraction.use_cases])]
    if (newUseCases.length > currentUseCases.length) {
      previousData.useCases = currentUseCases
      updateData.useCases = newUseCases
      fieldsUpdated.push('useCases')
    }
  }

  // Business model
  if (extraction.business_model && !company.businessModel) {
    previousData.businessModel = company.businessModel
    updateData.businessModel = extraction.business_model
    fieldsUpdated.push('businessModel')
  }

  // Target market
  if (extraction.target_market && !company.targetMarket) {
    previousData.targetMarket = company.targetMarket
    updateData.targetMarket = extraction.target_market
    fieldsUpdated.push('targetMarket')
  }

  // Headquarters
  if (extraction.headquarters_country) {
    const normalizedCountry = normalizeCountry(extraction.headquarters_country)
    if (normalizedCountry && !company.headquarters) {
      previousData.headquarters = company.headquarters
      updateData.headquarters = normalizedCountry
      fieldsUpdated.push('headquarters')
    }
  }

  if (extraction.headquarters_city && !company.city) {
    previousData.city = company.city
    updateData.city = extraction.headquarters_city
    fieldsUpdated.push('city')
  }

  // Founded year
  if (extraction.founded_year) {
    const year = extraction.founded_year
    const currentYear = new Date().getFullYear()

    if (year >= 1990 && year <= currentYear + 1 && !company.foundedYear) {
      previousData.foundedYear = company.foundedYear
      updateData.foundedYear = year
      fieldsUpdated.push('foundedYear')
    }
  }

  // Founders
  if (extraction.founders && extraction.founders.length > 0) {
    const currentFounders = company.founders as unknown[] | null
    if (!currentFounders || currentFounders.length === 0) {
      previousData.founders = currentFounders
      updateData.founders = extraction.founders
      fieldsUpdated.push('founders')
    }
  }

  // Employees
  if (extraction.employees && extraction.employees > 0 && !company.employeeCount) {
    previousData.employeeCount = company.employeeCount
    updateData.employeeCount = extraction.employees
    fieldsUpdated.push('employees')

    // Also set employee range
    updateData.employeeRange = getEmployeeRange(extraction.employees)
  }

  // Website
  if (extraction.website && isValidUrl(extraction.website) && !company.website) {
    previousData.website = company.website
    updateData.website = extraction.website
    fieldsUpdated.push('website')
  }

  // LinkedIn URL
  if (extraction.linkedin_url && isValidLinkedInUrl(extraction.linkedin_url) && !company.linkedinUrl) {
    previousData.linkedinUrl = company.linkedinUrl
    updateData.linkedinUrl = extraction.linkedin_url
    fieldsUpdated.push('linkedin')
  }

  // Competitors
  if (extraction.competitors && extraction.competitors.length > 0) {
    const currentCompetitors = company.competitors || []
    const newCompetitors = [...new Set([...currentCompetitors, ...extraction.competitors])]
    if (newCompetitors.length > currentCompetitors.length) {
      previousData.competitors = currentCompetitors
      updateData.competitors = newCompetitors
      fieldsUpdated.push('competitors')
    }
  }

  // Notable clients
  if (extraction.notable_clients && extraction.notable_clients.length > 0) {
    const currentClients = company.notableClients || []
    const newClients = [...new Set([...currentClients, ...extraction.notable_clients])]
    if (newClients.length > currentClients.length) {
      previousData.notableClients = currentClients
      updateData.notableClients = newClients
      fieldsUpdated.push('notableClients')
    }
  }

  // Is profitable
  if (extraction.is_profitable !== null && company.isProfitable === null) {
    previousData.isProfitable = company.isProfitable
    updateData.isProfitable = extraction.is_profitable
    fieldsUpdated.push('isProfitable')
  }

  // Activity status - with pattern validation
  const statusValidation = validateActivityStatus(
    extraction.activity_status,
    extraction.activity_status_details,
    scrapedContent || null
  )

  // Log if status was corrected
  if (statusValidation.patternFound && statusValidation.status !== extraction.activity_status) {
    logger.info(`Activity status corrected for company ${companyId}`, {
      llmStatus: extraction.activity_status,
      correctedStatus: statusValidation.status,
      patternMatch: statusValidation.patternMatch,
    })
  }

  // Apply status validation penalty to overall confidence
  if (!statusValidation.patternFound && statusValidation.confidence < 100) {
    // If status validation reduced confidence, log it
    logger.debug(`Activity status confidence penalty for company ${companyId}`, {
      originalConfidence: extraction.confidence,
      statusConfidence: statusValidation.confidence,
    })
  }

  // Update status if valid
  if (statusValidation.status) {
    const companyStatus = mapActivityToCompanyStatus(statusValidation.status)
    if (companyStatus && company.status === 'UNKNOWN') {
      // Only update if pattern was found OR LLM had high confidence
      const effectiveConfidence = Math.min(
        extraction.confidence,
        statusValidation.confidence
      )

      if (statusValidation.patternFound || effectiveConfidence >= MAINTENANCE_CONSTANTS.MIN_CONFIDENCE_THRESHOLD) {
        previousData.status = company.status
        updateData.status = companyStatus
        fieldsUpdated.push('status')

        if (statusValidation.details) {
          updateData.statusDetails = statusValidation.details
        }
        updateData.statusUpdatedAt = new Date()
      } else {
        logger.debug(`Skipping status update due to low confidence`, {
          status: statusValidation.status,
          confidence: effectiveConfidence,
        })
      }
    }
  }

  // Skip if nothing to update
  if (fieldsUpdated.length === 0) {
    return {
      success: true,
      fieldsUpdated: [],
      errors: ['No new data to update'],
    }
  }

  // Calculate new data quality score
  const newDataQuality = calculateDataQuality({
    ...company,
    ...updateData,
  })

  updateData.dataQuality = newDataQuality
  updateData.lastEnrichedAt = new Date()

  // Update company
  try {
    await prisma.company.update({
      where: { id: companyId },
      data: updateData,
    })

    // Log enrichment
    await prisma.companyEnrichment.create({
      data: {
        companyId,
        source: 'LLM_EXTRACTION',
        fieldsUpdated,
        previousData: previousData as Prisma.InputJsonValue,
        newData: {
          extraction: {
            confidence: extraction.confidence,
            data_completeness: extraction.data_completeness,
          },
          ...updateData,
        } as Prisma.InputJsonValue,
        confidence: extraction.confidence,
      },
    })

    logger.debug(`Updated company ${companyId}`, {
      fieldsUpdated,
      newQuality: newDataQuality,
    })

    // Also update related FundingRounds with tagline, useCases, businessModel, targetMarket
    await updateRelatedFundingRounds(companyId, extraction)

    return {
      success: true,
      fieldsUpdated,
    }
  } catch (error) {
    logger.error(`Failed to update company ${companyId}`, {
      error: error instanceof Error ? error.message : 'Unknown',
    })

    return {
      success: false,
      fieldsUpdated: [],
      errors: [error instanceof Error ? error.message : 'Update failed'],
    }
  }
}

/**
 * Calcule le score de qualité des données
 */
function calculateDataQuality(company: Record<string, unknown>): number {
  let score = 0

  // Essential fields (60 points)
  if (company.name) score += 5
  if (company.industry) score += 15
  if (company.description) score += 15
  if (company.headquarters) score += 10
  if (company.totalRaised) score += 15

  // Important fields (25 points)
  if (company.website) score += 5
  if (company.linkedinUrl) score += 3
  if (company.foundedYear) score += 5
  if (company.founders && Array.isArray(company.founders) && company.founders.length > 0) {
    score += 8
  }
  if (company.status && company.status !== 'UNKNOWN') score += 4

  // Bonus fields (15 points) - updated to include tagline and useCases
  if (company.employeeCount) score += 2
  if (company.businessModel) score += 2
  if (company.targetMarket) score += 2
  if (company.shortDescription) score += 2  // One-liner pitch (mapped from tagline)
  if (company.useCases && Array.isArray(company.useCases) && company.useCases.length > 0) {
    score += 4  // CRITICAL for competitor matching
  }
  if (company.competitors && Array.isArray(company.competitors) && company.competitors.length > 0) {
    score += 2
  }
  if (company.isProfitable !== null) score += 1

  return Math.min(score, 100)
}

/**
 * Vérifie si une URL est valide
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Vérifie si une URL LinkedIn company est valide
 */
function isValidLinkedInUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'linkedin.com' || parsed.hostname === 'www.linkedin.com') &&
      parsed.pathname.startsWith('/company/')
    )
  } catch {
    return false
  }
}

/**
 * Détermine la tranche d'employés
 */
function getEmployeeRange(count: number): string {
  if (count <= 10) return '1-10'
  if (count <= 50) return '11-50'
  if (count <= 200) return '51-200'
  if (count <= 500) return '201-500'
  if (count <= 1000) return '501-1000'
  return '1000+'
}

/**
 * Met à jour les FundingRounds associés avec les nouvelles données
 * (tagline, useCases, businessModel, targetMarket, linkedinUrl)
 *
 * Critique pour le matching de concurrents dans DB-EXPLOITATION-SPEC.md
 */
async function updateRelatedFundingRounds(
  companyId: string,
  extraction: LLMExtractionResult
): Promise<void> {
  try {
    // Get company to find its funding rounds via companySlug
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true },
    })

    if (!company?.slug) return

    // Find funding rounds for this company
    const fundingRounds = await prisma.fundingRound.findMany({
      where: { companySlug: company.slug },
      select: { id: true, tagline: true, useCases: true, businessModel: true, targetMarket: true, linkedinUrl: true },
    })

    if (fundingRounds.length === 0) return

    // Build update data for FundingRounds
    const frUpdateData: Record<string, unknown> = {}

    if (extraction.tagline && extraction.tagline.length > 5) {
      frUpdateData.tagline = extraction.tagline
    }

    if (extraction.use_cases && extraction.use_cases.length > 0) {
      frUpdateData.useCases = extraction.use_cases
    }

    if (extraction.business_model) {
      frUpdateData.businessModel = extraction.business_model
    }

    if (extraction.target_market) {
      frUpdateData.targetMarket = extraction.target_market
    }

    if (extraction.linkedin_url && isValidLinkedInUrl(extraction.linkedin_url)) {
      frUpdateData.linkedinUrl = extraction.linkedin_url
    }

    // Skip if nothing to update
    if (Object.keys(frUpdateData).length === 0) return

    // Update all funding rounds for this company
    for (const fr of fundingRounds) {
      // Only update if the field is currently empty
      const actualUpdate: Record<string, unknown> = {}

      if (frUpdateData.tagline && !fr.tagline) {
        actualUpdate.tagline = frUpdateData.tagline
      }
      if (frUpdateData.useCases && (!fr.useCases || fr.useCases.length === 0)) {
        actualUpdate.useCases = frUpdateData.useCases
      }
      if (frUpdateData.businessModel && !fr.businessModel) {
        actualUpdate.businessModel = frUpdateData.businessModel
      }
      if (frUpdateData.targetMarket && !fr.targetMarket) {
        actualUpdate.targetMarket = frUpdateData.targetMarket
      }
      if (frUpdateData.linkedinUrl && !fr.linkedinUrl) {
        actualUpdate.linkedinUrl = frUpdateData.linkedinUrl
      }

      if (Object.keys(actualUpdate).length > 0) {
        await prisma.fundingRound.update({
          where: { id: fr.id },
          data: actualUpdate,
        })
      }
    }

    logger.debug(`Updated ${fundingRounds.length} funding rounds for company ${companyId}`, {
      fields: Object.keys(frUpdateData),
    })
  } catch (error) {
    // Don't fail the whole enrichment if FundingRound update fails
    logger.warn(`Failed to update funding rounds for company ${companyId}`, {
      error: error instanceof Error ? error.message : 'Unknown',
    })
  }
}
