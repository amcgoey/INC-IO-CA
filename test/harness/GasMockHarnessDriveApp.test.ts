import test from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./GasMockHarness";
import { MockBlob } from "./MockDrive";
const { GoogleDriveFilingRepository } = require("../../src/DriveFilingRepository");

test("GasMockHarness DriveApp - attaches DriveApp to globalThis on install", () => {
  const harness = GasMockHarness.install();
  assert.ok((globalThis as any).DriveApp, "DriveApp should be attached to globalThis");
  assert.ok(typeof (globalThis as any).DriveApp.getFolderById === "function");
  assert.ok(typeof (globalThis as any).DriveApp.getFileById === "function");
  GasMockHarness.uninstall();
});

test("GasMockHarness DriveApp - getFolderById and getFileById manipulate virtual tree", () => {
  const harness = GasMockHarness.install();
  const driveState = harness.getDriveState();

  const rootFolder = (globalThis as any).DriveApp.getFolderById("root-folder-1");
  assert.strictEqual(rootFolder.getId(), "root-folder-1");

  const subFolder = rootFolder.createFolder("Submittals");
  assert.strictEqual(subFolder.getName(), "Submittals");

  const folderIter = rootFolder.getFoldersByName("Submittals");
  assert.strictEqual(folderIter.hasNext(), true);
  const fetchedSubFolder = folderIter.next();
  assert.strictEqual(fetchedSubFolder.getId(), subFolder.getId());

  GasMockHarness.uninstall();
});

test("GasMockHarness DriveApp - file creation and state inspection helper getFileById and getFiledDocuments", () => {
  const harness = GasMockHarness.install();
  const driveState = harness.getDriveState();

  const folder = (globalThis as any).DriveApp.getFolderById("target-folder-100");
  const file = folder.createFile("TestDoc.pdf", "sample content", "application/pdf");

  assert.strictEqual(file.getName(), "TestDoc.pdf");
  assert.ok(file.getId(), "File should have generated ID");

  const inspectedFile = driveState.getFileById(file.getId());
  assert.ok(inspectedFile, "State inspector should locate file by ID");
  assert.strictEqual(inspectedFile?.name, "TestDoc.pdf");

  const filedDocs = driveState.getFiledDocuments();
  assert.strictEqual(filedDocs.length, 1);
  assert.strictEqual(filedDocs[0].id, file.getId());

  GasMockHarness.uninstall();
});

test("GasMockHarness DriveApp - file movement via moveTo updates parent folder hierarchy", () => {
  const harness = GasMockHarness.install();
  const driveState = harness.getDriveState();

  const folderA = (globalThis as any).DriveApp.getFolderById("folder-A");
  const folderB = (globalThis as any).DriveApp.getFolderById("folder-B");

  const file = folderA.createFile("MoveMe.pdf", "pdf data", "application/pdf");
  assert.strictEqual(file.getParents().next().getId(), "folder-A");

  file.moveTo(folderB);
  assert.strictEqual(file.getParents().next().getId(), "folder-B");

  const inspectedFile = driveState.getFileById(file.getId());
  assert.strictEqual(inspectedFile?.folderId, "folder-B");

  GasMockHarness.uninstall();
});

test("GasMockHarness DriveApp - reset purges virtual filesystem state", () => {
  const harness = GasMockHarness.install();
  const folder = (globalThis as any).DriveApp.getFolderById("folder-x");
  folder.createFile("Doc.pdf", "content", "application/pdf");

  assert.strictEqual(harness.getDriveState().getFiledDocuments().length, 1);

  GasMockHarness.reset();
  assert.strictEqual(harness.getDriveState().getFiledDocuments().length, 0);

  GasMockHarness.uninstall();
});

test("GasMockHarness DriveApp - GoogleDriveFilingRepository integration with virtual DriveApp", () => {
  const harness = GasMockHarness.install();
  const repo = new GoogleDriveFilingRepository();

  const blob = new MockBlob("Submittal text content", "application/pdf", "RawDocument.pdf");
  const result = repo.fileDocument(
    { blob },
    {
      targetFolderId: "root",
      subfolderPath: ["Submittals", "Closed"],
      newFileName: "01 33 00_Submittal_01"
    }
  );

  assert.ok(result.fileId);
  assert.ok(result.url.includes(result.fileId));
  assert.ok(result.localPath.includes("Closed"));

  const filedDoc = harness.getDriveState().getFileById(result.fileId);
  assert.ok(filedDoc);
  assert.strictEqual(filedDoc?.name, "01 33 00_Submittal_01.pdf");

  GasMockHarness.uninstall();
});
