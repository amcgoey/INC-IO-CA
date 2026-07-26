import test from "node:test";
import assert from "node:assert";
import { createTestContext, TestContext } from "./TestContext";
import { FakeLogRepository } from "./fakes/FakeLogRepository";
import { FakeDriveFilingRepository } from "./fakes/FakeDriveFilingRepository";
import { FakePdfDocumentService } from "./fakes/FakePdfDocumentService";
import { FakeAiAnalysisAdapter } from "./fakes/FakeAiAnalysisAdapter";

test("createTestContext initializes all domain fakes simultaneously", () => {
  const context = createTestContext();

  assert.ok(context.logRepository instanceof FakeLogRepository);
  assert.ok(context.driveFilingRepository instanceof FakeDriveFilingRepository);
  assert.ok(context.pdfDocumentService instanceof FakePdfDocumentService);
  assert.ok(context.aiAnalysisAdapter instanceof FakeAiAnalysisAdapter);
});

test("createTestContext propagates custom options to domain fakes", () => {
  const context = createTestContext({
    logRepositorySettings: {
      "sheet-1": {
        logFileId: "sheet-1",
        submittalTabName: "CustomSubmittals",
        incomingTabName: "CustomIncoming",
        outgoingTabName: "CustomOutgoing"
      }
    },
    driveFilingCustomPaths: {
      "file-123": "G:\\Custom\\Path\\file-123.pdf"
    },
    pdfFormActions: {
      "file-123": "REVIEWED"
    }
  });

  assert.strictEqual(context.logRepository.getLogSettings("sheet-1", "Arch").submittalTabName, "CustomSubmittals");
  assert.strictEqual(context.driveFilingRepository.getLocalPath("file-123"), "G:\\Custom\\Path\\file-123.pdf");
});

test("getLoggedRows and getFiledDocuments convenience getters reflect state of fakes", () => {
  const context = createTestContext();

  assert.deepStrictEqual(context.getLoggedRows(), []);
  assert.deepStrictEqual(context.getFiledDocuments(), []);

  context.logRepository.insertLogRow("sheet-1", ["Col1"], ["Val1"], { finalRowIndex: 5, action: "insert", insertedBlankCount: 0 });
  context.driveFilingRepository.fileDocument({ fileId: "file-1" }, { subfolderPath: ["Closed"] });

  assert.strictEqual(context.getLoggedRows().length, 1);
  assert.strictEqual(context.getLoggedRows()[0].spreadsheetId, "sheet-1");

  assert.strictEqual(context.getFiledDocuments().length, 1);
  assert.strictEqual(context.getFiledDocuments()[0].result.fileId, "file-1");
});

test("resetAll clears recorded state across all domain fakes", () => {
  const context = createTestContext();

  context.logRepository.getLogSettings("sheet-1", "Arch");
  context.logRepository.insertLogRow("sheet-1", ["Col1"], ["Val1"], { finalRowIndex: 5, action: "insert", insertedBlankCount: 0 });

  context.driveFilingRepository.fileDocument({ fileId: "file-1" }, { subfolderPath: ["Closed"] });

  context.pdfDocumentService.extractFormAction("file-1");

  context.aiAnalysisAdapter.triageEmail({ subject: "Test Email", body: "Test Body" });

  assert.ok(context.logRepository.calls.length > 0);
  assert.ok(context.getLoggedRows().length > 0);
  assert.ok(context.driveFilingRepository.calls.length > 0);
  assert.ok(context.getFiledDocuments().length > 0);
  assert.ok(context.pdfDocumentService.calls.length > 0);
  assert.ok(context.aiAnalysisAdapter.triageCalls.length > 0);

  context.resetAll();

  assert.strictEqual(context.logRepository.calls.length, 0);
  assert.strictEqual(context.getLoggedRows().length, 0);
  assert.strictEqual(context.logRepository.appendedDocuments.length, 0);
  assert.strictEqual(context.driveFilingRepository.calls.length, 0);
  assert.strictEqual(context.getFiledDocuments().length, 0);
  assert.strictEqual(context.pdfDocumentService.extractCalls.length, 0);
  assert.strictEqual(context.pdfDocumentService.stampCalls.length, 0);
  assert.strictEqual(context.pdfDocumentService.sliceCalls.length, 0);
  assert.strictEqual(context.pdfDocumentService.calls.length, 0);
  assert.strictEqual(context.aiAnalysisAdapter.triageCalls.length, 0);
  assert.strictEqual(context.aiAnalysisAdapter.analyzeCalls.length, 0);
});
