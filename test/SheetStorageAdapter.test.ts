import test from "node:test";
import assert from "node:assert";

const { InMemorySheetStorageAdapter } = require("../src/SheetStorageAdapter");

test("InMemorySheetStorageAdapter initializes with initial sheets data", () => {
  const initialData = {
    "Submittals Log": [
      ["Banner"],
      ["Header 1", "Header 2"],
      ["Val 1", "Val 2"]
    ]
  };

  const adapter = new InMemorySheetStorageAdapter(initialData);
  const values = adapter.getSheetValues("Submittals Log");

  assert.strictEqual(values.length, 3);
  assert.deepStrictEqual(values[2], ["Val 1", "Val 2"]);
});

test("InMemorySheetStorageAdapter getRangeValue and setRangeValue handle 1-based indexing", () => {
  const adapter = new InMemorySheetStorageAdapter();

  adapter.setRangeValue("Sheet1", 1, 1, "TopLeft");
  adapter.setRangeValue("Sheet1", 3, 2, "Row3Col2");

  assert.strictEqual(adapter.getRangeValue("Sheet1", 1, 1), "TopLeft");
  assert.strictEqual(adapter.getRangeValue("Sheet1", 3, 2), "Row3Col2");
  assert.strictEqual(adapter.getRangeValue("Sheet1", 2, 1), "");
});

test("InMemorySheetStorageAdapter insertRowBefore and insertRowAfter shift rows correctly", () => {
  const adapter = new InMemorySheetStorageAdapter({
    "Log": [
      ["Row 1"],
      ["Row 2"],
      ["Row 3"]
    ]
  });

  // Insert before row 2 (1-based row 2) -> insert blank row between Row 1 and Row 2
  adapter.insertRowBefore("Log", 2);
  let values = adapter.getSheetValues("Log");
  assert.strictEqual(values.length, 4);
  assert.deepStrictEqual(values[0], ["Row 1"]);
  assert.strictEqual(values[1].every(c => c === ""), true);
  assert.deepStrictEqual(values[2], ["Row 2"]);

  // Insert after row 3 (1-based row 3 = index 2 in array before shift, index 3 now)
  adapter.insertRowAfter("Log", 3);
  values = adapter.getSheetValues("Log");
  assert.strictEqual(values.length, 5);
  assert.strictEqual(values[3].every(c => c === ""), true);
  assert.deepStrictEqual(values[4], ["Row 3"]);
});

test("InMemorySheetStorageAdapter insertColumnAfter inserts blank column across all rows", () => {
  const adapter = new InMemorySheetStorageAdapter({
    "Log": [
      ["A1", "B1"],
      ["A2", "B2"]
    ]
  });

  // Insert column after col 1 (A)
  adapter.insertColumnAfter("Log", 1);
  const values = adapter.getSheetValues("Log");

  assert.deepStrictEqual(values[0], ["A1", "", "B1"]);
  assert.deepStrictEqual(values[1], ["A2", "", "B2"]);
});

test("InMemorySheetStorageAdapter insertLogRow executes RowInsertionPlan with gaps", () => {
  const headers = ["Section", "Number", "Revision", "Title"];
  const initialLog = [
    ["Banner"],
    ["Subtitle"],
    headers,
    ["010000", "001", "001", "Submittal 1"]
  ];

  const adapter = new InMemorySheetStorageAdapter({ "Submittals Log": initialLog });

  // Plan to insert a new group at targetRowIndex 4 with insertBlankBefore = true
  const plan = {
    targetRowIndex: 4,
    insertBlankBefore: true,
    insertBlankAfter: false,
    finalRowIndex: 6
  };

  const newRowData = ["020000", "001", "001", "Submittal 2"];
  const result = adapter.insertLogRow("Submittals Log", headers, newRowData, plan);

  assert.strictEqual(result.rowIndex, 6);
  assert.deepStrictEqual(result.failedColumns, []);

  const values = adapter.getSheetValues("Submittals Log");
  assert.strictEqual(values.length, 6);
  assert.deepStrictEqual(values[3], ["010000", "001", "001", "Submittal 1"]);
  assert.strictEqual(values[4].every(c => c === ""), true); // Blank row inserted before new group
  assert.deepStrictEqual(values[5], ["020000", "001", "001", "Submittal 2"]);
});
