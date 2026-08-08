/**
 * @file PrefixCacheManager.ts
 * @description Tier 1 application cache manager wrapping `CacheAdapter` to enable prefix-scoped targeted cache invalidation.
 *
 * Maintains tracked key manifests (`_INDEX_<prefix>`) to support batch eviction via `removeAll`
 * without requiring native key listing or regex matching from underlying storage adapters.
 */

class PrefixCacheManager {
  private cacheAdapter: CacheAdapter;

  constructor(cacheAdapter: CacheAdapter) {
    this.cacheAdapter = cacheAdapter;
  }

  /** Gets the index manifest key for a given prefix scope. */
  private getIndexKey(prefix: string): string {
    return `_INDEX_${prefix}`;
  }

  /** Internal helper to read the key index manifest for a prefix. */
  private getIndexKeys(prefix: string): string[] {
    const raw = this.cacheAdapter.get(this.getIndexKey(prefix));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Stores a value under `key` within a `prefix` scope, registering `key` in the scope's manifest index.
   *
   * @param prefix - High-level namespace (e.g. `DOC_CONFIG_1A2B3C`)
   * @param key - Exact cache key (e.g. `DOC_CONFIG_1A2B3C_Submittal`)
   * @param value - Serialized cache value string
   * @param ttlSeconds - Time-to-live expiration in seconds
   */
  putScoped(prefix: string, key: string, value: string, ttlSeconds: number): void {
    // 1. Store the target value
    this.cacheAdapter.put(key, value, ttlSeconds);

    // 2. Update index manifest
    const indexKey = this.getIndexKey(prefix);
    const currentKeys = this.getIndexKeys(prefix);
    if (currentKeys.indexOf(key) === -1) {
      currentKeys.push(key);
    }
    this.cacheAdapter.put(indexKey, JSON.stringify(currentKeys), ttlSeconds);
  }

  /**
   * Retrieves a cached value under `key`.
   */
  getScoped(prefix: string, key: string): string | null {
    return this.cacheAdapter.get(key);
  }

  /**
   * Removes a single `key` from cache and prunes it from the prefix manifest index.
   */
  removeScoped(prefix: string, key: string): void {
    this.cacheAdapter.remove(key);

    const indexKey = this.getIndexKey(prefix);
    const currentKeys = this.getIndexKeys(prefix);
    const filtered = currentKeys.filter(k => k !== key);

    if (filtered.length > 0) {
      // Re-save index with remaining keys (using fallback 21,600s TTL)
      this.cacheAdapter.put(indexKey, JSON.stringify(filtered), 21600);
    } else {
      this.cacheAdapter.remove(indexKey);
    }
  }

  /**
   * Invalidates all cached entries registered under `prefix`, including the manifest index key.
   *
   * @param prefix - High-level namespace to clear (e.g. `DOC_CONFIG_1A2B3C`)
   */
  invalidatePrefix(prefix: string): void {
    const indexKey = this.getIndexKey(prefix);
    const trackedKeys = this.getIndexKeys(prefix);

    const keysToRemove = Array.from(new Set([...trackedKeys, indexKey]));
    this.cacheAdapter.removeAll(keysToRemove);
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PrefixCacheManager
  };
}
