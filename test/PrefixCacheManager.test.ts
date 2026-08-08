import test from "node:test";
import assert from "node:assert";
const { PrefixCacheManager } = require("../src/PrefixCacheManager");
const { InMemoryCacheAdapter } = require("./harness/index");

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
