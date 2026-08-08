/**
 * @file FakeCacheAdapter.ts
 * @description Re-export promoted FakeCacheAdapter from src/adapters/fakes/FakeCacheAdapter for test harness backwards compatibility.
 */

export * from "../../../src/adapters/fakes/FakeCacheAdapter";

const { InMemoryCacheAdapter, FakeCacheAdapter } = require("../../../src/adapters/fakes/FakeCacheAdapter");

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    InMemoryCacheAdapter,
    FakeCacheAdapter
  };
}
