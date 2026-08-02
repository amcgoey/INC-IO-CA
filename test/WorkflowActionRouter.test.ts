/// <reference path="./src/types.ts" />
/**
 * @file WorkflowActionRouter.test.ts
 * @description Behavioral test suite for WorkflowActionRouter, ReadLogAction, MoveDocumentAction, and end-to-end WorkflowRunner integration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { ReadLogAction } = require('../src/ReadLogAction');
const { MoveDocumentAction } = require('../src/MoveDocumentAction');
const { WorkflowRunner } = require('../src/WorkflowRunner');
const { WorkflowActionRouter } = require('../src/WorkflowActionRouter');
const { createTestContext } = require('../src/WorkflowContextFactory');
const { ArchitectureSubmittalStrategy } = require('../src/DocumentLogStrategy');
const { createValidatedArchitectureSubmittal } = require('./harness/factories/DocumentFactory');

test('WorkflowActionRouter - getSequence Submittal Incoming_Filing returns ordered sequence [ReadLogAction, MoveDocumentAction]', () => {
  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Incoming_Filing');
  assert.equal(sequence.length, 2);
  assert.equal(sequence[0].name, 'ReadLog');
  assert.equal(sequence[1].name, 'MoveDocument');
});

test('WorkflowActionRouter - custom sequence registration and clearRegistry', () => {
  const dummyAction = { name: 'Dummy', async execute(ctx: any) { return ctx; } };
  WorkflowActionRouter.registerSequence('RFI', 'Custom_Sequence', [dummyAction]);

  const registered = WorkflowActionRouter.getSequence('RFI', 'Custom_Sequence');
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, 'Dummy');

  WorkflowActionRouter.clearRegistry();
  const cleared = WorkflowActionRouter.getSequence('RFI', 'Custom_Sequence');
  assert.equal(cleared.length, 0);
});

test('ReadLogAction - early guard validation throws descriptive error when logRepository is missing', async () => {
  const action = new ReadLogAction();
  const doc = createValidatedArchitectureSubmittal();

  const context = {
    validatedDoc: doc
  };

  await assert.rejects(
    async () => { await action.execute(context); },
    /ReadLogAction requires logRepository adapter/
  );
});

test('ReadLogAction - early guard validation throws descriptive error when validatedDoc is missing', async () => {
  const action = new ReadLogAction();
  const testContext = createTestContext(undefined, undefined, { validatedDoc: null, document: null, identityData: null });

  await assert.rejects(
    async () => { await action.execute(testContext); },
    /ReadLogAction requires validatedDoc in context/
  );
});

test('MoveDocumentAction - early guard validation throws descriptive error when driveFilingRepository is missing', async () => {
  const action = new MoveDocumentAction();
  const doc = createValidatedArchitectureSubmittal();

  const context = {
    validatedDoc: doc,
    targetFolderId: 'folder-123'
  };

  await assert.rejects(
    async () => { await action.execute(context); },
    /MoveDocumentAction requires driveFilingRepository adapter/
  );
});

test('MoveDocumentAction - early guard validation throws descriptive error when targetFolderId is missing', async () => {
  const action = new MoveDocumentAction();
  const doc = createValidatedArchitectureSubmittal();
  const testContext = createTestContext(undefined, undefined, { validatedDoc: doc, targetFolderId: null });

  await assert.rejects(
    async () => { await action.execute(testContext); },
    /MoveDocumentAction requires targetFolderId in context/
  );
});

test('MoveDocumentAction - early guard validation throws descriptive error when validatedDoc / fileId / blob is missing', async () => {
  const action = new MoveDocumentAction();
  const testContext = createTestContext(undefined, undefined, {
    targetFolderId: 'target-folder-123',
    validatedDoc: null,
    document: null,
    fileId: null,
    blob: null
  });

  await assert.rejects(
    async () => { await action.execute(testContext); },
    /MoveDocumentAction requires validatedDoc or fileId\/blob in context/
  );
});

test('End-to-End Behavioral Test - WorkflowRunner runs Submittal Incoming_Filing sequence against createTestContext (unlogged doc)', async () => {
  const validatedDoc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();

  const testContext = createTestContext(undefined, undefined, {
    validatedDoc,
    strategy,
    spreadsheetId: 'submittal-log-ss-100',
    targetFolderId: 'target-submittals-folder-001',
    subfolderPath: ['08 OPENINGS', 'Submittals']
  });

  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Incoming_Filing');
  const resultContext = await WorkflowRunner.run(sequence, testContext);

  // Assert ReadLogAction execution & results
  assert.notEqual(resultContext.readLogResult, undefined);
  assert.equal(resultContext.readLogResult.found, false);
  assert.equal(testContext.adapters.logRepository.readLogEntries.length, 1);
  assert.equal(testContext.adapters.logRepository.readLogEntries[0].spreadsheetId, 'submittal-log-ss-100');

  // Assert MoveDocumentAction execution & results
  assert.equal(resultContext.folderId, 'folder-08 OPENINGS-Submittals');
  assert.equal(testContext.adapters.driveFilingRepository.filedDocuments.length, 1);
  assert.equal(testContext.adapters.driveFilingRepository.filedDocuments[0].options.targetFolderId, 'target-submittals-folder-001');
  assert.deepEqual(testContext.adapters.driveFilingRepository.filedDocuments[0].options.subfolderPath, ['08 OPENINGS', 'Submittals']);
});

test('End-to-End Behavioral Test - WorkflowRunner runs Submittal Incoming_Filing sequence parsing logged record details', async () => {
  const validatedDoc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();

  const testContext = createTestContext(undefined, undefined, {
    validatedDoc,
    strategy,
    spreadsheetId: 'submittal-log-ss-200',
    targetFolderId: 'target-submittals-folder-002',
    subfolderPath: ['08 OPENINGS', 'Closed']
  });

  // Stub FakeLogRepository matching entry
  testContext.adapters.logRepository.customReadResult = {
    found: true,
    rowIndex: 8,
    contactHistory: 'GC -> Architect -> GC',
    previousStatus: 'Open',
    rowData: { Section: '081100', Number: '001', Status: 'Approved' },
    identityData: strategy.getIdentityData(validatedDoc),
    previousRowUpdated: true
  };

  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Incoming_Filing');
  const resultContext = await WorkflowRunner.run(sequence, testContext);

  // Assert ReadLogAction log record parsing
  assert.equal(resultContext.found, true);
  assert.equal(resultContext.rowIndex, 8);
  assert.equal(resultContext.contactHistory, 'GC -> Architect -> GC');
  assert.equal(resultContext.previousStatus, 'Open');
  assert.equal(resultContext.previousRowUpdated, true);

  // Assert MoveDocumentAction relocation
  assert.equal(resultContext.folderId, 'folder-08 OPENINGS-Closed');
  assert.equal(testContext.adapters.driveFilingRepository.filedDocuments.length, 1);
});
