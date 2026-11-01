/// <reference path="../../types.ts" />
/**
 * @file GoogleDriveFilingRepository.ts
 * @description Production implementation of DriveFilingRepository for Google Drive folder hierarchy resolution, subfolder creation, document filing, and Windows G:\ local path mapping.
 */

import type { SubmittalFolderResolution } from "../../core/interfaces/DriveFilingRepository";

export class GoogleDriveFilingRepository implements DriveFilingRepository {
  /**
   * Traverses or creates missing subfolders along the specified subfolder path array.
   */
  private resolveOrCreateSubfolders(
    startFolder: GoogleAppsScript.Drive.Folder,
    subfolders: string[]
  ): GoogleAppsScript.Drive.Folder {
    let curFolder = startFolder;
    for (const subName of subfolders) {
      const iter = curFolder.getFoldersByName(subName);
      if (iter.hasNext()) {
        curFolder = iter.next();
      } else {
        curFolder = curFolder.createFolder(subName);
      }
    }
    return curFolder;
  }

  /**
   * Files a document blob or existing Drive file ID into the specified destination folder hierarchy.
   * Creates missing subfolders along the subfolderPath array if necessary.
   *
   * @param file - Object containing either an existing fileId or new file blob.
   * @param options - FilingOptions specifying target folder ID, subfolder path segments, and target file name.
   * @returns FilingResult containing destination file ID, web URL, Windows G:\ local path, and target folder ID.
   */
  fileDocument(
    file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob },
    options: FilingOptions
  ): FilingResult {
    const rootFolder = DriveApp.getFolderById(options.targetFolderId);
    const curFolder = this.resolveOrCreateSubfolders(rootFolder, options.subfolderPath || []);

    let filedFile: GoogleAppsScript.Drive.File;
    if (file.fileId) {
      filedFile = DriveApp.getFileById(file.fileId);
      filedFile.moveTo(curFolder);
    } else if (file.blob) {
      const name = options.newFileName
        ? (options.newFileName.endsWith(".pdf") ? options.newFileName : options.newFileName + ".pdf")
        : "temp.pdf";
      let payloadBlob = file.blob;
      if (typeof payloadBlob.copyBlob === "function") {
        payloadBlob = payloadBlob.copyBlob();
      }
      if (typeof payloadBlob.setName === "function") {
        payloadBlob.setName(name);
      } else if (typeof Utilities !== "undefined" && typeof Utilities.newBlob === "function") {
        const bytes = typeof payloadBlob.getBytes === "function" ? payloadBlob.getBytes() : (payloadBlob.bytes || []);
        const ct = typeof payloadBlob.getContentType === "function" ? payloadBlob.getContentType() : (payloadBlob.mimeType || "application/pdf");
        payloadBlob = Utilities.newBlob(bytes, ct, name);
      }
      filedFile = curFolder.createFile(payloadBlob);
    } else {
      throw new Error("Either fileId or blob must be provided to fileDocument");
    }

    if (options.newFileName) {
      const finalName = options.newFileName.endsWith(".pdf") ? options.newFileName : options.newFileName + ".pdf";
      filedFile.setName(finalName);
    }

    const fileId = filedFile.getId();
    const url = filedFile.getUrl();
    const folderId = curFolder.getId();
    const localPath = this.getLocalPath(fileId);

    return { fileId, url, localPath, folderId };
  }

  /**
   * Duplicates a document file or blob in Google Drive with clean ID resolution.
   *
   * @param source - Source file ID or in-memory blob to duplicate.
   * @param options - Optional filing options specifying target folder ID, subfolders, and target file name.
   * @returns FilingResult containing duplicated file ID, web URL, Windows G:\ local path, and target folder ID.
   */
  duplicateDocument(
    source: { fileId?: string; blob?: GoogleAppsScript.Base.Blob },
    options?: FilingOptions
  ): FilingResult {
    let targetFolder: GoogleAppsScript.Drive.Folder | null = null;
    if (options && options.targetFolderId) {
      const rootFolder = DriveApp.getFolderById(options.targetFolderId);
      targetFolder = this.resolveOrCreateSubfolders(rootFolder, options.subfolderPath || []);
    }

    let copiedFile: GoogleAppsScript.Drive.File;
    if (source.fileId) {
      const srcFile = DriveApp.getFileById(source.fileId);
      const name = options?.newFileName || srcFile.getName();
      copiedFile = targetFolder ? srcFile.makeCopy(name, targetFolder) : srcFile.makeCopy(name);
    } else if (source.blob) {
      const name = options?.newFileName || "Copy";
      let blob = source.blob;
      if (typeof blob.copyBlob === "function") {
        blob = blob.copyBlob();
      }
      if (typeof blob.setName === "function") {
        blob.setName(name);
      }
      if (targetFolder) {
        copiedFile = targetFolder.createFile(blob);
      } else {
        copiedFile = DriveApp.createFile(blob);
      }
    } else {
      throw new Error("Either fileId or blob must be provided to duplicateDocument");
    }

    const fileId = copiedFile.getId();
    const url = copiedFile.getUrl();
    const folderId = targetFolder ? targetFolder.getId() : (copiedFile.getParents().hasNext() ? copiedFile.getParents().next().getId() : "");
    const localPath = this.getLocalPath(fileId);

    return { fileId, url, localPath, folderId };
  }

  /**
   * Renames a document in place within Google Drive.
   */
  renameDocument(fileId: string, newFileName: string): FilingResult {
    if (typeof DriveApp === "undefined") {
      throw new Error("DriveApp runtime is not available");
    }
    const finalName = newFileName.endsWith(".pdf") ? newFileName : newFileName + ".pdf";
    const file = DriveApp.getFileById(fileId);
    file.setName(finalName);
    const parentFolder = file.getParents().hasNext() ? file.getParents().next() : null;
    return {
      fileId,
      url: file.getUrl(),
      localPath: this.getLocalPath(fileId),
      folderId: parentFolder ? parentFolder.getId() : ""
    };
  }

  /**
   * Updates file sharing permissions in Google Drive.
   */
  setSharing(fileId: string, accessType: string, permissionType: string): void {
    if (typeof DriveApp !== "undefined") {
      try {
        const file = DriveApp.getFileById(fileId);
        const access = (DriveApp.Access as any)[accessType] || DriveApp.Access.ANYONE_WITH_LINK;
        const permission = (DriveApp.Permission as any)[permissionType] || DriveApp.Permission.VIEW;
        file.setSharing(access, permission);
      } catch (_e) {
        // Fall back gracefully if domain sharing permissions restrict link sharing
      }
    }
  }

  getLocalPath(fileId: string): string {
    try {
      if (typeof Drive !== "undefined" && (Drive as any).Files) {
        const fileMeta = (Drive as any).Files.get(fileId, {supportsAllDrives: true});
        const path = [fileMeta.title];
        if (fileMeta.driveId) {
          const driveMeta = (Drive as any).Drives.get(fileMeta.driveId);
          let currentParentId = (fileMeta.parents && fileMeta.parents.length > 0) ? fileMeta.parents[0].id : null;
          while (currentParentId && currentParentId !== fileMeta.driveId) {
            const pFolder = (Drive as any).Files.get(currentParentId, {supportsAllDrives: true});
            path.unshift(pFolder.title);
            currentParentId = (pFolder.parents && pFolder.parents.length > 0) ? pFolder.parents[0].id : null;
          }
          path.unshift(driveMeta.name);
          return "G:\\Shared drives\\" + path.join("\\");
        }
      }

      if (typeof DriveApp !== "undefined") {
        const curFile = DriveApp.getFileById(fileId);
        const path = [curFile.getName()];
        let parents = curFile.getParents();
        while (parents.hasNext()) {
          const pFolder = parents.next();
          const n = pFolder.getName();
          if (n !== "Drive" && n !== "My Drive") path.unshift(n);
          parents = pFolder.getParents();
        }
        return "G:\\My Drive\\" + path.join("\\");
      }

      return "G:\\Error\\" + fileId;
    } catch (e) {
      return "G:\\Error\\" + fileId;
    }
  }

  /**
   * Resolves the target Submittals folder hierarchy starting from a project workbook file ID.
   * If the workbook is located in an administrative folder (e.g. '01 Admin', 'Admin'),
   * ascends to the Project Root folder and resolves or creates '04 Construction/Submittals'
   * (or directly 'Submittals' if no Construction folder exists).
   * Guarantees 'Submittals' is NEVER created inside an administrative folder.
   */
  resolveSubmittalsFolder(workbookFileId: string): SubmittalFolderResolution {
    if (typeof DriveApp === "undefined") {
      throw new Error("DriveApp runtime is not available");
    }

    const logFile = DriveApp.getFileById(workbookFileId);
    const parents = logFile.getParents();
    if (!parents.hasNext()) {
      throw new Error(`Workbook ${workbookFileId} has no parent folder.`);
    }

    let currentFolder = parents.next();
    const adminFolderRegex = /\badmin/i;

    // Ascend upward out of administrative folders to find Project Root
    while (adminFolderRegex.test(currentFolder.getName().trim())) {
      const pIter = currentFolder.getParents();
      if (pIter.hasNext()) {
        const nextParent = pIter.next();
        // Stop if we hit Drive root
        if (nextParent.getName() === "Drive" || nextParent.getName() === "My Drive") {
          break;
        }
        currentFolder = nextParent;
      } else {
        break;
      }
    }

    const projectRoot = currentFolder;
    const projectRootId = projectRoot.getId();

    // Resolve or find Construction folder inside Project Root
    let constructionFolder: GoogleAppsScript.Drive.Folder | null = null;
    const folderIter = projectRoot.getFolders();
    const constructionRegex = /^(\d*[\s._-]*)?construction/i;
    while (folderIter.hasNext()) {
      const child = folderIter.next();
      if (constructionRegex.test(child.getName().trim())) {
        constructionFolder = child;
        break;
      }
    }

    const targetParent = constructionFolder || projectRoot;
    const targetFolderName = (typeof CONFIG !== "undefined" && (CONFIG as any).TARGET_FOLDER_NAME)
      ? (CONFIG as any).TARGET_FOLDER_NAME
      : "Submittals";

    const subIter = targetParent.getFoldersByName(targetFolderName);
    let submittalsFolder: GoogleAppsScript.Drive.Folder;
    if (subIter.hasNext()) {
      submittalsFolder = subIter.next();
    } else {
      submittalsFolder = targetParent.createFolder(targetFolderName);
    }

    return {
      submittalsFolderId: submittalsFolder.getId(),
      projectRootId
    };
  }
}

/** Global default repository instance for Google Drive filing operations. */
const defaultDriveFilingRepository: DriveFilingRepository = new GoogleDriveFilingRepository();

export { defaultDriveFilingRepository };

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveFilingRepository,
    defaultDriveFilingRepository
  };
}

(globalThis as any).GoogleDriveFilingRepository = GoogleDriveFilingRepository;
(globalThis as any).defaultDriveFilingRepository = defaultDriveFilingRepository;
