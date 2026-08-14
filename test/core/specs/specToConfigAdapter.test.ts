import { describe, it, expect, beforeEach } from 'vitest';
import { specToConfigAdapter } from '../../../src/core/specs/specToConfigAdapter';
import type { DocumentTypeSpec } from '../../../src/core/specs/DocumentTypeSpec';
import {
  ValidationHookRegistry,
  defaultValidationHookRegistry,
} from '../../../src/core/specs/ValidationHookRegistry';
import archSpecJson from '../../../src/specs/submittal_arch.json';
import ffeSpecJson from '../../../src/specs/submittal_ffe.json';

describe('specToConfigAdapter (Tier 1 Pure Core)', () => {
  beforeEach(() => {
    defaultValidationHookRegistry.clearHooks();
  });

  it('should project canonical Architectural Submittal spec to DocumentTypeConfig', () => {
    const spec = archSpecJson as DocumentTypeSpec;
    const config = specToConfigAdapter(spec);

    expect(config.documentType).toBe('SUBMITTAL_ARCH');
    expect(config.displayName).toBe('Submittal Architecture');
    expect(config.targetTab).toBe('Submittal Arch');
    expect(config.rootFolderSearchTerms).toEqual(['Submittals', 'Submittal']);
    expect(config.closedRootFolderName).toBe('Closed');
    expect(config.closedSubfolderMap).toBeUndefined();
    expect(config.filenamePrefix).toBe('_');
    expect(config.logSheetName).toBe('Log');
    expect(config.logSearchTerms).toEqual(['document log', 'inc document log', 'submittal log']);
    expect(config.logAdapterKey).toBe('GoogleSheetsLogRepository');
    expect(config.filingAdapterKey).toBe('GoogleDriveFilingRepository');
    expect(config.pdfAdapterKey).toBe('PdfDocumentService');
    expect(config.aiAdapterKey).toBe('GeminiAiAnalysisAdapter');
    expect(config.fields).toHaveLength(spec.fields.length);
    expect(config.validateHook).toBeUndefined();
  });

  it('should project canonical FF&E Submittal spec and bind registered validation hook', () => {
    const dummyHook = (_rawDoc: any) => ({ status: 'success', warnings: [] });
    defaultValidationHookRegistry.registerHook('ffeStrategyValidationHook', dummyHook as any);

    const spec = ffeSpecJson as DocumentTypeSpec;
    const config = specToConfigAdapter(spec);

    expect(config.documentType).toBe('SUBMITTAL_FFE');
    expect(config.displayName).toBe('Submittal Furniture, Fixtures & Equipment');
    expect(config.targetTab).toBe('Submittal FFE');
    expect(config.rootFolderSearchTerms).toEqual(['FF&E', 'FFE']);
    expect(config.closedRootFolderName).toBe('Closed');
    expect(config.filenamePrefix).toBe('_');
    expect(config.logSheetName).toBe('Submittal FFE');
    expect(config.logSearchTerms).toEqual([
      'document log',
      'inc document log',
      'submittal log',
      'ffe log',
      'ff&e log',
    ]);
    expect(config.validateHook).toBe(dummyHook);
  });

  it('should accept custom hook registry if provided', () => {
    const customRegistry = new ValidationHookRegistry();
    const customHook = () => undefined;
    customRegistry.registerHook('ffeStrategyValidationHook', customHook);

    const spec = ffeSpecJson as DocumentTypeSpec;
    const config = specToConfigAdapter(spec, customRegistry);

    expect(config.validateHook).toBe(customHook);
  });

  it('should project custom generic DocumentTypeSpec with reasonable defaults and closedSubfolderMap if present', () => {
    const customSpec: DocumentTypeSpec = {
      key: 'ASI',
      label: 'ASI Log',
      name: "Architect's Supplemental Instructions",
      identity: {
        format: '${asiNumber}-${date}',
        groupFormat: '${asiNumber}',
        revisionGroupFormat: '${asiNumber}',
      },
      fields: [
        { key: 'asiNumber', label: 'ASI Number', type: 'string', required: true },
        { key: 'title', label: 'Title', type: 'string', required: true },
      ],
      storage: [
        {
          type: 'drive',
          rootFolderSearchTerms: ['ASIs', 'ASI'],
          closedRootFolderName: 'Closed',
          closedSubfolderMap: { Custom: 'Folder' },
          filenamePrefix: 'ASI_',
        },
      ],
      workflows: [
        {
          context: 'GoogleDrive',
          sequence: ['AnalyzeDocument', 'WriteLog'],
        },
      ],
    };

    const config = specToConfigAdapter(customSpec);
    expect(config.documentType).toBe('ASI');
    expect(config.displayName).toBe("Architect's Supplemental Instructions");
    expect(config.targetTab).toBe('ASI Log');
    expect(config.rootFolderSearchTerms).toEqual(['ASIs', 'ASI']);
    expect(config.closedSubfolderMap).toEqual({ Custom: 'Folder' });
    expect(config.filenamePrefix).toBe('ASI_');
    expect(config.logSheetName).toBe('ASI Log');
    expect(config.logParentFolderTerms).toEqual(['ASIs', 'ASI']);
    expect(config.fields).toHaveLength(2);
  });

  it('should preserve field.options when mapping DocumentFieldSpec to DocumentFieldConfig', () => {
    const specWithOptions: DocumentTypeSpec = {
      key: 'CUSTOM_DOC',
      label: 'Custom Doc',
      name: 'Custom Document',
      identity: {
        format: '${num}',
        groupFormat: '${num}',
        revisionGroupFormat: '${num}',
      },
      fields: [
        {
          key: 'status',
          label: 'Status',
          type: 'enum',
          options: [
            { value: 'OPEN', label: 'Open' },
            { value: 'CLOSED', label: 'Closed' },
          ],
        },
      ],
      storage: [],
      workflows: [],
    };

    const config = specToConfigAdapter(specWithOptions);
    expect(config.fields?.[0].options).toEqual([
      { value: 'OPEN', label: 'Open' },
      { value: 'CLOSED', label: 'Closed' },
    ]);
  });

  it('should dynamically derive logParentFolderTerms from driveStorage.rootFolderSearchTerms or spec name/label', () => {
    // 1. With driveStorage.rootFolderSearchTerms
    const ffeSpec = ffeSpecJson as DocumentTypeSpec;
    const ffeConfig = specToConfigAdapter(ffeSpec);
    expect(ffeConfig.logParentFolderTerms).toEqual(['FF&E', 'FFE']);

    // 2. Fallback to [spec.name, spec.label] when storage is empty
    const noStorageSpec: DocumentTypeSpec = {
      key: 'CONTRACT',
      label: 'Contract Log',
      name: 'Contract Document',
      identity: {
        format: '${id}',
        groupFormat: '${id}',
        revisionGroupFormat: '${id}',
      },
      fields: [],
      storage: [],
      workflows: [],
    };
    const contractConfig = specToConfigAdapter(noStorageSpec);
    expect(contractConfig.logParentFolderTerms).toEqual(['Contract Document', 'Contract Log']);
  });
});
