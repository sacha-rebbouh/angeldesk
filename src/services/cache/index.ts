/**
 * Centralized Cache Manager for Fullinvest
 *
 * Provides unified caching for:
 * - Context Engine enrichment data
 * - Benchmark lookups
 * - Tool execution results
 * - Cross-agent memoization
 */

export interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  hits: number;
  tags: string[];
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  memoryUsageEstimate: number;
  entriesByNamespace: Record<string, number>;
}

export interface CacheConfig {
  defaultTTLMs: number;
  maxEntries: number;
  cleanupIntervalMs: number;
  enableStats: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTLMs: 5 * 60 * 1000, // 5 minutes
  maxEntries: 1000,
  cleanupIntervalMs: 60 * 1000, // 1 minute
  enableStats: true,
};

type CacheNamespace =
  | 'context-engine'
  | 'benchmarks'
  | 'tools'
  | 'agents'
  | 'deals';

class CacheManager {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
  };
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
  }

  /**
   * Generate a namespaced cache key
   */
  private makeKey(namespace: CacheNamespace, key: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Get a value from cache
   */
  get<T>(namespace: CacheNamespace, key: string): T | null {
    const fullKey = this.makeKey(namespace, key);
    const entry = this.cache.get(fullKey) as CacheEntry<T> | undefined;

    if (!entry) {
      if (this.config.enableStats) this.stats.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      if (this.config.enableStats) this.stats.misses++;
      return null;
    }

    // Update hit count
    entry.hits++;
    if (this.config.enableStats) this.stats.hits++;

    return entry.data;
  }

  /**
   * Set a value in cache
   */
  set<T>(
    namespace: CacheNamespace,
    key: string,
    data: T,
    options: {
      ttlMs?: number;
      tags?: string[];
    } = {}
  ): void {
    const fullKey = this.makeKey(namespace, key);
    const now = Date.now();
    const ttl = options.ttlMs ?? this.config.defaultTTLMs;

    // Enforce max entries (LRU eviction)
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    this.cache.set(fullKey, {
      data,
      createdAt: now,
      expiresAt: now + ttl,
      hits: 0,
      tags: options.tags ?? [],
    });
  }

  /**
   * Check if key exists and is valid
   */
  has(namespace: CacheNamespace, key: string): boolean {
    const fullKey = this.makeKey(namespace, key);
    const entry = this.cache.get(fullKey);

    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(namespace: CacheNamespace, key: string): boolean {
    const fullKey = this.makeKey(namespace, key);
    return this.cache.delete(fullKey);
  }

  /**
   * Invalidate all entries in a namespace
   */
  invalidateNamespace(namespace: CacheNamespace): number {
    const prefix = `${namespace}:`;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Invalidate entries by tag
   */
  invalidateByTag(tag: string): number {
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Invalidate all entries for a specific deal
   */
  invalidateDeal(dealId: string): number {
    return this.invalidateByTag(`deal:${dealId}`);
  }

  /**
   * Get or compute pattern - most common usage
   */
  async getOrCompute<T>(
    namespace: CacheNamespace,
    key: string,
    compute: () => Promise<T>,
    options: {
      ttlMs?: number;
      tags?: string[];
      forceRefresh?: boolean;
    } = {}
  ): Promise<{ data: T; fromCache: boolean }> {
    // Check cache first (unless force refresh)
    if (!options.forceRefresh) {
      const cached = this.get<T>(namespace, key);
      if (cached !== null) {
        return { data: cached, fromCache: true };
      }
    }

    // Compute and cache
    const data = await compute();
    this.set(namespace, key, data, {
      ttlMs: options.ttlMs,
      tags: options.tags,
    });

    return { data, fromCache: false };
  }

  /**
   * Batch get - returns map of found entries
   */
  batchGet<T>(
    namespace: CacheNamespace,
    keys: string[]
  ): Map<string, T> {
    const results = new Map<string, T>();

    for (const key of keys) {
      const value = this.get<T>(namespace, key);
      if (value !== null) {
        results.set(key, value);
      }
    }

    return results;
  }

  /**
   * Batch set
   */
  batchSet<T>(
    namespace: CacheNamespace,
    entries: Array<{ key: string; data: T; ttlMs?: number; tags?: string[] }>
  ): void {
    for (const entry of entries) {
      this.set(namespace, entry.key, entry.data, {
        ttlMs: entry.ttlMs,
        tags: entry.tags,
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entriesByNamespace: Record<string, number> = {};

    for (const key of this.cache.keys()) {
      const namespace = key.split(':')[0];
      entriesByNamespace[namespace] = (entriesByNamespace[namespace] ?? 0) + 1;
    }

    const totalHits = this.stats.hits;
    const totalMisses = this.stats.misses;
    const total = totalHits + totalMisses;

    return {
      totalEntries: this.cache.size,
      totalHits,
      totalMisses,
      hitRate: total > 0 ? totalHits / total : 0,
      memoryUsageEstimate: this.estimateMemoryUsage(),
      entriesByNamespace,
    };
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Stop cleanup timer (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // Private methods

  private evictLRU(): void {
    // Find entry with lowest hit count and oldest creation
    let lruKey: string | null = null;
    let lruScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Score = hits - (age in seconds / 60)
      // Lower score = more likely to evict
      const ageSeconds = (Date.now() - entry.createdAt) / 1000;
      const score = entry.hits - ageSeconds / 60;

      if (score < lruScore) {
        lruScore = score;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // Don't prevent Node from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[CacheManager] Cleaned ${cleaned} expired entries`);
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimate: 100 bytes base + JSON size of data
    let total = 0;

    for (const entry of this.cache.values()) {
      total += 100; // Base overhead
      try {
        total += JSON.stringify(entry.data).length * 2; // UTF-16 chars
      } catch {
        total += 1000; // Fallback for non-serializable
      }
    }

    return total;
  }
}

// Singleton instance
let instance: CacheManager | null = null;

export function getCacheManager(config?: Partial<CacheConfig>): CacheManager {
  if (!instance) {
    instance = new CacheManager(config);
  }
  return instance;
}

export function resetCacheManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// Re-export for convenience
export { CacheManager };
export type { CacheNamespace };
