/**
 * @file SheetsTabRoleClassifier.test.ts
 * @description Unit tests verifying AppContext.GoogleSheets, 5-tier tab role classification,
 * bounded data row count calculation, and active spreadsheet context auto-binding under GasMockHarness.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./harness/GasMockHarness";
import { SheetsTabRoleClassifier, TabRole, TabClassificationResult } from "../src/core/log/SheetsTabRoleClassifier";
import { SheetsContextBinder, SpreadsheetContext } from "../src/adapters/gas/SheetsContextBinder";
import { AppContext } from "../src/types";

describe("AppContext.GoogleSheets & 5-Tier Tab Role Classifier (Issue #218)", () => {
  beforeEach(() => {
    GasMockHarness.install();
  });

  afterEach(() => {
    GasMockHarness.uninstall();
  });

  it("verifies AppContext type union includes 'GoogleSheets'", () => {
    const context: AppContext = "GoogleSheets";
    assert.strictEqual(context, "GoogleSheets");
  });

  it("classifies tabs correctly across all 5 tab roles", () => {
    const isLogWorkbook = true;

    // 1. LOG_TAB
    const archResult = SheetsTabRoleClassifier.classifyTabRole("Submittal Arch", isLogWorkbook);
    assert.strictEqual(archResult.role, "LOG_TAB");
    assert.strictEqual(archResult.docTypeKey, "SUBMITTAL_ARCH");

    const ffeResult = SheetsTabRoleClassifier.classifyTabRole("Submittal FFE", isLogWorkbook);
    assert.strictEqual(ffeResult.role, "LOG_TAB");
    assert.strictEqual(ffeResult.docTypeKey, "SUBMITTAL_FFE");

    const rfiResult = SheetsTabRoleClassifier.classifyTabRole("RFI Log", isLogWorkbook);
    assert.strictEqual(rfiResult.role, "LOG_TAB");
    assert.strictEqual(rfiResult.docTypeKey, "RFI_LOG");

    // 2. SYSTEM_CONFIG
    const configResult = SheetsTabRoleClassifier.classifyTabRole("_Config", isLogWorkbook);
    assert.strictEqual(configResult.role, "SYSTEM_CONFIG");
    assert.strictEqual(configResult.docTypeKey, "N/A");
    assert.strictEqual(configResult.dataRowCount, "N/A");

    // 3. AUDIT_LOG
    const auditResult = SheetsTabRoleClassifier.classifyTabRole("_AuditLog", isLogWorkbook);
    assert.strictEqual(auditResult.role, "AUDIT_LOG");
    assert.strictEqual(auditResult.docTypeKey, "N/A");

    // 4. DOCUMENTATION
    const docResult1 = SheetsTabRoleClassifier.classifyTabRole("Documentation", isLogWorkbook);
    assert.strictEqual(docResult1.role, "DOCUMENTATION");
    assert.strictEqual(docResult1.docTypeKey, "N/A");

    const docResult2 = SheetsTabRoleClassifier.classifyTabRole("User Guide", isLogWorkbook);
    assert.strictEqual(docResult2.role, "DOCUMENTATION");
    assert.strictEqual(docResult2.docTypeKey, "N/A");

    const docResult3 = SheetsTabRoleClassifier.classifyTabRole("README", isLogWorkbook);
    assert.strictEqual(docResult3.role, "DOCUMENTATION");
    assert.strictEqual(docResult3.docTypeKey, "N/A");

    // 5. USER_CREATED
    const userResult = SheetsTabRoleClassifier.classifyTabRole("ScratchPad", isLogWorkbook);
    assert.strictEqual(userResult.role, "USER_CREATED");
    assert.strictEqual(userResult.docTypeKey, "N/A");
    assert.strictEqual(userResult.dataRowCount, "N/A");
  });

  it("classifies all tabs as USER_CREATED when workbook is not a DocumentLogWorkbook", () => {
    const isLogWorkbook = false;

    const res1 = SheetsTabRoleClassifier.classifyTabRole("Submittal Arch", isLogWorkbook);
    assert.strictEqual(res1.role, "USER_CREATED");
    assert.strictEqual(res1.docTypeKey, "N/A");

    const res2 = SheetsTabRoleClassifier.classifyTabRole("_Config", isLogWorkbook);
    assert.strictEqual(res2.role, "USER_CREATED");

    const res3 = SheetsTabRoleClassifier.classifyTabRole("Documentation", isLogWorkbook);
    assert.strictEqual(res3.role, "USER_CREATED");
  });

  it("resolves target DocumentType key and data row count bounded by sheet-scoped Data range for LOG_TAB", () => {
    const gridData: any[][] = [
      ["Title Row"], // Row 1 (Title)
      ["=TODAY()"], // Row 2 (Date)
      ["Section", "Number", "Title", "Date", "Status"], // Row 3 (Headers)
      ["", "", "", "", ""], // Row 4 (FormulaRow)
      ["BUFFER_TOP", "", "", "", ""], // Row 5 (Top BufferRow)
      ["033000", "001", "Concrete Mix", "260801", "Received"], // Row 6 (Data 1)
      ["033000", "002", "Rebar Submittal", "260802", "Approved"], // Row 7 (Data 2)
      ["033000", "003", "Anchor Bolts", "260803", "Pending"], // Row 8 (Data 3)
      ["BUFFER_BOTTOM", "", "", "", ""] // Row 9 (Bottom BufferRow)
    ];

    const dataRowCount = SheetsTabRoleClassifier.calculateBoundedDataRowCount(gridData, { startRow: 5, endRow: 9 });
    assert.strictEqual(dataRowCount, 3);
  });

  it("automatically binds active spreadsheet ID and active sheet tab context under GasMockHarness", () => {
    const harness = GasMockHarness.install();
    const mockSs = harness.sheetsService.openById("sheets-wb-test-101");
    mockSs.insertSheet("_Config", [
      ["MANIFEST_SCHEMA_VERSION", "1.2.0"],
      ["Config_Manifest", "Submittal Arch", "SUBMITTAL_ARCH"]
    ]);
    mockSs.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    mockSs.setNamedRange("Config_Manifest", "_Config", "A2:C2");

    const archSheet = mockSs.insertSheet("Submittal Arch", [
      ["Title"],
      ["Date"],
      ["Header1", "Header2"],
      ["Formula1", "Formula2"],
      ["BUFFER_TOP", ""],
      ["DataRow1Col1", "DataRow1Col2"],
      ["DataRow2Col1", "DataRow2Col2"],
      ["BUFFER_BOTTOM", ""]
    ]);
    mockSs.setNamedRange("Data", "Submittal Arch", "A5:B8");

    const context: SpreadsheetContext = SheetsContextBinder.bindActiveSheetsContext({
      spreadsheetId: "sheets-wb-test-101",
      sheetName: "Submittal Arch"
    });

    assert.strictEqual(context.spreadsheetId, "sheets-wb-test-101");
    assert.strictEqual(context.activeSheetName, "Submittal Arch");
    assert.strictEqual(context.isDocumentLogWorkbook, true);
    assert.strictEqual(context.activeTabRole, "LOG_TAB");
    assert.strictEqual(context.documentTypeKey, "SUBMITTAL_ARCH");
    assert.strictEqual(context.dataRowCount, 2);
  });

  it("handles unrecognized spreadsheet fallback state during context binding", () => {
    const harness = GasMockHarness.install();
    const mockSs = harness.sheetsService.openById("unrecognized-ss-999");
    mockSs.insertSheet("Summary", [["Data1", "Data2"]]);

    const context: SpreadsheetContext = SheetsContextBinder.bindActiveSheetsContext({
      spreadsheetId: "unrecognized-ss-999",
      sheetName: "Summary"
    });

    assert.strictEqual(context.spreadsheetId, "unrecognized-ss-999");
    assert.strictEqual(context.activeSheetName, "Summary");
    assert.strictEqual(context.isDocumentLogWorkbook, false);
    assert.strictEqual(context.activeTabRole, "USER_CREATED");
    assert.strictEqual(context.documentTypeKey, "N/A");
    assert.strictEqual(context.dataRowCount, "N/A");
  });
});
