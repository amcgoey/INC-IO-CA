import test from "node:test";
import assert from "node:assert";

// Global stub for CONFIG matching production Config.ts (LOG_HEADER_ROW: 3)
(globalThis as any).CONFIG = {
  LOG_HEADER_ROW: 3,
  LOG_SHEET_NAME: "Submittals Log"
};

const { InMemorySheetStorageAdapter } = require("../src/SheetStorageAdapter");
const { ArchitectureSubmittalStrategy } = require("../src/DocumentLogStrategy");
const { LogEngine } = require("../src/LogEngine");

test("ArchitectureSubmittalStrategy extracts keys, formats filename and payload", () => {
  const strategy = new ArchitectureSubmittalStrategy();

  const doc: ValidatedDocument = {
    documentType: "Submittal",
    date: "2026-07-25",
    contact: "GC",
    action: "Submitted",
    notes: "Initial submittal",
    disciplineDetails: {
      discipline: "Architecture",
      section: "033000",
      number: "001",
      title: "Cast-in-Place Concrete",
      revision: "001"
    }
  };

  assert.strictEqual(strategy.getGroupKey(doc), "033000-001");
  assert.strictEqual(strategy.getTargetKey(doc), "033000-001-001");
  assert.strictEqual(strategy.getSortKey(doc), "033000-001-001-20260725");

  const fileName = strategy.getFileName(doc, "GC", " Rev");
  assert.strictEqual(fileName, "033000-001-001 Cast-in-Place Concrete - 2026-07-25 GC Rev");

  const payload = strategy.formatRowPayload(doc, { link: "http://example.com/file.pdf", contactHistory: "GC", status: "Open" });
  assert.strictEqual(payload["Section"], "033000");
  assert.strictEqual(payload["Number"], "001");
  assert.strictEqual(payload["Title"], "Cast-in-Place Concrete");
  assert.strictEqual(payload["Revision"], "001");
  assert.strictEqual(payload["Status"], "Open");
  assert.strictEqual(payload["Contact History"], "GC");
  assert.strictEqual(payload["Link"], "http://example.com/file.pdf");
});

test("LogEngine appends new Architecture document end-to-end with InMemorySheetStorageAdapter", () => {
  const headers = [
    "Section", "Number", "Title", "Revision", "Date",
    "Contact", "Action", "Status", "Notes", "Link", "Contact History"
  ];

  const initialLog = [
    ["Project Log Banner"],
    ["Project Submittals Log"],
    headers
  ];

  const adapter = new InMemorySheetStorageAdapter({ "Submittals Log": initialLog });
  const engine = new LogEngine(adapter);
  const strategy = new ArchitectureSubmittalStrategy();

  const doc: ValidatedDocument = {
    documentType: "Submittal",
    date: "2026-07-25",
    contact: "Subcontractor",
    action: "Received",
    notes: "For review",
    disciplineDetails: {
      discipline: "Architecture",
      section: "033000",
      number: "001",
      title: "Concrete Mix",
      revision: "001"
    }
  };

  const result = engine.appendDocument("test-ss-id", doc, strategy, {
    link: "http://drive.google.com/doc1",
    status: "Under Review",
    actionAbbr: " Rec"
  });

  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(result.contactHistory, "Subcontractor");
  assert.strictEqual(result.newFileName, "033000-001-001 Concrete Mix - 2026-07-25 Subcontractor Rec");
  assert.strictEqual(result.previousRowUpdated, false);
  assert.strictEqual(result.rowIndex, 4);

  const sheetValues = adapter.getSheetValues("Submittals Log");
  assert.strictEqual(sheetValues.length, 4);
  const insertedRow = sheetValues[3];
  assert.strictEqual(insertedRow[0], "033000"); // Section
  assert.strictEqual(insertedRow[1], "001");    // Number
  assert.strictEqual(insertedRow[2], "Concrete Mix"); // Title
  assert.strictEqual(insertedRow[3], "001");    // Revision
  assert.strictEqual(insertedRow[5], "Subcontractor"); // Contact
  assert.strictEqual(insertedRow[7], "Under Review"); // Status
  assert.strictEqual(insertedRow[9], "http://drive.google.com/doc1"); // Link
  assert.strictEqual(insertedRow[10], "Subcontractor"); // Contact History
});

test("LogEngine handles revision workflow by updating previous row status and chaining contact history", () => {
  const headers = [
    "Section", "Number", "Title", "Revision", "Date",
    "Contact", "Action", "Status", "Notes", "Link", "Contact History"
  ];

  const initialLog = [
    ["Project Log Banner"],
    ["Project Submittals Log"],
    headers,
    ["033000", "001", "Concrete Mix", "001", "2026-07-20", "Subcontractor", "Received", "Under Review", "", "http://drive.google.com/doc1", "Subcontractor"]
  ];

  const adapter = new InMemorySheetStorageAdapter({ "Submittals Log": initialLog });
  const engine = new LogEngine(adapter);
  const strategy = new ArchitectureSubmittalStrategy();

  const docRev2: ValidatedDocument = {
    documentType: "Submittal",
    date: "2026-07-25",
    contact: "Architect",
    action: "Approved",
    notes: "Approved as noted",
    disciplineDetails: {
      discipline: "Architecture",
      section: "033000",
      number: "001",
      title: "Concrete Mix",
      revision: "001"
    }
  };

  const result = engine.appendDocument("test-ss-id", docRev2, strategy, {
    link: "http://drive.google.com/doc2",
    status: "Approved",
    actionAbbr: " Appr",
    updatePreviousStatus: true,
    previousRowStatus: "Closed"
  });

  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(result.contactHistory, "Subcontractor Architect");
  assert.strictEqual(result.newFileName, "033000-001-001 Concrete Mix - 2026-07-25 Subcontractor Architect Appr");
  assert.strictEqual(result.previousRowUpdated, true);

  const sheetValues = adapter.getSheetValues("Submittals Log");
  assert.strictEqual(sheetValues[3][7], "Closed"); // Previous row status updated to Closed
  assert.strictEqual(sheetValues[4][7], "Approved"); // New row status
  assert.strictEqual(sheetValues[4][10], "Subcontractor Architect"); // Contact History chained
});

test("LogEngine correctly inserts new groups with gap formatting in sorted order", () => {
  const headers = [
    "Section", "Number", "Title", "Revision", "Date",
    "Contact", "Action", "Status", "Notes", "Link", "Contact History"
  ];

  const initialLog = [
    ["Banner"],
    ["Submittals Log"],
    headers,
    ["010000", "001", "General Requirements", "001", "2026-07-01", "GC", "Received", "Open", "", "", "GC"],
    ["030000", "001", "Concrete", "001", "2026-07-01", "Sub", "Received", "Open", "", "", "Sub"]
  ];

  const adapter = new InMemorySheetStorageAdapter({ "Submittals Log": initialLog });
  const engine = new LogEngine(adapter);
  const strategy = new ArchitectureSubmittalStrategy();

  const midDoc: ValidatedDocument = {
    documentType: "Submittal",
    date: "2026-07-25",
    contact: "Mason",
    action: "Received",
    disciplineDetails: {
      discipline: "Architecture",
      section: "020000",
      number: "001",
      title: "Existing Conditions",
      revision: "001"
    }
  };

  const result = engine.appendDocument("test-ss-id", midDoc, strategy, {
    status: "Open"
  });

  const sheetValues = adapter.getSheetValues("Submittals Log");
  // 010000 group is at row index 3 (0-based)
  // Blank separator inserted, then 020000 inserted at row index 5 (0-based)
  assert.strictEqual(sheetValues[3][0], "010000");
  assert.strictEqual(sheetValues[4].every((c: any) => c === ""), true); // Separator gap row
  assert.strictEqual(sheetValues[5][0], "020000");
  assert.strictEqual(result.rowIndex, 6); // 1-based index 6
});
