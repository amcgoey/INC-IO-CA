/**
 * @file LogMigrationEngine.test.ts
 * @description Unit tests for LogMigrationEngine legacy backup tab preservation,
 * tab taxonomy ordering (Log -> Support -> System -> Backup), and atomic snapshot creation.
 */

import test from "node:test";
import assert from "node:assert";
import {
  LogMigrationEngine,
  classifyTabRole,
  getOrderedTabNames,
  verifyTabTaxonomyOrder
} from "../src/core/log/LogMigrationEngine";
import { InMemorySheetStorageAdapter } from "./harness/fakes/InMemorySheetStorageAdapter";

test("classifyTabRole - correctly categorizes workbook tabs into 5-tier taxonomy", () => {
  assert.strictEqual(classifyTabRole("Submittal Arch"), "LOG");
  assert.strictEqual(classifyTabRole("Submittal FFE"), "LOG");
  assert.strictEqual(classifyTabRole("Submittal Arch Support"), "SUPPORT");
  assert.strictEqual(classifyTabRole("Submittal FFE Support"), "SUPPORT");
  assert.strictEqual(classifyTabRole("_Shared"), "SYSTEM");
  assert.strictEqual(classifyTabRole("_Config"), "SYSTEM");
  assert.strictEqual(classifyTabRole("_AuditLog"), "SYSTEM");
  assert.strictEqual(classifyTabRole("_Backup_Submittal Arch_20260808"), "BACKUP");
  assert.strictEqual(classifyTabRole("_Backup_Legacy_Data"), "BACKUP");
  assert.strictEqual(classifyTabRole("User Custom Scratch"), "USER");
});

test("getOrderedTabNames - sorts tabs in canonical order: Log -> Support -> System -> Backup", () => {
  const unordered = [
    "_Config",
    "_Backup_Submittal_Arch_20260101",
    "Submittal FFE Support",
    "_Shared",
    "Submittal Arch",
    "_AuditLog",
    "Submittal FFE",
    "Submittal Arch Support",
    "_Backup_Legacy_FF_E"
  ];

  const ordered = getOrderedTabNames(unordered);

  const expected = [
    "Submittal Arch",
    "Submittal FFE",
    "Submittal Arch Support",
    "Submittal FFE Support",
    "_Shared",
    "_Config",
    "_AuditLog",
    "_Backup_Submittal_Arch_20260101",
    "_Backup_Legacy_FF_E"
  ];

  assert.deepStrictEqual(ordered, expected);
});

test("verifyTabTaxonomyOrder - returns valid for correct tab taxonomy order", () => {
  const validTabs = [
    "Submittal Arch",
    "Submittal FFE",
    "Submittal Arch Support",
    "Submittal FFE Support",
    "_Shared",
    "_Config",
    "_AuditLog",
    "_Backup_Old_Log_2025"
  ];

  const result = verifyTabTaxonomyOrder(validTabs);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test("verifyTabTaxonomyOrder - detects misplaced backup tab before system tab", () => {
  const invalidTabs = [
    "Submittal Arch",
    "Submittal FFE",
    "_Backup_Old_Log_2025",
    "_Shared",
    "_Config",
    "_AuditLog"
  ];

  const result = verifyTabTaxonomyOrder(invalidTabs);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("Backup tab '_Backup_Old_Log_2025' must be placed at the far right")));
});

test("verifyTabTaxonomyOrder - detects system tab before support tab", () => {
  const invalidTabs = [
    "Submittal Arch",
    "_Config",
    "Submittal Arch Support",
    "_Shared",
    "_AuditLog"
  ];

  const result = verifyTabTaxonomyOrder(invalidTabs);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("System tab '_Config' appears before support tab")));
});

test("LogMigrationEngine - preserveBackupTabs retains all legacy _Backup_*tabs unmodified at the far right", () => {
  const adapter = new InMemorySheetStorageAdapter();
  adapter.setRowValues("Submittal Arch", 1, ["Section"], ["Section"]);
  adapter.setRowValues("_Config", 1, ["Key"], ["MANIFEST_SCHEMA_VERSION"]);
  adapter.setRowValues("_Shared", 1, ["Contact"], ["Arch"]);
  adapter.setRowValues("_AuditLog", 1, ["Timestamp"], ["2026-08-08"]);
  adapter.setRowValues("_Backup_Arch_v1", 1, ["OldData"], ["Val1"]);

  const engine = new LogMigrationEngine(adapter);
  const existingTabs = adapter.getTabNames();

  const preserved = engine.preserveBackupTabs(existingTabs);

  assert.ok(preserved.includes("_Backup_Arch_v1"));
  assert.strictEqual(preserved[preserved.length - 1], "_Backup_Arch_v1");
  assert.strictEqual(adapter.getSheetValues("_Backup_Arch_v1")[0][0], "Val1");
});

test("LogMigrationEngine - createPreMigrationSnapshot creates _Backup_<TabName>_<Timestamp> at tail index", () => {
  const adapter = new InMemorySheetStorageAdapter();
  adapter.setRowValues("Submittal Arch", 1, ["Section", "Title"], ["033000", "Concrete"]);
  adapter.setRowValues("_Config", 1, ["Key"], ["Val"]);

  const engine = new LogMigrationEngine(adapter);
  const timestamp = "20260808_120000";
  const snapshotName = engine.createPreMigrationSnapshot("Submittal Arch", timestamp);

  assert.strictEqual(snapshotName, "_Backup_Submittal Arch_20260808_120000");
  const tabNames = adapter.getTabNames();
  assert.strictEqual(tabNames[tabNames.length - 1], snapshotName);
  assert.strictEqual(adapter.getSheetValues(snapshotName)[0][0], "033000");
});

test("LogMigrationEngine - createPreMigrationSnapshot rejects tab names exceeding 100 character limit", () => {
  const adapter = new InMemorySheetStorageAdapter();
  const engine = new LogMigrationEngine(adapter);
  const longTabName = "A".repeat(90);

  assert.throws(
    () => engine.createPreMigrationSnapshot(longTabName, "20260808_120000"),
    /Tab name '.*' exceeds maximum length for snapshot cloning/
  );
});
