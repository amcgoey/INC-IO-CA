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
    documentType: 'RFI',
    rootFolderSearchTerms: ['RFIs'],
    closedRootFolderName: 'Closed',
    filenamePrefix: 'RFI_',
    logSearchTerms: ['rfi log'],
    logSheetName: 'RFI',
    logAdapterKey: 'GoogleSheetsLogRepository',
    filingAdapterKey: 'GoogleDriveFilingRepository'
  });
  
  assert.equal(registry.hasConfig('RFI'), true);
  registry.reset();
  assert.equal(registry.hasConfig('RFI'), false);
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
