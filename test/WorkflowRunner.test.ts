/// <reference path="../src/types.ts" />
/**
 * @file WorkflowRunner.test.ts
 * @description Unit tests for WorkflowRunner pipeline engine, MoveDocumentAction, and RenameDocumentAction.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GasMockHarness, FakeDriveFilingRepository } from './harness';
import { WorkflowRunner, MoveDocumentAction, RenameDocumentAction } from '../src/core/workflow/WorkflowRunner';

test('WorkflowRunner - executes actions sequentially passing modified context', async () => {
  const log: string[] = [];
  const action1 = {
    name: 'Action1',
    async execute(context: any) {
      log.push('action1');
      return { ...context, step1: true };
    }
  };
  const action2 = {
    name: 'Action2',
    async execute(context: any) {
      log.push('action2');
      return { ...context, step2: true };
    }
  };

  const initialContext = { fileId: 'doc-101' };
  const finalContext = await WorkflowRunner.run([action1, action2], initialContext);

  assert.equal(log[0], 'action1');
  assert.equal(log[1], 'action2');
  assert.equal(finalContext.step1, true);
  assert.equal(finalContext.step2, true);
  assert.equal(finalContext.fileId, 'doc-101');
});

test('WorkflowRunner - passes policy directly to action context during execution', async () => {
  const receivedPolicies: any[] = [];
  const action1 = {
    name: 'Action1',
    async execute(context: any) {
      receivedPolicies.push(context.policy);
      return { ...context, step1: true };
    }
  };
  const action2 = {
    name: 'Action2',
    async execute(context: any) {
      receivedPolicies.push(context.policy);
      return { ...context, step2: true };
    }
  };

  const policy: WorkflowPolicySpec = {
    direction: 'incoming',
    stampPdf: true,
    updatePreviousStatus: false
  };

  const initialContext = { fileId: 'doc-policy-test' };
  const finalContext = await WorkflowRunner.run([action1, action2], initialContext, policy);

  assert.equal(receivedPolicies.length, 2);
  assert.deepEqual(receivedPolicies[0], policy);
  assert.deepEqual(receivedPolicies[1], policy);
  assert.deepEqual(finalContext.policy, policy);
});

test('MoveDocumentAction - files document via DriveFilingRepository without renaming', async () => {
  const fakeRepo = new FakeDriveFilingRepository();
  const moveAction = new MoveDocumentAction();

  const context = {
    fileId: 'submittal-123',
    targetFolderId: 'target-folder-id',
    subfolderPath: ['Closed', '08 OPENINGS'],
    driveFilingRepository: fakeRepo
  };

  const result = await moveAction.execute(context);

  assert.equal(result.fileId, 'submittal-123');
  assert.equal(result.folderId, 'folder-Closed-08 OPENINGS');
  assert.equal(result.url, 'http://drive.google.com/submittal-123');
  assert.equal(fakeRepo.filedDocuments.length, 1);
  assert.deepEqual(fakeRepo.filedDocuments[0].options.subfolderPath, ['Closed', '08 OPENINGS']);
});

test('RenameDocumentAction - renames Drive file with explicit newFileName', async () => {
  GasMockHarness.install();

  try {
    const driveApp = globalThis.DriveApp;
    const file = driveApp.createFile('old_name.pdf', 'pdf contents');
    const fileId = file.getId();

    const renameAction = new RenameDocumentAction();
    const context = {
      fileId,
      newFileName: 'SUBMITTAL-001-0-OPENINGS.pdf',
      driveApp
    };

    const result = await renameAction.execute(context);

    assert.equal(result.newFileName, 'SUBMITTAL-001-0-OPENINGS.pdf');
    assert.equal(driveApp.getFileById(fileId).getName(), 'SUBMITTAL-001-0-OPENINGS.pdf');
  } finally {
    GasMockHarness.uninstall();
  }
});

test('WorkflowRunner - 2-step pipeline (Move + Rename) with FakeDriveFilingRepository', async () => {
  GasMockHarness.install();

  try {
    const driveApp = globalThis.DriveApp;
    const file = driveApp.createFile('temp_file.pdf', 'blob content');
    const fileId = file.getId();
    const fakeRepo = new FakeDriveFilingRepository();
    const pipeline = [
      new MoveDocumentAction(),
      new RenameDocumentAction()
    ];

    const initialContext = {
      fileId,
      targetFolderId: 'root-folder-id',
      subfolderPath: ['Submittals', 'Closed'],
      newFileName: 'FINAL_SUBMITTAL_001.pdf',
      driveFilingRepository: fakeRepo,
      driveApp
    };

    const finalContext = await WorkflowRunner.run(pipeline, initialContext);

    assert.equal(finalContext.fileId, fileId);
    assert.equal(finalContext.folderId, 'folder-Submittals-Closed');
    assert.equal(finalContext.newFileName, 'FINAL_SUBMITTAL_001.pdf');
    assert.equal(fakeRepo.filedDocuments.length, 1);
    assert.equal(driveApp.getFileById(fileId).getName(), 'FINAL_SUBMITTAL_001.pdf');
  } finally {
    GasMockHarness.uninstall();
  }
});
