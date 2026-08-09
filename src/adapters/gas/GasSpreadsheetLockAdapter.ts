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

  private readLockRecord(props: any, key: string): LockRecord | null {
    const val = props.getProperty(key);
    if (!val) return null;
    try {
      const record: LockRecord = JSON.parse(val);
      if (record && typeof record.expiresAt === "number") {
        if (Date.now() >= record.expiresAt) {
          props.deleteProperty(key);
          return null;
        }
        return record;
      }
    } catch (_e) {
      props.deleteProperty(key);
    }
    return null;
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
      const activeRecord = this.readLockRecord(props, key);

      if (activeRecord) {
        return null;
      }

      const now = Date.now();
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
      const val = props.getProperty(key);

      if (!val) {
        return false;
      }

      try {
        const payload = JSON.parse(val);
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
    const activeRecord = this.readLockRecord(props, key);
    return activeRecord !== null;
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GasSpreadsheetLockAdapter
  };
}

(globalThis as any).GasSpreadsheetLockAdapter = GasSpreadsheetLockAdapter;
