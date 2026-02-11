/**
 * Entity Verifier
 * Verifie que les entites mentionnees par le LLM existent dans la Funding DB
 * ou d'autres sources verifiables. Marque "[NON VERIFIE]" sinon.
 */

import { prisma } from "@/lib/prisma";

export interface EntityVerification {
  name: string;
  verified: boolean;
  source?: string;         // "Funding DB" | "Context Engine"
  matchedEntity?: {
    id: string;
    name: string;
    sector?: string;
    lastFunding?: number;
  };
}

/**
 * Verifie une liste d'entites (entreprises) contre la Funding DB.
 * Retourne pour chaque entite si elle est verifiee ou non.
 */
export async function verifyEntities(
  entityNames: string[],
): Promise<Map<string, EntityVerification>> {
  const results = new Map<string, EntityVerification>();

  if (entityNames.length === 0) return results;

  // Deduplicate and filter empty names
  const uniqueNames = [...new Set(entityNames.filter(n => n && n.length > 1))];

  try {
    // Batch lookup dans la Funding DB
    const dbDeals = await prisma.fundingRound.findMany({
      where: {
        OR: uniqueNames.map(name => ({
          companyName: {
            contains: name,
            mode: "insensitive" as const,
          },
        })),
      },
      select: {
        id: true,
        companyName: true,
        sector: true,
        amount: true,
      },
      take: 200,
    });

    // Matcher les resultats
    for (const name of uniqueNames) {
      const nameLower = name.toLowerCase();
      const match = dbDeals.find(d =>
        d.companyName.toLowerCase().includes(nameLower) ||
        nameLower.includes(d.companyName.toLowerCase())
      );

      if (match) {
        results.set(name, {
          name,
          verified: true,
          source: "Funding DB",
          matchedEntity: {
            id: match.id,
            name: match.companyName,
            sector: match.sector ?? undefined,
            lastFunding: match.amount ? Number(match.amount) : undefined,
          },
        });
      } else {
        results.set(name, {
          name,
          verified: false,
        });
      }
    }
  } catch (error) {
    console.error("[entity-verifier] DB lookup failed:", error);
    // Return all as unverified on DB error
    for (const name of uniqueNames) {
      results.set(name, { name, verified: false });
    }
  }

  return results;
}

/**
 * Compte les entites non verifiees et genere un message de warning.
 */
export function summarizeVerifications(
  verifications: Map<string, EntityVerification>
): { unverifiedCount: number; verifiedCount: number; warningMessage?: string } {
  const verified = Array.from(verifications.values()).filter(v => v.verified);
  const unverified = Array.from(verifications.values()).filter(v => !v.verified);

  const warningMessage = unverified.length > 0
    ? `${unverified.length} entite(s) mentionnee(s) par le LLM non trouvee(s) en Funding DB: ${unverified.map(v => v.name).join(", ")}. Marquee(s) [NON VERIFIE].`
    : undefined;

  return {
    verifiedCount: verified.length,
    unverifiedCount: unverified.length,
    warningMessage,
  };
}
