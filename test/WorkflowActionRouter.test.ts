/// <reference path="../src/types.ts" />
/**
 * @file WorkflowActionRouter.test.ts
 * @description Behavioral test suite for WorkflowActionRouter, ReadLogAction, MoveDocumentAction, WriteLogAction, AnalyzeDocumentAction, InsertPagesAction, and end-to-end WorkflowRunner integration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { ReadLogAction } = require('../src/ReadLogAction');
const { MoveDocumentAction } = require('../src/MoveDocumentAction');
const { WriteLogAction } = require('../src/WriteLogAction');
const { AnalyzeDocumentAction } = require('../src/AnalyzeDocumentAction');
const { InsertPagesAction } = require('../src/InsertPagesAction');
const { WorkflowRunner } = require('../src/WorkflowRunner');
const { WorkflowActionRouter } = require('../src/WorkflowActionRouter');
const { createTestContext } = require('../src/WorkflowContextFactory');
const { ArchitectureSubmittalStrategy } = require('../src/DocumentLogStrategy');
const { createValidatedArchitectureSubmittal } = require('./harness/factories/DocumentFactory');
const { FakeAiAnalysisAdapter } = require('./harness/fakes/FakeAiAnalysisAdapter');
const { FakePdfDocumentService } = require('./harness/fakes/FakePdfDocumentService');

function createMockBlob(name: string = "test_submittal.pdf", content: string = "dummy submittal pdf content"): GoogleAppsScript.Base.Blob {
  return {
    getBytes: () => Buffer.from(content),
    getContentType: () => "application/pdf",
    getName: () => name,
    copyBlob: function() { return this; }
  } as any;
}

test('WorkflowActionRouter - getSequence Submittal Incoming_Filing returns ordered sequence [ReadLogAction, MoveDocumentAction]', () => {
  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Incoming_Filing');
  assert.equal(sequence.length, 2);
  assert.equal(sequence[0].name, 'ReadLog');
  assert.equal(sequence[1].name, 'MoveDocument');
});

test('WorkflowActionRouter - getSequence Submittal Incoming_Analysis returns ordered actions', () => {
  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Incoming_Analysis');
  assert.equal(sequence.length, 2);
  assert.ok(sequence[0] instanceof AnalyzeDocumentAction);
  assert.ok(sequence[1] instanceof InsertPagesAction);
});

test('WorkflowActionRouter - getSequence Submittal Outgoing returns ordered sequence [WriteLogAction, MoveDocumentAction]', () => {
  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Outgoing');
  assert.equal(sequence.length, 2);
  assert.equal(sequence[0].name, 'WriteLog');
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

test('WorkflowActionRouter & WorkflowRunner - End-to-end incoming submittal triage and stamping slice', async () => {
  const fakeAiAdapter = new FakeAiAnalysisAdapter();
  fakeAiAdapter.setAnalyzeSubmittalResult({
    success: true,
    analysis: {
      predictedSection: '033000',
      predictedNumber: '001',
      predictedRevision: '0',
      predictedTitle: 'Cast-in-Place Concrete',
      predictedContactAbbr: 'GC',
      predictedAction: 'For Approval',
      predictedSpecTag: 'CONC-01',
      predictedVendor: 'Concrete Corp'
    }
  });

  const fakePdfService = new FakePdfDocumentService();
  const initialBlob = createMockBlob('incoming_submittal.pdf');

  const context = createTestContext(undefined, {
    aiAnalysisService: fakeAiAdapter,
    pdfDocumentService: fakePdfService
  }, {
    blob: initialBlob,
    coverPageTemplateId: 'cover-template-999',
    emailText: 'Please review the attached concrete submittal.'
  });

  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Incoming_Analysis');
  assert.equal(sequence.length, 2);

  const finalContext = await WorkflowRunner.run(sequence, context);

  // 1. Verify AI metadata extraction
  assert.ok(finalContext.analysis);
  assert.equal(finalContext.analysis.predictedSection, '033000');
  assert.equal(finalContext.analysis.predictedNumber, '001');
  assert.equal(finalContext.analysis.predictedTitle, 'Cast-in-Place Concrete');

  // 2. Verify PDF cover page insertion & stamping via FakePdfDocumentService
  assert.ok(finalContext.blob);
  assert.equal(fakePdfService.stampCalls.length, 1);
  assert.equal(fakePdfService.stampCalls[0].options.templateId, 'cover-template-999');
  assert.equal(fakePdfService.stampCalls[0].data.title, 'Cast-in-Place Concrete');
});

test('End-to-End Behavioral Test - WorkflowRunner runs Submittal Outgoing sequence against createTestContext (WriteLogAction + MoveDocumentAction)', async () => {
  const validatedDoc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();

  const testContext = createTestContext(undefined, undefined, {
    validatedDoc,
    strategy,
    spreadsheetId: 'outgoing-log-ss-300',
    targetFolderId: 'target-outgoing-folder-003',
    subfolderPath: ['Closed', '08 OPENINGS'],
    selectedAction: { action: 'Approved', abbr: 'APP', status: 'Approved' }
  });

  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Outgoing');
  assert.equal(sequence.length, 2);
  assert.equal(sequence[0].name, 'WriteLog');
  assert.equal(sequence[1].name, 'MoveDocument');

  const resultContext = await WorkflowRunner.run(sequence, testContext);

  // 1. Assert WriteLogAction executed and updated context
  assert.equal(resultContext.targetKey, '081100-001-01');
  assert.equal(testContext.adapters.logRepository.appendedDocuments.length, 1);
  assert.equal(testContext.adapters.logRepository.appendedDocuments[0].spreadsheetId, 'outgoing-log-ss-300');

  // 2. Assert MoveDocumentAction executed and filed document
  assert.equal(resultContext.folderId, 'folder-Closed-08 OPENINGS');
  assert.equal(testContext.adapters.driveFilingRepository.filedDocuments.length, 1);
  assert.equal(testContext.adapters.driveFilingRepository.filedDocuments[0].options.targetFolderId, 'target-outgoing-folder-003');
  assert.deepEqual(testContext.adapters.driveFilingRepository.filedDocuments[0].options.subfolderPath, ['Closed', '08 OPENINGS']);
});
