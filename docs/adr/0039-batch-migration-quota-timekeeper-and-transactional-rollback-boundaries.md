# 0039-batch-migration-quota-timekeeper-and-transactional-rollback-boundaries.md

Establish Atomic Per-Workbook Transaction Boundaries with Rollback-on-Timeout (`GasTimeoutBudget`), Two-Phase Batch Lifecycle for Cross-Log Hyperlink Repair (`repairCrossLogReferences`), and Explicit 2-Phase Manifest State Machine & Stale Snapshot Crash Recovery Protocol.

## Context & Decision

To prevent broken or partially-written workbook states during Google Apps Script 6-minute quota timeouts and to guarantee deterministic target coordinate resolution for cross-log document reference repairs across multi-workbook batch migrations:

1. **Atomic Per-Workbook Transaction Boundaries & Rollback-on-Timeout**:
   - The 270-second `GasTimeoutBudget` soft cutoff (ADR 0020 & Issue 139) is evaluated between workbooks before starting a new workbook's `TargetTabSnapshot` transaction (ADR 0025).
   - Transaction locks MUST be scoped by Spreadsheet ID (`LOCK_MIGRATION_<SpreadsheetId>`) to eliminate script-wide lock collisions across concurrent migration runners (tracked in child issue #162).
   - **Tab Name Length Pre-Flight Guard**: Prior to starting snapshot creation, the engine validates that `<TabName>_Snapshot_<Timestamp>` will not exceed Google Sheets' 100-character tab name limit. If a tab name is too long, migration halts with a clear pre-flight error before any sheet modification: `"⚠️ Tab name '${tabName}' exceeds maximum length for snapshot cloning. Please shorten tab name before migrating."`
   - If an active workbook migration exceeds the 270s limit mid-write, the transaction is **never** left in a half-written intermediate state across executions. The `catch` block executes an immediate `TargetTabSnapshot` rollback (`restoreFromSnapshot()`), deletes `_Backup_*`, releases the `LOCK_MIGRATION_<SpreadsheetId>` lock, marks manifest entry status as `PAUSED_TIMEOUT`, and schedules the 5-second `ScriptApp.newTrigger` continuation.
   - On resumption, the engine starts the workbook fresh with a clean pre-migration snapshot.

2. **Two-Phase Batch Lifecycle for Cross-Log Hyperlink Repair**:
   - Multi-workbook batch migrations enforce a 2-Phase execution sequence:
     - **Phase 1 (Individual Workbook Migration)**: Each target workbook undergoes Pass 1 pre-flight scan (`detectCrossLogReferences`), `TargetTabSnapshot` creation, data row migration, formula null coercion, and post-flight validation. Upon success, its `_Backup_*` snapshot is deleted, its lock released, and manifest status updated to `MIGRATION_COMPLETE`.
     - **Phase 2 (Global Batch Hyperlink Repair)**: Pass 2 cross-log hyperlink repair (`repairCrossLogReferences`) executes **only after all workbooks in the batch reach `MIGRATION_COMPLETE`**. This guarantees 100% deterministic target resolution because all target spreadsheet IDs, tab GIDs, and row positions are finalized.
   - **Phase 2 Rollback State Isolation**: Hyperlink repair on each workbook during Phase 2 is wrapped in its own isolated `Phase2_Hyperlink_Snapshot`. If a soft cutoff or failure occurs during Phase 2, **Phase 1 schema and row data changes are preserved (NOT rolled back)**; only Phase 2 hyperlink updates are rolled back to the start of Phase 2, allowing Phase 2 to resume cleanly on the next execution run.

3. **Explicit 2-Phase Manifest State Machine & Crash Recovery Protocol**:
   - `migration_batch_manifest.json` tracks batch status (`PHASE_1_ROW_MIGRATION`, `PHASE_2_HYPERLINK_REPAIR`, `PAUSED_TIMEOUT`, `COMPLETED`, `FAILED`) and per-workbook entry status (`PENDING`, `IN_PROGRESS`, `PAUSED_TIMEOUT`, `MIGRATION_COMPLETE`, `REPAIR_IN_PROGRESS`, `COMPLETED`, `FAILED`).
   - **Hard Crash Recovery**: If a GAS hard kill occurs mid-write, `snapshotTabName` remains in the manifest. On resumption, `LogMigrationEngine` detects stale `snapshotTabName` tabs, executes `restoreFromSnapshot()`, cleans up the orphan backup tab, resets status to `PENDING` (Phase 1) or `MIGRATION_COMPLETE` (Phase 2), and retries cleanly.

## Consequences

- Workbooks are guaranteed zero partial-write corruption on execution timeouts or environment crashes.
- Lock collisions across concurrent executions are prevented via `SpreadsheetId`-scoped locks (`LOCK_MIGRATION_<SpreadsheetId>`).
- Long tab names are caught safely during pre-flight validation before snapshot creation.
- Phase 2 timeouts roll back hyperlink updates only, preserving committed Phase 1 data.
- Cross-log document reference hyperlinks (`KEY_LOOKUP_HYPERLINK`, GID re-binding) resolve with 100% precision across multi-workbook batches.
- Batch resumption and stale snapshot cleanup are fully automated and idempotent across time-driven trigger continuation runs.
