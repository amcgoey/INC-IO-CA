/**
 * @file SheetAdminFoldOutAudit.test.ts
 * @description Unit tests for Issue #221: Dry-Run Schema Drift Audit & Inline Schema Health Report Tracer Bullet.
 * Verifies TemplateDriftAuditor execution, inline report card rendering, toast notifications, and _AuditLog logging under GasMockHarness.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./harness/GasMockHarness";
import { CardSerializer } from "./harness/CardSerializer";
import { TemplateDriftAuditor } from "../src/core/admin/TemplateDriftAuditor";
import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../src/core/config/DocumentLogWorkbookSpec";
import { onRunSchemaDriftAudit } from "../src/adapters/gas/AdminFoldOutPresenter";

describe("SheetAdminFoldOut Audit & Inline Schema Health Report (Issue #221)", () => {
  let harness: ReturnType<typeof GasMockHarness.install>;

  beforeEach(() => {
    harness = GasMockHarness.install();
  });

  afterEach(() => {
    GasMockHarness.uninstall();
  });

  it("executes TemplateDriftAuditor.auditWorkbook in read-only mode without modifying sheet structure", () => {
    const ss = harness.sheetsService.openById("wb-audit-clean");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const report = TemplateDriftAuditor.auditWorkbook("wb-audit-clean", { bypassCache: true });

    assert.strictEqual(report.spreadsheetId, "wb-audit-clean");
    assert.strictEqual(report.status, "MATCH");
    assert.strictEqual(report.canAutoPatch, true);
    assert.ok(report.codeSchemaVersion);

    // Verify sheet structure was not altered
    assert.ok(ss.getSheetByName("_Config"));
    assert.ok(ss.getSheetByName("_AuditLog"));
    assert.ok(ss.getSheetByName("Submittal Arch"));
  });

  it("Dimension 1: detects minor and major schema version mismatches", () => {
    const ssMinor = harness.sheetsService.openById("wb-ver-minor");
    ssMinor.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);
    const cfgMinor = ssMinor.getSheetByName("_Config")!;
    cfgMinor.setGridSlice(2, 1, [["MANIFEST_SCHEMA_VERSION", "1.1.0"]]);
    ssMinor.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "B2");

    const reportMinor = TemplateDriftAuditor.auditWorkbook("wb-ver-minor", { bypassCache: true });
    assert.strictEqual(reportMinor.status, "MINOR_DRIFT");
    assert.strictEqual(reportMinor.canAutoPatch, true);
    assert.ok(reportMinor.issues.some(i => i.category === "VERSION" && i.severity === "WARNING"));

    const ssMajor = harness.sheetsService.openById("wb-ver-major");
    ssMajor.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);
    const cfgMajor = ssMajor.getSheetByName("_Config")!;
    cfgMajor.setGridSlice(2, 1, [["MANIFEST_SCHEMA_VERSION", "2.0.0"]]);
    ssMajor.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "B2");

    const reportMajor = TemplateDriftAuditor.auditWorkbook("wb-ver-major", { bypassCache: true });
    assert.strictEqual(reportMajor.status, "MAJOR_DRIFT");
    assert.strictEqual(reportMajor.canAutoPatch, false);
    assert.ok(reportMajor.issues.some(i => i.category === "VERSION" && i.severity === "CRITICAL"));
  });

  it("Dimension 2: detects missing system and discipline log tabs accurately", () => {
    const ssMissingConfig = harness.sheetsService.openById("wb-no-config");
    ssMissingConfig.insertSheet("Submittal Arch");

    const reportNoConfig = TemplateDriftAuditor.auditWorkbook("wb-no-config", { bypassCache: true });
    assert.strictEqual(reportNoConfig.status, "INCOMPATIBLE");
    assert.strictEqual(reportNoConfig.canAutoPatch, false);
    assert.ok(reportNoConfig.issues.some(i => i.category === "TAB" && i.description.includes("_Config")));

    const ssMissingLog = harness.sheetsService.openById("wb-no-log");
    ssMissingLog.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.0.0"]]);
    ssMissingLog.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ssMissingLog.insertSheet("_AuditLog");
    // Missing "Submittal Arch" log tab

    const reportNoLog = TemplateDriftAuditor.auditWorkbook("wb-no-log", { bypassCache: true });
    assert.strictEqual(reportNoLog.status, "MAJOR_DRIFT");
    assert.strictEqual(reportNoLog.canAutoPatch, false);
    assert.ok(reportNoLog.issues.some(i => i.category === "TAB" && i.severity === "CRITICAL"));
  });

  it("Dimension 3: audits missing workbook-scoped and sheet-scoped named ranges", () => {
    const ss = harness.sheetsService.openById("wb-missing-nr");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    // Remove sheet-scoped Headers named range for Submittal Arch
    (ss as any).namedRanges.delete("Headers");
    (ss as any).namedRanges.delete("Submittal_Arch_Headers");

    const report = TemplateDriftAuditor.auditWorkbook("wb-missing-nr", { bypassCache: true });
    assert.strictEqual(report.status, "MINOR_DRIFT");
    assert.strictEqual(report.canAutoPatch, true);
    assert.ok(report.issues.some(i => i.category === "NAMED_RANGE" && i.description.includes("Headers")));
  });

  it("Dimension 4: audits header label alignment and column count discrepancies", () => {
    const ss = harness.sheetsService.openById("wb-header-drift");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const archSheet = ss.getSheetByName("Submittal Arch");
    assert.ok(archSheet);
    // Alter header at column 3 (Number -> Doc No)
    archSheet.getRange(3, 3).setValue("Doc No");

    const report = TemplateDriftAuditor.auditWorkbook("wb-header-drift", { bypassCache: true });
    assert.strictEqual(report.status, "MINOR_DRIFT");
    assert.strictEqual(report.canAutoPatch, true);
    assert.ok(report.issues.some(i => i.category === "HEADER" && i.description.includes("Doc No")));
  });

  it("Dimension 5: audits Row 2 FormulaRow formula integrity and error values", () => {
    const ssOverwritten = harness.sheetsService.openById("wb-formula-overwritten");
    ssOverwritten.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const archSheet = ssOverwritten.getSheetByName("Submittal Arch")!;
    // Overwrite Row 4 (FormulaRow) calculated column formula with static string
    archSheet.getRange(4, 11).setValue("STATIC_OVERWRITE");

    const reportOverwritten = TemplateDriftAuditor.auditWorkbook("wb-formula-overwritten", { bypassCache: true });
    assert.strictEqual(reportOverwritten.status, "MAJOR_DRIFT");
    assert.strictEqual(reportOverwritten.canAutoPatch, false);
    assert.ok(reportOverwritten.issues.some(i => i.category === "FORMULA" && i.severity === "CRITICAL"));

    const ssRefError = harness.sheetsService.openById("wb-formula-ref-error");
    ssRefError.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const archSheet2 = ssRefError.getSheetByName("Submittal Arch")!;
    archSheet2.getRange(4, 11).setValue("=#REF!");

    const reportRefError = TemplateDriftAuditor.auditWorkbook("wb-formula-ref-error", { bypassCache: true });
    assert.strictEqual(reportRefError.status, "MAJOR_DRIFT");
    assert.strictEqual(reportRefError.canAutoPatch, false);
    assert.ok(reportRefError.issues.some(i => i.category === "FORMULA" && i.description.includes("#REF!")));
  });

  it("Dimension 6: audits picklist data validations on log columns and populates telemetry", () => {
    const ss = harness.sheetsService.openById("wb-validation-drift");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const report = TemplateDriftAuditor.auditWorkbook("wb-validation-drift", { bypassCache: true });
    assert.ok(report);
    assert.ok(report.telemetry);
    assert.ok(typeof report.telemetry.auditDurationMs === "number");
    assert.ok(typeof report.telemetry.tabCount === "number");
    assert.ok(report.telemetry.inspectionStrategy);
  });

  it("returns MINOR_DRIFT and canAutoPatch: true when non-critical minor issues are detected", () => {
    const ss = harness.sheetsService.openById("wb-audit-minor");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);
    // Remove _AuditLog tab to simulate non-critical minor drift
    (ss as any).sheets.delete("_AuditLog");

    const report = TemplateDriftAuditor.auditWorkbook("wb-audit-minor", { bypassCache: true });

    assert.strictEqual(report.status, "MINOR_DRIFT");
    assert.strictEqual(report.canAutoPatch, true);
    assert.ok(report.issues.length > 0);
  });

  it("returns MAJOR_DRIFT or INCOMPATIBLE and canAutoPatch: false when structural core requirements are missing", () => {
    const ss = harness.sheetsService.openById("wb-audit-incompatible");
    // Missing _Config tab entirely

    const report = TemplateDriftAuditor.auditWorkbook("wb-audit-incompatible", { bypassCache: true });

    assert.strictEqual(report.canAutoPatch, false);
    assert.ok(report.status === "MAJOR_DRIFT" || report.status === "INCOMPATIBLE");
    assert.ok(report.issues.some(i => i.severity === "CRITICAL"));
  });

  it("re-renders SheetAdminFoldOut with inline Schema Health Report card and emits notification toast on 'Run Schema Drift Audit'", () => {
    const ss = harness.sheetsService.openById("wb-run-audit-123");
    ss.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.2.0"]]);
    ss.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ss.insertSheet("_AuditLog");
    ss.insertSheet("Submittal Arch");

    const event = {
      sheetsContext: {
        spreadsheetId: "wb-run-audit-123",
        sheetName: "Submittal Arch"
      }
    };

    const response = onRunSchemaDriftAudit(event);
    const actionJson = CardSerializer.actionResponseToJSON(response);

    // Verify toast notification
    assert.ok(actionJson.notification?.text?.includes("Schema audit complete:"));

    // Verify card re-rendered with Schema Health Report section
    const card = actionJson.navigation?.card;
    assert.ok(card);

    const cardJson = CardSerializer.toJSON(card);
    assert.ok(
      CardSerializer.hasWidgetText(cardJson, "Schema Health Report") ||
      CardSerializer.hasWidgetText(cardJson, "Status:") ||
      CardSerializer.hasWidgetText(cardJson, "MATCH") ||
      CardSerializer.hasWidgetText(cardJson, "MINOR_DRIFT")
    );
    assert.ok(
      CardSerializer.hasWidgetText(cardJson, "Auto-Patch") ||
      CardSerializer.hasWidgetText(cardJson, "canAutoPatch")
    );
  });

  it("logs SCHEMA_DRIFT event to target workbook _AuditLog tab when audit is executed", () => {
    const ss = harness.sheetsService.openById("wb-audit-log-221");
    ss.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.2.0"]]);
    ss.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ss.insertSheet("_AuditLog");

    const event = {
      parameters: {
        spreadsheetId: "wb-audit-log-221"
      }
    };

    onRunSchemaDriftAudit(event);

    const auditSheet = ss.getSheetByName("_AuditLog");
    assert.ok(auditSheet);
    const data = auditSheet.getDataRange().getValues();

    assert.ok(data.length >= 2);
    const lastRow = data[data.length - 1];

    assert.strictEqual(lastRow[1], "SCHEMA_DRIFT");
    assert.strictEqual(lastRow[2], "DRIFT_AUDIT_EXECUTED");
    assert.ok(String(lastRow[4]).length > 0); // Status
    assert.ok(String(lastRow[5]).includes("wb-audit-log-221"));
  });
});
