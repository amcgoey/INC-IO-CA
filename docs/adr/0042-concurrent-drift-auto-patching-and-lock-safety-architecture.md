# 0042-concurrent-drift-auto-patching-and-lock-safety-architecture.md

Establish Dual-Layer Concurrency Locking Protocol for `TemplateDriftAuditor.autoPatchWorkbook` (`LOCK_MIGRATION_<SpreadsheetId>`), 5-Second Bounded Acquisition Timeout, Strict `canAutoPatch` Eligibility Boundaries (`MINOR_DRIFT` vs `MAJOR_DRIFT`), and Double-Checked Audit Execution Lifecycle.

## Context & Decision

During runtime operations in Google Sheets, administrators can execute `TemplateDriftAuditor` schema drift checks and auto-patching repairs via `SheetAdminFoldOut`. However, concurrent auto-patching executions or concurrent execution alongside `LogMigrationEngine` operations on the same workbook pose race condition risks (e.g. partial sheet writes, corrupted range declarations, or state collisions).

To guarantee zero race conditions and zero lock contention during live audit and auto-patching operations while preserving data integrity:

1. **Lock Mechanism & Mutual Exclusion Boundary**:
   - **Lock-Free Read Audits**: `TemplateDriftAuditor.auditWorkbook()` (dry-run mode) runs **lock-free** with `bypassCache: true` directly against spreadsheet ground truth, ensuring low-latency add-on UI rendering.
   - **Spreadsheet-Scoped Lock for Auto-Patching**: `TemplateDriftAuditor.autoPatchWorkbook()` MUST acquire `SpreadsheetLockAdapter.acquireLock(spreadsheetId)` (`LOCK_MIGRATION_<SpreadsheetId>`) prior to making any spreadsheet mutations. This guarantees mutual exclusion against concurrent auto-patching and `LogMigrationEngine` runs on the same workbook.

2. **Bounded Lock Contention Timeout & Fast-Fail Protocol**:
   - `autoPatchWorkbook` attempts lock acquisition with a bounded **5,000 ms** (5-second) timeout.
   - If the lock cannot be acquired within 5 seconds (lock contention), `autoPatchWorkbook` fails fast without mutating sheets, returning `AutoPatchResult` with `status: "LOCK_CONTENTION"`, `success: false`, logging to `Logger.log()`, and displaying a retry prompt in `SheetAdminFoldOut`.

3. **Drift Severity Boundaries (`canAutoPatch`)**:
   - **Eligible (`canAutoPatch: true`) — `MINOR_DRIFT` Only**: Restricted strictly to non-destructive structural repairs: re-declaring missing Sheet-Scoped Named Ranges (`Headers`, `FormulaRow`, `Data`), appending missing default `_Config`/`_Shared` fallback key rows, initializing missing `_AuditLog` tabs, and non-destructive header label updates.
   - **Ineligible (`canAutoPatch: false`) — `MAJOR_DRIFT` & `INCOMPATIBLE`**: Destructive or ambiguous drift (missing discipline log tabs, column schema index shifts, deleted `FormulaRow` formulas, schema version mismatch) strictly rejects auto-patching. Attempts return `canAutoPatch: false` with remediation instructions for manual upgrade or transactional migration.

4. **Transactional Execution Lifecycle & Clean Cleanup**:
   - Auto-patching runs within a `try ... finally` block:
     1. Acquire `SpreadsheetLockAdapter` lock (5s timeout).
     2. Perform a **Double-Checked Audit** under lock (`auditWorkbook({ bypassCache: true })`). If drift is already resolved (`MATCH`) or unpatchable (`MAJOR_DRIFT`), abort without mutation.
     3. Apply structural sheet fixes.
     4. Purge cached schema entries via `PrefixCacheManager.invalidatePrefix("DOC_CONFIG_" + spreadsheetId)` (ADR 0041).
     5. Append `SCHEMA_DRIFT` (`DRIFT_REPAIR_EXECUTED`) and `CACHE_PURGE` (`EVICT_PREFIX`) telemetry events to `_AuditLog`.
     6. **`finally`**: Execute `SpreadsheetLockAdapter.releaseLock(spreadsheetId, executionId)` to guarantee lock deletion from `PropertiesService`.

## Consequences

- Race conditions between concurrent auto-patching and migration executions on the same spreadsheet are completely prevented.
- Read-only dry-run audits remain lightweight and non-blocking.
- Destructive auto-patching on major schema drift is strictly prohibited, preventing accidental data loss.
- Post-patch cache invalidation and telemetry logging operate under full lock protection with guaranteed cleanup via `try...finally`.
