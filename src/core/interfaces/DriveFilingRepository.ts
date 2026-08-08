/**
 * @file DriveFilingRepository.ts
 * @description Pure core abstract interface seam for Drive filing, folder resolution, and path resolution.
 */

/**
 * Pure domain blob abstraction representing in-memory file payloads without GAS runtime lock-in.
 */
export interface FilingBlob {
  getBytes?(): number[] | Uint8Array;
  getName?(): string;
  getContentType?(): string;
  copyBlob?(): FilingBlob;
  setName?(name: string): FilingBlob;
  [key: string]: any;
}

export interface FilingOptions {
  targetFolderId: string;
  subfolderPath?: string[];
  newFileName?: string;
}

export interface FilingResult {
  fileId: string;
  url: string;
  localPath: string;
  folderId: string;
}

export interface DriveFilingRepository {
  getLocalPath(fileId: string): string;
  fileDocument(
    file: { fileId?: string; blob?: FilingBlob | any },
    options: FilingOptions
  ): FilingResult;
  duplicateDocument?(
    source: { fileId?: string; blob?: FilingBlob | any },
    options?: FilingOptions
  ): FilingResult;
}

declare var module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {};
}
