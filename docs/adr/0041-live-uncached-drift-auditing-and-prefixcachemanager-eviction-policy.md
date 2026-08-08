# 0041-live-uncached-drift-auditing-and-prefixcachemanager-eviction-policy.md

Establish Live Uncached Audit Cache Eviction Protocol, PrefixScope Invalidation Boundaries (`DOC_CONFIG_<SpreadsheetId>`), Lazy Hydration Architecture, and Dual-Category Telemetry Logging.

## Context & Decision

`TemplateDriftAuditor` performs direct, uncached live reads (`bypassCache: true`) against target Google Sheet workbooks to detect and auto-repair structural schema drift without stale `ScriptCache` / `UserCache` entries masking ground truth (ADR 0037). However, runtime components (such as `DocumentTypeConfigRegistry` and add-on UI cards) look up document type schemas via `PrefixCacheManager` / `CacheAdapter` under `DOC_CONFIG_<SpreadsheetId>_*` cache keys.

To ensure live spreadsheet checks and auto-repairs do not serve or persist stale manifest schemas while avoiding unnecessary cache invalidation overhead:

1. **Uncached Audit Eviction Triggering Policy**:
   - `TemplateDriftAuditor` executes uncached live sheet reads (`bypassCache: true`).
   - `TemplateDriftAuditor` triggers `PrefixCacheManager.invalidatePrefix("DOC_CONFIG_" + spreadsheetId)` **strictly when structural drift is detected or an auto-repair operation is executed**.
   - If the live audit passes cleanly with zero drift detected, existing valid cache entries remain untouched, eliminating unnecessary cache miss latency on subsequent card re-renders.

2. **Full Workbook Scope Eviction (`DOC_CONFIG_<SpreadsheetId>`)**:
   - Eviction invalidates the entire workbook scope prefix `DOC_CONFIG_<SpreadsheetId>` in a single atomic batch via `PrefixCacheManager.invalidatePrefix()`.
   - Clears `DOC_CONFIG_<SpreadsheetId>_MANIFEST`, all `DOC_CONFIG_<SpreadsheetId>_<DocTypeKey>` entries (e.g. `..._Submittal`, `..._RFI`), and the manifest index key `_INDEX_DOC_CONFIG_<SpreadsheetId>`.
   - Prevents partial schema drift between `Config_Manifest` and individual `Config_<DocTypeKey>` range tables.

3. **Lazy Cache Hydration Protocol**:
   - `TemplateDriftAuditor` handles live inspection, reporting, auto-repair, and targeted cache invalidation only. It does **not** write audited schema objects directly back into `PrefixCacheManager`.
   - Subsequent configuration requests via `DocumentTypeConfigRegistry.getConfig(spreadsheetId, docTypeKey)` encounter a cache miss, trigger single-pass sheet parsing, and populate `PrefixCacheManager.putScoped()` naturally through the canonical registry path.

4. **Dual-Category Telemetry & Audit Logging**:
   - When cache eviction occurs due to drift or repair, `TemplateDriftAuditor` records dual-category events on the target workbook's `_AuditLog` tab:
     - `SCHEMA_DRIFT` event (`Category: SCHEMA_DRIFT`, `EventType: DRIFT_REPAIR_EXECUTED`) detailing structural drift issues and repair outcome.
     - `CACHE_PURGE` event (`Category: CACHE_PURGE`, `EventType: EVICT_PREFIX`, `Details` JSON with `prefix: DOC_CONFIG_<SpreadsheetId>` and `trigger: TEMPLATE_DRIFT_AUDITOR_AUTO_EVICTION`).
   - Structured JSON execution logs are simultaneously emitted to `Logger.log()` for cloud logging visibility.

## Consequences

- Diagnostic schema audits operate on guaranteed live sheet ground truth without serving stale cached configurations post-repair.
- Zero-drift audits maintain 0-latency cache hits without unnecessary cache invalidation thrashing.
- Single atomic prefix invalidations eliminate partial schema inconsistencies.
- Architectural separation of concerns is maintained: `TemplateDriftAuditor` audits and evicts; `DocumentTypeConfigRegistry` parses and hydrates.
- Telemetry across `_AuditLog` and `Logger.log()` provides 100% auditability for cache purges and schema repairs.
