import { describe, it } from "node:test";
import assert from "node:assert";
import {
  normalizeDocKey,
  buildTargetLogManifestFromBatch,
  detectCrossLogReferences,
  repairCrossLogReferences,
  SourceCellData,
  TargetLogManifest
} from "../src/core/log/CrossLogReferenceScanner";
import { BatchMigrationEngine } from "../src/core/log/BatchMigrationEngine";
import {
  createDefaultManifest,
  MigrationBatchManifestData
} from "../src/core/log/MigrationBatchManifest";
import { parseRepairHyperlinksArgs } from "../scripts/repair-hyperlinks";
import { repairCrossLogReferences as gasRepairCrossLogReferences } from "../src/Main";
import { GasMockHarness } from "./harness/GasMockHarness";

class InMemoryTestStorageAdapter {
  private sheets: Record<string, any[][]> = {};
  private formulas: Record<string, string[][]> = {};
  private gids: Record<string, string> = {};

  constructor(sheets: Record<string, any[][]>, gids?: Record<string, string>) {
    this.sheets = sheets;
    this.gids = gids || {};
  }

  getSheetValues(sheetName: string): any[][] {
    return this.sheets[sheetName] || [];
  }

  setSheetValues(sheetName: string, values: any[][]): void {
    this.sheets[sheetName] = values;
  }

  getSheetFormulas(sheetName: string): string[][] {
    return this.formulas[sheetName] || [];
  }

  setSheetFormulas(sheetName: string, formulas: string[][]): void {
    this.formulas[sheetName] = formulas;
  }

  getTabGid(sheetName: string): string {
    return this.gids[sheetName] || "0";
  }

  getTabNames(): string[] {
    return Object.keys(this.sheets);
  }

  getRangeValue(sheetName: string, rowIndex: number, colIndex: number): any {
    return this.sheets[sheetName]?.[rowIndex - 1]?.[colIndex - 1];
  }

  setRangeValue(sheetName: string, rowIndex: number, colIndex: number, value: any): void {
    if (!this.sheets[sheetName]) this.sheets[sheetName] = [];
    if (!this.sheets[sheetName][rowIndex - 1]) this.sheets[sheetName][rowIndex - 1] = [];
    this.sheets[sheetName][rowIndex - 1][colIndex - 1] = value;
  }

  insertRowBefore(sheetName: string, rowIndex: number): void {
    if (!this.sheets[sheetName]) this.sheets[sheetName] = [];
    this.sheets[sheetName].splice(rowIndex - 1, 0, []);
  }

  insertRowAfter(sheetName: string, rowIndex: number): void {
    if (!this.sheets[sheetName]) this.sheets[sheetName] = [];
    this.sheets[sheetName].splice(rowIndex, 0, []);
  }

  setRowValues(sheetName: string, rowIndex: number, headers: string[], rowData: any[]): { failedColumns: string[] } {
    if (!this.sheets[sheetName]) this.sheets[sheetName] = [];
    this.sheets[sheetName][rowIndex - 1] = rowData;
    return { failedColumns: [] };
  }

  deleteTab(sheetName: string): void {
    delete this.sheets[sheetName];
    delete this.formulas[sheetName];
  }
}

class FakeBatchManifestRepository {
  private manifest: MigrationBatchManifestData | null = null;

  constructor(manifest?: MigrationBatchManifestData) {
    this.manifest = manifest || null;
  }

  getManifest(): MigrationBatchManifestData | null {
    return this.manifest;
  }

  saveManifest(manifest: MigrationBatchManifestData): void {
    this.manifest = JSON.parse(JSON.stringify(manifest));
  }
}

describe("Phase 2 Cross-Log Reference Scanning and Hyperlink Repair", () => {
  it("normalizeDocKey standardizes document keys into canonical format", () => {
    assert.strictEqual(normalizeDocKey("rfi", "5"), "RFI-005");
    assert.strictEqual(normalizeDocKey("submittal", "42"), "SUB-042");
    assert.strictEqual(normalizeDocKey("ASI", "12"), "ASI-012");
    assert.strictEqual(normalizeDocKey("CO", "3"), "CO-003");
  });

  it("buildTargetLogManifestFromBatch dynamically indexes multi-workbook documents and tab GIDs", () => {
    const manifestData = createDefaultManifest("batch_001", [
      { spreadsheetId: "1WB_RFI", spreadsheetName: "RFI Log", targetTabName: "RFI Arch Log" },
      { spreadsheetId: "1WB_SUB", spreadsheetName: "Submittal Log", targetTabName: "Submittal Arch Log" }
    ]);
    manifestData.entries[0].status = "MIGRATION_COMPLETE";
    manifestData.entries[1].status = "MIGRATION_COMPLETE";

    const storageMap = new Map<string, InMemoryTestStorageAdapter>();
    storageMap.set("1WB_RFI", new InMemoryTestStorageAdapter({
      "RFI Arch Log": [
        ["Header 1", "Header 2"],
        ["Sub 1", "Sub 2"],
        ["Sub 3", "Sub 4"],
        ["RFI-005", "Design Clarification"]
      ]
    }, { "RFI Arch Log": "10001" }));

    storageMap.set("1WB_SUB", new InMemoryTestStorageAdapter({
      "Submittal Arch Log": [
        ["Header 1", "Header 2"],
        ["Sub 1", "Sub 2"],
        ["Sub 3", "Sub 4"],
        ["SUB-042", "Structural Steel Shop Drawings"]
      ]
    }, { "Submittal Arch Log": "20002" }));

    const getStorage = (id: string) => storageMap.get(id)!;

    const targetManifest = buildTargetLogManifestFromBatch(manifestData, getStorage);

    assert.ok(targetManifest.documentRegistry["RFI-005"]);
    assert.strictEqual(targetManifest.documentRegistry["RFI-005"].targetSpreadsheetId, "1WB_RFI");
    assert.strictEqual(targetManifest.documentRegistry["RFI-005"].targetGid, "10001");
    assert.strictEqual(targetManifest.documentRegistry["RFI-005"].targetCellAddress, "A4");

    assert.ok(targetManifest.documentRegistry["SUB-042"]);
    assert.strictEqual(targetManifest.documentRegistry["SUB-042"].targetSpreadsheetId, "1WB_SUB");
    assert.strictEqual(targetManifest.documentRegistry["SUB-042"].targetGid, "20002");
    assert.strictEqual(targetManifest.documentRegistry["SUB-042"].targetCellAddress, "A4");
  });

  it("detectCrossLogReferences and repairCrossLogReferences re-bind cell hyperlinks to target spreadsheet ID, GID, and cell range", () => {
    const targetManifest: TargetLogManifest = {
      targetSpreadsheetId: "1PRIMARY_ID",
      tabs: {
        "RFI Arch Log": { targetSpreadsheetId: "1WB_RFI_TARGET", gid: "10001", headerRow: 1, activeDataStartRow: 4 },
        "Submittal Arch Log": { targetSpreadsheetId: "1WB_SUB_TARGET", gid: "20002", headerRow: 1, activeDataStartRow: 4 }
      },
      documentRegistry: {
        "RFI-005": {
          docKey: "RFI-005",
          docType: "RFI",
          docNumber: "005",
          targetSpreadsheetId: "1WB_RFI_TARGET",
          targetGid: "10001",
          targetTabName: "RFI Arch Log",
          targetRowIndex: 8,
          targetColumnIndex: 1,
          targetCellAddress: "A8"
        }
      },
      sourceToTargetRowOffsets: {}
    };

    const sourceCells: SourceCellData[] = [
      {
        sheetId: "1WB_SUB",
        tabName: "Submittal Arch Log",
        rowIndex: 4,
        columnIndex: 5,
        cellAddress: "E4",
        rawFormulaOrValue: '=HYPERLINK("https://docs.google.com/spreadsheets/d/OLD_ID/edit#gid=0&range=B12", "RFI-005")'
      }
    ];

    const report = detectCrossLogReferences(sourceCells, targetManifest, { allowUnmigratedFallback: true });
    assert.strictEqual(report.detectedReferencesCount, 1);
    assert.strictEqual(report.references[0].healthStatus, "NEEDS_REPAIR");
    assert.strictEqual(report.references[0].extractedTarget.docKey, "RFI-005");

    const repairResults = repairCrossLogReferences(report, targetManifest);
    assert.strictEqual(repairResults.length, 1);
    assert.strictEqual(repairResults[0].success, true);
    assert.strictEqual(
      repairResults[0].repairedFormulaOrValue,
      '=HYPERLINK("https://docs.google.com/spreadsheets/d/1WB_RFI_TARGET/edit#gid=10001&range=A8", "RFI-005")'
    );
  });

  it("preserves legacy URLs for unmigrated or failed target workbooks without failing Phase 2", () => {
    const targetManifest: TargetLogManifest = {
      targetSpreadsheetId: "1PRIMARY_ID",
      tabs: {},
      documentRegistry: {},
      sourceToTargetRowOffsets: {}
    };

    const sourceCells: SourceCellData[] = [
      {
        sheetId: "1WB_SUB",
        tabName: "Submittal Arch Log",
        rowIndex: 4,
        columnIndex: 5,
        cellAddress: "E4",
        rawFormulaOrValue: '=HYPERLINK("https://docs.google.com/spreadsheets/d/UNMIGRATED_TARGET/edit#gid=0", "ASI-005")'
      }
    ];

    const report = detectCrossLogReferences(sourceCells, targetManifest, { allowUnmigratedFallback: true });
    assert.strictEqual(report.canProceed, true);
    assert.strictEqual(report.references[0].isUnmigratedTarget, true);
    assert.strictEqual(report.references[0].proposedRepairedValue, sourceCells[0].rawFormulaOrValue);
  });

  it("executes Phase 2 hyperlink repair in BatchMigrationEngine only after Phase 1 finishes", () => {
    const manifestRepo = new FakeBatchManifestRepository();
    const storageMap = new Map<string, InMemoryTestStorageAdapter>();

    storageMap.set("1WB_1", new InMemoryTestStorageAdapter({
      "Submittal Arch Log": [
        ["Header 1", "Header 2", "Ref"],
        ["Sub 1", "Sub 2", "Sub 3"],
        ["Sub 4", "Sub 5", "Sub 6"],
        ["SUB-001", "Door Hardware", '=HYPERLINK("https://docs.google.com/spreadsheets/d/OLD/edit#gid=0", "RFI-005")']
      ]
    }, { "Submittal Arch Log": "101" }));

    storageMap.set("1WB_2", new InMemoryTestStorageAdapter({
      "Submittal Arch Log": [
        ["Header 1", "Header 2", "Ref"],
        ["Sub 1", "Sub 2", "Sub 3"],
        ["Sub 4", "Sub 5", "Sub 6"],
        ["RFI-005", "Foundation Details", "Clear"]
      ]
    }, { "Submittal Arch Log": "202" }));

    const getStorage = (id: string) => storageMap.get(id)!;
    const engine = new BatchMigrationEngine(getStorage, manifestRepo);

    const initialManifest = engine.initializeBatch("batch_phase2_test", [
      { spreadsheetId: "1WB_1", spreadsheetName: "Workbook 1", targetTabName: "Submittal Arch Log" },
      { spreadsheetId: "1WB_2", spreadsheetName: "Workbook 2", targetTabName: "Submittal Arch Log" }
    ]);

    const result = engine.runBatch(initialManifest);

    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.manifest.batchStatus, "COMPLETED");
    assert.strictEqual(result.manifest.entries[0].status, "COMPLETED");
    assert.strictEqual(result.manifest.entries[1].status, "COMPLETED");

    // Verify hyperlink repaired in workbook 1 pointing to workbook 2 cell A4
    const wb1Values = storageMap.get("1WB_1")!.getSheetValues("Submittal Arch Log");
    assert.strictEqual(
      wb1Values[3][2],
      '=HYPERLINK("https://docs.google.com/spreadsheets/d/1WB_2/edit#gid=202&range=A4", "RFI-005")'
    );
  });

  it("parseRepairHyperlinksArgs parses CLI flags --batch-id, --spreadsheet-ids, and --manifest-path", () => {
    const args = parseRepairHyperlinksArgs([
      "--batch-id", "batch_cli_999",
      "--spreadsheet-ids", "1WB_A,1WB_B",
      "--manifest-path", "./test-manifest.json"
    ]);

    assert.strictEqual(args.batchId, "batch_cli_999");
    assert.deepStrictEqual(args.spreadsheetIds, ["1WB_A", "1WB_B"]);
    assert.strictEqual(args.manifestPath, "./test-manifest.json");
  });

  it("gasRepairCrossLogReferences runs GAS entry point under GasMockHarness without throwing runtime exceptions", () => {
    GasMockHarness.install();
    const result = gasRepairCrossLogReferences("batch_gas_test");
    assert.ok(result);
    assert.ok(result.status === "COMPLETED" || result.status === "FAILED");
  });
});
