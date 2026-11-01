/**
 * @file PdfDocumentService.ts
 * @description Tier 1 pure core interface for PDF document service and normalized attachment descriptors.
 * Zero GAS globals, zero Node.js built-in imports (ADR-0013).
 */

export interface AttachmentDescriptor {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array | number[];
}

export interface StampData {
  action?: string;
  title?: string;
  discipline?: string;
  submittalNo?: string;
  date?: string;
  contact?: string;
  [key: string]: any;
}

export interface StampOptions {
  templateId: string;
  stampSubmittalNo?: string;
  newFileName?: string;
  targetKey?: string;
  [key: string]: any;
}

export interface PdfDocumentService {
  extractFormAction(bytesOrFileId: Uint8Array | number[] | string): Promise<string | null>;
  stampSubmittal(
    source: Uint8Array | number[] | GoogleAppsScript.Base.Blob | AttachmentDescriptor | any,
    data: StampData | ParsedData,
    options: StampOptions
  ): Promise<Uint8Array | GoogleAppsScript.Base.Blob | AttachmentDescriptor | any>;
  mergeBlobsToPdf(
    documents: Array<AttachmentDescriptor | GoogleAppsScript.Base.Blob | any>,
    newFileName?: string
  ): Promise<AttachmentDescriptor | GoogleAppsScript.Base.Blob | any>;
  slicePagesToBase64(
    source: Uint8Array | number[] | GoogleAppsScript.Base.Blob | AttachmentDescriptor | any,
    maxPages: number
  ): Promise<string>;
  extractPages?(
    source: Uint8Array | number[] | GoogleAppsScript.Base.Blob | AttachmentDescriptor | any,
    maxPages?: number
  ): Promise<Uint8Array | GoogleAppsScript.Base.Blob | AttachmentDescriptor | any>;
}

declare let module: { exports?: unknown };
if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
