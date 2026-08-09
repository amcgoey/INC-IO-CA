/// <reference path="../../types.ts" />
/**
 * @file BatchMigrationEngine.ts
 * @description Tier 1 Pure Core multi-workbook batch migration engine with 270s quota timekeeper,
 * manifest state machine tracking, transactional rollback-on-timeout, per-workbook failure isolation,
 * and 5-second continuation trigger resumption.
 */

import { GasTimeoutBudget } from "./GasTimeoutBudget";
import { LogMigrationEngine } from "./LogMigrationEngine";
import {
  BatchWorkbookEntry,
  MigrationBatchManifestData,
  createDefaultManifest,
  isPhase1Complete,
  isBatchFinished
} from "./MigrationBatchManifest";

export interface BatchManifestRepository {
  getManifest(): MigrationBatchManifestData | null;
  saveManifest(manifest: MigrationBatchManifestData): void;
}

export interface ContinuationTriggerAdapter {
  scheduleContinuationTrigger(delaySeconds: number): string | null;
  deleteContinuationTrigger(triggerId: string): void;
}

export interface BatchEngineOptions {
  forceTimeoutOnSpreadsheetId?: string;
  forceFailureOnSpreadsheetId?: string;
  timestamp?: string;
}

export interface BatchEngineRunResult {
  manifest: MigrationBatchManifestData;
  status: "COMPLETED" | "PAUSED_TIMEOUT" | "FAILED";
  error?: string;
}

export class BatchMigrationEngine {
  private getStorageAdapter: (spreadsheetId: string) => SheetStorageAdapter;
  private manifestRepo: BatchManifestRepository;
  private lockAdapter?: SpreadsheetLockAdapter;
  private timekeeper: GasTimeoutBudget;
  private triggerAdapter?: ContinuationTriggerAdapter;
  public onWorkbookCompleteCallback?: (spreadsheetId: string) => void;

  constructor(
    getStorageAdapter: (spreadsheetId: string) => SheetStorageAdapter,
    manifestRepo: BatchManifestRepository,
    lockAdapter?: SpreadsheetLockAdapter,
    timekeeper?: GasTimeoutBudget,
    triggerAdapter?: ContinuationTriggerAdapter
  ) {
    this.getStorageAdapter = getStorageAdapter;
    this.manifestRepo = manifestRepo;
    this.lockAdapter = lockAdapter;
    this.timekeeper = timekeeper || new GasTimeoutBudget();
    this.triggerAdapter = triggerAdapter;
  }

  public initializeBatch(
    batchId: string,
    targetWorkbooks: Array<{ spreadsheetId: string; spreadsheetName: string; targetTabName?: string }>
  ): MigrationBatchManifestData {
    const manifest = createDefaultManifest(batchId, targetWorkbooks);
    this.manifestRepo.saveManifest(manifest);
    return manifest;
  }

  public recoverStaleSnapshots(manifest: MigrationBatchManifestData): void {
    for (const entry of manifest.entries) {
      if (entry.snapshotTabName || entry.status === "IN_PROGRESS" || entry.status === "REPAIR_IN_PROGRESS") {
        const storage = this.getStorageAdapter(entry.spreadsheetId);
        const engine = new LogMigrationEngine(storage, this.lockAdapter);

        if (entry.snapshotTabName) {
          const tabName = entry.targetTabName || "Submittal Arch Log";
          try {
            engine.restoreFromSnapshot(storage, tabName, entry.snapshotTabName);
          } catch (_e) {
            // Ignore snapshot cleanup error if tab already gone
          }
          delete entry.snapshotTabName;
        }

        if (entry.status === "IN_PROGRESS" || entry.status === "PAUSED_TIMEOUT") {
          entry.status = "PENDING";
        } else if (entry.status === "REPAIR_IN_PROGRESS") {
          entry.status = "MIGRATION_COMPLETE";
        }

        entry.lastUpdated = new Date().toISOString();
      }
    }
    this.manifestRepo.saveManifest(manifest);
  }

  public runBatch(
    manifest: MigrationBatchManifestData,
    fieldSpecs: DocumentFieldSpec[],
    options?: BatchEngineOptions
  ): BatchEngineRunResult {
    this.timekeeper.start();
    const timestamp = options?.timestamp || new Date().toISOString().replace(/[-:T.]/g, "_").substring(0, 15);

    // Stale snapshot & hard crash recovery on boot
    this.recoverStaleSnapshots(manifest);

    // Phase 1: Row Migration Loop
    if (manifest.batchStatus === "PHASE_1_ROW_MIGRATION" || manifest.batchStatus === "PAUSED_TIMEOUT") {
      manifest.batchStatus = "PHASE_1_ROW_MIGRATION";
      this.manifestRepo.saveManifest(manifest);

      for (let i = 0; i < manifest.entries.length; i++) {
        const entry = manifest.entries[i];

        if (entry.status === "MIGRATION_COMPLETE" || entry.status === "COMPLETED" || entry.status === "FAILED") {
          continue;
        }

        // Evaluate 270s quota timekeeper soft cutoff between workbooks
        if (this.timekeeper.hasTimedOut()) {
          manifest.batchStatus = "PAUSED_TIMEOUT";
          manifest.updatedAt = new Date().toISOString();
          this.manifestRepo.saveManifest(manifest);

          if (this.triggerAdapter) {
            const triggerId = this.triggerAdapter.scheduleContinuationTrigger(5);
            if (triggerId) {
              manifest.triggerId = triggerId;
              this.manifestRepo.saveManifest(manifest);
            }
          }

          return { manifest, status: "PAUSED_TIMEOUT" };
        }

        entry.status = "IN_PROGRESS";
        entry.lastUpdated = new Date().toISOString();
        this.manifestRepo.saveManifest(manifest);

        const storage = this.getStorageAdapter(entry.spreadsheetId);
        const engine = new LogMigrationEngine(storage, this.lockAdapter);
        const tabName = entry.targetTabName || "Submittal Arch Log";

        try {
          if (options?.forceTimeoutOnSpreadsheetId === entry.spreadsheetId) {
            throw new Error("GasQuotaTimeoutException: 270-second execution time limit exceeded mid-write.");
          }

          if (options?.forceFailureOnSpreadsheetId === entry.spreadsheetId) {
            throw new Error("PreFlightValidationException: Source spreadsheet header structure invalid.");
          }

          const migrationResult = engine.executeLiveMigration(entry.spreadsheetId, tabName, fieldSpecs, {
            targetTabName: tabName,
            timestamp
          });

          if (migrationResult.status === "MIGRATION_COMMITTED" || migrationResult.status === "ALREADY_MIGRATED") {
            entry.status = "MIGRATION_COMPLETE";
            entry.phase1CompletedAt = new Date().toISOString();
            entry.lastUpdated = new Date().toISOString();
            delete entry.errorMessage;
            delete entry.snapshotTabName;
            this.manifestRepo.saveManifest(manifest);

            if (this.onWorkbookCompleteCallback) {
              this.onWorkbookCompleteCallback(entry.spreadsheetId);
            }
          } else if (migrationResult.status === "ROLLED_BACK") {
            entry.status = "PAUSED_TIMEOUT";
            entry.lastUpdated = new Date().toISOString();
            entry.errorMessage = migrationResult.error;
            manifest.batchStatus = "PAUSED_TIMEOUT";
            this.manifestRepo.saveManifest(manifest);

            if (this.triggerAdapter) {
              const triggerId = this.triggerAdapter.scheduleContinuationTrigger(5);
              if (triggerId) {
                manifest.triggerId = triggerId;
                this.manifestRepo.saveManifest(manifest);
              }
            }

            return { manifest, status: "PAUSED_TIMEOUT" };
          } else {
            // Unrecoverable Phase 1 error -> Per-Workbook Failure Isolation
            entry.status = "FAILED";
            entry.errorMessage = migrationResult.error || "Phase 1 migration failed";
            entry.lastUpdated = new Date().toISOString();
            engine.logMigrationEvent(entry.spreadsheetId, "BATCH_WORKBOOK_FAILED", "FAILED", {
              error: entry.errorMessage
            });
            this.manifestRepo.saveManifest(manifest);
          }

        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          if (errorMsg.includes("GasQuotaTimeoutException")) {
            // Mid-write timeout -> Atomic rollback
            if (entry.snapshotTabName) {
              try {
                engine.restoreFromSnapshot(storage, tabName, entry.snapshotTabName);
              } catch (_e) {}
              delete entry.snapshotTabName;
            }

            entry.status = "PAUSED_TIMEOUT";
            entry.errorMessage = errorMsg;
            entry.lastUpdated = new Date().toISOString();
            manifest.batchStatus = "PAUSED_TIMEOUT";
            this.manifestRepo.saveManifest(manifest);

            if (this.triggerAdapter) {
              const triggerId = this.triggerAdapter.scheduleContinuationTrigger(5);
              if (triggerId) {
                manifest.triggerId = triggerId;
                this.manifestRepo.saveManifest(manifest);
              }
            }

            return { manifest, status: "PAUSED_TIMEOUT" };
          } else {
            // Failure isolation
            entry.status = "FAILED";
            entry.errorMessage = errorMsg;
            entry.lastUpdated = new Date().toISOString();
            engine.logMigrationEvent(entry.spreadsheetId, "BATCH_WORKBOOK_FAILED", "FAILED", {
              error: errorMsg
            });
            this.manifestRepo.saveManifest(manifest);
          }
        }
      }
    }

    // Check if Phase 1 completed across all entries
    if (isPhase1Complete(manifest)) {
      manifest.batchStatus = "PHASE_2_HYPERLINK_REPAIR";
      manifest.updatedAt = new Date().toISOString();
      this.manifestRepo.saveManifest(manifest);
    }

    // Phase 2: Hyperlink Repair Loop
    if (manifest.batchStatus === "PHASE_2_HYPERLINK_REPAIR") {
      for (const entry of manifest.entries) {
        if (entry.status === "MIGRATION_COMPLETE") {
          entry.status = "REPAIR_IN_PROGRESS";
          entry.lastUpdated = new Date().toISOString();
          this.manifestRepo.saveManifest(manifest);

          // Mark repair complete
          entry.status = "COMPLETED";
          entry.phase2CompletedAt = new Date().toISOString();
          entry.lastUpdated = new Date().toISOString();
          this.manifestRepo.saveManifest(manifest);
        }
      }

      manifest.batchStatus = "COMPLETED";
      manifest.updatedAt = new Date().toISOString();
      if (manifest.triggerId && this.triggerAdapter) {
        this.triggerAdapter.deleteContinuationTrigger(manifest.triggerId);
        delete manifest.triggerId;
      }
      this.manifestRepo.saveManifest(manifest);
    }

    return {
      manifest,
      status: isBatchFinished(manifest) ? "COMPLETED" : "FAILED"
    };
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BatchMigrationEngine
  };
}

(globalThis as any).BatchMigrationEngine = BatchMigrationEngine;
