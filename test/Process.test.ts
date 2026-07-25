import test from "node:test";
import assert from "node:assert";

// Set up global mocks for GAS environments before requiring Process.ts
(globalThis as any).CSI_DIVISIONS = { "03": "03-Concrete" };
(globalThis as any).CONFIG = {
  LOG_HEADER_ROW: 3,
  LOG_SHEET_NAME: "Submittals Log",
  STAMPED_FILE_PREFIX: "STAMPED_",
  TRANSMITTAL_TEMPLATE_ID: "tmpl-1",
  PDF_TEMPLATE_ID: "tmpl-2"
};

(globalThis as any).MESSAGES = {
  ERROR_GENERAL: (m: string) => `Error: ${m}`,
  SUCCESS_MOVED: (f: string) => `Moved to ${f}`
};

(globalThis as any).CardService = {
  newActionResponseBuilder: () => {
    let resNav: any = null, resNotif: any = null;
    const builder: any = {
      setNavigation: (nav: any) => { resNav = nav; return builder; },
      setNotification: (notif: any) => { resNotif = notif; return builder; },
      build: () => ({ navigation: resNav, notification: resNotif })
    };
    return builder;
  },
  newNotification: () => ({
    setText: (t: string) => t
  }),
  newNavigation: () => ({
    updateCard: (card: any) => ({ card, action: "updateCard" }),
    pushCard: (card: any) => ({ card, action: "pushCard" })
  })
};

const { FakePdfDocumentService, defaultPdfDocumentService } = require("../src/PdfDocumentService");
const { FakeDriveFilingRepository } = require("../src/DriveFilingRepository");

(globalThis as any).buildMainCard = (e: any, d: any, tag: any, flashData: any) => ({ cardType: "MainCard", flashData });
(globalThis as any).buildSuccessCard = (...args: any[]) => ({ cardType: "SuccessCard", args });
(globalThis as any).getOrCreateFilingFolder = () => "folder-closed-id";
const mockDriveFilingRepo = new FakeDriveFilingRepository();
(globalThis as any).defaultDriveFilingRepository = mockDriveFilingRepo;

const mockFakePdfService = new FakePdfDocumentService();
(globalThis as any).defaultPdfDocumentService = mockFakePdfService;

const mockFile = {
  moveTo: () => {},
  setName: () => {},
  getUrl: () => "http://drive.google.com/file1",
  getId: () => "file-1",
  getBlob: () => ({ copyBlob: () => ({ setName: () => {} }), setName: () => {} }),
  getParents: () => ({ hasNext: () => false })
};

const mockFolder: any = {
  getFoldersByName: () => ({ hasNext: () => false }),
  createFolder: () => mockFolder,
  createFile: () => mockFile,
  getId: () => "folder-closed-id",
  getName: () => "Closed"
};

(globalThis as any).DriveApp = {
  getFolderById: () => mockFolder,
  getFileById: () => mockFile
};

const { ArchitectureSubmittalStrategy, FFESubmittalStrategy } = require("../src/DocumentLogStrategy");
const { executeIncomingWorkflow, executeOutgoingWorkflow, moveSubmittalToClosed } = require("../src/Process");

test("executeIncomingWorkflow for Architecture delegates logging to defaultLogRepository.appendDocument", async () => {
  let appendCalled = false;
  let passedOptions: any = null;

  (globalThis as any).defaultLogRepository = {
    appendDocument: (ssId: string, doc: any, strategy: any, options: any) => {
      appendCalled = true;
      passedOptions = options;
      assert.strictEqual(ssId, "log-ss-123");
      assert.ok(strategy instanceof ArchitectureSubmittalStrategy);
      return {
        targetKey: "033000-001-001",
        newFileName: "033000-001-001 Concrete - 2026-07-25 GC Rec",
        contactHistory: "GC",
        rowIndex: 5,
        failedColumns: [],
        previousRowUpdated: false
      };
    }
  };

  const fakeSheet = { getSheetId: () => 101 };

  const ctx = {
    e: {},
    form: { action: "Received", title: "Concrete", date: "2026-07-25" },
    p: { logFileId: "log-ss-123", targetFolderId: "folder-target", driveFileId: "file-1", projectAbbr: "PROJ" },
    discipline: "Architecture",
    logSheet: fakeSheet,
    headers: ["Section", "Number", "Title", "Link"],
    getColIdx: (name: string) => 0,
    selectedAction: { status: "Under Review", abbr: " Rec" },
    sectionVal: "033000",
    numberVal: "001",
    revisionVal: "001",
    emptyFallbacks: [],
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { discipline: "Architecture", section: "033000", number: "001", title: "Concrete", revision: "001" }
    }
  };

  const result = await executeIncomingWorkflow(ctx);
  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Under Review");
  assert.strictEqual(passedOptions.actionAbbr, " Rec");
  assert.strictEqual(passedOptions.link, "http://drive.google.com/file1");

  assert.strictEqual(result.navigation.card.flashData.targetKey, "033000-001-001");
  assert.strictEqual(result.navigation.card.flashData.newFileName, "033000-001-001 Concrete - 2026-07-25 GC Rec");
  assert.ok(result.navigation.card.flashData.directRowUrl.includes("range=A5"));
});

test("executeOutgoingWorkflow for Architecture delegates logging to defaultLogRepository.appendDocument with status update", async () => {
  let appendCalled = false;
  let passedOptions: any = null;

  (globalThis as any).defaultLogRepository = {
    appendDocument: (ssId: string, doc: any, strategy: any, options: any) => {
      appendCalled = true;
      passedOptions = options;
      assert.strictEqual(ssId, "log-ss-456");
      assert.ok(strategy instanceof ArchitectureSubmittalStrategy);
      return {
        targetKey: "033000-001-002",
        newFileName: "033000-001-002 Concrete - 2026-07-25 Architect Rev",
        contactHistory: "GC Architect",
        rowIndex: 6,
        failedColumns: [],
        previousRowUpdated: true
      };
    }
  };

  const fakeSheet = { getSheetId: () => 202 };

  const ctx = {
    form: { action: "Approved", title: "Concrete", date: "2026-07-25" },
    p: { logFileId: "log-ss-456", targetFolderId: "folder-target", driveFileId: "file-1", projectAbbr: "PROJ" },
    discipline: "Architecture",
    logSheet: fakeSheet,
    headers: ["Section", "Number", "Title", "Link"],
    getColIdx: (name: string) => 0,
    selectedAction: { status: "Closed", abbr: " Rev" },
    sectionVal: "033000",
    numberVal: "001",
    revisionVal: "002",
    emptyFallbacks: [],
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "Architect",
      action: "Approved",
      disciplineDetails: { discipline: "Architecture", section: "033000", number: "001", title: "Concrete", revision: "002" }
    }
  };

  const result = await executeOutgoingWorkflow(ctx);
  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Closed");
  assert.strictEqual(passedOptions.actionAbbr, " Rev");
  assert.strictEqual(passedOptions.updatePreviousStatus, true);
  assert.strictEqual(passedOptions.previousRowStatus, "Closed");
  assert.strictEqual(result.navigation.action, "pushCard");
});

test("executeIncomingWorkflow for FF&E delegates logging to defaultLogRepository.appendDocument", async () => {
  let appendCalled = false;
  let passedOptions: any = null;

  (globalThis as any).defaultLogRepository = {
    appendDocument: (ssId: string, doc: any, strategy: any, options: any) => {
      appendCalled = true;
      passedOptions = options;
      assert.strictEqual(ssId, "log-ss-789");
      assert.ok(strategy instanceof FFESubmittalStrategy);
      return {
        targetKey: "CH-01-001",
        newFileName: "CH-01-001 Furniture Co - 2026-07-25 Vendor A Rec",
        contactHistory: "Vendor A",
        rowIndex: 7,
        failedColumns: [],
        previousRowUpdated: false
      };
    }
  };

  const fakeSheet = { getSheetId: () => 303 };

  const ctx = {
    e: {},
    form: { action: "Received", specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", date: "2026-07-25" },
    p: { logFileId: "log-ss-789", targetFolderId: "folder-target", driveFileId: "file-1", projectAbbr: "PROJ" },
    discipline: "FF&E",
    logSheet: fakeSheet,
    headers: ["Spec Tag", "Spec Title", "Vendor", "Link"],
    getColIdx: (name: string) => 0,
    selectedAction: { status: "Under Review", abbr: " Rec" },
    emptyFallbacks: [],
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "Vendor A",
      action: "Received",
      disciplineDetails: { discipline: "FF&E", specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", revision: "001" }
    }
  };

  const result = await executeIncomingWorkflow(ctx);
  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Under Review");
  assert.strictEqual(passedOptions.actionAbbr, " Rec");
  assert.strictEqual(passedOptions.link, "http://drive.google.com/file1");

  assert.strictEqual(result.navigation.card.flashData.targetKey, "CH-01-001");
  assert.strictEqual(result.navigation.card.flashData.newFileName, "CH-01-001 Furniture Co - 2026-07-25 Vendor A Rec");
  assert.ok(result.navigation.card.flashData.directRowUrl.includes("range=A7"));
});

test("executeOutgoingWorkflow for FF&E delegates logging to defaultLogRepository.appendDocument with status update", async () => {
  let appendCalled = false;
  let passedOptions: any = null;

  (globalThis as any).defaultLogRepository = {
    appendDocument: (ssId: string, doc: any, strategy: any, options: any) => {
      appendCalled = true;
      passedOptions = options;
      assert.strictEqual(ssId, "log-ss-999");
      assert.ok(strategy instanceof FFESubmittalStrategy);
      return {
        targetKey: "CH-01-001",
        newFileName: "CH-01-001 Furniture Co - 2026-07-25 Vendor A Designer Appr",
        contactHistory: "Vendor A Designer",
        rowIndex: 8,
        failedColumns: [],
        previousRowUpdated: true
      };
    }
  };

  const fakeSheet = { getSheetId: () => 404 };

  const ctx = {
    form: { action: "Approved", specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", date: "2026-07-25" },
    p: { logFileId: "log-ss-999", targetFolderId: "folder-target", driveFileId: "file-1", projectAbbr: "PROJ" },
    discipline: "FF&E",
    logSheet: fakeSheet,
    headers: ["Spec Tag", "Spec Title", "Vendor", "Link"],
    getColIdx: (name: string) => 0,
    selectedAction: { status: "Approved", abbr: " Appr" },
    emptyFallbacks: [],
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "Designer",
      action: "Approved",
      disciplineDetails: { discipline: "FF&E", specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", revision: "001" }
    }
  };

  const result = await executeOutgoingWorkflow(ctx);
  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Approved");
  assert.strictEqual(passedOptions.actionAbbr, " Appr");
  assert.strictEqual(passedOptions.updatePreviousStatus, true);
  assert.strictEqual(passedOptions.previousRowStatus, "Closed");
  assert.strictEqual(result.navigation.action, "pushCard");
});

test("moveSubmittalToClosed delegates local path resolution to defaultDriveFilingRepository.getLocalPath", () => {
  mockDriveFilingRepo.calls = [];
  const event = {
    parameters: {
      targetFolderId: "target-folder-1",
      discipline: "Architecture",
      section: "033000",
      specTag: "",
      fileId: "file-closed-123",
      newFileName: "033000-001 Concrete",
      fileUrl: "http://drive.google.com/file-closed-123",
      stampSubNo: "033000-001-001",
      itemTitle: "Concrete",
      logFileId: "log-123",
      projectAbbr: "PROJ",
      action: "Approved",
      incomingRouting: "To Review",
      directRowUrl: "http://docs.google.com/sheet",
      failedColumns: "[]",
      emptyFallbacks: "[]"
    }
  };

  const res = moveSubmittalToClosed(event as any);
  assert.ok(mockDriveFilingRepo.calls.includes("file-closed-123"));
  assert.strictEqual(res.navigation.card.args[3], "G:\\My Drive\\FakePath\\file-closed-123");
});
