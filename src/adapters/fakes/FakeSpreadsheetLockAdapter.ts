/**
 * @file FakeSpreadsheetLockAdapter.ts
 * @description In-memory fake implementation of `SpreadsheetLockAdapter` for unit testing outside GAS.
 */

export class FakeSpreadsheetLockAdapter implements SpreadsheetLockAdapter {
  private locks: Map<string, { executionId: string; expiresAt: number }> = new Map();

  acquireLock(spreadsheetId: string, ttlMs: number = 900000): string | null {
    const existing = this.locks.get(spreadsheetId);
    const now = Date.now();
    if (existing && now < existing.expiresAt) {
      return null;
    }
    const executionId = `exec_${now}_${Math.random().toString(36).substring(2, 9)}`;
    this.locks.set(spreadsheetId, {
      executionId,
      expiresAt: now + ttlMs
    });
    return executionId;
  }

  releaseLock(spreadsheetId: string, executionId: string): boolean {
    const existing = this.locks.get(spreadsheetId);
    if (!existing) return false;
    if (existing.executionId === executionId) {
      this.locks.delete(spreadsheetId);
      return true;
    }
    return false;
  }

  isLocked(spreadsheetId: string): boolean {
    const existing = this.locks.get(spreadsheetId);
    if (!existing) return false;
    if (Date.now() >= existing.expiresAt) {
      this.locks.delete(spreadsheetId);
      return false;
    }
    return true;
  }
}

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeSpreadsheetLockAdapter
  };
}
