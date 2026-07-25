// src/PdfDocumentService.ts

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
var defaultPdfDocumentService: PdfDocumentService = new FakePdfDocumentService();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakePdfDocumentService,
    defaultPdfDocumentService
  };
}
