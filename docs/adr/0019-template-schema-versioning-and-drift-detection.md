# 0019-template-schema-versioning-and-drift-detection.md

Establish the schema versioning specification (`schemaVersion`), 6-dimension live Google Sheet drift detection engine (`TemplateDriftAuditor`), structured `TemplateDriftReport`, automated deployment safety gates, and runtime Apps Script startup compatibility guards.

## Context & Decision

As Google Sheet Document Log Workbooks evolve across production and test environments, structural drift (e.g. user-deleted named ranges, altered headers, outdated config keys, or broken formulas) can cause silent application runtime failures or data corruption. To guarantee structural alignment between TypeScript application code and live Google Sheets:

1. **`schemaVersion` Source of Truth & Tracking**:
   - **TypeScript Code**: `DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION` defined as a SemVer string (`MAJOR.MINOR.PATCH`, e.g. `"1.0.0"`) in `scripts/template/DocumentLogWorkbookSpec.ts` and exposed via Tier 1 interfaces.
   - **Live Google Sheet**: Stored on `_Config` tab inside `Config_Manifest` and bound to immutable Named Range `MANIFEST_SCHEMA_VERSION` (referencing `_Config!B2`).
   - **SemVer Contract**:
     - `MAJOR` (`1.0.0` -> `2.0.0`): Structural breaking changes (deleted/reordered columns, tab removal, renamed core named ranges). Requires running `LogMigrationEngine`.
     - `MINOR` (`1.0.0` -> `1.1.0`): Backward-compatible additions (new optional rightmost log column, new config key, new support tab). Safe for `--auto-patch`.
     - `PATCH` (`1.0.0` -> `1.0.1`): Non-structural fixes (formula text tweak in `FormulaRow`, dropdown list option update, comment/formatting fix). Automated hot-fix deployment.

2. **Template Drift Detection Engine (`TemplateDriftAuditor`)**:
   - Audits 6 structural dimensions of live sheets against `DocumentLogWorkbookSpec`:
     1. **Schema Version Check**: Compares `liveSchemaVersion` against `codeSchemaVersion`.
     2. **Tab Taxonomy Audit**: Verifies all required tabs (`_Config`, `_Shared`, log tabs, support tabs) exist and maintain exact sheet names.
     3. **Named Range Registry Audit**: Verifies existence, tab assignment, and cell scope for all required Named Ranges (`MANIFEST_SCHEMA_VERSION`, `Config_Manifest`, `Config_<DocTypeKey>`, `<TabName>_Headers`, `<TabName>_FormulaRow`).
     4. **Header Schema Alignment Audit**: Compares header text, column order, and column count in `<TabName>_Headers` against `DocumentLogWorkbookSpec.columns`.
     5. **Formula Integrity Audit**: Verifies top-level `MAP`/`LAMBDA` formulas in `FormulaRow` (`Row H + 1`) match expected formulas without user overwrites or `#REF!` / `#NAME?` errors.
     6. **Dropdown & Validation Audit**: Audits data validation rules on log columns tied to `Config_<DocTypeKey>` and `_Shared` named ranges.

3. **`TemplateDriftReport` & Severity Classification**:
   - Returns a structured `TemplateDriftReport` object with `status` (`'MATCH' | 'MINOR_DRIFT' | 'MAJOR_DRIFT' | 'INCOMPATIBLE'`), `issues` list (categorized by severity `'CRITICAL' | 'WARNING' | 'INFO'`), and `canAutoPatch` boolean.

4. **Deployment Safety Gate & Runtime Startup Guard**:
   - **Deployment Gate (`npm run template:audit-drift`)**: Run automatically before `npm run template:deploy-live`. Automatically deploys on `'MATCH'`, allows `--auto-patch` on `'MINOR_DRIFT'`, and blocks deployment on `'MAJOR_DRIFT'` / `'INCOMPATIBLE'` (requiring `LogMigrationEngine` dry-run audit & backup tab creation).
   - **Runtime Guard**: `DocumentTypeConfigRegistry` inspects `MANIFEST_SCHEMA_VERSION` on startup (cached via `ScriptCache` 6-hr TTL). If `liveVersion` Major version < `codeVersion` Major version, fails fast by throwing an `IncompatibleSchemaException` and displaying a Workspace Add-on user notification explaining a template migration is required before filing documents.

## Consequences

- Live production and test Google Sheet workbooks are continuously auditable against Git-versioned TypeScript specifications with zero manual spreadsheet inspection.
- Minor schema additions and formula fixes can be automatically patched without risking user data loss.
- Major breaking schema changes are safely gated behind migration dry-runs and automated backup protocols.
