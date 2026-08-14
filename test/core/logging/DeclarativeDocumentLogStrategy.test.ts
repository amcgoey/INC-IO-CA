import { describe, it, expect, beforeEach } from 'vitest';
import { DeclarativeDocumentLogStrategy } from '../../../src/core/logging/DeclarativeDocumentLogStrategy';
import { defaultDocumentTypeSpecRegistry } from '../../../src/core/specs/DocumentTypeSpecRegistry';
import type { DocumentTypeSpec } from '../../../src/core/specs/DocumentTypeSpec';
import { DocumentFactory } from '../../harness';

describe('DeclarativeDocumentLogStrategy', () => {
  beforeEach(() => {
    (globalThis as any).CONFIG = {
      LOG_HEADER_ROW: 3,
      LOG_SHEET_NAME: 'Submittals Log',
      CLOSED_FOLDER_NAME: 'Closed'
    };
    (globalThis as any).CSI_DIVISIONS = {
      '03': '03-Concrete',
      '08': '08-Openings'
    };
  });

  describe('SUBMITTAL_ARCH Spec', () => {
    const archSpec = defaultDocumentTypeSpecRegistry.getSpec('SUBMITTAL_ARCH');
    const strategy = new DeclarativeDocumentLogStrategy(archSpec);

    it('exposes logSheetName', () => {
      expect(strategy.logSheetName).toBe('Submittal Arch');
    });

    it('extracts group key, target key, and sort key for standard CSI submittal', () => {
      const doc = DocumentFactory.createValidatedArchitectureSubmittal({
        date: '2026-07-25',
        contact: 'GC',
        action: 'Submitted',
        notes: 'Initial submittal',
        disciplineDetails: {
          section: '033000',
          number: '001',
          title: 'Cast-in-Place Concrete',
          revision: '001'
        }
      });

      expect(strategy.getGroupKey(doc)).toBe('033000-001');
      expect(strategy.getTargetKey(doc)).toBe('033000-001-001');
      expect(strategy.getSortKey(doc)).toBe('033000-001-001-20260725');
    });

    it('handles empty CSI section without leading hyphens', () => {
      const doc = DocumentFactory.createValidatedArchitectureSubmittal({
        date: '2026-07-25',
        contact: 'GC',
        action: 'Submitted',
        notes: 'Non-CSI submittal',
        disciplineDetails: {
          section: '',
          number: '001',
          title: 'General Submittal',
          revision: '0'
        }
      });

      expect(strategy.getGroupKey(doc)).toBe('001');
      expect(strategy.getTargetKey(doc)).toBe('001-0');
      expect(strategy.getSortKey(doc)).toBe('001-000-20260725');
    });

    it('produces complete IdentityData object', () => {
      const doc = DocumentFactory.createValidatedArchitectureSubmittal({
        date: '2026-07-25',
        contact: 'GC',
        action: 'Submitted',
        disciplineDetails: {
          section: '081100',
          number: '002',
          title: 'Metal Doors',
          revision: '0'
        }
      });

      const identityData = strategy.getIdentityData(doc);
      expect(identityData).toEqual({
        identityGroup: '081100-002',
        identityRevisionGroup: '081100-002-000-20260725',
        identity: '081100-002-0'
      });
    });

    it('formats destination filename correctly', () => {
      const doc = DocumentFactory.createValidatedArchitectureSubmittal({
        date: '2026-07-25',
        contact: 'GC',
        disciplineDetails: {
          section: '033000',
          number: '001',
          title: 'Cast-in-Place Concrete',
          revision: '001'
        }
      });

      const fileName = strategy.getFileName(doc, 'GC', ' Rev');
      expect(fileName).toBe('033000-001-001 Cast-in-Place Concrete - 2026-07-25 GC Rev');
    });

    it('formats row payload matching table headers and system columns', () => {
      const doc = DocumentFactory.createValidatedArchitectureSubmittal({
        date: '2026-07-25',
        contact: 'GC',
        action: 'Submitted',
        notes: 'Initial submittal',
        disciplineDetails: {
          section: '033000',
          number: '001',
          title: 'Cast-in-Place Concrete',
          revision: '001'
        }
      });

      const payload = strategy.formatRowPayload(doc, {
        link: 'http://example.com/file.pdf',
        contactHistory: 'GC',
        status: 'Open'
      });

      expect(payload['Section']).toBe('033000');
      expect(payload['Number']).toBe('001');
      expect(payload['Title']).toBe('Cast-in-Place Concrete');
      expect(payload['Revision']).toBe('001');
      expect(payload['Date']).toBe('2026-07-25');
      expect(payload['Contact']).toBe('GC');
      expect(payload['Action']).toBe('Submitted');
      expect(payload['Status']).toBe('Open');
      expect(payload['Notes']).toBe('Initial submittal');
      expect(payload['Link']).toBe('http://example.com/file.pdf');
      expect(payload['Contact History']).toBe('GC');
    });

    it('resolves Drive subfolders based on CSI divisions and fallback rules', () => {
      const docConcrete = DocumentFactory.createValidatedArchitectureSubmittal({
        date: '2026-07-25',
        disciplineDetails: { section: '033000', number: '001', title: 'Concrete', revision: '0' }
      });
      expect(strategy.getFilingSubfolders(docConcrete)).toEqual(['Closed', '03-Concrete']);

      const docUnknown = DocumentFactory.createValidatedArchitectureSubmittal({
        date: '2026-07-25',
        disciplineDetails: { section: '990000', number: '001', title: 'Unknown', revision: '0' }
      });
      expect(strategy.getFilingSubfolders(docUnknown)).toEqual(['Closed']);

      const docBlank = DocumentFactory.createValidatedArchitectureSubmittal({
        date: '2026-07-25',
        disciplineDetails: { section: '', number: '001', title: 'Blank', revision: '0' }
      });
      expect(strategy.getFilingSubfolders(docBlank)).toEqual(['Closed']);
    });

    it('extracts keys from row arrays and headers', () => {
      const headers = ['Section', 'Number', 'Revision', 'Date'];
      const row = ['033000', '001', '001', '2026-07-25'];

      expect(strategy.getGroupKeyFromRow(row, headers)).toBe('033000-001');
      expect(strategy.getTargetKeyFromRow(row, headers)).toBe('033000-001-001');
      expect(strategy.getSortKeyFromRow(row, headers)).toBe('033000-001-001-20260725');
    });
  });

  describe('SUBMITTAL_FFE Spec', () => {
    const ffeSpec = defaultDocumentTypeSpecRegistry.getSpec('SUBMITTAL_FFE');
    const strategy = new DeclarativeDocumentLogStrategy(ffeSpec);

    it('exposes logSheetName', () => {
      expect(strategy.logSheetName).toBe('Submittal FFE');
    });

    it('extracts group key, target key, and sort key for FF&E submittal', () => {
      const doc = DocumentFactory.createValidatedFFESubmittal({
        date: '2026-07-25',
        contact: 'Vendor A',
        action: 'Received',
        notes: 'Sample chair',
        disciplineDetails: {
          specTag: 'CH-01',
          specTitle: 'Side Chair',
          vendor: 'Furniture Co',
          revision: '001',
          relatedTag: 'CH-01A'
        }
      });

      expect(strategy.getGroupKey(doc)).toBe('ch-01');
      expect(strategy.getTargetKey(doc)).toBe('CH-01-001');
      expect(strategy.getSortKey(doc)).toBe('ch-01-001-20260725');
    });

    it('formats destination filename with vendor descriptor', () => {
      const doc = DocumentFactory.createValidatedFFESubmittal({
        date: '2026-07-25',
        contact: 'Vendor A',
        disciplineDetails: {
          specTag: 'CH-01',
          specTitle: 'Side Chair',
          vendor: 'Furniture Co',
          revision: '001'
        }
      });

      const fileName = strategy.getFileName(doc, 'Vendor A', ' Rec');
      expect(fileName).toBe('CH-01-001 Furniture Co - 2026-07-25 Vendor A Rec');
    });

    it('formats FF&E row payload', () => {
      const doc = DocumentFactory.createValidatedFFESubmittal({
        date: '2026-07-25',
        contact: 'Vendor A',
        action: 'Received',
        notes: 'Chair',
        disciplineDetails: {
          specTag: 'CH-01',
          specTitle: 'Side Chair',
          vendor: 'Furniture Co',
          revision: '001',
          relatedTag: 'CH-01A'
        }
      });

      const payload = strategy.formatRowPayload(doc, {
        link: 'http://example.com/ffe.pdf',
        contactHistory: 'Vendor A',
        status: 'Under Review'
      });

      expect(payload['Spec Tag']).toBe('CH-01');
      expect(payload['Related Tag']).toBe('CH-01A');
      expect(payload['Spec Title']).toBe('Side Chair');
      expect(payload['Vendor']).toBe('Furniture Co');
      expect(payload['Revision']).toBe('001');
      expect(payload['Date']).toBe('2026-07-25');
      expect(payload['Status']).toBe('Under Review');
    });

    it('resolves Drive subfolders based on spec tag 2-char prefix', () => {
      const docWithTag = DocumentFactory.createValidatedFFESubmittal({
        date: '2026-07-25',
        disciplineDetails: { specTag: 'CH-01', specTitle: 'Chair', vendor: 'Co', revision: '0' }
      });
      expect(strategy.getFilingSubfolders(docWithTag)).toEqual(['Closed', 'CH']);

      const docFallback = DocumentFactory.createValidatedFFESubmittal({
        date: '2026-07-25',
        disciplineDetails: { specTag: '', specTitle: 'Chair', vendor: 'Co', revision: '0' }
      });
      expect(strategy.getFilingSubfolders(docFallback)).toEqual(['Closed']);
    });
  });

  describe('Arbitrary Custom DocumentTypeSpec', () => {
    const customSpec: DocumentTypeSpec = {
      key: 'RFI',
      label: 'RFI Log',
      name: 'Request for Information',
      identity: {
        format: '${rfiNumber}-${revision}-${date}',
        groupFormat: '${rfiNumber}',
        revisionGroupFormat: '${rfiNumber}-${revision}'
      },
      fields: [
        { key: 'rfiNumber', label: 'RFI #', type: 'string', required: true, header: 'RFI #' },
        { key: 'subject', label: 'Subject', type: 'string', required: true, header: 'Subject' },
        { key: 'revision', label: 'Revision', type: 'string', defaultValue: '0', header: 'Revision' },
        { key: 'date', label: 'Date', type: 'date', header: 'Date' }
      ],
      storage: [
        {
          type: 'drive',
          rootFolderSearchTerms: ['RFIs'],
          closedRootFolderName: 'Closed RFIs'
        }
      ],
      workflows: []
    };

    const strategy = new DeclarativeDocumentLogStrategy(customSpec);

    it('evaluates custom identity formats and row payloads dynamically', () => {
      const doc = {
        date: '2026-08-01',
        contact: 'Subcontractor',
        action: 'Submitted',
        rfiNumber: '042',
        subject: 'Beam Penetrations',
        revision: '1'
      } as any;

      expect(strategy.getGroupKey(doc)).toBe('042');
      expect(strategy.getTargetKey(doc)).toBe('042-1');
      expect(strategy.getSortKey(doc)).toBe('042-001-20260801');
      expect(strategy.getFilingSubfolders(doc)).toEqual(['Closed RFIs']);

      const payload = strategy.formatRowPayload(doc, {
        link: 'http://link',
        contactHistory: 'Sub',
        status: 'Open'
      });

      expect(payload['RFI #']).toBe('042');
      expect(payload['Subject']).toBe('Beam Penetrations');
      expect(payload['Revision']).toBe('1');
      expect(payload['Status']).toBe('Open');
    });
  });
});
