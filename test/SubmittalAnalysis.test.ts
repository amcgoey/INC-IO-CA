import test from "node:test";
import assert from "node:assert";

import { GeminiAiAnalysisAdapter, defaultAiAnalysisService } from "../src/AiAnalysisService";
import { FakeAiAnalysisAdapter, FakePdfDocumentService, FakeCacheAdapter } from "./harness/index";

function createMockBlob(bytesLength: number, name = "test.pdf"): any {
  const bytes = new Int8Array(bytesLength);
  return {
    getBytes: () => bytes,
    getName: () => name,
    getContentType: () => "application/pdf"
  };
}

test("FakeAiAnalysisAdapter records calls and returns stubbed analysis result", async () => {
  const adapter = new FakeAiAnalysisAdapter();
  const mockBlob = createMockBlob(100);
  const context: DeepAnalysisContext = {
    contacts: [{ abbr: "GC", name: "General Contractor" }],
    actions: [{ action: "Revise & Resubmit" }]
  };

  const stubResult: DeepAnalysisResult = {
    success: true,
    analysis: {
      predictedSection: "08 11 13",
      predictedNumber: "001",
      predictedRevision: "0",
      predictedTitle: "Hollow Metal Doors",
      predictedContactAbbr: "GC",
      predictedAction: "Revise & Resubmit"
    }
  };

  adapter.setAnalysisResult(stubResult);
  const result = await adapter.analyzeSubmittal(mockBlob, "Email text context", context);

  assert.deepStrictEqual(result, stubResult);
  assert.strictEqual(adapter.analyzeCalls.length, 1);
  assert.strictEqual(adapter.analyzeCalls[0].sourceBlob, mockBlob);
  assert.strictEqual(adapter.analyzeCalls[0].emailText, "Email text context");
  assert.deepStrictEqual(adapter.analyzeCalls[0].contextObj, context);
});

test("GeminiAiAnalysisAdapter returns MISSING_KEY when GEMINI_API_KEY is not configured", async () => {
  // Ensure global script properties mock / getGeminiApiKey returns null
  const originalProperties = (globalThis as any).PropertiesService;
  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => null,
      getProperties: () => ({})
    })
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter();
    const mockBlob = createMockBlob(100);
    const context: DeepAnalysisContext = { contacts: [], actions: [] };

    const result = await adapter.analyzeSubmittal(mockBlob, "some email text", context);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, "MISSING_KEY");
      assert.strictEqual(result.error.userMessage, "Missing GEMINI_API_KEY in Script Properties");
    }
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
  }
});

test("GeminiAiAnalysisAdapter small PDF (<= 2MB) uses direct base64 encoding without calling slicePagesToBase64", async () => {
  const fakePdfService = new FakePdfDocumentService();
  fakePdfService.setSliceResultBase64("SLICED_BASE64_SHOULD_NOT_BE_USED");

  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let fetchedUrl = "";
  let fetchedPayload: any = null;

  (globalThis as any).UrlFetchApp = {
    fetch: (url: string, options: any) => {
      fetchedUrl = url;
      fetchedPayload = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      predictedSection: "09 29 00",
                      predictedTitle: "Gypsum Board",
                      predictedContactAbbr: "SUB",
                      predictedAction: "Approved"
                    })
                  }
                ]
              }
            }
          ]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: (bytes: any) => "DIRECT_SMALL_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ pdfDocumentService: fakePdfService });
    const smallBlob = createMockBlob(1024 * 1024); // 1 MB
    const context: DeepAnalysisContext = {
      contacts: [{ abbr: "SUB", name: "Subcontractor" }],
      actions: [{ action: "Approved" }]
    };

    const result = await adapter.analyzeSubmittal(smallBlob, "Small PDF analysis", context);

    assert.strictEqual(fakePdfService.sliceCalls.length, 0); // Not called for small files
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.analysis.predictedSection, "09 29 00");
      assert.strictEqual(result.analysis.predictedTitle, "Gypsum Board");
      assert.strictEqual(result.analysis.predictedContactAbbr, "SUB");
      assert.strictEqual(result.analysis.predictedAction, "Approved");
    }
    assert.strictEqual(fetchedPayload.contents[0].parts[1].inlineData.data, "DIRECT_SMALL_BASE64");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("GeminiAiAnalysisAdapter large PDF (> 2MB) delegates to pdfDocumentService.slicePagesToBase64", async () => {
  const fakePdfService = new FakePdfDocumentService();
  fakePdfService.setSliceResultBase64("SLICED_LARGE_PDF_BASE64");

  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let fetchedPayload: any = null;

  (globalThis as any).UrlFetchApp = {
    fetch: (url: string, options: any) => {
      fetchedPayload = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      predictedSection: "03 30 00",
                      predictedTitle: "Cast-in-Place Concrete"
                    })
                  }
                ]
              }
            }
          ]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: (bytes: any) => "SLICED_LARGE_PDF_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ pdfDocumentService: fakePdfService });
    const largeBlob = createMockBlob(3 * 1024 * 1024); // 3 MB (> 2 MB)
    const context: DeepAnalysisContext = { contacts: [], actions: [] };

    const result = await adapter.analyzeSubmittal(largeBlob, "Large PDF email", context);

    assert.strictEqual(fakePdfService.sliceCalls.length, 1);
    assert.strictEqual(fakePdfService.sliceCalls[0].sourceBlob, largeBlob);
    assert.strictEqual(fakePdfService.sliceCalls[0].maxPages, 3);
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.analysis.predictedSection, "03 30 00");
    }
    assert.strictEqual(fetchedPayload.contents[0].parts[1].inlineData.data, "SLICED_LARGE_PDF_BASE64");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("GeminiAiAnalysisAdapter returns PDF_PROCESSING_ERROR when slicing PDF throws", async () => {
  const fakePdfService = new FakePdfDocumentService();
  fakePdfService.slicePagesToBase64 = async () => {
    throw new Error("Corrupt PDF header");
  };

  const originalProperties = (globalThis as any).PropertiesService;
  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => "AIzaSyTestKey123",
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ pdfDocumentService: fakePdfService });
    const largeBlob = createMockBlob(3 * 1024 * 1024); // 3 MB
    const context: DeepAnalysisContext = { contacts: [], actions: [] };

    const result = await adapter.analyzeSubmittal(largeBlob, "Email context", context);

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, "PDF_PROCESSING_ERROR");
      assert.ok(result.error.userMessage.includes("Corrupt PDF header"));
    }
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
  }
});

test("GeminiAiAnalysisAdapter returns RATE_LIMITED when Gemini API responds with 429 or 503", async () => {
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => "AIzaSyTestKey123",
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  (globalThis as any).UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 429,
      getContentText: () => "Rate limit exceeded for AIzaSyTestKey123"
    })
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "SMALL_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter();
    const smallBlob = createMockBlob(100);
    const context: DeepAnalysisContext = { contacts: [], actions: [] };

    const result = await adapter.analyzeSubmittal(smallBlob, "Email text", context);

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, "RATE_LIMITED");
      assert.ok(result.error.userMessage.includes("429"));
      // Ensure key was sanitized in userMessage
      assert.ok(!result.error.userMessage.includes("AIzaSyTestKey123"));
      assert.ok(result.error.userMessage.includes("[REDACTED_GEMINI_API_KEY]") || result.error.userMessage.includes("[REDACTED_API_KEY]"));
    }
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("GeminiAiAnalysisAdapter returns API_FAILURE on general HTTP error", async () => {
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => "AIzaSyTestKey123",
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  (globalThis as any).UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 500,
      getContentText: () => "Internal Server Error in Gemini Service"
    })
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "SMALL_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter();
    const smallBlob = createMockBlob(100);
    const context: DeepAnalysisContext = { contacts: [], actions: [] };

    const result = await adapter.analyzeSubmittal(smallBlob, "Email text", context);

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, "API_FAILURE");
      assert.ok(result.error.userMessage.includes("500"));
    }
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("GeminiAiAnalysisAdapter returns PARSE_FAILURE when response contains malformed JSON", async () => {
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => "AIzaSyTestKey123",
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  (globalThis as any).UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "{ invalid json string here "
                }
              ]
            }
          }
        ]
      })
    })
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "SMALL_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter();
    const smallBlob = createMockBlob(100);
    const context: DeepAnalysisContext = { contacts: [], actions: [] };

    const result = await adapter.analyzeSubmittal(smallBlob, "Email text", context);

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, "PARSE_FAILURE");
    }
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("defaultAiAnalysisService global seam exists", () => {
  assert.ok(defaultAiAnalysisService);
  assert.strictEqual(typeof defaultAiAnalysisService.analyzeSubmittal, "function");
});

test("GeminiAiAnalysisAdapter lazily resolves defaultPdfDocumentService when constructed prior to defaultPdfDocumentService binding", async () => {
  const fakePdfService = new FakePdfDocumentService();
  fakePdfService.setSliceResultBase64("LAZY_SLICED_BASE64");

  const originalDefaultPdfService = (globalThis as any).defaultPdfDocumentService;
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  try {
    delete (globalThis as any).defaultPdfDocumentService;
    // Instantiate adapter when defaultPdfDocumentService is NOT in global scope
    const adapter = new GeminiAiAnalysisAdapter();

    // Now bind defaultPdfDocumentService globally (simulating late load order in GAS)
    (globalThis as any).defaultPdfDocumentService = fakePdfService;

    (globalThis as any).PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
        getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
      })
    };

    (globalThis as any).UrlFetchApp = {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: "03 30 00" }) }] } }]
        })
      })
    };

    (globalThis as any).Utilities = {
      base64Encode: () => "BASE64",
      sleep: () => {}
    };

    const largeBlob = createMockBlob(3 * 1024 * 1024); // > 2MB
    const result = await adapter.analyzeSubmittal(largeBlob, "Email text", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    assert.strictEqual(fakePdfService.sliceCalls.length, 1);
  } finally {
    (globalThis as any).defaultPdfDocumentService = originalDefaultPdfService;
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 313: analyzeSubmittal sends requests to gemini-3.8-flash endpoint and includes default thinkingConfig", async () => {
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let calledUrl = "";
  let payloadObj: any = null;

  (globalThis as any).UrlFetchApp = {
    fetch: (url: string, options: any) => {
      calledUrl = url;
      payloadObj = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  predictedSection: "08 11 13",
                  predictedTitle: "Hollow Metal Doors"
                })
              }]
            }
          }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "BASE64_DATA",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter();
    const blob = createMockBlob(1024);
    const result = await adapter.analyzeSubmittal(blob, "Analyze submittal", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    // Verifies endpoint targets gemini-3.8-flash
    assert.ok(calledUrl.includes("models/gemini-3.8-flash:generateContent"));
    // Verifies thinkingConfig injected with default 0
    assert.ok(payloadObj?.generationConfig?.thinkingConfig);
    assert.strictEqual(payloadObj.generationConfig.thinkingConfig.thinkingBudget, 0);
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 313: analyzeSubmittal configures thinkingBudget from Script Properties and omits when negative", async () => {
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  let scriptProps: Record<string, string> = {
    GEMINI_API_KEY: "AIzaSyTestKey123",
    GEMINI_THINKING_BUDGET: "1024"
  };

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => scriptProps[key] || null,
      getProperties: () => scriptProps
    })
  };

  let capturedPayload: any = null;

  (globalThis as any).UrlFetchApp = {
    fetch: (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({ predictedSection: "09 22 00" })
              }]
            }
          }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "BASE64_DATA",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter();
    const blob = createMockBlob(1024);

    // 1. Positive custom budget: 1024
    let result = await adapter.analyzeSubmittal(blob, "Analyze submittal", { contacts: [], actions: [] });
    assert.strictEqual(result.success, true);
    assert.strictEqual(capturedPayload.generationConfig.thinkingConfig.thinkingBudget, 1024);

    // 2. Negative budget (< 0): thinkingConfig must be omitted
    scriptProps = {
      GEMINI_API_KEY: "AIzaSyTestKey123",
      GEMINI_THINKING_BUDGET: "-1"
    };
    result = await adapter.analyzeSubmittal(blob, "Analyze submittal", { contacts: [], actions: [] });
    assert.strictEqual(result.success, true);
    assert.strictEqual(capturedPayload.generationConfig.thinkingConfig, undefined);
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 313: analyzeSubmittal defensively resolves candidate part when thought part is present", async () => {
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  // Response has a reasoning thought part preceding the non-thought JSON response part
  (globalThis as any).UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        candidates: [{
          content: {
            parts: [
              {
                thought: true,
                text: "Reasoning step 1: examining drawings for door schedules and hardware sets..."
              },
              {
                text: JSON.stringify({
                  predictedSection: "08 11 13",
                  predictedNumber: "002",
                  predictedRevision: "1",
                  predictedTitle: "Hollow Metal Frames",
                  predictedContactAbbr: "ARCH",
                  predictedAction: "No Exceptions Taken"
                })
              }
            ]
          }
        }]
      })
    })
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "BASE64_DATA",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter();
    const blob = createMockBlob(1024);
    const result = await adapter.analyzeSubmittal(blob, "Submittal with thought", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.analysis.predictedSection, "08 11 13");
      assert.strictEqual(result.analysis.predictedNumber, "002");
      assert.strictEqual(result.analysis.predictedRevision, "1");
      assert.strictEqual(result.analysis.predictedTitle, "Hollow Metal Frames");
      assert.strictEqual(result.analysis.predictedContactAbbr, "ARCH");
      assert.strictEqual(result.analysis.predictedAction, "No Exceptions Taken");
    }
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 314: analyzeSubmittal immediately rejects PDF exceeding 20 MB with PDF_TOO_LARGE without slicing or fetch", async () => {
  const fakePdfService = new FakePdfDocumentService();
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  let fetchCalled = false;
  (globalThis as any).UrlFetchApp = {
    fetch: () => {
      fetchCalled = true;
      throw new Error("UrlFetchApp should not be called for >20MB PDFs");
    }
  };

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ pdfDocumentService: fakePdfService });
    // 20 MB + 1 byte (20971521 bytes)
    const giantBlob = createMockBlob(20971521, "huge-spec.pdf");
    const context: DeepAnalysisContext = { contacts: [], actions: [] };

    const result = await adapter.analyzeSubmittal(giantBlob, "Email text", context);

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, "PDF_TOO_LARGE");
      assert.strictEqual(result.error.userMessage, "Submittal PDF exceeds maximum 20MB limit for AI analysis.");
    }
    assert.strictEqual(fetchCalled, false, "UrlFetchApp.fetch must not be invoked");
    assert.strictEqual(fakePdfService.sliceCalls.length, 0, "PDF slicing must not be invoked");
    assert.strictEqual(fakePdfService.extractPagesCalls.length, 0, "PDF page extraction must not be invoked");
    assert.strictEqual(fakePdfService.getPageCountCalls.length, 0, "PDF page count check must not be invoked");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 314: analyzeSubmittal delegates to slicing when PDF > 2 MB even if page count <= 3", async () => {
  const fakePdfService = new FakePdfDocumentService();
  fakePdfService.setPageCount(1); // Single page, but > 2 MB
  fakePdfService.setSliceResultBase64("SLICED_3MB_BASE64");

  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let capturedPayload: any = null;
  (globalThis as any).UrlFetchApp = {
    fetch: (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: "03 30 00" }) }] } }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "DIRECT_BASE64_SHOULD_NOT_BE_USED",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ pdfDocumentService: fakePdfService });
    const largeBlob = createMockBlob(3 * 1024 * 1024, "3mb-vector.pdf");
    const result = await adapter.analyzeSubmittal(largeBlob, "Email text", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    assert.strictEqual(fakePdfService.sliceCalls.length, 1, "Must slice when file size > 2 MB");
    assert.strictEqual(fakePdfService.sliceCalls[0].maxPages, 3);
    assert.strictEqual(capturedPayload.contents[0].parts[1].inlineData.data, "SLICED_3MB_BASE64");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 314: analyzeSubmittal delegates to slicing when PDF <= 2 MB but page count > 3", async () => {
  const fakePdfService = new FakePdfDocumentService();
  fakePdfService.setPageCount(5); // 5 pages (> 3), but only 1 MB
  fakePdfService.setSliceResultBase64("SLICED_5PAGES_BASE64");

  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let capturedPayload: any = null;
  (globalThis as any).UrlFetchApp = {
    fetch: (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: "08 11 13" }) }] } }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "DIRECT_BASE64_SHOULD_NOT_BE_USED",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ pdfDocumentService: fakePdfService });
    const compactMultiPageBlob = createMockBlob(1024 * 1024, "compact-5pages.pdf"); // 1 MB
    const result = await adapter.analyzeSubmittal(compactMultiPageBlob, "Email text", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    assert.strictEqual(fakePdfService.getPageCountCalls.length, 1, "Must check page count for <= 2MB files");
    assert.strictEqual(fakePdfService.sliceCalls.length, 1, "Must slice when page count > 3");
    assert.strictEqual(fakePdfService.sliceCalls[0].maxPages, 3);
    assert.strictEqual(capturedPayload.contents[0].parts[1].inlineData.data, "SLICED_5PAGES_BASE64");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 314: analyzeSubmittal uses direct base64 encoding fast path when PDF <= 2 MB and <= 3 pages", async () => {
  const fakePdfService = new FakePdfDocumentService();
  fakePdfService.setPageCount(2); // 2 pages (<= 3), and 1 MB (<= 2 MB)
  fakePdfService.setSliceResultBase64("SLICED_SHOULD_NOT_BE_USED");

  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let capturedPayload: any = null;
  (globalThis as any).UrlFetchApp = {
    fetch: (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: "09 29 00" }) }] } }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "FAST_PATH_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ pdfDocumentService: fakePdfService });
    const compactBlob = createMockBlob(1024 * 1024, "compact-2pages.pdf"); // 1 MB
    const result = await adapter.analyzeSubmittal(compactBlob, "Email text", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    assert.strictEqual(fakePdfService.getPageCountCalls.length, 1, "Must check page count");
    assert.strictEqual(fakePdfService.sliceCalls.length, 0, "Must not slice compact PDFs <= 2 MB and <= 3 pages");
    assert.strictEqual(fakePdfService.extractPagesCalls.length, 0, "Must not extract pages for compact PDFs");
    assert.strictEqual(capturedPayload.contents[0].parts[1].inlineData.data, "FAST_PATH_BASE64");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 315: analyzeSubmittal caches successful result in CacheAdapter with 600s TTL", async () => {
  const fakeCache = new FakeCacheAdapter();
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let fetchCalls = 0;
  (globalThis as any).UrlFetchApp = {
    fetch: () => {
      fetchCalls++;
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: "08 11 13", predictedTitle: "Hollow Metal Doors" }) }] } }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "MOCK_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ cacheAdapter: fakeCache });
    const blob = createMockBlob(1024, "submittal-spec-081113.pdf");
    const expectedKey = `submittal_analysis_submittal-spec-081113.pdf_1024`;

    const result = await adapter.analyzeSubmittal(blob, "Email context", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    assert.strictEqual(fetchCalls, 1);

    const cachedRaw = fakeCache.get(expectedKey);
    assert.ok(cachedRaw, "Result must be stored in CacheAdapter under deterministic key");
    const parsedCache = JSON.parse(cachedRaw!);
    assert.strictEqual(parsedCache.success, true);
    assert.strictEqual(parsedCache.analysis.predictedSection, "08 11 13");
    assert.strictEqual(parsedCache.analysis.predictedTitle, "Hollow Metal Doors");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 315: analyzeSubmittal on cache hit returns cached DeepAnalysisResult without calling PdfDocumentService, ExtractPagesAction, or UrlFetchApp", async () => {
  const fakeCache = new FakeCacheAdapter();
  const fakePdfService = new FakePdfDocumentService();

  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let fetchCalls = 0;
  (globalThis as any).UrlFetchApp = {
    fetch: () => {
      fetchCalls++;
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: "08 11 13" }) }] } }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "MOCK_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ cacheAdapter: fakeCache, pdfDocumentService: fakePdfService });
    const blob = createMockBlob(2048, "double-click.pdf");
    const expectedKey = `submittal_analysis_double-click.pdf_2048`;

    // Prime cache directly
    const cachedPayload = {
      success: true,
      analysis: {
        predictedSection: "08 71 00",
        predictedTitle: "Door Hardware",
        predictedAction: "Approved"
      }
    };
    fakeCache.put(expectedKey, JSON.stringify(cachedPayload), 600);

    const result = await adapter.analyzeSubmittal(blob, "Email context", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.analysis.predictedSection, "08 71 00");
      assert.strictEqual(result.analysis.predictedTitle, "Door Hardware");
      assert.strictEqual(result.analysis.predictedAction, "Approved");
    }

    // Verify ZERO calls to PdfDocumentService and UrlFetchApp
    assert.strictEqual(fetchCalls, 0, "UrlFetchApp must not be called on cache hit");
    assert.strictEqual(fakePdfService.getPageCountCalls.length, 0, "PdfDocumentService.getPageCount must not be called on cache hit");
    assert.strictEqual(fakePdfService.sliceCalls.length, 0, "PdfDocumentService.slicePagesToBase64 must not be called on cache hit");
    assert.strictEqual(fakePdfService.extractPagesCalls.length, 0, "ExtractPagesAction must not be called on cache hit");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 315: analyzeSubmittal differentiates cache keys by blob name and byte length", async () => {
  const fakeCache = new FakeCacheAdapter();
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let fetchCalls = 0;
  let lastSectionReturned = "";
  (globalThis as any).UrlFetchApp = {
    fetch: () => {
      fetchCalls++;
      lastSectionReturned = `08 00 0${fetchCalls}`;
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: lastSectionReturned }) }] } }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "MOCK_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ cacheAdapter: fakeCache });

    // Call 1: submittal-A.pdf, 100 bytes
    const blobA = createMockBlob(100, "submittal-A.pdf");
    const resA = await adapter.analyzeSubmittal(blobA, "ctx", { contacts: [], actions: [] });
    assert.strictEqual(resA.success, true);
    assert.strictEqual(fetchCalls, 1);

    // Call 2: submittal-B.pdf, 100 bytes (different name) -> cache miss
    const blobB = createMockBlob(100, "submittal-B.pdf");
    const resB = await adapter.analyzeSubmittal(blobB, "ctx", { contacts: [], actions: [] });
    assert.strictEqual(resB.success, true);
    assert.strictEqual(fetchCalls, 2);

    // Call 3: submittal-A.pdf, 200 bytes (different byte size) -> cache miss
    const blobC = createMockBlob(200, "submittal-A.pdf");
    const resC = await adapter.analyzeSubmittal(blobC, "ctx", { contacts: [], actions: [] });
    assert.strictEqual(resC.success, true);
    assert.strictEqual(fetchCalls, 3);

    // Call 4: submittal-A.pdf, 100 bytes again -> cache hit
    const resA2 = await adapter.analyzeSubmittal(blobA, "ctx", { contacts: [], actions: [] });
    assert.strictEqual(resA2.success, true);
    assert.strictEqual(fetchCalls, 3, "Fetch calls should not increase on repeated call with identical blob");
    if (resA2.success && resA.success) {
      assert.strictEqual(resA2.analysis.predictedSection, resA.analysis.predictedSection);
    }
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("Ticket 315: analyzeSubmittal does not cache failed analysis results", async () => {
  const fakeCache = new FakeCacheAdapter();
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalUtilities = (globalThis as any).Utilities;

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let fetchCalls = 0;
  let returnSuccess = false;

  (globalThis as any).UrlFetchApp = {
    fetch: () => {
      fetchCalls++;
      if (!returnSuccess) {
        return {
          getResponseCode: () => 503,
          getContentText: () => "Service Unavailable"
        };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: "08 11 13" }) }] } }]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: () => "MOCK_BASE64",
    sleep: () => {}
  };

  try {
    const adapter = new GeminiAiAnalysisAdapter({ cacheAdapter: fakeCache });
    const blob = createMockBlob(500, "failing-submittal.pdf");
    const expectedKey = `submittal_analysis_failing-submittal.pdf_500`;

    // First attempt: API fails with 503
    const failResult = await adapter.analyzeSubmittal(blob, "ctx", { contacts: [], actions: [] });
    assert.strictEqual(failResult.success, false);
    assert.strictEqual(fakeCache.get(expectedKey), null, "Failed result must NOT be cached");

    // Second attempt: API now recovers
    returnSuccess = true;
    const retryResult = await adapter.analyzeSubmittal(blob, "ctx", { contacts: [], actions: [] });
    assert.strictEqual(retryResult.success, true, "Immediate retry should attempt fetch again and succeed");
    assert.ok(fetchCalls > 1, "Fetch must be invoked on retry");
    assert.ok(fakeCache.get(expectedKey) !== null, "Recovered successful result must now be cached");
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).Utilities = originalUtilities;
  }
});


