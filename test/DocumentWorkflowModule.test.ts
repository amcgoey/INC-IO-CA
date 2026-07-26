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

const { FakePdfDocumentService } = require("./harness/index");
const { FakeDriveFilingRepository } = require("./harness/index");
const { ArchitectureSubmittalStrategy, FFESubmittalStrategy } = require("../src/DocumentLogStrategy");
const { getActionPolicy, getDocumentLogStrategy, getDocumentTitle, DocumentWorkflowModule } = require("../src/DocumentWorkflowModule");

const mockFile = {
  moveTo: () => {},
  setName: (n: string) => { mockFile.lastRenamed = n; },
  getUrl: () => "http://drive.google.com/file-1",
  getId: () => "file-1",
  getBlob: () => ({ copyBlob: () => ({ setName: () => {} }), setName: () => {} }),
  getAs: () => ({ copyBlob: () => ({ setName: () => {} }), setName: () => {} }),
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

test("getDocumentLogStrategy resolves strategy based on discipline", () => {
  const archDoc: any = { disciplineDetails: { discipline: "Architecture" } };
  const ffeDoc: any = { disciplineDetails: { discipline: "FF&E" } };

  assert.ok(getDocumentLogStrategy(archDoc) instanceof ArchitectureSubmittalStrategy);
  assert.ok(getDocumentLogStrategy(ffeDoc) instanceof FFESubmittalStrategy);
});

test("getDocumentTitle extracts title based on discipline", () => {
  const archDoc: any = { disciplineDetails: { discipline: "Architecture", title: "Concrete Spec" } };
  const ffeDoc: any = { disciplineDetails: { discipline: "FF&E", specTitle: "Lounge Chair" } };

  assert.strictEqual(getDocumentTitle(archDoc), "Concrete Spec");
  assert.strictEqual(getDocumentTitle(ffeDoc), "Lounge Chair");
  assert.strictEqual(getDocumentTitle({} as any), "");
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

test("DocumentWorkflowModule.executeWorkflow resolves driveFileUrl with hyphens and underscores", async () => {
  mockCreatedFiles.length = 0;
  const mockDriveFilingRepo = new FakeDriveFilingRepository();
  const mockPdfService = new FakePdfDocumentService();

  const fetchedFileIds: string[] = [];
  const customDriveApp = {
    getFileById: (id: string) => {
      fetchedFileIds.push(id);
      return mockFile;
    },
    getFolderById: () => mockFolder
  };

  const mockLogRepo = {
    appendDocument: () => ({
      targetKey: "033000-001-001",
      newFileName: "033000-001-001 Concrete",
      contactHistory: "GC",
      rowIndex: 5,
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
    fileSource: "Google Drive URL",
    driveFileUrl: "https://drive.google.com/file/d/1234567890abcdefghijklmnopqrst_-ABC/view",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any,
    driveApp: customDriveApp
  };

  await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.ok(fetchedFileIds.includes("1234567890abcdefghijklmnopqrst_-ABC"));
});

test("DocumentWorkflowModule.executeWorkflow files stamped PDF in root targetFolder (Submittals)", async () => {
  mockCreatedFiles.length = 0;
  let subfolderTargeted = "";
  const mockDriveFilingRepo = {
    fileDocument: () => ({
      fileId: "filed-orig-1",
      url: "http://drive.google.com/filed-orig-1",
      localPath: "G:\\Closed\\03-Concrete\\orig.pdf",
      folderId: "folder-subfolder-csi-999"
    })
  };
  const mockPdfService = new FakePdfDocumentService();

  const customDriveApp = {
    getFileById: () => mockFile,
    getFolderById: (id: string) => {
      subfolderTargeted = id;
      return mockFolder;
    }
  };

  const mockLogRepo = {
    appendDocument: () => ({
      targetKey: "033000-001-001",
      newFileName: "033000-001-001 Concrete",
      contactHistory: "GC",
      rowIndex: 5,
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
    targetFolderId: "folder-target-root",
    driveFileId: "file-1",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any,
    driveApp: customDriveApp
  };

  await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.strictEqual(subfolderTargeted, "folder-target-root");
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

test("DocumentWorkflowModule.executeWorkflow returns stamped fileId when PDF is stamped", async () => {
  const mockDriveFilingRepo = new FakeDriveFilingRepository();
  const mockPdfService = new FakePdfDocumentService();

  const stampedMockFile = {
    ...mockFile,
    getId: () => "stamped-file-id-999"
  };

  const customDriveApp = {
    getFileById: () => mockFile,
    getFolderById: () => ({
      ...mockFolder,
      createFile: () => stampedMockFile
    })
  };

  const mockLogRepo = {
    appendDocument: () => ({
      targetKey: "033000-001-001",
      newFileName: "033000-001-001 Concrete",
      contactHistory: "GC",
      rowIndex: 5,
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
    targetFolderId: "folder-target-root",
    driveFileId: "file-1",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any,
    driveApp: customDriveApp
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.strictEqual(result.fileId, "stamped-file-id-999");
});

test("DocumentWorkflowModule.executeWorkflow resolves driveFileUrl even when fileSource is omitted", async () => {
  const mockDriveFilingRepo = new FakeDriveFilingRepository();
  const mockPdfService = new FakePdfDocumentService();

  const fetchedFileIds: string[] = [];
  const customDriveApp = {
    getFileById: (id: string) => {
      fetchedFileIds.push(id);
      return mockFile;
    },
    getFolderById: () => mockFolder
  };

  const mockLogRepo = {
    appendDocument: () => ({
      targetKey: "033000-001-001",
      newFileName: "033000-001-001 Concrete",
      contactHistory: "GC",
      rowIndex: 5,
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
    driveFileUrl: "https://drive.google.com/file/d/9876543210abcdefghijklmnopqrstuv/view",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any,
    driveApp: customDriveApp
  };

  await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.ok(fetchedFileIds.includes("9876543210abcdefghijklmnopqrstuv"));
});

async function verifyOutgoingWorkflow(testParams: {
  validatedDoc: any;
  logFileId: string;
  driveFileId: string;
  selectedAction: { action: string; abbr: string; status: string };
  expectedTargetKey: string;
  expectedTitle: string;
  expectedNewFileName: string;
  expectedRowIndex: number;
}) {
  const mockDriveFilingRepo = new FakeDriveFilingRepository();
  const mockPdfService = new FakePdfDocumentService();

  let appendCalled = false;
  let passedAppendOptions: Record<string, any> | undefined;
  const mockLogRepo = {
    appendDocument: (
      spreadsheetId: string,
      doc: any,
      strategy: any,
      options?: Record<string, any>
    ) => {
      appendCalled = true;
      passedAppendOptions = options;
      assert.strictEqual(spreadsheetId, testParams.logFileId);
      return {
        targetKey: testParams.expectedTargetKey,
        newFileName: testParams.expectedNewFileName,
        contactHistory: doc.contact,
        rowIndex: testParams.expectedRowIndex,
        failedColumns: [],
        previousRowUpdated: true
      };
    }
  };

  const input = {
    validatedDoc: testParams.validatedDoc,
    logFileId: testParams.logFileId,
    targetFolderId: "folder-target",
    driveFileId: testParams.driveFileId,
    selectedAction: testParams.selectedAction,
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  assert.strictEqual(appendCalled, true);
  assert.ok(passedAppendOptions);
  assert.strictEqual(passedAppendOptions.status, testParams.selectedAction.status);
  assert.strictEqual(passedAppendOptions.actionAbbr, testParams.selectedAction.abbr);
  assert.strictEqual(passedAppendOptions.updatePreviousStatus, true);
  assert.strictEqual(passedAppendOptions.previousRowStatus, "Closed");

  assert.strictEqual(result.fileId, testParams.driveFileId);
  assert.strictEqual(result.targetKey, testParams.expectedTargetKey);
  assert.strictEqual(result.title, testParams.expectedTitle);
  assert.strictEqual(result.action, testParams.selectedAction.action);

  // Outgoing actions file directly to targetFolderId without subfolderPath
  assert.strictEqual(mockDriveFilingRepo.filedDocuments.length, 1);
  assert.strictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, undefined);

  // Outgoing actions skip PDF stamping
  assert.strictEqual(mockPdfService.stampCalls.length, 0);
}

test("DocumentWorkflowModule.executeWorkflow handles Architecture outgoing review actions", async () => {
  await verifyOutgoingWorkflow({
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "GC",
      action: "Approved",
      disciplineDetails: { discipline: "Architecture", section: "033000", number: "001", title: "Concrete", revision: "001" }
    },
    logFileId: "log-ss-123",
    driveFileId: "file-1",
    selectedAction: { action: "Approved", abbr: " App", status: "Approved" },
    expectedTargetKey: "033000-001-001",
    expectedTitle: "Concrete",
    expectedNewFileName: "033000-001-001 Concrete - 2026-07-25 GC App",
    expectedRowIndex: 6
  });
});

test("DocumentWorkflowModule.executeWorkflow handles FF&E outgoing review actions", async () => {
  await verifyOutgoingWorkflow({
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-25",
      contact: "Vendor",
      action: "Revise & Resubmit",
      disciplineDetails: { discipline: "FF&E", specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", revision: "001" }
    },
    logFileId: "log-ss-ffe",
    driveFileId: "file-ffe-1",
    selectedAction: { action: "Revise & Resubmit", abbr: " R&R", status: "Revise & Resubmit" },
    expectedTargetKey: "CH-01-001",
    expectedTitle: "Side Chair",
  });
});

test("For Incoming Architectural Submittals, original file is saved to Submittals/Closed/Division and copy is saved to Submittals folder", async () => {
  mockCreatedFiles.length = 0;
  const mockDriveFilingRepo = new FakeDriveFilingRepository();
  const mockPdfService = new FakePdfDocumentService();

  const getFolderCalls: string[] = [];
  const customDriveApp = {
    getFileById: () => mockFile,
    getFolderById: (id: string) => {
      getFolderCalls.push(id);
      return {
        createFile: (blob: any) => {
          const created = {
            getId: () => "stamped-copy-id-123",
            getName: () => blob.getName ? blob.getName() : "stamped.pdf"
          };
          mockCreatedFiles.push(created);
          return created;
        }
      };
    }
  };

  const mockLogRepo = {
    appendDocument: () => ({
      targetKey: "033000-001-001",
      newFileName: "033000-001-001 Concrete - 2026-07-26 GC Rec",
      contactHistory: "GC",
      rowIndex: 5,
      failedColumns: [],
      previousRowUpdated: false
    })
  };

  const input = {
    validatedDoc: {
      documentType: "Submittal",
      date: "2026-07-26",
      contact: "GC",
      action: "Received",
      disciplineDetails: { discipline: "Architecture", section: "033000", number: "001", title: "Concrete", revision: "001" }
    },
    logFileId: "log-ss-123",
    targetFolderId: "submittals-root-folder-id",
    driveFileId: "original-file-id-001",
    incomingRouting: "To Review",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: mockLogRepo as any,
    driveFilingRepository: mockDriveFilingRepo as any,
    pdfDocumentService: mockPdfService as any,
    driveApp: customDriveApp
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  // 1. Original file is filed into Submittals/Closed/<Division>
  assert.strictEqual(mockDriveFilingRepo.filedDocuments.length, 1);
  assert.deepStrictEqual(mockDriveFilingRepo.filedDocuments[0].options.subfolderPath, ["Closed", "03-Concrete"]);
  assert.strictEqual(mockDriveFilingRepo.filedDocuments[0].options.targetFolderId, "submittals-root-folder-id");

  // 2. Copy (stamped submittal copy) is saved directly into Submittals root folder (submittals-root-folder-id)
  assert.ok(getFolderCalls.includes("submittals-root-folder-id"));
  assert.strictEqual(result.fileId, "stamped-copy-id-123");
});

