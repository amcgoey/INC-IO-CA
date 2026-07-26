/**
 * @file FakeCacheAdapter.ts
 * @description In-memory fake implementation of `CacheAdapter` using Map and TTL checks.
 */

export class InMemoryCacheAdapter implements CacheAdapter {
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

export var FakeCacheAdapter = InMemoryCacheAdapter;
