import { analyzeFounderByName, analyzeFounderLinkedIn, isCoresignalLinkedInConfigured } from '/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/connectors/coresignal-linkedin';

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  const deal = await prisma.deal.findUnique({
    where: { id: 'cmkvkyf1u0001it5qney6gr70' },
    include: { founders: true },
  });
  
  console.log('=== DEAL ===');
  console.log('Name:', deal?.name);
  console.log('Company:', deal?.companyName);
  console.log('Sector:', deal?.sector);
  console.log('Founders in DB:', deal?.founders?.length ?? 0);
  
  console.log('\n=== CORESIGNAL CONFIG ===');
  console.log('Configured:', isCoresignalLinkedInConfigured());

  if (deal?.founders && deal.founders.length > 0) {
    for (const founder of deal.founders) {
      console.log('\n=== FOUNDER: ' + founder.name + ' (' + founder.role + ') ===');
      console.log('LinkedIn URL:', founder.linkedinUrl || 'NONE');
      
      if (founder.linkedinUrl) {
        console.log('\n--- Testing with URL ---');
        const result = await analyzeFounderLinkedIn(founder.linkedinUrl, founder.role, deal.sector ?? undefined);
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n--- Testing WITHOUT URL ---');
        const result = await analyzeFounderByName(founder.name, deal.companyName || deal.name, founder.role, deal.sector ?? undefined);
        console.log(JSON.stringify(result, null, 2));
      }
    }
  } else {
    console.log('\nNo founders in DB. Testing manual search for Antiopea founders...');
    
    console.log('\n--- Test: analyzeFounderByName("CEO Antiopea", "Antiopea", "CEO", "Blockchain / Web3") ---');
    const result1 = await analyzeFounderByName('CEO Antiopea', 'Antiopea', 'CEO', deal?.sector ?? undefined);
    console.log('\n=== FULL RESULT ===');
    console.log(JSON.stringify(result1, null, 2));
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
