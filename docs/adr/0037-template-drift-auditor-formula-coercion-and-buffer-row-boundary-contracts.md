# 0037-template-drift-auditor-formula-coercion-and-buffer-row-boundary-contracts.md

Establish TemplateDriftAuditor live cache bypass, 4-tier migration formula coercion policy, and BufferRow hard boundary termination for LogEngine.

## Context & Decision

To ensure structural alignment across live Google Sheets, preserve calculation integrity during legacy log migrations, and enforce deterministic log boundary reads:

1. **TemplateDriftAuditor Live Cache Bypass (`bypassCache: true`)**:
   - `TemplateDriftAuditor` MUST execute direct, uncached live reads (`bypassCache: true`) against target Google Sheet workbooks (`_Config` tab, Named Range registry, sheet headers, `FormulaRow` formulas).
   - Bypasses `ScriptCache` / `UserCache` to prevent stale configuration entries from masking live spreadsheet drift, deleted named ranges, or broken formulas.

2. **4-Tier Migration Formula Coercion Policy**:
   - **Calculated Columns (`isCalculated: true`)**: Custom inline formulas and manual values in calculated columns are cleared (`null` or `""`) during migration so top-level `FormulaRow` `MAP`/`LAMBDA` formulas take over and spill down cleanly. Legacy formula/value discrepancies are inventoried during Pass 1 dry-run in `MigrationAuditReport.legacyCalculatedFormulaDiscrepancies` and logged to `_AuditLog`.
   - **Standard Non-Calculated Columns**: Custom inline formulas in standard core columns (e.g. Notes, Status, Subcontractor) are coerced to evaluated static snapshot values (`getValues()`) and migrated.
   - **User-Created Columns (Data Rows)**: Inline formulas in custom user-added columns are coerced to evaluated static snapshot values (`getValues()`) and migrated.
   - **User-Created Columns (`FormulaRow`)**: Top-level `FormulaRow` formulas (Row 2) in custom user-added columns are preserved, enabling post-migration formula editing.

3. **LogEngine Boundary Termination Contract**:
   - When the sheet-scoped `Data` Named Range is registered and valid, the bottom `BufferRow` acts as the absolute, hard cutoff for `LogEngine.readLog()`. All rows between top `BufferRow + 1` and bottom `BufferRow - 1` are read without applying blank row cutoffs.
   - The $K=5$ sparse blank row tolerance is applied exclusively as an un-bounded fallback termination heuristic when the `Data` Named Range cannot be identified.

## Consequences

- Diagnostic schema audits operate on guaranteed live sheet ground truth.
- Migrated legacy spreadsheets maintain calculated column formula inheritance while safely preserving static snapshot values for custom non-calculated formulas.
- `LogEngine` read operations are deterministic and bounded strictly by `BufferRow` sentinels when range metadata is present.
