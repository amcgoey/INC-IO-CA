import test from "node:test";
import assert from "node:assert";

const { InsertPagesAction } = require("../src/InsertPagesAction");
const {
 GoogleAppsScriptPdfDocumentService
} = require("../src/PdfDocumentService");
const { FakePdfDocumentService } = require("./harness/index");

test("InsertPagesAction delegates to pdfDocumentService.stampSubmittal and returns stamped blob", async () => {
  const fakePdfService = new FakePdfDocumentService();
  const sourceBlob = {
    getName: () => "input.pdf",
    getBytes: () => [1, 2, 3],
    copyBlob: () => ({ getName: () => "copied.pdf", getBytes: () => [1, 2, 3] })
  } as any;
  const stampedBlob = {
    getName: () => "STAMPED_output.pdf",
    getBytes: () => [1, 2, 3, 4]
  } as any;

  fakePdfService.setStampResultBlob(stampedBlob);

  const action = new InsertPagesAction();
  const result = await action.execute({
    sourceBlob,
    data: { action: "Approved", title: "Submittal 1" },
    options: {
      newFileName: "Output_1",
      stampSubmittalNo: "001-0",
      templateId: "tmpl-123"
    },
    pdfDocumentService: fakePdfService
  });

  assert.strictEqual(result, stampedBlob);
  assert.strictEqual(fakePdfService.stampCalls.length, 1);
  assert.strictEqual(fakePdfService.stampCalls[0].sourceBlob, sourceBlob);
  assert.deepStrictEqual(fakePdfService.stampCalls[0].data, { action: "Approved", title: "Submittal 1" });
  assert.deepStrictEqual(fakePdfService.stampCalls[0].options, {
    newFileName: "Output_1",
    stampSubmittalNo: "001-0",
    templateId: "tmpl-123"
  });
});

test("InsertPagesAction with GoogleAppsScriptPdfDocumentService prepends cover page and applies metadata", async () => {
  let loadedTemplateId = "";
  let filledSubmittalNo = "";
  let checkedBoxName = "";
  let pageCount = 0;

  const mockForm = {
    getTextField: (name: string) => {
      if (['SubmittalNo', 'SubmittalNo.', 'Submittal Number'].includes(name)) {
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
    copyPages: async (srcDoc: any, indices: number[]) => {
      pageCount = 1 + indices.length;
      return indices.map(i => `copied_page_${i}`);
    },
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

  const pdfService = new GoogleAppsScriptPdfDocumentService();
  const sourceBlob = { getBytes: () => [2, 3, 4] } as any;

  const action = new InsertPagesAction();
  const result = await action.execute({
    sourceBlob,
    data: { action: "Approved", title: "Test Submittal" },
    options: {
      newFileName: "Stamped_Submittal",
      stampSubmittalNo: "033000-001-001",
      templateId: "cover-template-456"
    },
    pdfDocumentService: pdfService
  });

  assert.strictEqual(loadedTemplateId, "cover-template-456");
  assert.strictEqual(filledSubmittalNo, "033000-001-001");
  assert.strictEqual(checkedBoxName, "APPROVED_BOX");
  assert.strictEqual(pageCount, 2);
  assert.strictEqual(result.getName(), "Stamped_Submittal.pdf");
});

test("InsertPagesAction catches TEMPLATE_MISSING error and returns sourceBlob copy", async () => {
  const fakePdfService = new FakePdfDocumentService();
  let copyBlobCalled = false;
  const copiedBlob = { getName: () => "fallback.pdf" } as any;

  const sourceBlob = {
    getName: () => "original.pdf",
    copyBlob: () => {
      copyBlobCalled = true;
      return copiedBlob;
    }
  } as any;

  const action = new InsertPagesAction();
  const result = await action.execute({
    sourceBlob,
    data: { action: "Approved" },
    options: {
      newFileName: "Output_1",
      stampSubmittalNo: "001-0",
      templateId: ""
    },
    pdfDocumentService: fakePdfService
  });

  assert.strictEqual(result, copiedBlob);
  assert.strictEqual(copyBlobCalled, true);
});

test("InsertPagesAction re-throws unexpected errors from pdfDocumentService", async () => {
  const customError = new Error("PDF_CORRUPT");
  const failingPdfService = {
    stampSubmittal: async () => {
      throw customError;
    }
  } as any;

  const sourceBlob = { getName: () => "test.pdf" } as any;
  const action = new InsertPagesAction();

  await assert.rejects(
    async () => {
      await action.execute({
        sourceBlob,
        data: { action: "Approved" },
        options: {
          newFileName: "Output_1",
          stampSubmittalNo: "001-0",
          templateId: "tmpl-123"
        },
        pdfDocumentService: failingPdfService
      });
    },
    (err: any) => {
      assert.strictEqual(err, customError);
      return true;
    }
  );
});

test("InsertPagesAction uses defaultPdfDocumentService if pdfDocumentService is omitted", async () => {
  let defaultStampCalled = false;
  const mockStampedBlob = { getName: () => "default_stamped.pdf" } as any;

  const mockDefaultService = {
    stampSubmittal: async () => {
      defaultStampCalled = true;
      return mockStampedBlob;
    }
  };

  const originalDefault = (globalThis as any).defaultPdfDocumentService;
  (globalThis as any).defaultPdfDocumentService = mockDefaultService;

  try {
    const sourceBlob = { getName: () => "source.pdf" } as any;
    const action = new InsertPagesAction();
    const result = await action.execute({
      sourceBlob,
      data: { action: "Approved" },
      options: {
        newFileName: "Output_1",
        stampSubmittalNo: "001-0",
        templateId: "tmpl-123"
      }
    });

    assert.strictEqual(defaultStampCalled, true);
    assert.strictEqual(result, mockStampedBlob);
  } finally {
    (globalThis as any).defaultPdfDocumentService = originalDefault;
  }
});
