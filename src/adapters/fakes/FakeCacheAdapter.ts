/**
 * @file FakeCacheAdapter.ts
 * @description In-memory fake implementation of `CacheAdapter` using Map and TTL checks.
 */

export class InMemoryCacheAdapter implements CacheAdapter {
  private store: Map<string, { value: string; expiresAt: number }> = new Map();

  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
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

  remove(key: string): void {
    this.store.delete(key);
  }

  removeAll(keys: string[]): void {
    if (!keys || keys.length === 0) return;
    for (const key of keys) {
      this.store.delete(key);
    }
  }
}

export var FakeCacheAdapter = InMemoryCacheAdapter;

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    InMemoryCacheAdapter,
    FakeCacheAdapter
  };
}
