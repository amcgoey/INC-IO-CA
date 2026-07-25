// src/DriveFilingRepository.ts

class FakeDriveFilingRepository implements DriveFilingRepository {
  public calls: string[] = [];
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
}

class GoogleDriveFilingRepository implements DriveFilingRepository {
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
