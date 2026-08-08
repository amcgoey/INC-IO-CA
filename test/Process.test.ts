import test from "node:test";
import assert from "node:assert";

// Set up global mocks for GAS environments before requiring Process.ts
(globalThis as any).CSI_DIVISIONS = { "03": "03-Concrete" };
(globalThis as any).CONFIG = {
  LOG_HEADER_ROW: 3,
  LOG_SHEET_NAME: "Submittals Log",
  STAMPED_FILE_PREFIX: "STAMPED_",
  TRANSMITTAL_TEMPLATE_ID: "tmpl-1",
  PDF_TEMPLATE_ID: "tmpl-2",
  DEFAULT_DISCIPLINE: "Architecture"
};

(globalThis as any).MESSAGES = {
  ERROR_GENERAL: (m: string) => `Error: ${m}`,
  SUCCESS_MOVED: (f: string) => `Moved to ${f}`,
  ERROR_NO_LOG: "No log file specified"
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

const mockSheet = { getSheetId: () => 101 };
(globalThis as any).SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => mockSheet
  })
};

const { defaultPdfDocumentService } = require("../src/PdfDocumentService");
const { FakePdfDocumentService } = require("./harness/index");
const { FakeDriveFilingRepository } = require("./harness/index");

(globalThis as any).buildMainCard = (e: any, d: any, tag: any, flashData: any) => ({ cardType: "MainCard", flashData });
(globalThis as any).buildSuccessCard = (...args: any[]) => ({ cardType: "SuccessCard", args });
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

const { DocumentWorkflowModule, getActionPolicy } = require("../src/core/workflow/DocumentWorkflowModule");
(globalThis as any).DocumentWorkflowModule = DocumentWorkflowModule;
(globalThis as any).getActionPolicy = getActionPolicy;
const { ArchitectureSubmittalStrategy, FFESubmittalStrategy } = require("../src/DocumentLogStrategy");

const defaultRepoMock = {
  verifyAndFormatLogSheet: () => ["Section", "Number", "Title", "Link"],
  getLogSettings: () => ({
    actions: [
      { action: "Received", abbr: " Rec", status: "Under Review" },
      { action: "Approved", abbr: " Rev", status: "Closed" }
    ],
    ffeTags: { tags: ["CH-01"], vendors: ["Furniture Co"], tagMap: {} }
  }),
  appendDocument: (ssId: string, doc: any, strategy: any, options: any) => ({
    targetKey: "033000-001-001",
    newFileName: "033000-001-001 Concrete - 2026-07-25 GC Rec",
    contactHistory: "GC",
    rowIndex: 5,
    failedColumns: [],
    previousRowUpdated: false
  })
};
(globalThis as any).defaultLogRepository = defaultRepoMock;

const { CardPresenter, defaultCardPresenter } = require("../src/adapters/gas/CardPresenter");
const { processSubmission, moveSubmittalToClosed } = require("../src/Process");

test("processSubmission for Architecture incoming action delegates to DocumentWorkflowModule and updates main card", async () => {
  let appendCalled = false;
  let passedOptions: any = null;

  (globalThis as any).defaultLogRepository = {
    ...defaultRepoMock,
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

  const event = {
    formInput: {
      action: "Received",
      discipline: "Architecture",
      section: "033000",
      submittalNum: "001",
      revNum: "001",
      title: "Concrete",
      date: "2026-07-25",
      contact: "GC",
      incomingRouting: "To Review"
    },
    parameters: {
      logFileId: "log-ss-123",
      targetFolderId: "folder-target",
      driveFileId: "file-1",
      projectAbbr: "PROJ"
    }
  };

  const result = await processSubmission(event as any);
  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Under Review");
  assert.strictEqual(passedOptions.actionAbbr, " Rec");
  assert.strictEqual(passedOptions.link, "https://drive.google.com/file-1");

  assert.strictEqual(result.navigation.action, "updateCard");
  assert.strictEqual(result.navigation.card.flashData.targetKey, "033000-001-001");
  assert.strictEqual(result.navigation.card.flashData.newFileName, "033000-001-001 Concrete - 2026-07-25 GC Rec");
  assert.ok(result.navigation.card.flashData.directRowUrl.includes("range=A5"));
});

test("processSubmission for Architecture outgoing action delegates to DocumentWorkflowModule and pushes success card", async () => {
  let appendCalled = false;
  let passedOptions: any = null;

  (globalThis as any).defaultLogRepository = {
    ...defaultRepoMock,
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

  const event = {
    formInput: {
      action: "Approved",
      discipline: "Architecture",
      section: "033000",
      submittalNum: "001",
      revNum: "002",
      title: "Concrete",
      date: "2026-07-25",
      contact: "Architect"
    },
    parameters: {
      logFileId: "log-ss-456",
      targetFolderId: "folder-target",
      driveFileId: "file-1",
      projectAbbr: "PROJ"
    }
  };

  const result = await processSubmission(event as any);
  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Closed");
  assert.strictEqual(passedOptions.actionAbbr, " Rev");
  assert.strictEqual(passedOptions.updatePreviousStatus, true);
  assert.strictEqual(passedOptions.previousRowStatus, "Closed");
  assert.strictEqual(result.navigation.action, "pushCard");
  assert.strictEqual(result.navigation.card.args[0], "file-1");
  assert.strictEqual(result.navigation.card.args[1], "033000-001-002 Concrete - 2026-07-25 Architect Rev");
  assert.strictEqual(result.navigation.card.args[4], "033000-001-002");
});

test("processSubmission for FF&E incoming action delegates to DocumentWorkflowModule and updates main card", async () => {
  let appendCalled = false;
  let passedOptions: any = null;

  (globalThis as any).defaultLogRepository = {
    ...defaultRepoMock,
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

  const event = {
    formInput: {
      action: "Received",
      discipline: "FF&E",
      specTag: "CH-01",
      specTitle: "Side Chair",
      vendor: "Furniture Co",
      date: "2026-07-25",
      contact: "Vendor A",
      incomingRouting: "To Review"
    },
    parameters: {
      logFileId: "log-ss-789",
      targetFolderId: "folder-target",
      driveFileId: "file-1",
      projectAbbr: "PROJ"
    }
  };

  const result = await processSubmission(event as any);
  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Under Review");
  assert.strictEqual(passedOptions.actionAbbr, " Rec");
  assert.strictEqual(passedOptions.link, "https://drive.google.com/file-1");

  assert.strictEqual(result.navigation.action, "updateCard");
  assert.strictEqual(result.navigation.card.flashData.targetKey, "CH-01-001");
  assert.strictEqual(result.navigation.card.flashData.newFileName, "CH-01-001 Furniture Co - 2026-07-25 Vendor A Rec");
  assert.ok(result.navigation.card.flashData.directRowUrl.includes("range=A7"));
});

test("processSubmission for FF&E outgoing action delegates to DocumentWorkflowModule and pushes success card", async () => {
  let appendCalled = false;
  let passedOptions: any = null;

  (globalThis as any).defaultLogRepository = {
    ...defaultRepoMock,
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

  const event = {
    formInput: {
      action: "Approved",
      discipline: "FF&E",
      specTag: "CH-01",
      specTitle: "Side Chair",
      vendor: "Furniture Co",
      date: "2026-07-25",
      contact: "Designer"
    },
    parameters: {
      logFileId: "log-ss-999",
      targetFolderId: "folder-target",
      driveFileId: "file-1",
      projectAbbr: "PROJ"
    }
  };

  const result = await processSubmission(event as any);
  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Closed");
  assert.strictEqual(passedOptions.actionAbbr, " Rev");
  assert.strictEqual(passedOptions.updatePreviousStatus, true);
  assert.strictEqual(passedOptions.previousRowStatus, "Closed");
  assert.strictEqual(result.navigation.action, "pushCard");
  assert.strictEqual(result.navigation.card.args[0], "file-1");
  assert.strictEqual(result.navigation.card.args[4], "CH-01-001");
});

test("moveSubmittalToClosed delegates file move and subfolder path resolution to defaultDriveFilingRepository for Architecture", () => {
  mockDriveFilingRepo.filedDocuments = [];
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
  assert.strictEqual(mockDriveFilingRepo.filedDocuments.length, 1);
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "03-Concrete"]);
  assert.strictEqual(res.navigation.card.args[3], "G:\\My Drive\\FakePath\\file-closed-123");
});

test("moveSubmittalToClosed files directly under Closed root folder when section is blank (non-CSI project)", () => {
  mockDriveFilingRepo.filedDocuments = [];
  const event = {
    parameters: {
      targetFolderId: "target-folder-noncsi",
      discipline: "Architecture",
      section: "",
      fileId: "file-closed-noncsi-789",
      newFileName: "001-0 General Requirements",
      fileUrl: "http://drive.google.com/file-closed-noncsi-789",
      stampSubNo: "001-0",
      itemTitle: "General Requirements",
      logFileId: "log-789",
      projectAbbr: "PROJ",
      action: "Approved",
      incomingRouting: "To Review",
      directRowUrl: "http://docs.google.com/sheet",
      failedColumns: "[]",
      emptyFallbacks: "[]"
    }
  };

  const res = moveSubmittalToClosed(event as any);
  assert.strictEqual(mockDriveFilingRepo.filedDocuments.length, 1);
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed"]);
  assert.strictEqual(res.navigation.card.args[3], "G:\\My Drive\\FakePath\\file-closed-noncsi-789");
});

test("moveSubmittalToClosed delegates file move and subfolder path resolution to defaultDriveFilingRepository for FF&E", () => {
  mockDriveFilingRepo.filedDocuments = [];
  const event = {
    parameters: {
      targetFolderId: "target-folder-1",
      discipline: "FF&E",
      section: "",
      specTag: "CH-01",
      fileId: "file-closed-ffe-456",
      newFileName: "CH-01-001 Side Chair",
      fileUrl: "http://drive.google.com/file-closed-ffe-456",
      stampSubNo: "CH-01-001",
      itemTitle: "Side Chair",
      logFileId: "log-456",
      projectAbbr: "PROJ",
      action: "Approved",
      incomingRouting: "To Review",
      directRowUrl: "http://docs.google.com/sheet",
      failedColumns: "[]",
      emptyFallbacks: "[]"
    }
  };

  const res = moveSubmittalToClosed(event as any);
  assert.strictEqual(mockDriveFilingRepo.filedDocuments.length, 1);
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "CH"]);
  assert.strictEqual(res.navigation.card.args[3], "G:\\My Drive\\FakePath\\file-closed-ffe-456");
});

test("processSubmission delegates execution directly to DocumentWorkflowModule.executeWorkflow", async () => {
  const originalExecuteWorkflow = DocumentWorkflowModule.executeWorkflow;
  let executeWorkflowCalled = false;
  let receivedInput: DocumentWorkflowInput | null = null;

  DocumentWorkflowModule.executeWorkflow = async (input: DocumentWorkflowInput) => {
    executeWorkflowCalled = true;
    receivedInput = input;
    return {
      fileId: "file-mod-123",
      targetKey: "033000-001-001",
      url: "http://drive.google.com/file-mod-123",
      localPath: "G:\\My Drive\\file-mod-123",
      title: "Mock Title",
      action: "Received",
      incomingRouting: "To Review",
      projectAbbr: "TESTPROJ",
      directRowUrl: "http://docs.google.com/sheet?range=A10",
      failedColumns: [],
      emptyFallbacks: [],
      newFileName: "Mock File Name"
    };
  };

  try {
    const event = {
      formInput: {
        action: "Received",
        discipline: "Architecture",
        section: "033000",
        submittalNum: "001",
        revNum: "001",
        title: "Mock Title",
        date: "2026-07-25",
        contact: "GC",
        incomingRouting: "To Review"
      },
      parameters: {
        logFileId: "log-ss-test",
        targetFolderId: "target-folder-test",
        driveFileId: "drive-file-test",
        projectAbbr: "TESTPROJ"
      }
    };

    const result = await processSubmission(event as any);

    assert.strictEqual(executeWorkflowCalled, true);
    assert.strictEqual(receivedInput.logFileId, "log-ss-test");
    assert.strictEqual(receivedInput.targetFolderId, "target-folder-test");
    assert.strictEqual(receivedInput.driveFileId, "drive-file-test");
    assert.strictEqual(result.navigation.card.flashData.fileId, "file-mod-123");
    assert.strictEqual(result.navigation.card.flashData.title, "Mock Title");
    assert.strictEqual(result.navigation.card.flashData.projectAbbr, "TESTPROJ");
  } finally {
    DocumentWorkflowModule.executeWorkflow = originalExecuteWorkflow;
  }
});

test("processSubmission for outgoing action delegates success response to defaultCardPresenter.presentOutgoingSuccess", async () => {
  let presenterCalled = false;
  let passedResult: any = null;
  const originalPresentOutgoingSuccess = (globalThis as any).defaultCardPresenter.presentOutgoingSuccess;

  (globalThis as any).defaultCardPresenter.presentOutgoingSuccess = (e: any, result: any, params: any) => {
    presenterCalled = true;
    passedResult = result;
    return { mockResponse: "presentOutgoingSuccess" } as any;
  };

  try {
    (globalThis as any).defaultLogRepository = {
      ...defaultRepoMock,
      appendDocument: () => ({
        targetKey: "033000-001-002",
        newFileName: "033000-001-002 Concrete - 2026-07-25 Architect Rev",
        contactHistory: "GC Architect",
        rowIndex: 6,
        failedColumns: [],
        previousRowUpdated: true
      })
    };

    const event = {
      formInput: {
        action: "Approved",
        discipline: "Architecture",
        section: "033000",
        submittalNum: "001",
        revNum: "002",
        title: "Concrete",
        date: "2026-07-25",
        contact: "Architect"
      },
      parameters: {
        logFileId: "log-ss-456",
        targetFolderId: "folder-target",
        driveFileId: "file-1",
        projectAbbr: "PROJ"
      }
    };

    const res = await processSubmission(event as any);
    
    assert.strictEqual(presenterCalled, true);
    assert.strictEqual(passedResult.targetKey, "033000-001-002");
    assert.deepStrictEqual(res, { mockResponse: "presentOutgoingSuccess" });
  } finally {
    (globalThis as any).defaultCardPresenter.presentOutgoingSuccess = originalPresentOutgoingSuccess;
  }
});

test("moveSubmittalToClosed delegates success response creation to defaultCardPresenter.presentMoveToClosedSuccess", () => {
  let presenterCalled = false;
  let passedDestName = "";
  const originalPresentMoveToClosedSuccess = defaultCardPresenter.presentMoveToClosedSuccess;

  defaultCardPresenter.presentMoveToClosedSuccess = (e: any, updatedCard: any, destName: string) => {
    presenterCalled = true;
    passedDestName = destName;
    return { mockResponse: "presentMoveToClosedSuccess" } as any;
  };

  try {
    mockDriveFilingRepo.filedDocuments = [];
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
    assert.strictEqual(presenterCalled, true);
    assert.strictEqual(passedDestName, "Closed");
    assert.deepStrictEqual(res, { mockResponse: "presentMoveToClosedSuccess" });
  } finally {
    defaultCardPresenter.presentMoveToClosedSuccess = originalPresentMoveToClosedSuccess;
  }
});

test("moveSubmittalToClosed files document to Closed subfolder hierarchy and returns card response", async () => {
  mockDriveFilingRepo.filedDocuments = [];
  const event = {
    parameters: {
      fileId: "file-submittal-1",
      newFileName: "033000-001-001 Concrete",
      fileUrl: "https://drive.google.com/file/d/file-submittal-1/view",
      stampSubNo: "033000-001-001",
      itemTitle: "Concrete",
      discipline: "Architecture",
      section: "033000",
      targetFolderId: "folder-closed-1",
      logFileId: "log-123",
      projectAbbr: "PROJ",
      action: "Approved",
      incomingRouting: ""
    }
  };

  const response = moveSubmittalToClosed(event as any);
  assert.ok(response);
  assert.strictEqual(mockDriveFilingRepo.filedDocuments.length, 1);
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "03-Concrete"]);
});
