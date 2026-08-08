// test/ExtractPagesAction.test.ts

import test from "node:test";
import assert from "node:assert";

(globalThis as any).CONFIG = {
  PDF_LIB_URL: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  GEMINI_API_URL_TRIAGE: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  GEMINI_API_URL_ANALYSIS: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
};

const { FakePdfDocumentService } = require("./harness/index");
const { ExtractPagesAction, defaultExtractPagesAction } = require("../src/core/workflow/ExtractPagesAction");
const { GeminiAiAnalysisAdapter } = require("../src/AiAnalysisService");

function createMockBlob(size: number = 100, name: string = "test.pdf"): GoogleAppsScript.Base.Blob {
  const bytes = new Uint8Array(size);
  return {
    getBytes: () => Array.from(bytes),
    getName: () => name,
    getContentType: () => "application/pdf",
    getAs: (type: string) => ({}) as any,
    getDataAsString: () => "",
    setBytes: () => ({}) as any,
    setContentType: () => ({}) as any,
    setDataAsString: () => ({}) as any,
    setName: () => ({}) as any,
    getAllBlobs: () => []
  } as any;
}

test("ExtractPagesAction slices multi-page PDF blob to default 3 pages using FakePdfDocumentService", { concurrency: false }, async () => {
  const fakePdfService = new FakePdfDocumentService();
  const mockSlicedBlob = createMockBlob(50, "sliced_3pages.pdf");
  fakePdfService.setExtractPagesResultBlob(mockSlicedBlob);
  fakePdfService.setSliceResultBase64("BASE64_DIRECT_BLOB");
  fakePdfService.setSliceResultBase64("BASE64_SLICED_5_PAGES");
  fakePdfService.setSliceResultBase64("BASE64_SLICED_3_PAGES");

  const originalUtilities = (globalThis as any).Utilities;
  (globalThis as any).Utilities = {
    base64Encode: (bytes: number[]) => "BASE64_SLICED_3_PAGES"
  };

  try {
    const action = new ExtractPagesAction({ pdfDocumentService: fakePdfService });
    const inputBlob = createMockBlob(500, "original_doc.pdf");

    const result = await action.execute({ sourceBlob: inputBlob });

    assert.strictEqual(fakePdfService.calls.filter((c: any) => c.method === "extractPages").length, 1);
    assert.strictEqual(fakePdfService.extractPagesCalls[0].sourceBlob, inputBlob);
    assert.strictEqual(fakePdfService.extractPagesCalls[0].maxPages, 3);
    assert.strictEqual(result.blob, mockSlicedBlob);
    assert.strictEqual(result.base64, "BASE64_SLICED_3_PAGES");
  } finally {
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("ExtractPagesAction supports custom maxPages in input payload", { concurrency: false }, async () => {
  const fakePdfService = new FakePdfDocumentService();
  const mockSlicedBlob = createMockBlob(80, "sliced_5pages.pdf");
  fakePdfService.setExtractPagesResultBlob(mockSlicedBlob);
  fakePdfService.setSliceResultBase64("BASE64_SLICED_5_PAGES");

  const originalUtilities = (globalThis as any).Utilities;
  (globalThis as any).Utilities = {
    base64Encode: (bytes: number[]) => "BASE64_SLICED_5_PAGES"
  };

  try {
    const action = new ExtractPagesAction({ pdfDocumentService: fakePdfService });
    const inputBlob = createMockBlob(1000, "multi_page.pdf");

    const result = await action.execute({ sourceBlob: inputBlob, maxPages: 5 });

    assert.strictEqual(fakePdfService.extractPagesCalls.length, 1);
    assert.strictEqual(fakePdfService.extractPagesCalls[0].maxPages, 5);
    assert.strictEqual(result.blob, mockSlicedBlob);
    assert.strictEqual(result.base64, "BASE64_SLICED_5_PAGES");
  } finally {
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("ExtractPagesAction supports direct Blob input signature", { concurrency: false }, async () => {
  const fakePdfService = new FakePdfDocumentService();
  const mockSlicedBlob = createMockBlob(60, "direct_sliced.pdf");
  fakePdfService.setExtractPagesResultBlob(mockSlicedBlob);
  fakePdfService.setSliceResultBase64("BASE64_DIRECT_BLOB");

  const originalUtilities = (globalThis as any).Utilities;
  (globalThis as any).Utilities = {
    base64Encode: (bytes: number[]) => "BASE64_DIRECT_BLOB"
  };

  try {
    const action = new ExtractPagesAction({ pdfDocumentService: fakePdfService, defaultMaxPages: 3 });
    const inputBlob = createMockBlob(600, "direct.pdf");

    const result = await action.execute(inputBlob);

    assert.strictEqual(fakePdfService.extractPagesCalls.length, 1);
    assert.strictEqual(fakePdfService.extractPagesCalls[0].sourceBlob, inputBlob);
    assert.strictEqual(fakePdfService.extractPagesCalls[0].maxPages, 3);
    assert.strictEqual(result.blob, mockSlicedBlob);
    assert.strictEqual(result.base64, "BASE64_DIRECT_BLOB");
  } finally {
    (globalThis as any).Utilities = originalUtilities;
  }
});

test("defaultExtractPagesAction global instance seam exists", { concurrency: false }, () => {
  assert.ok(defaultExtractPagesAction);
  assert.strictEqual(typeof defaultExtractPagesAction.execute, "function");
});

test("GeminiAiAnalysisAdapter delegates PDF slicing to ExtractPagesAction when provided", { concurrency: false }, async () => {
  const fakePdfService = new FakePdfDocumentService();
  const mockSlicedBlob = createMockBlob(200, "sliced_for_ai.pdf");
  fakePdfService.setExtractPagesResultBlob(mockSlicedBlob);
  fakePdfService.setSliceResultBase64("BASE64_AI_SLICED");

  const originalUtilities = (globalThis as any).Utilities;
  const originalProperties = (globalThis as any).PropertiesService;
  const originalUrlFetchApp = (globalThis as any).UrlFetchApp;
  const originalPDFLib = (globalThis as any).PDFLib;
  (globalThis as any).PDFLib = {
    PDFDocument: {
      load: async () => ({
        getPageCount: () => 1,
        copyPages: async () => [],
        addPage: () => {},
        save: async () => new Uint8Array()
      }),
      create: async () => ({
        copyPages: async () => [],
        addPage: () => {},
        save: async () => new Uint8Array()
      })
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: (bytes: any) => "BASE64_AI_SLICED",
    newBlob: (bytes: any, mime: string, name: string) => mockSlicedBlob,
    sleep: () => {}
  };

  (globalThis as any).PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key: string) => (key === "GEMINI_API_KEY" ? "AIzaSyTestKey123" : null),
      getProperties: () => ({ GEMINI_API_KEY: "AIzaSyTestKey123" })
    })
  };

  let fetchedPayload: any = null;
  (globalThis as any).UrlFetchApp = {
    fetch: (url: string, options: any) => {
      if (url && (url.includes("pdf-lib") || url.includes("cdnjs"))) {
        return {
          getResponseCode: () => 200,
          getContentText: () => "var PDFLib = { PDFDocument: { load: async () => ({ getPageCount: () => 1, create: async () => ({ copyPages: async () => [], addPage: () => {}, save: async () => new Uint8Array() }) }), create: async () => ({ copyPages: async () => [], addPage: () => {}, save: async () => new Uint8Array() }) } };"
        };
      }
      if (options && options.payload) {
        fetchedPayload = JSON.parse(options.payload);
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ predictedSection: "03 30 00" }) }] } }]
        })
      };
    }
  };

  try {
    const extractAction = new ExtractPagesAction({ pdfDocumentService: fakePdfService });
    const adapter = new GeminiAiAnalysisAdapter({ extractPagesAction: extractAction });

    const largeBlob = createMockBlob(3 * 1024 * 1024, "large.pdf");
    const result = await adapter.analyzeSubmittal(largeBlob, "Email text", { contacts: [], actions: [] });

    assert.strictEqual(result.success, true);
    assert.strictEqual(fakePdfService.extractPagesCalls.length, 1);
    assert.strictEqual(fakePdfService.extractPagesCalls[0].sourceBlob, largeBlob);
    assert.strictEqual(fakePdfService.extractPagesCalls[0].maxPages, 3);
    assert.strictEqual(fetchedPayload.contents[0].parts[1].inlineData.data, "BASE64_AI_SLICED");
  } finally {
    (globalThis as any).Utilities = originalUtilities;
    (globalThis as any).PropertiesService = originalProperties;
    (globalThis as any).UrlFetchApp = originalUrlFetchApp;
    (globalThis as any).PDFLib = originalPDFLib;
  }
});
