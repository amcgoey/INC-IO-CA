import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert";
const { GoogleDriveFilingRepository, defaultDriveFilingRepository } = require("../src/DriveFilingRepository");
const { FakeDriveFilingRepository, GasMockHarness } = require("./harness");
const { MockBlob } = require("./harness/MockDrive");

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
  const harness = GasMockHarness.install();
  try {
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
  } finally {
    delete (globalThis as any).Drive;
    GasMockHarness.uninstall();
  }
});

test("GoogleDriveFilingRepository resolves My Drive path using DriveApp parent traversal", () => {
  const harness = GasMockHarness.install();
  try {
    delete (globalThis as any).Drive;
    const driveState = harness.getDriveState();

    const rootFolder = (globalThis as any).DriveApp.getFolderById("root");
    const submittalsFolder = rootFolder.createFolder("Submittals");
    const file = submittalsFolder.createFile("MyDoc.pdf", "content", "application/pdf");

    const repo = new GoogleDriveFilingRepository();
    const resolvedPath = repo.getLocalPath(file.getId());
    assert.strictEqual(resolvedPath, "G:\\My Drive\\Submittals\\MyDoc.pdf");
  } finally {
    GasMockHarness.uninstall();
  }
});

test("GoogleDriveFilingRepository returns fallback path on error", () => {
  const harness = GasMockHarness.install();
  try {
    delete (globalThis as any).Drive;
    (globalThis as any).DriveApp.getFileById = () => { throw new Error("Drive API Failure"); };

    const repo = new GoogleDriveFilingRepository();
    const resolvedPath = repo.getLocalPath("err-file-id");
    assert.strictEqual(resolvedPath, "G:\\Error\\err-file-id");
  } finally {
    GasMockHarness.uninstall();
  }
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
  const harness = GasMockHarness.install();
  try {
    delete (globalThis as any).Drive;
    const driveState = harness.getDriveState();
    const targetFolder = (globalThis as any).DriveApp.getFolderById("folder-target-id");
    const origFile = targetFolder.createFile("Original.pdf", "content", "application/pdf");

    const repo = new GoogleDriveFilingRepository();
    const result = repo.fileDocument(
      { fileId: origFile.getId() },
      { targetFolderId: "folder-target-id", subfolderPath: ["Closed", "03-Concrete"], newFileName: "033000-001 Concrete" }
    );

    assert.strictEqual(result.fileId, origFile.getId());
    assert.ok(result.folderId);
    assert.ok(result.localPath.includes("Closed"));
    assert.strictEqual(origFile.getName(), "033000-001 Concrete.pdf");
  } finally {
    GasMockHarness.uninstall();
  }
});

test("GoogleDriveFilingRepository.fileDocument creates new file when blob is provided", () => {
  const harness = GasMockHarness.install();
  try {
    delete (globalThis as any).Drive;
    const mockBlob = new MockBlob("Sample content", "application/pdf", "Sample.pdf");

    const repo = new GoogleDriveFilingRepository();
    const result = repo.fileDocument(
      { blob: mockBlob as any },
      { targetFolderId: "root-123", subfolderPath: ["Closed"], newFileName: "Sample.pdf" }
    );

    assert.ok(result.fileId);
    assert.ok(result.folderId);
  } finally {
    GasMockHarness.uninstall();
  }
});
