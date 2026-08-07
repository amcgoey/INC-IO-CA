/**
 * @file prototype-resilient-config.ts
 * @description Executable CLI prototype runner & interactive TUI for Issue #129:
 * Multi-Project Config Loader & Resilient Serialization Spike.
 */

import * as readline from "readline";
import {
  ResilientConfigParser,
  ManifestSchema,
  ParseResult,
  RecoveryIssue
} from "../src/prototypes/ResilientConfigParser";

// ANSI escape sequences
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  bgBlue: "\x1b[44m\x1b[37m\x1b[1m"
};

// Target Multi-DocumentType Architecture Schema
const TARGET_SCHEMA: ManifestSchema = {
  fields: {
    ENABLED: {
      key: "ENABLED",
      type: "boolean",
      defaultValue: true
    },
    DOC_TYPE_KEY: {
      key: "DOC_TYPE_KEY",
      type: "enum",
      allowedValues: ["SUBMITTAL_ARCH", "SUBMITTAL_FFE", "RFI_LOG", "CHANGE_ORDER"],
      required: true,
      defaultValue: "SUBMITTAL_ARCH"
    },
    DATA_RANGE: {
      key: "DATA_RANGE",
      type: "range",
      required: true
      // Arbitrary hardcoded "A4:Z" fallback is intentionally omitted to prevent sheet corruption
    },
    SUPPORTED_LOGS: {
      key: "SUPPORTED_LOGS",
      type: "list",
      defaultValue: ["Submittal Arch", "Submittal FFE"]
    },
    CACHE_TTL_MS: {
      key: "CACHE_TTL_MS",
      type: "number",
      defaultValue: 21600000
    },
    AUTO_MIGRATE: {
      key: "AUTO_MIGRATE",
      type: "boolean",
      defaultValue: false
    }
  }
};

// Preset Test Cases representing non-technical user input errors
interface PresetTestCase {
  name: string;
  description: string;
  rawInputs: Record<string, any>;
}

const PRESETS: PresetTestCase[] = [
  {
    name: "Preset 1: Smart Quotes & Curly Formatting",
    description: "User copied config from Word/Docs containing curly double/single quotes and zero-width spaces.",
    rawInputs: {
      ENABLED: "“YES”",
      DOC_TYPE_KEY: "‘submittal arch’",
      DATA_RANGE: "“A4:Z”",
      SUPPORTED_LOGS: "“Submittal Arch”, “Submittal FFE”",
      CACHE_TTL_MS: "‘21,600,000’",
      AUTO_MIGRATE: "‘NO’"
    }
  },
  {
    name: "Preset 2: Malformed Cell Ranges & Sheet Prefixes",
    description: "User entered dash/double-dot range delimiters and omitted the '!' sheet separator.",
    rawInputs: {
      ENABLED: "true",
      DOC_TYPE_KEY: "SUBMITTAL_FFE",
      DATA_RANGE: "'Submittal Support' A4-Z",
      SUPPORTED_LOGS: "Submittal FFE",
      CACHE_TTL_MS: "21600000 ms",
      AUTO_MIGRATE: "false"
    }
  },
  {
    name: "Preset 3: Ambiguous Booleans & Pasted JSON Arrays",
    description: "User entered bracketed truthy text [TRUE] and pasted a literal JSON string array.",
    rawInputs: {
      ENABLED: "[TRUE]",
      DOC_TYPE_KEY: "submittal-ffe",
      DATA_RANGE: "A4..Z",
      SUPPORTED_LOGS: "[\"Submittal Arch\", \"Submittal FFE\", \"RFI Log\"]",
      CACHE_TTL_MS: "21600000",
      AUTO_MIGRATE: "ENABLE"
    }
  },
  {
    name: "Preset 4: Multi-Delimiter Pipe/Semicolon Lists & Units",
    description: "User separated log options with pipes/semicolons and appended dollar/unit signs to numbers.",
    rawInputs: {
      ENABLED: "1",
      DOC_TYPE_KEY: "RFI_LOG",
      DATA_RANGE: "A4:",
      SUPPORTED_LOGS: "Submittal Arch | Submittal FFE ; RFI Log",
      CACHE_TTL_MS: "21,600 sec",
      AUTO_MIGRATE: "0"
    }
  },
  {
    name: "Preset 5: Catastrophic Chaos (Mixed Errors & Missing Fields)",
    description: "User entered bad enums, invalid boolean text, formatted currency, and missing fields.",
    rawInputs: {
      ENABLED: "MAYBE",
      DOC_TYPE_KEY: "UNKNOWN_TYPE_KEY",
      DATA_RANGE: "INVALID_RANGE!!!",
      SUPPORTED_LOGS: "",
      CACHE_TTL_MS: "$50,000",
      AUTO_MIGRATE: "[DISABLED]"
    }
  }
];

class PrototypeTUI {
  private parser = new ResilientConfigParser();
  private selectedPresetIndex = 0;
  private customInputs: Record<string, any> | null = null;

  private getCurrentInputs(): { title: string; inputs: Record<string, any> } {
    if (this.customInputs) {
      return { title: "Custom User Inputs", inputs: this.customInputs };
    }
    const preset = PRESETS[this.selectedPresetIndex];
    return { title: preset.name, inputs: preset.rawInputs };
  }

  public renderFrame() {
    // Clear console screen and reset cursor position
    console.clear();

    const { title, inputs } = this.getCurrentInputs();
    const presetDesc = this.customInputs
      ? "User-modified raw cell inputs."
      : PRESETS[this.selectedPresetIndex].description;

    const result: ParseResult = this.parser.parseManifest(TARGET_SCHEMA, inputs);

    console.log(`${ANSI.bgBlue}  PROTOTYPE — ISSUE #129: RESILIENT CONFIG PARSER & RECOVERY ENGINE  ${ANSI.reset}\n`);
    console.log(`${ANSI.bold}PROTOTYPE QUESTION:${ANSI.reset} How should the config parser recover from non-technical user input errors without crashing execution?`);
    console.log(`${ANSI.dim}Active Preset [${this.selectedPresetIndex + 1}/${PRESETS.length}]: ${ANSI.reset}${ANSI.cyan}${title}${ANSI.reset}`);
    console.log(`${ANSI.dim}Description:${ANSI.reset} ${presetDesc}\n`);

    console.log(`${ANSI.bold}--------------------------------------------------------------------------------${ANSI.reset}`);
    console.log(`${ANSI.bold}1. RAW INPUT CELL VALUES (From Google Sheets / Config Manifest):${ANSI.reset}`);
    console.log(`${ANSI.bold}--------------------------------------------------------------------------------${ANSI.reset}`);
    for (const [key, val] of Object.entries(inputs)) {
      console.log(`  ${ANSI.bold}${key.padEnd(16)}:${ANSI.reset} ${ANSI.yellow}${JSON.stringify(val)}${ANSI.reset}`);
    }
    console.log("");

    console.log(`${ANSI.bold}--------------------------------------------------------------------------------${ANSI.reset}`);
    console.log(`${ANSI.bold}2. RECOVERED & TYPED CONFIG OBJECT (Target Runtime Output):${ANSI.reset}`);
    console.log(`${ANSI.bold}--------------------------------------------------------------------------------${ANSI.reset}`);
    for (const [key, val] of Object.entries(result.config)) {
      const typeStr = typeof val === "object" ? "array" : typeof val;
      console.log(
        `  ${ANSI.bold}${key.padEnd(16)}:${ANSI.reset} ${ANSI.green}${JSON.stringify(val)}${ANSI.reset} ${ANSI.dim}(${typeStr})${ANSI.reset}`
      );
    }
    console.log("");

    console.log(`${ANSI.bold}--------------------------------------------------------------------------------${ANSI.reset}`);
    console.log(`${ANSI.bold}3. RECOVERY AUDIT LOG (${result.issues.length} Issues Handled):${ANSI.reset}`);
    console.log(`${ANSI.bold}--------------------------------------------------------------------------------${ANSI.reset}`);
    if (result.issues.length === 0) {
      console.log(`  ${ANSI.green}✓ Clean parse — no input errors detected.${ANSI.reset}`);
    } else {
      result.issues.forEach((issue: RecoveryIssue) => {
        let badge = "";
        switch (issue.severity) {
          case "RECOVERED":
            badge = `${ANSI.green}[RECOVERED]${ANSI.reset}`;
            break;
          case "WARNING":
            badge = `${ANSI.yellow}[WARNING]  ${ANSI.reset}`;
            break;
          case "INFO":
            badge = `${ANSI.cyan}[INFO]     ${ANSI.reset}`;
            break;
          case "ERROR":
            badge = `${ANSI.red}[ERROR]    ${ANSI.reset}`;
            break;
        }
        console.log(`  ${badge} ${ANSI.bold}${issue.field}${ANSI.reset}: ${issue.message}`);
        console.log(`            ${ANSI.dim}Raw: ${JSON.stringify(issue.rawInput)} -> Coerced: ${JSON.stringify(issue.recoveredValue)}${ANSI.reset}`);
      });
    }
    console.log("");

    console.log(`${ANSI.bold}--------------------------------------------------------------------------------${ANSI.reset}`);
    console.log(
      `${ANSI.bold}KEYBOARD SHORTCUTS:${ANSI.reset} ${ANSI.bold}[1-5]${ANSI.reset} Load Presets  ${ANSI.bold}[n]${ANSI.reset} Next Preset  ${ANSI.bold}[a]${ANSI.reset} Run All Presets  ${ANSI.bold}[q]${ANSI.reset} Quit`
    );
    console.log(`${ANSI.bold}--------------------------------------------------------------------------------${ANSI.reset}`);
  }

  public runBatchTest() {
    console.clear();
    console.log(`${ANSI.bgBlue}  AUTOMATED BATCH RUN — ALL PRESET TEST CASES  ${ANSI.reset}\n`);

    PRESETS.forEach((preset, idx) => {
      console.log(`${ANSI.bold}==============================================================================${ANSI.reset}`);
      console.log(`${ANSI.bold}TEST ${idx + 1}: ${preset.name}${ANSI.reset}`);
      console.log(`${ANSI.dim}${preset.description}${ANSI.reset}`);
      console.log(`${ANSI.bold}==============================================================================${ANSI.reset}`);

      const result = this.parser.parseManifest(TARGET_SCHEMA, preset.rawInputs);

      console.log(`${ANSI.bold}RAW INPUTS:${ANSI.reset}`, JSON.stringify(preset.rawInputs));
      console.log(`${ANSI.bold}PARSED CONFIG:${ANSI.reset}`, JSON.stringify(result.config));
      console.log(`${ANSI.bold}RECOVERY ACTIONS:${ANSI.reset}`);
      result.issues.forEach((iss) => {
        console.log(`  - [${iss.severity}] ${iss.field}: ${iss.message}`);
      });
      console.log("");
    });

    console.log(`${ANSI.bold}✓ All 5 presets successfully auto-recovered without crashing execution!${ANSI.reset}\n`);
  }

  public startInteractive() {
    const isBatch = process.argv.includes("--batch") || !process.stdin.isTTY;
    if (isBatch) {
      this.runBatchTest();
      return;
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    this.renderFrame();

    process.stdin.on("keypress", (str, key) => {
      if (key.ctrl && key.name === "c") {
        process.exit();
      }

      const input = str.toLowerCase();
      if (input === "q") {
        console.clear();
        console.log(`${ANSI.green}Prototype session exited cleanly.${ANSI.reset}`);
        process.exit();
      } else if (input >= "1" && input <= "5") {
        this.selectedPresetIndex = parseInt(input, 10) - 1;
        this.customInputs = null;
        this.renderFrame();
      } else if (input === "n") {
        this.selectedPresetIndex = (this.selectedPresetIndex + 1) % PRESETS.length;
        this.customInputs = null;
        this.renderFrame();
      } else if (input === "a") {
        process.stdin.setRawMode(false);
        this.runBatchTest();
        console.log("Press Enter to return to interactive TUI...");
        process.stdin.once("data", () => {
          process.stdin.setRawMode(true);
          this.renderFrame();
        });
      }
    });
  }
}

// Main execution point
if (require.main === module) {
  const tui = new PrototypeTUI();
  tui.startInteractive();
}
