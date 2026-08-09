import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { BatchMigrationEngine, BatchManifestRepository, ContinuationTriggerAdapter } from "../src/core/log/BatchMigrationEngine.ts";
import { GasTimeoutBudget } from "../src/core/log/GasTimeoutBudget.ts";
import { MigrationBatchManifestData, deserializeManifest, serializeManifest } from "../src/core/log/MigrationBatchManifest.ts";
import { FakeSpreadsheetLockAdapter } from "../src/adapters/fakes/FakeSpreadsheetLockAdapter.ts";
import { InMemorySheetStorageAdapter } from "./harness/fakes/InMemorySheetStorageAdapter.ts";
import { DocumentFieldSpec } from "../src/types.ts";

class MemoryManifestRepository implements BatchManifestRepository {
  public content: string | null = null;
  getManifest(): MigrationBatchManifestData | null {
    return this.content ? deserializeManifest(this.content) : null;
  }
  saveManifest(manifest: MigrationBatchManifestData): void {
    this.content = serializeManifest(manifest);
  }
}

class FakeTriggerAdapter implements ContinuationTriggerAdapter {
  public scheduledTriggers: string[] = [];
  public deletedTriggers: string[] = [];

  scheduleContinuationTrigger(delaySeconds: number): string {
    const id = `trig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.scheduledTriggers.push(id);
    return id;
  }
  deleteContinuationTrigger(triggerId: string): void {
    this.deletedTriggers.push(triggerId);
  }
}

const sampleFieldSpecs: DocumentFieldSpec[] = [
  { key: "submittalNum", header: "Submittal #", label: "Submittal #", type: "STRING", required: true },
  { key: "title", header: "Title", label: "Title", type: "STRING" },
  { key: "calculatedCol", header: "Calc Column", label: "Calc Column", type: "STRING", isCalculated: true }
];

describe("BatchMigrationEngine", () => {
  let manifestRepo: MemoryManifestRepository;
  let lockAdapter: FakeSpreadsheetLockAdapter;
  let triggerAdapter: FakeTriggerAdapter;
  let storageMap: Map<string, InMemorySheetStorageAdapter>;

  const getStorage = (id: string): InMemorySheetStorageAdapter => {
    if (!storageMap.has(id)) {
      const storage = new InMemorySheetStorageAdapter();
      // Setup initial sheet data
      storage.setSheetValues("Submittal Arch Log", [
        ["Submittal #", "Title", "Calc Column"],
        ["=FormulaRow", "=FormulaRow", "=FormulaRow"],
        ["SUB-001", "Foundation Plan", "FormulaVal1"],
        ["SUB-002", "Framing Plan", "FormulaVal2"]
      ]);
      storage.setSheetValues("_Config", [["Key", "Value"]]);
      storage.setSheetValues("_AuditLog", [["Timestamp", "Category", "EventType", "Actor", "Status", "Details"]]);
      storageMap.set(id, storage);
    }
    return storageMap.get(id)!;
  };

  beforeEach(() => {
    manifestRepo = new MemoryManifestRepository();
    lockAdapter = new FakeSpreadsheetLockAdapter();
    triggerAdapter = new FakeTriggerAdapter();
    storageMap = new Map();
  });

  it("initializes batch manifest across target workbooks", () => {
    const timekeeper = new GasTimeoutBudget(270000);
    const engine = new BatchMigrationEngine(getStorage, manifestRepo, lockAdapter, timekeeper, triggerAdapter);

    const manifest = engine.initializeBatch("batch_test_101", [
      { spreadsheetId: "1WB_1", spreadsheetName: "Workbook 1", targetTabName: "Submittal Arch Log" },
      { spreadsheetId: "1WB_2", spreadsheetName: "Workbook 2", targetTabName: "Submittal Arch Log" }
    ]);

    assert.strictEqual(manifest.batchId, "batch_test_101");
    assert.strictEqual(manifest.batchStatus, "PHASE_1_ROW_MIGRATION");
    assert.strictEqual(manifest.entries.length, 2);
    assert.strictEqual(manifestRepo.getManifest()?.batchId, "batch_test_101");
  });

  it("executes Phase 1 row migration across workbooks successfully", () => {
    const timekeeper = new GasTimeoutBudget(270000);
    const engine = new BatchMigrationEngine(getStorage, manifestRepo, lockAdapter, timekeeper, triggerAdapter);

    const initialManifest = engine.initializeBatch("batch_test_102", [
      { spreadsheetId: "1WB_1", spreadsheetName: "Workbook 1", targetTabName: "Submittal Arch Log" },
      { spreadsheetId: "1WB_2", spreadsheetName: "Workbook 2", targetTabName: "Submittal Arch Log" }
    ]);

    const result = engine.runBatch(initialManifest, sampleFieldSpecs);
    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.manifest.batchStatus, "COMPLETED");
    assert.strictEqual(result.manifest.entries[0].status, "COMPLETED");
    assert.strictEqual(result.manifest.entries[1].status, "COMPLETED");

    // Verify lock released
    assert.strictEqual(lockAdapter.isLocked("1WB_1"), false);
    assert.strictEqual(lockAdapter.isLocked("1WB_2"), false);
  });

  it("evaluates 270s quota timekeeper soft cutoff between workbooks and schedules continuation trigger", () => {
    let mockNow = 0;
    const timeProvider = () => mockNow;
    const timekeeper = new GasTimeoutBudget(1000, 200, timeProvider);
    const engine = new BatchMigrationEngine(getStorage, manifestRepo, lockAdapter, timekeeper, triggerAdapter);

    const initialManifest = engine.initializeBatch("batch_test_103", [
      { spreadsheetId: "1WB_1", spreadsheetName: "Workbook 1", targetTabName: "Submittal Arch Log" },
      { spreadsheetId: "1WB_2", spreadsheetName: "Workbook 2", targetTabName: "Submittal Arch Log" }
    ]);

    // Simulate time advancing past threshold after workbook 1 completes
    engine.onWorkbookCompleteCallback = (spreadsheetId) => {
      if (spreadsheetId === "1WB_1") {
        mockNow = 850; // Remaining 150ms < 200ms threshold -> timeout between workbooks
      }
    };

    const result = engine.runBatch(initialManifest, sampleFieldSpecs);
    assert.strictEqual(result.status, "PAUSED_TIMEOUT");
    assert.strictEqual(result.manifest.batchStatus, "PAUSED_TIMEOUT");
    assert.strictEqual(result.manifest.entries[0].status, "MIGRATION_COMPLETE");
    assert.strictEqual(result.manifest.entries[1].status, "PENDING");

    // Continuation trigger scheduled
    assert.strictEqual(triggerAdapter.scheduledTriggers.length, 1);
  });

  it("executes transactional rollback on mid-write timeout, releases locks, and pauses", () => {
    const timekeeper = new GasTimeoutBudget(270000);
    const engine = new BatchMigrationEngine(getStorage, manifestRepo, lockAdapter, timekeeper, triggerAdapter);

    const initialManifest = engine.initializeBatch("batch_test_104", [
      { spreadsheetId: "1WB_1", spreadsheetName: "Workbook 1", targetTabName: "Submittal Arch Log" }
    ]);

    const result = engine.runBatch(initialManifest, sampleFieldSpecs, {
      forceTimeoutOnSpreadsheetId: "1WB_1"
    });

    assert.strictEqual(result.status, "PAUSED_TIMEOUT");
    assert.strictEqual(result.manifest.entries[0].status, "PAUSED_TIMEOUT");
    assert.strictEqual(lockAdapter.isLocked("1WB_1"), false);
    assert.strictEqual(triggerAdapter.scheduledTriggers.length, 1);
  });

  it("per-workbook failure isolation: failing workbook marks FAILED and skips to remaining workbooks", () => {
    const timekeeper = new GasTimeoutBudget(270000);
    const engine = new BatchMigrationEngine(getStorage, manifestRepo, lockAdapter, timekeeper, triggerAdapter);

    const initialManifest = engine.initializeBatch("batch_test_105", [
      { spreadsheetId: "1WB_FAIL", spreadsheetName: "Workbook Bad", targetTabName: "Submittal Arch Log" },
      { spreadsheetId: "1WB_GOOD", spreadsheetName: "Workbook Good", targetTabName: "Submittal Arch Log" }
    ]);

    const result = engine.runBatch(initialManifest, sampleFieldSpecs, {
      forceFailureOnSpreadsheetId: "1WB_FAIL"
    });

    assert.strictEqual(result.manifest.entries[0].status, "FAILED");
    assert.strictEqual(result.manifest.entries[1].status, "COMPLETED");

    // Check _AuditLog on failing workbook
    const badStorage = getStorage("1WB_FAIL");
    const auditRows = badStorage.getSheetValues("_AuditLog");
    assert.ok(auditRows && auditRows.length >= 2);
    const lastAudit = auditRows[auditRows.length - 1];
    assert.strictEqual(lastAudit[1], "MIGRATION");
    assert.strictEqual(lastAudit[4], "FAILED");
  });

  it("resumes cleanly from PAUSED_TIMEOUT state and completes all workbooks", () => {
    let mockNow = 0;
    const timeProvider = () => mockNow;
    const timekeeper = new GasTimeoutBudget(1000, 200, timeProvider);
    const engine = new BatchMigrationEngine(getStorage, manifestRepo, lockAdapter, timekeeper, triggerAdapter);

    const initialManifest = engine.initializeBatch("batch_test_106", [
      { spreadsheetId: "1WB_1", spreadsheetName: "Workbook 1", targetTabName: "Submittal Arch Log" },
      { spreadsheetId: "1WB_2", spreadsheetName: "Workbook 2", targetTabName: "Submittal Arch Log" }
    ]);

    engine.onWorkbookCompleteCallback = (spreadsheetId) => {
      if (spreadsheetId === "1WB_1") {
        mockNow = 850;
      }
    };

    // Run 1: Pauses after WB 1
    const run1 = engine.runBatch(initialManifest, sampleFieldSpecs);
    assert.strictEqual(run1.status, "PAUSED_TIMEOUT");

    // Reset time for resumption
    mockNow = 0;
    timekeeper.start();
    engine.onWorkbookCompleteCallback = undefined;

    // Run 2: Resume
    const run2 = engine.runBatch(run1.manifest, sampleFieldSpecs);
    assert.strictEqual(run2.status, "COMPLETED");
    assert.strictEqual(run2.manifest.entries[0].status, "COMPLETED");
    assert.strictEqual(run2.manifest.entries[1].status, "COMPLETED");
  });
});
