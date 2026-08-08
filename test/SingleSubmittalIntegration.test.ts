import test from "node:test";
import assert from "node:assert/strict";

import { GasMockHarness } from "./harness/GasMockHarness";
import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../src/core/config/DocumentLogWorkbookSpec";
import { DocumentPipeline } from "../src/core/intake/DocumentPipeline";
import { DocumentWorkflowModule } from "../src/core/workflow/DocumentWorkflowModule";
import { IncomingWorkflow } from "../src/core/workflow/IncomingWorkflow";
import { ArchitectureSubmittalStrategy, FFESubmittalStrategy } from "../src/DocumentLogStrategy";
import { GoogleSheetsLogRepository } from "../src/GoogleSheetsLogRepository";
import { FakeDriveFilingRepository } from "./harness/fakes/FakeDriveFilingRepository";
import { FakePdfDocumentService } from "./harness/fakes/FakePdfDocumentService";

test("Single-Submittal Architecture Incoming Workflow - End-to-End Integration", async () => {
  const harness = GasMockHarness.install();

  try {
    const spreadsheetId = "log-arch-e2e";
    const ss = harness.sheetsService.openById(spreadsheetId);
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

    // 1. Intake Parsing: Raw form input into ValidatedDocument
    const rawFormInput = {
      discipline: "Architecture",
      section: "033000",
      number: "001",
      revision: "001",
      title: "Cast-in-Place Concrete",
      date: "2026-08-08",
      contact: "GC",
      action: "Received",
      incomingRouting: "To Refer",
      notes: "Initial submittal review"
    };

    const validationResult = DocumentPipeline.processFormIntake(rawFormInput);
    assert.equal(validationResult.status, "success");
    const validatedDoc = (validationResult as any).data;
    assert.equal(validatedDoc.disciplineDetails.discipline, "Architecture");
    assert.equal(validatedDoc.disciplineDetails.section, "033000");
    assert.equal(validatedDoc.disciplineDetails.number, "001");
    assert.equal(validatedDoc.disciplineDetails.title, "Cast-in-Place Concrete");

    // 2. Setup Fakes & Repositories
    const fakeDriveRepo = new FakeDriveFilingRepository();
    fakeDriveRepo.filedDocuments = [];
    const fakePdfService = new FakePdfDocumentService();
    const googleSheetsLogRepo = new GoogleSheetsLogRepository();

    const input = {
      validatedDoc,
      logFileId: spreadsheetId,
      logSheetId: 101,
      targetFolderId: "root-folder-submittals",
      driveFileId: "file-orig-001",
      incomingRouting: "To Refer",
      projectAbbr: "PROJ",
      emptyFallbacks: [],
      selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
      strategy: new ArchitectureSubmittalStrategy(),
      logRepository: googleSheetsLogRepo,
      driveFilingRepository: fakeDriveRepo,
      pdfDocumentService: fakePdfService,
      spreadsheetApp: harness.sheetsService
    };

    // 3. Execute End-to-End Workflow
    const result = await DocumentWorkflowModule.executeWorkflow(input as any);

    // 4. Verify Workflow Result
    assert.equal(result.targetKey, "033000-001-001");
    assert.equal(result.title, "Cast-in-Place Concrete");
    assert.equal(result.action, "Received");
    assert.equal(result.incomingRouting, "To Refer");
    assert.ok(result.url.length > 0, "Result URL should be non-empty");

    // 5. Verify PDF Cover Page Stamping
    assert.equal(fakePdfService.stampCalls.length, 1);
    assert.equal(fakePdfService.stampCalls[0].options.stampSubmittalNo, "033000-001-001");

    // 6. Verify Drive Filing Subfolder Creation
    assert.equal(fakeDriveRepo.filedDocuments.length, 2);
    const origFiling = fakeDriveRepo.filedDocuments[0];
    assert.deepEqual(origFiling.options.subfolderPath, ["Closed", "03-Concrete"]);
    const reviewFiling = fakeDriveRepo.filedDocuments[1];
    assert.equal(reviewFiling.options.newFileName, "STAMPED_033000-001-001 Cast-in-Place Concrete - 2026-08-08 GC Rec.pdf");

    // 7. Verify Log Row Appended to Submittal Arch Tab
    const archSheet = ss.getSheetByName("Submittal Arch");
    assert.ok(archSheet, "Submittal Arch sheet must exist");
    const grid = archSheet!.getDataRange().getValues();
    assert.ok(grid.length >= 4, "Row should be inserted into Submittal Arch tab");

    // 8. Verify Cell Hyperlink Insertion in "Link" column (Col 10)
    const headers = grid[2].map((h: any) => String(h || "").trim());
    const linkIdx = headers.indexOf("Link");
    assert.equal(linkIdx, 9, "Link column should be at index 9 (Column J)");

    const lastRowIndex = grid.length - 1;
    const linkCellValue = grid[lastRowIndex][linkIdx];
    assert.ok(linkCellValue && String(linkCellValue).includes("drive.google.com"), `Link cell should contain filed PDF URL, got '${linkCellValue}'`);
  } finally {
    GasMockHarness.uninstall();
  }
});

test("Single-Submittal FF&E Incoming Workflow - End-to-End Integration", async () => {
  const harness = GasMockHarness.install();

  try {
    const spreadsheetId = "log-ffe-e2e";
    const ss = harness.sheetsService.openById(spreadsheetId);
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

    // 1. Intake Parsing: Raw FF&E input into ValidatedDocument
    const rawFormInput = {
      discipline: "FF&E",
      specTag: "CH-01",
      specTitle: "Lounge Chair",
      vendor: "Herman Miller",
      revision: "001",
      date: "2026-08-08",
      contact: "Vendor",
      action: "Received",
      incomingRouting: "To Review",
      notes: "FF&E sample review"
    };

    const validationResult = DocumentPipeline.processFormIntake(rawFormInput, {
      bypassTagValidation: true,
      bypassVendorValidation: true
    });
    assert.equal(validationResult.status, "success");
    const validatedDoc = (validationResult as any).data;
    assert.equal(validatedDoc.disciplineDetails.discipline, "FF&E");
    assert.equal(validatedDoc.disciplineDetails.specTag, "CH-01");
    assert.equal(validatedDoc.disciplineDetails.vendor, "Herman Miller");

    // 2. Setup Fakes
    const fakeDriveRepo = new FakeDriveFilingRepository();
    fakeDriveRepo.filedDocuments = [];
    const fakePdfService = new FakePdfDocumentService();
    const googleSheetsLogRepo = new GoogleSheetsLogRepository();

    const input = {
      validatedDoc,
      logFileId: spreadsheetId,
      logSheetId: 102,
      targetFolderId: "ffe-submittals-root",
      driveFileId: "file-orig-ffe",
      incomingRouting: "To Review",
      projectAbbr: "PROJ",
      emptyFallbacks: [],
      selectedAction: { action: "Received", abbr: " Rec", status: "Under Review" },
      strategy: new FFESubmittalStrategy(),
      logRepository: googleSheetsLogRepo,
      driveFilingRepository: fakeDriveRepo,
      pdfDocumentService: fakePdfService,
      spreadsheetApp: harness.sheetsService
    };

    // 3. Execute Workflow
    const result = await DocumentWorkflowModule.executeWorkflow(input as any);

    // 4. Verify Result & Filing
    assert.equal(result.targetKey, "CH-01-001");
    assert.equal(result.title, "Lounge Chair");
    assert.equal(fakeDriveRepo.filedDocuments[0].options.subfolderPath[0], "Closed");
    assert.equal(fakeDriveRepo.filedDocuments[0].options.subfolderPath[1], "CH");

    // 5. Verify Submittal FFE Sheet Link Cell Insertion
    const ffeSheet = ss.getSheetByName("Submittal FFE");
    assert.ok(ffeSheet, "Submittal FFE sheet must exist");
    const grid = ffeSheet!.getDataRange().getValues();
    const headers = grid[2].map((h: any) => String(h || "").trim());
    const linkIdx = headers.indexOf("Link");
    assert.notEqual(linkIdx, -1);

    const lastRowIndex = grid.length - 1;
    const linkCellValue = grid[lastRowIndex][linkIdx];
    assert.ok(linkCellValue && String(linkCellValue).includes("drive.google.com"), `Link cell should contain filed PDF URL, got '${linkCellValue}'`);
  } finally {
    GasMockHarness.uninstall();
  }
});

test("Single-Submittal Architecture Outgoing Workflow - End-to-End Integration", async () => {
  const harness = GasMockHarness.install();

  try {
    const spreadsheetId = "log-arch-outgoing";
    const ss = harness.sheetsService.openById(spreadsheetId);
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

    const rawFormInput = {
      discipline: "Architecture",
      section: "081100",
      number: "002",
      revision: "000",
      title: "Metal Doors and Frames",
      date: "2026-08-08",
      contact: "Architect",
      action: "Approved as Noted"
    };

    const validationResult = DocumentPipeline.processFormIntake(rawFormInput);
    assert.equal(validationResult.status, "success");
    const validatedDoc = (validationResult as any).data;

    const fakeDriveRepo = new FakeDriveFilingRepository();
    const googleSheetsLogRepo = new GoogleSheetsLogRepository();

    const input = {
      validatedDoc,
      logFileId: spreadsheetId,
      logSheetId: 101,
      targetFolderId: "root-folder-submittals",
      driveFileId: "file-outgoing-002",
      projectAbbr: "PROJ",
      emptyFallbacks: [],
      selectedAction: { action: "Approved as Noted", abbr: " AAN", status: "Closed" },
      strategy: new ArchitectureSubmittalStrategy(),
      logRepository: googleSheetsLogRepo,
      driveFilingRepository: fakeDriveRepo,
      spreadsheetApp: harness.sheetsService
    };

    const result = await DocumentWorkflowModule.executeWorkflow(input as any);

    assert.equal(result.targetKey, "081100-002-000");
    assert.equal(result.action, "Approved as Noted");

    const archSheet = ss.getSheetByName("Submittal Arch");
    const grid = archSheet!.getDataRange().getValues();
    const headers = grid[2].map((h: any) => String(h || "").trim());
    const linkIdx = headers.indexOf("Link");
    const lastRowIndex = grid.length - 1;
    const linkCellValue = grid[lastRowIndex][linkIdx];
    assert.ok(linkCellValue && String(linkCellValue).includes("drive.google.com"));
  } finally {
    GasMockHarness.uninstall();
  }
});
