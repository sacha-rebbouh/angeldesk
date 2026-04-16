/**
 * Feature Access Gate — Backend enforcement of paid feature unlocks
 *
 * Jusqu'au sprint P0, les features payantes (Negotiation, API) n'etaient gatees
 * que cote frontend. Ce module fournit la source de verite backend: chaque route
 * API consommee doit passer par `assertFeatureAccess()` pour rejeter un user qui
 * n'a pas atteint le seuil d'achat cumule requis.
 *
 * Seuils (src/services/credits/types.ts) :
 *   - negotiation : totalPurchased >= 60  (pack Pro+)
 *   - api         : totalPurchased >= 125 (pack Expert+)
 */

import { prisma } from "@/lib/prisma";
import { FEATURE_ACCESS } from "./types";

export type FeatureKey = "negotiation" | "api";

export interface FeatureAccessResult {
  allowed: boolean;
  required: number;
  current: number;
  reason?: string;
}

/**
 * Verifie si l'utilisateur a debloque une feature payante.
 * Gate sur `totalPurchased` (lifetime), pas sur le solde courant:
 * debloquer une feature est irreversible, meme si le solde est consomme ensuite.
 */
export async function canAccessFeature(
  userId: string,
  feature: FeatureKey
): Promise<FeatureAccessResult> {
  const access = FEATURE_ACCESS[feature];
  if (!access) {
    return {
      allowed: false,
      required: 0,
      current: 0,
      reason: `Unknown feature: ${feature}`,
    };
  }

  const balance = await prisma.userCreditBalance.findUnique({
    where: { userId },
    select: { totalPurchased: true },
  });
  const current = balance?.totalPurchased ?? 0;
  const required = access.minTotalPurchased;

  return {
    allowed: current >= required,
    required,
    current,
  };
}

/**
 * Jette `FeatureAccessError` si l'utilisateur n'a pas debloque la feature.
 * A wrapper en haut de chaque route POST/PATCH/DELETE qui consomme la feature.
 */
export async function assertFeatureAccess(
  userId: string,
  feature: FeatureKey
): Promise<void> {
  const result = await canAccessFeature(userId, feature);
  if (!result.allowed) {
    throw new FeatureAccessError(feature, result.required, result.current);
  }
}

export class FeatureAccessError extends Error {
  public readonly feature: FeatureKey;
  public readonly required: number;
  public readonly current: number;

  constructor(feature: FeatureKey, required: number, current: number) {
    super(
      `Feature '${feature}' requires ${required} credits purchased (current: ${current})`
    );
    this.name = "FeatureAccessError";
    this.feature = feature;
    this.required = required;
    this.current = current;
  }
}

/**
 * Serialise l'erreur en payload JSON standard pour les routes API.
 * Utilisation: `return NextResponse.json(serializeFeatureAccessError(err), { status: 403 });`
 */
export function serializeFeatureAccessError(err: FeatureAccessError) {
  return {
    error: "Feature non debloquee",
    feature: err.feature,
    requiredCredits: err.required,
    currentCredits: err.current,
  };
}
