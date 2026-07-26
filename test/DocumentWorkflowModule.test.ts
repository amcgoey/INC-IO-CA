import test from "node:test";
import assert from "node:assert";

// Set up global GAS mocks before requiring modules
(globalThis as any).CSI_DIVISIONS = { "03": "03-Concrete" };
(globalThis as any).CONFIG = {
  LOG_HEADER_ROW: 3,
  LOG_SHEET_NAME: "Submittals Log",
  STAMPED_FILE_PREFIX: "STAMPED_",
  TRANSMITTAL_TEMPLATE_ID: "tmpl-transmittal",
  PDF_TEMPLATE_ID: "tmpl-pdf"
};

const { FakePdfDocumentService } = require("../src/PdfDocumentService");
const { FakeDriveFilingRepository } = require("../src/DriveFilingRepository");
const { ArchitectureSubmittalStrategy, FFESubmittalStrategy } = require("../src/DocumentLogStrategy");
const { getActionPolicy, DocumentWorkflowModule } = require("../src/DocumentWorkflowModule");

const mockFile = {
  moveTo: () => {},
  setName: (n: string) => { mockFile.lastRenamed = n; },
  getUrl: () => "http://drive.google.com/file-1",
  getId: () => "file-1",
  getBlob: () => ({ copyBlob: () => ({ setName: () => {} }), setName: () => {} }),
  getParents: () => ({ hasNext: () => false }),
  lastRenamed: ""
};

const mockCreatedFiles: any[] = [];
const mockFolder: any = {
  getFoldersByName: () => ({ hasNext: () => false }),
  createFolder: () => mockFolder,
  createFile: (b: any) => {
    mockCreatedFiles.push(b);
    return mockFile;
  },
  getId: () => "folder-root-id",
  getName: () => "RootFolder"
};

(globalThis as any).DriveApp = {
  getFolderById: () => mockFolder,
  getFileById: () => mockFile
};

(globalThis as any).SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => ({
      getSheetId: () => 101
    })
  })
};

test("getActionPolicy returns incoming policy for 'Received'", () => {
  const policy = getActionPolicy("Received");
  assert.strictEqual(policy.direction, "incoming");
  assert.strictEqual(policy.useCsiSubfolder, true);
  assert.strictEqual(policy.stampPdf, true);
  assert.strictEqual(policy.updatePreviousStatus, false);
});

test("getActionPolicy returns outgoing policy for review actions", () => {
  const policy = getActionPolicy("Approved");
  assert.strictEqual(policy.direction, "outgoing");
  assert.strictEqual(policy.useCsiSubfolder, false);
  assert.strictEqual(policy.stampPdf, false);
  assert.strictEqual(policy.updatePreviousStatus, true);
  assert.strictEqual(policy.previousRowStatus, "Closed");
});

test("DocumentWorkflowModule.executeWorkflow handles Architecture incoming submittals", async () => {
  mockCreatedFiles.length = 0;
  const mockDriveFilingRepo = new FakeDriveFilingRepository();
  const mockPdfService = new FakePdfDocumentService();

  let appendCalled = false;
  let passedOptions: any = null;
  const mockLogRepo = {
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

  const input = {
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { discipline: "Architecture", section: "033000", number: "001", title: "Concrete", revision: "001" }
    },
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-1",
    incomingRouting: "To Refer",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  assert.strictEqual(appendCalled, true);
  assert.strictEqual(passedOptions.status, "Under Review");
  assert.strictEqual(passedOptions.actionAbbr, " Rec");

  assert.strictEqual(result.fileId, "file-1");
  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(result.title, "Concrete");
  assert.strictEqual(result.action, "Received");
  assert.strictEqual(result.incomingRouting, "To Refer");
  assert.strictEqual(result.projectAbbr, "PROJ");
  assert.strictEqual(result.newFileName, "033000-001-001 Concrete - 2026-07-25 GC Rec");
  assert.strictEqual(result.directRowUrl, "https://docs.google.com/spreadsheets/d/log-ss-123/edit#gid=101&range=A5");

  assert.strictEqual(mockDriveFilingRepo.filedDocuments.length, 1);
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "03-Concrete"]);

  assert.strictEqual(mockPdfService.stampCalls.length, 1);
  assert.strictEqual(mockPdfService.stampCalls[0].options.templateId, "tmpl-transmittal");
});

test("DocumentWorkflowModule.executeWorkflow handles FF&E incoming submittals", async () => {
  mockCreatedFiles.length = 0;
  const mockDriveFilingRepo = new FakeDriveFilingRepository();
  const mockPdfService = new FakePdfDocumentService();

  const mockLogRepo = {
    appendDocument: (ssId: string, doc: any, strategy: any, options: any) => {
      assert.ok(strategy instanceof FFESubmittalStrategy);
      return {
        targetKey: "CH-01-001",
        newFileName: "CH-01-001 Side Chair - 2026-07-25 Vendor Rec",
        contactHistory: "Vendor",
        rowIndex: 9,
        failedColumns: [],
        previousRowUpdated: false
      };
    }
  };

  const input = {
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "Vendor",
      action: "Received",
      disciplineDetails: { discipline: "FF&E", specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", revision: "001" }
    },
    logFileId: "log-ss-ffe",
    targetFolderId: "folder-target",
    driveFileId: "file-ffe-1",
    incomingRouting: "To Review",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  assert.strictEqual(result.targetKey, "CH-01-001");
  assert.strictEqual(result.title, "Side Chair");
  assert.strictEqual(result.directRowUrl, "https://docs.google.com/spreadsheets/d/log-ss-ffe/edit#gid=101&range=A9");
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "CH"]);
  assert.strictEqual(mockPdfService.stampCalls[0].options.templateId, "tmpl-pdf");
});

test("DocumentWorkflowModule.executeWorkflow handles TEMPLATE_MISSING fallback during PDF stamping", async () => {
  mockCreatedFiles.length = 0;
  const mockDriveFilingRepo = new FakeDriveFilingRepository();
  const mockPdfService = new FakePdfDocumentService();

  // Force TEMPLATE_MISSING by passing empty templateId or throwing Error("TEMPLATE_MISSING")
  (globalThis as any).CONFIG.PDF_TEMPLATE_ID = "";

  const mockLogRepo = {
    appendDocument: () => ({
      targetKey: "033000-001-001",
      newFileName: "033000-001-001 Concrete",
      contactHistory: "GC",
      rowIndex: 2,
      failedColumns: [],
      previousRowUpdated: false
    })
  };

  const input = {
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { discipline: "Architecture", section: "033000", number: "001", title: "Concrete", revision: "001" }
    },
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-1",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(mockCreatedFiles.length, 1);
  (globalThis as any).CONFIG.PDF_TEMPLATE_ID = "tmpl-pdf";
});
