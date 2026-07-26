import test from "node:test";
import assert from "node:assert";
const { GoogleDriveFilingRepository, defaultDriveFilingRepository } = require("../src/DriveFilingRepository");
const { FakeDriveFilingRepository } = require("./harness/index");

test("FakeDriveFilingRepository records calls and returns deterministic path", () => {
  const repo = new FakeDriveFilingRepository();
  const path1 = repo.getLocalPath("file-123");
  assert.strictEqual(path1, "G:\\My Drive\\FakePath\\file-123");
  assert.deepStrictEqual(repo.calls, ["file-123"]);
});

test("FakeDriveFilingRepository supports custom configured paths", () => {
  const repo = new FakeDriveFilingRepository({ "file-abc": "G:\\Custom\\Path\\file-abc.pdf" });
  const path = repo.getLocalPath("file-abc");
  assert.strictEqual(path, "G:\\Custom\\Path\\file-abc.pdf");
});

test("GoogleDriveFilingRepository resolves Shared Drive path using Drive Advanced Service", () => {
  const mockDrive = {
    Files: {
      get: (id: string) => {
        if (id === "file-sd-1") return { title: "Submittal.pdf", driveId: "sd-id-99", parents: [{ id: "folder-sub-1" }] };
        if (id === "folder-sub-1") return { title: "03-Concrete", parents: [{ id: "sd-id-99" }] };
        throw new Error("Unknown file id " + id);
      }
    },
    Drives: {
      get: (id: string) => {
        if (id === "sd-id-99") return { name: "Project Alpha Drive" };
        throw new Error("Unknown drive id " + id);
      }
    }
  };
  (globalThis as any).Drive = mockDrive;

  const repo = new GoogleDriveFilingRepository();
  const resolvedPath = repo.getLocalPath("file-sd-1");
  assert.strictEqual(resolvedPath, "G:\\Shared drives\\Project Alpha Drive\\03-Concrete\\Submittal.pdf");
});

test("GoogleDriveFilingRepository resolves My Drive path using DriveApp parent traversal", () => {
  delete (globalThis as any).Drive;

  const mockFile = {
    getName: () => "MyDoc.pdf",
    getParents: () => {
      let visited = false;
      return {
        hasNext: () => !visited,
        next: () => {
          visited = true;
          return mockFolder;
        }
      };
    }
  };

  const mockFolder = {
    getName: () => "Submittals",
    getParents: () => {
      let visited = false;
      return {
        hasNext: () => !visited,
        next: () => {
          visited = true;
          return rootFolder;
        }
      };
    }
  };

  const rootFolder = {
    getName: () => "My Drive",
    getParents: () => ({ hasNext: () => false })
  };

  (globalThis as any).DriveApp = {
    getFileById: (id: string) => {
      if (id === "file-md-1") return mockFile;
      throw new Error("Not found");
    }
  };

  const repo = new GoogleDriveFilingRepository();
  const resolvedPath = repo.getLocalPath("file-md-1");
  assert.strictEqual(resolvedPath, "G:\\My Drive\\Submittals\\MyDoc.pdf");
});

test("GoogleDriveFilingRepository returns fallback path on error", () => {
  (globalThis as any).DriveApp = {
    getFileById: () => { throw new Error("Drive API Failure"); }
  };
  delete (globalThis as any).Drive;

  const repo = new GoogleDriveFilingRepository();
  const resolvedPath = repo.getLocalPath("err-file-id");
  assert.strictEqual(resolvedPath, "G:\\Error\\err-file-id");
});

test("defaultDriveFilingRepository is an instance of GoogleDriveFilingRepository", () => {
  assert.ok(defaultDriveFilingRepository instanceof GoogleDriveFilingRepository);
});

test("FakeDriveFilingRepository.fileDocument records invocation and returns deterministic result", () => {
  const repo = new FakeDriveFilingRepository();
  const options = { targetFolderId: "target-123", subfolderPath: ["Closed", "03-Concrete"] };
  const res = repo.fileDocument({ fileId: "file-999" }, options);

  assert.strictEqual(res.fileId, "file-999");
  assert.strictEqual(res.url, "http://drive.google.com/file-999");
  assert.strictEqual(res.folderId, "folder-Closed-03-Concrete");
  assert.strictEqual(res.localPath, "G:\\My Drive\\FakePath\\file-999");
  assert.strictEqual(repo.filedDocuments.length, 1);
  assert.deepStrictEqual(repo.filedDocuments[0].options, options);
});

test("FakeDriveFilingRepository.fileDocument handles FF&E subfolder structure", () => {
  const repo = new FakeDriveFilingRepository();
  const options = { targetFolderId: "target-123", subfolderPath: ["Closed", "CH"] };
  const res = repo.fileDocument({ fileId: "file-ffe-123" }, options);

  assert.strictEqual(res.fileId, "file-ffe-123");
  assert.strictEqual(res.folderId, "folder-Closed-CH");
  assert.strictEqual(repo.filedDocuments.length, 1);
  assert.deepStrictEqual(repo.filedDocuments[0].options, options);
});

test("GoogleDriveFilingRepository.fileDocument traverses subfolder path and moves existing fileId", () => {
  let movedToFolderId = "";
  let renamedTo = "";
  const mockFile = {
    getId: () => "file-move-1",
    getUrl: () => "http://drive.google.com/file-move-1",
    moveTo: (targetFolder: any) => { movedToFolderId = targetFolder.getId(); },
    setName: (name: string) => { renamedTo = name; }
  };

  const mockConcreteFolder = {
    getId: () => "folder-03-concrete-id",
    getFoldersByName: () => ({ hasNext: () => false }),
    createFolder: () => mockConcreteFolder
  };

  const mockClosedFolder = {
    getId: () => "folder-closed-id",
    getFoldersByName: (name: string) => {
      if (name === "03-Concrete") {
        return {
          hasNext: () => true,
          next: () => mockConcreteFolder
        };
      }
      return { hasNext: () => false };
    },
    createFolder: () => mockConcreteFolder
  };

  const mockTargetFolder = {
    getId: () => "folder-target-id",
    getFoldersByName: (name: string) => {
      if (name === "Closed") {
        return {
          hasNext: () => true,
          next: () => mockClosedFolder
        };
      }
      return { hasNext: () => false };
    }
  };

  (globalThis as any).DriveApp = {
    getFolderById: (id: string) => {
      if (id === "folder-target-id") return mockTargetFolder;
      throw new Error("Folder not found " + id);
    },
    getFileById: (id: string) => {
      if (id === "file-move-1") return mockFile;
      throw new Error("File not found " + id);
    }
  };
  delete (globalThis as any).Drive;

  const repo = new GoogleDriveFilingRepository();
  const result = repo.fileDocument(
    { fileId: "file-move-1" },
    { targetFolderId: "folder-target-id", subfolderPath: ["Closed", "03-Concrete"], newFileName: "033000-001 Concrete" }
  );

  assert.strictEqual(result.fileId, "file-move-1");
  assert.strictEqual(result.folderId, "folder-03-concrete-id");
  assert.strictEqual(movedToFolderId, "folder-03-concrete-id");
  assert.strictEqual(renamedTo, "033000-001 Concrete.pdf");
});

test("GoogleDriveFilingRepository.fileDocument creates new file when blob is provided", () => {
  let createdFileName = "";
  const createdMockFile = {
    getId: () => "created-file-id-100",
    getUrl: () => "http://drive.google.com/created-file-id-100",
    setName: (name: string) => { createdFileName = name; }
  };

  const mockFolder = {
    getId: () => "folder-dest-id",
    getFoldersByName: () => ({ hasNext: () => false }),
    createFolder: () => mockFolder,
    createFile: (b: any) => createdMockFile
  };

  (globalThis as any).DriveApp = {
    getFolderById: () => mockFolder,
    getFileById: (id: string) => createdMockFile
  };
  delete (globalThis as any).Drive;

  const mockBlob = {
    copyBlob: () => mockBlob,
    setName: (n: string) => mockBlob
  };

  const repo = new GoogleDriveFilingRepository();
  const result = repo.fileDocument(
    { blob: mockBlob as any },
    { targetFolderId: "root-123", subfolderPath: ["Closed"], newFileName: "Sample.pdf" }
  );

  assert.strictEqual(result.fileId, "created-file-id-100");
  assert.strictEqual(result.folderId, "folder-dest-id");
});
