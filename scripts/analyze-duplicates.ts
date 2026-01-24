import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function analyzeDuplicates() {
  console.log('🔍 Analyse des doublons dans la DB...\n')

  // ========== COMPANIES DUPLICATES ==========
  console.log('═══════════════════════════════════════')
  console.log('📊 DOUBLONS COMPANIES')
  console.log('═══════════════════════════════════════')

  // 1. Exact name duplicates
  const exactNameDupes = await prisma.$queryRaw<{name: string, count: bigint}[]>`
    SELECT name, COUNT(*) as count
    FROM "Company"
    GROUP BY name
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `

  const totalExactNameDupes = exactNameDupes.reduce((acc, d) => acc + Number(d.count) - 1, 0)
  console.log(`\n🔴 Doublons par nom exact: ${totalExactNameDupes} entrées redondantes`)
  if (exactNameDupes.length > 0) {
    console.log('   Top 10:')
    exactNameDupes.slice(0, 10).forEach(d => {
      console.log(`   - "${d.name}": ${d.count} occurrences`)
    })
  }

  // 2. Slug duplicates (normalized names)
  const slugDupes = await prisma.$queryRaw<{slug: string, count: bigint}[]>`
    SELECT slug, COUNT(*) as count
    FROM "Company"
    WHERE slug IS NOT NULL
    GROUP BY slug
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `

  const totalSlugDupes = slugDupes.reduce((acc, d) => acc + Number(d.count) - 1, 0)
  console.log(`\n🟠 Doublons par slug: ${totalSlugDupes} entrées redondantes`)
  if (slugDupes.length > 0) {
    console.log('   Top 10:')
    slugDupes.slice(0, 10).forEach(d => {
      console.log(`   - "${d.slug}": ${d.count} occurrences`)
    })
  }

  // 3. Similar names (case-insensitive)
  const caseInsensitiveDupes = await prisma.$queryRaw<{lower_name: string, count: bigint}[]>`
    SELECT LOWER(name) as lower_name, COUNT(*) as count
    FROM "Company"
    GROUP BY LOWER(name)
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `

  const totalCaseDupes = caseInsensitiveDupes.reduce((acc, d) => acc + Number(d.count) - 1, 0)
  console.log(`\n🟡 Doublons case-insensitive: ${totalCaseDupes} entrées redondantes`)
  if (caseInsensitiveDupes.length > 0 && totalCaseDupes !== totalExactNameDupes) {
    console.log('   Exemples de variations de casse:')
    // Find examples where case differs
    for (const d of caseInsensitiveDupes.slice(0, 5)) {
      const variations = await prisma.company.findMany({
        where: { name: { mode: 'insensitive', equals: d.lower_name } },
        select: { name: true }
      })
      if (new Set(variations.map(v => v.name)).size > 1) {
        console.log(`   - ${variations.map(v => `"${v.name}"`).join(' vs ')}`)
      }
    }
  }

  // ========== FUNDING ROUNDS DUPLICATES ==========
  console.log('\n═══════════════════════════════════════')
  console.log('💰 DOUBLONS FUNDING ROUNDS')
  console.log('═══════════════════════════════════════')

  // 1. Exact duplicates (same company + date + amount)
  const exactRoundDupes = await prisma.$queryRaw<{companyName: string, fundingDate: Date, amount: number, count: bigint}[]>`
    SELECT "companyName", "fundingDate", amount, COUNT(*) as count
    FROM "FundingRound"
    WHERE "fundingDate" IS NOT NULL AND amount IS NOT NULL
    GROUP BY "companyName", "fundingDate", amount
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `

  const totalExactRoundDupes = exactRoundDupes.reduce((acc, d) => acc + Number(d.count) - 1, 0)
  console.log(`\n🔴 Doublons exacts (company+date+amount): ${totalExactRoundDupes} entrées redondantes`)
  if (exactRoundDupes.length > 0) {
    console.log('   Top 10:')
    exactRoundDupes.slice(0, 10).forEach(d => {
      const amount = d.amount ? `${(Number(d.amount) / 1000000).toFixed(1)}M` : '?'
      const date = d.fundingDate ? new Date(d.fundingDate).toISOString().split('T')[0] : '?'
      console.log(`   - "${d.companyName}" (${date}, ${amount}): ${d.count}x`)
    })
  }

  // 2. Same company + same stage (potential duplicates)
  const stageDupes = await prisma.$queryRaw<{companyName: string, stage: string, count: bigint}[]>`
    SELECT "companyName", stage, COUNT(*) as count
    FROM "FundingRound"
    WHERE stage IS NOT NULL AND stage != ''
    GROUP BY "companyName", stage
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `

  const totalStageDupes = stageDupes.reduce((acc, d) => acc + Number(d.count) - 1, 0)
  console.log(`\n🟠 Même company + même stage: ${totalStageDupes} potentiels doublons`)
  console.log('   (Note: une company peut légitimement avoir plusieurs rounds du même stage)')
  if (stageDupes.length > 0) {
    console.log('   Exemples avec 3+ rounds du même stage:')
    stageDupes.filter(d => Number(d.count) >= 3).slice(0, 10).forEach(d => {
      console.log(`   - "${d.companyName}" a ${d.count}x ${d.stage}`)
    })
  }

  // 3. Same source + sourceId (should be unique by constraint)
  const sourceIdDupes = await prisma.$queryRaw<{source: string, sourceId: string, count: bigint}[]>`
    SELECT source, "sourceId", COUNT(*) as count
    FROM "FundingRound"
    WHERE "sourceId" IS NOT NULL
    GROUP BY source, "sourceId"
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10
  `

  const totalSourceIdDupes = sourceIdDupes.reduce((acc, d) => acc + Number(d.count) - 1, 0)
  console.log(`\n🔴 Doublons source+sourceId: ${totalSourceIdDupes}`)
  if (totalSourceIdDupes > 0) {
    console.log('   ⚠️  Violation de la contrainte unique!')
  }

  // ========== RÉSUMÉ ==========
  console.log('\n═══════════════════════════════════════')
  console.log('📋 RÉSUMÉ DOUBLONS')
  console.log('═══════════════════════════════════════')

  const totalCompanyDupes = Math.max(totalExactNameDupes, totalSlugDupes, totalCaseDupes)
  const totalRoundDupes = totalExactRoundDupes

  console.log(`\n🏢 Companies avec doublons potentiels:`)
  console.log(`   - Par nom exact: ${totalExactNameDupes}`)
  console.log(`   - Par slug: ${totalSlugDupes}`)
  console.log(`   - Par nom (case-insensitive): ${totalCaseDupes}`)

  console.log(`\n💰 Funding rounds avec doublons:`)
  console.log(`   - Doublons exacts: ${totalExactRoundDupes}`)
  console.log(`   - Même stage (à vérifier): ${totalStageDupes}`)

  console.log(`\n🎯 Estimation des entrées à nettoyer:`)
  console.log(`   - Companies: ~${totalCompanyDupes} doublons à merger`)
  console.log(`   - Funding Rounds: ~${totalExactRoundDupes} doublons à supprimer`)

  await prisma.$disconnect()
}

analyzeDuplicates().catch(console.error)
