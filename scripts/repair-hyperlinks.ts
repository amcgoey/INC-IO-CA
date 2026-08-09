/**
 * @file repair-hyperlinks.ts
 * @description CLI Entry Point for Phase 2 Cross-Log Reference Scanning and Hyperlink Repair.
 */

import { BatchMigrationEngine } from "../src/core/log/BatchMigrationEngine";
import { GoogleSheetsStorageAdapter } from "../src/SheetStorageAdapter";
import { MigrationBatchManifestData } from "../src/core/log/MigrationBatchManifest";
import * as fs from "fs";
import * as path from "path";

export interface RepairHyperlinksCliArgs {
  batchId?: string;
  spreadsheetIds?: string[];
  manifestPath?: string;
}

export function parseRepairHyperlinksArgs(args: string[]): RepairHyperlinksCliArgs {
  const result: RepairHyperlinksCliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--batch-id" && i + 1 < args.length) {
      result.batchId = args[++i];
    } else if (arg === "--spreadsheet-ids" && i + 1 < args.length) {
      result.spreadsheetIds = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--manifest-path" && i + 1 < args.length) {
      result.manifestPath = args[++i];
    }
  }

  return result;
}

class FileBatchManifestRepository {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  getManifest(): MigrationBatchManifestData | null {
    if (!fs.existsSync(this.filePath)) return null;
    try {
      const data = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(data);
    } catch (_e) {
      return null;
    }
  }

  saveManifest(manifest: MigrationBatchManifestData): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(manifest, null, 2), "utf-8");
  }
}

export function runRepairHyperlinksCli(rawArgs: string[] = process.argv.slice(2)) {
  const args = parseRepairHyperlinksArgs(rawArgs);
  const manifestPath = args.manifestPath || path.join(process.cwd(), ".scratch", "migration_batch_manifest.json");

  const manifestRepo = new FileBatchManifestRepository(manifestPath);
  const getStorageAdapter = (id: string) => new GoogleSheetsStorageAdapter(id);

  const engine = new BatchMigrationEngine(getStorageAdapter, manifestRepo);

  console.log("=== Phase 2 Cross-Log Hyperlink Repair CLI ===");
  if (args.batchId) console.log(`Batch ID: ${args.batchId}`);

  let manifest = manifestRepo.getManifest();
  if (args.batchId && (!manifest || manifest.batchId !== args.batchId)) {
    const targets = (args.spreadsheetIds && args.spreadsheetIds.length > 0)
      ? args.spreadsheetIds.map((id) => ({ spreadsheetId: id, spreadsheetName: "Workbook " + id }))
      : [];
    manifest = engine.initializeBatch(args.batchId, targets);
  }

  const result = engine.runBatch(manifest || args.spreadsheetIds);

  console.log(`[REPAIR HYPERLINKS RESULT] status: ${result.status}, batchStatus: ${result.manifest.batchStatus}`);
  return result;
}

if (require.main === module) {
  runRepairHyperlinksCli();
}
