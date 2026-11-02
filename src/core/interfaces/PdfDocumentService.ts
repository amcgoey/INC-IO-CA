/**
 * @file PdfDocumentService.ts
 * @description Tier 1 pure core interface for PDF document service and normalized attachment descriptors.
 * Zero GAS globals, zero Node.js built-in imports (ADR-0013).
 */

import type { FilingBlob } from './DriveFilingRepository';

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
    source: Uint8Array | number[] | AttachmentDescriptor | FilingBlob | unknown,
    data: StampData | ParsedData,
    options: StampOptions
  ): Promise<Uint8Array | AttachmentDescriptor | FilingBlob | unknown>;
  mergeBlobsToPdf(
    documents: Array<AttachmentDescriptor | FilingBlob | Uint8Array | unknown>,
    newFileName?: string
  ): Promise<AttachmentDescriptor | FilingBlob | Uint8Array | unknown>;
  slicePagesToBase64(
    source: Uint8Array | number[] | AttachmentDescriptor | FilingBlob | unknown,
    maxPages: number
  ): Promise<string>;
  extractPages?(
    source: Uint8Array | number[] | AttachmentDescriptor | FilingBlob | unknown,
    maxPages?: number
  ): Promise<Uint8Array | AttachmentDescriptor | FilingBlob | unknown>;
  getPageCount?(
    source: GoogleAppsScript.Base.Blob | Uint8Array | unknown
  ): Promise<number>;
}
