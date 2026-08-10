import test from "node:test";
import assert from "node:assert";

const { GoogleAppsScriptPdfDocumentService } = require("../../../src/PdfDocumentService");
const { FakePdfDocumentService } = require("../../harness/index");

test("Tier 1 PDF Unit Tests: FakePdfDocumentService mergeBlobsToPdf records calls and merges blobs", async () => {
  const fakePdfService = new FakePdfDocumentService();
  const mockBlob1 = { getName: () => "attachment1.pdf", getContentType: () => "application/pdf", getBytes: () => [1, 2] } as any;
  const mockBlob2 = { getName: () => "attachment2.png", getContentType: () => "image/png", getBytes: () => [3, 4] } as any;

  const result = await fakePdfService.mergeBlobsToPdf([mockBlob1, mockBlob2], "unified.pdf");

  assert.strictEqual(fakePdfService.mergeBlobsCalls.length, 1);
  assert.strictEqual(fakePdfService.mergeBlobsCalls[0].blobs.length, 2);
  assert.strictEqual(fakePdfService.mergeBlobsCalls[0].newFileName, "unified.pdf");
  assert.ok(result);
});

test("Tier 1 PDF Unit Tests: GoogleAppsScriptPdfDocumentService mergeBlobsToPdf combines PDF and image blobs", async () => {
  const createdPages: any[] = [];
  const addedPages: any[] = [];
  const embeddedImages: any[] = [];

  const mockMergedDoc = {
    embedPng: async (u8: any) => {
      embeddedImages.push({ type: "png", u8 });
      return { width: 100, height: 200 };
    },
    embedJpg: async (u8: any) => {
      embeddedImages.push({ type: "jpg", u8 });
      return { width: 150, height: 250 };
    },
    addPage: (dimsOrPage: any) => {
      if (Array.isArray(dimsOrPage)) {
        const page: any = { drawImage: (img: any, opts: any) => page.drawn = { img, opts } };
        createdPages.push(page);
        return page;
      }
      addedPages.push(dimsOrPage);
      return dimsOrPage;
    },
    copyPages: async (srcDoc: any, indices: number[]) => {
      return indices.map(i => ({ pageIndex: i, srcDoc }));
    },
    save: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
  };

  const mockSrcPdfDoc = {
    getPageIndices: () => [0, 1]
  };

  (globalThis as any).PDFLib = {
    PDFDocument: {
      create: async () => mockMergedDoc,
      load: async (u8: any) => mockSrcPdfDoc
    }
  };

  (globalThis as any).Utilities = {
    newBlob: (bytes: any, contentType: string, name: string) => ({
      getBytes: () => bytes,
      getContentType: () => contentType,
      getName: () => name
    })
  };

  const service = new GoogleAppsScriptPdfDocumentService();

  const pdfBlob = {
    getName: () => "doc.pdf",
    getContentType: () => "application/pdf",
    getBytes: () => [37, 80, 68, 70]
  } as any;

  const pngBlob = {
    getName: () => "photo.png",
    getContentType: () => "image/png",
    getBytes: () => [137, 80, 78, 71]
  } as any;

  const jpgBlob = {
    getName: () => "site.jpg",
    getContentType: () => "image/jpeg",
    getBytes: () => [255, 216, 255]
  } as any;

  const compositeBlob = await service.mergeBlobsToPdf([pdfBlob, pngBlob, jpgBlob], "composite_submittal.pdf");

  assert.ok(compositeBlob);
  assert.strictEqual(compositeBlob.getName(), "composite_submittal.pdf");
  assert.strictEqual(compositeBlob.getContentType(), "application/pdf");
  assert.strictEqual(addedPages.length, 2);
  assert.strictEqual(embeddedImages.length, 2);
});
