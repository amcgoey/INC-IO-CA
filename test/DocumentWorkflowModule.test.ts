import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert";

const { GasMockHarness, DocumentFactory, createTestContext } = require("./harness");
const { ArchitectureSubmittalStrategy, FFESubmittalStrategy } = require("../src/DocumentLogStrategy");
const { getActionPolicy, getDocumentLogStrategy, getDocumentTitle, DocumentWorkflowModule } = require("../src/DocumentWorkflowModule");

beforeEach(() => {
  GasMockHarness.install({
    configOverrides: {
      LOG_HEADER_ROW: 3,
      LOG_SHEET_NAME: "Submittals Log",
      STAMPED_FILE_PREFIX: "STAMPED_",
      TRANSMITTAL_TEMPLATE_ID: "tmpl-transmittal",
      PDF_TEMPLATE_ID: "tmpl-pdf"
    }
  });
});

afterEach(() => {
  GasMockHarness.uninstall();
});

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
  const archDoc = DocumentFactory.createValidatedArchitectureSubmittal();
  const ffeDoc = DocumentFactory.createValidatedFFESubmittal();

  assert.ok(getDocumentLogStrategy(archDoc) instanceof ArchitectureSubmittalStrategy);
  assert.ok(getDocumentLogStrategy(ffeDoc) instanceof FFESubmittalStrategy);
});

test("getDocumentTitle extracts title based on discipline", () => {
  const archDoc = DocumentFactory.createValidatedArchitectureSubmittal({
    disciplineDetails: { title: "Concrete Spec" }
  });
  const ffeDoc = DocumentFactory.createValidatedFFESubmittal({
    disciplineDetails: { specTitle: "Lounge Chair" }
  });

  assert.strictEqual(getDocumentTitle(archDoc), "Concrete Spec");
  assert.strictEqual(getDocumentTitle(ffeDoc), "Lounge Chair");
  assert.strictEqual(getDocumentTitle({} as any), "");
});

test("DocumentWorkflowModule.executeWorkflow handles Architecture incoming submittals", async () => {
  const context = createTestContext();

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-1",
    incomingRouting: "To Refer",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  assert.strictEqual(context.logRepository.appendedDocuments.length, 1);
  const appDoc = context.logRepository.appendedDocuments[0];
  assert.strictEqual(appDoc.spreadsheetId, "log-ss-123");
  assert.ok(appDoc.strategy instanceof ArchitectureSubmittalStrategy);
  assert.strictEqual(appDoc.options?.status, "Under Review");
  assert.strictEqual(appDoc.options?.actionAbbr, " Rec");

  assert.ok(result.fileId);
  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(result.title, "Concrete");
  assert.strictEqual(result.action, "Received");
  assert.strictEqual(result.incomingRouting, "To Refer");
  assert.strictEqual(result.projectAbbr, "PROJ");
  assert.strictEqual(result.newFileName, "033000-001-001 Concrete - 2026-07-25 GC Rec");
  assert.strictEqual(result.directRowUrl, "https://docs.google.com/spreadsheets/d/log-ss-123/edit#gid=101&range=A5");

  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.deepStrictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, ["Closed", "03-Concrete"]);

  assert.strictEqual(context.pdfDocumentService.stampCalls.length, 1);
  assert.strictEqual(context.pdfDocumentService.stampCalls[0].options.templateId, "tmpl-transmittal");
});

test("DocumentWorkflowModule.executeWorkflow resolves driveFileUrl with hyphens and underscores", async () => {
  const context = createTestContext();
  const driveState = GasMockHarness.instance!.getDriveState();
  driveState.ensureFile("1234567890abcdefghijklmnopqrst_-ABC", "Test.pdf");

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    fileSource: "Google Drive URL",
    driveFileUrl: "https://drive.google.com/file/d/1234567890abcdefghijklmnopqrst_-ABC/view",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.ok(result.fileId);
});

test("DocumentWorkflowModule.executeWorkflow files stamped PDF in root targetFolder (Submittals)", async () => {
  const context = createTestContext();

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target-root",
    driveFileId: "file-1",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
});

test("DocumentWorkflowModule.executeWorkflow handles FF&E incoming submittals", async () => {
  const context = createTestContext();
  context.logRepository.customAppendResult = () => ({
    targetKey: "CH-01-001",
    newFileName: "CH-01-001 Side Chair - 2026-07-25 Vendor Rec",
    contactHistory: "Vendor",
    rowIndex: 9,
    failedColumns: [],
    previousRowUpdated: false
  });

  const input = {
    validatedDoc: DocumentFactory.createValidatedFFESubmittal({
      date: "2026-07-25",
      contact: "Vendor",
      action: "Received",
      disciplineDetails: { specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", revision: "001" }
    }),
    logFileId: "log-ss-ffe",
    targetFolderId: "folder-target",
    driveFileId: "file-ffe-1",
    incomingRouting: "To Review",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  assert.strictEqual(result.targetKey, "CH-01-001");
  assert.strictEqual(result.title, "Side Chair");
  assert.strictEqual(result.directRowUrl, "https://docs.google.com/spreadsheets/d/log-ss-ffe/edit#gid=101&range=A9");
  assert.deepStrictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, ["Closed", "CH"]);
  assert.strictEqual(context.pdfDocumentService.stampCalls[0].options.templateId, "tmpl-pdf");
});

test("DocumentWorkflowModule.executeWorkflow handles TEMPLATE_MISSING fallback during PDF stamping", async () => {
  GasMockHarness.install({
    configOverrides: {
      LOG_HEADER_ROW: 3,
      LOG_SHEET_NAME: "Submittals Log",
      STAMPED_FILE_PREFIX: "STAMPED_",
      TRANSMITTAL_TEMPLATE_ID: "tmpl-transmittal",
      PDF_TEMPLATE_ID: ""
    }
  });
  const context = createTestContext();

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-1",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.strictEqual(result.targetKey, "033000-001-001");
});

test("DocumentWorkflowModule.executeWorkflow returns stamped fileId when PDF is stamped", async () => {
  const context = createTestContext();

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target-root",
    driveFileId: "file-1",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.ok(result.fileId);
});

test("DocumentWorkflowModule.executeWorkflow resolves driveFileUrl even when fileSource is omitted", async () => {
  const context = createTestContext();
  const driveState = GasMockHarness.instance!.getDriveState();
  driveState.ensureFile("9876543210abcdefghijklmnopqrstuv", "File.pdf");

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileUrl: "https://drive.google.com/file/d/9876543210abcdefghijklmnopqrstuv/view",
    incomingRouting: "To Review",
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);
  assert.ok(result.fileId);
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
  const context = createTestContext();
  context.logRepository.customAppendResult = () => ({
    targetKey: testParams.expectedTargetKey,
    newFileName: testParams.expectedNewFileName,
    contactHistory: testParams.validatedDoc.contact,
    rowIndex: testParams.expectedRowIndex,
    failedColumns: [],
    previousRowUpdated: true
  });

  const input = {
    validatedDoc: testParams.validatedDoc,
    logFileId: testParams.logFileId,
    targetFolderId: "folder-target",
    driveFileId: testParams.driveFileId,
    selectedAction: testParams.selectedAction,
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  assert.strictEqual(context.logRepository.appendedDocuments.length, 1);
  const appDoc = context.logRepository.appendedDocuments[0];
  assert.strictEqual(appDoc.spreadsheetId, testParams.logFileId);
  assert.ok(appDoc.options);
  assert.strictEqual(appDoc.options.status, testParams.selectedAction.status);
  assert.strictEqual(appDoc.options.actionAbbr, testParams.selectedAction.abbr);
  assert.strictEqual(appDoc.options.updatePreviousStatus, true);
  assert.strictEqual(appDoc.options.previousRowStatus, "Closed");

  assert.strictEqual(result.fileId, testParams.driveFileId);
  assert.strictEqual(result.targetKey, testParams.expectedTargetKey);
  assert.strictEqual(result.title, testParams.expectedTitle);
  assert.strictEqual(result.action, testParams.selectedAction.action);

  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.strictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, undefined);
  assert.strictEqual(context.pdfDocumentService.stampCalls.length, 0);
}

test("DocumentWorkflowModule.executeWorkflow handles Architecture outgoing review actions", async () => {
  await verifyOutgoingWorkflow({
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Approved",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
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
    validatedDoc: DocumentFactory.createValidatedFFESubmittal({
      date: "2026-07-25",
      contact: "Vendor",
      action: "Revise & Resubmit",
      disciplineDetails: { specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", revision: "001" }
    }),
    logFileId: "log-ss-ffe",
    driveFileId: "file-ffe-1",
    selectedAction: { action: "Revise & Resubmit", abbr: " R&R", status: "Revise & Resubmit" },
    expectedTargetKey: "CH-01-001",
    expectedTitle: "Side Chair",
    expectedNewFileName: "CH-01-001 Side Chair - 2026-07-25 Vendor R&R",
    expectedRowIndex: 9
  });
});

test("For Incoming Architectural Submittals, original file is saved to Submittals/Closed/Division and copy is saved to Submittals folder", async () => {
  const context = createTestContext();

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-26",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "submittals-root-folder-id",
    driveFileId: "original-file-id-001",
    incomingRouting: "To Review",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.deepStrictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, ["Closed", "03-Concrete"]);
  assert.strictEqual(context.driveFilingRepository.filedDocuments[0].options.targetFolderId, "submittals-root-folder-id");
  assert.ok(result.fileId);
});
