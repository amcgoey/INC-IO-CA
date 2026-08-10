import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentTypeConfigRegistry, defaultDocumentTypeConfigRegistry } from '../src/DocumentTypeConfigRegistry';

test('DocumentTypeConfigRegistry - pre-configured for Submittal by default', () => {
  const registry = new DocumentTypeConfigRegistry();
  assert.equal(registry.hasConfig('Submittal'), true);
  
  const config = registry.getConfig('Submittal');
  assert.equal(config.documentType, 'Submittal');
  assert.deepEqual(config.rootFolderSearchTerms, ['Submittals', 'Submittal']);
  assert.equal(config.closedRootFolderName, 'Closed');
  assert.equal(config.filenamePrefix, '_');
  assert.deepEqual(config.logSearchTerms, ['document log', 'inc document log', 'submittal log']);
  assert.equal(config.logSheetName, 'Log');
  assert.equal(config.logAdapterKey, 'GoogleSheetsLogRepository');
  assert.equal(config.filingAdapterKey, 'GoogleDriveFilingRepository');
  assert.equal(config.pdfAdapterKey, 'PdfDocumentService');
  assert.equal(config.aiAdapterKey, 'GeminiAiAnalysisAdapter');
});

test('DocumentTypeConfigRegistry - registers and retrieves custom DocumentTypeConfig', () => {
  const registry = new DocumentTypeConfigRegistry();
  const rfiConfig = {
    documentType: 'RFI',
    rootFolderSearchTerms: ['RFIs', 'RFI'],
    closedRootFolderName: 'Closed RFIs',
    filenamePrefix: 'RFI_',
    logSearchTerms: ['rfi log'],
    logSheetName: 'RFI Log',
    logAdapterKey: 'GoogleSheetsLogRepository',
    filingAdapterKey: 'GoogleDriveFilingRepository'
  };

  registry.registerConfig(rfiConfig);
  assert.equal(registry.hasConfig('RFI'), true);
  assert.deepEqual(registry.getConfig('RFI'), rfiConfig);
});

test('DocumentTypeConfigRegistry - throws error for unregistered document types', () => {
  const registry = new DocumentTypeConfigRegistry();
  assert.throws(() => {
    registry.getConfig('NonExistentType');
  }, /DocumentTypeConfig not registered/);
});

test('DocumentTypeConfigRegistry - reset restores default Submittal config', () => {
  const registry = new DocumentTypeConfigRegistry();
  registry.registerConfig({
    documentType: 'CUSTOM_TEMP_TYPE',
    rootFolderSearchTerms: ['Temp'],
    closedRootFolderName: 'Closed',
    filenamePrefix: 'TEMP_',
    logSearchTerms: ['temp log'],
    logSheetName: 'TEMP',
    logAdapterKey: 'GoogleSheetsLogRepository',
    filingAdapterKey: 'GoogleDriveFilingRepository'
  });
  
  assert.equal(registry.hasConfig('CUSTOM_TEMP_TYPE'), true);
  registry.reset();
  assert.equal(registry.hasConfig('CUSTOM_TEMP_TYPE'), false);
  assert.equal(registry.hasConfig('Submittal'), true);
});

test('defaultDocumentTypeConfigRegistry is exported and pre-configured', () => {
  assert.ok(defaultDocumentTypeConfigRegistry);
  assert.equal(defaultDocumentTypeConfigRegistry.hasConfig('Submittal'), true);
});

test('DocumentTypeConfigRegistry - DEFAULT_FFE_CONFIG includes standardized logSearchTerms', () => {
  const registry = new DocumentTypeConfigRegistry();
  const config = registry.getConfig('FF&E');
  assert.deepEqual(config.logSearchTerms, ['document log', 'inc document log', 'submittal log', 'ffe log', 'ff&e log']);
});

test('DocumentTypeConfigRegistry - getAllConfigs returns active doc types without undeveloped RFI/ASI by default', () => {
  const registry = new DocumentTypeConfigRegistry();
  const configs = registry.getAllConfigs();
  assert.equal(configs.length, 2, "Default active configs should only include Submittal_Arch and Submittal_FFE");
  
  const arch = configs.find(c => c.documentType === 'SUBMITTAL_ARCH');
  assert.ok(arch);
  assert.equal(arch.displayName, 'Architectural Submittals');

  const ffe = configs.find(c => c.documentType === 'SUBMITTAL_FFE');
  assert.ok(ffe);
  assert.equal(ffe.displayName, 'FFE Submittals');

  const rfi = configs.find(c => c.documentType === 'RFI');
  assert.equal(rfi, undefined, "Undeveloped RFI document type should not be active by default");
});

test('DocumentTypeConfigRegistry - loadFromSpreadsheetConfig deserializes _Config tab rows', () => {
  const registry = new DocumentTypeConfigRegistry();
  const docTypeRows = [
    ['DocTypeKey', 'DisplayName', 'Prefix', 'LogTabName'],
    ['Submittal_Arch', 'Architectural Submittals Custom', 'SUB-ARCH', 'Submittal Arch'],
    ['Submittal_FFE', 'FFE Submittals Custom', 'SUB-FFE', 'Submittal FFE']
  ];
  const fieldSpecsMap = {
    Submittal_Arch: [
      ['Key', 'Header', 'Label', 'Type', 'IsCalculated', 'FormulaOrFunction', 'OptionsRange', 'Required', 'Description', 'DefaultValue', 'KeyNormalizationRule', 'NumberFormat'],
      ['status', 'Status', 'Status', 'list', 'FALSE', '', 'Statuses_Submittal_Labels', 'TRUE', 'Status', 'Open', 'picklist', ''],
      ['number', 'Number', 'Number', 'string', 'FALSE', '', '', 'FALSE', 'Submittal Number', '', '', '000']
    ]
  };

  registry.loadFromSpreadsheetConfig(docTypeRows, fieldSpecsMap);
  const configs = registry.getAllConfigs();
  assert.equal(configs.length, 2);

  const arch = registry.getConfig('Submittal_Arch');
  assert.equal(arch.displayName, 'Architectural Submittals Custom');
  assert.equal(arch.logSheetName, 'Submittal Arch');
  assert.ok(arch.fields && arch.fields.length === 2);
  assert.equal(arch.fields[1].key, 'number');
});
