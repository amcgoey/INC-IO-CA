import test from "node:test";
import assert from "node:assert";

import { GasMockHarness, FakePdfDocumentService, FakeDriveFilingRepository } from "./harness/index";

GasMockHarness.install();

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

const mockSheet = { getSheetId: () => 101 };
(globalThis as any).SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => mockSheet
  })
};

import { defaultPdfDocumentService } from "../src/PdfDocumentService";
import { defaultDriveFilingRepository } from "../src/DriveFilingRepository";
import { defaultLogRepository } from "../src/GoogleSheetsLogRepository";
import { PipelineBuilder } from "../src/core/workflow/PipelineBuilder";

(globalThis as any).buildIntakeCard = (e: any, d: any, flashData: any) => ({ cardType: "MainCard", flashData });
const mockDriveFilingRepo = new FakeDriveFilingRepository();
defaultDriveFilingRepository.fileDocument = (file: any, options: any) => mockDriveFilingRepo.fileDocument(file, options);

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

import { getActionPolicy } from "../src/core/workflow/WorkflowPolicy";
import { DeclarativeDocumentLogStrategy } from "../src/DocumentLogStrategy";

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

defaultLogRepository.verifyAndFormatLogSheet = defaultRepoMock.verifyAndFormatLogSheet as any;
defaultLogRepository.getLogSettings = defaultRepoMock.getLogSettings as any;
defaultLogRepository.appendDocument = defaultRepoMock.appendDocument as any;

import { defaultCardPresenter } from "../src/adapters/gas/CardPresenter";
import { processSubmission, moveSubmittalToClosed } from "../src/Process";

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
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "033000"]);
  assert.ok(res.navigation.card);
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
  assert.ok(res.navigation.card);
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
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "CH-01"]);
  assert.ok(res.navigation.card);
});

test("processSubmission delegates execution directly to PipelineBuilder.buildAndExecute", async () => {
  const originalExecuteWorkflow = PipelineBuilder.buildAndExecute;
  let buildAndExecuteCalled = false;
  let receivedInput: DocumentWorkflowInput | null = null;

  PipelineBuilder.buildAndExecute = async (input: DocumentWorkflowInput) => {
    buildAndExecuteCalled = true;
    receivedInput = input;
    return {
      success: true,
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

    assert.strictEqual(buildAndExecuteCalled, true);
    assert.strictEqual(receivedInput.logFileId, "log-ss-test");
    assert.strictEqual(receivedInput.targetFolderId, "target-folder-test");
    assert.strictEqual(receivedInput.driveFileId, "drive-file-test");
    assert.strictEqual(result.navigation.card.flashData.fileId, "file-mod-123");
    assert.strictEqual(result.navigation.card.flashData.title, "Mock Title");
    assert.strictEqual(result.navigation.card.flashData.projectAbbr, "TESTPROJ");
  } finally {
    PipelineBuilder.buildAndExecute = originalExecuteWorkflow;
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
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "033000"]);
});
