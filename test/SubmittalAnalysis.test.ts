import test from "node:test";
import assert from "node:assert";

import { GeminiAiAnalysisAdapter, defaultAiAnalysisService } from "../src/AiAnalysisService";
import { FakeAiAnalysisAdapter, FakePdfDocumentService } from "./harness/index";

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

