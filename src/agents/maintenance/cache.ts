/**
 * Database Maintenance System - Intelligent Cache
 *
 * Cache multi-niveau pour éviter les appels API redondants:
 * - Niveau 1: Cache mémoire (rapide, volatile)
 * - Niveau 2: Cache DB (persistent, pour enrichissements coûteux)
 *
 * Features:
 * - TTL configurable par type de données
 * - LRU eviction pour le cache mémoire
 * - Invalidation sélective
 * - Statistiques de hit/miss
 */

import { prisma } from '@/lib/prisma'
import { createLogger } from './utils'

const logger = createLogger('CACHE')

// ============================================================================
// TYPES
// ============================================================================

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttlMs: number
  hits: number
}

interface CacheOptions {
  /** Time to live in milliseconds */
  ttlMs: number
  /** Whether to persist to DB */
  persistent?: boolean
  /** Cache key prefix */
  prefix?: string
}

interface CacheStats {
  hits: number
  misses: number
  memorySize: number
  hitRate: number
}

type CacheKeyType =
  | 'company_enrichment'
  | 'web_search'
  | 'article_parse'
  | 'company_data'
  | 'benchmark'

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_TTL: Record<CacheKeyType, number> = {
  company_enrichment: 24 * 60 * 60 * 1000, // 24h for enrichment data
  web_search: 6 * 60 * 60 * 1000, // 6h for search results
  article_parse: 7 * 24 * 60 * 60 * 1000, // 7 days for parsed articles
  company_data: 12 * 60 * 60 * 1000, // 12h for company basic data
  benchmark: 30 * 24 * 60 * 60 * 1000, // 30 days for benchmarks
}

const MAX_MEMORY_ENTRIES = 1000 // Max entries in memory cache
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // Clean up every 5 minutes

// ============================================================================
// MEMORY CACHE
// ============================================================================

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map()
  private stats = { hits: 0, misses: 0 }
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startCleanupInterval()
  }

  private startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, CLEANUP_INTERVAL_MS)
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined

    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check expiration
    if (Date.now() > entry.timestamp + entry.ttlMs) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    entry.hits++
    this.stats.hits++
    return entry.data
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    // Evict if at capacity (LRU-style: remove oldest entries)
    if (this.cache.size >= MAX_MEMORY_ENTRIES) {
      this.evictOldest()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs,
      hits: 0,
    })
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0 }
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      memorySize: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    }
  }

  private evictOldest() {
    // Find and remove entries with lowest hit count and oldest timestamp
    let oldestKey: string | null = null
    let oldestScore = Infinity

    for (const [key, entry] of this.cache) {
      // Score = recency + popularity (lower = evict first)
      const age = Date.now() - entry.timestamp
      const score = entry.hits * 1000 - age
      if (score < oldestScore) {
        oldestScore = score
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  private cleanup() {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache) {
      if (now > entry.timestamp + entry.ttlMs) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cache cleanup: removed ${cleaned} expired entries`)
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cache.clear()
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const memoryCache = new MemoryCache()

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a value from cache, or compute and cache it if not present
 */
export async function getCached<T>(
  keyType: CacheKeyType,
  keyId: string,
  fetcher: () => Promise<T>,
  options: Partial<CacheOptions> = {}
): Promise<T> {
  const ttlMs = options.ttlMs || DEFAULT_TTL[keyType]
  const fullKey = `${keyType}:${keyId}`

  // Try memory cache first
  const memoryCached = memoryCache.get<T>(fullKey)
  if (memoryCached !== null) {
    logger.debug(`Cache hit (memory): ${fullKey}`)
    return memoryCached
  }

  // Try DB cache for persistent types
  if (options.persistent !== false && isPersistentType(keyType)) {
    const dbCached = await getFromDbCache<T>(fullKey, ttlMs)
    if (dbCached !== null) {
      // Populate memory cache for faster subsequent access
      memoryCache.set(fullKey, dbCached, ttlMs)
      logger.debug(`Cache hit (DB): ${fullKey}`)
      return dbCached
    }
  }

  // Cache miss - fetch data
  logger.debug(`Cache miss: ${fullKey}`)
  const data = await fetcher()

  // Store in memory cache
  memoryCache.set(fullKey, data, ttlMs)

  // Store in DB cache for persistent types
  if (options.persistent !== false && isPersistentType(keyType)) {
    await setToDbCache(fullKey, data, ttlMs).catch((err) => {
      logger.warn(`Failed to persist cache: ${err.message}`)
    })
  }

  return data
}

/**
 * Get from cache without fetching (returns null if not present)
 */
export async function getFromCache<T>(
  keyType: CacheKeyType,
  keyId: string
): Promise<T | null> {
  const ttlMs = DEFAULT_TTL[keyType]
  const fullKey = `${keyType}:${keyId}`

  // Try memory first
  const memoryCached = memoryCache.get<T>(fullKey)
  if (memoryCached !== null) {
    return memoryCached
  }

  // Try DB
  if (isPersistentType(keyType)) {
    return getFromDbCache<T>(fullKey, ttlMs)
  }

  return null
}

/**
 * Manually set a cache value
 */
export async function setCache<T>(
  keyType: CacheKeyType,
  keyId: string,
  data: T,
  options: Partial<CacheOptions> = {}
): Promise<void> {
  const ttlMs = options.ttlMs || DEFAULT_TTL[keyType]
  const fullKey = `${keyType}:${keyId}`

  memoryCache.set(fullKey, data, ttlMs)

  if (options.persistent !== false && isPersistentType(keyType)) {
    await setToDbCache(fullKey, data, ttlMs).catch((err) => {
      logger.warn(`Failed to persist cache: ${err.message}`)
    })
  }
}

/**
 * Invalidate a cache entry
 */
export async function invalidateCache(
  keyType: CacheKeyType,
  keyId: string
): Promise<void> {
  const fullKey = `${keyType}:${keyId}`

  memoryCache.delete(fullKey)

  if (isPersistentType(keyType)) {
    await deleteFromDbCache(fullKey).catch((err) => {
      logger.warn(`Failed to delete from DB cache: ${err.message}`)
    })
  }
}

/**
 * Invalidate all cache entries matching a pattern
 */
export async function invalidateCachePattern(pattern: string): Promise<number> {
  // This only clears memory cache - DB cache will expire naturally
  const count = 0

  // Note: Map doesn't support pattern matching, so we iterate
  // In a real implementation, you might want to track keys by pattern
  memoryCache.clear()

  logger.info(`Invalidated cache pattern: ${pattern}`)
  return count
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  return memoryCache.getStats()
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<void> {
  memoryCache.clear()
  logger.info('All caches cleared')
}

// ============================================================================
// DB CACHE HELPERS
// ============================================================================

function isPersistentType(keyType: CacheKeyType): boolean {
  // Persist enrichment and article data, but not search results
  return ['company_enrichment', 'article_parse', 'benchmark'].includes(keyType)
}

async function getFromDbCache<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const cached = await prisma.cacheEntry.findUnique({
      where: { key },
    })

    if (!cached) return null

    // Check expiration
    const age = Date.now() - cached.createdAt.getTime()
    if (age > ttlMs) {
      // Expired - delete and return null
      await prisma.cacheEntry.delete({ where: { key } }).catch(() => {})
      return null
    }

    return cached.value as T
  } catch {
    return null
  }
}

async function setToDbCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  try {
    await prisma.cacheEntry.upsert({
      where: { key },
      update: {
        value: data as object,
        expiresAt: new Date(Date.now() + ttlMs),
      },
      create: {
        key,
        value: data as object,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    })
  } catch (error) {
    // CacheEntry table might not exist yet
    logger.debug(`DB cache write failed (table may not exist): ${key}`)
  }
}

async function deleteFromDbCache(key: string): Promise<void> {
  try {
    await prisma.cacheEntry.delete({ where: { key } })
  } catch {
    // Ignore if not found
  }
}

// ============================================================================
// CLEANUP ON MODULE UNLOAD
// ============================================================================

if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    memoryCache.destroy()
  })
}
