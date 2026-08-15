/**
 * @file MigrationBatchManifest.ts
 * @description Tier 1 Pure Core domain types, state machine enums, and helper utilities for migration_batch_manifest.json.
 */

export type BatchStatus =
  | "PHASE_1_ROW_MIGRATION"
  | "PHASE_2_HYPERLINK_REPAIR"
  | "PAUSED_TIMEOUT"
  | "COMPLETED"
  | "FAILED";

export type WorkbookEntryStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "PAUSED_TIMEOUT"
  | "MIGRATION_COMPLETE"
  | "REPAIR_IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

export interface BatchWorkbookEntry {
  spreadsheetId: string;
  spreadsheetName: string;
  status: WorkbookEntryStatus;
  snapshotTabName?: string;
  targetTabName?: string;
  lastUpdated: string;
  errorMessage?: string;
  phase1CompletedAt?: string;
  phase2CompletedAt?: string;
}

export interface MigrationBatchManifestData {
  batchId: string;
  batchStatus: BatchStatus;
  createdAt: string;
  updatedAt: string;
  triggerId?: string;
  entries: BatchWorkbookEntry[];
}

export function createDefaultManifest(
  batchId: string,
  targetWorkbooks: Array<{ spreadsheetId: string; spreadsheetName: string; targetTabName?: string }>
): MigrationBatchManifestData {
  const now = new Date().toISOString();
  return {
    batchId,
    batchStatus: "PHASE_1_ROW_MIGRATION",
    createdAt: now,
    updatedAt: now,
    entries: targetWorkbooks.map(wb => {
      const entry: BatchWorkbookEntry = {
        spreadsheetId: wb.spreadsheetId,
        spreadsheetName: wb.spreadsheetName,
        status: "PENDING",
        lastUpdated: now
      };
      if (wb.targetTabName) {
        entry.targetTabName = wb.targetTabName;
      }
      return entry;
    })
  };
}

export function serializeManifest(manifest: MigrationBatchManifestData): string {
  return JSON.stringify(manifest, null, 2);
}

export function deserializeManifest(json: string): MigrationBatchManifestData {
  return JSON.parse(json) as MigrationBatchManifestData;
}

export function getPendingOrPausedPhase1Entries(manifest: MigrationBatchManifestData): BatchWorkbookEntry[] {
  return manifest.entries.filter(e => e.status === "PENDING" || e.status === "PAUSED_TIMEOUT" || e.status === "IN_PROGRESS");
}

export function getCompletedPhase1Entries(manifest: MigrationBatchManifestData): BatchWorkbookEntry[] {
  return manifest.entries.filter(e => e.status === "MIGRATION_COMPLETE" || e.status === "REPAIR_IN_PROGRESS" || e.status === "COMPLETED");
}

export function isPhase1Complete(manifest: MigrationBatchManifestData): boolean {
  return manifest.entries.every(e => e.status === "MIGRATION_COMPLETE" || e.status === "FAILED" || e.status === "COMPLETED");
}

export function isBatchFinished(manifest: MigrationBatchManifestData): boolean {
  return (manifest.batchStatus === "COMPLETED" || manifest.batchStatus === "FAILED") &&
    manifest.entries.every(e => e.status === "COMPLETED" || e.status === "FAILED");
}

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createDefaultManifest,
    serializeManifest,
    deserializeManifest,
    getPendingOrPausedPhase1Entries,
    getCompletedPhase1Entries,
    isPhase1Complete,
    isBatchFinished
  };
}

(globalThis as any).MigrationBatchManifest = {
  createDefaultManifest,
  serializeManifest,
  deserializeManifest,
  getPendingOrPausedPhase1Entries,
  getCompletedPhase1Entries,
  isPhase1Complete,
  isBatchFinished
};
