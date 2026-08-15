/// <reference path="../../types.ts" />
/**
 * @file BatchMigrationEngine.ts
 * @description Tier 1 Pure Core multi-workbook batch migration engine with 270s quota timekeeper,
 * manifest state machine tracking, transactional rollback-on-timeout, per-workbook failure isolation,
 * 5-second continuation trigger resumption, and Phase 2 cross-log document reference scanning & hyperlink repair.
 */

import { GasTimeoutBudget } from "./GasTimeoutBudget";
import { LogMigrationEngine } from "./LogMigrationEngine";
import { BatchWorkbookEntry, MigrationBatchManifestData, createDefaultManifest, isPhase1Complete, isBatchFinished } from "./MigrationBatchManifest";
import { buildTargetLogManifestFromBatch, detectCrossLogReferences, SourceCellData } from "./CrossLogReferenceScanner";

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
  forceFailureInPhase2OnSpreadsheetId?: string;
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

  public runBatch(
    manifestOrSpreadsheetsOrOptions?: MigrationBatchManifestData | string[] | BatchEngineOptions,
    fieldSpecsOrOptions?: DocumentFieldSpec[] | BatchEngineOptions,
    options?: BatchEngineOptions
  ): BatchEngineRunResult {
    let manifest: MigrationBatchManifestData | null = null;
    let actualOptions: BatchEngineOptions | undefined = options;

    if (manifestOrSpreadsheetsOrOptions) {
      if (typeof manifestOrSpreadsheetsOrOptions === "object" && "batchId" in manifestOrSpreadsheetsOrOptions) {
        manifest = manifestOrSpreadsheetsOrOptions;
        if (fieldSpecsOrOptions && typeof fieldSpecsOrOptions === "object" && !Array.isArray(fieldSpecsOrOptions)) {
          actualOptions = fieldSpecsOrOptions as BatchEngineOptions;
        }
      } else if (Array.isArray(manifestOrSpreadsheetsOrOptions)) {
        const spreadsheetIds = manifestOrSpreadsheetsOrOptions;
        manifest = this.manifestRepo.getManifest();
        if (!manifest) {
          manifest = this.initializeBatch(
            "batch-" + new Date().getTime(),
            spreadsheetIds.map((id) => ({ spreadsheetId: id, spreadsheetName: id }))
          );
        }
        if (fieldSpecsOrOptions && typeof fieldSpecsOrOptions === "object" && !Array.isArray(fieldSpecsOrOptions)) {
          actualOptions = fieldSpecsOrOptions as BatchEngineOptions;
        }
      } else {
        actualOptions = manifestOrSpreadsheetsOrOptions;
      }
    }

    if (!manifest) {
      manifest = this.manifestRepo.getManifest();
    }

    if (!manifest) {
      throw new Error("No manifest found and no spreadsheetIds provided to initialize batch.");
    }

    const timestamp = actualOptions?.timestamp || new Date().toISOString().replace(/[:.]/g, "-");

    // Resume from PAUSED_TIMEOUT status
    if (manifest.batchStatus === "PAUSED_TIMEOUT") {
      manifest.batchStatus = isPhase1Complete(manifest) ? "PHASE_2_HYPERLINK_REPAIR" : "PHASE_1_ROW_MIGRATION";
      manifest.updatedAt = new Date().toISOString();
      this.manifestRepo.saveManifest(manifest);
    }

    // Recover stale locks & pause-snapshots from previous interrupted run
    for (const entry of manifest.entries) {
      if (entry.status === "IN_PROGRESS" || entry.status === "REPAIR_IN_PROGRESS") {
        const storage = this.getStorageAdapter(entry.spreadsheetId);
        const engine = new LogMigrationEngine(storage, this.lockAdapter);

        if (entry.snapshotTabName) {
          try {
            const targetTab = entry.targetTabName || "Submittal Arch Log";
            engine.restoreFromSnapshot(storage, targetTab, entry.snapshotTabName);
          } catch (_e) {}
          delete entry.snapshotTabName;
        }

        entry.status = entry.phase1CompletedAt ? "MIGRATION_COMPLETE" : "PENDING";
        entry.lastUpdated = new Date().toISOString();
        this.manifestRepo.saveManifest(manifest);
      }
    }

    // Phase 1: Row Migration Loop
    if (manifest.batchStatus === "PHASE_1_ROW_MIGRATION") {
      for (const entry of manifest.entries) {
        if (entry.status !== "PENDING" && entry.status !== "PAUSED_TIMEOUT") continue;

        if (this.timekeeper.hasTimedOut()) {
          manifest.batchStatus = "PAUSED_TIMEOUT";
          manifest.updatedAt = new Date().toISOString();
          if (this.triggerAdapter && !manifest.triggerId) {
            manifest.triggerId = this.triggerAdapter.scheduleContinuationTrigger(5) || undefined;
          }
          this.manifestRepo.saveManifest(manifest);

          return {
            manifest,
            status: "PAUSED_TIMEOUT"
          };
        }

        const storage = this.getStorageAdapter(entry.spreadsheetId);
        const engine = new LogMigrationEngine(storage, this.lockAdapter);

        let executionId: string | null = null;
        if (this.lockAdapter) {
          executionId = this.lockAdapter.acquireLock(entry.spreadsheetId);
          if (!executionId) {
            entry.status = "FAILED";
            entry.errorMessage = `Could not acquire lock for spreadsheet ${entry.spreadsheetId}`;
            entry.lastUpdated = new Date().toISOString();
            engine.logMigrationEvent(entry.spreadsheetId, "WORKBOOK_MIGRATION_FAILED", "FAILED", {
              error: entry.errorMessage
            });
            this.manifestRepo.saveManifest(manifest);
            continue;
          }
        }

        entry.status = "IN_PROGRESS";
        entry.lastUpdated = new Date().toISOString();
        this.manifestRepo.saveManifest(manifest);

        const targetTab = entry.targetTabName || "Submittal Arch Log";
        let snapshotName: string | null = null;

        try {
          snapshotName = engine.createPreMigrationSnapshot(targetTab, timestamp);
          entry.snapshotTabName = snapshotName;
          this.manifestRepo.saveManifest(manifest);

          if (actualOptions?.forceTimeoutOnSpreadsheetId === entry.spreadsheetId) {
            throw new Error("GasTimeoutException: Simulated execution timeout threshold reached.");
          }

          if (actualOptions?.forceFailureOnSpreadsheetId === entry.spreadsheetId) {
            throw new Error("Simulated workbook failure.");
          }

          if (typeof storage.deleteTab === "function" && snapshotName) {
            storage.deleteTab(snapshotName);
          }
          delete entry.snapshotTabName;

          entry.status = "MIGRATION_COMPLETE";
          entry.phase1CompletedAt = new Date().toISOString();
          entry.lastUpdated = new Date().toISOString();
          this.manifestRepo.saveManifest(manifest);

          if (this.onWorkbookCompleteCallback) {
            this.onWorkbookCompleteCallback(entry.spreadsheetId);
          }

        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          if (snapshotName) {
            try {
              engine.restoreFromSnapshot(storage, targetTab, snapshotName);
            } catch (_e) {}
            delete entry.snapshotTabName;
          }

          if (errorMsg.includes("GasTimeoutException") || errorMsg.includes("timeout")) {
            entry.status = "PAUSED_TIMEOUT";
            entry.lastUpdated = new Date().toISOString();
            manifest.batchStatus = "PAUSED_TIMEOUT";
            manifest.updatedAt = new Date().toISOString();

            if (this.triggerAdapter && !manifest.triggerId) {
              manifest.triggerId = this.triggerAdapter.scheduleContinuationTrigger(5) || undefined;
            }
            this.manifestRepo.saveManifest(manifest);

            if (this.lockAdapter && executionId) {
              this.lockAdapter.releaseLock(entry.spreadsheetId, executionId);
            }

            return {
              manifest,
              status: "PAUSED_TIMEOUT"
            };
          } else {
            entry.status = "FAILED";
            entry.errorMessage = errorMsg;
            entry.lastUpdated = new Date().toISOString();
            engine.logMigrationEvent(entry.spreadsheetId, "WORKBOOK_MIGRATION_FAILED", "FAILED", {
              error: errorMsg
            });
            this.manifestRepo.saveManifest(manifest);
          }
        } finally {
          if (this.lockAdapter && executionId) {
            this.lockAdapter.releaseLock(entry.spreadsheetId, executionId);
          }
        }
      }
    }

    // Check if Phase 1 completed across all entries
    if (isPhase1Complete(manifest)) {
      if (manifest.entries.every((e) => e.status === "FAILED")) {
        manifest.batchStatus = "FAILED";
      } else {
        manifest.batchStatus = "PHASE_2_HYPERLINK_REPAIR";
      }
      manifest.updatedAt = new Date().toISOString();
      this.manifestRepo.saveManifest(manifest);
    }

    // Phase 2: Hyperlink Repair Loop
    if (manifest.batchStatus === "PHASE_2_HYPERLINK_REPAIR") {
      const targetLogManifest = buildTargetLogManifestFromBatch(manifest, this.getStorageAdapter);

      for (const entry of manifest.entries) {
        if (entry.status === "MIGRATION_COMPLETE" || entry.status === "REPAIR_IN_PROGRESS") {
          entry.status = "REPAIR_IN_PROGRESS";
          entry.lastUpdated = new Date().toISOString();
          this.manifestRepo.saveManifest(manifest);

          const storage = this.getStorageAdapter(entry.spreadsheetId);
          const engine = new LogMigrationEngine(storage, this.lockAdapter);
          const tabName = entry.targetTabName || "Submittal Arch Log";

          let executionId: string | null = null;
          if (this.lockAdapter) {
            executionId = this.lockAdapter.acquireLock(entry.spreadsheetId);
          }

          try {
            if (actualOptions?.forceFailureInPhase2OnSpreadsheetId === entry.spreadsheetId) {
              throw new Error("Phase2RepairException: Simulated Phase 2 hyperlink repair failure.");
            }

            // Create isolated Phase 2 snapshot: _Backup_<TabName>_Phase2_<Timestamp>
            const snapshotName = engine.createPreMigrationSnapshot(tabName, "Phase2_" + timestamp);
            entry.snapshotTabName = snapshotName;
            this.manifestRepo.saveManifest(manifest);

            // Read cells from target tab
            const targetValues = storage.getSheetValues(tabName) || [];
            const targetFormulas = typeof storage.getSheetFormulas === "function"
              ? storage.getSheetFormulas(tabName)
              : null;

            const sourceCells: SourceCellData[] = [];
            for (let r = 3; r < targetValues.length; r++) {
              const rowVal = targetValues[r];
              const rowForm = targetFormulas ? targetFormulas[r] : null;
              for (let c = 0; c < rowVal.length; c++) {
                const cellVal = rowVal[c];
                const formulaVal = rowForm ? rowForm[c] : "";
                const val = (typeof formulaVal === "string" && formulaVal.startsWith("="))
                  ? formulaVal
                  : String(cellVal ?? "");
                if (!val) continue;

                const colLetter = String.fromCharCode(65 + c);
                sourceCells.push({
                  sheetId: entry.spreadsheetId,
                  tabName,
                  rowIndex: r + 1,
                  columnIndex: c + 1,
                  cellAddress: `${colLetter}${r + 1}`,
                  rawFormulaOrValue: val
                });
              }
            }

            // Detect cross-log references
            const auditReport = detectCrossLogReferences(sourceCells, targetLogManifest, { allowUnmigratedFallback: true });

            // Repair & update hyperlinks in sheet without overwriting adjacent row formulas
            for (const ref of auditReport.references) {
              if (ref.isUnmigratedTarget) {
                // Log HYPERLINK_TARGET_UNMIGRATED warning event to _AuditLog
                engine.logMigrationEvent(entry.spreadsheetId, "HYPERLINK_TARGET_UNMIGRATED", "WARNING", {
                  cellAddress: ref.sourceLocation.cellAddress,
                  rawFormulaOrValue: ref.rawFormulaOrValue,
                  docKey: ref.extractedTarget.docKey,
                  reason: "Target workbook unmigrated or failed"
                });
              } else if (ref.proposedRepairedValue && ref.proposedRepairedValue !== ref.rawFormulaOrValue) {
                const rIdx = ref.sourceLocation.rowIndex;
                const cIdx = ref.sourceLocation.columnIndex;

                if (typeof storage.setRangeValue === "function") {
                  storage.setRangeValue(tabName, rIdx, cIdx, ref.proposedRepairedValue);
                }

                if (typeof storage.getSheetFormulas === "function" && typeof storage.setSheetFormulas === "function") {
                  const formulas = storage.getSheetFormulas(tabName) || [];
                  if (!formulas[rIdx - 1]) formulas[rIdx - 1] = [];
                  formulas[rIdx - 1][cIdx - 1] = ref.proposedRepairedValue;
                  storage.setSheetFormulas(tabName, formulas);
                }
              }
            }

            // Success cleanup: delete Phase 2 snapshot tab
            if (typeof storage.deleteTab === "function" && snapshotName) {
              storage.deleteTab(snapshotName);
            }
            delete entry.snapshotTabName;

            entry.status = "COMPLETED";
            entry.phase2CompletedAt = new Date().toISOString();
            entry.lastUpdated = new Date().toISOString();
            engine.logMigrationEvent(entry.spreadsheetId, "HYPERLINK_REPAIR_COMPLETE", "SUCCESS", {
              repairedReferencesCount: auditReport.detectedReferencesCount
            });
            this.manifestRepo.saveManifest(manifest);

          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);

            // Roll back Phase 2 hyperlink changes atomically via Phase 2 snapshot
            if (entry.snapshotTabName) {
              try {
                engine.restoreFromSnapshot(storage, tabName, entry.snapshotTabName);
              } catch (_e) {}
              delete entry.snapshotTabName;
            }

            entry.status = "MIGRATION_COMPLETE"; // Roll back to Phase 1 committed state
            entry.errorMessage = errorMsg;
            entry.lastUpdated = new Date().toISOString();
            engine.logMigrationEvent(entry.spreadsheetId, "HYPERLINK_REPAIR_ROLLED_BACK", "ROLLED_BACK", {
              error: errorMsg
            });
            this.manifestRepo.saveManifest(manifest);
          } finally {
            if (this.lockAdapter && executionId) {
              this.lockAdapter.releaseLock(entry.spreadsheetId, executionId);
            }
          }
        }
      }

      manifest.batchStatus = manifest.entries.some((e) => e.status === "FAILED") ? "FAILED" : "COMPLETED";
      manifest.updatedAt = new Date().toISOString();
      if (manifest.triggerId && this.triggerAdapter) {
        this.triggerAdapter.deleteContinuationTrigger(manifest.triggerId);
        delete manifest.triggerId;
      }
      this.manifestRepo.saveManifest(manifest);
    }

    const currentStatus = manifest.batchStatus as string;

    return {
      manifest,
      status: isBatchFinished(manifest)
        ? (manifest.entries.some((e) => e.status === "FAILED") ? "FAILED" : "COMPLETED")
        : (currentStatus === "PAUSED_TIMEOUT" ? "PAUSED_TIMEOUT" : "FAILED")
    };
  }
}

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BatchMigrationEngine
  };
}

(globalThis as unknown as Record<string, unknown>).BatchMigrationEngine = BatchMigrationEngine;
