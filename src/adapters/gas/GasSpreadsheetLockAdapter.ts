/**
 * @file GasSpreadsheetLockAdapter.ts
 * @description Tier 2 GAS Infrastructure Adapter implementing SpreadsheetLockAdapter using PropertiesService and LockService.
 *
 * Scopes transaction locks by Spreadsheet ID under `LOCK_MIGRATION_<SpreadsheetId>` inside `PropertiesService.getScriptProperties()`.
 * Uses short-lived native `LockService.getScriptLock().tryLock(10000)` to guard atomic check-and-set operations, releasing the script lock immediately after.
 * Supports 15-minute default TTL with automated stale lock recovery.
 */

/// <reference path="../../core/interfaces/SpreadsheetLockAdapter.ts" />

export class GasSpreadsheetLockAdapter implements SpreadsheetLockAdapter {
  private getPropertyKey(spreadsheetId: string): string {
    return "LOCK_MIGRATION_" + spreadsheetId;
  }

  public acquireLock(spreadsheetId: string, ttlMs: number = 900000): string | null {
    const scriptLock = LockService.getScriptLock();
    const hasMutex = scriptLock.tryLock(10000);
    if (!hasMutex) {
      return null;
    }

    try {
      const props = PropertiesService.getScriptProperties();
      const key = this.getPropertyKey(spreadsheetId);
      const existingVal = props.getProperty(key);
      const now = Date.now();

      if (existingVal) {
        try {
          const payload = JSON.parse(existingVal);
          if (payload && typeof payload.expiresAt === "number") {
            if (now >= payload.expiresAt) {
              props.deleteProperty(key);
            } else {
              return null;
            }
          }
        } catch (_e) {
          props.deleteProperty(key);
        }
      }

      const executionId = "exec_" + now + "_" + Math.random().toString(36).substring(2, 9);
      const lockRecord: LockRecord = {
        executionId,
        spreadsheetId,
        acquiredAt: now,
        expiresAt: now + ttlMs
      };

      props.setProperty(key, JSON.stringify(lockRecord));
      return executionId;
    } finally {
      scriptLock.releaseLock();
    }
  }

  public releaseLock(spreadsheetId: string, executionId: string): boolean {
    const scriptLock = LockService.getScriptLock();
    const hasMutex = scriptLock.tryLock(10000);
    if (!hasMutex) {
      return false;
    }

    try {
      const props = PropertiesService.getScriptProperties();
      const key = this.getPropertyKey(spreadsheetId);
      const existingVal = props.getProperty(key);

      if (!existingVal) {
        return false;
      }

      try {
        const payload = JSON.parse(existingVal);
        if (payload && payload.executionId === executionId) {
          props.deleteProperty(key);
          return true;
        }
      } catch (_e) {
        props.deleteProperty(key);
      }

      return false;
    } finally {
      scriptLock.releaseLock();
    }
  }

  public isLocked(spreadsheetId: string): boolean {
    const props = PropertiesService.getScriptProperties();
    const key = this.getPropertyKey(spreadsheetId);
    const existingVal = props.getProperty(key);

    if (!existingVal) {
      return false;
    }

    try {
      const payload = JSON.parse(existingVal);
      if (payload && typeof payload.expiresAt === "number") {
        if (Date.now() >= payload.expiresAt) {
          props.deleteProperty(key);
          return false;
        }
        return true;
      }
    } catch (_e) {
      props.deleteProperty(key);
    }

    return false;
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GasSpreadsheetLockAdapter
  };
}

(globalThis as any).GasSpreadsheetLockAdapter = GasSpreadsheetLockAdapter;
