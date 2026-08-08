# 0027-formula-copy-down-inheritance-and-legacy-inline-coercion.md

Establish Calculated Column Null Coercion for `FormulaRow` spill inheritance, Legacy Inline Formula Coercion to evaluated static values, and pre-flight target spill collision gating in `MigrationAuditReport`.

## Context & Decision

To safely migrate standalone legacy log spreadsheets into unified `DocumentLogWorkbook` log tabs without breaking coordinate offsets, creating volatile formula recalculations, or triggering `#SPILL!` / `#REF!` collision errors against top-level `FormulaRow` formulas:

1. **Calculated Column Null Coercion (`FormulaRow` Spill Inheritance)**:
   - For all target columns defined as calculated (`isCalculated: true` in `DocumentFieldSpec`, e.g. `Calc File Name`, `Calc Number`, `Calc Title`, `Calc Contact Chain`), `LogMigrationEngine` explicitly forces data row cells to empty (`null` or `""`) during migration row construction.
   - This ensures zero inline values or legacy per-row formulas occupy target calculated column data cells, allowing `FormulaRow`'s top-level `MAP`/`LAMBDA` formula (in Row 2) to spill down across all migrated rows seamlessly.

2. **Legacy Inline Formula Coercion (Non-Calculated Columns)**:
   - Custom legacy formulas entered in non-calculated columns (e.g. Notes, Status, Subcontractor) are flagged during Pass 1 dry-run audit (`inlineFormulasDetectedCount`).
   - During Pass 2 live migration, `LogMigrationEngine` coerces these custom inline formulas to their evaluated static snapshot values (`getValues()`).
   - Snapshotting freezes data at migration time, keeping non-calculated log columns clean and eliminating broken coordinate offsets caused by row index shifts ($\Delta row = Row_{target} - Row_{source}$).

3. **`MigrationAuditReport` Metrics & Pre-Flight Spill Gate**:
   - `MigrationAuditReport` incorporates three formula audit properties: `calculatedColumnsCoercedCount`, `inlineFormulasDetectedCount`, and `targetSpillCollisionBlocked`.
   - If the target log tab's calculated columns contain pre-existing text or values that would block `FormulaRow` from spilling down (`targetSpillCollisionBlocked === true`), the dry-run audit sets `canProceed = false` to block live execution until target sheet spill obstacles are cleared.

## Consequences

- Target log tabs maintain 100% architectural integrity with top-level `MAP`/`LAMBDA` formulas in `FormulaRow` (Row 2).
- Migrated legacy data rows inherit dynamic formula calculations without `#SPILL!` collision errors.
- Legacy custom formulas in non-calculated columns are safely converted to static values without broken relative cell references or volatile runtime recalculations.
- Administrators receive transparent audit reporting on all coerced cells and are protected against executing migrations into corrupted or blocked target sheets.
