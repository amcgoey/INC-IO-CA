import test from "node:test";
import assert from "node:assert";
const { FakeDriveFilingRepository, GoogleDriveFilingRepository, defaultDriveFilingRepository } = require("../src/DriveFilingRepository");

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
