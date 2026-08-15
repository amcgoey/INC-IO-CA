/// <reference path="../../types.ts" />
/**
 * @file FakeDriveFilingRepository.ts
 * @description In-memory fake implementation of DriveFilingRepository for unit testing and fake adapter composition.
 */

import { DriveFilingRepository, FilingOptions, FilingResult } from "../../core/interfaces/DriveFilingRepository";

export class FakeDriveFilingRepository implements DriveFilingRepository {
  public calls: string[] = [];
  public filedDocuments: Array<{ file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }; options: FilingOptions; result: FilingResult }> = [];
  public duplicatedDocuments: Array<{ source: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }; options?: FilingOptions; result: FilingResult }> = [];
  public customPaths: Record<string, string>;

  constructor(customPaths: Record<string, string> = {}) {
    this.customPaths = customPaths;
  }

  reset(): void {
    this.calls = [];
    this.filedDocuments = [];
    this.duplicatedDocuments = [];
  }

  getLocalPath(fileId: string): string {
    this.calls.push(fileId);
    if (this.customPaths[fileId]) {
      return this.customPaths[fileId];
    }
    return "G:\\My Drive\\FakePath\\" + fileId;
  }

  fileDocument(
    file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob },
    options: FilingOptions
  ): FilingResult {
    const id = file.fileId || "fake-file-id";
    const subfolders = options.subfolderPath || ["Closed"];
    const folderId = "folder-" + subfolders.join("-");
    const url = "http://drive.google.com/" + id;
    const localPath = this.getLocalPath(id);
    const result: FilingResult = { fileId: id, url, localPath, folderId };
    this.filedDocuments.push({ file, options, result });
    return result;
  }

  duplicateDocument(
    source: { fileId?: string; blob?: GoogleAppsScript.Base.Blob },
    options?: FilingOptions
  ): FilingResult {
    const origId = source.fileId || "fake-file-id";
    const newId = origId + "-copy";
    const subfolders = options?.subfolderPath || ["Closed"];
    const folderId = "folder-" + subfolders.join("-");
    const url = "http://drive.google.com/" + newId;
    const localPath = this.getLocalPath(newId);
    const result: FilingResult = { fileId: newId, url, localPath, folderId };
    this.duplicatedDocuments.push({ source, options, result });
    return result;
  }
}

declare let module: { exports?: unknown };
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeDriveFilingRepository
  };
}
