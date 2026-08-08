import test from 'node:test';
import assert from 'node:assert/strict';
import { WriteLogAction } from '../src/WriteLogAction';
import { WorkflowRunner } from '../src/core/workflow/WorkflowRunner';
import { FakeLogRepository } from './harness/fakes/FakeLogRepository';
import { ArchitectureSubmittalStrategy, FFESubmittalStrategy } from '../src/DocumentLogStrategy';
import { createValidatedArchitectureSubmittal, createValidatedFFESubmittal } from './harness/factories/DocumentFactory';
import { IdentityData, WriteLogInput } from '../src/types';
import { createTestContext } from '../src/core/workflow/WorkflowContextFactory';

test('WriteLogAction - early guard validation throws descriptive error when logRepository is missing', async () => {
  const action = new WriteLogAction();
  const doc = createValidatedArchitectureSubmittal();

  const context = {
    validatedDoc: doc
  };

  await assert.rejects(
    async () => { await action.execute(context); },
    /WriteLogAction requires logRepository adapter/
  );
});

test('WriteLogAction - early guard validation throws descriptive error when validatedDoc is missing', async () => {
  const action = new WriteLogAction();
  const testContext = createTestContext(undefined, undefined, { validatedDoc: null, document: null });

  await assert.rejects(
    async () => { await action.execute(testContext); },
    /WriteLogAction requires validatedDoc in context/
  );
});

test('WriteLogAction - executes with DocumentActionContext and updates context with append results', async () => {
  const doc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();
  const action = new WriteLogAction();

  const testContext = createTestContext(undefined, undefined, {
    validatedDoc: doc,
    strategy,
    spreadsheetId: 'test-ss-context-123',
    selectedAction: { action: 'Approved', abbr: 'APP', status: 'Approved' }
  });

  const resultContext = await action.execute(testContext);

  assert.equal(resultContext.targetKey, '081100-001-01');
  assert.equal(typeof resultContext.rowIndex, 'number');
  assert.deepEqual(resultContext.failedColumns, []);
  assert.ok(resultContext.appendDocumentResult);
  assert.equal(testContext.adapters.logRepository.appendedDocuments.length, 1);
});

test('WriteLogAction - resolves IdentityData from ArchitectureSubmittalStrategy and appends document via FakeLogRepository', async () => {
  const fakeRepo = new FakeLogRepository();
  const action = new WriteLogAction();
  const doc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();

  const input: WriteLogInput = {
    spreadsheetId: 'test-ss-123',
    document: doc,
    strategy,
    logRepository: fakeRepo,
    options: {
      link: 'https://drive.google.com/file/d/abc123',
      status: 'In Review',
      actionAbbr: 'REC'
    }
  };

  const result = await WorkflowRunner.runAction(action, input);

  assert.equal(result.targetKey, '081100-001-01');
  assert.equal(fakeRepo.appendedDocuments.length, 1);

  const appended = fakeRepo.appendedDocuments[0];
  assert.equal(appended.spreadsheetId, 'test-ss-123');
  assert.equal(appended.options?.identityData?.identityGroup, '081100-001');
  assert.equal(appended.options?.identityData?.identityRevisionGroup, '081100-001-001-20260725');
  assert.equal(appended.options?.identityData?.identity, '081100-001-01');

  // Verify target row payload formatting
  const payload = strategy.formatRowPayload(doc, { link: 'https://drive.google.com/file/d/abc123', contactHistory: doc.contact, status: 'In Review' });
  assert.equal(payload['Section'], '081100');
  assert.equal(payload['Number'], '001');
  assert.equal(payload['Revision'], '01');
  assert.equal(payload['Title'], 'Door Schedule');
  assert.equal(payload['Status'], 'In Review');

  // Verify column mapping and row insertion plan expectations
  assert.deepEqual(result.failedColumns, []);
  assert.equal(typeof result.rowIndex, 'number');
});

test('WriteLogAction - accepts explicit IdentityData override in input', async () => {
  const fakeRepo = new FakeLogRepository();
  const action = new WriteLogAction();
  const doc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();

  const customIdentity: IdentityData = {
    identityGroup: 'custom-group',
    identityRevisionGroup: 'custom-sort',
    identity: 'custom-key-01'
  };

  const input: WriteLogInput = {
    spreadsheetId: 'test-ss-456',
    document: doc,
    strategy,
    identityData: customIdentity,
    logRepository: fakeRepo
  };

  const result = await WorkflowRunner.runAction(action, input);

  assert.equal(fakeRepo.appendedDocuments.length, 1);
  const appended = fakeRepo.appendedDocuments[0];
  assert.deepEqual(appended.options?.identityData, customIdentity);
  assert.equal(result.targetKey, '081100-001-01');
});

test('WorkflowRunner.runAction - executes WriteLogAction seam cleanly for FF&E submittals', async () => {
  const fakeRepo = new FakeLogRepository();
  const action = new WriteLogAction();
  const doc = createValidatedFFESubmittal();
  const strategy = new FFESubmittalStrategy();

  const input: WriteLogInput = {
    spreadsheetId: 'ffe-ss-789',
    document: doc,
    strategy,
    logRepository: fakeRepo,
    options: {
      link: 'https://drive.google.com/file/d/ffe456',
      status: 'Approved',
      actionAbbr: 'APP'
    }
  };

  const result = await WorkflowRunner.runAction(action, input);

  assert.equal(result.targetKey, 'CH-01-01');
  assert.equal(fakeRepo.appendedDocuments.length, 1);
  assert.equal(fakeRepo.appendedDocuments[0].options?.identityData?.identityGroup, 'ch-01');
  assert.equal(fakeRepo.appendedDocuments[0].options?.identityData?.identity, 'CH-01-01');

  // Verify FF&E row payload formatting
  const payload = strategy.formatRowPayload(doc, { link: 'https://drive.google.com/file/d/ffe456', contactHistory: doc.contact, status: 'Approved' });
  assert.equal(payload['Spec Tag'], 'CH-01');
  assert.equal(payload['Vendor'], 'Herman Miller');
  assert.equal(payload['Status'], 'Approved');
});

test('WorkflowRunner.runSequence - executes WriteLogAction in a sequence pipeline', async () => {
  const fakeRepo = new FakeLogRepository();
  const action = new WriteLogAction();
  const doc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();

  const input: WriteLogInput = {
    spreadsheetId: 'test-ss-seq',
    document: doc,
    strategy,
    logRepository: fakeRepo
  };

  const results = await WorkflowRunner.runSequence([
    { action, input }
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].targetKey, '081100-001-01');
});
