// src/PdfDocumentService.ts

let pdfLibInstance: any = null;

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

class GoogleAppsScriptPdfDocumentService implements PdfDocumentService {
  async extractFormAction(fileId: string): Promise<string | null> {
    try {
      const { PDFDocument } = getPdfLib();

      const bytes = DriveApp.getFileById(fileId).getBlob().getBytes();
      const unsigned = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) unsigned[i] = bytes[i] & 0xFF;

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

  async stampSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    data: ParsedData,
    options: StampOptions
  ): Promise<GoogleAppsScript.Base.Blob> {
    if (!options || !options.templateId || options.templateId === "") {
      throw new Error("TEMPLATE_MISSING");
    }
    return sourceBlob;
  }
}

class FakePdfDocumentService implements PdfDocumentService {
  public extractCalls: string[] = [];
  public stampCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; data: ParsedData; options: StampOptions }> = [];
  private actionMap: Map<string, string | null> = new Map();
  private defaultAction: string | null = null;
  private stampResultBlob: GoogleAppsScript.Base.Blob | null = null;

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

  async extractFormAction(fileId: string): Promise<string | null> {
    this.extractCalls.push(fileId);
    if (this.actionMap.has(fileId)) {
      return this.actionMap.get(fileId)!;
    }
    return this.defaultAction;
  }

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
}

// Global default instance seam with fallback capability
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
