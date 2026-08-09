import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentPipeline, validateDocument } from '../../../src/core/intake/DocumentPipeline';
import { defaultDocumentTypeConfigRegistry, DocumentTypeConfigRegistry } from '../../../src/DocumentTypeConfigRegistry';
import { DocumentTypeConfig, RawDocument, ValidationContext } from '../../../src/types';

beforeEach(() => {
  defaultDocumentTypeConfigRegistry.reset();
});

afterEach(() => {
  defaultDocumentTypeConfigRegistry.reset();
});

test('DocumentPipeline.validate - schema-driven validation for Architecture submittal', () => {
  const raw: RawDocument = {
    discipline: 'Architecture',
    documentType: 'Submittal',
    date: '2026-07-25',
    contact: 'John Doe',
    action: 'Received',
    incomingRouting: 'To Refer',
    title: 'Door Schedule',
    section: '081100',
    number: '001',
    revision: '01',
    notes: 'Sample notes'
  };

  const result = DocumentPipeline.validate(raw);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.warnings.length, 0);
    assert.equal(result.data.disciplineDetails.discipline, 'Architecture');
    if (result.data.disciplineDetails.discipline === 'Architecture') {
      assert.equal(result.data.disciplineDetails.title, 'Door Schedule');
      assert.equal(result.data.disciplineDetails.section, '081100');
    }
  }
});

test('DocumentPipeline.validate - returns error with missing required fields driven by DocumentFieldSpec', () => {
  const raw: RawDocument = {
    discipline: 'Architecture',
    documentType: 'Submittal',
    action: 'Received'
  };

  const result = DocumentPipeline.validate(raw);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.match(result.errors[0], /Missing required fields: Date, Contact, Incoming Routing, Title/);
  }
});

test('DocumentPipeline.validate - invokes custom DocumentTypeConfig strategy validation hooks (FF&E tag/vendor)', () => {
  const raw: RawDocument = {
    discipline: 'FF&E',
    documentType: 'Submittal',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'NEW-TAG',
    specTitle: 'Dining Chair',
    vendor: 'Herman Miller'
  };

  const context: ValidationContext = {
    ffeTags: {
      tags: ['CH-01'],
      vendors: ['Herman Miller']
    }
  };

  const result = DocumentPipeline.validate(raw, context);

  assert.equal(result.status, 'interaction_required');
  if (result.status === 'interaction_required') {
    assert.equal(result.interactionType, 'ADD_TAG');
    assert.match(result.message, /Spec Tag "NEW-TAG" is not in the Tag List/);
  }
});

test('DocumentPipeline.validate - supports custom dynamic document types registered in DocumentTypeConfigRegistry', () => {
  const customRfiConfig: DocumentTypeConfig = {
    documentType: 'RFI',
    rootFolderSearchTerms: ['RFIs'],
    closedRootFolderName: 'Closed',
    filenamePrefix: 'RFI-',
    logSearchTerms: ['rfi log'],
    logSheetName: 'RFI Log',
    logAdapterKey: 'GoogleSheetsLogRepository',
    filingAdapterKey: 'GoogleDriveFilingRepository',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'contact', label: 'Contact', type: 'string', required: true },
      { key: 'action', label: 'Action', type: 'string', required: true },
      { key: 'subject', label: 'Subject', type: 'string', required: true },
      { key: 'rfiNumber', label: 'RFI Number', type: 'string', required: true }
    ]
  };

  defaultDocumentTypeConfigRegistry.registerConfig(customRfiConfig);

  const rawRfi: RawDocument = {
    documentType: 'RFI',
    date: '2026-08-01',
    contact: 'Alice',
    action: 'Submitted',
    subject: 'Foundation Rebar Detail',
    rfiNumber: 'RFI-005'
  };

  const result = DocumentPipeline.validate(rawRfi);
  
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.documentType, 'RFI');
    assert.equal(result.data.disciplineDetails.subject, 'Foundation Rebar Detail');
    assert.equal(result.data.disciplineDetails.rfiNumber, 'RFI-005');
  }
});
