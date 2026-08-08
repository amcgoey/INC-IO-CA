/**
 * @file prototype-sheets-card.ts
 * @description Local interactive prototype runner script for Issue #150: Google Sheets Contextual Add-on UI Card & Active-Sheet State Binding.
 *
 * Provides:
 * 1. An interactive CLI TUI runner (`npm run prototype:sheets-card`) displaying real-time active tab role classification,
 *    `SheetsRootCard` state, and a human-friendly CardService ActionResponse visual inspector.
 * 2. An HTTP preview server on port 3000 serving `src/prototypes/sheets-card-prototype.html` with variant switching.
 * 3. An automated step-through verification mode (`--auto`).
 */

import readline from "node:readline";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { SheetsCardPrototypeManager, SheetsCardState } from "../src/prototypes/SheetsCardPrototypeManager";

// ANSI Styling Constants
const ANSI = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
  MAGENTA: "\x1b[35m",
  RED: "\x1b[31m",
  BG_DARK: "\x1b[48;5;236m",
};

const PORT = 3000;
const HTML_PATH = path.join(__dirname, "../src/prototypes/sheets-card-prototype.html");

class SheetsCardPrototypeRunner {
  private state: SheetsCardState;
  private actionLog: string[] = [];
  private showRawJson = false;

  constructor() {
    this.state = SheetsCardPrototypeManager.buildSheetsMainCard({
      spreadsheetId: "log-wb-001",
      sheetName: "Submittal Arch",
    }, "A");
    this.log("Initialized prototype with mock workbook 'log-wb-001' and active tab 'Submittal Arch'.");
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString();
    this.actionLog.push(`[${time}] ${msg}`);
    if (this.actionLog.length > 5) this.actionLog.shift();
  }

  public renderFrame(): void {
    process.stdout.write("\x1b[2J\x1b[H");

    const { context, auditReport, notificationMessage, activeVariant } = this.state;
    const cardResponseJson = SheetsCardPrototypeManager.serializeToCardServiceResponse(this.state);
    const visualSummary = SheetsCardPrototypeManager.formatActionResponseVisual(this.state);

    console.log(`${ANSI.BOLD}${ANSI.CYAN}================================================================================${ANSI.RESET}`);
    console.log(`${ANSI.BOLD}${ANSI.YELLOW}   PROTOTYPE — Issue #150: Google Sheets Contextual Add-on UI Card (SheetsRootCard)${ANSI.RESET}`);
    console.log(`${ANSI.DIM}   Question: What is the prototype implementation and CardService action response model${ANSI.RESET}`);
    console.log(`${ANSI.DIM}             for rendering buildSheetsMainCard & binding active-sheet state?${ANSI.RESET}`);
    console.log(`${ANSI.BOLD}${ANSI.CYAN}================================================================================${ANSI.RESET}\n`);

    // 1. Spreadsheet Context View
    console.log(`${ANSI.BOLD}1. ACTIVE SPREADSHEET & TAB CONTEXT [Variant ${activeVariant}]${ANSI.RESET}`);
    console.log(`   Spreadsheet:   ${ANSI.BOLD}${context.spreadsheetTitle}${ANSI.RESET}`);
    console.log(`   ID & Schema:   ${ANSI.DIM}${context.spreadsheetId} (v${context.schemaVersion})${ANSI.RESET}`);
    console.log(`   Is Log WB:     ${context.isDocumentLogWorkbook ? `${ANSI.GREEN}YES (DocumentLogWorkbook)${ANSI.RESET}` : `${ANSI.RED}NO (Unrecognized Non-Log Spreadsheet)${ANSI.RESET}`}`);
    console.log(`   Active Tab:    ${ANSI.BOLD}${ANSI.YELLOW}${context.activeSheetName}${ANSI.RESET}`);
    console.log(`   Tab Role:      ${ANSI.BOLD}${ANSI.CYAN}${context.activeTabRole}${ANSI.RESET}`);
    console.log(`   DocType Key:   ${ANSI.BOLD}${context.documentTypeKey}${ANSI.RESET}`);
    console.log(`   Data Rows:     ${ANSI.BOLD}${context.dataRowCount}${ANSI.RESET} (bounded by sheet-scoped 'Data' range)\n`);

    // 2. Administrative FoldOut & Telemetry State
    console.log(`${ANSI.BOLD}2. SHEET ADMINISTRATION (SheetAdminFoldOut)${ANSI.RESET}`);
    if (auditReport) {
      console.log(`   Schema Audit:  ${ANSI.GREEN}${auditReport.status}${ANSI.RESET} — ${auditReport.summary}`);
    } else {
      console.log(`   Schema Audit:  ${ANSI.DIM}NOT RUN (Press [a] to trigger dry-run Schema Drift Audit)${ANSI.RESET}`);
    }
    if (notificationMessage) {
      console.log(`   Toast Notice:  ${ANSI.MAGENTA}"${notificationMessage}"${ANSI.RESET}\n`);
    } else {
      console.log(`   Toast Notice:  ${ANSI.DIM}<None>${ANSI.RESET}\n`);
    }

    // 3. User-Friendly Action Response Inspector
    console.log(`${ANSI.BOLD}3. CARD SERVICE RESPONSE INSPECTOR${ANSI.RESET} ${ANSI.DIM}(Press [j] to toggle raw JSON)${ANSI.RESET}`);
    if (this.showRawJson) {
      console.log(`${ANSI.DIM}${JSON.stringify(cardResponseJson, null, 2)}${ANSI.RESET}\n`);
    } else {
      console.log(`   Response Action: ${ANSI.BOLD}${ANSI.GREEN}${visualSummary.actionType}${ANSI.RESET}`);
      console.log(`   Card Subtitle:   ${ANSI.DIM}${visualSummary.subtitle}${ANSI.RESET}`);
      console.log(`   Card Sections (${visualSummary.sectionsSummary.length}):`);
      visualSummary.sectionsSummary.forEach((sec, idx) => {
        const flag = sec.collapsible ? `${ANSI.DIM}[COLLAPSIBLE]${ANSI.RESET}` : `${ANSI.GREEN}[VISIBLE]${ANSI.RESET}`;
        console.log(`     ${idx + 1}. ${ANSI.BOLD}${sec.header}${ANSI.RESET} ${flag} (${sec.widgetsCount} widgets: ${sec.widgetTypes.join(", ")})`);
      });
      if (visualSummary.toastNotification) {
        console.log(`   Toast Payload:   ${ANSI.MAGENTA}"${visualSummary.toastNotification}"${ANSI.RESET}`);
      }
      console.log("");
    }

    // 4. Event Log
    console.log(`${ANSI.BOLD}4. RECENT EVENT LOG${ANSI.RESET}`);
    this.actionLog.forEach((entry) => console.log(`   ${ANSI.DIM}${entry}${ANSI.RESET}`));
    console.log("");

    // 5. Controls
    console.log(`${ANSI.BOLD}${ANSI.CYAN}--------------------------------------------------------------------------------${ANSI.RESET}`);
    console.log(`${ANSI.BOLD}KEYBOARD CONTROLS:${ANSI.RESET}`);
    console.log(`   ${ANSI.BOLD}[1]${ANSI.RESET} Submittal Arch (Log Tab)   ${ANSI.BOLD}[2]${ANSI.RESET} Submittal FFE (Log Tab)`);
    console.log(`   ${ANSI.BOLD}[3]${ANSI.RESET} _Config (System Tab)       ${ANSI.BOLD}[4]${ANSI.RESET} _AuditLog (Audit Tab)`);
    console.log(`   ${ANSI.BOLD}[5]${ANSI.RESET} Documentation Tab          ${ANSI.BOLD}[6]${ANSI.RESET} ScratchPad (User Created)`);
    console.log(`   ${ANSI.BOLD}[7]${ANSI.RESET} Switch to Unrecognized Non-Log Spreadsheet`);
    console.log(`   ${ANSI.BOLD}[r]${ANSI.RESET} Refresh Context            ${ANSI.BOLD}[a]${ANSI.RESET} Run Schema Audit  ${ANSI.BOLD}[f]${ANSI.RESET} Purge ScriptCache`);
    console.log(`   ${ANSI.BOLD}[v]${ANSI.RESET} Cycle Layout Variant (A/B/C) ${ANSI.BOLD}[j]${ANSI.RESET} Toggle Raw JSON View`);
    console.log(`   ${ANSI.BOLD}[s]${ANSI.RESET} Launch Web UI Preview Server ${ANSI.BOLD}[q]${ANSI.RESET} Quit Prototype`);
    console.log(`${ANSI.BOLD}${ANSI.CYAN}--------------------------------------------------------------------------------${ANSI.RESET}`);
  }

  public selectContext(wbId: string, sheetName: string): void {
    this.state = SheetsCardPrototypeManager.buildSheetsMainCard({
      spreadsheetId: wbId,
      sheetName,
    }, this.state.activeVariant);
    this.log(`Selected workbook '${wbId}' and active tab '${sheetName}'.`);
  }

  public refresh(): void {
    this.state = SheetsCardPrototypeManager.onSheetsContextRefresh(this.state, {
      spreadsheetId: this.state.context.spreadsheetId,
      sheetName: this.state.context.activeSheetName,
    });
    this.log(this.state.notificationMessage || "Refreshed card context.");
  }

  public runAudit(): void {
    this.state = SheetsCardPrototypeManager.onRunSchemaDriftAudit(this.state);
    this.log(this.state.notificationMessage || "Executed schema audit.");
  }

  public purgeCache(): void {
    this.state = SheetsCardPrototypeManager.onFlushScriptCache(this.state);
    this.log(this.state.notificationMessage || "Purged ScriptCache.");
  }

  public cycleVariant(): void {
    const nextVariant = this.state.activeVariant === "A" ? "B" : this.state.activeVariant === "B" ? "C" : "A";
    this.state.activeVariant = nextVariant;
    this.log(`Switched layout variant to Variant ${nextVariant}.`);
  }

  public toggleJson(): void {
    this.showRawJson = !this.showRawJson;
    this.log(`Toggled JSON display mode (Raw JSON = ${this.showRawJson}).`);
  }

  public startWebServer(): void {
    if (!fs.existsSync(HTML_PATH)) {
      this.log(`Error: HTML prototype file not found at ${HTML_PATH}`);
      return;
    }

    const server = http.createServer((req, res) => {
      const content = fs.readFileSync(HTML_PATH, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    });

    server.listen(PORT, () => {
      const url = `http://localhost:${PORT}?variant=${this.state.activeVariant}`;
      this.log(`Web UI Server listening on ${url}`);
      if (process.platform === "win32") {
        exec(`start ${url}`);
      }
    });
  }
}

// Check for --auto flag for non-interactive test runs
const isAutoRun = process.argv.includes("--auto");
const runner = new SheetsCardPrototypeRunner();

if (isAutoRun) {
  console.log("Running Prototype Automated Step-Through Verification...\n");

  runner.renderFrame();
  runner.selectContext("log-wb-001", "Submittal FFE");
  runner.renderFrame();

  runner.runAudit();
  runner.renderFrame();

  runner.purgeCache();
  runner.renderFrame();

  runner.selectContext("non-log-wb-999", "Summary");
  runner.renderFrame();

  console.log("\nAutomated Step-Through Completed Successfully!");
  process.exit(0);
}

// Interactive Mode
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

runner.renderFrame();

process.stdin.on("keypress", (str, key) => {
  if (key.ctrl && key.name === "c") {
    process.exit();
  }

  const k = key.name || str;

  switch (k) {
    case "1":
      runner.selectContext("log-wb-001", "Submittal Arch");
      runner.renderFrame();
      break;
    case "2":
      runner.selectContext("log-wb-001", "Submittal FFE");
      runner.renderFrame();
      break;
    case "3":
      runner.selectContext("log-wb-001", "_Config");
      runner.renderFrame();
      break;
    case "4":
      runner.selectContext("log-wb-001", "_AuditLog");
      runner.renderFrame();
      break;
    case "5":
      runner.selectContext("log-wb-001", "Documentation");
      runner.renderFrame();
      break;
    case "6":
      runner.selectContext("log-wb-001", "ScratchPad");
      runner.renderFrame();
      break;
    case "7":
      runner.selectContext("non-log-wb-999", "Summary");
      runner.renderFrame();
      break;
    case "r":
      runner.refresh();
      runner.renderFrame();
      break;
    case "a":
      runner.runAudit();
      runner.renderFrame();
      break;
    case "f":
      runner.purgeCache();
      runner.renderFrame();
      break;
    case "v":
      runner.cycleVariant();
      runner.renderFrame();
      break;
    case "j":
      runner.toggleJson();
      runner.renderFrame();
      break;
    case "s":
      runner.startWebServer();
      runner.renderFrame();
      break;
    case "q":
      console.log("\nExiting prototype runner.");
      process.exit(0);
      break;
  }
});
