import test from "node:test";
import assert from "node:assert";

// Ambient mock for CONFIG
(global as any).CONFIG = { LOG_HEADER_ROW: 3 };

import {
  getBoundedData,
  getRowGroupKey,
  getRowSortKey,
  computeRowInsertionPlan,
  createRowGroupKeyFn,
  createRowSortKeyFn,
  createRowIdentityGroupKeyFn,
  createRowIdentityRevisionGroupKeyFn,
  createRowIdentityKeyFn
} from "../../../src/RowPositionCalculator";

test("RowPositionCalculator calculates IdentityGroup, IdentityRevisionGroup, and Identity in-memory without discipline hardcoding", () => {
  const headers = ["Section", "Number", "Revision", "Date", "Title"];
  const row = ["08 11 00", "1", "0", "260808", "Door Frames"];

  const groupKeyFn = createRowIdentityGroupKeyFn();
  const revGroupKeyFn = createRowIdentityRevisionGroupKeyFn();
  const identityKeyFn = createRowIdentityKeyFn();

  const groupKey = groupKeyFn(row, headers);
  const revGroupKey = revGroupKeyFn(row, headers);
  const identityKey = identityKeyFn(row, headers);

  assert.strictEqual(groupKey, "081100-001");
  assert.strictEqual(revGroupKey, "081100-001-0");
  assert.strictEqual(identityKey, "081100-001-0-260808");
});

test("RowPositionCalculator computes 3-tier identity keys for FF&E without hardcoded discipline strings", () => {
  const headers = ["Spec Tag", "Revision", "Date", "Vendor"];
  const row = ["CH-01", "1", "260808", "Herman Miller"];

  const groupKeyFn = createRowIdentityGroupKeyFn();
  const revGroupKeyFn = createRowIdentityRevisionGroupKeyFn();
  const identityKeyFn = createRowIdentityKeyFn();

  assert.strictEqual(groupKeyFn(row, headers), "CH-01");
  assert.strictEqual(revGroupKeyFn(row, headers), "CH-01-1");
  assert.strictEqual(identityKeyFn(row, headers), "CH-01-1-260808");
});

test("computeRowInsertionPlan uses in-memory RowKeyFn without formula dependencies or hardcoded discipline checks", () => {
  const headers = ["Section", "Number", "Revision", "Date", "Title"];
  const boundedData = [
    ["Banner"],
    ["Subtitle"],
    headers,
    ["081100", "001", "000", "260801", "Submittal Rev 0"],
    ["081100", "001", "001", "260805", "Submittal Rev 1"]
  ];
  const newRow = ["081100", "001", "002", "260809", "Submittal Rev 2"];

  const groupKeyFn = createRowIdentityGroupKeyFn();
  const sortKeyFn = createRowIdentityKeyFn();

  const plan = computeRowInsertionPlan(boundedData, headers, newRow, groupKeyFn, sortKeyFn);

  assert.strictEqual(plan.targetRowIndex, 5);
  assert.strictEqual(plan.finalRowIndex, 6);
  assert.strictEqual(plan.insertBlankBefore, false);
  assert.strictEqual(plan.insertBlankAfter, false);
});
