/**
 * @file AnalyzeDocumentAction.test.ts
 * @description Unit tests for AnalyzeDocumentAction.
 */

import test from "node:test";
import assert from "node:assert";

const { FakeAiAnalysisAdapter } = require("./harness/index");
const { AnalyzeDocumentAction, defaultAnalyzeDocumentAction } = require("../src/AnalyzeDocumentAction");
const { createTestContext } = require("../src/WorkflowContextFactory");

function createMockBlob(name: string = "test.pdf", content: string = "dummy pdf content"): GoogleAppsScript.Base.Blob {
  return {
    getBytes: () => Buffer.from(content),
    getContentType: () => "application/pdf",
    getName: () => name,
    copyBlob: function() { return this; }
  } as any;
}

test("AnalyzeDocumentAction slices PDF to 3 pages via ExtractPagesAction and executes analyzeSubmittal", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  fakeAi.setAnalyzeSubmittalResult({
    success: true,
    analysis: {
      predictedSection: "033000",
      predictedNumber: "001",
      predictedRevision: "0",
      predictedTitle: "Concrete Structural Mix",
      predictedContactAbbr: "GC",
      predictedAction: "Submitted",
      predictedSpecTag: "CONC-01",
      predictedVendor: "Acme Concrete"
    }
  });

  let extractExecuted = false;
  let maxPagesCaptured = 0;
  const mockSlicedBlob = createMockBlob("sliced.pdf", "sliced content");

  const mockExtractPagesAction: ExtractPagesAction = {
    async execute(input: ExtractPagesInput | GoogleAppsScript.Base.Blob): Promise<ExtractPagesResult> {
      extractExecuted = true;
      if (input && typeof (input as ExtractPagesInput).maxPages === "number") {
        maxPagesCaptured = (input as ExtractPagesInput).maxPages!;
      }
      return { blob: mockSlicedBlob, base64: "c2xpY2Vk" };
    }
  } as any;

  const action = new AnalyzeDocumentAction({
    extractPagesAction: mockExtractPagesAction
  });

  const blob = createMockBlob("full_document.pdf");
  const contextObj = {
    contacts: [{ abbr: "GC", name: "General Contractor" }],
    actions: [{ action: "Submitted" }]
  };

  const context = createTestContext(undefined, { aiAnalysisService: fakeAi }, {
    blob,
    coverPageTemplateId: "tmpl-123",
    emailText: "Subject: Concrete submittal",
    contextObj
  });

  const updatedContext = await action.execute(context);

  assert.strictEqual(extractExecuted, true, "ExtractPagesAction should be executed for 3-page slicing");
  assert.strictEqual(maxPagesCaptured, 3, "ExtractPagesAction should slice max 3 pages");
  assert.ok(updatedContext.analysis);
  assert.strictEqual(updatedContext.analysis.predictedSection, "033000");
  assert.strictEqual(updatedContext.analysis.predictedTitle, "Concrete Structural Mix");

  assert.strictEqual(fakeAi.analyzeCalls.length, 1);
  assert.strictEqual(fakeAi.analyzeCalls[0].sourceBlob.getName(), "sliced.pdf");
  assert.strictEqual(fakeAi.analyzeCalls[0].emailText, "Subject: Concrete submittal");
});

test("AnalyzeDocumentAction fail-fast guard throws when blob is missing in context", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  const context = createTestContext(undefined, { aiAnalysisService: fakeAi }, { blob: undefined });
  const action = new AnalyzeDocumentAction();

  await assert.rejects(async () => {
    await action.execute(context);
  }, /AnalyzeDocumentAction requires 'blob' in context/);
});

test("AnalyzeDocumentAction fail-fast guard throws when aiService adapter is missing", async () => {
  const blob = createMockBlob();
  const context = {
    blob,
    adapters: {}
  } as any;
  const action = new AnalyzeDocumentAction();

  await assert.rejects(async () => {
    await action.execute(context);
  }, /AnalyzeDocumentAction requires 'aiService' adapter in context.adapters/);
});

test("AnalyzeDocumentAction context pipeline execution returns updated context with analysis", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  fakeAi.setAnalyzeSubmittalResult({
    success: true,
    analysis: {
      predictedTitle: "Context Submittal Title",
      predictedSection: "099100"
    }
  });

  const blob = createMockBlob("doc.pdf");
  const context = createTestContext(undefined, { aiAnalysisService: fakeAi }, { blob });
  const action = new AnalyzeDocumentAction();

  const updatedContext = await action.execute(context);
  assert.ok(updatedContext.analysis);
  assert.strictEqual(updatedContext.analysis.predictedTitle, "Context Submittal Title");
  assert.strictEqual(updatedContext.analysis.predictedSection, "099100");
});

test("defaultAnalyzeDocumentAction global seam exists", () => {
  assert.ok(defaultAnalyzeDocumentAction);
  assert.strictEqual(typeof defaultAnalyzeDocumentAction.execute, "function");
});