/**
 * @file DriveFilingRepository.ts
 * @description Implementations of `DriveFilingRepository` for Google Drive folder hierarchy resolution, subfolder creation, document filing, and Windows G:\ local path mapping.
 *
 * Provides `GoogleDriveFilingRepository` for production DriveApp API interactions and
 * `FakeDriveFilingRepository` for unit testing.
 */

/**
 * In-memory test implementation of `DriveFilingRepository`.
 * Records filing calls and returns stubbed `FilingResult` outcomes without invoking Google Drive APIs.
 */
class FakeDriveFilingRepository implements DriveFilingRepository {
  /** Array tracking file IDs passed to getLocalPath. */
  public calls: string[] = [];
  /** Recorded filing executions containing source files, filing options, and results. */
  public filedDocuments: Array<{ file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }; options: FilingOptions; result: FilingResult }> = [];
  /** Custom mapped local paths for testing. */
  public customPaths: Record<string, string>;

  /**
   * Constructs a new `FakeDriveFilingRepository` instance.
   *
   * @param customPaths - Dictionary mapping file IDs to custom mock local paths.
   */
  constructor(customPaths: Record<string, string> = {}) {
    this.customPaths = customPaths;
  }

  /** @override */
  getLocalPath(fileId: string): string {
    this.calls.push(fileId);
    if (this.customPaths[fileId]) {
      return this.customPaths[fileId];
    }
    return "G:\\My Drive\\FakePath\\" + fileId;
  }

  /** @override */
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
}

/**
 * Production implementation of `DriveFilingRepository` using Google Apps Script's `DriveApp` and `Drive` Advanced Service.
 */
class GoogleDriveFilingRepository implements DriveFilingRepository {
  /**
   * Files a document blob or existing Drive file ID into the specified destination folder hierarchy.
   * Creates missing subfolders along the `subfolderPath` array if necessary.
   *
   * @param file - Object containing either an existing `fileId` or new file `blob`.
   * @param options - `FilingOptions` specifying target folder ID, subfolder path segments, and target file name.
   * @returns `FilingResult` containing destination file ID, web URL, Windows G:\ local path, and target folder ID.
   */
  fileDocument(
    file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob },
    options: FilingOptions
  ): FilingResult {
    let curFolder = DriveApp.getFolderById(options.targetFolderId);
    const subfolders = options.subfolderPath || [];
    for (const subName of subfolders) {
      const iter = curFolder.getFoldersByName(subName);
      if (iter.hasNext()) {
        curFolder = iter.next();
      } else {
        curFolder = curFolder.createFolder(subName);
      }
    }

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
   * Resolves the local Windows `G:\` drive file path for a given Google Drive file ID.
   * Traverses parent folder hierarchies for both Shared Drives (`G:\Shared drives\...`) and My Drive (`G:\My Drive\...`).
   *
   * @param fileId - Google Drive file ID string.
   * @returns Formatted Windows local path string (e.g. `G:\Shared drives\Project\Closed\08 OPENINGS\file.pdf`).
   */
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

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveFilingRepository,
    FakeDriveFilingRepository,
    defaultDriveFilingRepository
  };
}
