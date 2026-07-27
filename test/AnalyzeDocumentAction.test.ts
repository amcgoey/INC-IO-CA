/**
 * @file AnalyzeDocumentAction.test.ts
 * @description Unit tests for AnalyzeDocumentAction.
 */

import test from "node:test";
import assert from "node:assert";

const { FakeAiAnalysisAdapter } = require("./harness/index");
const { AnalyzeDocumentAction, defaultAnalyzeDocumentAction } = require("../src/AnalyzeDocumentAction");

function createMockBlob(content: string = "dummy pdf content"): GoogleAppsScript.Base.Blob {
  return {
    getBytes: () => Buffer.from(content),
    getContentType: () => "application/pdf",
    getName: () => "test.pdf",
    copyBlob: function() { return this; }
  } as any;
}

test("AnalyzeDocumentAction executes analyzeSubmittal using injected FakeAiAnalysisAdapter", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  fakeAi.setAnalyzeSubmittalResult({
    success: true,
    analysis: {
      predictedSection: "033000",
      predictedNumber: "001",
      predictedRevision: "0",
      predictedTitle: "Concrete Structural Mix",
      predictedContactAbbr: "GC",
      predictedAction: "Submitted"
    }
  });

  const action = new AnalyzeDocumentAction({ aiAnalysisService: fakeAi });
  const blob = createMockBlob();
  const contextObj = {
    contacts: [{ abbr: "GC", name: "General Contractor" }],
    actions: [{ action: "Submitted" }]
  };

  const result = await action.execute({
    sourceBlob: blob,
    emailText: "Subject: Concrete submittal",
    contextObj
  });

  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.analysis.predictedSection, "033000");
    assert.strictEqual(result.analysis.predictedNumber, "001");
    assert.strictEqual(result.analysis.predictedContactAbbr, "GC");
  }

  assert.strictEqual(fakeAi.analyzeCalls.length, 1);
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
