import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert";

const { GasMockHarness, DocumentFactory, createTestContext, InMemorySheetStorageAdapter } = require("./harness");
const { ArchitectureSubmittalStrategy, FFESubmittalStrategy } = require("../src/DocumentLogStrategy");
const { LogEngine } = require("../src/LogEngine");

beforeEach(() => {
  GasMockHarness.install({
    configOverrides: {
      LOG_HEADER_ROW: 3,
      LOG_SHEET_NAME: "Submittals Log",
      CLOSED_FOLDER_NAME: "Closed"
    }
  });
});

afterEach(() => {
  GasMockHarness.uninstall();
});

test("ArchitectureSubmittalStrategy extracts keys, formats filename and payload", () => {
  const strategy = new ArchitectureSubmittalStrategy();

  const doc = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "GC",
    action: "Submitted",
    notes: "Initial submittal",
    disciplineDetails: {
      section: "033000",
      number: "001",
      title: "Cast-in-Place Concrete",
      revision: "001"
    }
  });

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

test("ArchitectureSubmittalStrategy handles empty section (non-CSI submittal) without leading hyphens", () => {
  const strategy = new ArchitectureSubmittalStrategy();

  const doc = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "GC",
    action: "Submitted",
    notes: "Non-CSI submittal",
    disciplineDetails: {
      section: "",
      number: "001",
      title: "General Submittal",
      revision: "0"
    }
  });

  assert.strictEqual(strategy.getGroupKey(doc), "001");
  assert.strictEqual(strategy.getTargetKey(doc), "001-0");
  assert.strictEqual(strategy.getSortKey(doc), "001-000-20260725");

  const fileName = strategy.getFileName(doc, "GC", " Rev");
  assert.strictEqual(fileName, "001-0 General Submittal - 2026-07-25 GC Rev");

  const headers = ["Section", "Number", "Title", "Revision", "Date", "Contact", "Action", "Status", "Notes", "Link", "Contact History"];
  const rowWithNoSection = ["", "001", "General Submittal", "0", "2026-07-25", "GC", "Submitted", "Open", "", "", "GC"];

  assert.strictEqual(strategy.getTargetKeyFromRow(rowWithNoSection, headers), "001-0");
  assert.strictEqual(strategy.getGroupKeyFromRow(rowWithNoSection, headers), "001");
});

test("LogEngine appends new Architecture document end-to-end with InMemorySheetStorageAdapter", () => {
  const context = createTestContext();
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

  const doc = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "Subcontractor",
    action: "Received",
    notes: "For review",
    disciplineDetails: {
      section: "033000",
      number: "001",
      title: "Concrete Mix",
      revision: "001"
    }
  });

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

  const docRev2 = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "Architect",
    action: "Approved",
    notes: "Approved as noted",
    disciplineDetails: {
      section: "033000",
      number: "001",
      title: "Concrete Mix",
      revision: "001"
    }
  });

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

  const midDoc = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "Mason",
    action: "Received",
    disciplineDetails: {
      section: "020000",
      number: "001",
      title: "Existing Conditions",
      revision: "001"
    }
  });

  const result = engine.appendDocument("test-ss-id", midDoc, strategy, {
    status: "Open"
  });

  const sheetValues = adapter.getSheetValues("Submittals Log");
  assert.strictEqual(sheetValues[3][0], "010000");
  assert.strictEqual(sheetValues[4].every((c: any) => c === ""), true); // Separator gap row
  assert.strictEqual(sheetValues[5][0], "020000");
  assert.strictEqual(result.rowIndex, 6); // 1-based index 6
});

test("FFESubmittalStrategy extracts keys, formats filename and payload", () => {
  const strategy = new FFESubmittalStrategy();

  const doc = DocumentFactory.createValidatedFFESubmittal({
    date: "2026-07-25",
    contact: "Vendor A",
    action: "Received",
    notes: "Sample chair",
    disciplineDetails: {
      specTag: "CH-01",
      specTitle: "Side Chair",
      vendor: "Furniture Co",
      revision: "001",
      relatedTag: "CH-01A"
    }
  });

  assert.strictEqual(strategy.getGroupKey(doc), "ch-01");
  assert.strictEqual(strategy.getTargetKey(doc), "CH-01-001");
  assert.strictEqual(strategy.getSortKey(doc), "ch-01-001-20260725");

  const fileName = strategy.getFileName(doc, "Vendor A", " Rec");
  assert.strictEqual(fileName, "CH-01-001 Furniture Co - 2026-07-25 Vendor A Rec");

  const payload = strategy.formatRowPayload(doc, { link: "http://example.com/ffe.pdf", contactHistory: "Vendor A", status: "Under Review" });
  assert.strictEqual(payload["Spec Tag"], "CH-01");
  assert.strictEqual(payload["Related Tag"], "CH-01A");
  assert.strictEqual(payload["Spec Title"], "Side Chair");
  assert.strictEqual(payload["Vendor"], "Furniture Co");
  assert.strictEqual(payload["Revision"], "001");
  assert.strictEqual(payload["Status"], "Under Review");
  assert.strictEqual(payload["Contact History"], "Vendor A");
  assert.strictEqual(payload["Link"], "http://example.com/ffe.pdf");
});

test("LogEngine appends new FF&E document end-to-end with InMemorySheetStorageAdapter", () => {
  const headers = [
    "Spec Tag", "Related Tag", "Spec Title", "Vendor", "Revision", "Date",
    "Contact", "Action", "Status", "Notes", "Link", "Contact History"
  ];

  const initialLog = [
    ["Project Log Banner"],
    ["Project Submittals Log"],
    headers
  ];

  const adapter = new InMemorySheetStorageAdapter({ "Submittals Log": initialLog });
  const engine = new LogEngine(adapter);
  const strategy = new FFESubmittalStrategy();

  const doc = DocumentFactory.createValidatedFFESubmittal({
    date: "2026-07-25",
    contact: "Vendor A",
    action: "Received",
    notes: "For review",
    disciplineDetails: {
      specTag: "CH-01",
      specTitle: "Side Chair",
      vendor: "Furniture Co",
      revision: "001"
    }
  });

  const result = engine.appendDocument("test-ss-id", doc, strategy, {
    link: "http://drive.google.com/ffe1",
    status: "Under Review",
    actionAbbr: " Rec"
  });

  assert.strictEqual(result.targetKey, "CH-01-001");
  assert.strictEqual(result.contactHistory, "Vendor A");
  assert.strictEqual(result.newFileName, "CH-01-001 Furniture Co - 2026-07-25 Vendor A Rec");
  assert.strictEqual(result.previousRowUpdated, false);
  assert.strictEqual(result.rowIndex, 4);

  const sheetValues = adapter.getSheetValues("Submittals Log");
  assert.strictEqual(sheetValues.length, 4);
  const insertedRow = sheetValues[3];
  assert.strictEqual(insertedRow[0], "CH-01");
  assert.strictEqual(insertedRow[2], "Side Chair");
  assert.strictEqual(insertedRow[3], "Furniture Co");
  assert.strictEqual(insertedRow[4], "001");
  assert.strictEqual(insertedRow[8], "Under Review");
  assert.strictEqual(insertedRow[10], "http://drive.google.com/ffe1");
  assert.strictEqual(insertedRow[11], "Vendor A");
});

test("LogEngine handles FF&E revision workflow by updating previous row status to Closed and chaining contact history", () => {
  const headers = [
    "Spec Tag", "Related Tag", "Spec Title", "Vendor", "Revision", "Date",
    "Contact", "Action", "Status", "Notes", "Link", "Contact History"
  ];

  const initialLog = [
    ["Project Log Banner"],
    ["Project Submittals Log"],
    headers,
    ["CH-01", "", "Side Chair", "Furniture Co", "001", "2026-07-20", "Vendor A", "Received", "Under Review", "", "http://drive.google.com/ffe1", "Vendor A"]
  ];

  const adapter = new InMemorySheetStorageAdapter({ "Submittals Log": initialLog });
  const engine = new LogEngine(adapter);
  const strategy = new FFESubmittalStrategy();

  const docRev2 = DocumentFactory.createValidatedFFESubmittal({
    date: "2026-07-25",
    contact: "Designer",
    action: "Approved",
    notes: "Approved finish",
    disciplineDetails: {
      specTag: "CH-01",
      specTitle: "Side Chair",
      vendor: "Furniture Co",
      revision: "001"
    }
  });

  const result = engine.appendDocument("test-ss-id", docRev2, strategy, {
    link: "http://drive.google.com/ffe2",
    status: "Approved",
    actionAbbr: " Appr",
    updatePreviousStatus: true,
    previousRowStatus: "Closed"
  });

  assert.strictEqual(result.targetKey, "CH-01-001");
  assert.strictEqual(result.contactHistory, "Vendor A Designer");
  assert.strictEqual(result.newFileName, "CH-01-001 Furniture Co - 2026-07-25 Vendor A Designer Appr");
  assert.strictEqual(result.previousRowUpdated, true);

  const sheetValues = adapter.getSheetValues("Submittals Log");
  assert.strictEqual(sheetValues[3][8], "Closed");
  assert.strictEqual(sheetValues[4][8], "Approved");
  assert.strictEqual(sheetValues[4][11], "Vendor A Designer");
});

test("ArchitectureSubmittalStrategy resolves subfolder path segments from CSI divisions", () => {
  (globalThis as any).CSI_DIVISIONS = { "03": "03-Concrete" };

  const strategy = new ArchitectureSubmittalStrategy();

  const docConcrete = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "GC",
    action: "Submitted",
    disciplineDetails: {
      section: "033000",
      number: "001",
      title: "Cast-in-Place Concrete",
      revision: "001"
    }
  });

  const subfolders = strategy.getFilingSubfolders!(docConcrete);
  assert.deepStrictEqual(subfolders, ["Closed", "03-Concrete"]);

  const docFallback = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "GC",
    action: "Submitted",
    disciplineDetails: {
      section: "990000",
      number: "001",
      title: "Unknown Section",
      revision: "001"
    }
  });

  const fallbackSubfolders = strategy.getFilingSubfolders!(docFallback);
  assert.deepStrictEqual(fallbackSubfolders, ["Closed"]);

  const docBlankSection = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "GC",
    action: "Submitted",
    disciplineDetails: {
      section: "",
      number: "001",
      title: "General Requirements",
      revision: "0"
    }
  });

  const blankSectionSubfolders = strategy.getFilingSubfolders!(docBlankSection);
  assert.deepStrictEqual(blankSectionSubfolders, ["Closed"]);

  const docWhitespaceSection = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "GC",
    action: "Submitted",
    disciplineDetails: {
      section: "   ",
      number: "001",
      title: "General Requirements",
      revision: "0"
    }
  });

  const whitespaceSectionSubfolders = strategy.getFilingSubfolders!(docWhitespaceSection);
  assert.deepStrictEqual(whitespaceSectionSubfolders, ["Closed"]);
});

test("FFESubmittalStrategy resolves subfolder path segments from spec tag prefix", () => {
  const strategy = new FFESubmittalStrategy();

  const docWithTag = DocumentFactory.createValidatedFFESubmittal({
    date: "2026-07-25",
    contact: "Vendor A",
    action: "Received",
    disciplineDetails: {
      specTag: "CH-01",
      specTitle: "Side Chair",
      vendor: "Furniture Co",
      revision: "001"
    }
  });

  const subfolders = strategy.getFilingSubfolders!(docWithTag);
  assert.deepStrictEqual(subfolders, ["Closed", "CH"]);

  const docFallback = DocumentFactory.createValidatedFFESubmittal({
    date: "2026-07-25",
    contact: "Vendor A",
    action: "Received",
    disciplineDetails: {
      specTag: "",
      specTitle: "Side Chair",
      vendor: "Furniture Co",
      revision: "001"
    }
  });

  const fallbackSubfolders = strategy.getFilingSubfolders!(docFallback);
  assert.deepStrictEqual(fallbackSubfolders, ["Closed"]);
});

test("LogEngine uses ListDocumentField contact abbreviation in contact history chain across revisions", () => {
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

  const createContactField = (abbr: string, longForm: string): ResolvedListField => ({
    fieldName: "contact",
    storedForm: "abbreviation",
    storedValue: abbr,
    abbreviation: abbr,
    longForm
  });

  const docRev1 = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-20",
    contact: "Subcontractor",
    action: "Received",
    listFields: {
      contact: createContactField("SUB", "Subcontractor"),
      action: { fieldName: "action", storedForm: "longForm", storedValue: "Received", abbreviation: "Rec", longForm: "Received" }
    },
    disciplineDetails: {
      section: "033000",
      number: "001",
      title: "Concrete Mix",
      revision: "001"
    }
  });

  const res1 = engine.appendDocument("test-ss-id", docRev1, strategy, {
    link: "http://drive.google.com/doc1",
    status: "Under Review",
    actionAbbr: " Rec"
  });

  assert.strictEqual(res1.contactHistory, "SUB");

  const docRev2 = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "Architect",
    action: "Approved",
    listFields: {
      contact: createContactField("ARCH", "Architect"),
      action: { fieldName: "action", storedForm: "longForm", storedValue: "Approved", abbreviation: "Appr", longForm: "Approved" }
    },
    disciplineDetails: {
      section: "033000",
      number: "001",
      title: "Concrete Mix",
      revision: "001"
    }
  });

  const res2 = engine.appendDocument("test-ss-id", docRev2, strategy, {
    link: "http://drive.google.com/doc2",
    status: "Approved",
    actionAbbr: " Appr",
    updatePreviousStatus: true,
    previousRowStatus: "Closed"
  });

  assert.strictEqual(res2.contactHistory, "SUB ARCH");
  assert.strictEqual(res2.newFileName, "033000-001-001 Concrete Mix - 2026-07-25 SUB ARCH Appr");

  const sheetValues = adapter.getSheetValues("Submittals Log");
  assert.strictEqual(sheetValues[4][10], "SUB ARCH");
});


test("LogEngine handles empty contact abbreviation without trailing or leading whitespace in chain", () => {
  const headers = [
    "Section", "Number", "Title", "Revision", "Date",
    "Contact", "Action", "Status", "Notes", "Link", "Contact History"
  ];

  const initialLog = [
    ["Project Log Banner"],
    ["Project Submittals Log"],
    headers,
    ["033000", "001", "Concrete Mix", "001", "2026-07-20", "Subcontractor", "Received", "Under Review", "", "http://drive.google.com/doc1", "SUB"]
  ];

  const adapter = new InMemorySheetStorageAdapter({ "Submittals Log": initialLog });
  const engine = new LogEngine(adapter);
  const strategy = new ArchitectureSubmittalStrategy();

  const docNoContact = DocumentFactory.createValidatedArchitectureSubmittal({
    date: "2026-07-25",
    contact: "",
    action: "Approved",
    listFields: {
      contact: { fieldName: "contact", storedForm: "abbreviation", storedValue: "", abbreviation: "", longForm: "" },
      action: { fieldName: "action", storedForm: "longForm", storedValue: "Approved", abbreviation: "Appr", longForm: "Approved" }
    },
    disciplineDetails: {
      section: "033000",
      number: "001",
      title: "Concrete Mix",
      revision: "001"
    }
  });

  const res = engine.appendDocument("test-ss-id", docNoContact, strategy, {
    link: "http://drive.google.com/doc2",
    status: "Approved",
    actionAbbr: " Appr"
  });

  assert.strictEqual(res.contactHistory, "SUB");
});
