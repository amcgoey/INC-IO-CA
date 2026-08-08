/**
 * @file SheetsCardPrototype.test.ts
 * @description Unit tests verifying Google Sheets contextual card prototype logic, 5-tier tab role classification,
 * active-sheet state binding, and CardService ActionResponse serialization for Issue #150.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { SheetsCardPrototypeManager, MOCK_SPREADSHEETS } from "../src/prototypes/SheetsCardPrototypeManager";

describe("Google Sheets Contextual Card Prototype (Issue #150)", () => {
  it("classifies active tab roles accurately across all 5 tiers", () => {
    const isLog = true;

    // Tier 1: Log Tab
    const logTab = SheetsCardPrototypeManager.classifyTabRole("Submittal Arch", isLog);
    assert.strictEqual(logTab.role, "LOG_TAB");
    assert.strictEqual(logTab.docTypeKey, "SUBMITTAL_ARCH");

    // Tier 2: System Config Tab
    const configTab = SheetsCardPrototypeManager.classifyTabRole("_Config", isLog);
    assert.strictEqual(configTab.role, "SYSTEM_CONFIG");

    // Tier 3: Audit Log Tab
    const auditTab = SheetsCardPrototypeManager.classifyTabRole("_AuditLog", isLog);
    assert.strictEqual(auditTab.role, "AUDIT_LOG");

    // Tier 4: Documentation Tab
    const docTab = SheetsCardPrototypeManager.classifyTabRole("Documentation", isLog);
    assert.strictEqual(docTab.role, "DOCUMENTATION");

    // Tier 5: User Created Tab
    const userTab = SheetsCardPrototypeManager.classifyTabRole("ScratchPad", isLog);
    assert.strictEqual(userTab.role, "USER_CREATED");
  });

  it("builds Sheets main card state correctly for valid DocumentLogWorkbook", () => {
    const state = SheetsCardPrototypeManager.buildSheetsMainCard({
      spreadsheetId: "log-wb-001",
      sheetName: "Submittal Arch",
    });

    assert.strictEqual(state.context.spreadsheetTitle, "PROJ-2026 Architectural Submittals Log");
    assert.strictEqual(state.context.isDocumentLogWorkbook, true);
    assert.strictEqual(state.context.activeTabRole, "LOG_TAB");
    assert.strictEqual(state.context.documentTypeKey, "SUBMITTAL_ARCH");
    assert.strictEqual(state.context.dataRowCount, 142);
    assert.strictEqual(state.context.schemaVersion, "1.2.0");
  });

  it("renders non-log fallback card state for unrecognized spreadsheets", () => {
    const state = SheetsCardPrototypeManager.buildSheetsMainCard({
      spreadsheetId: "non-log-wb-999",
      sheetName: "Summary",
    });

    assert.strictEqual(state.context.isDocumentLogWorkbook, false);
    const cardResponse = SheetsCardPrototypeManager.serializeToCardServiceResponse(state);
    const sections = cardResponse.actionResponse.card.sections;

    assert.strictEqual(sections[0].header, "Unrecognized Document Log");
    assert.strictEqual(sections[1].header, "Sheet Administration (Disabled)");
  });

  it("handles Refresh Card action correctly", () => {
    const initialState = SheetsCardPrototypeManager.buildSheetsMainCard({
      spreadsheetId: "log-wb-001",
      sheetName: "Submittal Arch",
    });

    const refreshedState = SheetsCardPrototypeManager.onSheetsContextRefresh(initialState, {
      spreadsheetId: "log-wb-001",
      sheetName: "Submittal FFE",
    });

    assert.strictEqual(refreshedState.context.activeSheetName, "Submittal FFE");
    assert.strictEqual(refreshedState.context.documentTypeKey, "SUBMITTAL_FFE");
    assert.strictEqual(refreshedState.context.dataRowCount, 89);
    assert.ok(refreshedState.notificationMessage?.includes("Submittal FFE"));
  });

  it("executes Schema Drift Audit action and updates card state", () => {
    const initialState = SheetsCardPrototypeManager.buildSheetsMainCard({
      spreadsheetId: "log-wb-001",
      sheetName: "Submittal Arch",
    });

    const auditedState = SheetsCardPrototypeManager.onRunSchemaDriftAudit(initialState);
    assert.ok(auditedState.auditReport);
    assert.strictEqual(auditedState.auditReport.status, "HEALTHY");
    assert.strictEqual(auditedState.auditReport.totalNamedRanges, 14);

    const serialized = SheetsCardPrototypeManager.serializeToCardServiceResponse(auditedState);
    assert.ok(serialized.notification?.text.includes("Schema drift audit completed"));
  });

  it("executes ScriptCache Purge action and returns notification", () => {
    const initialState = SheetsCardPrototypeManager.buildSheetsMainCard({
      spreadsheetId: "log-wb-001",
      sheetName: "_Config",
    });

    const purgedState = SheetsCardPrototypeManager.onFlushScriptCache(initialState);
    assert.ok(purgedState.notificationMessage?.includes("ScriptCache purged"));
  });
});
