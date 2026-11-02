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
  if ((globalThis as any).pdfLibInstance === null) {
    pdfLibInstance = null;
  }
  if (typeof PDFLib !== "undefined" && PDFLib && (PDFLib as any).PDFDocument) {
    return PDFLib;
  }
  if ((globalThis as any).PDFLib && (globalThis as any).PDFLib.PDFDocument) {
    return (globalThis as any).PDFLib;
  }
  if (pdfLibInstance && pdfLibInstance.PDFDocument) {
    return pdfLibInstance;
  }

  const g = globalThis as any;
  if (typeof g.self === "undefined") g.self = g;
  if (typeof g.window === "undefined") g.window = g;
  if (typeof g.global === "undefined") g.global = g;

  const setTimeout = (fn: Function) => { fn(); return 0; };
  if (typeof g.setTimeout === "undefined") g.setTimeout = setTimeout;

  const code = UrlFetchApp.fetch(CONFIG.PDF_LIB_URL).getContentText();
  
  // Execute via Function constructor explicitly overriding exports, module, and define as undefined
  // so the UMD script falls through to globalThis / self / window target (g.PDFLib).
  const fn = new Function("self", "window", "global", "globalThis", "exports", "module", "define", code);
  fn.call(g, g, g, g, g, undefined, undefined, undefined);

  pdfLibInstance = g.PDFLib || (typeof PDFLib !== "undefined" ? PDFLib : null);

  if (!pdfLibInstance || !pdfLibInstance.PDFDocument) {
    throw new Error("PDFLib library failed to initialize cleanly from URL " + (typeof CONFIG !== "undefined" ? CONFIG.PDF_LIB_URL : ""));
  }

  return pdfLibInstance;
}

/**
 * Converts a Google Apps Script `Blob` into a `Uint8Array` byte array.
 *
 * @param b - Source Blob instance.
 * @returns Unsigned 8-bit integer array.
 */
function blobToUint8Array(b: GoogleAppsScript.Base.Blob | any): Uint8Array {
  if (b instanceof Uint8Array) return b;
  const rawBytes = (b && typeof b.getBytes === "function") ? b.getBytes() : b;
  if (rawBytes instanceof Uint8Array) return rawBytes;
  if (!rawBytes || !rawBytes.length) return new Uint8Array(0);
  const u = new Uint8Array(rawBytes.length);
  for (let i = 0; i < rawBytes.length; i++) u[i] = rawBytes[i] & 0xFF;
  return u;
}

/**
 * Production implementation of `PdfDocumentService` using `pdf-lib` and Google Drive APIs.
 */
interface ActionNormalizationEntry {
  canonicalUiAction: string;
  aliases: string[];
}

const ACTION_NORMALIZATION_TABLE: ActionNormalizationEntry[] = [
  {
    canonicalUiAction: 'Approved as Noted',
    aliases: [
      'APPROVED AS NOTED',
      'Approved as Noted',
      'approved as noted',
      'NO OBJECTIONS AS CORRECTED',
      'NO OBJECTION AS CORRECTED',
      'No Objection as Corrected',
      'No Objections as Corrected',
      'no objection as corrected',
      'no objections as corrected',
      'AAN',
      'aan',
      'NOAC',
      'noac',
      'AN',
      'an'
    ]
  },
  {
    canonicalUiAction: 'No Exceptions Taken',
    aliases: [
      'NO EXCEPTIONS TAKEN',
      'No Exceptions Taken',
      'no exceptions taken',
      'NET',
      'net',
      'APPROVED',
      'Approved',
      'approved',
      'APP',
      'app'
    ]
  },
  {
    canonicalUiAction: 'Revise & Resubmit',
    aliases: [
      'REVISE AND RESUBMIT',
      'REVISE & RESUBMIT',
      'Revise and Resubmit',
      'Revise & Resubmit',
      'revise and resubmit',
      'revise & resubmit',
      'R&R',
      'r&r',
      'RR',
      'rr'
    ]
  },
  {
    canonicalUiAction: 'Rejected',
    aliases: [
      'REJECTED',
      'Rejected',
      'rejected',
      'REJ',
      'rej'
    ]
  },
  {
    canonicalUiAction: 'Not Reviewed',
    aliases: [
      'NOT REVIEWED',
      'Not Reviewed',
      'not reviewed',
      'NR',
      'nr',
      'RETURNED',
      'Returned',
      'returned'
    ]
  }
];

function normalizePdfAction(rawAction: string): string | null {
  if (!rawAction) return null;
  const trimmed = rawAction.trim();
  const lower = trimmed.toLowerCase();

  for (const entry of ACTION_NORMALIZATION_TABLE) {
    if (entry.canonicalUiAction.toLowerCase() === lower) {
      return entry.canonicalUiAction;
    }
    for (const alias of entry.aliases) {
      if (alias.toLowerCase() === lower) {
        return entry.canonicalUiAction;
      }
    }
  }

  const cbMap = typeof PDF_CHECKBOX_MAP !== "undefined" ? PDF_CHECKBOX_MAP : (globalThis as any).PDF_CHECKBOX_MAP;
  if (cbMap) {
    for (const [uiAction, cbName] of Object.entries(cbMap)) {
      if (uiAction.toLowerCase() === lower || String(cbName).toLowerCase() === lower) {
        return uiAction;
      }
    }
  }

  return trimmed;
}

function getPdfCheckboxCandidates(action: string): string[] {
  if (!action) return [];
  const trimmed = action.trim();
  const lower = trimmed.toLowerCase();

  const candidates: string[] = [];

  const cbMap = typeof PDF_CHECKBOX_MAP !== "undefined" ? PDF_CHECKBOX_MAP : (globalThis as any).PDF_CHECKBOX_MAP;
  if (cbMap) {
    if (cbMap[trimmed] && !candidates.includes(cbMap[trimmed])) {
      candidates.push(cbMap[trimmed]);
    }
    if (cbMap[trimmed.toUpperCase()] && !candidates.includes(cbMap[trimmed.toUpperCase()])) {
      candidates.push(cbMap[trimmed.toUpperCase()]);
    }
    for (const [uiAction, cbName] of Object.entries(cbMap)) {
      if (uiAction.toLowerCase() === lower && !candidates.includes(cbName as string)) {
        candidates.push(cbName as string);
      }
    }
  }

  for (const entry of ACTION_NORMALIZATION_TABLE) {
    const isMatch = entry.canonicalUiAction.toLowerCase() === lower ||
      entry.aliases.some(a => a.toLowerCase() === lower);
    if (isMatch) {
      for (const alias of entry.aliases) {
        if (!candidates.includes(alias)) candidates.push(alias);
      }
      if (!candidates.includes(entry.canonicalUiAction)) candidates.push(entry.canonicalUiAction);
      break;
    }
  }

  if (!candidates.includes(trimmed)) candidates.push(trimmed);
  if (!candidates.includes(trimmed.toUpperCase())) candidates.push(trimmed.toUpperCase());

  return candidates;
}

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

      for (const entry of ACTION_NORMALIZATION_TABLE) {
        for (const alias of entry.aliases) {
          try {
            const cb = form.getCheckBox(alias);
            if (cb && cb.isChecked()) return entry.canonicalUiAction;
          } catch (e) { }
        }
      }

      const cbMap = typeof PDF_CHECKBOX_MAP !== "undefined" ? PDF_CHECKBOX_MAP : (globalThis as any).PDF_CHECKBOX_MAP;
      if (cbMap) {
        for (const [uiAction, cbName] of Object.entries(cbMap)) {
          try {
            const cb = form.getCheckBox(cbName as string);
            if (cb && cb.isChecked()) return normalizePdfAction(uiAction) || uiAction;
          } catch (e) { }
        }
      }

      try {
        const selected = form.getRadioGroup('Submittal Response').getSelected();
        if (selected) return normalizePdfAction(selected) || selected;
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
      for (const n of names) {
        try {
          const f = form.getTextField(n);
          if (f) { f.setText(val); return; }
        } catch (e) {}
      }
    };

    fill(['Submittal No', 'Submittal No.', 'Submittal Number'], options.stampSubmittalNo);

    const act = data && data.action ? String(data.action) : "";
    if (act) {
      const candidates = getPdfCheckboxCandidates(act);
      try {
        const rg = form.getRadioGroup('Submittal Response');
        const opts = rg.getOptions();
        let selected = false;
        for (const cand of candidates) {
          if (opts.includes(cand)) {
            rg.select(cand);
            selected = true;
            break;
          }
        }
        if (!selected && opts.includes(act)) {
          rg.select(act);
        }
      } catch (e) {
        for (const cand of candidates) {
          try {
            const cb = form.getCheckBox(cand);
            if (cb) {
              cb.check();
              break;
            }
          } catch (err) { }
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
  /**
   * Slices up to `maxPages` (default 3) from a source PDF blob into a new `GoogleAppsScript.Base.Blob`.
   * Used as the foundational PDF page extraction logic for standalone workflow actions.
   *
   * @param sourceBlob - Source PDF blob.
   * @param maxPages - Maximum number of pages to slice (default: 3).
   * @returns A Promise resolving to a new PDF Blob containing sliced pages.
   */
  async extractPages(
    sourceBlob: GoogleAppsScript.Base.Blob,
    maxPages = 3
  ): Promise<GoogleAppsScript.Base.Blob> {
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
    const name = (sourceBlob && typeof sourceBlob.getName === "function") ? (sourceBlob.getName() || "sliced.pdf") : "sliced.pdf";
    if (typeof Utilities !== "undefined" && typeof Utilities.newBlob === "function") {
      return Utilities.newBlob(pdfBytes, 'application/pdf', name);
    }
    return {
      getBytes: () => pdfBytes,
      getName: () => name,
      getContentType: () => "application/pdf"
    } as any;
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
    const slicedBlob = await this.extractPages(sourceBlob, maxPages);
    return Utilities.base64Encode(slicedBlob.getBytes());
  }

  /**
   * Returns the total page count of a source PDF blob.
   *
   * @param sourceBlob - Source PDF blob or byte array.
   * @returns Total number of pages in the PDF document.
   */
  async getPageCount(
    sourceBlob: GoogleAppsScript.Base.Blob | any
  ): Promise<number> {
    try {
      const { PDFDocument } = getPdfLib();
      const unsigned = blobToUint8Array(sourceBlob);
      const srcDoc = await PDFDocument.load(unsigned);
      return srcDoc.getPageCount();
    } catch (_err) {
      return 1;
    }
  }
  async mergeBlobsToPdf(
    blobs: GoogleAppsScript.Base.Blob[],
    newFileName?: string
  ): Promise<GoogleAppsScript.Base.Blob> {
    if (!blobs || blobs.length === 0) {
      throw new Error("Cannot merge empty array of blobs into PDF.");
    }

    const pdfLib = getPdfLib();
    const mergedPdf = await pdfLib.PDFDocument.create();

    for (const blob of blobs) {
      const bytes = (blob && typeof blob.getBytes === "function") ? blobToUint8Array(blob) : new Uint8Array(0);
      const contentType = (blob && typeof blob.getContentType === "function" ? (blob.getContentType() || "") : "").toLowerCase();
      const fileName = (blob && typeof blob.getName === "function" ? (blob.getName() || "") : "").toLowerCase();
      const isPdf = contentType.includes("pdf") || fileName.endsWith(".pdf");
      const isPng = contentType.includes("png") || fileName.endsWith(".png");
      const isJpg = contentType.includes("jpeg") || contentType.includes("jpg") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg");

      if (isPdf) {
        const srcPdf = await pdfLib.PDFDocument.load(bytes);
        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        copiedPages.forEach((page: any) => mergedPdf.addPage(page));
      } else if (isPng) {
        const image = await mergedPdf.embedPng(bytes);
        const page = mergedPdf.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      } else if (isJpg) {
        const image = await mergedPdf.embedJpg(bytes);
        const page = mergedPdf.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      } else {
        throw new Error("Unsupported content type for PDF merging: " + contentType);
      }
    }

    const mergedBytes = await mergedPdf.save();
    const filename = newFileName || "composite_merged.pdf";

    return (typeof Utilities !== "undefined" && typeof Utilities.newBlob === "function")
      ? Utilities.newBlob(mergedBytes, "application/pdf", filename)
      : ({
         getBytes: () => mergedBytes,
         getName: () => filename,
         getContentType: () => "application/pdf"
        } as any);
  }
}

/** Global default instance seam for PDF document service. */
const defaultPdfDocumentService: PdfDocumentService = new GoogleAppsScriptPdfDocumentService();

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleAppsScriptPdfDocumentService,
    defaultPdfDocumentService,
    getPdfLib,
    normalizePdfAction,
    getPdfCheckboxCandidates
  };
}

(globalThis as any).defaultPdfDocumentService = defaultPdfDocumentService;
