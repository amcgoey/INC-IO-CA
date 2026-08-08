# 0035-app-context-scoped-admin-foldouts-and-cache-partitioning.md

Establish `AdminFoldOutPresenter` dispatch architecture, strict AppContext-scoped cache flushing boundaries (`SheetAdminFoldOut` vs `TriageAdminFoldOut`), and dual-tier telemetry logging routing.

## Context & Decision

The Google Workspace Add-on operates across three execution environments (`AppContext`: `GoogleSheets`, `Gmail`, `GoogleDrive`). Administrative controls and cache flushing mechanisms must be properly scoped to prevent accidental cross-context cache wiping (e.g. clearing global Shared Drive log search caches while inspecting a single spreadsheet).

To partition admin tools and cache controls safely across execution contexts:

1. **`AdminFoldOutPresenter` Dispatch Architecture**:
   - Create a declarative presenter module `AdminFoldOutPresenter.renderAdminSection(appContext, contextData)`.
   - When `appContext === "GoogleSheets"`, it returns `SheetAdminFoldOut` housing target workbook status inspection, `TemplateDriftAuditor` schema drift audits, and workbook-scoped config cache invalidation.
   - When `appContext === "Gmail"` or `"GoogleDrive"`, it returns `TriageAdminFoldOut` housing Shared Drive log search resets, AI prediction clears, and contact/action picklist cache flushing.
   - Decouples root cards (`SheetsRootCard`, `UnbiasedIntakeCard`) from administrative widget construction details.

2. **Strict AppContext-Scoped Cache Eviction Boundaries**:
   - **`SheetAdminFoldOut` (Google Sheets Context)**: Exposes `"🔄 Refresh Workbook Config Cache"`. Strictly invalidates `DOC_CONFIG_<SpreadsheetId>_*` via `PrefixCacheManager.invalidatePrefix()` for the currently open active spreadsheet. Excludes global drive search or AI triage cache purges.
   - **`TriageAdminFoldOut` (Gmail / Drive Context)**: Exposes partitioned triage cache controls: `"🔄 Reset Log Search Cache"` (`log_search_<DriveId>_*`), `"🧠 Clear AI Triage Cache"` (`ai_triage_*`), and `"👥 Flush Contacts & Actions Cache"` (`contacts_*`, `actions_*`). Excludes direct `DOC_CONFIG` invalidation unless a specific log spreadsheet is explicitly selected in the intake dropdown.

3. **Dual-Tier Telemetry Routing**:
   - **Workbook-Bound Execution**: Admin actions in `GoogleSheets` context or with a bound workbook append structured event records to the target workbook's `_AuditLog` tab (`Category: CACHE_PURGE` / `SCHEMA_DRIFT`) per ADR 0026 and log to `Logger.log()`.
   - **Standalone Unbound Triage Execution**: Unbound triage admin actions in `Gmail`/`Drive` context write structured JSON telemetry entries directly to Apps Script `Logger.log()` / Cloud Logging (`[ADMIN_TELEMETRY]`) without requiring a sheet tab.

## Consequences

- Admin foldouts and cache invalidations are strictly isolated by `AppContext`, preventing accidental cross-workbook or global cache clearing.
- Root card presenters remain clean and focused on their primary UI responsibilities.
- Audit logging is 100% complete across all execution contexts.
