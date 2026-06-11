/**
 * Bornes de `Deal.growthRate` (% de croissance YoY) — source de vérité unique.
 *
 * Alignées sur la colonne DB `Decimal(7,2)` → plafond ±99999.99. Plancher -100 :
 * le chiffre d'affaires ne peut pas décroître de plus de 100% en YoY.
 *
 * Consommée par les trois chemins d'écriture de la colonne : `createDealSchema`
 * (POST), `updateDealSchema` (PATCH) et la persistance orchestrateur (valeurs
 * extraites par le document-extractor).
 */
export const GROWTH_RATE_MIN = -100;
export const GROWTH_RATE_MAX = 99999.99;

/** Vrai si la valeur est finie et tient dans la plage autorisée par la colonne. */
export function isGrowthRateInRange(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= GROWTH_RATE_MIN &&
    value <= GROWTH_RATE_MAX
  );
}
