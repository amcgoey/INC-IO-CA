import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createDefaultManifest,
  serializeManifest,
  deserializeManifest,
  getPendingOrPausedPhase1Entries,
  getCompletedPhase1Entries,
  isPhase1Complete,
  isBatchFinished,
  MigrationBatchManifestData
} from "../src/core/log/MigrationBatchManifest.ts";

describe("MigrationBatchManifest", () => {
  it("creates a default batch manifest in PHASE_1_ROW_MIGRATION state", () => {
    const manifest = createDefaultManifest("batch_001", [
      { spreadsheetId: "1SRC_1", spreadsheetName: "Log Project A" },
      { spreadsheetId: "1SRC_2", spreadsheetName: "Log Project B", targetTabName: "Submittal Arch Log" }
    ]);

    assert.strictEqual(manifest.batchId, "batch_001");
    assert.strictEqual(manifest.batchStatus, "PHASE_1_ROW_MIGRATION");
    assert.strictEqual(manifest.entries.length, 2);
    assert.strictEqual(manifest.entries[0].status, "PENDING");
    assert.strictEqual(manifest.entries[1].targetTabName, "Submittal Arch Log");
  });

  it("serializes and deserializes manifest JSON accurately", () => {
    const original = createDefaultManifest("batch_002", [
      { spreadsheetId: "1SRC_1", spreadsheetName: "Log Project A" }
    ]);
    const json = serializeManifest(original);
    const restored = deserializeManifest(json);

    assert.deepStrictEqual(restored, original);
  });

  it("filters entries by Phase 1 progress state", () => {
    const manifest = createDefaultManifest("batch_003", [
      { spreadsheetId: "1SRC_1", spreadsheetName: "Log Project A" },
      { spreadsheetId: "1SRC_2", spreadsheetName: "Log Project B" },
      { spreadsheetId: "1SRC_3", spreadsheetName: "Log Project C" }
    ]);

    manifest.entries[0].status = "MIGRATION_COMPLETE";
    manifest.entries[1].status = "FAILED";
    manifest.entries[2].status = "PAUSED_TIMEOUT";

    const pendingOrPaused = getPendingOrPausedPhase1Entries(manifest);
    assert.strictEqual(pendingOrPaused.length, 1);
    assert.strictEqual(pendingOrPaused[0].spreadsheetId, "1SRC_3");

    const completedPhase1 = getCompletedPhase1Entries(manifest);
    assert.strictEqual(completedPhase1.length, 1);
    assert.strictEqual(completedPhase1[0].spreadsheetId, "1SRC_1");
  });

  it("evaluates when Phase 1 and overall batch are complete", () => {
    const manifest = createDefaultManifest("batch_004", [
      { spreadsheetId: "1SRC_1", spreadsheetName: "Log Project A" },
      { spreadsheetId: "1SRC_2", spreadsheetName: "Log Project B" }
    ]);

    assert.strictEqual(isPhase1Complete(manifest), false);
    assert.strictEqual(isBatchFinished(manifest), false);

    manifest.entries[0].status = "MIGRATION_COMPLETE";
    manifest.entries[1].status = "FAILED";
    assert.strictEqual(isPhase1Complete(manifest), true);

    manifest.batchStatus = "COMPLETED";
    manifest.entries[0].status = "COMPLETED";
    assert.strictEqual(isBatchFinished(manifest), true);
  });
});
