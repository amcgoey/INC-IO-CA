/**
 * @file InsertPagesAction.ts
 * @description DocumentAction implementation for prepending cover sheet pages onto PDF blobs.
 *
 * Wraps `PdfDocumentService.stampSubmittal()` into a primitive `DocumentAction` handler.
 */

/**
 * Primitive workflow action that prepends CoverPageDocument onto a PDF blob
 * by delegating to `PdfDocumentService.stampSubmittal()`.
 */
export class InsertPagesAction implements DocumentAction<InsertPagesInput, GoogleAppsScript.Base.Blob> {
  /**
   * Executes the cover page insertion action.
   *
   * @param input - InsertPagesInput containing sourceBlob, data, options, and optional pdfDocumentService.
   * @returns A Promise resolving to the stamped PDF blob, or a fallback copy of sourceBlob if templateId is missing.
   */
  async execute(input: InsertPagesInput): Promise<GoogleAppsScript.Base.Blob> {
    const pdfDocumentService =
      input.pdfDocumentService ||
      (typeof defaultPdfDocumentService !== "undefined"
        ? defaultPdfDocumentService
        : (globalThis as any).defaultPdfDocumentService);

    if (!pdfDocumentService) {
      throw new Error("PdfDocumentService is required for InsertPagesAction");
    }

    try {
      return await pdfDocumentService.stampSubmittal(input.sourceBlob, input.data, input.options);
    } catch (err: any) {
      if (err && err.message === "TEMPLATE_MISSING") {
        return input.sourceBlob.copyBlob();
      }
      throw err;
    }
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    InsertPagesAction
  };
}
