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
  ERROR_GENERAL: (m: string) => `Error: ${m}`
};

(globalThis as any).CardService = {
  newActionResponseBuilder: () => ({
    setNavigation: (nav: any) => ({
      build: () => ({ navigation: nav })
    })
  }),
  newNavigation: () => ({
    updateCard: (card: any) => ({ card, action: "updateCard" }),
    pushCard: (card: any) => ({ card, action: "pushCard" })
  })
};

(globalThis as any).buildMainCard = (e: any, d: any, tag: any, flashData: any) => ({ cardType: "MainCard", flashData });
(globalThis as any).buildSuccessCard = (...args: any[]) => ({ cardType: "SuccessCard", args });
(globalThis as any).getOrCreateFilingFolder = () => "folder-closed-id";
(globalThis as any).getLocalDrivePath = (id: string) => `G:\\My Drive\\${id}`;
(globalThis as any).manipulatePdf = async () => ({ setName: () => {} });

const mockFile = {
  moveTo: () => {},
  setName: () => {},
  getUrl: () => "http://drive.google.com/file1",
  getId: () => "file-1",
  getBlob: () => ({ copyBlob: () => ({ setName: () => {} }) }),
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

const { ArchitectureSubmittalStrategy } = require("../src/DocumentLogStrategy");
const { executeIncomingWorkflow, executeOutgoingWorkflow } = require("../src/Process");

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
