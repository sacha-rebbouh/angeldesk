import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Build datasource URL with connection pool settings.
 * Appends connection_limit and pool_timeout to the DATABASE_URL
 * to prevent pool exhaustion during long-running analyses.
 */
export function buildDatasourceUrl(): string | undefined {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) return undefined;

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}connection_limit=15&pool_timeout=30`;
}

/**
 * Prisma client singleton
 *
 * For Neon serverless with connection pooling:
 * - Ensure DATABASE_URL includes ?pgbouncer=true for pooled connections
 * - For direct connections (migrations), use DIRECT_DATABASE_URL without pgbouncer
 *
 * Pool settings:
 * - connection_limit=15: prevents exhausting Neon's pool (default ~29 connections)
 * - pool_timeout=30: increases timeout from 10s to 30s for breathing room during analysis
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    // Neon serverless connection settings with pool limits
    datasourceUrl: buildDatasourceUrl(),
  });

// Always cache to global to prevent creating multiple PrismaClient instances
// This is critical for both dev (hot reload) and production (serverless warm starts)
globalForPrisma.prisma = prisma;
