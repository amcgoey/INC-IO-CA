import { describe, it, expect, beforeEach } from 'vitest';
import { OutgoingSubmittalFilingAction } from '../../../src/core/workflow/OutgoingSubmittalFilingAction';
import { FakeDriveFilingRepository } from '../../../src/adapters/fakes/FakeDriveFilingRepository';
import { DeclarativeDocumentLogStrategy } from '../../../src/DocumentLogStrategy';
import { defaultDocumentTypeSpecRegistry } from '../../../src/core/specs/DocumentTypeSpecRegistry';
import { createValidatedArchitectureSubmittal, createValidatedFFESubmittal } from '../../harness/factories/DocumentFactory';

describe('OutgoingSubmittalFilingAction', () => {
  let action: OutgoingSubmittalFilingAction;
  let fakeDriveRepo: FakeDriveFilingRepository;
  let archStrategy: DeclarativeDocumentLogStrategy;
  let ffeStrategy: DeclarativeDocumentLogStrategy;

  beforeEach(() => {
    action = new OutgoingSubmittalFilingAction();
    fakeDriveRepo = new FakeDriveFilingRepository();
    archStrategy = new DeclarativeDocumentLogStrategy(defaultDocumentTypeSpecRegistry.getSpec('SUBMITTAL_ARCH'));
    ffeStrategy = new DeclarativeDocumentLogStrategy(defaultDocumentTypeSpecRegistry.getSpec('SUBMITTAL_FFE'));
  });

  it('fails fast if driveFilingRepository adapter is missing', async () => {
    const doc = createValidatedArchitectureSubmittal();
    const context: any = { validatedDoc: doc, adapters: {} };
    await expect(action.execute(context)).rejects.toThrow(/driveFilingRepository adapter is required/i);
  });

  it('fails fast if validatedDoc / document is missing', async () => {
    const context: any = {
      adapters: { driveFilingRepository: fakeDriveRepo }
    };
    await expect(action.execute(context)).rejects.toThrow(/validatedDoc or document is required/i);
  });

  it('AppContext.GoogleDrive: renames staged ReviewDocument in place, strips leading underscore, sets ANYONE_WITH_LINK, and populates deferred filing metadata', async () => {
    const doc = createValidatedArchitectureSubmittal({
      date: '2026-11-01',
      contact: 'ARCH',
      action: 'No Exceptions Taken',
      disciplineDetails: {
        section: '081100',
        number: '001',
        title: 'Hollow Metal Doors',
        revision: '01'
      }
    });

    const context: any = {
      validatedDoc: doc,
      appContext: 'GoogleDrive',
      fileId: 'staged-file-123',
      driveFileId: 'staged-file-123',
      contactHistory: 'GC',
      selectedAction: { action: 'No Exceptions Taken', abbr: 'NET', status: 'Approved' },
      strategy: archStrategy,
      targetFolderId: 'folder-submittals-root',
      adapters: {
        driveFilingRepository: fakeDriveRepo
      }
    };

    const result = await action.execute(context);

    // 1. In GoogleDrive, rename staged file in place (no move to Closed)
    expect(fakeDriveRepo.renamedDocuments.length).toBe(1);
    const renamed = fakeDriveRepo.renamedDocuments[0];
    expect(renamed.fileId).toBe('staged-file-123');
    expect(renamed.newFileName).toBe('081100-001-01 Hollow Metal Doors - 261101 GC ARCH NET.pdf');
    expect(renamed.newFileName.startsWith('_')).toBe(false);

    // 2. Verified sharing ANYONE_WITH_LINK view permission
    expect(fakeDriveRepo.sharedFiles.length).toBe(1);
    expect(fakeDriveRepo.sharedFiles[0]).toEqual({
      fileId: 'staged-file-123',
      accessType: 'ANYONE_WITH_LINK',
      permissionType: 'VIEW'
    });

    // 3. Populate deferred filing metadata for Success Card's "File the Submittal"
    expect(result.isFiled).toBe(false);
    expect(result.number).toBe('001');
    expect(result.title).toBe('Hollow Metal Doors');
    expect(result.rev).toBe('01');
    expect(result.docType).toBe('SUBMITTAL_ARCH');
    expect(result.deferredFiling).toEqual({
      number: '001',
      title: 'Hollow Metal Doors',
      rev: '01',
      docType: 'SUBMITTAL_ARCH'
    });

    // 4. Returns updated context
    expect(result.newFileName).toBe('081100-001-01 Hollow Metal Doors - 261101 GC ARCH NET.pdf');
    expect(result.contactHistory).toBe('GC ARCH');
  });

  it('AppContext.Gmail: moves and renames reviewed file directly into Submittals/Closed/<Subfolder>/ and sets ANYONE_WITH_LINK', async () => {
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

    const context: any = {
      validatedDoc: doc,
      appContext: 'Gmail',
      fileId: 'gmail-file-456',
      contactHistory: 'GC',
      selectedAction: { action: 'Make Corrections Noted', abbr: 'MCN', status: 'Approved as Noted' },
      strategy: archStrategy,
      targetFolderId: 'folder-submittals-root',
      adapters: {
        driveFilingRepository: fakeDriveRepo
      }
    };

    const result = await action.execute(context);

    // 1. In Gmail, fileDocument directly moves to Closed/<Subfolder>/
    expect(fakeDriveRepo.filedDocuments.length).toBe(1);
    const filed = fakeDriveRepo.filedDocuments[0];
    expect(filed.file.fileId).toBe('gmail-file-456');
    expect(filed.options.subfolderPath).toContain('Closed');
    expect(filed.options.subfolderPath).toContain('081100');
    expect(filed.options.newFileName).toBe('081100-001-01 Hollow Metal Doors - 261101 GC ARCH MCN.pdf');

    // 2. ANYONE_WITH_LINK permissions set
    expect(fakeDriveRepo.sharedFiles.length).toBe(1);
    expect(fakeDriveRepo.sharedFiles[0]).toEqual({
      fileId: 'gmail-file-456',
      accessType: 'ANYONE_WITH_LINK',
      permissionType: 'VIEW'
    });

    // 3. isFiled marked true since already filed in Closed
    expect(result.isFiled).toBe(true);
    expect(result.newFileName).toBe('081100-001-01 Hollow Metal Doors - 261101 GC ARCH MCN.pdf');
    expect(result.contactHistory).toBe('GC ARCH');
  });

  it('handles FF&E submittal outgoing filing with uppercase spec tag and vendor subfolder', async () => {
    const doc = createValidatedFFESubmittal({
      date: '2026-11-01',
      contact: 'DESIGNER',
      action: 'Rejected',
      disciplineDetails: {
        specTag: 'ch-01',
        specTitle: 'Side Chair',
        vendor: 'Furniture Co',
        revision: '0'
      }
    });

    const context: any = {
      validatedDoc: doc,
      appContext: 'Gmail',
      fileId: 'ffe-file-789',
      contactHistory: 'Vendor A',
      selectedAction: { action: 'Rejected', abbr: 'REJ', status: 'Rejected' },
      strategy: ffeStrategy,
      targetFolderId: 'folder-submittals-root',
      adapters: {
        driveFilingRepository: fakeDriveRepo
      }
    };

    const result = await action.execute(context);

    expect(fakeDriveRepo.filedDocuments.length).toBe(1);
    const filed = fakeDriveRepo.filedDocuments[0];
    expect(filed.options.newFileName).toBe('CH-01-0 Furniture Co - 261101 Vendor A DESIGNER REJ.pdf');
    expect(filed.options.subfolderPath).toContain('Closed');
    expect(result.isFiled).toBe(true);
    expect(result.contactHistory).toBe('Vendor A DESIGNER');
  });
});
