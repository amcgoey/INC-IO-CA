import test from "node:test";
import assert from "node:assert";
const { GoogleScriptCacheAdapter, defaultCacheAdapter } = require("../src/CacheAdapter");
const { InMemoryCacheAdapter } = require("./harness/index");

test("InMemoryCacheAdapter returns null for non-existent key", () => {
  const cache = new InMemoryCacheAdapter();
  assert.strictEqual(cache.get("missing_key"), null);
});

test("InMemoryCacheAdapter stores and retrieves values", () => {
  const cache = new InMemoryCacheAdapter();
  cache.put("key1", "val1", 60);
  assert.strictEqual(cache.get("key1"), "val1");
});

test("InMemoryCacheAdapter updates value on overwrite", () => {
  const cache = new InMemoryCacheAdapter();
  cache.put("key1", "val1", 60);
  cache.put("key1", "val2", 60);
  assert.strictEqual(cache.get("key1"), "val2");
});

test("InMemoryCacheAdapter expires items after ttlSeconds", () => {
  const cache = new InMemoryCacheAdapter();
  cache.put("expiring_key", "expiring_val", -1);
  assert.strictEqual(cache.get("expiring_key"), null);
});

test("GoogleScriptCacheAdapter operates safely when CacheService is undefined", () => {
  delete (globalThis as any).CacheService;
  const cache = new GoogleScriptCacheAdapter();
  assert.strictEqual(cache.get("some_key"), null);
  assert.doesNotThrow(() => {
    cache.put("some_key", "some_val", 60);
  });
});

test("GoogleScriptCacheAdapter delegates to CacheService when available", () => {
  const store = new Map<string, string>();
  (globalThis as any).CacheService = {
    getUserCache: () => (	{
      get: (key: string) => store.get(key) ?? null,
      put: (key: string, value: string, ttl: number) => {
        store.set(key, value);
      }
    })
  };

  const cache = new GoogleScriptCacheAdapter();
  cache.put("user_key", "user_val", 300);
  assert.strictEqual(cache.get("user_key"), "user_val");

  delete (globalThis as any).CacheService;
});
