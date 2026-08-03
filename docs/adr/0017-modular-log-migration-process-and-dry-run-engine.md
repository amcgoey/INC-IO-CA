# 0017-modular-log-migration-process-and-dry-run-engine.md

Establish the dual-interface architecture (`LogMigrationEngine.ts`), 2-pass dry-run audit workflow (`MigrationAuditReport`), discipline-specific column remapping strategies (`LogMigrationStrategy`), and legacy sheet archiving protocol.

## Context & Decision

To safely transform legacy standalone Architecture and FF&E log spreadsheets into unified `DocumentLogWorkbook` log tabs without data loss, broken formula calculations, or accidental user entry into deprecated sheets:

1. **Dual-Interface Migration Engine Architecture**:
   - Core application engine (`src/LogMigrationEngine.ts`) exposed via CLI tool (`scripts/migrate-log.ts`, `npm run migrate:log -- --source=<id> --target=<id> [--dry-run]`) for batch/automated execution and Google Apps Script admin function (`migrateLogSpreadsheet(sourceId, targetId, options)`) for spreadsheet end-users.

2. **2-Pass Migration & `MigrationAuditReport` Workflow**:
   - **Pass 1: Dry-Run Audit (`dryRun: true`)**: Scans source legacy log headers and data rows, maps headers against target `<TabName>_Headers` Named Range, validates cell types/dates/statuses, and produces a structured `MigrationAuditReport` with a boolean `canProceed` execution gate.
   - **Pass 2: Live Execution (`dryRun: false`)**: Appends data rows to the target tab starting at `First Active Data Row` (`Row H + 3`) only after `canProceed` is verified.

3. **Discipline-Specific `LogMigrationStrategy` & Formula Handling**:
   - Modular strategies (`ArchLogMigrationStrategy`, `FfeLogMigrationStrategy`) handle legacy column remapping (e.g. `Section` -> `Section`, `Spec Tag` -> `Spec Tag`, `Subcontractor` -> `Vendor`), date/status normalization, and **explicitly skip calculated formula columns** (`Calc File Name`, `Calc Number`, `Calc Title`, `Calc Contact Chain`) so appended rows inherit `FormulaRow` formulas directly from the target template.

4. **Legacy Sheet Archiving & Parity Verification**:
   - Source legacy spreadsheets are preserved 100% (never deleted).
   - Upon successful migration, source title is prefixed with `[MIGRATED_LEGACY] <Original Title>` and a read-only `_MIGRATION_INFO` summary tab is prepended.
   - Post-migration audit verifies exact row count parity (`sourceDataRowCount === targetAppendedRowCount`).

## Consequences

- Legacy standalone logs can be audited and safely migrated into unified `DocumentLogWorkbook` sheets with 0 risk of silent data truncation or missing column errors.
- Formula calculations in target sheets are automatically inherited without copying hardcoded formula text or static values from legacy sheets.
- Team members are clearly notified of deprecated legacy sheets via visual title marking and audit tabs while retaining complete historical access.
