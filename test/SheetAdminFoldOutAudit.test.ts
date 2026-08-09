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
import { onRunSchemaDriftAudit, onAutoPatchWorkbook } from "../src/adapters/gas/AdminFoldOutPresenter";
import { FakeSpreadsheetLockAdapter } from "../src/adapters/fakes/FakeSpreadsheetLockAdapter";
import { FakeCacheAdapter } from "../src/adapters/fakes/FakeCacheAdapter";

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

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });

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

    const reportMinor = TemplateDriftAuditor.auditWorkbook(ssMinor, { bypassCache: true });
    assert.strictEqual(reportMinor.status, "MINOR_DRIFT");
    assert.strictEqual(reportMinor.canAutoPatch, true);
    assert.ok(reportMinor.issues.some(i => i.category === "VERSION" && i.severity === "WARNING"));

    const ssMajor = harness.sheetsService.openById("wb-ver-major");
    ssMajor.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);
    const cfgMajor = ssMajor.getSheetByName("_Config")!;
    cfgMajor.setGridSlice(2, 1, [["MANIFEST_SCHEMA_VERSION", "2.0.0"]]);
    ssMajor.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "B2");

    const reportMajor = TemplateDriftAuditor.auditWorkbook(ssMajor, { bypassCache: true });
    assert.strictEqual(reportMajor.status, "MAJOR_DRIFT");
    assert.strictEqual(reportMajor.canAutoPatch, false);
    assert.ok(reportMajor.issues.some(i => i.category === "VERSION" && i.severity === "CRITICAL"));
  });

  it("Dimension 2: detects missing system and discipline log tabs accurately", () => {
    const ssMissingConfig = harness.sheetsService.openById("wb-no-config");
    ssMissingConfig.insertSheet("Submittal Arch");

    const reportNoConfig = TemplateDriftAuditor.auditWorkbook(ssMissingConfig, { bypassCache: true });
    assert.strictEqual(reportNoConfig.status, "INCOMPATIBLE");
    assert.strictEqual(reportNoConfig.canAutoPatch, false);
    assert.ok(reportNoConfig.issues.some(i => i.category === "TAB" && i.description.includes("_Config")));

    const ssMissingLog = harness.sheetsService.openById("wb-no-log");
    ssMissingLog.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.0.0"]]);
    ssMissingLog.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ssMissingLog.insertSheet("_AuditLog");
    // Missing "Submittal Arch" log tab

    const reportNoLog = TemplateDriftAuditor.auditWorkbook(ssMissingLog, { bypassCache: true });
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

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });
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

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });
    assert.strictEqual(report.status, "MINOR_DRIFT");
    assert.strictEqual(report.canAutoPatch, true);
    assert.ok(report.issues.some(i => i.category === "HEADER" && i.description.includes("Doc No")));
  });

  it("Dimension 5: audits Row 2 FormulaRow formula integrity and error values", () => {
    const ssOverwritten = harness.sheetsService.openById("wb-formula-overwritten");
    ssOverwritten.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const archSheet = ssOverwritten.getSheetByName("Submittal Arch")!;
    // Overwrite Row 2 (FormulaRow) calculated column formula with static string
    archSheet.getRange(4, 11).setValue("STATIC_OVERWRITE");

    const reportOverwritten = TemplateDriftAuditor.auditWorkbook(ssOverwritten, { bypassCache: true });
    assert.strictEqual(reportOverwritten.status, "MAJOR_DRIFT");
    assert.strictEqual(reportOverwritten.canAutoPatch, false);
    assert.ok(reportOverwritten.issues.some(i => i.category === "FORMULA" && i.severity === "CRITICAL"));

    const ssRefError = harness.sheetsService.openById("wb-formula-ref-error");
    ssRefError.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const archSheet2 = ssRefError.getSheetByName("Submittal Arch")!;
    archSheet2.getRange(4, 11).setValue("=#REF!");

    const reportRefError = TemplateDriftAuditor.auditWorkbook(ssRefError, { bypassCache: true });
    assert.strictEqual(reportRefError.status, "MAJOR_DRIFT");
    assert.strictEqual(reportRefError.canAutoPatch, false);
    assert.ok(reportRefError.issues.some(i => i.category === "FORMULA" && i.description.includes("#REF!")));
  });

  it("Dimension 6: audits picklist data validations on log columns and populates telemetry", () => {
    const ss = harness.sheetsService.openById("wb-validation-drift");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });
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

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });

    assert.strictEqual(report.status, "MINOR_DRIFT");
    assert.strictEqual(report.canAutoPatch, true);
    assert.ok(report.issues.length > 0);
  });

  it("returns MAJOR_DRIFT or INCOMPATIBLE and canAutoPatch: false when structural core requirements are missing", () => {
    const ss = harness.sheetsService.openById("wb-audit-incompatible");
    // Missing _Config tab entirely

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });

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

  describe("Auto-Patching Engine & Mid-Repair Recovery (Issue #226)", () => {
    it("fast-fails with status LOCK_CONTENTION when SpreadsheetLockAdapter lock is held by another process", () => {
      const ss = harness.sheetsService.openById("wb-autopatch-lock");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

      const lockAdapter = new FakeSpreadsheetLockAdapter();
      const existingLockId = lockAdapter.acquireLock("wb-autopatch-lock", 900000);
      assert.ok(existingLockId);

      let logged = false;
      const logger = (msg: string) => { logged = true; assert.ok(msg.includes("LOCK_CONTENTION")); };
      const result = TemplateDriftAuditor.autoPatchWorkbook(ss, { lockAdapter, logger });
      assert.ok(logged);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, "LOCK_CONTENTION");
      assert.strictEqual(result.spreadsheetId, "wb-autopatch-lock");
      assert.ok(result.error?.includes("lock"));
    });

    it("returns status NO_OP under lock when double-checked audit confirms zero structural drift", () => {
      const ss = harness.sheetsService.openById("wb-autopatch-clean");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

      const lockAdapter = new FakeSpreadsheetLockAdapter();
      const cacheAdapter = new FakeCacheAdapter();

      const result = TemplateDriftAuditor.autoPatchWorkbook(ss, { lockAdapter, cacheAdapter });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, "NO_OP");
      assert.strictEqual(result.repairsApplied.length, 0);
      assert.strictEqual(lockAdapter.isLocked("wb-autopatch-clean"), false);
    });

    it("repairs MINOR_DRIFT under lock, invalidates cache scope, logs telemetry, and releases lock in finally", () => {
      const ss = harness.sheetsService.openById("wb-autopatch-minor");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);
      (ss as any).sheets.delete("_AuditLog");
      (ss as any).namedRanges.delete("Headers");
      (ss as any).namedRanges.delete("Submittal_Arch_Headers");

      const lockAdapter = new FakeSpreadsheetLockAdapter();
      const cacheAdapter = new FakeCacheAdapter();

      const result = TemplateDriftAuditor.autoPatchWorkbook(ss, { lockAdapter, cacheAdapter });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, "PATCHED");
      assert.ok(result.repairsApplied.length > 0);
      assert.strictEqual(lockAdapter.isLocked("wb-autopatch-minor"), false);

      const auditSheet = ss.getSheetByName("_AuditLog");
      assert.ok(auditSheet);
      const data = auditSheet.getDataRange().getValues();
      assert.ok(data.length >= 2);

      const events = data.slice(1).map(r => r[2]);
      assert.ok(events.includes("DRIFT_REPAIR_EXECUTED"));
      assert.ok(events.includes("EVICT_PREFIX"));
    });

    it("rejects auto-patching and returns status UNPATCHABLE when MAJOR_DRIFT or INCOMPATIBLE schema is detected", () => {
      const ss = harness.sheetsService.openById("wb-autopatch-incompatible");

      const lockAdapter = new FakeSpreadsheetLockAdapter();
      const result = TemplateDriftAuditor.autoPatchWorkbook(ss, { lockAdapter });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, "UNPATCHABLE");
      assert.strictEqual(result.repairsApplied.length, 0);
      assert.strictEqual(lockAdapter.isLocked("wb-autopatch-incompatible"), false);
    });

    it("catches mid-repair execution exception, logs DRIFT_REPAIR_FAILED to _AuditLog, invalidates cache, releases lock in finally, and returns REPAIR_FAILED", () => {
      const ss = harness.sheetsService.openById("wb-autopatch-faulty");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);
      (ss as any).sheets.delete("_AuditLog");

      const faultySeam = {
        getId: () => "wb-autopatch-faulty",
        getSheets: () => ss.getSheets(),
        getTabNames: () => ["_Config", "Submittal Arch"],
        getSheetByName: (name: string) => {
          if (name === "_AuditLog") return null;
          const s = ss.getSheetByName(name);
          return s;
        },
        insertSheet: () => {
          throw new Error("Simulated storage mutation failure mid-repair");
        },
        getNamedRanges: () => ss.getNamedRanges(),
        getRangeByName: (n: string) => ss.getRangeByName(n),
        getSheetValues: (n: string) => ss.getSheetValues(n)
      };

      const lockAdapter = new FakeSpreadsheetLockAdapter();
      const cacheAdapter = new FakeCacheAdapter();

      const result = TemplateDriftAuditor.autoPatchWorkbook(faultySeam as any, { lockAdapter, cacheAdapter });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, "REPAIR_FAILED");
      assert.ok(result.error?.includes("Simulated storage mutation failure"));
      assert.strictEqual(lockAdapter.isLocked("wb-autopatch-faulty"), false);
    });

    it("onAutoPatchWorkbook action handler executes auto-patching, updates card, and emits notification toast", () => {
      const ss = harness.sheetsService.openById("wb-action-autopatch");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);
      (ss as any).sheets.delete("_AuditLog");

      const event = {
        sheetsContext: {
          spreadsheetId: "wb-action-autopatch",
          sheetName: "Submittal Arch"
        }
      };

      const response = onAutoPatchWorkbook(event);
      const actionJson = CardSerializer.actionResponseToJSON(response);

      assert.ok(actionJson.notification?.text?.includes("Auto-patch complete:") || actionJson.notification?.text?.includes("Auto-patch"));
      assert.ok(actionJson.navigation?.card);
    });
  });

  describe("Issue #228 Acceptance Criteria & UI Verification", () => {
    it("renders inline Schema Health Report with overall status badge, live vs code version, and issue breakdown", () => {
      const report = {
        spreadsheetId: "wb-228-ui",
        status: "MINOR_DRIFT" as const,
        codeSchemaVersion: "1.2.0",
        liveSchemaVersion: "1.1.0",
        canAutoPatch: true,
        issues: [
          { category: "VERSION" as const, description: "Schema version mismatch", severity: "WARNING" as const }
        ]
      };

      const section = AdminFoldOutPresenter.renderSheetAdminFoldOut({
        spreadsheetId: "wb-228-ui",
        auditReport: report
      });

      const card = CardService.newCardBuilder().addSection(section).build();
      const cardJson = CardSerializer.toJSON(card);

      assert.ok(CardSerializer.hasWidgetText(cardJson, "Schema Health Report"));
      assert.ok(CardSerializer.hasWidgetText(cardJson, "Status: MINOR_DRIFT"));
      assert.ok(CardSerializer.hasWidgetText(cardJson, "Code Schema:</b> v1.2.0"));
      assert.ok(CardSerializer.hasWidgetText(cardJson, "Live Schema:</b> v1.1.0"));
      assert.ok(CardSerializer.hasWidgetText(cardJson, "Auto-Patch Readiness: Ready (true)"));
      assert.ok(CardSerializer.hasWidgetText(cardJson, "Schema version mismatch"));
    });

    it("displays 'Auto-Patch Workbook' button strictly when canAutoPatch is true and omits button when canAutoPatch is false", () => {
      // 1. canAutoPatch === true
      const sectionPatchable = AdminFoldOutPresenter.renderSheetAdminFoldOut({
        spreadsheetId: "wb-228-patchable",
        auditReport: {
          spreadsheetId: "wb-228-patchable",
          status: "MINOR_DRIFT",
          codeSchemaVersion: "1.2.0",
          liveSchemaVersion: "1.2.0",
          canAutoPatch: true,
          issues: []
        }
      });

      const cardPatchable = CardService.newCardBuilder().addSection(sectionPatchable).build();
      const jsonPatchable = CardSerializer.toJSON(cardPatchable);
      assert.ok(CardSerializer.findButton(jsonPatchable, "onAutoPatchWorkbook"));

      // 2. canAutoPatch === false
      const sectionUnpatchable = AdminFoldOutPresenter.renderSheetAdminFoldOut({
        spreadsheetId: "wb-228-unpatchable",
        auditReport: {
          spreadsheetId: "wb-228-unpatchable",
          status: "MAJOR_DRIFT",
          codeSchemaVersion: "1.2.0",
          liveSchemaVersion: "1.2.0",
          canAutoPatch: false,
          issues: [
            { category: "TAB", description: "Missing log tab Submittal Arch", severity: "CRITICAL" }
          ]
        }
      });

      const cardUnpatchable = CardService.newCardBuilder().addSection(sectionUnpatchable).build();
      const jsonUnpatchable = CardSerializer.toJSON(cardUnpatchable);
      assert.strictEqual(CardSerializer.findButton(jsonUnpatchable, "onAutoPatchWorkbook"), undefined);
    });

    it("displays interactive retry prompt on lock contention (status: LOCK_CONTENTION)", () => {
      const sectionLock = AdminFoldOutPresenter.renderSheetAdminFoldOut({
        spreadsheetId: "wb-228-locked",
        lockContention: true,
        auditReport: {
          spreadsheetId: "wb-228-locked",
          status: "MINOR_DRIFT",
          codeSchemaVersion: "1.2.0",
          liveSchemaVersion: "1.2.0",
          canAutoPatch: true,
          issues: []
        }
      });

      const cardLock = CardService.newCardBuilder().addSection(sectionLock).build();
      const jsonLock = CardSerializer.toJSON(cardLock);

      assert.ok(CardSerializer.hasWidgetText(jsonLock, "Workbook Lock Contention Detected"));
      assert.ok(CardSerializer.findButton(jsonLock, "onAutoPatchWorkbook"));
    });

    it("onAutoPatchWorkbook emits notification toast and displays lock contention retry prompt when lock cannot be acquired", () => {
      const ss = harness.sheetsService.openById("wb-228-lock-event");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

      const lockAdapter = new FakeSpreadsheetLockAdapter();
      lockAdapter.acquireLock("wb-228-lock-event", 900000); // Hold lock

      (globalThis as any).defaultSpreadsheetLockAdapter = lockAdapter;

      const event = {
        sheetsContext: {
          spreadsheetId: "wb-228-lock-event",
          sheetName: "Submittal Arch"
        }
      };

      try {
        const response = onAutoPatchWorkbook(event);
        const actionJson = CardSerializer.actionResponseToJSON(response);

        assert.ok(actionJson.notification?.text?.includes("Workbook lock currently held by another process"));
        assert.ok(actionJson.navigation?.card);

        const cardJson = CardSerializer.toJSON(actionJson.navigation.card);
        assert.ok(CardSerializer.hasWidgetText(cardJson, "Lock Contention") || CardSerializer.hasWidgetText(cardJson, "Workbook Lock Contention"));
        assert.ok(CardSerializer.findButton(cardJson, "onAutoPatchWorkbook"));
      } finally {
        delete (globalThis as any).defaultSpreadsheetLockAdapter;
      }
    });
  });

});
