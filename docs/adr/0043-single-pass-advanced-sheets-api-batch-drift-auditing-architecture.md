# 0043-single-pass-advanced-sheets-api-batch-drift-auditing-architecture.md

Establish Single-Pass Advanced Sheets API Batch Fetch (`Sheets.Spreadsheets.get`), Tier 2 `SpreadsheetBatchReaderAdapter` Infrastructure Adapter, Range/Field Mask Payload Bounding, and Performance Telemetry Logging for `TemplateDriftAuditor`.

## Context & Decision

`TemplateDriftAuditor` audits 6 structural dimensions of live Google Sheets workbooks with `bypassCache: true` (ADR 0019 & ADR 0037) to prevent stale cache masking. However, inspecting workbooks with 15+ tabs via individual synchronous `SpreadsheetApp` RPC calls risks breaching the 30-second Google Apps Script custom action execution limit.

To guarantee sub-3-second uncached audit performance across 15+ tab workbooks without UI timeout risks:

1. **Single-Pass Advanced Sheets API Batch Fetch (`Sheets.Spreadsheets.get`)**:
   - `TemplateDriftAuditor` delegates all uncached grid, formula, named range, and data validation reads across all tabs to `Sheets.Spreadsheets.get` (Advanced Sheets Service v4).
   - Collapses hundreds of individual synchronous `SpreadsheetApp` RPC roundtrips into 1–2 HTTP batch requests, dropping 15+ tab audit runtime from 30+ seconds to <1–3 seconds while maintaining 100% live ground-truth verification (`bypassCache: true`).

2. **Tier 2 Infrastructure Adapter (`SpreadsheetBatchReaderAdapter`) & Hard API Requirement**:
   - Implements `SpreadsheetBatchReaderAdapter` under Tier 2 Infrastructure Adapters (`CODING_STANDARDS.md` & ADR 0013) to wrap `Sheets.Spreadsheets.get`.
   - `src/appsscript.json` is updated to include `Sheets` (v4) in `enabledAdvancedServices`.
   - If the Advanced Service fails or is unenabled, the adapter throws `SpreadsheetBatchReadException` immediately rather than attempting a slow fallback that risks silent UI timeouts.

3. **Targeted Range & Field Mask Payload Bounding**:
   - To prevent memory bloat and payload serialization latency on large workbooks (10,000+ data rows), payload retrieval is strictly bounded using:
     - `ranges`: `_Config!A1:Z100` (configuration manifest) and `1:2` (top structural rows — Headers and `FormulaRow`) across all log tabs.
     - `fields`: `namedRanges,sheets(properties(sheetId,title),data(rowData(values(userEnteredValue,dataValidation))))`.
   - Bypasses log data rows while capturing 100% of the metadata required for all 6 audit dimensions.

4. **Performance Telemetry Payload & ADR Compliance**:
   - `TemplateDriftReport` is extended with a `telemetry` object (`auditDurationMs`, `tabCount`, `inspectionStrategy: "ADVANCED_SHEETS_BATCH_V1"`, `apiReadCount: 1`).
   - Timing and strategy telemetry are continuously emitted to `Logger.log()`.
   - Preserves ADR 0041 & ADR 0042 compliance: zero-drift audits maintain cache hits, while detected drift or auto-patching triggers `PrefixCacheManager.invalidatePrefix("DOC_CONFIG_" + spreadsheetId)` and posts `SCHEMA_DRIFT` and `CACHE_PURGE` telemetry events to `_AuditLog`.

## Consequences

- Live 6-dimension uncached structural audits on 15+ tab workbooks complete reliably in <1-3 seconds.
- Zero risk of hitting the 30-second GAS execution timeout during add-on card loads or dry-run audit checks.
- Memory consumption and JSON parse overhead remain minimal even on workbooks with thousands of data rows.
- Complete architectural compliance with 3-tier GAS compatibility (ADR 0013), cache eviction policies (ADR 0041), and lock safety (ADR 0042).
