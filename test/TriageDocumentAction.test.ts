/**
 * @file TriageDocumentAction.test.ts
 * @description Unit tests for TriageDocumentAction.
 */

import test from "node:test";
import assert from "node:assert";

const { FakeAiAnalysisAdapter } = require("./harness/index");
const { TriageDocumentAction, defaultTriageDocumentAction } = require("../src/TriageDocumentAction");

const sampleEmailData: EmailData = {
  subject: "Submittal #033000-01 Concrete Mix",
  sender: "gc@builder.com",
  replyTo: "gc@builder.com",
  to: "arch@firm.com",
  cc: "",
  labels: ["Submittal"],
  attachmentNames: ["Concrete_Specs.pdf"],
  body: "Please find attached submittal for Project Alpha."
};

test("TriageDocumentAction executes triageEmail using injected FakeAiAnalysisAdapter", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  fakeAi.setTriageResult({
    success: true,
    prediction: {
      predictedProjectName: "Project Alpha",
      predictedDiscipline: "Architecture"
    }
  });

  const action = new TriageDocumentAction({ aiAnalysisService: fakeAi });
  const result = await action.execute({
    emailData: sampleEmailData,
    messageId: "msg-123"
  });

  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.prediction.predictedProjectName, "Project Alpha");
    assert.strictEqual(result.prediction.predictedDiscipline, "Architecture");
  }

  assert.strictEqual(fakeAi.triageCalls.length, 1);
  assert.strictEqual(fakeAi.triageCalls[0].messageId, "msg-123");
  assert.strictEqual(fakeAi.triageCalls[0].emailData.subject, "Submittal #033000-01 Concrete Mix");
});

test("TriageDocumentAction throws error when input or emailData is missing", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  const action = new TriageDocumentAction({ aiAnalysisService: fakeAi });

  await assert.rejects(async () => {
    await action.execute({} as any);
  }, /INVALID_TRIAGE_INPUT/);
});

test("TriageDocumentAction falls back to defaultAiAnalysisService global seam when none injected", async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  fakeAi.setTriageResult({
    success: true,
    prediction: { predictedProjectName: "Project Beta", predictedDiscipline: "FF&E" }
  });

  (globalThis as any).defaultAiAnalysisService = fakeAi;

  const action = new TriageDocumentAction();
  const result = await action.execute({ emailData: sampleEmailData });

  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.prediction.predictedProjectName, "Project Beta");
    assert.strictEqual(result.prediction.predictedDiscipline, "FF&E");
  }
});

test("defaultTriageDocumentAction global seam exists", () => {
  assert.ok(defaultTriageDocumentAction);
  assert.strictEqual(typeof defaultTriageDocumentAction.execute, "function");
});
