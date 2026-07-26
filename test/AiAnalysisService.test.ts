// test/AiAnalysisService.test.ts

import test from "node:test";
import assert from "node:assert";

// Global environment mocks before requiring modules
(globalThis as any).CONFIG = {
  GEMINI_API_URL_TRIAGE: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  GEMINI_API_URL_ANALYSIS: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
};

const { InMemoryCacheAdapter } = require("./harness/index");
const { FakeDriveNameProvider } = require("./harness/index");
const { FakePdfDocumentService } = require("./harness/index");
const { GeminiAiAnalysisAdapter } = require("../src/AiAnalysisService");
const { FakeAiAnalysisAdapter } = require("./harness/index");

function setupPropertiesService(apiKey: string | null = "test-gemini-api-key") {
  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? apiKey : null),
      getProperties: () => (apiKey ? { GEMINI_API_KEY: apiKey } : {})
    })
  };
}

function createHttpResponse(statusCode: number, bodyText: string) {
  return {
    getResponseCode: () => statusCode,
    getContentText: () => bodyText,
    getBlob: () => ({})
  };
}

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

test("GeminiAiAnalysisAdapter triageEmail success path with drive matching", async () => {
  setupPropertiesService("valid-api-key-12345");

  let fetchCalledUrl = "";
  (globalThis as any).UrlFetchApp = {
    fetch: (url: string, options: any) => {
      fetchCalledUrl = url;
      return createHttpResponse(200, JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                predictedProjectName: "Project Alpha",
                predictedDiscipline: "Architecture"
              })
            }]
          }
        }]
      }));
    }
  };

  const driveProvider = new FakeDriveNameProvider(["Project Alpha", "Project Beta"]);
  const cache = new InMemoryCacheAdapter();
  const pdfService = new FakePdfDocumentService();

  const adapter = new GeminiAiAnalysisAdapter({
    driveNameProvider: driveProvider,
    cacheAdapter: cache,
    pdfDocumentService: pdfService
  });

  const result = await adapter.triageEmail(sampleEmailData, "msg-001");

  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.prediction.predictedProjectName, "Project Alpha");
    assert.strictEqual(result.prediction.predictedDiscipline, "Architecture");
  }
  assert.ok(fetchCalledUrl.includes("valid-api-key-12345"));
});

test("GeminiAiAnalysisAdapter triageEmail clears project name if not matched in drive list", async () => {
  setupPropertiesService("valid-api-key-12345");

  (globalThis as any).UrlFetchApp = {
    fetch: () => createHttpResponse(200, JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              predictedProjectName: "Unlisted Project X",
              predictedDiscipline: "FF&E"
            })
          }]
        }
      }]
    }))
  };

  const driveProvider = new FakeDriveNameProvider(["Project Alpha", "Project Beta"]);
  const cache = new InMemoryCacheAdapter();
  const adapter = new GeminiAiAnalysisAdapter({ driveNameProvider: driveProvider, cacheAdapter: cache });

  const result = await adapter.triageEmail(sampleEmailData, "msg-unmatched");

  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.prediction.predictedProjectName, "");
    assert.strictEqual(result.prediction.predictedDiscipline, "FF&E");
  }
});

test("GeminiAiAnalysisAdapter triageEmail prediction caching (get/put)", async () => {
  setupPropertiesService("valid-api-key-12345");

  let fetchCount = 0;
  (globalThis as any).UrlFetchApp = {
    fetch: () => {
      fetchCount++;
      return createHttpResponse(200, JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                predictedProjectName: "Project Alpha",
                predictedDiscipline: "Architecture"
              })
            }]
          }
        }]
      }));
    }
  };

  const driveProvider = new FakeDriveNameProvider(["Project Alpha"]);
  const cache = new InMemoryCacheAdapter();
  const adapter = new GeminiAiAnalysisAdapter({ driveNameProvider: driveProvider, cacheAdapter: cache });

  // First call should fetch and populate cache
  const res1 = await adapter.triageEmail(sampleEmailData, "msg-cache-test");
  assert.strictEqual(res1.success, true);
  assert.strictEqual(fetchCount, 1);

  // Verify cached entry exists
  const cachedVal = cache.get("ai_pred_msg-cache-test");
  assert.ok(cachedVal !== null);

  // Second call should return cached prediction without fetching UrlFetchApp
  const res2 = await adapter.triageEmail(sampleEmailData, "msg-cache-test");
  assert.strictEqual(res2.success, true);
  assert.strictEqual(fetchCount, 1);
  if (res2.success) {
    assert.strictEqual(res2.prediction.predictedProjectName, "Project Alpha");
  }
});

test("GeminiAiAnalysisAdapter triageEmail missing key error", async () => {
  setupPropertiesService(null); // No API key

  const adapter = new GeminiAiAnalysisAdapter();
  const result = await adapter.triageEmail(sampleEmailData, "msg-nokey");

  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.code, "MISSING_KEY");
    assert.strictEqual(result.error.userMessage, "Missing GEMINI_API_KEY in Script Properties");
  }
});

test("GeminiAiAnalysisAdapter triageEmail handles rate limiting (503/429)", async () => {
  setupPropertiesService("valid-api-key-12345");

  (globalThis as any).UrlFetchApp = {
    fetch: () => createHttpResponse(503, "Service Unavailable")
  };

  const adapter = new GeminiAiAnalysisAdapter();
  const result = await adapter.triageEmail(sampleEmailData, "msg-503");

  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.code, "RATE_LIMITED");
    assert.strictEqual(result.error.userMessage, "AI auto-triage skipped due to high server demand.");
  }
});

test("GeminiAiAnalysisAdapter triageEmail handles API failure (500)", async () => {
  setupPropertiesService("valid-api-key-12345");

  (globalThis as any).UrlFetchApp = {
    fetch: () => createHttpResponse(500, "Internal Server Error")
  };

  const adapter = new GeminiAiAnalysisAdapter();
  const result = await adapter.triageEmail(sampleEmailData, "msg-500");

  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.code, "API_FAILURE");
    assert.ok(result.error.userMessage.includes("HTTP 500"));
  }
});

test("GeminiAiAnalysisAdapter triageEmail handles parse failure scenario", async () => {
  setupPropertiesService("valid-api-key-12345");

  (globalThis as any).UrlFetchApp = {
    fetch: () => createHttpResponse(200, "Not Valid JSON Response")
  };

  const adapter = new GeminiAiAnalysisAdapter();
  const result = await adapter.triageEmail(sampleEmailData, "msg-badjson");

  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.code, "PARSE_FAILURE");
    assert.ok(result.error.userMessage.includes("Failed to parse AI prediction"));
  }
});

test("FakeAiAnalysisAdapter stubs triage and deep analysis calls", async () => {
  const fakeAdapter = new FakeAiAnalysisAdapter();

  fakeAdapter.setTriageResult({
    success: true,
    prediction: { predictedProjectName: "Fake Drive", predictedDiscipline: "FF&E" }
  });

  const triageRes = await fakeAdapter.triageEmail(sampleEmailData, "msg-fake-1");
  assert.strictEqual(triageRes.success, true);
  if (triageRes.success) {
    assert.strictEqual(triageRes.prediction.predictedProjectName, "Fake Drive");
    assert.strictEqual(triageRes.prediction.predictedDiscipline, "FF&E");
  }
  assert.strictEqual(fakeAdapter.triageCalls.length, 1);
  assert.strictEqual(fakeAdapter.triageCalls[0].messageId, "msg-fake-1");
});

test("checkAiModelHealth reports missing key or status when executed", () => {
  const { checkAiModelHealth } = require("../src/AiAnalysisService");
  const health = checkAiModelHealth();
  assert.ok(health.triage);
  assert.ok(health.analysis);
  assert.strictEqual(typeof health.triage.ok, "boolean");
  assert.strictEqual(typeof health.analysis.ok, "boolean");
});

