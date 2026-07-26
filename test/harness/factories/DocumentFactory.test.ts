import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRawSubmittal,
  createValidatedArchitectureSubmittal,
  createValidatedFFESubmittal,
  createRawRfi,
  createValidatedRfi,
  DocumentFactory
} from './DocumentFactory';

test('createRawSubmittal - returns valid RawDocument defaults', () => {
  const doc = createRawSubmittal();
  assert.equal(doc.documentType, 'Submittal');
  assert.equal(doc.discipline, 'Architecture');
  assert.equal(doc.date, '2026-07-25');
  assert.equal(doc.contact, 'John Doe');
  assert.equal(doc.action, 'Received');
  assert.equal(doc.incomingRouting, 'To Refer');
  assert.equal(doc.title, 'Door Schedule');
  assert.equal(doc.section, '081100');
  assert.equal(doc.number, '001');
  assert.equal(doc.revision, '01');
  assert.equal(doc.notes, 'Sample submittal notes');
});

test('createRawSubmittal - applies partial overrides', () => {
  const doc = createRawSubmittal({
    title: 'Custom Title',
    section: '092900',
    notes: 'Custom notes'
  });
  assert.equal(doc.title, 'Custom Title');
  assert.equal(doc.section, '092900');
  assert.equal(doc.notes, 'Custom notes');
  assert.equal(doc.documentType, 'Submittal');
  assert.equal(doc.number, '001');
});

test('createValidatedArchitectureSubmittal - returns valid ValidatedDocument defaults', () => {
  const doc = createValidatedArchitectureSubmittal();
  assert.equal(doc.documentType, 'Submittal');
  assert.equal(doc.date, '2026-07-25');
  assert.equal(doc.contact, 'John Doe');
  assert.equal(doc.action, 'Received');
  assert.equal(doc.incomingRouting, 'To Refer');
  assert.equal(doc.notes, 'Sample submittal notes');
  assert.equal(doc.disciplineDetails.discipline, 'Architecture');
  if (doc.disciplineDetails.discipline === 'Architecture') {
    assert.equal(doc.disciplineDetails.section, '081100');
    assert.equal(doc.disciplineDetails.number, '001');
    assert.equal(doc.disciplineDetails.title, 'Door Schedule');
    assert.equal(doc.disciplineDetails.revision, '01');
  }
});

test('createValidatedArchitectureSubmittal - applies top-level and disciplineDetails overrides', () => {
  const doc = createValidatedArchitectureSubmittal({
    contact: 'Jane Smith',
    disciplineDetails: {
      discipline: 'Architecture',
      title: 'Window Schedule',
      section: '085113',
      number: '002',
      revision: '02'
    }
  });
  assert.equal(doc.contact, 'Jane Smith');
  assert.equal(doc.action, 'Received');
  assert.equal(doc.disciplineDetails.discipline, 'Architecture');
  if (doc.disciplineDetails.discipline === 'Architecture') {
    assert.equal(doc.disciplineDetails.title, 'Window Schedule');
    assert.equal(doc.disciplineDetails.section, '085113');
    assert.equal(doc.disciplineDetails.number, '002');
    assert.equal(doc.disciplineDetails.revision, '02');
  }
});

test('createValidatedFFESubmittal - returns valid ValidatedDocument defaults', () => {
  const doc = createValidatedFFESubmittal();
  assert.equal(doc.documentType, 'Submittal');
  assert.equal(doc.date, '2026-07-25');
  assert.equal(doc.contact, 'Jane Smith');
  assert.equal(doc.action, 'Approved');
  assert.equal(doc.notes, 'Sample FF&E notes');
  assert.equal(doc.disciplineDetails.discipline, 'FF&E');
  if (doc.disciplineDetails.discipline === 'FF&E') {
    assert.equal(doc.disciplineDetails.specTag, 'CH-01');
    assert.equal(doc.disciplineDetails.specTitle, 'Dining Chair');
    assert.equal(doc.disciplineDetails.vendor, 'Herman Miller');
    assert.equal(doc.disciplineDetails.revision, '01');
    assert.equal(doc.disciplineDetails.relatedTag, 'CH-02');
  }
});

test('createValidatedFFESubmittal - applies partial overrides', () => {
  const doc = createValidatedFFESubmittal({
    action: 'Rejected',
    disciplineDetails: {
      discipline: 'FF&E',
      specTag: 'PL-05',
      specTitle: 'Pendant Light',
      vendor: 'Artemide',
      revision: '00'
    }
  });
  assert.equal(doc.action, 'Rejected');
  assert.equal(doc.disciplineDetails.discipline, 'FF&E');
  if (doc.disciplineDetails.discipline === 'FF&E') {
    assert.equal(doc.disciplineDetails.specTag, 'PL-05');
    assert.equal(doc.disciplineDetails.specTitle, 'Pendant Light');
    assert.equal(doc.disciplineDetails.vendor, 'Artemide');
    assert.equal(doc.disciplineDetails.revision, '00');
  }
});

test('createRawRfi - returns valid RawDocument defaults', () => {
  const doc = createRawRfi();
  assert.equal(doc.documentType, 'RFI');
  assert.equal(doc.discipline, 'Architecture');
  assert.equal(doc.date, '2026-07-25');
  assert.equal(doc.contact, 'John Doe');
  assert.equal(doc.action, 'Received');
  assert.equal(doc.incomingRouting, 'To Architect');
  assert.equal(doc.title, 'Foundation Wall Detail');
  assert.equal(doc.number, '001');
  assert.equal(doc.revision, '00');
  assert.equal(doc.notes, 'Sample RFI notes');
});

test('createRawRfi - applies partial overrides', () => {
  const doc = createRawRfi({
    number: '042',
    title: 'Structural Steel Column Base'
  });
  assert.equal(doc.documentType, 'RFI');
  assert.equal(doc.number, '042');
  assert.equal(doc.title, 'Structural Steel Column Base');
  assert.equal(doc.date, '2026-07-25');
});

test('createValidatedRfi - returns valid ValidatedDocument defaults', () => {
  const doc = createValidatedRfi();
  assert.equal(doc.documentType, 'RFI');
  assert.equal(doc.date, '2026-07-25');
  assert.equal(doc.contact, 'John Doe');
  assert.equal(doc.action, 'Received');
  assert.equal(doc.incomingRouting, 'To Architect');
  assert.equal(doc.notes, 'Sample RFI notes');
  assert.equal(doc.disciplineDetails.discipline, 'Architecture');
  if (doc.disciplineDetails.discipline === 'Architecture') {
    assert.equal(doc.disciplineDetails.section, '033000');
    assert.equal(doc.disciplineDetails.number, '001');
    assert.equal(doc.disciplineDetails.title, 'Foundation Wall Detail');
    assert.equal(doc.disciplineDetails.revision, '00');
  }
});

test('createValidatedRfi - applies partial overrides', () => {
  const doc = createValidatedRfi({
    contact: 'Alex Rivera',
    disciplineDetails: {
      discipline: 'Architecture',
      section: '051200',
      number: '010',
      title: 'Beams Connection',
      revision: '01'
    }
  });
  assert.equal(doc.contact, 'Alex Rivera');
  assert.equal(doc.documentType, 'RFI');
  assert.equal(doc.disciplineDetails.discipline, 'Architecture');
  if (doc.disciplineDetails.discipline === 'Architecture') {
    assert.equal(doc.disciplineDetails.section, '051200');
    assert.equal(doc.disciplineDetails.number, '010');
    assert.equal(doc.disciplineDetails.title, 'Beams Connection');
    assert.equal(doc.disciplineDetails.revision, '01');
  }
});

test('DocumentFactory namespace exports all generator functions', () => {
  assert.equal(typeof DocumentFactory.createRawSubmittal, 'function');
  assert.equal(typeof DocumentFactory.createValidatedArchitectureSubmittal, 'function');
  assert.equal(typeof DocumentFactory.createValidatedFFESubmittal, 'function');
  assert.equal(typeof DocumentFactory.createRawRfi, 'function');
  assert.equal(typeof DocumentFactory.createValidatedRfi, 'function');
});
