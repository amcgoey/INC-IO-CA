/**
 * @file DuplicateDocumentAction.test.ts
 * @description Unit tests for DuplicateDocumentAction.
 */

const assert = require('assert');
const test = require('node:test');
const { DuplicateDocumentAction, defaultDuplicateDocumentAction } = require('../src/core/workflow/DuplicateDocumentAction');
const { WorkflowRunner } = require('../src/WorkflowRunner');
const { FakeDriveFilingRepository } = require('./harness/fakes/FakeDriveFilingRepository');

test('DuplicateDocumentAction - duplicates Drive document via DriveFilingRepository resolving distinct fileId', async () => {
  const fakeRepo = new FakeDriveFilingRepository();
  const action = new DuplicateDocumentAction();

  const context = {
    fileId: 'doc-123',
    targetFolderId: 'folder-456',
    newFileName: 'DuplicatedDoc',
    driveFilingRepository: fakeRepo
  };

  const result = await action.execute(context);

  assert.strictEqual(result.originalFileId, 'doc-123');
  assert.strictEqual(result.fileId, 'doc-123-copy');
  assert.ok(result.url.includes('doc-123-copy'));
  assert.ok(result.localPath.includes('doc-123-copy'));
  assert.strictEqual(fakeRepo.duplicatedDocuments.length, 1);
  assert.strictEqual(fakeRepo.duplicatedDocuments[0].source.fileId, 'doc-123');
});

test('DuplicateDocumentAction - duplicates in-memory Blob when no fileId present', async () => {
  const fakeRepo = new FakeDriveFilingRepository();
  const action = new DuplicateDocumentAction();

  let copyBlobCalled = false;
  const mockBlob = {
    getName: () => 'original.pdf',
    setName: (n: string) => mockBlob,
    copyBlob: () => {
      copyBlobCalled = true;
      return mockBlob;
    }
  };

  const context = {
    blob: mockBlob,
    newFileName: 'CopiedBlob',
    driveFilingRepository: fakeRepo
  };

  const result = await action.execute(context);

  assert.strictEqual(copyBlobCalled, true);
  assert.ok(result.blob);
});

test('DuplicateDocumentAction - executes in WorkflowRunner pipeline threading context', async () => {
  const fakeRepo = new FakeDriveFilingRepository();
  const action = new DuplicateDocumentAction();

  const initialContext = {
    fileId: 'orig-doc-999',
    targetFolderId: 'folder-root',
    driveFilingRepository: fakeRepo
  };

  const finalContext = await WorkflowRunner.run([action], initialContext);

  assert.strictEqual(finalContext.originalFileId, 'orig-doc-999');
  assert.strictEqual(finalContext.fileId, 'orig-doc-999-copy');
});

test('defaultDuplicateDocumentAction global seam exists', () => {
  assert.ok(defaultDuplicateDocumentAction);
  assert.strictEqual(typeof defaultDuplicateDocumentAction.execute, 'function');
});
