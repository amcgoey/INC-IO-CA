/**
 * @file index.ts
 * @description Centralized domain test harness re-exporting pure in-memory test doubles.
 */

export * from "./fakes/FakeLogRepository";
export * from "./fakes/FakeDriveFilingRepository";
export * from "./fakes/FakePdfDocumentService";
export * from "./fakes/FakeAiAnalysisAdapter";
export * from "./fakes/FakeDriveNameProvider";
export * from "./fakes/FakeCacheAdapter";
export * from "./fakes/InMemorySheetStorageAdapter";

const { FakeLogRepository } = require("./fakes/FakeLogRepository");
const { FakeDriveFilingRepository } = require("./fakes/FakeDriveFilingRepository");
const { FakePdfDocumentService } = require("./fakes/FakePdfDocumentService");
const { FakeAiAnalysisAdapter } = require("./fakes/FakeAiAnalysisAdapter");
const { FakeDriveNameProvider } = require("./fakes/FakeDriveNameProvider");
const { InMemoryCacheAdapter, FakeCacheAdapter } = require("./fakes/FakeCacheAdapter");
const { InMemorySheetStorageAdapter, FakeSheetStorageAdapter } = require("./fakes/InMemorySheetStorageAdapter");


declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeLogRepository,
    FakeDriveFilingRepository,
    FakePdfDocumentService,
    FakeAiAnalysisAdapter,
    FakeDriveNameProvider,
    InMemoryCacheAdapter,
    FakeCacheAdapter,
    InMemorySheetStorageAdapter,
    FakeSheetStorageAdapter
  };
}
