/**
 * @file AnalyzeDocumentAction.test.ts
 * @description Unit tests for AnalyzeDocumentAction.
 */

import test from "node:test";
import assert from "node:assert";

const { FakeAiAnalysisAdapter } = require("./harness/index");
const { AnalyzeDocumentAction, defaultAnalyzeDocumentAction } = require("../src/AnalyzeDocumentAction");

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
    aiAnalysisService: fakeAi,
    extractPagesAction: mockExtractPagesAction
  });

  const blob = createMockBlob("full_document.pdf");
  const contextObj = {
    contacts: [{ abbr: "GC", name: "General Contractor" }],
    actions: [{ action: "Submitted" }]
  };

  const result = await action.execute({
    sourceBlob: blob,
    emailText: "Subject: Concrete submittal",
    contextObj
  });

  assert.strictEqual(extractExecuted, true, "ExtractPagesAction should be executed for 3-page slicing");
  assert.strictEqual(maxPagesCaptured, 3, "ExtractPagesAction should slice max 3 pages");
  assert.strictEqual(result.success, true);

  if (result.success) {
    // Assert candidate RawDocument field predictions
    const rawDocCandidate: RawDocument = {
      section: result.analysis.predictedSection || "",
      number: result.analysis.predictedNumber || "",
      revision: result.analysis.predictedRevision || "",
      title: result.analysis.predictedTitle || "",
      contact: result.analysis.predictedContactAbbr || "",
      action: result.analysis.predictedAction || "",
      specTag: result.analysis.predictedSpecTag || "",
      vendor: result.analysis.predictedVendor || ""
    };

    assert.strictEqual(rawDocCandidate.section, "033000");
    assert.strictEqual(rawDocCandidate.number, "001");
    assert.strictEqual(rawDocCandidate.revision, "0");
    assert.strictEqual(rawDocCandidate.title, "Concrete Structural Mix");
    assert.strictEqual(rawDocCandidate.contact, "GC");
    assert.strictEqual(rawDocCandidate.action, "Submitted");
    assert.strictEqual(rawDocCandidate.specTag, "CONC-01");
    assert.strictEqual(rawDocCandidate.vendor, "Acme Concrete");
  }

  assert.strictEqual(fakeAi.analyzeCalls.length, 1);
  assert.strictEqual(fakeAi.analyzeCalls[0].sourceBlob.getName(), "sliced.pdf");
  assert.strictEqual(fakeAi.analyzeCalls[0].emailText, "Subject: Concrete submittal");
});

test("AnalyzeDocumentAction throws error when input or sourceBlob is missing", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  const action = new AnalyzeDocumentAction({ aiAnalysisService: fakeAi });

  await assert.rejects(async () => {
    await action.execute({} as any);
  }, /INVALID_ANALYZE_INPUT/);
});

test("AnalyzeDocumentAction falls back to defaultAiAnalysisService global seam when none injected", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  fakeAi.setAnalyzeSubmittalResult({
    success: true,
    analysis: { predictedTitle: "Global Seam Title" }
  });

  (globalThis as any).defaultAiAnalysisService = fakeAi;

  const action = new AnalyzeDocumentAction();
  const blob = createMockBlob();
  const contextObj = { contacts: [], actions: [] };

  const result = await action.execute({
    sourceBlob: blob,
    contextObj
  });

  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.analysis.predictedTitle, "Global Seam Title");
  }
});

test("defaultAnalyzeDocumentAction global seam exists", () => {
  assert.ok(defaultAnalyzeDocumentAction);
  assert.strictEqual(typeof defaultAnalyzeDocumentAction.execute, "function");
});
