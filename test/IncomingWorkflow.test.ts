import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert";

import { DocumentFactory, createTestContext } from "./harness";
import { DeclarativeDocumentLogStrategy } from "../src/DocumentLogStrategy";
import { IncomingWorkflow } from "../src/core/workflow/IncomingWorkflow";



test("IncomingWorkflow.execute processes Architecture incoming submittal with dual-path filing", async () => {
  const context = createTestContext();

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-123",
    logSheetId: 101,
    targetFolderId: "submittals-root-folder-id",
    driveFileId: "file-orig-1",
    incomingRouting: "To Refer",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await IncomingWorkflow.execute(input as any);

  // 1. Verify Sheet log written
  assert.strictEqual(context.logRepository.appendedDocuments.length, 1);
  const appDoc = context.logRepository.appendedDocuments[0];
  assert.strictEqual(appDoc.spreadsheetId, "log-ss-123");
  assert.strictEqual(appDoc.options?.status, "Under Review");

  // 2. Verify OriginalDocument filed in Submittals\Closed\<Subfolder>
  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 2);
  const originalFiling = context.driveFilingRepository.filedDocuments[0];
  assert.deepStrictEqual(originalFiling.options.subfolderPath, ["Closed", "03 Concrete"]);
  assert.strictEqual(originalFiling.options.targetFolderId, "submittals-root-folder-id");

  // 3. Verify ReviewDocument duplicated and placed in Submittals\ root with STAMPED_ prefix
  assert.strictEqual(context.driveFilingRepository.duplicatedDocuments.length, 1);
  const reviewFiling = context.driveFilingRepository.filedDocuments[1];
  assert.strictEqual(reviewFiling.options.subfolderPath, undefined);
  assert.notStrictEqual(originalFiling, reviewFiling);
  assert.strictEqual(reviewFiling.options.targetFolderId, "submittals-root-folder-id");
  assert.strictEqual(reviewFiling.options.newFileName, "STAMPED_033000-001-001 Concrete - 2026-07-25 GC Rec.pdf");

  // 4. Verify PdfDocumentService stamped cover sheet
  assert.strictEqual(context.pdfDocumentService.stampCalls.length, 1);
  assert.strictEqual(context.pdfDocumentService.stampCalls[0].options.templateId, "tmpl-transmittal");

  // 5. Verify result payload
  assert.strictEqual(result.targetKey, "033000-001-001");
  assert.strictEqual(result.title, "Concrete");
  assert.strictEqual(result.action, "Received");
  assert.strictEqual(result.incomingRouting, "To Refer");
  assert.strictEqual(result.newFileName, "033000-001-001 Concrete - 2026-07-25 GC Rec");
  assert.strictEqual(result.directRowUrl, "https://docs.google.com/spreadsheets/d/log-ss-123/edit#gid=101&range=A5");
});

test("IncomingWorkflow.execute processes FF&E incoming submittal with dual-path filing", async () => {
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
    logSheetId: 101,
    targetFolderId: "submittals-root-folder-id",
    driveFileId: "file-ffe-1",
    incomingRouting: "To Review",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await IncomingWorkflow.execute(input as any);

  assert.strictEqual(result.targetKey, "CH-01-001");
  assert.strictEqual(result.title, "Side Chair");
  assert.strictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath[0], "Closed");
  assert.strictEqual(context.driveFilingRepository.filedDocuments[0].options.subfolderPath[1], "CH");
  assert.strictEqual(context.driveFilingRepository.filedDocuments[1].options.subfolderPath, undefined);
  assert.strictEqual(context.driveFilingRepository.filedDocuments[1].options.newFileName, "STAMPED_CH-01-001 Side Chair - 2026-07-25 Vendor Rec.pdf");
});

test("IncomingWorkflow.execute files composite merged blob with fileId: undefined when multi-attachment intake occurs (Fix 2)", async () => {
  const context = createTestContext();
  const mockBlob1 = { getName: () => "att1.pdf", getContentType: () => "application/pdf", getBytes: () => [1, 2, 3] };
  const mockBlob2 = { getName: () => "att2.pdf", getContentType: () => "application/pdf", getBytes: () => [4, 5, 6] };

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-multi",
    logSheetId: 101,
    targetFolderId: "submittals-root-folder-id",
    driveFileId: "file-orig-single",
    attachments: [mockBlob1, mockBlob2],
    incomingRouting: "To Refer",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    logRepository: context.logRepository,
    driveFilingRepository: context.driveFilingRepository,
    pdfDocumentService: context.pdfDocumentService
  };

  const result = await IncomingWorkflow.execute(input as any);

  assert.strictEqual(context.pdfDocumentService.mergeBlobsCalls.length, 1);
  assert.strictEqual(context.pdfDocumentService.mergeBlobsCalls[0].blobs.length, 2);

  assert.strictEqual(context.driveFilingRepository.filedDocuments.length, 2);
  const originalFiling = context.driveFilingRepository.filedDocuments[0];
  assert.strictEqual(originalFiling.file.fileId, undefined);
  assert.ok(originalFiling.file.blob);
});

test("IncomingWorkflow.execute resolves adapters.pdfDocumentService when input.pdfDocumentService is omitted (Fix 4)", async () => {
  const context = createTestContext();
  const mockBlob1 = { getName: () => "att1.pdf", getContentType: () => "application/pdf", getBytes: () => [1, 2, 3] };
  const mockBlob2 = { getName: () => "att2.pdf", getContentType: () => "application/pdf", getBytes: () => [4, 5, 6] };

  const input = {
    validatedDoc: DocumentFactory.createValidatedArchitectureSubmittal({
      date: "2026-07-25",
      contact: "GC",
      action: "Received",
      disciplineDetails: { section: "033000", number: "001", title: "Concrete", revision: "001" }
    }),
    logFileId: "log-ss-adapters",
    logSheetId: 101,
    targetFolderId: "submittals-root-folder-id",
    attachments: [mockBlob1, mockBlob2],
    incomingRouting: "To Refer",
    projectAbbr: "PROJ",
    emptyFallbacks: [],
    selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
    adapters: {
      logRepository: context.logRepository,
      driveFilingRepository: context.driveFilingRepository,
      pdfDocumentService: context.pdfDocumentService
    }
  };

  const result = await IncomingWorkflow.execute(input as any);

  assert.strictEqual(context.pdfDocumentService.mergeBlobsCalls.length, 1);
  assert.strictEqual(context.pdfDocumentService.stampCalls.length, 1);
});
