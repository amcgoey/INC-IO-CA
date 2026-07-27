import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ListDocumentField, DocumentPipeline } from '../src/DocumentPipeline';
import { ValidationContext } from '../src/types';

test('ListDocumentField.resolve - contact field resolves long form to stored abbreviation', () => {
  const contacts = [
    { abbr: 'INC', name: 'INC Architecture and Design' },
    { abbr: 'GC', name: 'General Contractor' }
  ];
  const field = ListDocumentField.createContactField(contacts);

  assert.equal(field.storedForm, 'abbreviation');

  const resolvedFromLongForm = field.resolve('INC Architecture and Design');
  assert.equal(resolvedFromLongForm.storedValue, 'INC');
  assert.equal(resolvedFromLongForm.abbreviation, 'INC');
  assert.equal(resolvedFromLongForm.longForm, 'INC Architecture and Design');

  const resolvedFromAbbr = field.resolve('INC');
  assert.equal(resolvedFromAbbr.storedValue, 'INC');
  assert.equal(resolvedFromAbbr.abbreviation, 'INC');
  assert.equal(resolvedFromAbbr.longForm, 'INC Architecture and Design');

  const resolvedCaseInsensitive = field.resolve('inc architecture and design');
  assert.equal(resolvedCaseInsensitive.storedValue, 'INC');
  assert.equal(resolvedCaseInsensitive.abbreviation, 'INC');
  assert.equal(resolvedCaseInsensitive.longForm, 'INC Architecture and Design');
});

test('ListDocumentField.resolve - action field resolves abbreviation to stored long form', () => {
  const actions = [
    { action: 'Received', abbr: 'REC', status: 'Open' },
    { action: 'Reviewed', abbr: 'REV', status: 'Closed' }
  ];
  const field = ListDocumentField.createActionField(actions);

  assert.equal(field.storedForm, 'longForm');

  const resolvedFromAbbr = field.resolve('REC');
  assert.equal(resolvedFromAbbr.storedValue, 'Received');
  assert.equal(resolvedFromAbbr.abbreviation, 'REC');
  assert.equal(resolvedFromAbbr.longForm, 'Received');

  const resolvedFromLongForm = field.resolve('Received');
  assert.equal(resolvedFromLongForm.storedValue, 'Received');
  assert.equal(resolvedFromLongForm.abbreviation, 'REC');
  assert.equal(resolvedFromLongForm.longForm, 'Received');
});

test('ListDocumentField.resolve - handles unlisted values with fallback', () => {
  const field = ListDocumentField.createContactField([]);
  const resolved = field.resolve('Custom Partner');

  assert.equal(resolved.storedValue, 'Custom Partner');
  assert.equal(resolved.abbreviation, 'Custom Partner');
  assert.equal(resolved.longForm, 'Custom Partner');
});

test('DocumentPipeline.validate - resolves contact abbreviation and action long form via ValidationContext', () => {
  const context: ValidationContext = {
    contacts: [
      { abbr: 'INC', name: 'INC Architecture and Design' }
    ],
    actions: [
      { action: 'Received', abbr: 'REC', status: 'Open' }
    ]
  };

  const raw = {
    discipline: 'Architecture',
    date: '2026-07-26',
    contact: 'INC Architecture and Design', // Long form input
    action: 'REC', // Abbreviation input
    incomingRouting: 'To Refer',
    title: 'Submittal Test'
  };

  const result = DocumentPipeline.validate(raw, context);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.contact, 'INC'); // stored abbreviation
    assert.equal(result.data.action, 'Received'); // stored long form
    assert.equal(result.data.contactAbbr, 'INC');
    assert.equal(result.data.contactLongForm, 'INC Architecture and Design');
    assert.equal(result.data.actionAbbr, 'REC');
    assert.equal(result.data.actionLongForm, 'Received');

    assert.ok(result.data.listFields);
    assert.equal(result.data.listFields.contact.storedValue, 'INC');
    assert.equal(result.data.listFields.contact.storedForm, 'abbreviation');
    assert.equal(result.data.listFields.action.storedValue, 'Received');
    assert.equal(result.data.listFields.action.storedForm, 'longForm');
  }
});
