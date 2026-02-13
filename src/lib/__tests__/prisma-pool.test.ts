// ============================================================================
// PRISMA POOL — buildDatasourceUrl TESTS
// Tests for connection pool parameter injection on DATABASE_URL
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock PrismaClient as a class to avoid real DB connection on import
vi.mock("@prisma/client", () => {
  return {
    PrismaClient: class MockPrismaClient {
      constructor() {
        // no-op
      }
    },
  };
});

// ============================================================================
// buildDatasourceUrl TESTS
// ============================================================================

describe("buildDatasourceUrl", () => {
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("returns undefined when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    const { buildDatasourceUrl } = await import("../prisma");

    expect(buildDatasourceUrl()).toBeUndefined();
  });

  it("appends ?connection_limit=15&pool_timeout=30 to URL without params", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    const { buildDatasourceUrl } = await import("../prisma");

    const result = buildDatasourceUrl();
    expect(result).toBe(
      "postgresql://user:pass@host:5432/db?connection_limit=15&pool_timeout=30"
    );
  });

  it("appends &connection_limit=15&pool_timeout=30 to URL with ?pgbouncer=true", async () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@host:5432/db?pgbouncer=true";
    const { buildDatasourceUrl } = await import("../prisma");

    const result = buildDatasourceUrl();
    expect(result).toBe(
      "postgresql://user:pass@host:5432/db?pgbouncer=true&connection_limit=15&pool_timeout=30"
    );
  });

  it("appends &connection_limit=15&pool_timeout=30 to URL with existing params", async () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@host:5432/db?sslmode=require";
    const { buildDatasourceUrl } = await import("../prisma");

    const result = buildDatasourceUrl();
    expect(result).toBe(
      "postgresql://user:pass@host:5432/db?sslmode=require&connection_limit=15&pool_timeout=30"
    );
  });

  it("does not duplicate connection_limit if already present (current behavior appends)", async () => {
    // Note: the current implementation does NOT check for duplicates.
    // It always appends connection_limit and pool_timeout.
    // This test documents the current behavior.
    process.env.DATABASE_URL =
      "postgresql://user:pass@host:5432/db?connection_limit=5";
    const { buildDatasourceUrl } = await import("../prisma");

    const result = buildDatasourceUrl();
    // Current behavior: appends even if already present
    expect(result).toBe(
      "postgresql://user:pass@host:5432/db?connection_limit=5&connection_limit=15&pool_timeout=30"
    );
  });
});
