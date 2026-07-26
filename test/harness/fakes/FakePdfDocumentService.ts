/**
 * @file FakePdfDocumentService.ts
 * @description In-memory fake implementation of `PdfDocumentService` for testing.
 */

export class FakePdfDocumentService implements PdfDocumentService {
  public extractCalls: string[] = [];
  public stampCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; data: ParsedData; options: StampOptions }> = [];
  public sliceCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; maxPages: number }> = [];
  public calls: Array<{ method: string; args: any[] }> = [];
  private actionMap: Map<string, string | null> = new Map();
  private defaultAction: string | null = null;
  private stampResultBlob: GoogleAppsScript.Base.Blob | null = null;
  private sliceResultBase64: string = "";

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

  async extractFormAction(fileId: string): Promise<string | null> {
    this.extractCalls.push(fileId);
    this.calls.push({ method: "extractFormAction", args: [fileId] });
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
    this.calls.push({ method: "stampSubmittal", args: [sourceBlob, data, options] });
    if (this.stampResultBlob) {
      return this.stampResultBlob;
    }
    return sourceBlob;
  }

  async slicePagesToBase64(
    sourceBlob: GoogleAppsScript.Base.Blob,
    maxPages: number
  ): Promise<string> {
    this.sliceCalls.push({ sourceBlob, maxPages });
    this.calls.push({ method: "slicePagesToBase64", args: [sourceBlob, maxPages] });
    return this.sliceResultBase64;
  }
}
