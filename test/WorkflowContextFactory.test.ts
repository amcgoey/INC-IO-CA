import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowContextFactory } from '../src/core/workflow/WorkflowContextFactory';
import { DocumentTypeConfigRegistry } from '../src/DocumentTypeConfigRegistry';
import { FakeLogRepository } from './harness/fakes/FakeLogRepository';
import { FakeDriveFilingRepository } from './harness/fakes/FakeDriveFilingRepository';
import { FakePdfDocumentService } from './harness/fakes/FakePdfDocumentService';
import { FakeAiAnalysisAdapter } from './harness/fakes/FakeAiAnalysisAdapter';

const submittalConfig = new DocumentTypeConfigRegistry().getConfig('Submittal');

test('WorkflowContextFactory - createContext populates context config and adapters object', () => {
  const context = WorkflowContextFactory.createContext(submittalConfig);
  assert.ok(context.config);
  assert.equal(context.config.documentType, 'Submittal');
  assert.deepEqual(context.config.projectSearchTerms, ['Submittals', 'Submittal']);
  assert.ok(context.adapters);
});

test('WorkflowContextFactory - createContext resolves overrides passed as top-level parameter', () => {
  const customLogRepo = new FakeLogRepository();
  const context = WorkflowContextFactory.createContext(submittalConfig, {
    logRepository: customLogRepo
  });

  assert.strictEqual(context.adapters?.logRepository, customLogRepo);
});

test('WorkflowContextFactory - createContext resolves default constructor dynamically via string adapter key', () => {
  const customConfig = {
    ...submittalConfig,
    logAdapterKey: 'CustomLogAdapter'
  };

  class CustomLogAdapter {
    isCustom = true;
  }

  (globalThis as any).CustomLogAdapter = CustomLogAdapter;

  const context = WorkflowContextFactory.createContext(customConfig);
  const resolved = context.adapters?.logRepository;
  assert.ok(resolved instanceof CustomLogAdapter);

  delete (globalThis as any).CustomLogAdapter;
});

test('WorkflowContextFactory - createTestContext lazy getter instantiates test fakes on first access only', () => {
  let fakeLogRepoConstructorCount = 0;
  
  class TrackedFakeLogRepository extends FakeLogRepository {
    constructor() {
      super();
      fakeLogRepoConstructorCount++;
    }
  }

  const context = WorkflowContextFactory.createTestContext(submittalConfig, {
    logRepository: undefined
  });

  assert.equal(fakeLogRepoConstructorCount, 0);

  const logRepo1 = context.adapters?.logRepository;
  assert.ok(logRepo1 instanceof FakeLogRepository);

  const logRepo2 = context.adapters?.logRepository;
  assert.strictEqual(logRepo1, logRepo2);
});

test('WorkflowContextFactory - createTestContext binds all four adapters to test fakes automatically', () => {
  const context = WorkflowContextFactory.createTestContext(submittalConfig);

  assert.ok(context.adapters?.logRepository instanceof FakeLogRepository);
  assert.ok(context.adapters?.driveFilingRepository instanceof FakeDriveFilingRepository);
  assert.ok(context.adapters?.pdfDocumentService instanceof FakePdfDocumentService);
  assert.ok(context.adapters?.aiAnalysisService instanceof FakeAiAnalysisAdapter);
});

test('WorkflowContextFactory - createTestContext respects explicit adapter overrides', () => {
  const customLogRepo = new FakeLogRepository();
  const context = WorkflowContextFactory.createTestContext(submittalConfig, {
    logRepository: customLogRepo
  });

  assert.strictEqual(context.adapters?.logRepository, customLogRepo);
  assert.ok(context.adapters?.driveFilingRepository instanceof FakeDriveFilingRepository);
});

test('WorkflowContextFactory - top level getters mirror context.adapters properties for backward compatibility', () => {
  const context = WorkflowContextFactory.createTestContext(submittalConfig);

  assert.strictEqual(context.logRepository, context.adapters?.logRepository);
  assert.strictEqual(context.driveFilingRepository, context.adapters?.driveFilingRepository);
  assert.strictEqual(context.pdfDocumentService, context.adapters?.pdfDocumentService);
  assert.strictEqual(context.aiAnalysisService, context.adapters?.aiAnalysisService);
});

test('WorkflowContextFactory - preserved state across object copying', () => {
  const context = WorkflowContextFactory.createTestContext(submittalConfig, {}, { fileId: '12345' });
  const logRepoOriginal = context.adapters?.logRepository;

  const contextCopy: DocumentActionContext = {
    ...context,
    adapters: context.adapters,
    newFileName: 'Test.pdf'
  };

  assert.equal(contextCopy.fileId, '12345');
  assert.equal(contextCopy.newFileName, 'Test.pdf');
  assert.strictEqual(contextCopy.adapters?.logRepository, logRepoOriginal);
});
