/// <reference path="./types.ts" />
/**
 * @file DuplicateDocumentAction.ts
 * @description DocumentAction implementation for duplicating document files and blobs with clean ID resolution.
 */

declare var defaultDriveFilingRepository: DriveFilingRepository;

/**
 * Primitive workflow action that duplicates a document file or blob in Google Drive.
 * Resolves a distinct file ID while preserving originalFileId in the execution context.
 */
class DuplicateDocumentAction implements DocumentAction<DocumentActionContext, DocumentActionContext> {
  name: string = 'DuplicateDocument';

  /**
   * Executes file or blob duplication using DriveFilingRepository or DriveApp/blob.copyBlob().
   *
   * @param context - Action context containing fileId, blob, targetFolderId, newFileName, and repo references.
   * @returns Updated DocumentActionContext with new fileId, url, localPath, folderId, blob, and originalFileId.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    const repo =
      context.driveFilingRepository ||
      (typeof defaultDriveFilingRepository !== 'undefined'
        ? defaultDriveFilingRepository
        : (globalThis as any).defaultDriveFilingRepository);

    let newFileId = context.fileId;
    let url = context.url;
    let localPath = context.localPath;
    let folderId = context.folderId;

    let newBlob = context.blob;
    if (context.blob && typeof context.blob.copyBlob === 'function') {
      newBlob = context.blob.copyBlob();
      if (context.newFileName && typeof newBlob.setName === 'function') {
        newBlob.setName(context.newFileName);
      }
    }

    if (repo && typeof repo.duplicateDocument === 'function' && (context.fileId || context.blob)) {
      const options: FilingOptions = {
        targetFolderId: context.targetFolderId || '',
        subfolderPath: context.subfolderPath,
        newFileName: context.newFileName
      };
      const res = repo.duplicateDocument(
        { fileId: context.fileId, blob: newBlob },
        options
      );
      newFileId = res.fileId;
      url = res.url;
      localPath = res.localPath;
      folderId = res.folderId;
    }

    return {
      ...context,
      originalFileId: context.fileId,
      fileId: newFileId,
      blob: newBlob,
      url,
      localPath,
      folderId
    };
  }
}

/** Global default instance seam for DuplicateDocumentAction. */
var defaultDuplicateDocumentAction: DuplicateDocumentAction = new DuplicateDocumentAction();
if (typeof (globalThis as any).defaultDuplicateDocumentAction === 'undefined') {
  (globalThis as any).defaultDuplicateDocumentAction = defaultDuplicateDocumentAction;
}

declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DuplicateDocumentAction,
    defaultDuplicateDocumentAction
  };
}

(globalThis as any).DuplicateDocumentAction = DuplicateDocumentAction;
(globalThis as any).defaultDuplicateDocumentAction = defaultDuplicateDocumentAction;
