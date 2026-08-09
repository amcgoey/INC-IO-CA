/**
 * @file migrate-log.test.ts
 * @description Unit tests for CLI entry point parseMigrateLogArgs, runMigrateLogCli, and GAS function migrateLogSpreadsheet.
 */

import test from "node:test";
import assert from "node:assert";
import { parseMigrateLogArgs, runMigrateLogCli } from "../scripts/migrate-log";
import { GasMockHarness } from "./harness/GasMockHarness";
import { InMemorySheetStorageAdapter } from "./harness/fakes/InMemorySheetStorageAdapter";

import { FakeSpreadsheetLockAdapter } from "../src/adapters/fakes/FakeSpreadsheetLockAdapter";

test.beforeEach(() => {
  GasMockHarness.install();
});

test("parseMigrateLogArgs - correctly parses --source, --target, --dry-run, and --tab flags", () => {
  const argv = [
    "--source=1SOURCE_ID",
    "--target=1TARGET_ID",
    "--dry-run",
    "--tab=Submittal FFE"
  ];

  const parsed = parseMigrateLogArgs(argv);
  assert.strictEqual(parsed.source, "1SOURCE_ID");
  assert.strictEqual(parsed.target, "1TARGET_ID");
  assert.strictEqual(parsed.dryRun, true);
  assert.strictEqual(parsed.tabName, "Submittal FFE");
});

test("runMigrateLogCli - executes Pass 1 dry-run audit via CLI and returns MigrationAuditReport", () => {
  const argv = ["--source=1SRC_101", "--target=1TGT_101", "--dry-run"];
  const report = runMigrateLogCli(argv);

  assert.ok(report);
  assert.strictEqual(report.canProceed, true);
  assert.strictEqual(typeof report.sourceDataRowCount, "number");
  assert.ok(Array.isArray(report.legacyCalculatedFormulaDiscrepancies));
});

test("migrateLogSpreadsheet - GAS function executes dry-run audit under GasMockHarness", () => {
  const { migrateLogSpreadsheet } = require("../src/Main");
  const storageAdapter = new InMemorySheetStorageAdapter();

  const report = migrateLogSpreadsheet("1SRC_GAS", "1TGT_GAS", { dryRun: true, storageAdapter });
  assert.ok(report);
  assert.strictEqual(typeof report.canProceed, "boolean");
});


test("runMigrateLogCli - executes live migration via CLI when --dry-run is absent", () => {
  const storageAdapter = new InMemorySheetStorageAdapter();
  storageAdapter.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["033000", "Concrete", "=TODAY()-C3"]
  ]);

  const result = runMigrateLogCli(["--source=1SRC", "--target=1TGT"], storageAdapter);
  assert.strictEqual(result.status, "MIGRATION_COMMITTED");
  assert.strictEqual(result.sourceDataRowCount, 1);
  assert.strictEqual(result.targetAppendedRowCount, 1);
});

test("migrateLogSpreadsheet - executes live migration via GAS function when dryRun: false", () => {
  const storageAdapter = new InMemorySheetStorageAdapter();
  storageAdapter.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["051200", "Steel", "12"]
  ]);

  const lockAdapter = new FakeSpreadsheetLockAdapter();
  const result = migrateLogSpreadsheet("1SRC_GAS", "1TGT_GAS", {
    dryRun: false,
    storageAdapter,
    lockAdapter
  });

  assert.strictEqual(result.status, "MIGRATION_COMMITTED");
  assert.strictEqual(result.sourceDataRowCount, 1);
  assert.strictEqual(result.targetAppendedRowCount, 1);
});
