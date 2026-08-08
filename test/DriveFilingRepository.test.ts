import test from "node:test";
import assert from "node:assert";
const { GoogleDriveFilingRepository, defaultDriveFilingRepository } = require("../src/adapters/gas/GoogleDriveFilingRepository");
const { FakeDriveFilingRepository } = require("../src/adapters/fakes/FakeDriveFilingRepository");
const { GasMockHarness, createTestContext } = require("./harness");

// --- Pure Node.js Unit Tests (No GAS Runtime Stubs Required) ---

test("FakeDriveFilingRepository records calls and returns deterministic path in pure Node.js", () => {
  const repo = new FakeDriveFilingRepository();
  const path1 = repo.getLocalPath("file-123");
  assert.strictEqual(path1, "G:\\My Drive\\FakePath\\file-123");
  assert.deepStrictEqual(repo.calls, ["file-123"]);
});

test("FakeDriveFilingRepository supports custom configured paths in pure Node.js", () => {
  const repo = new FakeDriveFilingRepository({ "file-abc": "G:\\Custom\\Path\\file-abc.pdf" });
  const path = repo.getLocalPath("file-abc");
  assert.strictEqual(path, "G:\\Custom\\Path\\file-abc.pdf");
});

test("FakeDriveFilingRepository.fileDocument records invocation and returns deterministic result in pure Node.js", () => {
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

test("FakeDriveFilingRepository.fileDocument handles FF&E subfolder structure in pure Node.js", () => {
  const repo = new FakeDriveFilingRepository();
  const options = { targetFolderId: "target-123", subfolderPath: ["Closed", "CH"] };
  const res = repo.fileDocument({ fileId: "file-ffe-123" }, options);

  assert.strictEqual(res.fileId, "file-ffe-123");
  assert.strictEqual(res.folderId, "folder-Closed-CH");
  assert.strictEqual(repo.filedDocuments.length, 1);
  assert.deepStrictEqual(repo.filedDocuments[0].options, options);
});

test("FakeDriveFilingRepository.duplicateDocument records invocation and returns deterministic result in pure Node.js", () => {
  const repo = new FakeDriveFilingRepository();
  const options = { targetFolderId: "target-456", subfolderPath: ["Root"], newFileName: "CopyDoc" };
  const res = repo.duplicateDocument({ fileId: "doc-orig" }, options);

  assert.strictEqual(res.fileId, "doc-orig-copy");
  assert.strictEqual(res.url, "http://drive.google.com/doc-orig-copy");
  assert.strictEqual(res.folderId, "folder-Root");
  assert.strictEqual(repo.duplicatedDocuments.length, 1);
});

// --- GAS Infrastructure Adapter Tests (Uses GasMockHarness for GAS Globals) ---

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
  GasMockHarness.install({ driveAdvancedServiceOverrides: mockDrive });
  try {
    const repo = new GoogleDriveFilingRepository();
    const resolvedPath = repo.getLocalPath("file-sd-1");
    assert.strictEqual(resolvedPath, "G:\\Shared drives\\Project Alpha Drive\\03-Concrete\\Submittal.pdf");
  } finally {
    GasMockHarness.uninstall();
  }
});

test("GoogleDriveFilingRepository resolves My Drive path using DriveApp parent traversal", () => {
  GasMockHarness.install();
  try {
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
  GasMockHarness.install();
  try {
    const driveState = GasMockHarness.instance!.getDriveState();
    driveState.addFailureId("err-file-id");

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
