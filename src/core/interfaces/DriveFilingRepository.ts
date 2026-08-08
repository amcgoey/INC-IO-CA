/**
 * @file DriveFilingRepository.ts
 * @description Pure core abstract interface seam for Drive filing, folder resolution, and path resolution.
 */

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
    file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob },
    options: FilingOptions
  ): FilingResult;
  duplicateDocument?(
    source: { fileId?: string; blob?: GoogleAppsScript.Base.Blob },
    options?: FilingOptions
  ): FilingResult;
}

declare var module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {};
}
