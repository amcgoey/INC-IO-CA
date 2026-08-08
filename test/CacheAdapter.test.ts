import test from "node:test";
import assert from "node:assert";
const { GoogleScriptCacheAdapter, defaultCacheAdapter } = require("../src/adapters/gas/GoogleScriptCacheAdapter");
const { InMemoryCacheAdapter, FakeSpreadsheetLockAdapter, FakeUserInterfacePresenter } = require("../src/adapters/fakes/FakeCacheAdapter");
const { FakeSpreadsheetLockAdapter: LockAdapter } = require("../src/adapters/fakes/FakeSpreadsheetLockAdapter");
const { FakeUserInterfacePresenter: UIPresenter } = require("../src/adapters/fakes/FakeUserInterfacePresenter");

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

test("InMemoryCacheAdapter removes single key and batch keys", () => {
  const cache = new InMemoryCacheAdapter();
  cache.put("k1", "v1", 60);
  cache.put("k2", "v2", 60);
  cache.put("k3", "v3", 60);

  cache.remove("k1");
  assert.strictEqual(cache.get("k1"), null);
  assert.strictEqual(cache.get("k2"), "v2");

  cache.removeAll(["k2", "k3"]);
  assert.strictEqual(cache.get("k2"), null);
  assert.strictEqual(cache.get("k3"), null);
});

test("GoogleScriptCacheAdapter operates safely when CacheService is undefined", () => {
  delete (globalThis as any).CacheService;
  const cache = new GoogleScriptCacheAdapter();
  assert.strictEqual(cache.get("some_key"), null);
  assert.doesNotThrow(() => {
    cache.put("some_key", "some_val", 60);
    cache.remove("some_key");
    cache.removeAll(["some_key"]);
  });
});

test("GoogleScriptCacheAdapter delegates to CacheService when available", () => {
  const store = new Map<string, string>();
  (globalThis as any).CacheService = {
    getUserCache: () => ({
      get: (key: string) => store.get(key) ?? null,
      put: (key: string, value: string, ttl: number) => {
        store.set(key, value);
      },
      remove: (key: string) => {
        store.delete(key);
      },
      removeAll: (keys: string[]) => {
        for (const k of keys) store.delete(k);
      }
    })
  };

  const cache = new GoogleScriptCacheAdapter();
  cache.put("user_key", "user_val", 300);
  assert.strictEqual(cache.get("user_key"), "user_val");

  cache.remove("user_key");
  assert.strictEqual(cache.get("user_key"), null);

  cache.put("k1", "v1", 300);
  cache.put("k2", "v2", 300);
  cache.removeAll(["k1", "k2"]);
  assert.strictEqual(cache.get("k1"), null);
  assert.strictEqual(cache.get("k2"), null);

  delete (globalThis as any).CacheService;
});

test("FakeSpreadsheetLockAdapter acquires, checks, and releases locks cleanly", () => {
  const lockAdapter = new LockAdapter();
  const sheetId = "sheet_123";

  assert.strictEqual(lockAdapter.isLocked(sheetId), false);
  const execId = lockAdapter.acquireLock(sheetId, 5000);
  assert.ok(execId);
  assert.strictEqual(lockAdapter.isLocked(sheetId), true);

  // Attempting second lock fails
  assert.strictEqual(lockAdapter.acquireLock(sheetId), null);

  // Release with incorrect execId fails
  assert.strictEqual(lockAdapter.releaseLock(sheetId, "wrong_id"), false);

  // Release with correct execId succeeds
  assert.strictEqual(lockAdapter.releaseLock(sheetId, execId), true);
  assert.strictEqual(lockAdapter.isLocked(sheetId), false);
});

test("FakeUserInterfacePresenter records call outcomes for unit testing", () => {
  const presenter = new UIPresenter();
  const dummyEvent = { parameter: { test: "1" } };

  presenter.presentValidationError(dummyEvent, ["Error 1"], ["FieldA"]);
  presenter.presentNotification("Hello Toast");

  assert.strictEqual(presenter.calls.length, 2);
  assert.strictEqual(presenter.calls[0].method, "presentValidationError");
  assert.strictEqual(presenter.calls[1].method, "presentNotification");
});
