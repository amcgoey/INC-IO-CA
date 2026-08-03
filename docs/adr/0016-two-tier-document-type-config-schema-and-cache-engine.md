# 0016-two-tier-document-type-config-schema-and-cache-engine.md

Establish the 2-tier spreadsheet configuration schema (`Config_Manifest` + `Config_<DocTypeKey>`), data serialization rules, `ScriptCache` caching engine, and zero-code fallback hierarchy for `DocumentTypeConfigRegistry`.

## Context & Decision

To enable non-developers to add or customize document types (e.g. `Submittal`, `RFI`, `ASI`, `ChangeOrder`) directly in Google Sheets without modifying or redeploying TypeScript application code:

1. **2-Tier Sheet Configuration Layout (`_Config` Tab)**:
   - **`Config_Manifest`**: Named Range table on `_Config` tab defining active document types (`DocTypeKey`, `DisplayName`, `Enabled`, `LogSheetName`, `StrategyKey`).
   - **`Config_<DocTypeKey>`**: 2-column key-value Named Ranges on `_Config` (e.g. `Config_Submittal`, `Config_RFI`) mapping to `DocumentTypeConfig` schema properties.

2. **Data Serialization & Type Converters**:
   - **String Arrays (`string[]`)**: Comma-separated strings in Value cells (e.g. `Submittals, Submittal` parsed to `['Submittals', 'Submittal']`).
   - **Key-Value Maps (`Record<string, string>`)**: Serialized JSON strings in Value cells (e.g. `{"Architecture": "Architecture", "FF&E": "FFE"}`).
   - **Single Strings & Adapter Keys**: Direct string values matching registered adapter keys.

3. **`CacheService` Caching & Invalidation Engine**:
   - **`ScriptCache`**: `DocumentTypeConfigRegistry` uses `CacheService.getScriptCache()` (6-hour TTL, `21600`s) with cache keys `DOC_CONFIG_<DocTypeKey>` and `DOC_CONFIG_MANIFEST` to achieve sub-millisecond lookup and eliminate Google Sheets API latency.
   - **Invalidation**: Admin menu command (`Reset Config Cache`) and/or `onEdit` trigger on `_Config` tab clear the script cache on edits.

4. **Zero-Code Extensibility & Fallback Hierarchy**:
   - `DocumentTypeConfigRegistry` maintains baseline baseline defaults (`DEFAULT_SUBMITTAL_CONFIG`, `DEFAULT_GENERIC_CONFIG`).
   - Sheet configuration values override baseline defaults key-by-key.
   - Omitted optional keys automatically fall back to `DEFAULT_GENERIC_CONFIG`, ensuring zero-code additions for new document types.

## Consequences

- New document types can be registered and configured end-to-end by non-technical users in Google Sheets with zero code changes or deployments.
- Application workflow executions achieve sub-millisecond config lookups via `ScriptCache` with 0 Sheets API calls on cache hits.
- Configuration edits in Google Sheets take instant effect via cache invalidation without requiring script redeployment.
