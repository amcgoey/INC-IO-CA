import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectCrossLogReferences,
  repairCrossLogReferences,
  normalizeDocKey,
  TargetLogManifest,
  SourceCellData,
} from "../src/prototypes/CrossLogReferenceScanner";

describe("CrossLogReferenceScanner", () => {
  const sampleManifest: TargetLogManifest = {
    targetSpreadsheetId: "target_workbook_999",
    tabs: {
      RFIs: { gid: "10001", headerRow: 1, activeDataStartRow: 4 },
      Submittals: { gid: "10002", headerRow: 1, activeDataStartRow: 4 },
      ASIs: { gid: "10003", headerRow: 1, activeDataStartRow: 4 },
    },
    sourceToTargetRowOffsets: {
      RFIs: 3,
      Submittals: 3,
      ASIs: 3,
    },
    documentRegistry: {
      "RFI-012": {
        docKey: "RFI-012",
        docType: "RFI",
        docNumber: "012",
        targetSpreadsheetId: "target_workbook_999",
        targetGid: "10001",
        targetTabName: "RFIs",
        targetRowIndex: 18,
        targetColumnIndex: 2,
        targetCellAddress: "B18",
      },
      "SUB-042": {
        docKey: "SUB-042",
        docType: "SUBMITTAL",
        docNumber: "042",
        targetSpreadsheetId: "target_workbook_999",
        targetGid: "10002",
        targetTabName: "Submittals",
        targetRowIndex: 25,
        targetColumnIndex: 3,
        targetCellAddress: "C25",
      },
      "ASI-005": {
        docKey: "ASI-005",
        docType: "ASI",
        docNumber: "005",
        targetSpreadsheetId: "target_workbook_999",
        targetGid: "10003",
        targetTabName: "ASIs",
        targetRowIndex: 9,
        targetColumnIndex: 1,
        targetCellAddress: "A9",
      },
    },
  };

  it("normalizes document keys correctly", () => {
    assert.equal(normalizeDocKey("rfi", "12"), "RFI-012");
    assert.equal(normalizeDocKey("sub", "42"), "SUB-042");
    assert.equal(normalizeDocKey("asi", "5"), "ASI-005");
  });

  it("detects and repairs external URL hyperlinks pointing to migrated documents", () => {
    const cells: SourceCellData[] = [
      {
        sheetId: "legacy_rfi_sheet_123",
        tabName: "RFIs",
        rowIndex: 15,
        columnIndex: 5,
        cellAddress: "E15",
        rawFormulaOrValue:
          '=HYPERLINK("https://docs.google.com/spreadsheets/d/old_rfi_sheet_123/edit#gid=555&range=B15", "RFI-012")',
      },
    ];

    const report = detectCrossLogReferences(cells, sampleManifest);
    assert.equal(report.detectedReferencesCount, 1);
    assert.equal(report.references[0].referenceType, "HYPERLINK_URL");
    assert.equal(report.references[0].healthStatus, "NEEDS_REPAIR");

    const repairResults = repairCrossLogReferences(report, sampleManifest);
    assert.equal(repairResults[0].success, true);
    assert.equal(
      repairResults[0].repairedFormulaOrValue,
      '=HYPERLINK("https://docs.google.com/spreadsheets/d/target_workbook_999/edit#gid=10001&range=B18", "RFI-012")'
    );
  });

  it("detects and converts plain text document references into target hyperlinks", () => {
    const cells: SourceCellData[] = [
      {
        sheetId: "legacy_sub_sheet_456",
        tabName: "Submittals",
        rowIndex: 10,
        columnIndex: 6,
        cellAddress: "F10",
        rawFormulaOrValue: "Refers to Submittal #42 for structural details",
      },
    ];

    const report = detectCrossLogReferences(cells, sampleManifest);
    assert.equal(report.detectedReferencesCount, 1);
    assert.equal(report.references[0].referenceType, "TEXT_DOCUMENT_KEY");

    const repairResults = repairCrossLogReferences(report, sampleManifest);
    assert.equal(repairResults[0].success, true);
    assert.equal(
      repairResults[0].repairedFormulaOrValue,
      '=HYPERLINK("https://docs.google.com/spreadsheets/d/target_workbook_999/edit#gid=10002&range=C25", "SUB-042")'
    );
  });

  it("flags unresolvable orphaned references and blocks canProceed", () => {
    const cells: SourceCellData[] = [
      {
        sheetId: "legacy_sub_sheet_456",
        tabName: "Submittals",
        rowIndex: 12,
        columnIndex: 2,
        cellAddress: "B12",
        rawFormulaOrValue: "Linked to RFI-999 (Deleted legacy item)",
      },
    ];

    const report = detectCrossLogReferences(cells, sampleManifest);
    assert.equal(report.references[0].healthStatus, "BROKEN_ORPHAN");
    assert.equal(report.canProceed, false);
  });
});
