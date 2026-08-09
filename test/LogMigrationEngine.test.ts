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
    calculatedColumnsCoercedCount: 2,
    inlineFormulasDetectedCount: 3,
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
    reasons: []
  };

  engine.logDiscrepanciesToAuditLog("test-spreadsheet-id", report);

  const auditRows = adapter.getSheetValues("_AuditLog");
  assert.strictEqual(auditRows.length, 2);
  assert.strictEqual(auditRows[1][1], "LOG_MIGRATION");
  assert.strictEqual(auditRows[1][2], "FORMULA_COERCION_AUDIT");
  assert.strictEqual(auditRows[1][4], "SUCCESS");
  assert.ok(auditRows[1][5].includes("Submittal Arch"));
});
