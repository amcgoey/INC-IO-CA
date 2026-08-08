# 0034-sheets-root-card-minimal-layout-and-tab-role-classification.md

Establish minimal `SheetsRootCard` section hierarchy and 5-tier active tab role classification in `AppContext.GoogleSheets`.

## Context & Decision

When running the Google Workspace Add-on inside Google Sheets (`AppContext.GoogleSheets`), `SheetsRootCard` serves as the primary sidebar container. Per ADR 0032 and ADR 0033, container-bound scripts and custom spreadsheet menus are eliminated in favor of this centralized add-on card.

To provide a clean, minimal user experience focused on workbook status visibility and administrative health while avoiding UI clutter, the following design decisions are established:

1. **Minimal `SheetsRootCard` Section Hierarchy**:
   `SheetsRootCard` consists of two primary vertical sections:
   - **Workbook Status Header** (top section): Displays active spreadsheet and tab context.
   - **`SheetAdminFoldOut`** (bottom collapsible section): Provides schema drift auditing (`TemplateDriftAuditor`) and cache management controls (ADR 0029, ADR 0032).

2. **Workbook Status Header Elements**:
   - **Spreadsheet Title**: Display name of the active Google Sheet.
   - **Active Tab Context & Role**: Active tab name and classified role.
   - **DocumentType Key**: Resolved `DocumentType` string identifier (or `N/A`).
   - **Data Row Count**: Number of active data rows bounded by the sheet-scoped `Data` Named Range (or `N/A`).
   - **Refresh Card Action**: A manual `"Refresh Card"` button/action to re-bind context on demand when switching tabs in Google Sheets.

3. **5-Tier Tab Role Classification**:
   Active tabs within a `DocumentLogWorkbook` are dynamically classified into one of 5 roles:
   - **`Log Tab`**: Linked to an active `DocumentType` schema (e.g. `Submittal Arch`, `Submittal FFE`). Displays `DocumentType` key and active data row count.
   - **`System Config Tab`**: The `_Config` tab housing system manifests and schemas. Displays `Role: System Config`.
   - **`Audit Log Tab`**: The `_AuditLog` system telemetry tab. Displays `Role: System Audit Log`.
   - **`Documentation Tab`**: Instructions or user guide tab (e.g. `Documentation`). Displays `Role: Documentation`.
   - **`User Created Tab`**: Custom user-created scratch or report tab. Displays `Role: User Created` with a non-log tab notice.

4. **Unrecognized Spreadsheet Fallback**:
   If the active spreadsheet lacks configuration markers (`Config_Manifest` or `MANIFEST_SCHEMA_VERSION`), `SheetsRootCard` renders the `"Unrecognized Document Log"` fallback status banner with `SheetAdminFoldOut` disabled.

## Consequences

- `SheetsRootCard` maintains a clean, clutter-free sidebar layout consisting of the status header and `SheetAdminFoldOut`.
- Tab context changes in Google Sheets are clearly identified across standard log tabs, system tabs, documentation tabs, and user-created tabs.
- Context refresh action enables seamless state updates when moving between spreadsheet tabs.
