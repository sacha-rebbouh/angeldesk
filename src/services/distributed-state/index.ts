/**
 * Distributed state adapter for circuit breakers and rate limiters.
 * Uses Upstash Redis in production, in-memory fallback for development.
 *
 * Dependencies: @upstash/redis (npm install @upstash/redis)
 * Environment: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

export interface DistributedStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  incr(key: string, ttlMs?: number): Promise<number>;
  del(key: string): Promise<void>;
}

/**
 * Upstash Redis implementation (serverless-compatible)
 */
class UpstashStore implements DistributedStore {
  private redis: import('@upstash/redis').Redis | null = null;

  private async getClient(): Promise<import('@upstash/redis').Redis> {
    if (!this.redis) {
      const { Redis } = await import('@upstash/redis');
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
    }
    return this.redis;
  }

  async get<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    const value = await client.get<T>(key);
    return value;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const client = await this.getClient();
    if (ttlMs) {
      await client.set(key, JSON.stringify(value), { px: ttlMs });
    } else {
      await client.set(key, JSON.stringify(value));
    }
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const client = await this.getClient();
    const value = await client.incr(key);
    if (ttlMs && value === 1) {
      await client.pexpire(key, ttlMs);
    }
    return value;
  }

  async del(key: string): Promise<void> {
    const client = await this.getClient();
    await client.del(key);
  }
}

/**
 * In-memory fallback for development
 */
class InMemoryStore implements DistributedStore {
  private store = new Map<string, { value: unknown; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const current = await this.get<number>(key);
    const next = (current ?? 0) + 1;
    await this.set(key, next, ttlMs);
    return next;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Get the appropriate store based on environment
 */
export function getDistributedStore(): DistributedStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashStore();
  }
  console.warn('[DistributedState] No Upstash config found, using in-memory fallback');
  return new InMemoryStore();
}

// Singleton store
let storeInstance: DistributedStore | null = null;

export function getStore(): DistributedStore {
  if (!storeInstance) {
    storeInstance = getDistributedStore();
  }
  return storeInstance;
}
