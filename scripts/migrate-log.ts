/**
 * @file migrate-log.ts
 * @description CLI command line entry point for single-workbook log migration Pass 1 dry-run audit and Pass 2 execution.
 *
 * Usage:
 * npm run migrate:log -- --source=<id> --target=<id> --dry-run
 */

import { LogMigrationEngine } from "../src/core/log/LogMigrationEngine";
import { FakeSpreadsheetLockAdapter } from "../src/adapters/fakes/FakeSpreadsheetLockAdapter";
import { InMemorySheetStorageAdapter } from "../test/harness/fakes/InMemorySheetStorageAdapter";

export function parseMigrateLogArgs(argv: string[]): {
  source: string;
  target: string;
  dryRun: boolean;
  tabName: string;
} {
  let source = "";
  let target = "";
  let dryRun = false;
  let tabName = "Submittal Arch";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--source=")) {
      source = arg.split("=")[1];
    } else if (arg === "--source" && argv[i + 1]) {
      source = argv[++i];
    } else if (arg.startsWith("--target=")) {
      target = arg.split("=")[1];
    } else if (arg === "--target" && argv[i + 1]) {
      target = argv[++i];
    } else if (arg === "--dry-run" || arg === "--dryRun") {
      dryRun = true;
    } else if (arg.startsWith("--tab=")) {
      tabName = arg.split("=")[1];
    }
  }

  return { source, target, dryRun, tabName };
}

export function runMigrateLogCli(
  argv: string[] = process.argv.slice(2),
  customStorageAdapter?: InMemorySheetStorageAdapter,
  customSourceStorageAdapter?: InMemorySheetStorageAdapter
): any {
  const args = parseMigrateLogArgs(argv);
  console.log("=== Log Migration CLI Execution ===");
  console.log("Source Spreadsheet ID: " + (args.source || "(default-test-source)"));
  console.log("Target Spreadsheet ID: " + (args.target || "(default-test-target)"));
  console.log("Dry Run Mode: " + args.dryRun);

  const targetStorage = customStorageAdapter || new InMemorySheetStorageAdapter();
  const sourceStorage = customSourceStorageAdapter || (customStorageAdapter ? customStorageAdapter : new InMemorySheetStorageAdapter());
  const lockAdapter = new FakeSpreadsheetLockAdapter();
  const engine = new LogMigrationEngine(targetStorage, lockAdapter);

  const fieldSpecs = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string" as const, isCalculated: true }
  ];

  const spreadsheetId = args.target || args.source || "test-spreadsheet-id";

  if (args.dryRun) {
    const report = engine.executeAudit(spreadsheetId, args.tabName, fieldSpecs, {
      sourceStorageAdapter: sourceStorage
    });
    console.log("[MIGRATION AUDIT RESULT] canProceed: " + report.canProceed + ", sourceRows: " + report.sourceDataRowCount);
    return report;
  }

  const result = engine.executeLiveMigration(spreadsheetId, args.tabName, fieldSpecs, {
    targetTabName: args.tabName,
    sourceStorageAdapter: sourceStorage,
    sourceSpreadsheetId: args.source || spreadsheetId
  });
  console.log("[MIGRATION LIVE RESULT] status: " + result.status + ", sourceRows: " + result.sourceDataRowCount + ", appendedRows: " + result.targetAppendedRowCount);
  return result;
}

if (require.main === module) {
  runMigrateLogCli();
}
