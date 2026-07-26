// src/CacheAdapter.ts

interface CacheAdapter {
  get(key: string): string | null;
  put(key: string, value: string, ttlSeconds: number): void;
}

class GoogleScriptCacheAdapter implements CacheAdapter {
  get(key: string): string | null {
    try {
      if (typeof CacheService !== "undefined" && CacheService.getUserCache) {
        const cache = CacheService.getUserCache();
        if (cache) {
          const val = cache.get(key);
          return val !== null ? val : null;
        }
      }
    } catch (e) {
      // Fail silently if CacheService fails or is inaccessible
    }
    return null;
  }

  put(key: string, value: string, ttlSeconds: number): void {
    try {
      if (typeof CacheService !== "undefined" && CacheService.getUserCache) {
        const cache = CacheService.getUserCache();
        if (cache) {
          cache.put(key, value, ttlSeconds);
        }
      }
    } catch (e) {
      // Fail silently if CacheService fails
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

var defaultCacheAdapter: CacheAdapter = new GoogleScriptCacheAdapter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleScriptCacheAdapter,
    InMemoryCacheAdapter,
    defaultCacheAdapter
  };
}
