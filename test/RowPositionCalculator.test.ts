import test from "node:test";
import assert from "node:assert";

// Global ambient CONFIG mock matching production Config.ts (LOG_HEADER_ROW: 3, 1-based index 3 = array index 3)
(global as any).CONFIG = { LOG_HEADER_ROW: 3 };

const { getBoundedData, getRowGroupKey, getRowSortKey, computeRowInsertionPlan } = require("../src/RowPositionCalculator");

test("getBoundedData stops after 3 consecutive empty rows", () => {
  const headers = ["Section", "Number", "Revision", "Date", "Title", "Contact", "Action", "Notes"];
  const mockData = [
    ["Project Log Banner"],
    ["Project Subtitle"],
    headers,
    ["010000", "001", "001", "240101", "Submittal 1", "John", "Received", "Notes 1"],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["020000", "001", "001", "240101", "Submittal 2", "Jane", "Received", "Notes 2"]
  ];

  const bounded = getBoundedData(mockData);
  assert.strictEqual(bounded.length, 7);
});

test("getRowGroupKey formats Architecture section and number", () => {
  const headers = ["Section", "Number", "Revision", "Date"];
  const row = ["10000", "5", "1", "240101"];
  const key = getRowGroupKey(row, "Architecture", headers);
  assert.strictEqual(key, "010000-005");
});

test("computeRowInsertionPlan inserts into existing group", () => {
  const headers = ["Section", "Number", "Revision", "Date", "Title"];
  const boundedData = [
    ["Banner"],
    ["Subtitle"],
    headers,
    ["010000", "001", "001", "240101", "Submittal 1"],
    ["010000", "001", "002", "240102", "Submittal 2"]
  ];
  const newRow = ["010000", "001", "003", "240103", "Submittal 3"];

  const plan = computeRowInsertionPlan(boundedData, headers, newRow, "Architecture");
  assert.strictEqual(plan.targetRowIndex, 5);
  assert.strictEqual(plan.finalRowIndex, 6);
  assert.strictEqual(plan.insertBlankBefore, false);
  assert.strictEqual(plan.insertBlankAfter, false);
});

test("computeRowInsertionPlan creates new group with gap formatting", () => {
  const headers = ["Section", "Number", "Revision", "Date", "Title"];
  const boundedData = [
    ["Banner"],
    ["Subtitle"],
    headers,
    ["010000", "001", "001", "240101", "Submittal 1"]
  ];
  const newRow = ["020000", "001", "001", "240101", "Submittal 2"];

  const plan = computeRowInsertionPlan(boundedData, headers, newRow, "Architecture");
  assert.strictEqual(plan.targetRowIndex, 4);
  assert.strictEqual(plan.insertBlankBefore, true);
  assert.strictEqual(plan.finalRowIndex, 6);
});

test("computeRowInsertionPlan inserts new group between existing groups with gap formatting", () => {
  const headers = ["Section", "Number", "Revision", "Date", "Title"];
  const boundedData = [
    ["Banner"],
    ["Subtitle"],
    headers,
    ["010000", "001", "001", "240101", "Submittal 1"],
    ["030000", "001", "001", "240101", "Submittal 3"]
  ];
  const newRow = ["020000", "001", "001", "240101", "Submittal 2"];

  const plan = computeRowInsertionPlan(boundedData, headers, newRow, "Architecture");
  assert.strictEqual(plan.targetRowIndex, 4);
  assert.strictEqual(plan.insertBlankBefore, true);
  assert.strictEqual(plan.insertBlankAfter, true);
});

test("getRowGroupKey formats FF&E spec tag", () => {
  const headers = ["Spec Tag", "Spec Title", "Vendor", "Revision", "Date"];
  const row = ["CH-01", "Chair", "Herman Miller", "0", "240101"];
  const key = getRowGroupKey(row, "FF&E", headers);
  assert.strictEqual(key, "ch-01");
});

test("getRowSortKey formats FF&E sort key", () => {
  const headers = ["Spec Tag", "Spec Title", "Vendor", "Revision", "Date"];
  const row = ["CH-01", "Chair", "Herman Miller", "1", "240101"];
  const key = getRowSortKey(row, "FF&E", headers);
  assert.strictEqual(key, "ch-01-001-240101");
});

test("computeRowInsertionPlan inserts into existing FF&E group", () => {
  const headers = ["Spec Tag", "Spec Title", "Vendor", "Revision", "Date"];
  const boundedData = [
    ["Banner"],
    ["Subtitle"],
    headers,
    ["CH-01", "Chair", "Herman Miller", "001", "240101"],
    ["CH-01", "Chair", "Herman Miller", "002", "240102"]
  ];
  const newRow = ["CH-01", "Chair", "Herman Miller", "003", "240103"];

  const plan = computeRowInsertionPlan(boundedData, headers, newRow, "FF&E");
  assert.strictEqual(plan.targetRowIndex, 5);
  assert.strictEqual(plan.finalRowIndex, 6);
  assert.strictEqual(plan.insertBlankBefore, false);
  assert.strictEqual(plan.insertBlankAfter, false);
});

test("computeRowInsertionPlan creates new FF&E group with gap formatting", () => {
  const headers = ["Spec Tag", "Spec Title", "Vendor", "Revision", "Date"];
  const boundedData = [
    ["Banner"],
    ["Subtitle"],
    headers,
    ["CH-01", "Chair", "Herman Miller", "001", "240101"]
  ];
  const newRow = ["TB-01", "Table", "Knoll", "001", "240101"];

  const plan = computeRowInsertionPlan(boundedData, headers, newRow, "FF&E");
  assert.strictEqual(plan.targetRowIndex, 4);
  assert.strictEqual(plan.insertBlankBefore, true);
  assert.strictEqual(plan.finalRowIndex, 6);
});
