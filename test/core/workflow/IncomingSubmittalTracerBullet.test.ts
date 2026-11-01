import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineBuilder } from '../../../src/core/workflow/PipelineBuilder';
import { ActionRegistry } from '../../../src/core/workflow/ActionRegistry';
import { DocumentTypeSpecRegistry } from '../../../src/core/specs/DocumentTypeSpecRegistry';
import { DocumentTypeConfigRegistry } from '../../../src/DocumentTypeConfigRegistry';
import { FakeDriveFilingRepository } from '../../../src/adapters/fakes/FakeDriveFilingRepository';
import { FakePdfDocumentService } from '../../../src/adapters/fakes/FakePdfDocumentService';
import { FakeLogRepository } from '../../harness/fakes/FakeLogRepository';
import { FakeSpreadsheetLockAdapter } from '../../../src/adapters/fakes/FakeSpreadsheetLockAdapter';
import { FakeEmailDraftAdapter } from '../../harness/fakes/FakeEmailDraftAdapter';
import { createValidatedArchitectureSubmittal } from '../../harness/factories/DocumentFactory';
import { AttachmentDescriptor } from '../../../src/core/interfaces/PdfDocumentService';
import { DualDocumentSubmittalFilingAction } from '../../../src/core/workflow/DualDocumentSubmittalFilingAction';
import { DraftEmailAction } from '../../../src/core/workflow/DraftEmailAction';
import { ReadLogAction } from '../../../src/ReadLogAction';
import { WriteLogAction } from '../../../src/WriteLogAction';
import { DocumentPipeline } from '../../../src/core/intake/DocumentPipeline';

describe('Incoming Submittal Tracer Bullet (Issue #303)', () => {
  let specRegistry: DocumentTypeSpecRegistry;
  let configRegistry: DocumentTypeConfigRegistry;
  let actionRegistry: ActionRegistry;
  let fakeDriveRepo: FakeDriveFilingRepository;
  let fakePdfService: FakePdfDocumentService;
  let fakeLogRepo: FakeLogRepository;
  let fakeLockAdapter: FakeSpreadsheetLockAdapter;
  let fakeEmailAdapter: FakeEmailDraftAdapter;

  beforeEach(() => {
    specRegistry = new DocumentTypeSpecRegistry();
    configRegistry = new DocumentTypeConfigRegistry(specRegistry);
    actionRegistry = new ActionRegistry();

    fakeDriveRepo = new FakeDriveFilingRepository();
    fakePdfService = new FakePdfDocumentService();
    fakeLogRepo = new FakeLogRepository();
    fakeLockAdapter = new FakeSpreadsheetLockAdapter();
    fakeEmailAdapter = new FakeEmailDraftAdapter();

    actionRegistry.register('ReadLog', new ReadLogAction());
    actionRegistry.register('DualDocumentSubmittalFiling', new DualDocumentSubmittalFilingAction());
    actionRegistry.register('WriteLog', new WriteLogAction());
    actionRegistry.register('DraftEmail', new DraftEmailAction());
  });

  it('matches declarative Incoming workflow when action === "Received" across host contexts (Gmail, GoogleDrive, omitted)', async () => {
    const builder = new PipelineBuilder(actionRegistry);
    const spec = specRegistry.getSpec('SUBMITTAL_ARCH');
    const workflows = spec.workflows || [];

    // 1. hostContext: 'Gmail'
    const ctxGmail = {
      triggerContext: 'Gmail',
      hostContext: 'Gmail',
      fieldValues: { action: 'Received' }
    };
    const pipelineGmail = builder.buildPipeline(workflows, ctxGmail);
    expect(pipelineGmail.map(a => a.name)).toEqual([
      'ReadLog',
      'DualDocumentSubmittalFiling',
      'WriteLog',
      'DraftEmail'
    ]);

    // 2. hostContext: 'GoogleDrive'
    const ctxDrive = {
      triggerContext: 'GoogleDrive',
      hostContext: 'GoogleDrive',
      fieldValues: { action: 'Received' }
    };
    const pipelineDrive = builder.buildPipeline(workflows, ctxDrive);
    expect(pipelineDrive.map(a => a.name)).toEqual([
      'ReadLog',
      'DualDocumentSubmittalFiling',
      'WriteLog',
      'DraftEmail'
    ]);

    // 3. hostContext omitted
    const ctxNone = {
      triggerContext: 'Received',
      fieldValues: { action: 'Received' }
    };
    const pipelineNone = builder.buildPipeline(workflows, ctxNone);
    expect(pipelineNone.map(a => a.name)).toEqual([
      'ReadLog',
      'DualDocumentSubmittalFiling',
      'WriteLog',
      'DraftEmail'
    ]);
  });

  it('pre-submission guard halts and returns interaction_required when fileSource === "link" and no Drive file ID fetched', () => {
    const formInput = {
      fileSource: 'link',
      action: 'Received',
      discipline: 'Architecture',
      section: '081100',
      submittalNum: '001',
      revNum: '01',
      title: 'Hollow Metal Doors',
      date: '2026-07-25',
      contact: 'GC',
      incomingRouting: 'To Review'
    };

    const result = DocumentPipeline.processFormIntake(formInput);

    expect(result.status).toBe('interaction_required');
    expect(result.message).toContain('Fetch & Save to Drive');
  });

  it('executes full Dual-Document lifecycle and logs row atomically with =HYPERLINK formula and archive notes', async () => {
    const doc = createValidatedArchitectureSubmittal({
      disciplineDetails: {
        section: '081100',
        number: '001',
        title: 'Hollow Metal Doors',
        revision: '01'
      }
    });

    const pdf1: AttachmentDescriptor = {
      fileName: '02_Drawing.pdf',
      mimeType: 'application/pdf',
      bytes: [1, 2]
    };
    const pdf2: AttachmentDescriptor = {
      fileName: '01_Transmittal.pdf',
      mimeType: 'application/pdf',
      bytes: [3, 4]
    };
    const dwg: AttachmentDescriptor = {
      fileName: 'Model.dwg',
      mimeType: 'application/acad',
      bytes: [5, 6]
    };

    const input: any = {
      validatedDoc: doc,
      appContext: 'Gmail',
      logFileId: 'ss-log-123',
      targetFolderId: 'submittals-folder-123',
      selectedAction: { action: 'Received', abbr: 'Rec', status: 'Under Review' },
      incomingRouting: 'To Refer',
      projectAbbr: 'TESTPROJ',
      attachments: [pdf1, dwg, pdf2],
      logRepository: fakeLogRepo,
      driveFilingRepository: fakeDriveRepo,
      adapters: {
        spreadsheetLockAdapter: fakeLockAdapter,
        emailDraftAdapter: fakeEmailAdapter,
        pdfDocumentService: fakePdfService,
        logRepository: fakeLogRepo,
        driveFilingRepository: fakeDriveRepo
      }
    };

    const result = await PipelineBuilder.buildAndExecute(
      input,
      actionRegistry,
      specRegistry,
      configRegistry
    );

    expect(result.success).toBe(true);

    // 1. Verify alphanumeric sort passed to mergeBlobsToPdf
    expect(fakePdfService.mergeBlobsCalls.length).toBe(1);
    const mergeCall = fakePdfService.mergeBlobsCalls[0];
    expect((mergeCall.blobs[0] as any).fileName).toBe('01_Transmittal.pdf');
    expect((mergeCall.blobs[1] as any).fileName).toBe('02_Drawing.pdf');

    // 2. Verify archived files in Closed/081100/
    const closedFilings = fakeDriveRepo.filedDocuments.filter(f =>
      f.options.subfolderPath && f.options.subfolderPath.includes('Closed')
    );
    expect(closedFilings.length).toBe(2);
    expect(closedFilings.some(f => f.options.newFileName === 'Model.dwg')).toBe(true);

    // 3. Verify staged ReviewDocument in Submittals/ root with leading underscore
    const stagedFiling = fakeDriveRepo.filedDocuments.find(f =>
      !f.options.subfolderPath || f.options.subfolderPath.length === 0
    );
    expect(stagedFiling).toBeDefined();
    expect(stagedFiling?.options.newFileName?.startsWith('_')).toBe(true);

    // 4. Verify single atomic log row written with =HYPERLINK formula & Notes archive details
    expect(fakeLogRepo.appendedDocuments.length).toBe(1);
    const appended = fakeLogRepo.appendedDocuments[0];
    expect(appended.spreadsheetId).toBe('ss-log-123');
    expect(appended.options?.status).toBe('Under Review');
    expect(appended.options?.link).toContain('=HYPERLINK(');
    expect(appended.options?.link).toContain(stagedFiling?.result.url);

    // Verify Notes in validated doc contain archive information
    expect(result.notes || doc.notes).toContain('[Also archived in Closed: Model.dwg]');

    // 5. Verify email referral draft was created
    expect(fakeEmailAdapter.createdDrafts.length).toBe(1);
    expect(fakeEmailAdapter.drafts[0].subject).toContain('Submittal for Review');
    expect(result.draftUrl).toBeDefined();

    // 6. Verify concurrency lock was acquired and released
    expect(fakeLockAdapter.acquiredCount).toBe(1);
    expect(fakeLockAdapter.releasedCount).toBe(1);
    expect(fakeLockAdapter.isLocked('ss-log-123')).toBe(false);
  });

  it('aborts pipeline cleanly when PDF stamping fails, leaving 0 rows in log workbook', async () => {
    const doc = createValidatedArchitectureSubmittal();

    fakePdfService.stampSubmittal = async () => {
      throw new Error('PDF is corrupt or password protected');
    };

    const pdf: AttachmentDescriptor = {
      fileName: 'Corrupt.pdf',
      mimeType: 'application/pdf',
      bytes: [0]
    };

    const input: any = {
      validatedDoc: doc,
      appContext: 'Gmail',
      logFileId: 'ss-log-456',
      targetFolderId: 'submittals-folder-123',
      selectedAction: { action: 'Received', abbr: 'Rec', status: 'Under Review' },
      attachments: [pdf],
      logRepository: fakeLogRepo,
      driveFilingRepository: fakeDriveRepo,
      adapters: {
        spreadsheetLockAdapter: fakeLockAdapter,
        pdfDocumentService: fakePdfService,
        logRepository: fakeLogRepo,
        driveFilingRepository: fakeDriveRepo
      }
    };

    await expect(
      PipelineBuilder.buildAndExecute(input, actionRegistry, specRegistry, configRegistry)
    ).rejects.toThrow(/PDF is corrupt or password protected/);

    // ZERO rows appended to workbook!
    expect(fakeLogRepo.appendedDocuments.length).toBe(0);
    // Lock was not leaked
    expect(fakeLockAdapter.isLocked('ss-log-456')).toBe(false);
  });

  it('serializes concurrent WriteLog operations under SpreadsheetLockAdapter', async () => {
    const doc1 = createValidatedArchitectureSubmittal({ disciplineDetails: { number: '001' } });
    const doc2 = createValidatedArchitectureSubmittal({ disciplineDetails: { number: '002' } });

    const writeAction = new WriteLogAction();

    // Acquire lock manually to simulate contention
    fakeLockAdapter.acquireLock('ss-concurrent');

    const context: any = {
      validatedDoc: doc1,
      spreadsheetId: 'ss-concurrent',
      selectedAction: { action: 'Received', abbr: 'Rec', status: 'Under Review' },
      adapters: {
        logRepository: fakeLogRepo,
        spreadsheetLockAdapter: fakeLockAdapter
      }
    };

    await expect(writeAction.execute(context)).rejects.toThrow(/Failed to acquire lock for spreadsheet/i);
    expect(fakeLogRepo.appendedDocuments.length).toBe(0);
  });
});
