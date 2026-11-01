import { describe, it, expect, beforeEach } from 'vitest';
import { DualDocumentSubmittalFilingAction } from '../../../src/core/workflow/DualDocumentSubmittalFilingAction';
import { FakeDriveFilingRepository } from '../../../src/adapters/fakes/FakeDriveFilingRepository';
import { FakePdfDocumentService } from '../../../src/adapters/fakes/FakePdfDocumentService';
import { DeclarativeDocumentLogStrategy } from '../../../src/DocumentLogStrategy';
import { defaultDocumentTypeSpecRegistry } from '../../../src/core/specs/DocumentTypeSpecRegistry';
import { createValidatedArchitectureSubmittal } from '../../harness/factories/DocumentFactory';
import { AttachmentDescriptor } from '../../../src/core/interfaces/PdfDocumentService';

describe('DualDocumentSubmittalFilingAction', () => {
  let action: DualDocumentSubmittalFilingAction;
  let fakeDriveRepo: FakeDriveFilingRepository;
  let fakePdfService: FakePdfDocumentService;
  let strategy: DeclarativeDocumentLogStrategy;

  beforeEach(() => {
    action = new DualDocumentSubmittalFilingAction();
    fakeDriveRepo = new FakeDriveFilingRepository();
    fakePdfService = new FakePdfDocumentService();
    strategy = new DeclarativeDocumentLogStrategy(defaultDocumentTypeSpecRegistry.getSpec('SUBMITTAL_ARCH'));
  });

  it('fails fast if driveFilingRepository adapter is missing', async () => {
    const doc = createValidatedArchitectureSubmittal();
    const context: any = {
      validatedDoc: doc,
      adapters: { pdfDocumentService: fakePdfService }
    };

    await expect(action.execute(context)).rejects.toThrow(/driveFilingRepository adapter is required/i);
  });

  it('fails fast if pdfDocumentService adapter is missing', async () => {
    const doc = createValidatedArchitectureSubmittal();
    const context: any = {
      validatedDoc: doc,
      adapters: { driveFilingRepository: fakeDriveRepo }
    };

    await expect(action.execute(context)).rejects.toThrow(/pdfDocumentService adapter is required/i);
  });

  it('fails fast if validatedDoc / document is missing', async () => {
    const context: any = {
      adapters: {
        driveFilingRepository: fakeDriveRepo,
        pdfDocumentService: fakePdfService
      }
    };

    await expect(action.execute(context)).rejects.toThrow(/validatedDoc or document is required/i);
  });

  it('merges multiple PDF attachments in natural alphanumeric order and archives them to Closed/<Subfolder>/', async () => {
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
      bytes: [1, 2, 3]
    };
    const pdf2: AttachmentDescriptor = {
      fileName: '01_Transmittal.pdf',
      mimeType: 'application/pdf',
      bytes: [4, 5, 6]
    };
    const nonPdf: AttachmentDescriptor = {
      fileName: 'Model.dwg',
      mimeType: 'application/acad',
      bytes: [7, 8, 9]
    };

    const context: any = {
      validatedDoc: doc,
      strategy,
      targetFolderId: 'submittals-folder-123',
      incomingRouting: 'To Review',
      attachments: [pdf1, nonPdf, pdf2],
      adapters: {
        driveFilingRepository: fakeDriveRepo,
        pdfDocumentService: fakePdfService
      }
    };

    const resultContext = await action.execute(context);

    // 1. Verify alphanumeric sort passed to mergeBlobsToPdf
    expect(fakePdfService.mergeBlobsCalls.length).toBe(1);
    const mergeCall = fakePdfService.mergeBlobsCalls[0];
    expect(mergeCall.blobs.length).toBe(2);
    // 01_Transmittal.pdf should come before 02_Drawing.pdf
    expect((mergeCall.blobs[0] as any).fileName || (mergeCall.blobs[0] as any).getName?.()).toBe('01_Transmittal.pdf');
    expect((mergeCall.blobs[1] as any).fileName || (mergeCall.blobs[1] as any).getName?.()).toBe('02_Drawing.pdf');

    // 2. Verify files archived to Closed/<Subfolder>/
    // Expect 3 filings:
    // a) Composite original to Closed/081100/
    // b) Model.dwg to Closed/081100/
    // c) Staged ReviewDocument _<BaseFileName>.pdf to Submittals/ (subfolderPath: [])
    expect(fakeDriveRepo.filedDocuments.length).toBe(3);

    const closedFilings = fakeDriveRepo.filedDocuments.filter(f =>
      f.options.subfolderPath && f.options.subfolderPath.includes('Closed')
    );
    expect(closedFilings.length).toBe(2);

    const nonPdfFiling = closedFilings.find(f => f.options.newFileName === 'Model.dwg');
    expect(nonPdfFiling).toBeDefined();
    expect(nonPdfFiling?.options.subfolderPath).toEqual(['Closed', '081100']);

    // 3. Verify Notes updated with non-PDF archived filenames
    expect(resultContext.validatedDoc?.notes).toContain('[Also archived in Closed: Model.dwg]');
    expect(resultContext.notes).toContain('[Also archived in Closed: Model.dwg]');

    // 4. Verify staged ReviewDocument has leading underscore and is staged in Submittals/ root
    const stagedFiling = fakeDriveRepo.filedDocuments.find(f =>
      !f.options.subfolderPath || f.options.subfolderPath.length === 0
    );
    expect(stagedFiling).toBeDefined();
    expect(stagedFiling?.options.newFileName?.startsWith('_')).toBe(true);

    // 5. Verify staged driveFileUrl stored on context
    expect(resultContext.driveFileUrl).toBe(stagedFiling?.result.url);
    expect(resultContext.fileId).toBe(stagedFiling?.result.fileId);
  });

  it('selects transmittal template when incomingRouting === "To Refer"', async () => {
    const doc = createValidatedArchitectureSubmittal();
    const pdf: AttachmentDescriptor = {
      fileName: 'Submittal.pdf',
      mimeType: 'application/pdf',
      bytes: [1, 2, 3]
    };

    const context: any = {
      validatedDoc: doc,
      strategy,
      targetFolderId: 'submittals-folder-123',
      incomingRouting: 'To Refer',
      policy: {
        coverPageTemplateId: 'default-cover-tmpl',
        transmittalTemplateId: 'referral-transmittal-tmpl'
      },
      attachments: [pdf],
      adapters: {
        driveFilingRepository: fakeDriveRepo,
        pdfDocumentService: fakePdfService
      }
    };

    await action.execute(context);

    expect(fakePdfService.stampCalls.length).toBe(1);
    expect(fakePdfService.stampCalls[0].options.templateId).toBe('referral-transmittal-tmpl');
  });

  it('selects standard cover template when incomingRouting !== "To Refer"', async () => {
    const doc = createValidatedArchitectureSubmittal();
    const pdf: AttachmentDescriptor = {
      fileName: 'Submittal.pdf',
      mimeType: 'application/pdf',
      bytes: [1, 2, 3]
    };

    const context: any = {
      validatedDoc: doc,
      strategy,
      targetFolderId: 'submittals-folder-123',
      incomingRouting: 'To Review',
      policy: {
        coverPageTemplateId: 'standard-cover-tmpl',
        transmittalTemplateId: 'referral-transmittal-tmpl'
      },
      attachments: [pdf],
      adapters: {
        driveFilingRepository: fakeDriveRepo,
        pdfDocumentService: fakePdfService
      }
    };

    await action.execute(context);

    expect(fakePdfService.stampCalls.length).toBe(1);
    expect(fakePdfService.stampCalls[0].options.templateId).toBe('standard-cover-tmpl');
  });

  it('aborts cleanly and throws if PDF stamping fails (corrupt or password protected)', async () => {
    const doc = createValidatedArchitectureSubmittal();
    const pdf: AttachmentDescriptor = {
      fileName: 'Corrupt.pdf',
      mimeType: 'application/pdf',
      bytes: [0]
    };

    fakePdfService.stampSubmittal = async () => {
      throw new Error('PDF is password protected or corrupt');
    };

    const context: any = {
      validatedDoc: doc,
      strategy,
      targetFolderId: 'submittals-folder-123',
      incomingRouting: 'To Review',
      attachments: [pdf],
      adapters: {
        driveFilingRepository: fakeDriveRepo,
        pdfDocumentService: fakePdfService
      }
    };

    await expect(action.execute(context)).rejects.toThrow(/PDF is password protected or corrupt/);
  });

  it('uses pure in-memory fallback blob when no attachments or fileId are present, with zero ambient GAS calls', async () => {
    const doc = createValidatedArchitectureSubmittal({
      disciplineDetails: {
        section: '081100',
        number: '001',
        title: 'Hollow Metal Doors',
        revision: '01'
      }
    });

    const context: any = {
      validatedDoc: doc,
      strategy,
      targetFolderId: 'submittals-folder-123',
      incomingRouting: 'To Review',
      adapters: {
        driveFilingRepository: fakeDriveRepo,
        pdfDocumentService: fakePdfService
      }
    };

    const origUtilities = (globalThis as any).Utilities;
    delete (globalThis as any).Utilities;

    try {
      const result = await action.execute(context);
      expect(result).toBeDefined();
      expect(result.stagedReviewFile).toBeDefined();
      expect(fakeDriveRepo.filedDocuments.length).toBe(2);
      const stagedDoc = fakeDriveRepo.filedDocuments.find(d => d.options?.newFileName?.startsWith('_'));
      expect(stagedDoc).toBeDefined();
    } finally {
      if (origUtilities) {
        (globalThis as any).Utilities = origUtilities;
      }
    }
  });
});
