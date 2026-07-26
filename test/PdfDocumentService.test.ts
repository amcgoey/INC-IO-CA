import test from "node:test";
import assert from "node:assert";

const { GoogleAppsScriptPdfDocumentService, defaultPdfDocumentService, getPdfLib } = require("../src/PdfDocumentService");
const { FakePdfDocumentService } = require("./harness/index");

test("FakePdfDocumentService extracts configured form action and records calls", async () => {
  const service = new FakePdfDocumentService({
    "file-123": "Approved",
    "file-456": "Revise and Resubmit"
  });

  assert.strictEqual(await service.extractFormAction("file-123"), "Approved");
  assert.strictEqual(await service.extractFormAction("file-456"), "Revise and Resubmit");
  assert.strictEqual(await service.extractFormAction("file-789"), null);

  service.setDefaultAction("Pending");
  assert.strictEqual(await service.extractFormAction("file-789"), "Pending");

  service.setFormAction("file-789", "Rejected");
  assert.strictEqual(await service.extractFormAction("file-789"), "Rejected");

  assert.deepStrictEqual(service.extractCalls, ["file-123", "file-456", "file-789", "file-789", "file-789"]);
});

test("FakePdfDocumentService stampSubmittal fails fast when templateId is missing or empty", async () => {
  const service = new FakePdfDocumentService();
  const mockBlob = { name: "test.pdf" } as any;
  const mockData: ParsedData = { title: "Test Doc" };

  await assert.rejects(
    async () => {
      await service.stampSubmittal(mockBlob, mockData, {
        newFileName: "Output",
        stampSubmittalNo: "001",
        templateId: ""
      });
    },
    {
      name: "Error",
      message: "TEMPLATE_MISSING"
    }
  );

  await assert.rejects(
    async () => {
      await service.stampSubmittal(mockBlob, mockData, {
        newFileName: "Output",
        stampSubmittalNo: "001",
        templateId: (undefined as unknown) as string
      });
    },
    {
      name: "Error",
      message: "TEMPLATE_MISSING"
    }
  );
});

test("FakePdfDocumentService stampSubmittal records calls and returns configured or fallback blob", async () => {
  const service = new FakePdfDocumentService();
  const mockSourceBlob = { name: "source.pdf" } as any;
  const mockStampedBlob = { name: "stamped.pdf" } as any;
  const mockData: ParsedData = { title: "Submittal 1" };
  const options = {
    newFileName: "Stamped_Submittal_1",
    stampSubmittalNo: "001",
    templateId: "tmpl-999"
  };

  // Default fallback returns sourceBlob
  const result1 = await service.stampSubmittal(mockSourceBlob, mockData, options);
  assert.strictEqual(result1, mockSourceBlob);

  // Set custom result blob
  service.setStampResultBlob(mockStampedBlob);
  const result2 = await service.stampSubmittal(mockSourceBlob, mockData, options);
  assert.strictEqual(result2, mockStampedBlob);

  assert.strictEqual(service.stampCalls.length, 2);
  assert.strictEqual(service.stampCalls[0].sourceBlob, mockSourceBlob);
  assert.strictEqual(service.stampCalls[0].data, mockData);
  assert.deepStrictEqual(service.stampCalls[0].options, options);
});

test("defaultPdfDocumentService global seam is bound and overridable", async () => {
  assert.ok(defaultPdfDocumentService);
  assert.strictEqual(typeof defaultPdfDocumentService.extractFormAction, "function");
  assert.strictEqual(typeof defaultPdfDocumentService.stampSubmittal, "function");

  // Verify seam can be overridden for testing/injection
  const customService = new FakePdfDocumentService({ "file-custom": "CustomAction" });
  const originalDefault = (globalThis as any).defaultPdfDocumentService;
  
  try {
    (globalThis as any).defaultPdfDocumentService = customService;
    assert.strictEqual(await (globalThis as any).defaultPdfDocumentService.extractFormAction("file-custom"), "CustomAction");
  } finally {
    (globalThis as any).defaultPdfDocumentService = originalDefault;
  }
});

test("getPdfLib lazy singleton executes UrlFetchApp.fetch and eval at most once per execution context", () => {
  delete (globalThis as any).PDFLib;
  delete (globalThis as any).pdfLibInstance;
  let fetchCallCount = 0;
  (globalThis as any).CONFIG = { PDF_LIB_URL: "https://example.com/pdf-lib.js" };
  (globalThis as any).UrlFetchApp = {
    fetch: (url: string) => {
      fetchCallCount++;
      assert.strictEqual(url, "https://example.com/pdf-lib.js");
      return {
        getContentText: () => "self.PDFLib = { PDFDocument: { load: async () => ({ getForm: () => ({}) }) } };"
      };
    }
  };

  const lib1 = getPdfLib();
  assert.ok(lib1);
  assert.ok(lib1.PDFDocument);
  assert.strictEqual(fetchCallCount, 1);

  const lib2 = getPdfLib();
  assert.strictEqual(lib2, lib1);
  assert.strictEqual(fetchCallCount, 1);
});

test("getPdfLib correctly attaches PDFLib to globalThis even when outer exports object is present in transpiled scope", () => {
  delete (globalThis as any).PDFLib;
  (globalThis as any).pdfLibInstance = null;
  
  (globalThis as any).CONFIG = { PDF_LIB_URL: "https://example.com/pdf-lib-umd.js" };
  (globalThis as any).UrlFetchApp = {
    fetch: () => ({
      getContentText: () => '!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?e(exports):"function"==typeof define&&define.amd?define(["exports"],e):e((t=t||self).PDFLib={})}(this,(function(t){t.PDFDocument={name:"PDFDocument"};}));'
    })
  };

  const lib = getPdfLib();
  assert.ok(lib);
  assert.strictEqual(lib.PDFDocument.name, "PDFDocument");
});



test("GoogleAppsScriptPdfDocumentService.extractFormAction extracts checkbox form action", async () => {
  (globalThis as any).PDF_CHECKBOX_MAP = {
    'No Exceptions Taken': 'NO EXCEPTIONS TAKEN',
    'Revise & Resubmit': 'REVISE AND RESUBMIT'
  };

  const mockForm = {
    getCheckBox: (name: string) => {
      if (name === 'NO EXCEPTIONS TAKEN') {
        return { isChecked: () => true };
      }
      return { isChecked: () => false };
    },
    getRadioGroup: () => { throw new Error("No radio group"); }
  };

  (globalThis as any).PDFLib = {
    PDFDocument: {
      load: async () => ({
        getForm: () => mockForm
      })
    }
  };

  (globalThis as any).DriveApp = {
    getFileById: (id: string) => ({
      getBlob: () => ({
        getBytes: () => [1, 2, 3]
      })
    })
  };

  const service = new GoogleAppsScriptPdfDocumentService();
  const action = await service.extractFormAction("file-pdf-1");
  assert.strictEqual(action, "No Exceptions Taken");
});

test("GoogleAppsScriptPdfDocumentService.extractFormAction extracts radio group form action fallback", async () => {
  (globalThis as any).PDF_CHECKBOX_MAP = {
    'No Exceptions Taken': 'NO EXCEPTIONS TAKEN'
  };

  const mockForm = {
    getCheckBox: () => ({ isChecked: () => false }),
    getRadioGroup: (name: string) => {
      if (name === 'Submittal Response') {
        return { getSelected: () => 'NO EXCEPTIONS TAKEN' };
      }
      return { getSelected: () => null };
    }
  };

  (globalThis as any).PDFLib = {
    PDFDocument: {
      load: async () => ({
        getForm: () => mockForm
      })
    }
  };

  (globalThis as any).DriveApp = {
    getFileById: (id: string) => ({
      getBlob: () => ({
        getBytes: () => [1, 2, 3]
      })
    })
  };

  const service = new GoogleAppsScriptPdfDocumentService();
  const action = await service.extractFormAction("file-pdf-2");
  assert.strictEqual(action, "No Exceptions Taken");
});

test("GoogleAppsScriptPdfDocumentService.extractFormAction returns null on error", async () => {
  (globalThis as any).DriveApp = {
    getFileById: (id: string) => {
      throw new Error("File not found");
    }
  };

  const service = new GoogleAppsScriptPdfDocumentService();
  const action = await service.extractFormAction("nonexistent-file");
  assert.strictEqual(action, null);
});

test("GoogleAppsScriptPdfDocumentService.stampSubmittal stamps submittal PDF using template and form fields", async () => {
  let loadedTemplateId = "";
  let filledSubmittalNo = "";
  let checkedBoxName = "";

  const mockForm = {
    getTextField: (name: string) => {
      if (['Submittal No', 'Submittal No.', 'Submittal Number'].includes(name)) {
        return {
          setText: (val: string) => { filledSubmittalNo = val; }
        };
      }
      return null;
    },
    getRadioGroup: () => { throw new Error("No radio group"); },
    getCheckBox: (name: string) => ({
      check: () => { checkedBoxName = name; }
    })
  };

  const mockTemplatePdfDoc = {
    getForm: () => mockForm,
    copyPages: async (srcDoc: any, indices: number[]) => ["page1"],
    addPage: (p: any) => {},
    save: async () => new Uint8Array([10, 20, 30])
  };

  const mockSourcePdfDoc = {
    getPageIndices: () => [0]
  };

  (globalThis as any).PDF_CHECKBOX_MAP = {
    'Approved': 'APPROVED_BOX'
  };

  (globalThis as any).PDFLib = {
    PDFDocument: {
      load: async (bytes: Uint8Array) => {
        if (bytes[0] === 1) return mockTemplatePdfDoc;
        return mockSourcePdfDoc;
      }
    }
  };

  (globalThis as any).DriveApp = {
    getFileById: (id: string) => {
      loadedTemplateId = id;
      return {
        getAs: (mime: string) => ({
          getBytes: () => [1, 2, 3]
        })
      };
    }
  };

  (globalThis as any).Utilities = {
    newBlob: (bytes: Uint8Array, mime: string, name: string) => ({
      getBytes: () => bytes,
      getName: () => name,
      getContentType: () => mime
    })
  };

  const service = new GoogleAppsScriptPdfDocumentService();
  const mockSourceBlob = { getBytes: () => [2, 3, 4] } as any;
  const mockData: ParsedData = { action: "Approved" };

  const result = await service.stampSubmittal(mockSourceBlob, mockData, {
    newFileName: "Output_Doc",
    stampSubmittalNo: "033000-001-001",
    templateId: "template-123"
  });

  assert.strictEqual(loadedTemplateId, "template-123");
  assert.strictEqual(filledSubmittalNo, "033000-001-001");
  assert.strictEqual(checkedBoxName, "APPROVED_BOX");
  assert.strictEqual(result.getName(), "Output_Doc.pdf");
});

test("FakePdfDocumentService slicePagesToBase64 records calls and returns configured base64 string", async () => {
  const service = new FakePdfDocumentService();
  const mockBlob = { name: "source.pdf" } as any;

  const defaultResult = await service.slicePagesToBase64(mockBlob, 3);
  assert.strictEqual(defaultResult, "");
  assert.deepStrictEqual(service.sliceCalls, [{ sourceBlob: mockBlob, maxPages: 3 }]);

  service.setSliceResultBase64("SGVsbG8gV29ybGQ=");
  const customResult = await service.slicePagesToBase64(mockBlob, 5);
  assert.strictEqual(customResult, "SGVsbG8gV29ybGQ=");
  assert.deepStrictEqual(service.sliceCalls, [
    { sourceBlob: mockBlob, maxPages: 3 },
    { sourceBlob: mockBlob, maxPages: 5 }
  ]);
});

test("GoogleAppsScriptPdfDocumentService.slicePagesToBase64 loads blob, copies up to maxPages, and returns base64", async () => {
  let loadedBytes: Uint8Array | null = null;
  let copiedPageIndices: number[] = [];
  let addedPagesCount = 0;
  let savedBytes: Uint8Array | null = null;
  let base64EncodedInput: Uint8Array | null = null;

  const mockSrcPdfDoc = {
    getPageCount: () => 5
  };

  const mockSlicedPdfDoc = {
    copyPages: async (srcDoc: any, indices: number[]) => {
      copiedPageIndices = indices;
      return indices.map(i => `page_${i}`);
    },
    addPage: (p: any) => { addedPagesCount++; },
    save: async () => {
      savedBytes = new Uint8Array([70, 65, 75, 69]);
      return savedBytes;
    }
  };

  (globalThis as any).PDFLib = {
    PDFDocument: {
      load: async (bytes: Uint8Array) => {
        loadedBytes = bytes;
        return mockSrcPdfDoc;
      },
      create: async () => mockSlicedPdfDoc
    }
  };

  (globalThis as any).Utilities = {
    base64Encode: (bytes: Uint8Array) => {
      base64EncodedInput = bytes;
      return "RkFLRQ==";
    }
  };

  const service = new GoogleAppsScriptPdfDocumentService();
  const mockBlob = { getBytes: () => [1, 2, 3, 4] } as any;

  // Test 1: maxPages (2) < total pages (5)
  const base64Result1 = await service.slicePagesToBase64(mockBlob, 2);
  assert.strictEqual(base64Result1, "RkFLRQ==");
  assert.deepStrictEqual(Array.from(loadedBytes!), [1, 2, 3, 4]);
  assert.deepStrictEqual(copiedPageIndices, [0, 1]);
  assert.strictEqual(addedPagesCount, 2);
  assert.deepStrictEqual(base64EncodedInput, savedBytes);

  // Test 2: maxPages (10) > total pages (5) -> caps at 5 pages
  addedPagesCount = 0;
  const base64Result2 = await service.slicePagesToBase64(mockBlob, 10);
  assert.strictEqual(base64Result2, "RkFLRQ==");
  assert.deepStrictEqual(copiedPageIndices, [0, 1, 2, 3, 4]);
  assert.strictEqual(addedPagesCount, 5);
});

