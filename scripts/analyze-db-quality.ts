import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function analyzeDbQuality() {
  console.log('🔍 Analyse critique de la qualité de la DB...\n')

  // ========== COMPANIES ==========
  console.log('═══════════════════════════════════════')
  console.log('📊 COMPANIES')
  console.log('═══════════════════════════════════════')

  const totalCompanies = await prisma.company.count()
  console.log(`Total companies: ${totalCompanies}`)

  // Companies sans nom (empty string)
  const noName = await prisma.company.count({
    where: { name: '' }
  })

  // Companies sans description
  const noDescription = await prisma.company.count({
    where: {
      OR: [
        { description: null },
        { description: '' }
      ]
    }
  })

  // Companies sans industrie
  const noIndustry = await prisma.company.count({
    where: {
      OR: [
        { industry: null },
        { industry: '' }
      ]
    }
  })

  // Companies sans pays (headquarters)
  const noCountry = await prisma.company.count({
    where: {
      OR: [
        { headquarters: null },
        { headquarters: '' }
      ]
    }
  })

  // Companies sans website
  const noWebsite = await prisma.company.count({
    where: {
      OR: [
        { website: null },
        { website: '' }
      ]
    }
  })

  // Companies sans totalRaised
  const noFundingTotal = await prisma.company.count({
    where: { totalRaised: null }
  })

  // Companies sans lastRoundStage
  const noStage = await prisma.company.count({
    where: {
      OR: [
        { lastRoundStage: null },
        { lastRoundStage: '' }
      ]
    }
  })

  // Companies sans founded year
  const noFoundedYear = await prisma.company.count({
    where: { foundedYear: null }
  })

  console.log(`\n❌ Problèmes détectés:`)
  console.log(`   - Sans nom (vide): ${noName}`)
  console.log(`   - Sans description: ${noDescription}`)
  console.log(`   - Sans industrie: ${noIndustry}`)
  console.log(`   - Sans pays: ${noCountry}`)
  console.log(`   - Sans website: ${noWebsite}`)
  console.log(`   - Sans fundingTotal: ${noFundingTotal}`)
  console.log(`   - Sans stage: ${noStage}`)
  console.log(`   - Sans année de création: ${noFoundedYear}`)

  // Score de complétude
  const companiesWithAllRequired = await prisma.company.count({
    where: {
      AND: [
        { name: { not: '' } },
        { description: { not: null } },
        { description: { not: '' } },
        { industry: { not: null } },
        { industry: { not: '' } },
        { headquarters: { not: null } },
        { headquarters: { not: '' } },
      ]
    }
  })

  const completenessRate = ((companiesWithAllRequired / totalCompanies) * 100).toFixed(1)
  console.log(`\n✅ Companies complètes (nom+desc+industrie+pays): ${companiesWithAllRequired} (${completenessRate}%)`)

  // ========== FUNDING ROUNDS ==========
  console.log('\n═══════════════════════════════════════')
  console.log('💰 FUNDING ROUNDS')
  console.log('═══════════════════════════════════════')

  const totalRounds = await prisma.fundingRound.count()
  console.log(`Total funding rounds: ${totalRounds}`)

  // Rounds sans montant
  const noAmount = await prisma.fundingRound.count({
    where: { amount: null }
  })

  // Rounds sans date
  const noDate = await prisma.fundingRound.count({
    where: { fundingDate: null }
  })

  // Rounds sans stage
  const noRoundStage = await prisma.fundingRound.count({
    where: {
      OR: [
        { stage: null },
        { stage: '' }
      ]
    }
  })

  // Rounds avec montant = 0
  const zeroAmount = await prisma.fundingRound.count({
    where: { amount: 0 }
  })

  // Rounds avec montant aberrant (< 1000 ou > 10B)
  const aberrantLow = await prisma.fundingRound.count({
    where: {
      amount: { gt: 0, lt: 1000 }
    }
  })

  const aberrantHigh = await prisma.fundingRound.count({
    where: {
      amount: { gt: 10000000000 } // > 10B
    }
  })

  console.log(`\n❌ Problèmes détectés:`)
  console.log(`   - Sans montant: ${noAmount}`)
  console.log(`   - Sans date: ${noDate}`)
  console.log(`   - Sans stage: ${noRoundStage}`)
  console.log(`   - Montant = 0: ${zeroAmount}`)
  console.log(`   - Montant < 1000€: ${aberrantLow}`)
  console.log(`   - Montant > 10B€: ${aberrantHigh}`)

  // Rounds complets
  const roundsComplete = await prisma.fundingRound.count({
    where: {
      AND: [
        { amount: { not: null } },
        { amount: { gt: 0 } },
        { fundingDate: { not: null } },
        { stage: { not: null } },
        { stage: { not: '' } },
      ]
    }
  })

  const roundsCompletenessRate = ((roundsComplete / totalRounds) * 100).toFixed(1)
  console.log(`\n✅ Rounds complets (montant>0+date+stage): ${roundsComplete} (${roundsCompletenessRate}%)`)

  // ========== RÉSUMÉ GLOBAL ==========
  console.log('\n═══════════════════════════════════════')
  console.log('📋 RÉSUMÉ GLOBAL')
  console.log('═══════════════════════════════════════')

  const criticalIssues = noName + noAmount + noDate
  const majorIssues = noDescription + noIndustry + noCountry + noRoundStage
  const minorIssues = noWebsite + noFundingTotal + noStage + noFoundedYear + zeroAmount

  console.log(`\n🔴 Issues CRITIQUES: ${criticalIssues}`)
  console.log(`   (companies sans nom, rounds sans montant/date)`)
  console.log(`🟠 Issues MAJEURES: ${majorIssues}`)
  console.log(`   (companies sans desc/industrie/pays, rounds sans stage)`)
  console.log(`🟡 Issues MINEURES: ${minorIssues}`)
  console.log(`   (champs optionnels manquants)`)

  const totalIssues = criticalIssues + majorIssues + minorIssues
  console.log(`\n📊 Total issues: ${totalIssues}`)

  // Note: une company peut avoir plusieurs issues, donc pas d'addition simple
  const uniqueBadCompanies = await prisma.company.count({
    where: {
      OR: [
        { name: '' },
        { description: null },
        { description: '' },
        { industry: null },
        { industry: '' },
        { headquarters: null },
        { headquarters: '' },
      ]
    }
  })

  const uniqueBadRounds = await prisma.fundingRound.count({
    where: {
      OR: [
        { amount: null },
        { fundingDate: null },
        { stage: null },
        { stage: '' },
        { amount: 0 },
      ]
    }
  })

  console.log(`\n🎯 Entrées uniques avec au moins 1 problème:`)
  console.log(`   - Companies: ${uniqueBadCompanies}/${totalCompanies} (${((uniqueBadCompanies/totalCompanies)*100).toFixed(1)}%)`)
  console.log(`   - Funding Rounds: ${uniqueBadRounds}/${totalRounds} (${((uniqueBadRounds/totalRounds)*100).toFixed(1)}%)`)

  await prisma.$disconnect()
}

analyzeDbQuality().catch(console.error)
