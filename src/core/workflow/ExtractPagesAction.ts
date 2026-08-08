/// <reference path="../../types.ts" />
/**
 * @file ExtractPagesAction.ts
 * @description Standalone primitive action for extracting pages from a PDF blob (ExtractPagesAction).
 *
 * Implements DocumentAction to extract up to N pages (default 3 pages) from a PDF document blob
 * using PdfDocumentService. Returns both the sliced PDF Blob and its base64 string representation.
 */

declare var require: any;

function resolvePdfDocumentServiceHelper(): PdfDocumentService {
  if (typeof defaultPdfDocumentService !== "undefined" && defaultPdfDocumentService) {
    return defaultPdfDocumentService;
  }
  try {
    return require("../../PdfDocumentService").defaultPdfDocumentService;
  } catch (e) {
    throw new Error("PdfDocumentService is not available");
  }
}

/**
 * Primitive action encapsulating PDF page extraction.
 */
class ExtractPagesAction implements DocumentAction<ExtractPagesInput | GoogleAppsScript.Base.Blob, ExtractPagesResult> {
  private pdfDocumentService?: PdfDocumentService;
  private defaultMaxPages: number;

  /**
   * Constructs an ExtractPagesAction instance.
   *
   * @param options - Injection options for pdfDocumentService and default maxPages (default: 3).
   */
  constructor(options?: { pdfDocumentService?: PdfDocumentService; defaultMaxPages?: number }) {
    if (options && options.pdfDocumentService) {
      this.pdfDocumentService = options.pdfDocumentService;
    }
    this.defaultMaxPages = (options && typeof options.defaultMaxPages === "number") ? options.defaultMaxPages : 3;
  }

  private getPdfDocumentService(): PdfDocumentService {
    if (this.pdfDocumentService) return this.pdfDocumentService;
    return resolvePdfDocumentServiceHelper();
  }

  /**
   * Executes PDF page extraction on the input payload or Blob.
   *
   * @param input - Either ExtractPagesInput or a direct PDF Blob.
   * @returns A Promise resolving to ExtractPagesResult containing { blob, base64 }.
   */
  async execute(input: ExtractPagesInput | GoogleAppsScript.Base.Blob): Promise<ExtractPagesResult> {
    let sourceBlob: GoogleAppsScript.Base.Blob;
    let maxPages = this.defaultMaxPages;

    if (input && typeof (input as any).getBytes === "function") {
      sourceBlob = input as GoogleAppsScript.Base.Blob;
    } else if (input && (input as ExtractPagesInput).sourceBlob) {
      const p = input as ExtractPagesInput;
      sourceBlob = p.sourceBlob;
      if (typeof p.maxPages === "number") {
        maxPages = p.maxPages;
      }
    } else {
      throw new Error("INVALID_EXTRACT_INPUT: Missing sourceBlob in ExtractPagesAction input");
    }

    const pdfService = this.getPdfDocumentService();
    const slicedBlob = await pdfService.extractPages(sourceBlob, maxPages);

    const base64 = await pdfService.slicePagesToBase64(sourceBlob, maxPages);

    return {
      blob: slicedBlob,
      base64
    };
  }
}

/** Global default instance seam for ExtractPagesAction. */
var defaultExtractPagesAction: ExtractPagesAction = new ExtractPagesAction();

if (typeof (globalThis as any).defaultExtractPagesAction === "undefined") {
  (globalThis as any).defaultExtractPagesAction = defaultExtractPagesAction;
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ExtractPagesAction,
    defaultExtractPagesAction
  };
}

(globalThis as any).ExtractPagesAction = ExtractPagesAction;
(globalThis as any).defaultExtractPagesAction = defaultExtractPagesAction;
