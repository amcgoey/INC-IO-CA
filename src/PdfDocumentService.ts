/**
 * @file PdfDocumentService.ts
 * @description Service for PDF operations including cover sheet stamping, form action extraction, and PDF page slicing for AI analysis.
 *
 * Utilizes `pdf-lib` via lazy remote evaluation or global binding.
 */

let pdfLibInstance: any = null;

/**
 * Lazy singleton getter that returns the `pdf-lib` library instance.
 * Fetches and evaluates the library source from `CONFIG.PDF_LIB_URL` if not already loaded.
 *
 * @returns `PDFLib` object.
 */
function getPdfLib(): any {
  if (typeof PDFLib !== "undefined") {
    return PDFLib;
  }
  if (pdfLibInstance) {
    return pdfLibInstance;
  }
  const setTimeout = (fn: Function) => { fn(); return 0; };
  eval(UrlFetchApp.fetch(CONFIG.PDF_LIB_URL).getContentText());
  pdfLibInstance = (globalThis as any).PDFLib || (typeof PDFLib !== "undefined" ? PDFLib : null);
  return pdfLibInstance;
}

/**
 * Converts a Google Apps Script `Blob` into a `Uint8Array` byte array.
 *
 * @param b - Source Blob instance.
 * @returns Unsigned 8-bit integer array.
 */
function blobToUint8Array(b: GoogleAppsScript.Base.Blob): Uint8Array {
  const bytes = b.getBytes();
  const u = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) u[i] = bytes[i] & 0xFF;
  return u;
}

/**
 * Production implementation of `PdfDocumentService` using `pdf-lib` and Google Drive APIs.
 */
class GoogleAppsScriptPdfDocumentService implements PdfDocumentService {
  /**
   * Extracts form field response actions (checkboxes or radio group selections) from a PDF document stored in Drive.
   *
   * @param fileId - Target Google Drive PDF file ID.
   * @returns Form action string if found (e.g. "Reviewed", "Approved"), or `null` if none selected or unreadable.
   */
  async extractFormAction(fileId: string): Promise<string | null> {
    try {
      const { PDFDocument } = getPdfLib();

      const blob = DriveApp.getFileById(fileId).getBlob();
      const unsigned = blobToUint8Array(blob);

      const pdfDoc = await PDFDocument.load(unsigned);
      const form = pdfDoc.getForm();
      const reverseMap: Record<string, string> = {};

      for (const [uiAction, cbName] of Object.entries(PDF_CHECKBOX_MAP)) reverseMap[cbName] = uiAction;

      for (const cbName of Object.values(PDF_CHECKBOX_MAP)) {
        try {
          if (form.getCheckBox(cbName).isChecked()) return reverseMap[cbName];
        } catch (e) { }
      }

      try {
        const selected = form.getRadioGroup('Submittal Response').getSelected();
        if (selected) return reverseMap[selected.trim().toUpperCase()] || selected;
      } catch (e) { }

      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Stamps submittal approval metadata onto a PDF cover sheet using a template PDF document.
   * Copies pages from the source PDF after the stamped cover sheet.
   *
   * @param sourceBlob - Source PDF blob.
   * @param data - Parsed submittal data containing action and title.
   * @param options - Stamp options including `templateId`, `stampSubmittalNo`, and `newFileName`.
   * @returns A Promise resolving to the stamped PDF blob.
   * @throws Error if `options.templateId` is missing (`"TEMPLATE_MISSING"`).
   */
  async stampSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    data: ParsedData,
    options: StampOptions
  ): Promise<GoogleAppsScript.Base.Blob> {
    if (!options || !options.templateId || options.templateId === "") {
      throw new Error("TEMPLATE_MISSING");
    }

    const { PDFDocument } = getPdfLib();

    const pdfMime = typeof MimeType !== "undefined" ? (MimeType as any).PDF : "application/pdf";
    const templateBlob = DriveApp.getFileById(options.templateId).getAs(pdfMime);
    const pdfDoc = await PDFDocument.load(blobToUint8Array(templateBlob));
    const form = pdfDoc.getForm();

    const fill = (names: string[], val: string) => {
      for (let n of names) {
        try {
          let f = form.getTextField(n);
          if (f) { f.setText(val); return; }
        } catch (e) {}
      }
    };

    fill(['Submittal No', 'Submittal No.', 'Submittal Number'], options.stampSubmittalNo);

    const act = data && data.action ? String(data.action) : "";
    const cbMap = typeof PDF_CHECKBOX_MAP !== "undefined" ? PDF_CHECKBOX_MAP : {};

    if (act) {
      try {
        let rg = form.getRadioGroup('Submittal Response'), opts = rg.getOptions();
        if (opts.includes(act)) rg.select(act);
        else if (opts.includes(act.toUpperCase())) rg.select(act.toUpperCase());
        else if (cbMap[act] && opts.includes(cbMap[act])) rg.select(cbMap[act]);
      } catch (e) {
        let box = cbMap[act] || (act ? cbMap[act.toUpperCase()] : null);
        if (box) {
          try { form.getCheckBox(box).check(); } catch (err) {}
        }
      }
    }

    const sourcePdf = await PDFDocument.load(blobToUint8Array(sourceBlob));
    const copied = await pdfDoc.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copied.forEach((p: any) => pdfDoc.addPage(p));

    return Utilities.newBlob(await pdfDoc.save(), 'application/pdf', options.newFileName + ".pdf");
  }

  /**
   * Slices up to `maxPages` from a source PDF blob and encodes the resulting PDF document to base64.
   * Used for sending truncated PDF payloads to AI analysis services.
   *
   * @param sourceBlob - Source PDF blob.
   * @param maxPages - Maximum number of pages to slice.
   * @returns Base64 encoded string of the sliced PDF.
   */
  async slicePagesToBase64(
    sourceBlob: GoogleAppsScript.Base.Blob,
    maxPages: number
  ): Promise<string> {
    const { PDFDocument } = getPdfLib();
    const unsigned = blobToUint8Array(sourceBlob);

    const srcDoc = await PDFDocument.load(unsigned);
    const pageCount = Math.min(srcDoc.getPageCount(), maxPages);
    const slicedDoc = await PDFDocument.create();

    const pageIndices: number[] = [];
    for (let i = 0; i < pageCount; i++) {
      pageIndices.push(i);
    }

    const copiedPages = await slicedDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((p: any) => slicedDoc.addPage(p));

    const pdfBytes = await slicedDoc.save();
    return Utilities.base64Encode(pdfBytes);
  }
}

/**
 * In-memory test mock implementation of `PdfDocumentService`.
 */
class FakePdfDocumentService implements PdfDocumentService {
  /** Recorded extract form action calls. */
  public extractCalls: string[] = [];
  /** Recorded stamp calls. */
  public stampCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; data: ParsedData; options: StampOptions }> = [];
  /** Recorded slice calls. */
  public sliceCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; maxPages: number }> = [];
  private actionMap: Map<string, string | null> = new Map();
  private defaultAction: string | null = null;
  private stampResultBlob: GoogleAppsScript.Base.Blob | null = null;
  private sliceResultBase64: string = "";

  /**
   * Constructs a `FakePdfDocumentService` instance.
   *
   * @param initialActions - Optional initial file ID to action mappings.
   */
  constructor(initialActions?: Record<string, string | null>) {
    if (initialActions) {
      for (const [fileId, action] of Object.entries(initialActions)) {
        this.actionMap.set(fileId, action);
      }
    }
  }

  setFormAction(fileId: string, action: string | null): void {
    this.actionMap.set(fileId, action);
  }

  setDefaultAction(action: string | null): void {
    this.defaultAction = action;
  }

  setStampResultBlob(blob: GoogleAppsScript.Base.Blob): void {
    this.stampResultBlob = blob;
  }

  setSliceResultBase64(base64String: string): void {
    this.sliceResultBase64 = base64String;
  }

  /** @override */
  async extractFormAction(fileId: string): Promise<string | null> {
    this.extractCalls.push(fileId);
    if (this.actionMap.has(fileId)) {
      return this.actionMap.get(fileId)!;
    }
    return this.defaultAction;
  }

  /** @override */
  async stampSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    data: ParsedData,
    options: StampOptions
  ): Promise<GoogleAppsScript.Base.Blob> {
    if (!options || !options.templateId || options.templateId === "") {
      throw new Error("TEMPLATE_MISSING");
    }
    this.stampCalls.push({ sourceBlob, data, options });
    if (this.stampResultBlob) {
      return this.stampResultBlob;
    }
    return sourceBlob;
  }

  /** @override */
  async slicePagesToBase64(
    sourceBlob: GoogleAppsScript.Base.Blob,
    maxPages: number
  ): Promise<string> {
    this.sliceCalls.push({ sourceBlob, maxPages });
    return this.sliceResultBase64;
  }
}

/** Global default instance seam for PDF document service. */
var defaultPdfDocumentService: PdfDocumentService = new GoogleAppsScriptPdfDocumentService();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleAppsScriptPdfDocumentService,
    FakePdfDocumentService,
    defaultPdfDocumentService,
    getPdfLib
  };
}
