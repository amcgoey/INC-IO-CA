import { describe, it, expect, vi } from 'vitest';
import { DynamicDocumentLogStrategy } from '../../../src/core/strategy/DynamicDocumentLogStrategy';
import type { DocumentTypeSpec } from '../../../src/core/specs/DocumentTypeSpec';
import { TemplateFormatCompiler } from '../../../src/core/specs/TemplateFormatCompiler';

describe('DynamicDocumentLogStrategy', () => {
  const mockSpec = {
    key: 'TEST',
    label: 'Test Doc',
    name: 'Test Document',
    identity: {
      format: '${section}-${number}-${revision}-TARGET',
      groupFormat: '${section}-${number}',
      revisionGroupFormat: '${section}-${number}-${revision}',
    },
    fields: [
      { key: 'section', label: 'Section', type: 'string', header: 'Section' },
      { key: 'number', label: 'Number', type: 'string', header: 'Number' },
      { key: 'revision', label: 'Revision', type: 'string', header: 'Revision' },
      { key: 'calculatedField', label: 'Calc', type: 'string', header: 'Calc', isCalculated: true, calcFormat: '${section}-CALC' },
      { key: 'defaultField', label: 'Def', type: 'string', header: 'Def', defaultValue: '${section}-DEF' },
    ],
    storage: [{
      type: 'drive',
      closedRootFolderName: 'Closed',
      closedSubfolderFormat: 'Closed/${section}'
    }],
    workflows: []
  } as unknown as DocumentTypeSpec;

  const mockCompiler = {
    evaluate: vi.fn((format: string, _record: Record<string, any>) => {
      if (format === mockSpec.identity.groupFormat) return '123-001';
      if (format === mockSpec.identity.revisionGroupFormat) return '123-001-0';
      if (format === mockSpec.identity.format) return '123-001-0-TARGET';
      if (format === 'Closed/${section}') return 'Closed/123';
      if (format === '${section}-CALC') return '123-CALC';
      if (format === '${section}-DEF') return '123-DEF';
      return '';
    })
  } as unknown as typeof TemplateFormatCompiler;

  const mockDoc = {
    date: '2026-08-15',
    contact: 'JDO',
    action: 'Review',
    disciplineDetails: {
      section: '123',
      number: '001',
      revision: '0'
    }
  } as any;

  describe('getIdentityData', () => {
    it('should extract identity data using compiler', () => {
      const strategy = new DynamicDocumentLogStrategy(mockSpec, mockCompiler);
      const identity = strategy.getIdentityData(mockDoc);

      expect(mockCompiler.evaluate).toHaveBeenCalledWith(
        mockSpec.identity.groupFormat,
        expect.objectContaining({ section: '123', number: '001', revision: '0' })
      );
      expect(mockCompiler.evaluate).toHaveBeenCalledWith(
        mockSpec.identity.revisionGroupFormat,
        expect.objectContaining({ section: '123' })
      );
      expect(mockCompiler.evaluate).toHaveBeenCalledWith(
        mockSpec.identity.format,
        expect.objectContaining({ section: '123' })
      );

      expect(identity).toEqual({
        identityGroup: '123-001',
        identityRevisionGroup: '123-001-0',
        identity: '123-001-0-TARGET'
      });
    });
  });

  describe('formatRowPayload', () => {
    it('should format payload using spec fields including calculated and default values via compiler', () => {
      const strategy = new DynamicDocumentLogStrategy(mockSpec, mockCompiler);
      const payload = strategy.formatRowPayload(mockDoc, {
        link: 'http://link',
        contactHistory: 'JDO',
        status: 'Open'
      });

      expect(payload).toEqual({
        'Section': '123',
        'Number': '001',
        'Revision': '0',
        'Calc': '123-CALC',
        'Def': '123-DEF',
        'Link': 'http://link',
        'Contact History': 'JDO',
        'Status': 'Open'
      });
    });
  });

  describe('getFilingSubfolders', () => {
    it('should resolve filing subfolders using compiler', () => {
      const strategy = new DynamicDocumentLogStrategy(mockSpec, mockCompiler);
      const folders = strategy.getFilingSubfolders(mockDoc);
      expect(folders).toEqual(['Closed', '123']);
      expect(mockCompiler.evaluate).toHaveBeenCalledWith(
        'Closed/${section}',
        expect.objectContaining({ section: '123' })
      );
    });
  });

  describe('fromRow extraction', () => {
    it('should extract target key from row', () => {
      const strategy = new DynamicDocumentLogStrategy(mockSpec, mockCompiler);
      const headers = ['Section', 'Number', 'Revision'];
      const row = ['123', '001', '0'];
      const key = strategy.getTargetKeyFromRow(row, headers);
      expect(key).toBe('123-001-0-TARGET');
      expect(mockCompiler.evaluate).toHaveBeenCalledWith(
        mockSpec.identity.format,
        expect.objectContaining({ section: '123', number: '001', revision: '0', 'Section': '123', 'Number': '001', 'Revision': '0' })
      );
    });
  });
});

