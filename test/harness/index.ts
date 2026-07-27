/**
 * @file index.ts
 * @description Centralized domain test harness re-exporting pure in-memory test doubles, GasMockHarness, CardSerializer, factories, and TestContext setup.
 */

export * from "./GasMockHarness";
export * from "./CardSerializer";
export * from "./CardServiceMocks";
export * from "./factories/DocumentFactory";
export * from "./factories/EventFactory";
export * from "./fakes/FakeLogRepository";
export * from "./fakes/FakeDriveFilingRepository";
export * from "./fakes/FakePdfDocumentService";
export * from "./fakes/FakeAiAnalysisAdapter";
export * from "./fakes/FakeDriveNameProvider";
export * from "./fakes/FakeCacheAdapter";
export * from "./fakes/InMemorySheetStorageAdapter";
export * from "./TestContext";

const { GasMockHarness } = require("./GasMockHarness");
const { CardSerializer } = require("./CardSerializer");
const { CardServiceMocks } = require("./CardServiceMocks");
const { DocumentFactory } = require("./factories/DocumentFactory");
const { EventFactory } = require("./factories/EventFactory");
const { FakeLogRepository } = require("./fakes/FakeLogRepository");
const { FakeDriveFilingRepository } = require("./fakes/FakeDriveFilingRepository");
const { FakePdfDocumentService } = require("./fakes/FakePdfDocumentService");
const { FakeAiAnalysisAdapter } = require("./fakes/FakeAiAnalysisAdapter");
const { FakeDriveNameProvider } = require("./fakes/FakeDriveNameProvider");
const { InMemoryCacheAdapter, FakeCacheAdapter } = require("./fakes/FakeCacheAdapter");
const { InMemorySheetStorageAdapter, FakeSheetStorageAdapter } = require("./fakes/InMemorySheetStorageAdapter");
const { TestContext, createTestContext } = require("./TestContext");

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GasMockHarness,
    CardSerializer,
    CardServiceMocks,
    DocumentFactory,
    EventFactory,
    FakeLogRepository,
    FakeDriveFilingRepository,
    FakePdfDocumentService,
    FakeAiAnalysisAdapter,
    FakeDriveNameProvider,
    InMemoryCacheAdapter,
    FakeCacheAdapter,
    InMemorySheetStorageAdapter,
    FakeSheetStorageAdapter,
    TestContext,
    createTestContext
  };
}

