import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert";

const { DocumentFactory, createTestContext } = require("./harness");
const { ArchitectureSubmittalStrategy, FFESubmittalStrategy } = require("../src/DocumentLogStrategy");
const { OutgoingWorkflow } = require("../src/core/workflow/OutgoingWorkflow");
const { DocumentWorkflowModule } = require("../src/core/workflow/DocumentWorkflowModule");



test("OutgoingWorkflow - AppContext = 'Gmail' executes log writing, file renaming, and Closed subfolder move in a single pass", async () => {
  const context = createTestContext();
  context.logRepository.customAppendResult = () => ({
    targetKey: "033000-001-001",
    newFileName: "033000-001-001 Concrete - 2026-07-26 GC App",
    contactHistory: "GC",
    rowIndex: 6,
    failedColumns: [],
    previousRowUpdated: true
  });

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-26",
      contact: "GC",
      action: "Approved",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-gmail-1",
    fileSource: "Email Attachment",
    messageId: "msg-123",
    selectedAction: { action: "Approved", abbr: " App", status: "Approved" },
    appContext: "Gmail",
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await OutgoingWorkflow.execute(input as any);

  // Assert log appended
  assert.strictEqual(context.logRepository.appendedDocuments.length, 1);
  const appDoc = context.logRepository.appendedDocuments[0];
  assert.strictEqual(appDoc.options?.status, "Approved");
  assert.strictEqual(appDoc.options?.updatePreviousStatus, true);
  assert.strictEqual(appDoc.options?.previousRowStatus, "Closed");

  // Assert result fields
  assert.strictEqual(result.fileId, "file-gmail-1");
  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(result.newFileName, "033000-001-001 Concrete - 2026-07-26 GC App");

  // Assert single pass immediate filing into Closed subfolder hierarchy
  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.deepStrictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, ["Closed", "03 Concrete"]);
});

test("OutgoingWorkflow - AppContext = 'Gmail' handles FF&E outgoing submittals with immediate filing", async () => {
  const context = createTestContext();
  context.logRepository.customAppendResult = () => ({
    targetKey: "CH-01-001",
    newFileName: "CH-01-001 Side Chair - 2026-07-26 Vendor R&R",
    contactHistory: "Vendor",
    rowIndex: 9,
    failedColumns: [],
    previousRowUpdated: true
  });

  const input = {
    validatedDoc: DocumentFactory.createValidatedFFESubmittal({
      date: "2026-07-26",
      contact: "Vendor",
      action: "Revise & Resubmit",
      disciplineDetails: { specTag: "CH-01", specTitle: "Side Chair", vendor: "Furniture Co", revision: "001" }
    }),
    logFileId: "log-ss-ffe",
    targetFolderId: "folder-target",
    driveFileId: "file-ffe-gmail",
    fileSource: "Email Attachment",
    messageId: "msg-ffe-123",
    selectedAction: { action: "Revise & Resubmit", abbr: " R&R", status: "Revise & Resubmit" },
    appContext: "Gmail",
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await OutgoingWorkflow.execute(input as any);

  assert.strictEqual(result.targetKey, "CH-01-001");
  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.deepStrictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, ["Closed", "CH"]);
});

test("OutgoingWorkflow - AppContext = 'Gmail' Non-CSI submittal files directly into Closed root subfolder when section is empty", async () => {
  const context = createTestContext();
  context.logRepository.customAppendResult = () => ({
    targetKey: "001-001",
    newFileName: "001-001 General Notes - 2026-07-26 GC App",
    contactHistory: "GC",
    rowIndex: 7,
    failedColumns: [],
    previousRowUpdated: true
  });

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-26",
      contact: "GC",
      action: "Approved",
      disciplineDetails: { section: "", number: "001", title: "General Notes", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-non-csi",
    selectedAction: { action: "Approved", abbr: " App", status: "Approved" },
    appContext: "Gmail",
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository
  };

  const result = await OutgoingWorkflow.execute(input as any);

  assert.strictEqual(result.targetKey, "001-001");
  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.deepStrictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, ["Closed"]);
});

test("OutgoingWorkflow - AppContext = 'GoogleDrive' defers filing in root target folder", async () => {
  const context = createTestContext();
  context.logRepository.customAppendResult = () => ({
    targetKey: "033000-001-001",
    newFileName: "033000-001-001 Concrete - 2026-07-26 GC App",
    contactHistory: "GC",
    rowIndex: 6,
    failedColumns: [],
    previousRowUpdated: true
  });

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-26",
      contact: "GC",
      action: "Approved",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-drive-1",
    selectedAction: { action: "Approved", abbr: " App", status: "Approved" },
    appContext: "GoogleDrive",
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository
  };

  const result = await OutgoingWorkflow.execute(input as any);

  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.strictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, undefined);
});

test("OutgoingWorkflow - auto-detects 'Gmail' context when fileSource is 'Email Attachment' or messageId is present", async () => {
  const context = createTestContext();
  context.logRepository.customAppendResult = () => ({
    targetKey: "033000-001-001",
    newFileName: "033000-001-001 Concrete - 2026-07-26 GC App",
    contactHistory: "GC",
    rowIndex: 6,
    failedColumns: [],
    previousRowUpdated: true
  });

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-26",
      contact: "GC",
      action: "Approved",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-email-auto",
    fileSource: "Email Attachment",
    messageId: "msg-auto-456",
    selectedAction: { action: "Approved", abbr: " App", status: "Approved" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository
  };

  await OutgoingWorkflow.execute(input as any);

  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.deepStrictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, ["Closed", "03 Concrete"]);
});

test("DocumentWorkflowModule.executeWorkflow delegates outgoing workflow to OutgoingWorkflow for Gmail context", async () => {
  const context = createTestContext();
  context.logRepository.customAppendResult = () => ({
    targetKey: "033000-001-001",
    newFileName: "033000-001-001 Concrete - 2026-07-26 GC App",
    contactHistory: "GC",
    rowIndex: 6,
    failedColumns: [],
    previousRowUpdated: true
  });

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-26",
      contact: "GC",
      action: "Approved",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    targetFolderId: "folder-target",
    driveFileId: "file-dw-gmail",
    appContext: "Gmail",
    selectedAction: { action: "Approved", abbr: " App", status: "Approved" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository
  };

  const result = await DocumentWorkflowModule.executeWorkflow(input as any);

  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 1);
  assert.deepStrictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath, ["Closed", "03 Concrete"]);
});
