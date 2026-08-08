# 0020-multi-project-cache-scoping-and-unified-field-schema.md

Establish multi-project CacheService key scoping (`DOC_CONFIG_<SpreadsheetId>_<DocTypeKey>`), automatic `schemaVersion` cache eviction, unified `DocumentFieldSpec` tables for UI generation and pre-flight log header validation, modular serialized fallback config files, and automated CLI default export tooling.

## Context & Decision

To support multiple DocumentTypes across independent Google Sheet workbooks while eliminating cross-workbook cache leakage, redundant schema declarations, and hardcoded TypeScript fallbacks:

1. **Multi-Project Cache Scoping & `schemaVersion` Eviction**:
   - **Key Format**: All `CacheService.getScriptCache()` keys are prefixed with `SpreadsheetId`:
     - `DOC_CONFIG_<SpreadsheetId>_MANIFEST`
     - `DOC_CONFIG_<SpreadsheetId>_<DocTypeKey>`
   - **Eviction Guard**: Cached payloads embed `schemaVersion`. `DocumentTypeConfigRegistry.getConfig(spreadsheetId, docTypeKey)` compares `cachedPayload.schemaVersion === currentCodeSchemaVersion`. On mismatch, it automatically evicts the cache entry, re-parses from `_Config`, and re-populates the cache.
   - **Targeted Invalidation**: `Reset Cache` menu/trigger invalidates only keys matching `DOC_CONFIG_<SpreadsheetId>_*`.

2. **Unified `DocumentFieldSpec` Table**:
   - Each `DocumentType` defines a single unified field schema stored in `_Config` as a subtable (`Config_<DocTypeKey>_Fields`):
     - `Key`: Internal property name (e.g. `section`, `vendor`, `contactChain`).
     - `Header`: Log tab column header (e.g. `Section`, `Vendor`, `Calc Contact Chain`).
     - `Label`: UI input field label for Workspace Add-on cards.
     - `Type`: Input type (`string`, `date`, `list`, `formula`, `function`).
     - `IsCalculated`: Boolean (`false` for input fields, `true` for formulas/functions).
     - `FormulaOrFunction`: Formula string (MAP/LAMBDA) or function name (e.g. `calculateContactChain`).
   - **Pre-Flight Validation**: `LogEngine` asserts that all non-calculated fields (`!IsCalculated`) exist in `<TabName>_Headers` before write ops, halting with `failedColumns: string[]` if missing.
   - **Dynamic UI Generation**: `UnbiasedIntakeCard` reads `config.fields` to dynamically render input controls for any `DocumentType`.

3. **Modular Serialized Fallback Configs & Developer CLI Tooling**:
   - Fallback configurations are extracted from inline TypeScript code into modular JSON files (`src/config/defaults/<DocTypeKey>.json`) matching the spreadsheet serialized format.
   - A developer CLI tool (`npm run config:export-defaults`) connects to live/test spreadsheets to inspect `_Config` subtables and regenerate `src/config/defaults/*.json` modular fallback files automatically.

## Consequences

- Complete multi-project cache isolation across workbooks sharing script instances.
- Zero cache drift across SemVer schema updates via automated `schemaVersion` eviction.
- Single source of truth for UI intake inputs, log column verification, and field mapping.
- Adding a new `DocumentType` is 100% spreadsheet-driven (or JSON-driven in fallbacks) with zero TypeScript code modifications.
