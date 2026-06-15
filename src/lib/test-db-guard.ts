/**
 * Garde anti-prod pour les tests d'intégration DB.
 *
 * Les fichiers *-integration / db-integration chargent `.env.local` (qui pointe
 * la base Neon de PROD en local) — sans garde, un `npm test` local sans
 * SKIP_DB_TESTS écrit des rows jetables dans la prod. Règle : les tests DB ne
 * tournent que contre une base LOCALE (localhost / 127.0.0.1), ou avec opt-in
 * explicite `ALLOW_REMOTE_DB=1` (à réserver aux runs volontaires et conscients).
 *
 * En CI, le job db-integration fournit un Postgres éphémère sur localhost →
 * les tests tournent. En local avec .env.local → skip (URL distante).
 */
export function shouldSkipDbTests(): { skip: boolean; reason: string } {
  if (process.env.SKIP_DB_TESTS === "1") {
    return { skip: true, reason: "SKIP_DB_TESTS=1" };
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    return { skip: true, reason: "DATABASE_URL absente" };
  }
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isLocal && process.env.ALLOW_REMOTE_DB !== "1") {
    return {
      skip: true,
      reason: "DATABASE_URL distante sans ALLOW_REMOTE_DB=1 (garde anti-prod)",
    };
  }
  return { skip: false, reason: "" };
}
