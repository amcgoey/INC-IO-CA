# 0029-admin-foldout-layout-status-feedback-and-dry-run-validation-spec.md

Establish layout, status feedback indicators, dry-run schema validation report rendering (`TemplateDriftAuditor`), and non-destructive action controls within `SheetAdminFoldOut` for non-technical users.

## Context & Decision

To provide non-technical administrators with diagnostic health visibility, dry-run schema validation, and safe cache management in Google Sheets context (`SheetAdminFoldOut`) without distracting daily filing users:

1. **Collapsible Section Layout**:
   - Placed at the bottom of `UnbiasedIntakeCard` as a single `CardService.newCardSection().setCollapsible(true)`.
   - Uncollapsible header widget displays high-level system state (`⚙️ Admin — Schema: MATCH | Cache: ACTIVE`).
   - Keeps routine intake form clean while enabling single-click access to administrative health tools.
   - Preserves existing `TriageAdminFoldOut` layout for Gmail/Drive contexts without modification.

2. **3-Line Status Inspector Card (`SheetAdminFoldOut`)**:
   - **Workbook & Schema Health**: Displays target workbook title, `MANIFEST_SCHEMA_VERSION` (e.g. `v1.2.0`), and status pill (`🟢 Schema: MATCH` or `🟡 Schema: DRIFT_DETECTED`).
   - **Configuration Cache Status**: Displays `DOC_CONFIG_<SpreadsheetId>` ScriptCache state (`🟢 Cache: ACTIVE (TTL: 5h)` or `⚪ Cache: EXPIRED / UNSET`).
   - **Active Document Types**: Displays count and list of active document types from `Config_Manifest` (e.g. `📋 4 Enabled Types: Arch, FFE, RFI, ASI`).

3. **Dry-Run Validation Tooling & Inline Report Rendering (`TemplateDriftAuditor`)**:
   - Triggered via primary text button: `"🔍 Run Schema Drift Audit"`.
   - Executes `TemplateDriftAuditor.auditWorkbook(spreadsheetId)` in dry-run read-only mode without modifying sheet structure.
   - Re-renders `SheetAdminFoldOut` with an inline **Schema Health Report** card featuring:
     - **Overall Status Pill**: `🟢 MATCH`, `🟡 MINOR_DRIFT`, `🔴 MAJOR_DRIFT`, or `❌ INCOMPATIBLE`.
     - **Categorized Issue Breakdown**: Bulleted list of detected discrepancies (missing tabs, missing named ranges, header mismatches).
     - **Auto-Patch Readiness**: `canAutoPatch: true/false` indicator.
   - Emits a summary notification toast (`"Schema audit complete: <Status>"`).

4. **Actionable Controls, Cache Invalidation & Telemetry**:
   - **`🔄 Refresh Config Cache`**: Executes targeted invalidation `DocumentTypeConfigRegistry.invalidateSpreadsheetCache(spreadsheetId)` to flush `DOC_CONFIG_<SpreadsheetId>_*` ScriptCache entries, forcing fresh `_Config` tab parsing on next action. Displays toast: `"Config cache cleared for active workbook. Fresh settings loaded."`
   - **Non-Destructive Operations**: Administrative actions in `SheetAdminFoldOut` are strictly read-only or cache-invalidation operations; direct destructive sheet auto-patching from sidebar is excluded.
   - **Audit Log Telemetry**: Appends event records to `_AuditLog` system tab under `Category: CACHE_PURGE` or `Category: SCHEMA_DRIFT` with user email actor and execution parameters per ADR 0026.

## Consequences

- Non-technical admins can inspect workbook health, schema version alignment, and cache freshness directly from the sidebar.
- Schema drift issues after `_Config` tab edits can be diagnosed instantly via read-only dry-run audits.
- Cache invalidation is isolated strictly to the target workbook without disrupting global or user caches.
- Telemetry for all admin health checks and cache flushes is recorded to `_AuditLog` for system auditing.
