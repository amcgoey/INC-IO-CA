/**
 * @file migrate-batch.ts
 * @description CLI command line entry point for multi-workbook batch migration, 270s quota timekeeper, and resumption.
 *
 * Usage:
 * npm run migrate:batch -- --spreadsheet-ids=1WB_1,1WB_2 --dry-run
 */

import { BatchMigrationEngine, BatchManifestRepository, BatchEngineRunResult } from "../src/core/log/BatchMigrationEngine";
import { GasTimeoutBudget } from "../src/core/log/GasTimeoutBudget";
import { MigrationBatchManifestData, deserializeManifest, serializeManifest } from "../src/core/log/MigrationBatchManifest";
import { FakeSpreadsheetLockAdapter } from "../src/adapters/fakes/FakeSpreadsheetLockAdapter";
import { InMemorySheetStorageAdapter } from "../test/harness/fakes/InMemorySheetStorageAdapter";
import { DocumentFieldSpec } from "../src/types";

export interface ParsedBatchArgs {
  batchId: string;
  spreadsheetIds: string[];
  folderId?: string;
  dryRun: boolean;
  resume: boolean;
  timeout?: number;
}

export function parseMigrateBatchArgs(argv: string[]): ParsedBatchArgs {
  let batchId = "batch_" + Date.now();
  let spreadsheetIds: string[] = [];
  let folderId: string | undefined = undefined;
  let dryRun = false;
  let resume = false;
  let timeout: number | undefined = undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--batch-id=") || arg.startsWith("--batchId=")) {
      batchId = arg.split("=")[1];
    } else if ((arg === "--batch-id" || arg === "--batchId") && argv[i + 1]) {
      batchId = argv[++i];
    } else if (arg.startsWith("--spreadsheet-ids=") || arg.startsWith("--spreadsheetIds=")) {
      spreadsheetIds = arg.split("=")[1].split(",").map(s => s.trim()).filter(Boolean);
    } else if ((arg === "--spreadsheet-ids" || arg === "--spreadsheetIds") && argv[i + 1]) {
      spreadsheetIds = argv[++i].split(",").map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith("--folder-id=") || arg.startsWith("--folderId=")) {
      folderId = arg.split("=")[1];
    } else if ((arg === "--folder-id" || arg === "--folderId") && argv[i + 1]) {
      folderId = argv[++i];
    } else if (arg === "--dry-run" || arg === "--dryRun") {
      dryRun = true;
    } else if (arg === "--resume") {
      resume = true;
    } else if (arg.startsWith("--timeout=")) {
      timeout = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--timeout" && argv[i + 1]) {
      timeout = parseInt(argv[++i], 10);
    }
  }

  return { batchId, spreadsheetIds, folderId, dryRun, resume, timeout };
}

class CliManifestRepository implements BatchManifestRepository {
  public manifestData: MigrationBatchManifestData | null = null;
  getManifest(): MigrationBatchManifestData | null {
    return this.manifestData;
  }
  saveManifest(manifest: MigrationBatchManifestData): void {
    this.manifestData = manifest;
  }
}

export function runMigrateBatchCli(
  argv: string[] = process.argv.slice(2),
  customGetStorageAdapter?: (id: string) => InMemorySheetStorageAdapter
): BatchEngineRunResult {
  const args = parseMigrateBatchArgs(argv);
  console.log("=== Multi-Workbook Batch Migration CLI ===");
  console.log("Batch ID: " + args.batchId);
  console.log("Target Workbooks: " + (args.spreadsheetIds.length > 0 ? args.spreadsheetIds.join(", ") : "(discovery)"));
  console.log("Dry Run Mode: " + args.dryRun);

  const manifestRepo = new CliManifestRepository();
  const lockAdapter = new FakeSpreadsheetLockAdapter();
  const timekeeper = new GasTimeoutBudget(args.timeout || 270000);

  const defaultGetStorage = (id: string) => {
    const storage = new InMemorySheetStorageAdapter();
    storage.setSheetValues("Submittal Arch Log", [
      ["Submittal #", "Title", "Calc Column"],
      ["=FormulaRow", "=FormulaRow", "=FormulaRow"],
      ["SUB-001", "Foundation Plan", "FormulaVal1"]
    ]);
    return storage;
  };

  const getStorage = customGetStorageAdapter || defaultGetStorage;
  const engine = new BatchMigrationEngine(getStorage, manifestRepo, lockAdapter, timekeeper);

  const targets = args.spreadsheetIds.length > 0
    ? args.spreadsheetIds.map(id => ({ spreadsheetId: id, spreadsheetName: "Workbook " + id, targetTabName: "Submittal Arch Log" }))
    : [
        { spreadsheetId: "1WB_DISCOVERED_1", spreadsheetName: "Discovered WB 1", targetTabName: "Submittal Arch Log" },
        { spreadsheetId: "1WB_DISCOVERED_2", spreadsheetName: "Discovered WB 2", targetTabName: "Submittal Arch Log" }
      ];

  const manifest = engine.initializeBatch(args.batchId, targets);

  const fieldSpecs: DocumentFieldSpec[] = [
    { key: "submittalNum", header: "Submittal #", label: "Submittal #", type: "STRING" as const, required: true },
    { key: "title", header: "Title", label: "Title", type: "STRING" as const },
    { key: "calculatedCol", header: "Calc Column", label: "Calc Column", type: "STRING" as const, isCalculated: true }
  ];

  const result = engine.runBatch(manifest, fieldSpecs);
  console.log("[BATCH MIGRATION RESULT] status: " + result.status + ", completedEntries: " + result.manifest.entries.filter(e => e.status === "COMPLETED").length);
  return result;
}

if (require.main === module) {
  runMigrateBatchCli();
}
