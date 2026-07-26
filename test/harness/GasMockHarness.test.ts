import test from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./GasMockHarness";

test.afterEach(() => {
  GasMockHarness.uninstall();
});

test("GasMockHarness.install attaches CONFIG, CacheService, and PropertiesService to globalThis", () => {
  GasMockHarness.install();

  assert.ok((globalThis as any).CONFIG, "globalThis.CONFIG should be attached");
  assert.ok((globalThis as any).CacheService, "globalThis.CacheService should be attached");
  assert.ok((globalThis as any).PropertiesService, "globalThis.PropertiesService should be attached");

  assert.strictEqual(typeof (globalThis as any).CacheService.getUserCache, "function");
  assert.strictEqual(typeof (globalThis as any).CacheService.getScriptCache, "function");
  assert.strictEqual(typeof (globalThis as any).CacheService.getDocumentCache, "function");

  assert.strictEqual(typeof (globalThis as any).PropertiesService.getScriptProperties, "function");
  assert.strictEqual(typeof (globalThis as any).PropertiesService.getUserProperties, "function");
  assert.strictEqual(typeof (globalThis as any).PropertiesService.getDocumentProperties, "function");
});

test("PropertiesService stubs store and retrieve properties per scope", () => {
  const harness = GasMockHarness.install();

  const scriptProps = (globalThis as any).PropertiesService.getScriptProperties();
  const userProps = (globalThis as any).PropertiesService.getUserProperties();

  scriptProps.setProperty("API_KEY", "secret-script-key");
  userProps.setProperty("USER_THEME", "dark");

  assert.strictEqual(scriptProps.getProperty("API_KEY"), "secret-script-key");
  assert.strictEqual(scriptProps.getProperty("USER_THEME"), null);

  assert.strictEqual(userProps.getProperty("USER_THEME"), "dark");
  assert.strictEqual(userProps.getProperty("API_KEY"), null);

  scriptProps.setProperties({ FOO: "bar", BAZ: "qux" });
  assert.deepStrictEqual(scriptProps.getProperties(), {
    API_KEY: "secret-script-key",
    FOO: "bar",
    BAZ: "qux"
  });

  scriptProps.deleteProperty("FOO");
  assert.strictEqual(scriptProps.getProperty("FOO"), null);

  scriptProps.deleteAllProperties();
  assert.deepStrictEqual(scriptProps.getProperties(), {});
});

test("CacheService stubs store, retrieve, and remove items per scope", () => {
  const harness = GasMockHarness.install();

  const userCache = (globalThis as any).CacheService.getUserCache();
  const scriptCache = (globalThis as any).CacheService.getScriptCache();

  userCache.put("token", "user-token-123", 300);
  scriptCache.put("token", "script-token-456", 300);

  assert.strictEqual(userCache.get("token"), "user-token-123");
  assert.strictEqual(scriptCache.get("token"), "script-token-456");

  userCache.putAll({ a: "1", b: "2" });
  assert.deepStrictEqual(userCache.getAll(["a", "b", "c"]), { a: "1", b: "2" });

  userCache.remove("a");
  assert.strictEqual(userCache.get("a"), null);

  userCache.removeAll(["b", "token"]);
  assert.strictEqual(userCache.get("b"), null);
  assert.strictEqual(userCache.get("token"), null);
});

test("CacheService respects TSL�expiration", () => {
  const harness = GasMockHarness.install();
  const cache = harness.userCache;

  cache.put("expiringKey", "val", -1);
  assert.strictEqual(cache.get("expiringKey"), null);
});

test("GasMockHarness.reset purges stored state and call histories across test runs", () => {
  const harness = GasMockHarness.install();

  harness.scriptProperties.getProperty("PROP1");
  harness.userCache.put("CACHE1", "VAL1");
  assert.ok(harness.scriptProperties.calls.length > 0);
  assert.ok(harness.userCache.calls.length > 0);

  GasMockHarness.reset();

  assert.strictEqual(harness.scriptProperties.calls.length, 0);
  assert.strictEqual(harness.userCache.calls.length, 0);

  assert.strictEqual(harness.scriptProperties.getProperty("PROP1"), null);
  assert.strictEqual(harness.userCache.get("CACHE1"), null);
});

test("GasMockHarness.install() purges prior state when re-installed", () => {
  GasMockHarness.install();
  (globalThis as any).PropertiesService.getScriptProperties().setProperty("DIRTY", "VALUE");
  assert.strictEqual((globalThis as any).PropertiesService.getScriptProperties().getProperty("DIRTY"), "VALUE");

  GasMockHarness.install();
  assert.strictEqual((globalThis as any).PropertiesService.getScriptProperties().getProperty("DIRTY"), null);
});

test("GasMockHarness allows custom CONFIG overrides and resets clean", () => {
  GasMockHarness.install({
    configOverrides: {
      TARGET_FOLDER_NAME: "CustomFolder"
    }
  });

  assert.strictEqual((globalThis as any).CONFIG.TARGET_FOLDER_NAME, "CustomFolder");

  GasMockHarness.reset();

  assert.strictEqual((globalThis as any).CONFIG.TARGET_FOLDER_NAME, "Submittals");
});

test("GasMockHarness.uninstall restores original globalThis bindings", () => {
  (globalThis as any).PropertiesService = "original-properties-service";

  GasMockHarness.install();
  assert.notStrictEqual((globalThis as any).PropertiesService, "original-properties-service");

  GasMockHarness.uninstall();
  assert.strictEqual((globalThis as any).PropertiesService, "original-properties-service");
});
