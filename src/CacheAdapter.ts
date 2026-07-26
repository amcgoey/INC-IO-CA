// src/CacheAdapter.ts

interface CacheAdapter {
  get(key: string): string | null;
  put(key: string, value: string, ttlSeconds: number): void;
}

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

class InMemoryCacheAdapter implements CacheAdapter {
  private store: Map<string, { value: string; expiresAt: number }> = new Map();

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

  put(key: string, value: string, ttlSeconds: number): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }
}

var FakeCacheAdapter = InMemoryCacheAdapter;
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
