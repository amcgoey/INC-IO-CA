/**
 * @file SpreadsheetLockAdapter.ts
 * @description Tier 1 pure core interface defining spreadsheet-scoped locking operations.
 *
 * Dual-compatible with Google Apps Script V8 and Node.js without GAS dependencies or Node built-in imports.
 */

/**
 * Lock record metadata for spreadsheet locking.
 */
interface LockRecord {
  executionId: string;
  spreadsheetId: string;
  acquiredAt: number;
  expiresAt: number;
}

/**
 * Interface defining spreadsheet-scoped locking operations.
 */
interface SpreadsheetLockAdapter {
  /**
   * Attempts to acquire a lock for the specified spreadsheet.
   * Returns executionId string if acquired, or null if lock acquisition failed.
   */
  acquireLock(spreadsheetId: string, ttlMs?: number): string | null;

  /**
   * Releases an acquired lock for a spreadsheet if the executionId matches.
   * Returns true if released successfully.
   */
  releaseLock(spreadsheetId: string, executionId: string): boolean;

  /**
   * Checks whether a given spreadsheet currently holds an active, non-expired lock.
   */
  isLocked(spreadsheetId: string): boolean;
}

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
