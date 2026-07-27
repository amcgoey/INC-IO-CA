import test from 'node:test';
import assert from 'node:assert/strict';
import { WriteLogAction, WriteLogInput } from '../src/WriteLogAction';
import { WorkflowRunner } from '../src/WorkflowRunner';
import { FakeLogRepository } from './harness/fakes/FakeLogRepository';
import { ArchitectureSubmittalStrategy, FFESubmittalStrategy } from '../src/DocumentLogStrategy';
import { createValidatedArchitectureSubmittal, createValidatedFFESubmittal } from './harness/factories/DocumentFactory';
import { IdentityData } from '../src/types';

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

  const result = await action.execute(input);

  assert.equal(result.targetKey, '081100-001-01');
  assert.equal(fakeRepo.appendedDocuments.length, 1);
  const appended = fakeRepo.appendedDocuments[0];
  assert.equal(appended.spreadsheetId, 'test-ss-123');
  assert.equal(appended.options?.identityData?.identityGroup, '081100-001');
  assert.equal(appended.options?.identityData?.identity, '081100-001-01');
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

  const result = await action.execute(input);

  assert.equal(fakeRepo.appendedDocuments.length, 1);
  const appended = fakeRepo.appendedDocuments[0];
  assert.deepEqual(appended.options?.identityData, customIdentity);
});

