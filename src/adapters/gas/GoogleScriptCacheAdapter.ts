/**
 * @file GoogleScriptCacheAdapter.ts
 * @description Production implementation of `CacheAdapter` backed by Google Apps Script `CacheService.getUserCache()`.
 * Tier 2 GAS Infrastructure Adapter.
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

  /** @override */
  remove(key: string): void {
    const cache = this.getCache();
    if (!cache) return;
    try {
      cache.remove(key);
    } catch (e) {
      // Fail silently if remove fails
    }
  }

  /** @override */
  removeAll(keys: string[]): void {
    const cache = this.getCache();
    if (!cache || !keys || keys.length === 0) return;
    try {
      cache.removeAll(keys);
    } catch (e) {
      // Fail silently if removeAll fails
    }
  }
}

/** Global default cache adapter instance seam. */
const defaultCacheAdapter: CacheAdapter = new GoogleScriptCacheAdapter();

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleScriptCacheAdapter,
    defaultCacheAdapter
  };
}
