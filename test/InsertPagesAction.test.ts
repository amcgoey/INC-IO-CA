import test from "node:test";
import assert from "node:assert";

const { InsertPagesAction, defaultInsertPagesAction } = require("../src/InsertPagesAction");
const { FakePdfDocumentService } = require("./harness/index");
const { createTestContext } = require("../src/core/workflow/WorkflowContextFactory");

test("InsertPagesAction fail-fast guard throws when blob is missing in context", async () => {
  const fakePdfService = new FakePdfDocumentService();
  const context = createTestContext(undefined, { pdfDocumentService: fakePdfService }, { blob: undefined, coverPageTemplateId: "tmpl-123" });
  const action = new InsertPagesAction();

  await assert.rejects(async () => {
    await action.execute(context);
  }, /InsertPagesAction requires 'blob' in context/);
});

test("InsertPagesAction fail-fast guard throws when pdfService adapter is missing", async () => {
  const sourceBlob = { getName: () => "input.pdf" } as any;
  const context = {
    blob: sourceBlob,
    coverPageTemplateId: "tmpl-123",
    adapters: {}
  } as any;
  const action = new InsertPagesAction();

  await assert.rejects(async () => {
    await action.execute(context);
  }, /InsertPagesAction requires 'pdfService' adapter in context.adapters/);
});

test("InsertPagesAction context pipeline execution stamps PDF and updates context blob", async () => {
  const fakePdfService = new FakePdfDocumentService();
  const sourceBlob = { getName: () => "input.pdf", copyBlob: () => sourceBlob } as any;
  const stampedBlob = { getName: () => "stamped_cover.pdf" } as any;
  fakePdfService.setStampResultBlob(stampedBlob);

  const context = createTestContext(undefined, { pdfDocumentService: fakePdfService }, {
    blob: sourceBlob,
    coverPageTemplateId: "tmpl-555",
    analysis: { predictedTitle: "Sample Submittal Title", predictedSection: "033000" }
  });

  const action = new InsertPagesAction();
  const updatedContext = await action.execute(context);

  assert.strictEqual(updatedContext.blob, stampedBlob);
  assert.strictEqual(fakePdfService.stampCalls.length, 1);
  assert.strictEqual(fakePdfService.stampCalls[0].options.templateId, "tmpl-555");
});

test("InsertPagesAction catches TEMPLATE_MISSING error and returns sourceBlob copy", async () => {
  const fakePdfService = new FakePdfDocumentService();
  fakePdfService.stampSubmittal = async () => {
    throw new Error("TEMPLATE_MISSING");
  };

  let copyBlobCalled = false;
  const copiedBlob = { getName: () => "fallback.pdf" } as any;

  const sourceBlob = {
    getName: () => "original.pdf",
    copyBlob: () => {
      copyBlobCalled = true;
      return copiedBlob;
    }
  } as any;

  const context = createTestContext(undefined, { pdfDocumentService: fakePdfService }, {
    blob: sourceBlob,
    coverPageTemplateId: "missing-template"
  });

  const action = new InsertPagesAction();
  const updatedContext = await action.execute(context);

  assert.strictEqual(updatedContext.blob, copiedBlob);
  assert.strictEqual(copyBlobCalled, true);
});

test("InsertPagesAction re-throws unexpected errors from pdfDocumentService", async () => {
  const customError = new Error("PDF_CORRUPT");
  const failingPdfService = {
    stampSubmittal: async () => {
      throw customError;
    }
  } as any;

  const sourceBlob = { getName: () => "test.pdf" } as any;
  const context = createTestContext(undefined, { pdfDocumentService: failingPdfService }, {
    blob: sourceBlob,
    coverPageTemplateId: "tmpl-123"
  });

  const action = new InsertPagesAction();

  await assert.rejects(
    async () => {
      await action.execute(context);
    },
    (err: any) => {
      assert.strictEqual(err, customError);
      return true;
    }
  );
});

test("defaultInsertPagesAction global seam exists", () => {
  assert.ok(defaultInsertPagesAction);
  assert.strictEqual(typeof defaultInsertPagesAction.execute, "function");
});