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
    ss.insertSheet("_Config", [
      ["MANIFEST_SCHEMA_VERSION", "1.2.0"],
      ["Config_Manifest", "Submittal Arch"]
    ]);
    ss.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ss.setNamedRange("Config_Manifest", "_Config", "A2:B2");
    ss.insertSheet("_AuditLog");
    ss.insertSheet("Submittal Arch", [["BUFFER_TOP"], ["Headers"], ["BUFFER_BOTTOM"]]);

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

  it("returns MINOR_DRIFT and canAutoPatch: true when non-critical minor issues are detected", () => {
    const ss = harness.sheetsService.openById("wb-audit-minor");
    ss.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.2.0"]]);
    ss.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ss.insertSheet("Submittal Arch");

    // Missing _AuditLog tab (minor non-destructive fixable issue)
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
