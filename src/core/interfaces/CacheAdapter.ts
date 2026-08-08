/**
 * @file CacheAdapter.ts
 * @description Tier 1 pure core interface defining key-value string caching with time-to-live (TTL) expiration.
 *
 * Dual-compatible with Google Apps Script V8 and Node.js without GAS dependencies or Node built-in imports.
 */

/**
 * Interface defining simple string caching operations with time-to-live (TTL) expiration.
 */
interface CacheAdapter {
  /** Gets a cached string value by key, or returns `null` if expired/missing. */
  get(key: string): string | null;
  /** Stores a string value under key for `ttlSeconds`. */
  put(key: string, value: string, ttlSeconds: number): void;
  /** Removes a cached string value by key. */
  remove(key: string): void;
  /** Removes a batch of cached string values by key list. */
  removeAll(keys: string[]): void;
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
