import { describe, it, expect, beforeEach } from 'vitest';
import {
  DocumentTypeConfigRegistry,
  defaultDocumentTypeConfigRegistry,
  resolve5TierFieldValue,
  DEFAULT_SUBMITTAL_FIELDS,
  DEFAULT_FFE_SUBMITTAL_FIELDS,
  DEFAULT_RFI_CONFIG,
  DEFAULT_ASI_CONFIG,
} from '../src/DocumentTypeConfigRegistry';

describe('DocumentTypeConfigRegistry (Adapter Seam over DocumentTypeSpecRegistry)', () => {
  let registry: DocumentTypeConfigRegistry;

  beforeEach(() => {
    registry = new DocumentTypeConfigRegistry();
  });

  it('pre-configured for Submittal by default with standard properties', () => {
    expect(registry.hasConfig('Submittal')).toBe(true);

    const config = registry.getConfig('Submittal');
    expect(config.documentType).toBe('Submittal');
    expect(config.rootFolderSearchTerms).toEqual(['Submittals', 'Submittal']);
    expect(config.closedRootFolderName).toBe('Closed');
    expect(config.filenamePrefix).toBe('_');
    expect(config.logSearchTerms).toEqual(['document log', 'inc document log', 'submittal log']);
    expect(config.logSheetName).toBe('Log');
    expect(config.logAdapterKey).toBe('GoogleSheetsLogRepository');
    expect(config.filingAdapterKey).toBe('GoogleDriveFilingRepository');
    expect(config.pdfAdapterKey).toBe('PdfDocumentService');
    expect(config.aiAdapterKey).toBe('GeminiAiAnalysisAdapter');
  });

  it('maintains referential equality for repeated getConfig calls (lazy cached projection)', () => {
    const config1 = registry.getConfig('Submittal');
    const config2 = registry.getConfig('Submittal');
    expect(config1).toBe(config2);

    const arch1 = registry.getConfig('SUBMITTAL_ARCH');
    const arch2 = registry.getConfig('SUBMITTAL_ARCH');
    expect(arch1).toBe(arch2);

    const ffe1 = registry.getConfig('SUBMITTAL_FFE');
    const ffe2 = registry.getConfig('SUBMITTAL_FFE');
    expect(ffe1).toBe(ffe2);
  });

  it('purges all cached projection alias entries when a custom config is registered', () => {
    // 1. Warm the projected cache with aliases
    const initialSubmittal = registry.getConfig('Submittal');
    const initialArch = registry.getConfig('SUBMITTAL_ARCH');
    expect(initialSubmittal).toBeDefined();
    expect(initialArch).toBeDefined();

    // 2. Register custom config for SUBMITTAL_ARCH
    const customArchConfig = {
      ...initialArch,
      displayName: 'Custom Override Architecture',
      targetTab: 'Custom Arch Tab',
    };
    registry.registerConfig(customArchConfig);

    // 3. Verify that aliases resolve to the new custom config and cache was purged
    const retrievedArch = registry.getConfig('SUBMITTAL_ARCH');
    expect(retrievedArch.displayName).toBe('Custom Override Architecture');
    expect(retrievedArch).toBe(customArchConfig);
  });

  it('registers and retrieves custom DocumentTypeConfig', () => {
    const rfiConfig = {
      documentType: 'RFI',
      rootFolderSearchTerms: ['RFIs', 'RFI'],
      closedRootFolderName: 'Closed RFIs',
      filenamePrefix: 'RFI_',
      logSearchTerms: ['rfi log'],
      logSheetName: 'RFI Log',
      logAdapterKey: 'GoogleSheetsLogRepository',
      filingAdapterKey: 'GoogleDriveFilingRepository',
    };

    registry.registerConfig(rfiConfig);
    expect(registry.hasConfig('RFI')).toBe(true);
    expect(registry.getConfig('RFI')).toEqual(rfiConfig);
    expect(registry.getConfig('RFI')).toBe(rfiConfig);
  });

  it('throws error for unregistered document types', () => {
    expect(() => {
      registry.getConfig('NonExistentType');
    }).toThrow(/DocumentTypeConfig not registered/);
  });

  it('reset restores default Submittal and FF&E configs and clears custom configs', () => {
    registry.registerConfig({
      documentType: 'CUSTOM_TEMP_TYPE',
      rootFolderSearchTerms: ['Temp'],
      closedRootFolderName: 'Closed',
      filenamePrefix: 'TEMP_',
      logSearchTerms: ['temp log'],
      logSheetName: 'TEMP',
      logAdapterKey: 'GoogleSheetsLogRepository',
      filingAdapterKey: 'GoogleDriveFilingRepository',
    });

    expect(registry.hasConfig('CUSTOM_TEMP_TYPE')).toBe(true);
    registry.reset();
    expect(registry.hasConfig('CUSTOM_TEMP_TYPE')).toBe(false);
    expect(registry.hasConfig('Submittal')).toBe(true);
    expect(registry.hasConfig('SUBMITTAL_ARCH')).toBe(true);
    expect(registry.hasConfig('SUBMITTAL_FFE')).toBe(true);
  });

  it('defaultDocumentTypeConfigRegistry is exported and pre-configured', () => {
    expect(defaultDocumentTypeConfigRegistry).toBeDefined();
    expect(defaultDocumentTypeConfigRegistry.hasConfig('Submittal')).toBe(true);
  });

  it('DEFAULT_FFE_CONFIG includes standardized logSearchTerms and validation hook', () => {
    const config = registry.getConfig('FF&E');
    expect(config.logSearchTerms).toEqual([
      'document log',
      'inc document log',
      'submittal log',
      'ffe log',
      'ff&e log',
    ]);
    expect(config.validateHook).toBeDefined();
  });

  it('getAllConfigs returns active doc types without undeveloped RFI/ASI by default', () => {
    const configs = registry.getAllConfigs();
    expect(configs.length).toBe(2);

    const arch = configs.find((c) => c.documentType === 'SUBMITTAL_ARCH');
    expect(arch).toBeDefined();
    expect(arch?.displayName).toBe('Architectural Submittals');

    const ffe = configs.find((c) => c.documentType === 'SUBMITTAL_FFE');
    expect(ffe).toBeDefined();
    expect(ffe?.displayName).toBe('FFE Submittals');

    const rfi = configs.find((c) => c.documentType === 'RFI');
    expect(rfi).toBeUndefined();
  });

  it('loadFromSpreadsheetConfig deserializes _Config tab rows', () => {
    const docTypeRows = [
      ['DocTypeKey', 'DisplayName', 'Prefix', 'LogTabName'],
      ['Submittal_Arch', 'Architectural Submittals Custom', 'SUB-ARCH', 'Submittal Arch'],
      ['Submittal_FFE', 'FFE Submittals Custom', 'SUB-FFE', 'Submittal FFE'],
    ];
    const fieldSpecsMap = {
      Submittal_Arch: [
        [
          'Key',
          'Header',
          'Label',
          'Type',
          'IsCalculated',
          'FormulaOrFunction',
          'OptionsRange',
          'Required',
          'Description',
          'DefaultValue',
          'KeyNormalizationRule',
          'NumberFormat',
        ],
        ['status', 'Status', 'Status', 'list', 'FALSE', '', 'Statuses_Submittal_Labels', 'TRUE', 'Status', 'Open', 'picklist', ''],
        ['number', 'Number', 'Number', 'string', 'FALSE', '', '', 'FALSE', 'Submittal Number', '', '', '000'],
      ],
    };

    registry.loadFromSpreadsheetConfig(docTypeRows, fieldSpecsMap);
    const configs = registry.getAllConfigs();
    expect(configs.length).toBe(2);

    const arch = registry.getConfig('Submittal_Arch');
    expect(arch.displayName).toBe('Architectural Submittals Custom');
    expect(arch.logSheetName).toBe('Submittal Arch');
    expect(arch.fields && arch.fields.length === 2).toBe(true);
    expect(arch.fields![1].key).toBe('number');
  });

  it('preserves resolve5TierFieldValue and default field specs exports', () => {
    expect(DEFAULT_SUBMITTAL_FIELDS.length).toBeGreaterThan(0);
    expect(DEFAULT_FFE_SUBMITTAL_FIELDS.length).toBeGreaterThan(0);
    expect(DEFAULT_RFI_CONFIG.documentType).toBe('RFI');
    expect(DEFAULT_ASI_CONFIG.documentType).toBe('ASI');

    const field = DEFAULT_SUBMITTAL_FIELDS[0];
    const val = resolve5TierFieldValue(field, { formInput: { [field.key]: 'FormVal' } });
    expect(val).toBe('FormVal');
  });
});
