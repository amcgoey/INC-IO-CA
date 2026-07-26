import test from "node:test";
import assert from "node:assert";
const { InMemoryCacheAdapter } = require("../src/CacheAdapter");
const { FakeDriveNameProvider, GoogleDriveNameProvider, defaultDriveNameProvider } = require("../src/DriveNameProvider");

test("FakeDriveNameProvider returns default empty array or initial names", () => {
  const fake1 = new FakeDriveNameProvider();
  assert.deepStrictEqual(fake1.getAvailableDriveNames(), []);

  const fake2 = new FakeDriveNameProvider(["Drive Alpha", "Drive Beta"]);
  assert.deepStrictEqual(fake2.getAvailableDriveNames(), ["Drive Alpha", "Drive Beta"]);
});

test("FakeDriveNameProvider updates drive names with setDriveNames", () => {
  const fake = new FakeDriveNameProvider(["Drive 1"]);
  fake.setDriveNames(["Drive 2", "Drive 3"]);
  assert.deepStrictEqual(fake.getAvailableDriveNames(), ["Drive 2", "Drive 3"]);
});

test("FakeDriveNameProvider returns defensive copy", () => {
  const initial = ["Drive A"];
  const fake = new FakeDriveNameProvider(initial);
  const result = fake.getAvailableDriveNames();
  result.push("Drive B");
  assert.deepStrictEqual(fake.getAvailableDriveNames(), ["Drive A"]);
});

test("GoogleDriveNameProvider returns empty array when Drive is undefined and cache is empty", () => {
  delete (globalThis as any).Drive;
  const cache = new InMemoryCacheAdapter();
  const provider = new GoogleDriveNameProvider(cache);
  assert.deepStrictEqual(provider.getAvailableDriveNames(), []);
});

test("GoogleDriveNameProvider fetches drives from Drive.Drives.list and caches result", () => {
  let listCalls = 0;
  (globalThis as any).Drive = {
    Drives: {
      list: (opts: any) => {
        listCalls++;
        if (opts.pageToken === "page2") {
          return { items: [{ id: "d3", name: "Drive Gamma" }] };
        }
        return {
          items: [{ id: "d1", name: "Drive Alpha" }, { id: "d2", name: "Drive Beta" }],
          nextPageToken: "page2"
        };
      }
    }
  };

  const cache = new InMemoryCacheAdapter();
  const provider = new GoogleDriveNameProvider(cache);

  const names1 = provider.getAvailableDriveNames();
  assert.deepStrictEqual(names1, ["Drive Alpha", "Drive Beta", "Drive Gamma"]);
  assert.strictEqual(listCalls, 2);

  // Subsequent call should use cache without calling Drive API again
  const names2 = provider.getAvailableDriveNames();
  assert.deepStrictEqual(names2, ["Drive Alpha", "Drive Beta", "Drive Gamma"]);
  assert.strictEqual(listCalls, 2);

  delete (globalThis as any).Drive;
});

test("GoogleDriveNameProvider handles Drive API errors gracefully", () => {
  (globalThis as any).Drive = {
    Drives: {
      list: () => {
        throw new Error("Drive API unavailable");
      }
    }
  };

  const cache = new InMemoryCacheAdapter();
  const provider = new GoogleDriveNameProvider(cache);
  assert.deepStrictEqual(provider.getAvailableDriveNames(), []);

  delete (globalThis as any).Drive;
});
