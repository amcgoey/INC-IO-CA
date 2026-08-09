/// <reference path="../../types.ts" />
/**
 * @file GoogleDriveFilingRepository.ts
 * @description Production implementation of DriveFilingRepository for Google Drive folder hierarchy resolution, subfolder creation, document filing, and Windows G:\ local path mapping.
 */

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
      filedFile = curFolder.createFile(file.blob.copyBlob().setName(name));
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
      const blob = source.blob.copyBlob().setName(name);
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

  getLocalPath(fileId: string): string {
    try {
      if (typeof Drive !== "undefined" && (Drive as any).Files) {
        const fileMeta = (Drive as any).Files.get(fileId, {supportsAllDrives: true});
        let path = [fileMeta.title];
        if (fileMeta.driveId) {
          const driveMeta = (Drive as any).Drives.get(fileMeta.driveId);
          let currentParentId = (fileMeta.parents && fileMeta.parents.length > 0) ? fileMeta.parents[0].id : null;
          while (currentParentId && currentParentId !== fileMeta.driveId) {
            let pFolder = (Drive as any).Files.get(currentParentId, {supportsAllDrives: true});
            path.unshift(pFolder.title);
            currentParentId = (pFolder.parents && pFolder.parents.length > 0) ? pFolder.parents[0].id : null;
          }
          path.unshift(driveMeta.name);
          return "G:\\Shared drives\\" + path.join("\\");
        }
      }

      if (typeof DriveApp !== "undefined") {
        let curFile = DriveApp.getFileById(fileId);
        let path = [curFile.getName()];
        let parents = curFile.getParents();
        while (parents.hasNext()) {
          let pFolder = parents.next();
          let n = pFolder.getName();
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
}

/** Global default repository instance for Google Drive filing operations. */
var defaultDriveFilingRepository: DriveFilingRepository = new GoogleDriveFilingRepository();

export { defaultDriveFilingRepository };

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveFilingRepository,
    defaultDriveFilingRepository
  };
}

(globalThis as any).GoogleDriveFilingRepository = GoogleDriveFilingRepository;
(globalThis as any).defaultDriveFilingRepository = defaultDriveFilingRepository;
