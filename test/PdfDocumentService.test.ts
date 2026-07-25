import test from "node:test";
import assert from "node:assert";

const { GoogleAppsScriptPdfDocumentService, FakePdfDocumentService, defaultPdfDocumentService, getPdfLib } = require("../src/PdfDocumentService");

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
  let fetchCallCount = 0;
  (globalThis as any).CONFIG = { PDF_LIB_URL: "https://example.com/pdf-lib.js" };
  (globalThis as any).UrlFetchApp = {
    fetch: (url: string) => {
      fetchCallCount++;
      assert.strictEqual(url, "https://example.com/pdf-lib.js");
      return {
        getContentText: () => "globalThis.PDFLib = { PDFDocument: { load: async () => ({ getForm: () => ({}) }) } };"
      };
    }
  };

  const lib1 = getPdfLib();
  assert.ok(lib1);
  assert.strictEqual(fetchCallCount, 1);

  const lib2 = getPdfLib();
  assert.strictEqual(lib2, lib1);
  assert.strictEqual(fetchCallCount, 1);
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
