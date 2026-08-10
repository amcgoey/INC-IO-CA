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
export * from "../../src/adapters/fakes/FakeSpreadsheetLockAdapter";
export * from "../../src/adapters/fakes/FakeUserInterfacePresenter";
export * from "./fakes/InMemorySheetStorageAdapter";
export * from "./TestContext";

