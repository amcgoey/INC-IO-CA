# 0025-transactional-pre-migration-snapshot-rollback-and-idempotency.md

Establish same-workbook `TargetTabSnapshot` tab cloning, automatic `catch` rollback and success auto-cleanup, `PropertiesService` transaction locking with SHA-256 payload fingerprinting, 3-stage pre-commit integrity gates, and telemetry logging to `_AuditLog` (ADR 0026).

## Context & Decision

When `LogMigrationEngine` imports legacy standalone spreadsheets into `DocumentLogWorkbook` log tabs, execution failures (network drops, quota limits, formula errors, or mid-stream Google Apps Script timeouts) risk leaving target tabs in a partially-mutated or corrupted state. To guarantee zero data corruption and 100% idempotent execution, we have locked the following architectural standards:

1. **Same-Workbook `TargetTabSnapshot` at Tail Index & Pre-Flight Guards**:
   - **Tab Name Length Guard**: Prior to creating a snapshot, `LogMigrationEngine` validates that `<TabName>_Snapshot_<Timestamp>` will not exceed Google Sheets' 100-character tab name limit. If a tab name is too long, migration halts with a clear pre-flight error before any sheet modification: `"⚠️ Tab name '${tabName}' exceeds maximum length for snapshot cloning. Please shorten tab name before migrating."`
   - Prior to writing any rows (after `MigrationAuditReport.canProceed === true`), `LogMigrationEngine` creates a duplicate of the target tab (`_Backup_<TabName>_<YYYYMMDD_HHMMSS>`) using Sheets API `duplicateSheet`.
   - The backup tab is placed at the **tail end** of the workbook tab index list to keep active log tabs grouped cleanly at the front.

2. **Automatic Rollback, Auto-Cleanup & Startup Orphan Detection**:
   - **On Exception**: In `LogMigrationEngine.execute()`'s `try...catch` block:
     1. Delete the partially-mutated target tab.
     2. Rename `_Backup_<TabName>_<Timestamp>` back to `<TabName>` and restore its original tab index position.
     3. Bubble the original exception with status `ROLLED_BACK`.
   - **On Success**: Once all rows are transformed, verified, and named range bounds updated, `LogMigrationEngine` automatically deletes `_Backup_<TabName>_<Timestamp>`.
   - **On Hard Timeout (Uncaught by `catch`)**: `LogMigrationEngine` tracks batch state in `migration_batch_manifest.json` (ADR 0039). On trigger continuation, it detects orphan `_Backup_*` tabs, executes `restoreFromSnapshot()`, cleans up the orphan backup tab, resets status to `PENDING` (Phase 1) or `MIGRATION_COMPLETE` (Phase 2), and retries cleanly without failing batch runs.

3. **`PropertiesService` Concurrency Lock & SHA-256 Payload Fingerprinting**:
   - **Spreadsheet-Scoped Transaction Lock**: Acquire lock `LOCK_MIGRATION_<SpreadsheetId>` (scoped by Spreadsheet ID, tracked in child issue #162) prior to snapshot creation. Fail fast on concurrent runs with `ConcurrentMigrationException`. Always release in `finally`.
   - **Idempotency Fingerprint**: Compute SHA-256 fingerprint (`sourceFileId` + `rowCount` + `lastModified`) of source data. Upon successful migration, store `lastMigrationHash` in `_Config`. If re-invoked with a matching fingerprint, return `ALREADY_MIGRATED` (no-op) safely.

4. **3-Stage Pre-Commit Validation Pipeline**:
   - **Pre-flight Cell Budget Gate**: Reject migration if `(Workbook Cells + Migrated Row Cells) > 800,000` (soft alert threshold from ADR 0022 / Issue 124).
   - **Batch Write Execution**: Append non-calculated columns in batch via `SheetStorageAdapter`, skipping calculated columns so they inherit top-level `FormulaRow` formulas.
   - **Post-flight Integrity Audit Gate**: Audit row count parity, sheet-scoped `Data` Named Range boundary bounds between top/bottom `BufferRow` markers, and formula calculation syntax errors (`#REF!`, `#NAME?`). Trigger immediate rollback if any check fails.

5. **Telemetry Logging to `_AuditLog` & Versioned Schema Archives**:
   - **System Audit Log Tab (`_AuditLog`)**: Write migration execution events (`Category = 'MIGRATION'`) and `MigrationAuditReport` outcomes into `_AuditLog` following the system-wide audit schema established in [ADR 0026](0026-system-wide-audit-log-tab-architecture-and-event-schema.md).
   - **Versioned Repository Schema Archive (`test/fixtures/templates/vX.Y.Z.json`)**: Maintain frozen JSON schema snapshots of every `schemaVersion` in the repository to enable multi-version drift diagnosis and rollback schema comparisons.

## Consequences

- Target spreadsheet tabs are 100% protected against mid-execution corruption or partial data writes.
- Rollbacks are atomic, instant, and lossless via native Sheets API tab renaming/deletion.
- Re-executing migrations with identical source files is safe and idempotent.
- Migration telemetry is logged cleanly under `Category = 'MIGRATION'` in `_AuditLog` (ADR 0026) without polluting `_Config`.
