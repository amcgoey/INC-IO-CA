/**
 * @file CacheAdapter.ts
 * @description Cache service interface and implementations for key-value string caching with expiration (TTL).
 *
 * Provides `GoogleScriptCacheAdapter` for Google Apps Script CacheService and `InMemoryCacheAdapter` for isolated unit tests.
 */

/**
 * Interface defining simple string caching operations with time-to-live (TTL) expiration.
 */
interface CacheAdapter {
  /** Gets a cached string value by key, or returns `null` if expired/missing. */
  get(key: string): string | null;
  /** Stores a string value under key for `ttlSeconds`. */
  put(key: string, value: string, ttlSeconds: number): void;
}

/**
 * Production implementation of `CacheAdapter` backed by Google Apps Script `CacheService.getUserCache()`.
 */
class GoogleScriptCacheAdapter implements CacheAdapter {
  private getCache(): GoogleAppsScript.Cache.Cache | null {
    try {
      if (typeof CacheService !== "undefined" && CacheService.getUserCache) {
        return CacheService.getUserCache();
      }
    } catch (e) {
      // Fail silently if CacheService is inaccessible
    }
    return null;
  }

  /** @override */
  get(key: string): string | null {
    const cache = this.getCache();
    if (!cache) return null;
    try {
      const val = cache.get(key);
      return val !== null ? val : null;
    } catch (e) {
      return null;
    }
  }

  /** @override */
  put(key: string, value: string, ttlSeconds: number): void {
    const cache = this.getCache();
    if (!cache) return;
    try {
      cache.put(key, value, ttlSeconds);
    } catch (e) {
      // Fail silently if put fails
    }
  }
}

/**
 * In-memory implementation of `CacheAdapter` using Map and timestamp-based TTL checks.
 */
class InMemoryCacheAdapter implements CacheAdapter {
  private store: Map<string, { value: string; expiresAt: number }> = new Map();

  /** @override */
  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  /** @override */
  put(key: string, value: string, ttlSeconds: number): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }
}

/** Alias for `InMemoryCacheAdapter` for unit testing context. */
var FakeCacheAdapter = InMemoryCacheAdapter;

/** Global default cache adapter instance seam. */
var defaultCacheAdapter: CacheAdapter = new GoogleScriptCacheAdapter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleScriptCacheAdapter,
    InMemoryCacheAdapter,
    FakeCacheAdapter,
    defaultCacheAdapter
  };
}
