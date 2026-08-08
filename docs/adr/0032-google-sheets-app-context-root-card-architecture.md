# 0032-google-sheets-app-context-root-card-architecture.md

Establish `AppContext.GoogleSheets` type enumeration, active spreadsheet auto-binding, and dedicated `SheetsRootCard` layout architecture.

## Context & Decision

When the Google Workspace Add-on is launched, `AppContext` governs contextual card rendering and workflow execution across environments (`GoogleDrive`, `Gmail`). When opened inside Google Sheets (`AppContext.GoogleSheets`), the user is directly inspecting a `DocumentLogWorkbook`, requiring a dedicated sidebar experience distinct from Gmail email triage or Drive file filing.

To establish clean context-sensitive root cards and simple administrative access:

1. **`AppContext` Type Union & Active Workbook Auto-Binding**:
   - Expand `AppContext` type union in `src/types.ts` to include `"GoogleSheets"` (`"GoogleDrive" | "Gmail" | "GoogleSheets"`).
   - On add-on load in `GoogleSheets` context, automatically inspect `SpreadsheetApp.getActiveSpreadsheet()` to bind the active spreadsheet ID.
   - Verify workbook configuration markers (`Config_Manifest` or `MANIFEST_SCHEMA_VERSION` Named Ranges).

2. **Dedicated `SheetsRootCard` Component Architecture**:
   - Implement `SheetsRootCard` as the dedicated root card for `AppContext.GoogleSheets`.
   - Simple, clean initial implementation housing `SheetAdminFoldOut` (ADR 0029) as its core interface for dry-run schema drift audits (`TemplateDriftAuditor`) and ScriptCache clearing (`DocumentTypeConfigRegistry`).
   - Designed with an extensible card section slot architecture to easily accommodate future workbook tools (quick log entry, cross-log reference scanner) without breaking layout contracts.

3. **Friendly Non-Log Spreadsheet Fallback State**:
   - If the open Google Sheet is not a `DocumentLogWorkbook` (missing `_Config` manifest or schema version range), `SheetsRootCard` renders a clear, non-blocking fallback section:
     - **Header**: `"Unrecognized Document Log"`
     - **Description**: `"The active spreadsheet is not a Document Log (missing configuration information)."`
   - Renders `SheetAdminFoldOut` in an inactive/disabled state with an option to select a target `DocumentLogWorkbook` from Drive.

## Consequences

- Multi-context add-on execution is strongly typed across `GoogleDrive`, `Gmail`, and `GoogleSheets`.
- In-spreadsheet sidebar users get a focused root card (`SheetsRootCard`) rather than redundant email/file intake pickers (`UnbiasedIntakeCard`).
- Administrative tools (`SheetAdminFoldOut`, `TemplateDriftAuditor`, ScriptCache flushing) are immediately accessible upon opening the add-on sidebar in Google Sheets.
- Non-log spreadsheets display friendly, clear diagnostic guidance without throwing runtime errors or polluting user sheets.
