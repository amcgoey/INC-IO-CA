/**
 * @file prototype-usercache-state.ts
 * @description Interactive TUI runner for Issue #135 Prototype: Loss-Less Card State Preservation via UserCache.
 *
 * Demonstrates how UserCache preserves draft form inputs across Google Apps Script card section re-renders
 * and email context switches.
 */

import readline from "node:readline";
import { CardDraftStateManager, ResolvedCardState } from "../src/prototypes/CardDraftStateManager";
import { InMemoryCacheAdapter } from "../test/harness/fakes/FakeCacheAdapter";

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

interface EmailContext {
  messageId: string;
  subject: string;
  sender: string;
  extractedMetadata: {
    docTypeKey: string;
    projectId: string;
    csiSection: string;
    notes: string;
  };
}

const SAMPLE_EMAILS: EmailContext[] = [
  {
    messageId: "msg_submittal_101",
    subject: "Subcontractor Rebar Submittal #42 - Tower B",
    sender: "steel-corp@example.com",
    extractedMetadata: {
      docTypeKey: "SUBMITTAL",
      projectId: "PROJ-TOWER-B",
      csiSection: "03 30 00",
      notes: "Extracted from email header: Rebar shop drawings",
    },
  },
  {
    messageId: "msg_rfi_108",
    subject: "URGENT: RFI #108 Foundation Structural Integrity",
    sender: "john.engineer@inc-eng.com",
    extractedMetadata: {
      docTypeKey: "RFI",
      projectId: "PROJ-FOUNDATION",
      csiSection: "02 20 00",
      notes: "Extracted: Clarification needed on pile depth",
    },
  },
  {
    messageId: "msg_general_202",
    subject: "Weekly Site Safety Inspection Report",
    sender: "safety@inc-build.com",
    extractedMetadata: {
      docTypeKey: "SAFETY_LOG",
      projectId: "PROJ-SAFETY-GENERAL",
      csiSection: "01 35 29",
      notes: "Extracted: Weekly safety walkthrough summary",
    },
  },
];

class PrototypeRunner {
  private cache = new InMemoryCacheAdapter();
  private activeEmailIndex = 0;
  private actionLog: string[] = [];
  private liveFormInputs: {
    docTypeKey?: string;
    projectId?: string;
    csiSection?: string;
    notes?: string;
    aiAnalyzeRequested?: boolean;
  } = {};

  constructor() {
    this.log("Initialized prototype with 3 mock email contexts and InMemoryCacheAdapter.");
  }

  private log(message: string): void {
    const time = new Date().toLocaleTimeString();
    this.actionLog.push(`[${time}] ${message}`);
    if (this.actionLog.length > 5) {
      this.actionLog.shift();
    }
  }

  public getActiveEmail(): EmailContext {
    return SAMPLE_EMAILS[this.activeEmailIndex];
  }

  public renderFrame(): void {
    const activeEmail = this.getActiveEmail();
    const cacheKey = CardDraftStateManager.getCacheKey(activeEmail.messageId);
    const rawCacheValue = this.cache.get(cacheKey);

    const resolvedState: ResolvedCardState = CardDraftStateManager.resolveCardFormState({
      cache: this.cache,
      messageId: activeEmail.messageId,
      extractedMetadata: activeEmail.extractedMetadata,
      liveFormInputs: this.liveFormInputs,
    });

    // Clear terminal screen
    process.stdout.write("\x1b[2J\x1b[H");

    console.log(`${ANSI.BOLD}${ANSI.CYAN}================================================================================${ANSI.RESET}`);
    console.log(`${ANSI.BOLD}${ANSI.YELLOW}   PROTOTYPE — Issue #135: Loss-Less Card State Preservation via UserCache${ANSI.RESET}`);
    console.log(`${ANSI.DIM}   Question: How can UserCache preserve draft form inputs across card section re-renders${ANSI.RESET}`);
    console.log(`${ANSI.DIM}             and email context switches in Google Workspace Add-ons?${ANSI.RESET}`);
    console.log(`${ANSI.BOLD}${ANSI.CYAN}================================================================================${ANSI.RESET}\n`);

    // 1. Context Section
    console.log(`${ANSI.BOLD}1. ACTIVE GMAIL CONTEXT${ANSI.RESET}`);
    console.log(`   Message ID:    ${ANSI.GREEN}${activeEmail.messageId}${ANSI.RESET}`);
    console.log(`   Subject:       ${activeEmail.subject}`);
    console.log(`   Sender:        ${activeEmail.sender}\n`);

    // 2. Direct Cache Inspection
    console.log(`${ANSI.BOLD}2. USERCACHE DIRECT INSPECTION (${cacheKey})${ANSI.RESET}`);
    if (rawCacheValue) {
      console.log(`   Cache Status:  ${ANSI.GREEN}PRESENT (Draft Active)${ANSI.RESET}`);
      console.log(`   Raw Payload:   ${ANSI.DIM}${rawCacheValue}${ANSI.RESET}\n`);
    } else {
      console.log(`   Cache Status:  ${ANSI.DIM}EMPTY (No draft saved for this email)${ANSI.RESET}\n`);
    }

    // 3. Form Input State & Provenance
    console.log(`${ANSI.BOLD}3. RESOLVED CARD FORM STATE & PROVENANCE${ANSI.RESET}`);
    const provColor = (p: string) => {
      switch (p) {
        case "LIVE_INPUT":
          return `${ANSI.BOLD}${ANSI.GREEN}[LIVE_INPUT]${ANSI.RESET}`;
        case "USER_CACHE_DRAFT":
          return `${ANSI.BOLD}${ANSI.YELLOW}[USER_CACHE_DRAFT]${ANSI.RESET}`;
        case "EXTRACTED_METADATA":
          return `${ANSI.CYAN}[EXTRACTED_METADATA]${ANSI.RESET}`;
        default:
          return `${ANSI.DIM}[DEFAULT]${ANSI.RESET}`;
      }
    };

    console.log(`   DocType:       ${ANSI.BOLD}${resolvedState.docTypeKey.padEnd(25)}${ANSI.RESET} ${provColor(resolvedState.provenance.docTypeKey)}`);
    console.log(`   Project ID:    ${ANSI.BOLD}${resolvedState.projectId.padEnd(25)}${ANSI.RESET} ${provColor(resolvedState.provenance.projectId)}`);
    console.log(`   CSI Section:   ${ANSI.BOLD}${(resolvedState.csiSection || "<BLANK>").padEnd(25)}${ANSI.RESET} ${provColor(resolvedState.provenance.csiSection)}`);
    console.log(`   Notes:         ${ANSI.BOLD}${(resolvedState.notes || "<BLANK>").padEnd(25)}${ANSI.RESET} ${provColor(resolvedState.provenance.notes)}`);
    console.log(`   AI Requested:  ${ANSI.BOLD}${String(resolvedState.aiAnalyzeRequested).padEnd(25)}${ANSI.RESET} ${provColor(resolvedState.provenance.aiAnalyzeRequested)}\n`);

    // 4. Action Log
    console.log(`${ANSI.BOLD}4. RECENT EVENT LOG${ANSI.RESET}`);
    this.actionLog.forEach((entry) => {
      console.log(`   ${ANSI.DIM}${entry}${ANSI.RESET}`);
    });
    console.log("");

    // 5. Controls
    console.log(`${ANSI.BOLD}${ANSI.CYAN}--------------------------------------------------------------------------------${ANSI.RESET}`);
    console.log(`${ANSI.BOLD}KEYBOARD CONTROLS:${ANSI.RESET}`);
    console.log(`   ${ANSI.BOLD}[1]${ANSI.RESET} Email A (Submittal)  ${ANSI.BOLD}[2]${ANSI.RESET} Email B (RFI)  ${ANSI.BOLD}[3]${ANSI.RESET} Email C (Safety)`);
    console.log(`   ${ANSI.BOLD}[n]${ANSI.RESET} Edit Draft Notes    ${ANSI.BOLD}[c]${ANSI.RESET} Edit CSI Code  ${ANSI.BOLD}[d]${ANSI.RESET} Toggle DocType`);
    console.log(`   ${ANSI.BOLD}[a]${ANSI.RESET} Toggle AI Request   ${ANSI.BOLD}[r]${ANSI.RESET} Simulate Card Re-render (save live to UserCache)`);
    console.log(`   ${ANSI.BOLD}[p]${ANSI.RESET} Process Document (Submit & Clear Cache)`);
    console.log(`   ${ANSI.BOLD}[x]${ANSI.RESET} Wipe UserCache Draft (without submitting)`);
    console.log(`   ${ANSI.BOLD}[q]${ANSI.RESET} Quit Prototype`);
    console.log(`${ANSI.BOLD}${ANSI.CYAN}--------------------------------------------------------------------------------${ANSI.RESET}`);
  }

  public switchEmail(index: number): void {
    if (index >= 0 && index < SAMPLE_EMAILS.length) {
      // First, flush current live inputs to UserCache draft for the current email if user made any edits
      const currentEmail = this.getActiveEmail();
      if (Object.keys(this.liveFormInputs).length > 0) {
        CardDraftStateManager.saveDraft(this.cache, currentEmail.messageId, this.liveFormInputs);
        this.log(`Auto-saved draft for ${currentEmail.messageId} before switching context.`);
      }

      this.activeEmailIndex = index;
      this.liveFormInputs = {}; // Reset live form inputs for newly selected email
      const newEmail = this.getActiveEmail();
      this.log(`Switched active context to ${newEmail.messageId} (${newEmail.subject.substring(0, 30)}...)`);
    }
  }

  public setLiveInput(key: "notes" | "csiSection" | "docTypeKey" | "aiAnalyzeRequested", value: any): void {
    this.liveFormInputs[key] = value;
    const email = this.getActiveEmail();

    // Persist immediately to UserCache (imitating loss-less input handler in Add-on)
    CardDraftStateManager.saveDraft(this.cache, email.messageId, this.liveFormInputs);
    this.log(`Updated field '${key}' -> '${value}' & synced to UserCache.`);
  }

  public simulateReRender(): void {
    const email = this.getActiveEmail();
    if (Object.keys(this.liveFormInputs).length > 0) {
      CardDraftStateManager.saveDraft(this.cache, email.messageId, this.liveFormInputs);
    }
    // Simulate GAS card section update: clear transient live inputs, state restored from UserCache
    this.liveFormInputs = {};
    this.log(`Card section re-rendered! Live transient inputs cleared, state preserved from UserCache.`);
  }

  public processDocument(): void {
    const email = this.getActiveEmail();
    CardDraftStateManager.clearDraft(this.cache, email.messageId);
    this.liveFormInputs = {};
    this.log(`Document PROCESSED! Cleared UserCache draft for ${email.messageId}.`);
  }

  public wipeCache(): void {
    const email = this.getActiveEmail();
    CardDraftStateManager.clearDraft(this.cache, email.messageId);
    this.liveFormInputs = {};
    this.log(`UserCache draft explicitly WIPED for ${email.messageId}.`);
  }
}

// Check for --auto flag for non-interactive test runs
const isAutoRun = process.argv.includes("--auto");

const runner = new PrototypeRunner();

if (isAutoRun) {
  console.log("Running Prototype Automated Step-Through Verification...\n");

  // Step 1: Render initial frame for Email A
  runner.renderFrame();

  // Step 2: User types notes into Email A
  runner.setLiveInput("notes", "Draft notes entered by user for Submittal");
  runner.setLiveInput("csiSection", "03 32 10");
  runner.renderFrame();

  // Step 3: Simulate card re-render
  runner.simulateReRender();
  runner.renderFrame();

  // Step 4: Switch to Email B
  runner.switchEmail(1);
  runner.renderFrame();

  // Step 5: User types notes in Email B
  runner.setLiveInput("notes", "Critical depth issue flagged for RFI 108");
  runner.renderFrame();

  // Step 6: Switch back to Email A (UserCache restores Email A's draft!)
  runner.switchEmail(0);
  runner.renderFrame();

  // Step 7: Process Email A
  runner.processDocument();
  runner.renderFrame();

  console.log("\nAutomated Step-Through Completed Successfully!");
  process.exit(0);
}

// Interactive Keyboard Mode
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

runner.renderFrame();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

process.stdin.on("keypress", (str, key) => {
  if (key.ctrl && key.name === "c") {
    process.exit();
  }

  const k = key.name || str;

  switch (k) {
    case "1":
      runner.switchEmail(0);
      runner.renderFrame();
      break;
    case "2":
      runner.switchEmail(1);
      runner.renderFrame();
      break;
    case "3":
      runner.switchEmail(2);
      runner.renderFrame();
      break;
    case "r":
      runner.simulateReRender();
      runner.renderFrame();
      break;
    case "p":
      runner.processDocument();
      runner.renderFrame();
      break;
    case "x":
      runner.wipeCache();
      runner.renderFrame();
      break;
    case "a":
      const email = runner.getActiveEmail();
      const currentDraft = CardDraftStateManager.getDraft(new InMemoryCacheAdapter(), email.messageId);
      runner.setLiveInput("aiAnalyzeRequested", !currentDraft?.aiAnalyzeRequested);
      runner.renderFrame();
      break;
    case "n":
      rl.question("\nEnter new draft notes: ", (answer) => {
        runner.setLiveInput("notes", answer.trim());
        runner.renderFrame();
      });
      break;
    case "c":
      rl.question("\nEnter new CSI code (e.g. 03 30 00): ", (answer) => {
        runner.setLiveInput("csiSection", answer.trim());
        runner.renderFrame();
      });
      break;
    case "d":
      const emailCtx = runner.getActiveEmail();
      const docTypeToggle = emailCtx.extractedMetadata.docTypeKey === "SUBMITTAL" ? "RFI" : "SUBMITTAL";
      runner.setLiveInput("docTypeKey", docTypeToggle);
      runner.renderFrame();
      break;
    case "q":
      console.log("\nExiting prototype runner.");
      process.exit(0);
      break;
  }
});
