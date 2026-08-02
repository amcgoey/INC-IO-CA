import test from 'node:test';
import assert from 'node:assert/strict';

const { WorkflowActionRouter } = require('../src/WorkflowActionRouter');
const { AnalyzeDocumentAction } = require('../src/AnalyzeDocumentAction');
const { InsertPagesAction } = require('../src/InsertPagesAction');
const { WorkflowRunner } = require('../src/WorkflowRunner');
const { createTestContext } = require('../src/WorkflowContextFactory');
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

test('WorkflowActionRouter - getSequence Submittal Incoming_Analysis returns ordered actions', () => {
  const sequence = WorkflowActionRouter.getSequence('Submittal', 'Incoming_Analysis');
  assert.equal(sequence.length, 2);
  assert.ok(sequence[0] instanceof AnalyzeDocumentAction);
  assert.ok(sequence[1] instanceof InsertPagesAction);
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