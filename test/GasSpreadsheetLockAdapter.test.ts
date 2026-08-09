/**
 * @file GasSpreadsheetLockAdapter.test.ts
 * @description Unit tests for Tier 2 GasSpreadsheetLockAdapter dual-layer transaction locking protocol.
 */

import test from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./harness/GasMockHarness";
import { GasSpreadsheetLockAdapter } from "../src/adapters/gas/GasSpreadsheetLockAdapter";

test.beforeEach(() => {
  GasMockHarness.install();
});

test("GasSpreadsheetLockAdapter - acquireLock successfully acquires lock and writes property payload", () => {
  const harness = GasMockHarness.install();
  const adapter = new GasSpreadsheetLockAdapter();
  const spreadsheetId = "ss_test_101";

  const execId = adapter.acquireLock(spreadsheetId);
  assert.ok(execId);
  assert.strictEqual(typeof execId, "string");
  assert.ok(execId.startsWith("exec_"));

  const propVal = harness.scriptProperties.getProperty(`LOCK_MIGRATION_${spreadsheetId}`);
  assert.ok(propVal);
  const payload = JSON.parse(propVal);
  assert.strictEqual(payload.executionId, execId);
  assert.strictEqual(payload.spreadsheetId, spreadsheetId);
  assert.ok(payload.expiresAt > payload.acquiredAt);
});

test("GasSpreadsheetLockAdapter - acquireLock uses LockService.getScriptLock() mutex guard and releases script lock immediately", () => {
  const harness = GasMockHarness.install();
  const adapter = new GasSpreadsheetLockAdapter();
  const spreadsheetId = "ss_test_102";

  adapter.acquireLock(spreadsheetId);

  // Script lock should be released after property mutation
  assert.strictEqual(harness.lockService.getScriptLock().hasLock(), false);
  const scriptLockCalls = harness.lockService.getScriptLock().calls;
  assert.ok(scriptLockCalls.some(c => c.method === "tryLock"));
  assert.ok(scriptLockCalls.some(c => c.method === "releaseLock"));
});

test("GasSpreadsheetLockAdapter - acquireLock returns null if lock already acquired on same spreadsheet", () => {
  const adapter = new GasSpreadsheetLockAdapter();
  const spreadsheetId = "ss_test_103";

  const execId1 = adapter.acquireLock(spreadsheetId);
  assert.ok(execId1);

  const execId2 = adapter.acquireLock(spreadsheetId);
  assert.strictEqual(execId2, null);
});

test("GasSpreadsheetLockAdapter - acquireLock allows concurrent locks on different spreadsheets", () => {
  const adapter = new GasSpreadsheetLockAdapter();
  const ss1 = "ss_alpha";
  const ss2 = "ss_beta";

  const execId1 = adapter.acquireLock(ss1);
  const execId2 = adapter.acquireLock(ss2);

  assert.ok(execId1);
  assert.ok(execId2);
  assert.notStrictEqual(execId1, execId2);
});

test("GasSpreadsheetLockAdapter - releaseLock deletes property when executionId matches", () => {
  const harness = GasMockHarness.install();
  const adapter = new GasSpreadsheetLockAdapter();
  const spreadsheetId = "ss_test_104";

  const execId = adapter.acquireLock(spreadsheetId)!;
  assert.ok(harness.scriptProperties.getProperty(`LOCK_MIGRATION_${spreadsheetId}`));

  const released = adapter.releaseLock(spreadsheetId, execId);
  assert.strictEqual(released, true);
  assert.strictEqual(harness.scriptProperties.getProperty(`LOCK_MIGRATION_${spreadsheetId}`), null);
});

test("GasSpreadsheetLockAdapter - releaseLock fails and preserves lock if executionId does not match", () => {
  const harness = GasMockHarness.install();
  const adapter = new GasSpreadsheetLockAdapter();
  const spreadsheetId = "ss_test_105";

  const execId = adapter.acquireLock(spreadsheetId)!;

  const released = adapter.releaseLock(spreadsheetId, "exec_fake_wrong_id");
  assert.strictEqual(released, false);
  assert.ok(harness.scriptProperties.getProperty(`LOCK_MIGRATION_${spreadsheetId}`));
});

test("GasSpreadsheetLockAdapter - recovers stale lock older than 15 minutes and acquires new lock", () => {
  const harness = GasMockHarness.install();
  const adapter = new GasSpreadsheetLockAdapter();
  const spreadsheetId = "ss_test_stale";

  // Simulate stale lock written 20 minutes ago
  const stalePayload = JSON.stringify({
    executionId: "exec_old_stale",
    spreadsheetId,
    acquiredAt: Date.now() - 1200000,
    expiresAt: Date.now() - 300000
  });
  harness.scriptProperties.setProperty(`LOCK_MIGRATION_${spreadsheetId}`, stalePayload);

  const newExecId = adapter.acquireLock(spreadsheetId);
  assert.ok(newExecId);
  assert.notStrictEqual(newExecId, "exec_old_stale");

  const activeVal = harness.scriptProperties.getProperty(`LOCK_MIGRATION_${spreadsheetId}`);
  assert.ok(activeVal);
  assert.strictEqual(JSON.parse(activeVal).executionId, newExecId);
});

test("GasSpreadsheetLockAdapter - isLocked returns correct status for active, expired, and absent locks", () => {
  const harness = GasMockHarness.install();
  const adapter = new GasSpreadsheetLockAdapter();
  const ssActive = "ss_active";
  const ssExpired = "ss_expired";
  const ssAbsent = "ss_absent";

  adapter.acquireLock(ssActive);

  harness.scriptProperties.setProperty(`LOCK_MIGRATION_${ssExpired}`, JSON.stringify({
    executionId: "exec_exp",
    spreadsheetId: ssExpired,
    acquiredAt: Date.now() - 1000000,
    expiresAt: Date.now() - 1000
  }));

  assert.strictEqual(adapter.isLocked(ssActive), true);
  assert.strictEqual(adapter.isLocked(ssExpired), false);
  assert.strictEqual(adapter.isLocked(ssAbsent), false);
});
