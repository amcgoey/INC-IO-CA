import test from "node:test";
import assert from "node:assert";
import { parseMigrateBatchArgs, runMigrateBatchCli } from "../scripts/migrate-batch";
import { GasMockHarness } from "./harness/GasMockHarness";
import { InMemorySheetStorageAdapter } from "./harness/fakes/InMemorySheetStorageAdapter";
import { FakeSpreadsheetLockAdapter } from "../src/adapters/fakes/FakeSpreadsheetLockAdapter";
import { migrateBatchLogSpreadsheets } from "../src/Main";

test.beforeEach(() => {
  GasMockHarness.install();
});

test("parseMigrateBatchArgs - parses --batch-id, --spreadsheet-ids, --folder-id, --dry-run, --resume, and --timeout flags", () => {
  const argv = [
    "--batch-id=batch_cli_001",
    "--spreadsheet-ids=1WB_1,1WB_2",
    "--folder-id=1FOLDER_ID",
    "--dry-run",
    "--resume",
    "--timeout=200000"
  ];

  const parsed = parseMigrateBatchArgs(argv);
  assert.strictEqual(parsed.batchId, "batch_cli_001");
  assert.deepStrictEqual(parsed.spreadsheetIds, ["1WB_1", "1WB_2"]);
  assert.strictEqual(parsed.folderId, "1FOLDER_ID");
  assert.strictEqual(parsed.dryRun, true);
  assert.strictEqual(parsed.resume, true);
  assert.strictEqual(parsed.timeout, 200000);
});

test("runMigrateBatchCli - executes multi-workbook batch migration via CLI and returns run result", () => {
  const storageMap = new Map<string, InMemorySheetStorageAdapter>();
  const getStorage = (id: string) => {
    if (!storageMap.has(id)) {
      const storage = new InMemorySheetStorageAdapter();
      storage.setSheetValues("Submittal Arch Log", [
        ["Submittal #", "Title", "Calc Column"],
        ["=FormulaRow", "=FormulaRow", "=FormulaRow"],
        ["SUB-101", "Door Hardware", "Val"]
      ]);
      storageMap.set(id, storage);
    }
    return storageMap.get(id)!;
  };

  const result = runMigrateBatchCli(
    ["--batch-id=batch_cli_002", "--spreadsheet-ids=1CLI_1,1CLI_2"],
    getStorage
  );

  assert.ok(result);
  assert.strictEqual(result.status, "COMPLETED");
  assert.strictEqual(result.manifest.entries.length, 2);
  assert.strictEqual(result.manifest.entries[0].status, "COMPLETED");
  assert.strictEqual(result.manifest.entries[1].status, "COMPLETED");
});

test("migrateBatchLogSpreadsheets - GAS entry point executes multi-workbook batch migration under GasMockHarness", () => {
  const storageMap = new Map<string, InMemorySheetStorageAdapter>();
  const getStorage = (id: string) => {
    if (!storageMap.has(id)) {
      const storage = new InMemorySheetStorageAdapter();
      storage.setSheetValues("Submittal Arch Log", [
        ["Submittal #", "Title"],
        ["=FormulaRow", "=FormulaRow"],
        ["SUB-201", "Glazing"]
      ]);
      storageMap.set(id, storage);
    }
    return storageMap.get(id)!;
  };

  const result = migrateBatchLogSpreadsheets(["1GAS_1", "1GAS_2"], { getStorageAdapter: getStorage });
  assert.ok(result);
  assert.strictEqual(result.status, "COMPLETED");
});
