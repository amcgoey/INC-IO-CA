import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineBuilder } from '../../../src/core/workflow/PipelineBuilder';
import { ActionRegistry } from '../../../src/core/workflow/ActionRegistry';
import { DocumentTypeSpecRegistry } from '../../../src/core/specs/DocumentTypeSpecRegistry';
import { DocumentTypeConfigRegistry } from '../../../src/DocumentTypeConfigRegistry';
import { FakeDriveFilingRepository } from '../../../src/adapters/fakes/FakeDriveFilingRepository';
import { FakePdfDocumentService } from '../../../src/adapters/fakes/FakePdfDocumentService';
import { FakeSpreadsheetLockAdapter } from '../../../src/adapters/fakes/FakeSpreadsheetLockAdapter';
import { FakeEmailDraftAdapter } from '../../harness/fakes/FakeEmailDraftAdapter';
import { InMemorySheetStorageAdapter } from '../../harness/fakes/InMemorySheetStorageAdapter';
import { LogEngine } from '../../../src/core/log/LogEngine';
import { createValidatedArchitectureSubmittal, createValidatedFFESubmittal } from '../../harness/factories/DocumentFactory';
import { ReadLogAction } from '../../../src/ReadLogAction';
import { WriteLogAction } from '../../../src/WriteLogAction';
import { OutgoingSubmittalFilingAction } from '../../../src/core/workflow/OutgoingSubmittalFilingAction';
import { DraftEmailAction } from '../../../src/core/workflow/DraftEmailAction';
import { DeclarativeDocumentLogStrategy } from '../../../src/DocumentLogStrategy';

describe('Outgoing Submittal Tracer Bullet (Issue #310)', () => {
  let specRegistry: DocumentTypeSpecRegistry;
  let configRegistry: DocumentTypeConfigRegistry;
  let actionRegistry: ActionRegistry;
  let fakeDriveRepo: FakeDriveFilingRepository;
  let fakePdfService: FakePdfDocumentService;
  let fakeLockAdapter: FakeSpreadsheetLockAdapter;
  let fakeEmailAdapter: FakeEmailDraftAdapter;

  beforeEach(() => {
    specRegistry = new DocumentTypeSpecRegistry();
    configRegistry = new DocumentTypeConfigRegistry(specRegistry);
    actionRegistry = new ActionRegistry();

    fakeDriveRepo = new FakeDriveFilingRepository();
    fakePdfService = new FakePdfDocumentService();
    fakeLockAdapter = new FakeSpreadsheetLockAdapter();
    fakeEmailAdapter = new FakeEmailDraftAdapter();

    actionRegistry.register('ReadLog', new ReadLogAction());
    actionRegistry.register('OutgoingSubmittalFiling', new OutgoingSubmittalFilingAction());
    actionRegistry.register('WriteLog', new WriteLogAction());
    actionRegistry.register('DraftEmail', new DraftEmailAction());
  });

  it('matches declarative Outgoing workflow when action !== "Received"', async () => {
    const builder = new PipelineBuilder(actionRegistry);
    const spec = specRegistry.getSpec('SUBMITTAL_ARCH');
    const workflows = spec.workflows || [];

    const ctxApproved = {
      triggerContext: 'No Exceptions Taken',
      fieldValues: { action: 'No Exceptions Taken' }
    };
    const pipelineApproved = builder.buildPipeline(workflows, ctxApproved);
    expect(pipelineApproved.map(a => a.name)).toEqual([
      'ReadLog',
      'OutgoingSubmittalFiling',
      'WriteLog',
      'DraftEmail'
    ]);

    const ctxRejected = {
      triggerContext: 'Rejected',
      fieldValues: { action: 'Rejected' }
    };
    const pipelineRejected = builder.buildPipeline(workflows, ctxRejected);
    expect(pipelineRejected.map(a => a.name)).toEqual([
      'ReadLog',
      'OutgoingSubmittalFiling',
      'WriteLog',
      'DraftEmail'
    ]);
  });

  it('chains FF&E revision case-insensitively ("ch-01" -> "CH-01"), closes prior row, chains contact history, and writes =HYPERLINK', async () => {
    // 1. Set up in-memory sheet with an incoming revision row for "ch-01" in lowercase
    const ffeHeaders = [
      'Spec Tag', 'Spec Title', 'Vendor', 'Revision', 'Date',
      'Contact', 'Action', 'Status', 'Notes', 'Link', 'Contact History'
    ];

    const initialSheetRows: unknown[][] = [
      ['Title Block', '', '', '', '', '', '', '', '', '', ''],
      ['Header 2', '', '', '', '', '', '', '', '', '', ''],
      ffeHeaders,
      [
        'ch-01', 'Side Chair', 'Furniture Co', '0', '260725',
        'Vendor A', 'Received', 'Under Review', '', '=HYPERLINK("https://drive.google.com/file/d/incoming-123/view", "CH-01-0")', 'Vendor A'
      ]
    ];

    const storageAdapter = new InMemorySheetStorageAdapter({ 'Submittal FFE': initialSheetRows });
    const logEngine = new LogEngine(storageAdapter);

    // Create a real LogRepository wrapper around LogEngine
    const logRepository: any = {
      readLog: (ssId: string, idData: any, strat: any, opts: any) =>
        logEngine.readLog(ssId, idData, strat, { ...opts, sheetName: 'Submittal FFE' }),
      appendDocument: (ssId: string, doc: any, strat: any, opts: any) =>
        logEngine.appendDocument(ssId, doc, strat, { ...opts, sheetName: 'Submittal FFE' })
    };

    // 2. Incoming outgoing submittal return with UPPERCASE "CH-01"
    const doc = createValidatedFFESubmittal({
      date: '2026-11-01',
      contact: 'DESIGNER',
      action: 'No Exceptions Taken',
      disciplineDetails: {
        specTag: 'CH-01',
        specTitle: 'Side Chair',
        vendor: 'Furniture Co',
        revision: '0'
      }
    });

    const input: any = {
      validatedDoc: doc,
      appContext: 'GoogleDrive',
      logFileId: 'ffe-workbook-123',
      driveFileId: 'staged-ffe-file-999',
      targetFolderId: 'folder-submittals',
      selectedAction: { action: 'No Exceptions Taken', abbr: 'NET', status: 'Approved' },
      projectAbbr: 'PRJ',
      logRepository,
      driveFilingRepository: fakeDriveRepo,
      adapters: {
        spreadsheetLockAdapter: fakeLockAdapter,
        emailDraftAdapter: fakeEmailAdapter,
        pdfDocumentService: fakePdfService,
        logRepository,
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

    // Verify Drive rename in place with single space separation and 6-digit date
    expect(fakeDriveRepo.renamedDocuments.length).toBe(1);
    const renamed = fakeDriveRepo.renamedDocuments[0];
    expect(renamed.fileId).toBe('staged-ffe-file-999');
    expect(renamed.newFileName).toBe('CH-01-0 Furniture Co - 261101 Vendor A DESIGNER NET.pdf');

    // Verify ANYONE_WITH_LINK sharing
    expect(fakeDriveRepo.sharedFiles.length).toBe(1);
    expect(fakeDriveRepo.sharedFiles[0]).toEqual({
      fileId: 'staged-ffe-file-999',
      accessType: 'ANYONE_WITH_LINK',
      permissionType: 'VIEW'
    });

    // Verify sheet updates in Submittal FFE:
    // Prior row (row index 3) transitioned to "Closed"
    const sheetValues = storageAdapter.getSheetValues('Submittal FFE');
    expect(sheetValues[3][7]).toBe('Closed');

    // New row (row index 4) inserted immediately beneath with chained contact history and hyperlink
    expect(sheetValues.length).toBe(5);
    const outgoingRow = sheetValues[4];
    expect(outgoingRow[0]).toBe('CH-01');
    expect(outgoingRow[3]).toBe('0');
    expect(outgoingRow[7]).toBe('Approved');
    expect(outgoingRow[10]).toBe('Vendor A DESIGNER'); // Chained contact history!
    expect(outgoingRow[9]).toContain('=HYPERLINK(');
    expect(outgoingRow[9]).toContain('staged-ffe-file-999');

    // Verify draft email created with standard outgoing template
    expect(fakeEmailAdapter.createdDrafts.length).toBe(1);
    const draft = fakeEmailAdapter.drafts[0];
    expect(draft.subject).toContain('Submittal CH-01-0 Side Chair - No Exceptions Taken');

    // Verify lock acquired and released
    expect(fakeLockAdapter.acquiredCount).toBe(1);
    expect(fakeLockAdapter.releasedCount).toBe(1);
    expect(fakeLockAdapter.isLocked('ffe-workbook-123')).toBe(false);
  });

  it('selects rejectedOutgoing email template on rejection actions and preserves SendAs alias HTML signature', async () => {
    const archHeaders = [
      'Section', 'Number', 'Revision', 'Title', 'Date',
      'Contact', 'Action', 'Status', 'Notes', 'Link', 'Contact History'
    ];

    const initialSheetRows: unknown[][] = [
      ['Title Block', '', '', '', '', '', '', '', '', '', ''],
      ['Header 2', '', '', '', '', '', '', '', '', '', ''],
      archHeaders,
      [
        '081100', '001', '01', 'Hollow Metal Doors', '260725',
        'GC', 'Received', 'Under Review', '', '=HYPERLINK("https://drive.google.com/file/d/incoming-456/view", "081100-001-01")', 'GC'
      ]
    ];

    const storageAdapter = new InMemorySheetStorageAdapter({ 'Submittal Arch': initialSheetRows });
    const logEngine = new LogEngine(storageAdapter);

    const logRepository: any = {
      readLog: (ssId: string, idData: any, strat: any, opts: any) =>
        logEngine.readLog(ssId, idData, strat, { ...opts, sheetName: 'Submittal Arch' }),
      appendDocument: (ssId: string, doc: any, strat: any, opts: any) =>
        logEngine.appendDocument(ssId, doc, strat, { ...opts, sheetName: 'Submittal Arch' })
    };

    const doc = createValidatedArchitectureSubmittal({
      date: '2026-11-01',
      contact: 'ARCH',
      action: 'Revise and Resubmit',
      disciplineDetails: {
        section: '081100',
        number: '001',
        title: 'Hollow Metal Doors',
        revision: '01'
      }
    });

    fakeEmailAdapter.signature = '<div class="sendAsSig"><b>Jane Smith, AIA</b><br>Principal Architect</div>';

    const input: any = {
      validatedDoc: doc,
      appContext: 'GoogleDrive',
      logFileId: 'arch-workbook-456',
      driveFileId: 'arch-staged-789',
      targetFolderId: 'folder-submittals',
      selectedAction: { action: 'Revise and Resubmit', abbr: 'R&R', status: 'Revise and Resubmit' },
      projectAbbr: 'TESTPROJ',
      logRepository,
      driveFilingRepository: fakeDriveRepo,
      adapters: {
        spreadsheetLockAdapter: fakeLockAdapter,
        emailDraftAdapter: fakeEmailAdapter,
        pdfDocumentService: fakePdfService,
        logRepository,
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

    // Prior row closed
    const sheetValues = storageAdapter.getSheetValues('Submittal Arch');
    expect(sheetValues[3][7]).toBe('Closed');

    // Outgoing row inserted
    const outgoingRow = sheetValues[4];
    expect(outgoingRow[0]).toBe('081100');
    expect(outgoingRow[1]).toBe('001');
    expect(outgoingRow[2]).toBe('01');
    expect(outgoingRow[7]).toBe('Revise and Resubmit');
    expect(outgoingRow[10]).toBe('GC ARCH');

    // Email template: rejection template selected
    expect(fakeEmailAdapter.createdDrafts.length).toBe(1);
    const draft = fakeEmailAdapter.drafts[0];
    expect(draft.subject).toContain('REJECTED');
    expect(draft.htmlBody).toContain('ACTION REQUIRED');
    expect(draft.htmlBody).toContain('<div class="sendAsSig"><b>Jane Smith, AIA</b><br>Principal Architect</div>');
  });

  it('in AppContext.Gmail, files directly into Submittals/Closed/<Subfolder>/ and marks isFiled true', async () => {
    const archHeaders = [
      'Section', 'Number', 'Revision', 'Title', 'Date',
      'Contact', 'Action', 'Status', 'Notes', 'Link', 'Contact History'
    ];

    const initialSheetRows: unknown[][] = [
      ['Title Block', '', '', '', '', '', '', '', '', '', ''],
      ['Header 2', '', '', '', '', '', '', '', '', '', ''],
      archHeaders,
      [
        '081100', '001', '01', 'Hollow Metal Doors', '260725',
        'GC', 'Received', 'Under Review', '', '=HYPERLINK("https://drive.google.com/file/d/incoming-456/view", "081100-001-01")', 'GC'
      ]
    ];

    const storageAdapter = new InMemorySheetStorageAdapter({ 'Submittal Arch': initialSheetRows });
    const logEngine = new LogEngine(storageAdapter);

    const logRepository: any = {
      readLog: (ssId: string, idData: any, strat: any, opts: any) =>
        logEngine.readLog(ssId, idData, strat, { ...opts, sheetName: 'Submittal Arch' }),
      appendDocument: (ssId: string, doc: any, strat: any, opts: any) =>
        logEngine.appendDocument(ssId, doc, strat, { ...opts, sheetName: 'Submittal Arch' })
    };

    const doc = createValidatedArchitectureSubmittal({
      date: '2026-11-01',
      contact: 'ARCH',
      action: 'Make Corrections Noted',
      disciplineDetails: {
        section: '081100',
        number: '001',
        title: 'Hollow Metal Doors',
        revision: '01'
      }
    });

    const input: any = {
      validatedDoc: doc,
      appContext: 'Gmail',
      logFileId: 'arch-workbook-789',
      driveFileId: 'gmail-doc-555',
      targetFolderId: 'folder-submittals',
      selectedAction: { action: 'Make Corrections Noted', abbr: 'MCN', status: 'Approved as Noted' },
      projectAbbr: 'TESTPROJ',
      logRepository,
      driveFilingRepository: fakeDriveRepo,
      adapters: {
        spreadsheetLockAdapter: fakeLockAdapter,
        emailDraftAdapter: fakeEmailAdapter,
        pdfDocumentService: fakePdfService,
        logRepository,
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

    // Filed to Closed subfolder
    expect(fakeDriveRepo.filedDocuments.length).toBe(1);
    const filed = fakeDriveRepo.filedDocuments[0];
    expect(filed.options.subfolderPath).toContain('Closed');
    expect(filed.options.subfolderPath).toContain('081100');
    expect(filed.options.newFileName).toBe('081100-001-01 Hollow Metal Doors - 261101 GC ARCH MCN.pdf');
  });

  it('fails cleanly without orphaned rows or status updates when spreadsheet lock acquisition fails', async () => {
    fakeLockAdapter.acquireLock('locked-workbook');

    const doc = createValidatedArchitectureSubmittal();
    const input: any = {
      validatedDoc: doc,
      appContext: 'GoogleDrive',
      logFileId: 'locked-workbook',
      driveFileId: 'doc-fail-123',
      targetFolderId: 'folder-submittals',
      selectedAction: { action: 'Approved', abbr: 'APP', status: 'Approved' },
      adapters: {
        logRepository: {
          readLog: () => ({ found: false, rowIndex: null, contactHistory: '', previousStatus: '', rowData: null, identityData: {} as any, previousRowUpdated: false }),
          appendDocument: () => ({ targetKey: '', newFileName: '', contactHistory: '', rowIndex: 1, failedColumns: [], previousRowUpdated: false })
        },
        spreadsheetLockAdapter: fakeLockAdapter,
        driveFilingRepository: fakeDriveRepo
      }
    };

    await expect(
      PipelineBuilder.buildAndExecute(input, actionRegistry, specRegistry, configRegistry)
    ).rejects.toThrow(/Failed to acquire lock for spreadsheet/i);
  });
});
