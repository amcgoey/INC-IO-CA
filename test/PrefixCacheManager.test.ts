import test from "node:test";
import assert from "node:assert";
const { PrefixCacheManager } = require("../src/core/admin/PrefixCacheManager");
const { InMemoryCacheAdapter } = require("../src/adapters/fakes/FakeCacheAdapter");

test("PrefixCacheManager stores and retrieves scoped entries", () => {
  const cache = new InMemoryCacheAdapter();
  const manager = new PrefixCacheManager(cache);

  manager.putScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Submittal", '{"enabled":true}', 3600);
  assert.strictEqual(
    manager.getScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Submittal"),
    '{"enabled":true}'
  );
});

test("PrefixCacheManager removes single scoped key and updates index manifest", () => {
  const cache = new InMemoryCacheAdapter();
  const manager = new PrefixCacheManager(cache);

  manager.putScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Key1", "val1", 3600);
  manager.putScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Key2", "val2", 3600);

  manager.removeScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Key1");
  assert.strictEqual(manager.getScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Key1"), null);
  assert.strictEqual(manager.getScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Key2"), "val2");

  // Verify index key still contains Key2
  const rawIndex = cache.get("_INDEX_DOC_CONFIG_SHEET1");
  assert.notStrictEqual(rawIndex, null);
  assert.deepStrictEqual(JSON.parse(rawIndex!), ["DOC_CONFIG_SHEET1_Key2"]);
});

test("PrefixCacheManager invalidates all keys under prefix and removes index key without touching other scopes", () => {
  const cache = new InMemoryCacheAdapter();
  const manager = new PrefixCacheManager(cache);

  manager.putScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Submittal", "val1", 3600);
  manager.putScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Rfi", "val2", 3600);

  // Unrelated scope
  manager.putScoped("DOC_CONFIG_SHEET2", "DOC_CONFIG_SHEET2_Submittal", "val3", 3600);
  cache.put("AI_TRIAGE_123", "triage_val", 3600);

  manager.invalidatePrefix("DOC_CONFIG_SHEET1");

  // SHEET1 scope items and index should be gone
  assert.strictEqual(manager.getScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Submittal"), null);
  assert.strictEqual(manager.getScoped("DOC_CONFIG_SHEET1", "DOC_CONFIG_SHEET1_Rfi"), null);
  assert.strictEqual(cache.get("_INDEX_DOC_CONFIG_SHEET1"), null);

  // SHEET2 scope items and unrelated cache items should remain untouched
  assert.strictEqual(manager.getScoped("DOC_CONFIG_SHEET2", "DOC_CONFIG_SHEET2_Submittal"), "val3");
  assert.strictEqual(cache.get("AI_TRIAGE_123"), "triage_val");
});

test("PrefixCacheManager - manages _INDEX_DOC_CONFIG_<SpreadsheetId> manifests over CacheAdapter", () => {
  const cache = new InMemoryCacheAdapter();
  const manager = new PrefixCacheManager(cache);

  const spreadsheetId = "SHEET_179_TEST";
  const prefix = "DOC_CONFIG_" + spreadsheetId;
  const key1 = prefix + "_Submittal_Arch";
  const key2 = prefix + "_Submittal_FFE";

  manager.putScoped(prefix, key1, '{"schema":"arch"}', 3600);
  manager.putScoped(prefix, key2, '{"schema":"ffe"}', 3600);

  const manifestKey = "_INDEX_" + prefix;
  const manifestRaw = cache.get(manifestKey);
  assert.notStrictEqual(manifestRaw, null);

  const parsedKeys = JSON.parse(manifestRaw);
  assert.deepStrictEqual(parsedKeys.sort(), [key1, key2].sort());
});

test("PrefixCacheManager - calling invalidatePrefix('DOC_CONFIG_SHEET_179_EVIC') purges schema caches atomically via CacheAdapter.removeAll()", () => {
  const cache = new InMemoryCacheAdapter();
  const manager = new PrefixCacheManager(cache);

  const spreadsheetId = "SHEET_179_EVIC";
  const prefix = "DOC_CONFIG_" + spreadsheetId;
  const key1 = prefix + "_Submittal_Arch";
  const key2 = prefix + "_Submittal_FFE";

  manager.putScoped(prefix, key1, '{"schema":"arch"}', 3600);
  manager.putScoped(prefix, key2, '{"schema":"ffe"}', 3600);
  cache.put("UNRELATED_USER_DRAFT", "draft_data", 3600);

  manager.invalidatePrefix(prefix);

  assert.strictEqual(manager.getScoped(prefix, key1), null);
  assert.strictEqual(manager.getScoped(prefix, key2), null);
  assert.strictEqual(cache.get("_INDEX_" + prefix), null);
  assert.strictEqual(cache.get("UNRELATED_USER_DRAFT"), "draft_data");
});
