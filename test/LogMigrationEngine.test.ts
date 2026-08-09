/**
 * @file LogMigrationEngine.test.ts
 * @description Unit tests for LogMigrationEngine legacy backup tab preservation,
 * tab taxonomy ordering (Log -> Support -> System -> Backup), atomic snapshot creation,
 * pre-flight snapshot tab name validation, cell budget limit gate, SHA-256 idempotency fingerprinting,
 * formula coercion, spill collision auditing, telemetry logging, and transaction locking.
 */

import test from "node:test";
import assert from "node:assert";
import {
  LogMigrationEngine,
  classifyTabRole,
  getOrderedTabNames,
  verifyTabTaxonomyOrder,
  validateSnapshotTabName,
  computeMigrationHash
} from "../src/core/log/LogMigrationEngine";
import { InMemorySheetStorageAdapter } from "./harness/fakes/InMemorySheetStorageAdapter";
import { FakeSpreadsheetLockAdapter } from "../src/adapters/fakes/FakeSpreadsheetLockAdapter";

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
  assert.ok(result.errors.some(e => e.includes("misplaced after tab '_Config'")));
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

test("LogMigrationEngine - 4-tier formula coercion policy clears calculated columns (Tier 1) and coerces non-calculated inline formulas (Tier 2 & 3)", () => {
  const adapter = new InMemorySheetStorageAdapter();

  const legacyValues = [
    ["Spec Section", "Title", "Days Open", "Custom User Col"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))", "=SUM(A2:B2)"],
    ["033000", "Concrete", "=TODAY()-C3", "=A3+10"],
    ["051200", "=CONCAT('Steel',' Phase 1')", "15", "42"]
  ];

  const legacyFormulas = [
    ["", "", "", ""],
    ["", "", "=MAP(Data, LAMBDA(r, ...))", "=SUM(A2:B2)"],
    ["", "", "=TODAY()-C3", "=A3+10"],
    ["", "=CONCAT('Steel',' Phase 1')", "", ""]
  ];

  adapter.setSheetValues("Submittal Arch", legacyValues);
  adapter.setSheetFormulas("Submittal Arch", legacyFormulas);

  const engine = new LogMigrationEngine(adapter);

  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string" as const, isCalculated: true }
  ];

  const result = engine.coerceInlineFormulas("Submittal Arch", fieldSpecs, {
    sourceValues: legacyValues,
    sourceFormulas: legacyFormulas
  });

  assert.strictEqual(result.coercedValues[2][2], "");
  assert.strictEqual(result.coercedValues[3][2], "");
  assert.strictEqual(result.coercedValues[3][1], "=CONCAT('Steel',' Phase 1')");
  assert.strictEqual(result.coercedValues[2][3], "=A3+10");
  assert.strictEqual(result.coercedValues[1][3], "=SUM(A2:B2)");

  assert.strictEqual(result.calculatedColumnsCoercedCount, 2);
  assert.strictEqual(result.inlineFormulasDetectedCount, 5);
  assert.ok(result.discrepancies.length > 0);
  assert.ok(result.discrepancies.some(d => d.actionTaken === "CLEARED_FOR_SPILL"));
  assert.ok(result.discrepancies.some(d => d.actionTaken === "COERCED_TO_SNAPSHOT"));
  assert.ok(result.discrepancies.some(d => d.actionTaken === "PRESERVED_USER_FORMULA"));
});

test("LogMigrationEngine - auditLogMigration detects pre-flight target spill collisions and sets canProceed to false", () => {
  const adapter = new InMemorySheetStorageAdapter();

  adapter.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["033000", "Concrete", "10"]
  ]);

  adapter.setSheetValues("Target_Log", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["", "", "BLOCKED_SPILL_TEXT"]
  ]);

  const engine = new LogMigrationEngine(adapter);

  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string" as const, isCalculated: true }
  ];

  const report = engine.auditLogMigration("Submittal Arch", fieldSpecs, { targetTabName: "Target_Log" });

  assert.strictEqual(report.targetSpillCollisionBlocked, true);
  assert.strictEqual(report.canProceed, false);
  assert.ok(report.reasons.some(r => r.includes("Target calculated column contains pre-existing text blocking formula spill-down")));
});

test("LogMigrationEngine - auditLogMigration passes pre-flight check when target calculated columns are clear", () => {
  const adapter = new InMemorySheetStorageAdapter();

  adapter.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["033000", "Concrete", "10"]
  ]);

  adapter.setSheetValues("Target_Log", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["", "", ""]
  ]);

  const engine = new LogMigrationEngine(adapter);

  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string" as const, isCalculated: true }
  ];

  const report = engine.auditLogMigration("Submittal Arch", fieldSpecs, { targetTabName: "Target_Log" });

  assert.strictEqual(report.targetSpillCollisionBlocked, false);
  assert.strictEqual(report.canProceed, true);
});

test("LogMigrationEngine - logDiscrepanciesToAuditLog appends audit event telemetry to _AuditLog tab", () => {
  const adapter = new InMemorySheetStorageAdapter();
  adapter.setSheetValues("_AuditLog", [
    ["Timestamp", "Category", "EventType", "Actor", "Status", "Details"]
  ]);

  const engine = new LogMigrationEngine(adapter);

  const report = {
    tabName: "Submittal Arch",
    totalRows: 4,
    sourceDataRowCount: 2,
    targetAppendedRowCount: 2,
    calculatedColumnsCoercedCount: 2,
    inlineFormulasDetectedCount: 3,
    formulaCoercionSummary: {
      calculatedColumnsCoercedCount: 2,
      inlineFormulasDetectedCount: 3,
      discrepanciesCount: 1
    },
    legacyCalculatedFormulaDiscrepancies: [
      {
        tabName: "Submittal Arch",
        rowIndex: 3,
        columnIndex: 3,
        header: "Days Open",
        formula: "=TODAY()-C3",
        actionTaken: "CLEARED_FOR_SPILL"
      }
    ],
    targetSpillCollisionBlocked: false,
    canProceed: true,
    reasons: [],
    validationErrors: []
  };

  engine.logDiscrepanciesToAuditLog("test-spreadsheet-id", report);

  const auditRows = adapter.getSheetValues("_AuditLog");
  assert.strictEqual(auditRows.length, 2);
  assert.strictEqual(auditRows[1][1], "MIGRATION");
  assert.strictEqual(auditRows[1][2], "DRY_RUN_AUDIT");
  assert.strictEqual(auditRows[1][4], "SUCCESS");
  assert.ok(auditRows[1][5].includes("Submittal Arch"));
});

test("validateSnapshotTabName - passes for valid tab names <= 100 characters and rejects names > 100 characters", () => {
  const passResult = validateSnapshotTabName("Submittal Arch", "20260809_120000");
  assert.strictEqual(passResult.valid, true);
  assert.strictEqual(passResult.snapshotName, "_Backup_Submittal Arch_20260809_120000");

  const longTab = "A".repeat(90);
  const failResult = validateSnapshotTabName(longTab, "20260809_120000");
  assert.strictEqual(failResult.valid, false);
  assert.ok(failResult.error?.includes("exceeds maximum length for snapshot cloning"));
});

test("LogMigrationEngine - auditLogMigration detects ALREADY_MIGRATED when lastMigrationHash matches source payload", () => {
  const adapter = new InMemorySheetStorageAdapter();
  const sourceValues = [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["033000", "Concrete", "10"]
  ];
  adapter.setSheetValues("Submittal Arch", sourceValues);

  const hash = computeMigrationHash(sourceValues);
  adapter.setSheetValues("_Config", [
    ["Key", "Value"],
    ["lastMigrationHash", hash]
  ]);

  const engine = new LogMigrationEngine(adapter);
  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string" as const, isCalculated: true }
  ];

  const report = engine.auditLogMigration("Submittal Arch", fieldSpecs);
  assert.strictEqual(report.idempotencyStatus, "ALREADY_MIGRATED");
  assert.strictEqual(report.canProceed, false);
  assert.ok(report.validationErrors.some(e => e.includes("ALREADY_MIGRATED")));
});

test("LogMigrationEngine - executeDryRun acquires lock, logs telemetry under Category = 'MIGRATION', and releases lock cleanly", () => {
  const storageAdapter = new InMemorySheetStorageAdapter();
  storageAdapter.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title"],
    ["", ""],
    ["033000", "Concrete"]
  ]);

  const lockAdapter = new FakeSpreadsheetLockAdapter();
  const engine = new LogMigrationEngine(storageAdapter, lockAdapter);
  const spreadsheetId = "ss_dryrun_test";

  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false }
  ];

  const report = engine.executeDryRun(spreadsheetId, "Submittal Arch", fieldSpecs);

  assert.strictEqual(report.canProceed, true);
  assert.strictEqual(lockAdapter.isLocked(spreadsheetId), false);

  const auditRows = storageAdapter.getSheetValues("_AuditLog");
  assert.strictEqual(auditRows.length, 2);
  assert.strictEqual(auditRows[1][1], "MIGRATION");
  assert.strictEqual(auditRows[1][2], "DRY_RUN_AUDIT");
  assert.strictEqual(auditRows[1][4], "SUCCESS");
});

test("LogMigrationEngine - executeDryRun throws ConcurrentMigrationException when lock cannot be acquired", () => {
  const storageAdapter = new InMemorySheetStorageAdapter();
  storageAdapter.setSheetValues("Submittal Arch", [["Header"], [""], ["Data"]]);

  const lockAdapter = new FakeSpreadsheetLockAdapter();
  const spreadsheetId = "ss_locked_test";
  lockAdapter.acquireLock(spreadsheetId);

  const engine = new LogMigrationEngine(storageAdapter, lockAdapter);

  assert.throws(
    () => engine.executeDryRun(spreadsheetId, "Submittal Arch", []),
    /ConcurrentMigrationException: Unable to acquire transaction lock/
  );
});


test("LogMigrationEngine - executeLiveMigration appends data rows at Row H + 3 (Row 4), coercing formulas, updating _Config, archiving source, and logging MIGRATION_COMMITTED", () => {
  const targetStorage = new InMemorySheetStorageAdapter();
  targetStorage.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["", "", ""] // Buffer row
  ]);

  const sourceStorage = new InMemorySheetStorageAdapter();
  sourceStorage.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["033000", "Concrete Specs", "=TODAY()-C3"],
    ["051200", "Structural Steel", "15"]
  ]);

  const lockAdapter = new FakeSpreadsheetLockAdapter();
  const engine = new LogMigrationEngine(targetStorage, lockAdapter);

  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string" as const, isCalculated: true }
  ];

  const result = engine.executeLiveMigration("ss_live_101", "Submittal Arch", fieldSpecs, {
    sourceStorageAdapter: sourceStorage,
    sourceSpreadsheetId: "ss_source_101",
    timestamp: "20260809_120000"
  });

  assert.strictEqual(result.status, "MIGRATION_COMMITTED");
  assert.strictEqual(result.sourceDataRowCount, 2);
  assert.strictEqual(result.targetAppendedRowCount, 2);
  assert.ok(result.lastMigrationHash?.startsWith("sha256_"));

  // Check target data row starting at Row 4
  const targetRows = targetStorage.getSheetValues("Submittal Arch");
  assert.strictEqual(targetRows[3][0], "033000");
  assert.strictEqual(targetRows[3][1], "Concrete Specs");
  assert.strictEqual(targetRows[3][2], ""); // Tier 1 calculated column cleared for spill
  assert.strictEqual(targetRows[4][0], "051200");

  // Check backup snapshot tab deleted on success
  assert.strictEqual(targetStorage.getTabNames().includes("_Backup_Submittal Arch_20260809_120000"), false);

  // Check lastMigrationHash saved in _Config
  const configRows = targetStorage.getSheetValues("_Config");
  assert.ok(configRows.some(r => r[0] === "lastMigrationHash" && r[1] === result.lastMigrationHash));

  // Check source spreadsheet archived with _MIGRATION_INFO tab
  assert.ok(sourceStorage.getTabNames().includes("_MIGRATION_INFO"));
  const infoRows = sourceStorage.getSheetValues("_MIGRATION_INFO");
  assert.strictEqual(infoRows[0][0], "NOTICE");

  // Check _AuditLog event logged
  const auditRows = targetStorage.getSheetValues("_AuditLog");
  assert.ok(auditRows.some(r => r[2] === "MIGRATION_COMMITTED" && r[4] === "SUCCESS"));

  // Lock released cleanly
  assert.strictEqual(lockAdapter.isLocked("ss_live_101"), false);
});

test("LogMigrationEngine - executeLiveMigration executes atomic rollback restoreFromSnapshot() on mid-execution failure", () => {
  class FailingStorageAdapter extends InMemorySheetStorageAdapter {
    setRowValues(sheetName: string, rowIndex: number, headers: string[], rowData: any[]): { failedColumns: string[] } {
      if (rowIndex >= 4 && sheetName === "Submittal Arch") {
        throw new Error("Simulated mid-write database failure");
      }
      return super.setRowValues(sheetName, rowIndex, headers, rowData);
    }
  }

  const targetStorage = new FailingStorageAdapter();
  targetStorage.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["", "", ""]
  ]);

  const sourceStorage = new InMemorySheetStorageAdapter();
  sourceStorage.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title", "Days Open"],
    ["", "", "=MAP(Data, LAMBDA(r, ...))"],
    ["033000", "Concrete Specs", "=TODAY()-C3"]
  ]);

  const lockAdapter = new FakeSpreadsheetLockAdapter();
  const engine = new LogMigrationEngine(targetStorage, lockAdapter);

  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string" as const, isCalculated: true }
  ];

  const result = engine.executeLiveMigration("ss_live_fail", "Submittal Arch", fieldSpecs, {
    sourceStorageAdapter: sourceStorage
  });

  assert.strictEqual(result.status, "ROLLED_BACK");
  assert.strictEqual(result.targetAppendedRowCount, 0);
  assert.ok(result.error?.includes("Simulated mid-write database failure"));

  // Target tab restored to original state (only 3 rows, no partially appended data)
  const targetRows = targetStorage.getSheetValues("Submittal Arch");
  assert.strictEqual(targetRows.length, 3);

  // Snapshot tab cleaned up after rollback
  assert.strictEqual(targetStorage.getTabNames().some(t => t.startsWith("_Backup_")), false);

  // Audit log contains MIGRATION_ROLLED_BACK event
  const auditRows = targetStorage.getSheetValues("_AuditLog");
  assert.ok(auditRows.some(r => r[2] === "MIGRATION_ROLLED_BACK" && r[4] === "ROLLED_BACK"));

  // Lock released cleanly
  assert.strictEqual(lockAdapter.isLocked("ss_live_fail"), false);
});

test("LogMigrationEngine - executeLiveMigration executes atomic rollback on post-flight row count parity failure", () => {
  class MismatchStorageAdapter extends InMemorySheetStorageAdapter {
    private writeCount = 0;
    setRowValues(sheetName: string, rowIndex: number, headers: string[], rowData: any[]): { failedColumns: string[] } {
      if (rowIndex >= 4 && sheetName === "Submittal Arch") {
        this.writeCount++;
        if (this.writeCount > 1) {
          // Drop extra rows to simulate parity mismatch
          return { failedColumns: [] };
        }
      }
      return super.setRowValues(sheetName, rowIndex, headers, rowData);
    }
    getSheetValues(sheetName: string): any[][] {
      const vals = super.getSheetValues(sheetName);
      if (sheetName === "Submittal Arch" && vals.length > 3) {
        // Return 1 row less than written to force parity failure
        return vals.slice(0, vals.length - 1);
      }
      return vals;
    }
  }

  const targetStorage = new MismatchStorageAdapter();
  targetStorage.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title"],
    ["", ""],
    ["", ""]
  ]);

  const sourceStorage = new InMemorySheetStorageAdapter();
  sourceStorage.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title"],
    ["", ""],
    ["033000", "Concrete"],
    ["051200", "Steel"]
  ]);

  const engine = new LogMigrationEngine(targetStorage);
  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false }
  ];

  const result = engine.executeLiveMigration("ss_parity_fail", "Submittal Arch", fieldSpecs, {
    sourceStorageAdapter: sourceStorage
  });

  assert.strictEqual(result.status, "ROLLED_BACK");
  assert.ok(result.error?.includes("RowCountParityException"));
});

test("LogMigrationEngine - executeLiveMigration returns ALREADY_MIGRATED on re-run with matching lastMigrationHash", () => {
  const targetStorage = new InMemorySheetStorageAdapter();
  const sourceValues = [
    ["Spec Section", "Title"],
    ["", ""],
    ["033000", "Concrete"]
  ];

  targetStorage.setSheetValues("Submittal Arch", [
    ["Spec Section", "Title"],
    ["", ""],
    ["", ""]
  ]);

  const sourceHash = computeMigrationHash(sourceValues);
  targetStorage.setSheetValues("_Config", [
    ["Key", "Value"],
    ["lastMigrationHash", sourceHash]
  ]);

  const sourceStorage = new InMemorySheetStorageAdapter();
  sourceStorage.setSheetValues("Submittal Arch", sourceValues);

  const engine = new LogMigrationEngine(targetStorage);
  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false }
  ];

  const result = engine.executeLiveMigration("ss_rerun", "Submittal Arch", fieldSpecs, {
    sourceStorageAdapter: sourceStorage
  });

  assert.strictEqual(result.status, "ALREADY_MIGRATED");
  assert.strictEqual(result.lastMigrationHash, sourceHash);
});
