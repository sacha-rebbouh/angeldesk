import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma client singleton
 *
 * For Neon serverless with connection pooling:
 * - Ensure DATABASE_URL includes ?pgbouncer=true for pooled connections
 * - For direct connections (migrations), use DIRECT_DATABASE_URL without pgbouncer
 *
 * Connection pool is managed by Neon's pooler, not Prisma.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    // Neon serverless connection settings
    datasourceUrl: process.env.DATABASE_URL,
  });

// Always cache to global to prevent creating multiple PrismaClient instances
// This is critical for both dev (hot reload) and production (serverless warm starts)
globalForPrisma.prisma = prisma;

// Handle shutdown gracefully
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
