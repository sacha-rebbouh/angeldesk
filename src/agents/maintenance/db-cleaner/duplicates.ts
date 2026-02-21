/**
 * DB_CLEANER - Deduplication Logic
 *
 * Fonctions pour détecter et fusionner les doublons
 * Utilise des algorithmes avancés: Levenshtein, Jaro-Winkler, Soundex, Double Metaphone
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import {
  normalizeCompanyName,
  combinedSimilarity,
  areFundingRoundsSimilar,
  createLogger,
  type SimilarityDetails,
} from '../utils'
import {
  MAINTENANCE_CONSTANTS,
  type PlannedCompanyMerge,
  type PlannedFundingRoundMerge,
  type SimilarityScore,
  type MergeResult,
} from '../types'

const logger = createLogger('DB_CLEANER:duplicates')

// ============================================================================
// TYPES
// ============================================================================

interface DeduplicationResult {
  merged: number
  candidates: number
  mergeResults?: MergeResult[]
}

interface DeduplicationPlanResult {
  candidates: number
  plannedMerges: PlannedCompanyMerge[]
}

interface FundingRoundPlanResult {
  candidates: number
  plannedMerges: PlannedFundingRoundMerge[]
}

type CompanyWithRelations = Prisma.CompanyGetPayload<{
  select: {
    id: true
    name: true
    slug: true
    headquarters: true
    industry: true
    subIndustry: true
    description: true
    shortDescription: true
    website: true
    linkedinUrl: true
    crunchbaseUrl: true
    founders: true
    totalRaised: true
    lastValuation: true
    lastRoundStage: true
    lastRoundDate: true
    businessModel: true
    targetMarket: true
    city: true
    region: true
    foundedYear: true
    employeeCount: true
    employeeRange: true
    status: true
    statusDetails: true
    competitors: true
    notableClients: true
    aliases: true
    dataQuality: true
    _count: { select: { fundingRounds: true; enrichments: true } }
  }
}>

// ============================================================================
// COMPANY DEDUPLICATION
// ============================================================================

/**
 * Détecte les doublons sans les fusionner (mode dry-run)
 */
export async function planCompanyDeduplication(): Promise<DeduplicationPlanResult> {
  const companies = await fetchCompaniesForDedup()
  const slugGroups = groupCompaniesBySlug(companies)
  const plannedMerges: PlannedCompanyMerge[] = []

  for (const [, group] of slugGroups) {
    if (group.length < 2) continue

    const duplicates = findDuplicatesInGroup(group)
    for (const dup of duplicates) {
      plannedMerges.push(dup)
    }
  }

  return {
    candidates: plannedMerges.length,
    plannedMerges,
  }
}

/**
 * Détecte et fusionne les companies en doublon
 *
 * Algorithme:
 * 1. Normaliser les noms pour créer des slugs
 * 2. Grouper par slug
 * 3. Pour chaque groupe > 1: vérifier la similarité avec algorithmes combinés
 * 4. Fusionner vers l'entrée avec le plus de données
 * 5. Logger chaque fusion dans CompanyMergeLog
 */
export async function deduplicateCompanies(
  options: { dryRun?: boolean; maintenanceRunId?: string } = {}
): Promise<DeduplicationResult> {
  const { dryRun = false, maintenanceRunId } = options

  if (dryRun) {
    const plan = await planCompanyDeduplication()
    return { merged: 0, candidates: plan.candidates }
  }

  let merged = 0
  let candidates = 0
  const mergeResults: MergeResult[] = []

  const companies = await fetchCompaniesForDedup()
  const slugGroups = groupCompaniesBySlug(companies)

  for (const [, group] of slugGroups) {
    if (group.length < 2) continue

    const duplicatePairs = findDuplicatesInGroup(group)
    candidates += duplicatePairs.length

    const mergedIds = new Set<string>()

    for (const dup of duplicatePairs) {
      if (mergedIds.has(dup.mergeId) || mergedIds.has(dup.keepId)) continue

      try {
        const result = await mergeCompanies(dup.keepId, dup.mergeId, {
          similarity: dup.similarity,
          reason: dup.reason,
          maintenanceRunId,
        })
        mergedIds.add(dup.mergeId)
        merged++
        mergeResults.push(result)

        logger.info(`Merged company "${dup.mergeName}" into "${dup.keepName}"`, {
          similarity: dup.similarity.combined.toFixed(3),
          mergeLogId: result.mergeLogId,
        })
      } catch (error) {
        logger.error(`Failed to merge companies`, {
          keep: dup.keepId,
          merge: dup.mergeId,
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }
  }

  logger.info(`Company deduplication complete`, { candidates, merged })
  return { merged, candidates, mergeResults }
}

/**
 * Fetch companies with necessary relations for deduplication
 * Uses batching to prevent memory exhaustion
 */
const DEDUP_BATCH_SIZE = 1000;

async function fetchCompaniesForDedup(): Promise<CompanyWithRelations[]> {
  const allCompanies: CompanyWithRelations[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const batch: CompanyWithRelations[] = await prisma.company.findMany({
      take: DEDUP_BATCH_SIZE,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      select: {
        id: true,
        name: true,
        slug: true,
        headquarters: true,
        industry: true,
        subIndustry: true,
        description: true,
        shortDescription: true,
        website: true,
        linkedinUrl: true,
        crunchbaseUrl: true,
        founders: true,
        totalRaised: true,
        lastValuation: true,
        lastRoundStage: true,
        lastRoundDate: true,
        businessModel: true,
        targetMarket: true,
        city: true,
        region: true,
        foundedYear: true,
        employeeCount: true,
        employeeRange: true,
        status: true,
        statusDetails: true,
        competitors: true,
        notableClients: true,
        aliases: true,
        dataQuality: true,
        _count: {
          select: { fundingRounds: true, enrichments: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    allCompanies.push(...batch);

    if (batch.length < DEDUP_BATCH_SIZE) {
      hasMore = false;
    } else {
      cursor = batch[batch.length - 1].id;
    }
  }

  return allCompanies;
}

/**
 * Group companies by normalized slug
 */
function groupCompaniesBySlug(
  companies: CompanyWithRelations[]
): Map<string, CompanyWithRelations[]> {
  const slugGroups = new Map<string, CompanyWithRelations[]>()

  for (const company of companies) {
    const normalizedSlug = normalizeCompanyName(company.name)

    if (!slugGroups.has(normalizedSlug)) {
      slugGroups.set(normalizedSlug, [])
    }
    slugGroups.get(normalizedSlug)!.push(company)
  }

  return slugGroups
}

/**
 * Find duplicates within a group of companies with similar slugs
 */
function findDuplicatesInGroup(group: CompanyWithRelations[]): PlannedCompanyMerge[] {
  const duplicates: PlannedCompanyMerge[] = []

  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const c1 = group[i]
      const c2 = group[j]

      // Calculate combined similarity using multiple algorithms
      const similarity = combinedSimilarity(c1.name, c2.name)
      const sameCountry = c1.headquarters && c2.headquarters && c1.headquarters === c2.headquarters

      // High confidence duplicate check
      const isDuplicate =
        similarity.combined >= MAINTENANCE_CONSTANTS.DUPLICATE_SIMILARITY_THRESHOLD ||
        (similarity.combined >= 0.8 && sameCountry) ||
        similarity.normalizedMatch

      if (isDuplicate) {
        // Determine which to keep (more data = keep)
        const score1 = calculateCompanyDataScore(c1)
        const score2 = calculateCompanyDataScore(c2)

        const [keep, merge] = score1 >= score2 ? [c1, c2] : [c2, c1]

        const reason = buildMergeReason(similarity, sameCountry || false)
        const fieldsToTransfer = getFieldsToTransfer(keep, merge)

        duplicates.push({
          keepId: keep.id,
          keepName: keep.name,
          mergeId: merge.id,
          mergeName: merge.name,
          similarity: toSimilarityScore(similarity),
          fieldsToTransfer,
          fundingRoundsToTransfer: merge._count.fundingRounds,
          enrichmentsToTransfer: merge._count.enrichments,
          reason,
        })
      }
    }
  }

  return duplicates
}

/**
 * Convert SimilarityDetails to SimilarityScore (for types)
 */
function toSimilarityScore(details: SimilarityDetails): SimilarityScore {
  return {
    combined: details.combined,
    levenshtein: details.levenshtein,
    jaroWinkler: details.jaroWinkler,
    phonetic: details.phonetic,
    normalizedMatch: details.normalizedMatch,
  }
}

/**
 * Build a human-readable reason for the merge
 */
function buildMergeReason(similarity: SimilarityDetails, sameCountry: boolean | null): string {
  const reasons: string[] = []

  if (similarity.normalizedMatch) {
    reasons.push('exact normalized name match')
  }

  if (similarity.jaroWinkler >= 0.95) {
    reasons.push(`very high Jaro-Winkler (${(similarity.jaroWinkler * 100).toFixed(0)}%)`)
  } else if (similarity.jaroWinkler >= 0.85) {
    reasons.push(`high Jaro-Winkler (${(similarity.jaroWinkler * 100).toFixed(0)}%)`)
  }

  if (similarity.phonetic >= 0.8) {
    reasons.push('phonetically similar')
  }

  if (sameCountry) {
    reasons.push('same country')
  }

  return reasons.length > 0 ? reasons.join(', ') : `combined similarity ${(similarity.combined * 100).toFixed(0)}%`
}

/**
 * Get list of fields that would be transferred from merge to keep
 */
function getFieldsToTransfer(keep: CompanyWithRelations, merge: CompanyWithRelations): string[] {
  const fields: string[] = []

  if (!keep.description && merge.description) fields.push('description')
  if (!keep.shortDescription && merge.shortDescription) fields.push('shortDescription')
  if (!keep.website && merge.website) fields.push('website')
  if (!keep.linkedinUrl && merge.linkedinUrl) fields.push('linkedinUrl')
  if (!keep.crunchbaseUrl && merge.crunchbaseUrl) fields.push('crunchbaseUrl')
  if (!keep.industry && merge.industry) fields.push('industry')
  if (!keep.subIndustry && merge.subIndustry) fields.push('subIndustry')
  if (!keep.headquarters && merge.headquarters) fields.push('headquarters')
  if (!keep.city && merge.city) fields.push('city')
  if (!keep.region && merge.region) fields.push('region')
  if (!keep.foundedYear && merge.foundedYear) fields.push('foundedYear')
  if (!keep.employeeCount && merge.employeeCount) fields.push('employeeCount')
  if (!keep.employeeRange && merge.employeeRange) fields.push('employeeRange')
  if (!keep.businessModel && merge.businessModel) fields.push('businessModel')
  if (!keep.targetMarket && merge.targetMarket) fields.push('targetMarket')
  if (!keep.totalRaised && merge.totalRaised) fields.push('totalRaised')
  if (!keep.lastValuation && merge.lastValuation) fields.push('lastValuation')

  // Founders merge
  const keepFounders = (keep.founders as unknown[]) || []
  const mergeFounders = (merge.founders as unknown[]) || []
  if (mergeFounders.length > 0 && keepFounders.length === 0) {
    fields.push('founders')
  }

  return fields
}

/**
 * Calcule un score de "complétude" pour une company
 */
function calculateCompanyDataScore(company: CompanyWithRelations): number {
  let score = 0

  if (company.industry) score += 2
  if (company.description) score += 2
  if (company.website) score += 1
  if (company.founders && Array.isArray(company.founders) && company.founders.length > 0) score += 2
  if (company.totalRaised) score += 2
  if (company.dataQuality) score += company.dataQuality / 20 // 0-5 points
  score += company._count.fundingRounds * 0.5 // More rounds = more data
  score += company._count.enrichments * 0.3 // More enrichments = more data

  return score
}

/**
 * Fusionne deux companies avec audit trail complet
 */
async function mergeCompanies(
  keepId: string,
  mergeId: string,
  options: {
    similarity: SimilarityScore
    reason: string
    maintenanceRunId?: string
  }
): Promise<MergeResult> {
  return prisma.$transaction(async (tx) => {
    // Get both companies with full data
    const [keep, merge] = await Promise.all([
      tx.company.findUnique({ where: { id: keepId } }),
      tx.company.findUnique({ where: { id: mergeId } }),
    ])

    if (!keep || !merge) {
      throw new Error('Companies not found')
    }

    // Capture before state for audit
    const beforeState = {
      keep: { ...keep },
      merge: { ...merge },
    }

    // Build updates: fill missing fields from merge into keep
    const updates: Record<string, unknown> = {}
    const fieldsUpdated: string[] = []

    const fieldsToCheck = [
      'description',
      'shortDescription',
      'website',
      'linkedinUrl',
      'crunchbaseUrl',
      'industry',
      'subIndustry',
      'headquarters',
      'city',
      'region',
      'foundedYear',
      'employeeCount',
      'employeeRange',
      'businessModel',
      'targetMarket',
      'totalRaised',
      'lastValuation',
      'lastRoundStage',
      'lastRoundDate',
      'status',
      'statusDetails',
    ] as const

    for (const field of fieldsToCheck) {
      if (!keep[field] && merge[field]) {
        updates[field] = merge[field]
        fieldsUpdated.push(field)
      }
    }

    // Merge founders arrays
    if (merge.founders && Array.isArray(merge.founders)) {
      const keepFounders = (keep.founders as unknown[]) || []
      const mergeFounders = merge.founders as unknown[]
      const combined = [...keepFounders, ...mergeFounders]
      // Deduplicate by name
      const unique = Array.from(
        new Map(combined.map((f: unknown) => [(f as { name: string }).name, f])).values()
      )
      if (unique.length > keepFounders.length) {
        updates.founders = unique
        fieldsUpdated.push('founders')
      }
    }

    // Merge competitors
    if (merge.competitors && merge.competitors.length > 0) {
      const allCompetitors = new Set([...(keep.competitors || []), ...merge.competitors])
      if (allCompetitors.size > (keep.competitors?.length || 0)) {
        updates.competitors = Array.from(allCompetitors)
        fieldsUpdated.push('competitors')
      }
    }

    // Merge notable clients
    if (merge.notableClients && merge.notableClients.length > 0) {
      const allClients = new Set([...(keep.notableClients || []), ...merge.notableClients])
      if (allClients.size > (keep.notableClients?.length || 0)) {
        updates.notableClients = Array.from(allClients)
        fieldsUpdated.push('notableClients')
      }
    }

    // Merge aliases
    const allAliases = new Set([
      ...(keep.aliases || []),
      ...(merge.aliases || []),
      merge.name, // Add merged company name as alias
    ])
    updates.aliases = Array.from(allAliases)

    // Count transfers
    const [fundingRoundsCount, enrichmentsCount] = await Promise.all([
      tx.fundingRound.count({ where: { companyId: mergeId } }),
      tx.companyEnrichment.count({ where: { companyId: mergeId } }),
    ])

    // Transfer funding rounds
    await tx.fundingRound.updateMany({
      where: { companyId: mergeId },
      data: { companyId: keepId },
    })

    // Transfer enrichments
    await tx.companyEnrichment.updateMany({
      where: { companyId: mergeId },
      data: { companyId: keepId },
    })

    // Update keep company
    if (Object.keys(updates).length > 0) {
      await tx.company.update({
        where: { id: keepId },
        data: updates,
      })
    }

    // Capture after state
    const afterState = await tx.company.findUnique({ where: { id: keepId } })

    // Create audit log entry
    const mergeLog = await tx.companyMergeLog.create({
      data: {
        mergedFromId: mergeId,
        mergedIntoId: keepId,
        mergedFromName: merge.name,
        mergedIntoName: keep.name,
        beforeState: beforeState as object,
        afterState: afterState as object,
        fieldsTransferred: fieldsUpdated,
        fundingRoundsTransferred: fundingRoundsCount,
        enrichmentsTransferred: enrichmentsCount,
        similarityScore: options.similarity.combined,
        similarityDetails: options.similarity as object,
        matchReason: options.reason,
        mergedBy: 'DB_CLEANER',
        dryRun: false,
        maintenanceRunId: options.maintenanceRunId,
      },
    })

    // Log the merge in CompanyEnrichment for backwards compatibility
    await tx.companyEnrichment.create({
      data: {
        companyId: keepId,
        source: 'MANUAL',
        fieldsUpdated,
        newData: {
          action: 'merge',
          mergedFrom: merge.id,
          mergedName: merge.name,
          mergeLogId: mergeLog.id,
        },
      },
    })

    // Delete merged company
    await tx.company.delete({
      where: { id: mergeId },
    })

    return {
      keptId: keepId,
      mergedId: mergeId,
      fieldsUpdated,
      fundingRoundsTransferred: fundingRoundsCount,
      enrichmentsTransferred: enrichmentsCount,
      mergeLogId: mergeLog.id,
    }
  })
}

// ============================================================================
// FUNDING ROUND DEDUPLICATION
// ============================================================================

/**
 * Plan funding round deduplication (dry-run mode)
 */
export async function planFundingRoundDeduplication(): Promise<FundingRoundPlanResult> {
  const companies = await fetchCompaniesWithRounds()
  const plannedMerges: PlannedFundingRoundMerge[] = []

  for (const company of companies) {
    const rounds = company.fundingRounds
    if (rounds.length < 2) continue

    for (let i = 0; i < rounds.length; i++) {
      for (let j = i + 1; j < rounds.length; j++) {
        const r1 = rounds[i]
        const r2 = rounds[j]

        const similar = areFundingRoundsSimilar(
          {
            amount: r1.amountUsd != null ? Number(r1.amountUsd) : null,
            date: r1.fundingDate,
            stage: r1.stageNormalized,
          },
          {
            amount: r2.amountUsd != null ? Number(r2.amountUsd) : null,
            date: r2.fundingDate,
            stage: r2.stageNormalized,
          }
        )

        if (similar) {
          const score1 = calculateRoundDataScore(r1)
          const score2 = calculateRoundDataScore(r2)
          const [keep, merge] = score1 >= score2 ? [r1, r2] : [r2, r1]

          plannedMerges.push({
            keepId: keep.id,
            mergeId: merge.id,
            companyName: company.name,
            keepAmount: keep.amountUsd != null ? Number(keep.amountUsd) : null,
            mergeAmount: merge.amountUsd != null ? Number(merge.amountUsd) : null,
            keepDate: keep.fundingDate,
            mergeDate: merge.fundingDate,
            reason: `Similar amount/date/stage for ${company.name}`,
          })
        }
      }
    }
  }

  return {
    candidates: plannedMerges.length,
    plannedMerges,
  }
}

/**
 * Détecte et fusionne les FundingRounds en doublon
 */
export async function deduplicateFundingRounds(
  options: { dryRun?: boolean } = {}
): Promise<DeduplicationResult> {
  const { dryRun = false } = options

  if (dryRun) {
    const plan = await planFundingRoundDeduplication()
    return { merged: 0, candidates: plan.candidates }
  }

  let merged = 0
  let candidates = 0

  const companies = await fetchCompaniesWithRounds()

  for (const company of companies) {
    const rounds = company.fundingRounds
    if (rounds.length < 2) continue

    const duplicatePairs: Array<{ keep: (typeof rounds)[0]; merge: (typeof rounds)[0] }> = []

    for (let i = 0; i < rounds.length; i++) {
      for (let j = i + 1; j < rounds.length; j++) {
        const r1 = rounds[i]
        const r2 = rounds[j]

        const similar = areFundingRoundsSimilar(
          {
            amount: r1.amountUsd != null ? Number(r1.amountUsd) : null,
            date: r1.fundingDate,
            stage: r1.stageNormalized,
          },
          {
            amount: r2.amountUsd != null ? Number(r2.amountUsd) : null,
            date: r2.fundingDate,
            stage: r2.stageNormalized,
          }
        )

        if (similar) {
          candidates++
          const score1 = calculateRoundDataScore(r1)
          const score2 = calculateRoundDataScore(r2)

          if (score1 >= score2) {
            duplicatePairs.push({ keep: r1, merge: r2 })
          } else {
            duplicatePairs.push({ keep: r2, merge: r1 })
          }
        }
      }
    }

    const mergedIds = new Set<string>()

    for (const { keep, merge } of duplicatePairs) {
      if (mergedIds.has(merge.id) || mergedIds.has(keep.id)) continue

      try {
        await mergeFundingRounds(keep.id, merge.id)
        mergedIds.add(merge.id)
        merged++

        logger.info(`Merged funding round for ${company.name}`, {
          keepId: keep.id,
          mergeId: merge.id,
        })
      } catch (error) {
        logger.error(`Failed to merge funding rounds`, {
          keep: keep.id,
          merge: merge.id,
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }
  }

  logger.info(`Funding round deduplication complete`, { candidates, merged })
  return { merged, candidates }
}

/**
 * Fetch companies with their funding rounds for deduplication
 * Uses batching to prevent memory exhaustion
 */
type CompanyWithRounds = {
  id: string;
  name: string;
  fundingRounds: Array<{
    id: string;
    amount: unknown;
    amountUsd: unknown;
    fundingDate: Date | null;
    stage: string | null;
    stageNormalized: string | null;
    investors: string[];
    source: string | null;
    isEnriched: boolean;
    createdAt: Date;
  }>;
};

async function fetchCompaniesWithRounds(): Promise<CompanyWithRounds[]> {
  const allCompanies: CompanyWithRounds[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const batch: CompanyWithRounds[] = await prisma.company.findMany({
      take: DEDUP_BATCH_SIZE,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      where: {
        fundingRounds: { some: {} },
      },
      select: {
        id: true,
        name: true,
        fundingRounds: {
          select: {
            id: true,
            amount: true,
            amountUsd: true,
            fundingDate: true,
            stage: true,
            stageNormalized: true,
            investors: true,
            source: true,
            isEnriched: true,
            createdAt: true,
          },
          orderBy: { fundingDate: 'desc' },
        },
      },
    });

    allCompanies.push(...batch);

    if (batch.length < DEDUP_BATCH_SIZE) {
      hasMore = false;
    } else {
      cursor = batch[batch.length - 1].id;
    }
  }

  return allCompanies;
}

/**
 * Calcule un score de complétude pour un funding round
 */
function calculateRoundDataScore(round: {
  amount: unknown
  fundingDate: Date | null
  stage: string | null
  investors: string[]
  isEnriched: boolean
}): number {
  let score = 0

  if (round.amount) score += 2
  if (round.fundingDate) score += 1
  if (round.stage) score += 1
  if (round.investors.length > 0) score += round.investors.length * 0.5
  if (round.isEnriched) score += 2

  return score
}

/**
 * Fusionne deux funding rounds
 */
async function mergeFundingRounds(keepId: string, mergeId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [keep, merge] = await Promise.all([
      tx.fundingRound.findUnique({ where: { id: keepId } }),
      tx.fundingRound.findUnique({ where: { id: mergeId } }),
    ])

    if (!keep || !merge) {
      throw new Error('Funding rounds not found')
    }

    const updates: Record<string, unknown> = {}

    if (!keep.amount && merge.amount) updates.amount = merge.amount
    if (!keep.amountUsd && merge.amountUsd) updates.amountUsd = merge.amountUsd
    if (!keep.fundingDate && merge.fundingDate) updates.fundingDate = merge.fundingDate
    if (!keep.stage && merge.stage) updates.stage = merge.stage
    if (!keep.valuationPre && merge.valuationPre) updates.valuationPre = merge.valuationPre
    if (!keep.valuationPost && merge.valuationPost) updates.valuationPost = merge.valuationPost
    if (!keep.leadInvestor && merge.leadInvestor) updates.leadInvestor = merge.leadInvestor

    // Merge investors
    const allInvestors = new Set([...keep.investors, ...merge.investors])
    updates.investors = Array.from(allInvestors)

    if (Object.keys(updates).length > 0) {
      await tx.fundingRound.update({
        where: { id: keepId },
        data: updates,
      })
    }

    await tx.fundingRound.delete({
      where: { id: mergeId },
    })
  })
}
