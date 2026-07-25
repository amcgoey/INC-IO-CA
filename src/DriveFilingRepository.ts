// src/DriveFilingRepository.ts

class FakeDriveFilingRepository implements DriveFilingRepository {
  public calls: string[] = [];
  public filedDocuments: Array<{ file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }; options: FilingOptions; result: FilingResult }> = [];
  public customPaths: Record<string, string>;

  constructor(customPaths: Record<string, string> = {}) {
    this.customPaths = customPaths;
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
}

class GoogleDriveFilingRepository implements DriveFilingRepository {
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

var defaultDriveFilingRepository: DriveFilingRepository = new GoogleDriveFilingRepository();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveFilingRepository,
    FakeDriveFilingRepository,
    defaultDriveFilingRepository
  };
}
