/// <reference path="../../types.ts" />
/**
 * @file FakeDriveFilingRepository.ts
 * @description In-memory fake implementation of DriveFilingRepository for unit testing and fake adapter composition.
 */

import { DriveFilingRepository, FilingOptions, FilingResult, SubmittalFolderResolution } from "../../core/interfaces/DriveFilingRepository";

export class FakeDriveFilingRepository implements DriveFilingRepository {
  public calls: string[] = [];
  public filedDocuments: Array<{ file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }; options: FilingOptions; result: FilingResult }> = [];
  public duplicatedDocuments: Array<{ source: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }; options?: FilingOptions; result: FilingResult }> = [];
  public renamedDocuments: Array<{ fileId: string; newFileName: string; result: FilingResult }> = [];
  public sharedFiles: Array<{ fileId: string; accessType: string; permissionType: string }> = [];
  public customPaths: Record<string, string>;

  constructor(customPaths: Record<string, string> = {}) {
    this.customPaths = customPaths;
  }

  reset(): void {
    this.calls = [];
    this.filedDocuments = [];
    this.duplicatedDocuments = [];
    this.renamedDocuments = [];
    this.sharedFiles = [];
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

  renameDocument(fileId: string, newFileName: string): FilingResult {
    this.calls.push(fileId);
    const finalName = newFileName.endsWith(".pdf") ? newFileName : newFileName + ".pdf";
    const url = "http://drive.google.com/" + fileId;
    const localPath = this.getLocalPath(fileId);
    const result: FilingResult = { fileId, url, localPath, folderId: "folder-staged" };
    this.renamedDocuments.push({ fileId, newFileName: finalName, result });
    return result;
  }

  setSharing(fileId: string, accessType: string, permissionType: string): void {
    this.sharedFiles.push({ fileId, accessType, permissionType });
  }

  resolveSubmittalsFolder(workbookFileId: string): SubmittalFolderResolution {
    return {
      submittalsFolderId: "folder-submittals-" + workbookFileId,
      projectRootId: "folder-project-root-" + workbookFileId
    };
  }
}

declare let module: { exports?: unknown };
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeDriveFilingRepository
  };
}
