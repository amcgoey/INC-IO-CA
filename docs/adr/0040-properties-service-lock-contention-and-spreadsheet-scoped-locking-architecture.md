# 0040-properties-service-lock-contention-and-spreadsheet-scoped-locking-architecture.md

Establish Dual-Layer Atomic Concurrency Lock Protocol Combining Short-Lived `LockService.getScriptLock()` Mutex Guard with `PropertiesService.getScriptProperties()` Spreadsheet-Scoped Keying (`LOCK_MIGRATION_<SpreadsheetId>`), 15-Minute Default TTL with Automated Stale Lock Recovery, and 3-Tier `SpreadsheetLockAdapter` Infrastructure Abstraction.

## Context & Decision

In Google Apps Script, long-running spreadsheet transactions (such as `LogMigrationEngine` imports) require mutual exclusion to prevent data corruption from concurrent execution. However, native `LockService.getScriptLock()` provides only global, script-wide locking without support for key-based scoping. Holding a global script lock for the entire duration of a multi-minute migration serializes all user and system operations across all workbooks, creating severe script-wide lock contention.

To guarantee zero lock contention between concurrent operations on separate workbooks while maintaining strict thread-safe transactional safety on any single workbook, we have locked the following architectural standards:

1. **Dual-Layer Atomic Lock Protocol**:
   - **Spreadsheet-Scoped Keying**: Transactional locks are keyed by Spreadsheet ID under `LOCK_MIGRATION_<SpreadsheetId>` inside `PropertiesService.getScriptProperties()`.
   - **Short-Lived Mutex Guard**: Native `LockService.getScriptLock().tryLock(10000)` (10-second wait timeout) is acquired **only briefly** to guard atomic check-and-set operations on `PropertiesService`.
   - **Immediate Guard Release**: Once `LOCK_MIGRATION_<SpreadsheetId>` is written to `PropertiesService`, `LockService.getScriptLock()` is released immediately. This allows concurrent migrations operating on *different* spreadsheets to proceed simultaneously without holding the global script lock.
   - **Safe Lock Release**: In the `finally` cleanup block, `LockService.getScriptLock()` is briefly re-acquired to verify lock ownership (`executionId`) and delete `LOCK_MIGRATION_<SpreadsheetId>` from `PropertiesService`.

2. **Lock Record Payload & Automated Stale Lock Recovery**:
   - **Lock Record Schema**:
     ```json
     {
       "executionId": "exec_<timestamp>_<uuid>",
       "spreadsheetId": "<SpreadsheetId>",
       "acquiredAt": 1770524500000,
       "expiresAt": 1770525400000
     }
     ```
   - **15-Minute Default TTL**: Lock expiration is set to 15 minutes (900,000 ms), matching the maximum migration execution boundary.
   - **Stale Lock Recovery**: If an execution terminates abruptly (e.g., uncaught GAS system kill) and `Date.now() > expiresAt`, subsequent migration attempts log a diagnostic warning to `_AuditLog`, auto-clear the expired property, and acquire a fresh lock cleanly.

3. **3-Tier Compatibility Architecture (`SpreadsheetLockAdapter`)**:
   - **Tier 1 Pure Core Interface (`SpreadsheetLockAdapter`)**: Defines `acquireLock(spreadsheetId, ttlMs?)`, `releaseLock(spreadsheetId, executionId)`, and `isLocked(spreadsheetId)` without GAS dependencies.
   - **Tier 2 GAS Infrastructure Adapter (`GasSpreadsheetLockAdapter`)**: Implements the dual-layer lock protocol via `PropertiesService` and `LockService`.
   - **Tier 3 / Test Mock (`FakeSpreadsheetLockAdapter`)**: In-memory fake implementation for unit tests outside Google Apps Script environments.
   - **Dependency Injection**: `LogMigrationEngine` receives `SpreadsheetLockAdapter` via constructor injection, enabling 100% offline unit testing.

## Consequences

- Long-running migrations on different spreadsheets execute concurrently without global lock contention.
- Hard script kills do not deadlock future migrations thanks to automated 15-minute stale lock recovery.
- Lock ownership verification prevents accidental release of another process's lock.
- 100% test suite execution outside Google Apps Script via `FakeSpreadsheetLockAdapter`.
