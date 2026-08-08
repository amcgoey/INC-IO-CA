# 0031-cacheadapter-scoped-eviction-and-prefixcachemanager.md

Establish low-level key eviction primitives on `CacheAdapter` (`remove`, `removeAll`) and Tier 1 `PrefixCacheManager` manifest key tracking for targeted prefix invalidation.

## Context & Decision

Google Apps Script `CacheService` (`getUserCache()`, `getScriptCache()`) does not support key listing (e.g. `keys()`) or regex/wildcard deletion pattern matching. However, system features (such as `SheetAdminFoldOut` clearing `DOC_CONFIG_<SpreadsheetId>_*` or `TriageAdminFoldOut` clearing `log_search_<DriveId>_*`) require targeted cache eviction without clearing unrelated triage, user draft, or multi-workbook caches.

To support targeted eviction while maintaining strict 3-tier architecture (ADR 0013):

1. **`CacheAdapter` Primitive Eviction Extensions (Tier 2 Adapter Interface)**:
   - Extend the [`CacheAdapter`](../../src/CacheAdapter.ts) interface to include primitive eviction methods:
     - `remove(key: string): void`
     - `removeAll(keys: string[]): void`
   - [`GoogleScriptCacheAdapter`](../../src/CacheAdapter.ts) delegates directly to `CacheService.getUserCache().remove(key)` and `removeAll(keys)`.
   - [`InMemoryCacheAdapter`](../../test/harness/fakes/FakeCacheAdapter.ts) deletes entries directly from its internal `Map`.

2. **Tier 1 `PrefixCacheManager` Decorator & Scoped Manifest Tracking**:
   - Create a pure Tier 1 application helper [`PrefixCacheManager`](../../src/PrefixCacheManager.ts) that wraps any `CacheAdapter` instance.
   - For any prefix scope (e.g. `DOC_CONFIG_<SpreadsheetId>`), `PrefixCacheManager` maintains a manifest key index (`_INDEX_<prefix>`) storing a JSON array of active keys written under that prefix.
   - `putScoped(prefix, key, value, ttlSeconds)` stores the value and appends `key` to `_INDEX_<prefix>`, updating the index key TTL dynamically.
   - `removeScoped(prefix, key)` removes `key` from cache and prunes `key` from the `_INDEX_<prefix>` manifest array.
   - `invalidatePrefix(prefix)` retrieves the manifest list of keys from `_INDEX_<prefix>` and invokes `cacheAdapter.removeAll([...keys, indexKey])`, purging all scope items and the index key in a single batch operation.

## Consequences

- `CacheAdapter` remains zero-magic and 100% compliant with native Google Apps Script `CacheService` methods.
- Targeted administrative cache purges (e.g. workbook config refresh or Shared Drive search reset) flush only items matching the targeted prefix scope, leaving unrelated user card drafts and AI predictions intact.
- Key index manifests and prefix invalidation logic are 100% unit-testable in Node.js via `npm test` without needing GAS mocks or custom regex matching engines.
