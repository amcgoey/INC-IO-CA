/**
 * @file prototype-cross-log-scanner.ts
 * @description Interactive TUI Runner for Issue #140 Prototype: Cross-Log Document Reference Scanner & Repair Engine.
 *
 * Demonstrates dry-run audit detection of cross-log references (RFIs, Submittals, ASIs, COs) in legacy sheets
 * and automated post-migration cell link & hyperlink repair.
 *
 * Adheres to CODING_STANDARDS.md (Tier 3 Host Tooling) and prototype/LOGIC.md guidelines.
 */

import readline from "node:readline";
import {
  SourceCellData,
  TargetLogManifest,
  CrossLogAuditReport,
  RepairResult,
  detectCrossLogReferences,
  repairCrossLogReferences,
} from "../src/prototypes/CrossLogReferenceScanner";

// ANSI Escape Codes for TUI Styling
const ANSI = {
  CLEAR: "\x1b[2J\x1b[H",
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
  RED: "\x1b[31m",
  MAGENTA: "\x1b[35m",
  BG_DARK: "\x1b[48;5;236m",
};

const INITIAL_SAMPLE_CELLS: SourceCellData[] = [
  {
    sheetId: "legacy_rfi_sheet_101",
    tabName: "RFIs",
    rowIndex: 15,
    columnIndex: 5,
    cellAddress: "E15",
    rawFormulaOrValue:
      '=HYPERLINK("https://docs.google.com/spreadsheets/d/legacy_rfi_sheet_101/edit#gid=1011&range=B15", "RFI-012")',
  },
  {
    sheetId: "legacy_rfi_sheet_101",
    tabName: "RFIs",
    rowIndex: 18,
    columnIndex: 6,
    cellAddress: "F18",
    rawFormulaOrValue: "Refers to Submittal #42 for rebar mill test reports",
  },
  {
    sheetId: "legacy_sub_sheet_202",
    tabName: "Submittals",
    rowIndex: 8,
    columnIndex: 4,
    cellAddress: "D8",
    rawFormulaOrValue: '=HYPERLINK("#gid=2022&range=C8", "ASI-005")',
  },
  {
    sheetId: "legacy_sub_sheet_202",
    tabName: "Submittals",
    rowIndex: 14,
    columnIndex: 7,
    cellAddress: "G14",
    rawFormulaOrValue: "='Legacy ASIs'!B12",
  },
  {
    sheetId: "legacy_co_sheet_303",
    tabName: "ChangeOrders",
    rowIndex: 6,
    columnIndex: 3,
    cellAddress: "C6",
    rawFormulaOrValue: "Pending resolution of CO-003 and RFI-012",
  },
];

const INITIAL_MANIFEST: TargetLogManifest = {
  targetSpreadsheetId: "unified_doc_log_workbook_2026",
  tabs: {
    RFIs: { gid: "888001", headerRow: 1, activeDataStartRow: 4 },
    Submittals: { gid: "888002", headerRow: 1, activeDataStartRow: 4 },
    ASIs: { gid: "888003", headerRow: 1, activeDataStartRow: 4 },
    ChangeOrders: { gid: "888004", headerRow: 1, activeDataStartRow: 4 },
  },
  sourceToTargetRowOffsets: {
    RFIs: 3,
    Submittals: 3,
    ASIs: 3,
    ChangeOrders: 3,
  },
  documentRegistry: {
    "RFI-012": {
      docKey: "RFI-012",
      docType: "RFI",
      docNumber: "012",
      targetSpreadsheetId: "unified_doc_log_workbook_2026",
      targetGid: "888001",
      targetTabName: "RFIs",
      targetRowIndex: 18,
      targetColumnIndex: 2,
      targetCellAddress: "B18",
    },
    "SUB-042": {
      docKey: "SUB-042",
      docType: "SUBMITTAL",
      docNumber: "042",
      targetSpreadsheetId: "unified_doc_log_workbook_2026",
      targetGid: "888002",
      targetTabName: "Submittals",
      targetRowIndex: 22,
      targetColumnIndex: 3,
      targetCellAddress: "C22",
    },
    "ASI-005": {
      docKey: "ASI-005",
      docType: "ASI",
      docNumber: "005",
      targetSpreadsheetId: "unified_doc_log_workbook_2026",
      targetGid: "888003",
      targetTabName: "ASIs",
      targetRowIndex: 11,
      targetColumnIndex: 1,
      targetCellAddress: "A11",
    },
    "CO-003": {
      docKey: "CO-003",
      docType: "CHANGE_ORDER",
      docNumber: "003",
      targetSpreadsheetId: "unified_doc_log_workbook_2026",
      targetGid: "888004",
      targetTabName: "ChangeOrders",
      targetRowIndex: 9,
      targetColumnIndex: 2,
      targetCellAddress: "B9",
    },
  },
};

class CrossLogScannerRunner {
  private cells: SourceCellData[] = JSON.parse(JSON.stringify(INITIAL_SAMPLE_CELLS));
  private manifest: TargetLogManifest = JSON.parse(JSON.stringify(INITIAL_MANIFEST));
  private auditReport: CrossLogAuditReport | null = null;
  private repairResults: RepairResult[] | null = null;
  private logs: string[] = [];

  constructor() {
    this.addLog("Prototype runner initialized with 5 legacy cross-log cells.");
    this.runAudit();
  }

  private addLog(msg: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.push(`[${timestamp}] ${msg}`);
    if (this.logs.length > 5) this.logs.shift();
  }

  public runAudit(): void {
    this.auditReport = detectCrossLogReferences(this.cells, this.manifest);
    this.repairResults = null;
    this.addLog(
      `Pass 1 Audit Scan complete: Detected ${this.auditReport.detectedReferencesCount} cross-log refs. Gate: ${
        this.auditReport.canProceed ? "PROCEED (PASS)" : "BLOCKED (FAIL)"
      }`
    );
  }

  public executeRepair(): void {
    if (!this.auditReport) {
      this.runAudit();
    }
    if (this.auditReport) {
      this.repairResults = repairCrossLogReferences(this.auditReport, this.manifest);
      this.addLog(
        `Pass 2 Post-Migration Link Repair executed for ${this.repairResults.length} references.`
      );
    }
  }

  public addSampleCell(rawVal: string, tabName = "RFIs"): void {
    const nextRow = 20 + this.cells.length;
    const newCell: SourceCellData = {
      sheetId: "legacy_user_custom_sheet",
      tabName,
      rowIndex: nextRow,
      columnIndex: 4,
      cellAddress: `D${nextRow}`,
      rawFormulaOrValue: rawVal,
    };
    this.cells.push(newCell);
    this.addLog(`Added legacy cell at ${newCell.cellAddress}: "${rawVal}"`);
    this.runAudit();
  }

  public addOrphanedCell(): void {
    this.addSampleCell("Refer to RFI-999 for missing engineering spec", "RFIs");
  }

  public resetDataset(): void {
    this.cells = JSON.parse(JSON.stringify(INITIAL_SAMPLE_CELLS));
    this.manifest = JSON.parse(JSON.stringify(INITIAL_MANIFEST));
    this.addLog("Reset dataset to initial sample legacy cells.");
    this.runAudit();
  }

  public renderFrame(): void {
    process.stdout.write(ANSI.CLEAR);
    console.log(
      `${ANSI.BOLD}${ANSI.CYAN}=== ISSUE 140 PROTOTYPE: CROSS-LOG DOCUMENT REFERENCE SCANNER & REPAIR ENGINE ===${ANSI.RESET}\n`
    );

    // Target Manifest Summary
    console.log(`${ANSI.BOLD}Target Log Manifest:${ANSI.RESET}`);
    console.log(
      `  ${ANSI.DIM}Target Spreadsheet ID:${ANSI.RESET} ${ANSI.YELLOW}${this.manifest.targetSpreadsheetId}${ANSI.RESET}`
    );
    console.log(
      `  ${ANSI.DIM}Indexed Target Documents:${ANSI.RESET} ${
        Object.keys(this.manifest.documentRegistry).length
      } keys (${Object.keys(this.manifest.documentRegistry).join(", ")})`
    );
    console.log("");

    // Audit Report Summary
    if (this.auditReport) {
      const gateColor = this.auditReport.canProceed ? ANSI.GREEN : ANSI.RED;
      const gateText = this.auditReport.canProceed
        ? "[CAN PROCEED - NO ORPHANS]"
        : "[BLOCKED - ORPHANED REFS DETECTED]";

      console.log(`${ANSI.BOLD}Dry-Run Audit Health:${ANSI.RESET} ${gateColor}${gateText}${ANSI.RESET}`);
      console.log(
        `  ${ANSI.DIM}Scanned Cells:${ANSI.RESET} ${this.auditReport.scannedCellCount} | ${ANSI.DIM}Detected Refs:${ANSI.RESET} ${this.auditReport.detectedReferencesCount}`
      );
      console.log(
        `  ${ANSI.DIM}Types:${ANSI.RESET} URL: ${this.auditReport.referenceTypeBreakdown.HYPERLINK_URL} | Internal GID: ${this.auditReport.referenceTypeBreakdown.INTERNAL_GID_LINK} | Formula: ${this.auditReport.referenceTypeBreakdown.SHEET_FORMULA} | Text Key: ${this.auditReport.referenceTypeBreakdown.TEXT_DOCUMENT_KEY}`
      );
      console.log(
        `  ${ANSI.DIM}Status:${ANSI.RESET} ${ANSI.GREEN}Healthy: ${this.auditReport.healthStatusBreakdown.HEALTHY}${ANSI.RESET} | ${ANSI.YELLOW}Needs Repair: ${this.auditReport.healthStatusBreakdown.NEEDS_REPAIR}${ANSI.RESET} | ${ANSI.RED}Orphans: ${this.auditReport.healthStatusBreakdown.BROKEN_ORPHAN}${ANSI.RESET}`
      );
    }
    console.log("");

    // Detected & Repaired References Table
    console.log(`${ANSI.BOLD}Detected Cross-Log References & Proposed Link Repairs:${ANSI.RESET}`);
    if (this.auditReport && this.auditReport.references.length > 0) {
      this.auditReport.references.forEach((ref, idx) => {
        const repair = this.repairResults ? this.repairResults[idx] : null;

        let statusColor = ANSI.YELLOW;
        if (ref.healthStatus === "HEALTHY") statusColor = ANSI.GREEN;
        if (ref.healthStatus === "BROKEN_ORPHAN") statusColor = ANSI.RED;

        console.log(
          `  ${ANSI.BOLD}${ref.id}${ANSI.RESET} [${ref.sourceLocation.tabName}!${ref.sourceLocation.cellAddress}] ${ANSI.DIM}(${ref.referenceType})${ANSI.RESET} -> ${statusColor}${ref.healthStatus}${ANSI.RESET}`
        );
        console.log(`     ${ANSI.DIM}Original:${ANSI.RESET} "${ref.rawFormulaOrValue}"`);

        if (repair) {
          console.log(
            `     ${ANSI.GREEN}Repaired:${ANSI.RESET} "${repair.repairedFormulaOrValue}" ${ANSI.DIM}[Strategy: ${repair.strategyApplied}]${ANSI.RESET}`
          );
        } else if (ref.proposedRepairedValue) {
          console.log(
            `     ${ANSI.CYAN}Proposed:${ANSI.RESET} "${ref.proposedRepairedValue}" ${ANSI.DIM}[Strategy: ${ref.repairStrategy}]${ANSI.RESET}`
          );
        }
        if (ref.notes) {
          console.log(`     ${ANSI.DIM}Notes: ${ref.notes}${ANSI.RESET}`);
        }
        console.log("");
      });
    } else {
      console.log(`  ${ANSI.DIM}(No cross-log references detected in current dataset)${ANSI.RESET}\n`);
    }

    // Action Log
    console.log(`${ANSI.BOLD}Activity Log:${ANSI.RESET}`);
    this.logs.forEach((log) => console.log(`  ${ANSI.DIM}${log}${ANSI.RESET}`));
    console.log("");

    // Keyboard Shortcuts Footer
    console.log(`${ANSI.BOLD}Actions:${ANSI.RESET}`);
    console.log(
      `  ${ANSI.BOLD}[1]${ANSI.RESET} Run Dry-Run Audit Scan   ${ANSI.BOLD}[2]${ANSI.RESET} Execute Link Repair   ${ANSI.BOLD}[3]${ANSI.RESET} Add Legacy Hyperlink`
    );
    console.log(
      `  ${ANSI.BOLD}[4]${ANSI.RESET} Add Text Reference       ${ANSI.BOLD}[5]${ANSI.RESET} Add Orphaned Reference ${ANSI.BOLD}[r]${ANSI.RESET} Reset Dataset   ${ANSI.BOLD}[q]${ANSI.RESET} Quit`
    );
    console.log("");
  }
}

async function main() {
  const runner = new CrossLogScannerRunner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  runner.renderFrame();

  const askUser = () => {
    rl.question(`${ANSI.BOLD}Select action > ${ANSI.RESET}`, (input) => {
      const choice = input.trim().toLowerCase();

      switch (choice) {
        case "1":
          runner.runAudit();
          runner.renderFrame();
          askUser();
          break;

        case "2":
          runner.executeRepair();
          runner.renderFrame();
          askUser();
          break;

        case "3":
          rl.question(
            `${ANSI.BOLD}Enter legacy HYPERLINK formula (or press Enter for default): ${ANSI.RESET}`,
            (formula) => {
              const val =
                formula.trim() ||
                '=HYPERLINK("https://docs.google.com/spreadsheets/d/old_asi_123/edit#gid=999&range=A5", "ASI-005")';
              runner.addSampleCell(val, "ASIs");
              runner.renderFrame();
              askUser();
            }
          );
          return;

        case "4":
          rl.question(
            `${ANSI.BOLD}Enter legacy text reference (or press Enter for default): ${ANSI.RESET}`,
            (text) => {
              const val = text.trim() || "Approved as per Submittal #42";
              runner.addSampleCell(val, "RFIs");
              runner.renderFrame();
              askUser();
            }
          );
          return;

        case "5":
          runner.addOrphanedCell();
          runner.renderFrame();
          askUser();
          break;

        case "r":
          runner.resetDataset();
          runner.renderFrame();
          askUser();
          break;

        case "q":
          console.log(`\n${ANSI.GREEN}Exiting Issue 140 prototype. Goodbye!${ANSI.RESET}\n`);
          rl.close();
          process.exit(0);

        default:
          runner.renderFrame();
          askUser();
          break;
      }
    });
  };

  askUser();
}

if (require.main === module) {
  main().catch(console.error);
}
