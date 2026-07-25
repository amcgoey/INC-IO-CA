import test from "node:test";
import assert from "node:assert";

// Global ambient CONFIG mock for Node runner
(global as any).CONFIG = { LOG_HEADER_ROW: 1 };

const { getBoundedData, getRowGroupKey, computeRowInsertionPlan } = require("../src/RowPositionCalculator");

test("getBoundedData stops after 3 consecutive empty rows", () => {
  const headers = ["Section", "Number", "Revision", "Date", "Title", "Contact", "Action", "Notes"];
  const mockData = [
    ["Project Log Header"],
    headers,
    ["010000", "001", "001", "240101", "Submittal 1", "John", "Received", "Notes 1"],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["020000", "001", "001", "240101", "Submittal 2", "Jane", "Received", "Notes 2"]
  ];

  const bounded = getBoundedData(mockData);
  assert.strictEqual(bounded.length, 6);
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
    ["Header"],
    headers,
    ["010000", "001", "001", "240101", "Submittal 1"],
    ["010000", "001", "002", "240102", "Submittal 2"]
  ];
  const newRow = ["010000", "001", "003", "240103", "Submittal 3"];

  const plan = computeRowInsertionPlan(boundedData, headers, newRow, "Architecture");
  assert.strictEqual(plan.targetRowIndex, 4);
  assert.strictEqual(plan.finalRowIndex, 5);
  assert.strictEqual(plan.insertBlankBefore, false);
  assert.strictEqual(plan.insertBlankAfter, false);
});

test("computeRowInsertionPlan creates new group with gap formatting", () => {
  const headers = ["Section", "Number", "Revision", "Date", "Title"];
  const boundedData = [
    ["Header"],
    headers,
    ["010000", "001", "001", "240101", "Submittal 1"]
  ];
  const newRow = ["020000", "001", "001", "240101", "Submittal 2"];

  const plan = computeRowInsertionPlan(boundedData, headers, newRow, "Architecture");
  assert.strictEqual(plan.targetRowIndex, 3);
  assert.strictEqual(plan.insertBlankBefore, true);
  assert.strictEqual(plan.finalRowIndex, 5);
});
