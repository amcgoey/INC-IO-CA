import test from "node:test";
import assert from "node:assert";

const { FakePdfDocumentService, defaultPdfDocumentService } = require("../src/PdfDocumentService");

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
