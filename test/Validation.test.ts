import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, FormIntakeParser, DocumentPipeline } from '../src/core/intake/DocumentPipeline';

test('validateDocument - Architecture success path with all fields', () => {
  const raw = {
    discipline: 'Architecture',
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

  const result = validateDocument(raw);

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

test('validateDocument - Architecture success with empty fallbacks (section, number, revision)', () => {
  const raw = {
    discipline: 'Architecture',
    date: '2026-07-25',
    contact: 'John Doe',
    action: 'Approved',
    title: 'Door Schedule'
  };

  const result = validateDocument(raw);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.warnings, ['Section', 'Number', 'Revision']);
  }
});

test('validateDocument - Architecture failure missing required fields', () => {
  const raw = {
    discipline: 'Architecture',
    action: 'Received'
  };

  const result = validateDocument(raw);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Missing required fields: Date, Contact, Incoming Routing, Title/);
  }
});

test('validateDocument - FF&E success path with valid tags and vendor', () => {
  const raw = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'CH-01',
    specTitle: 'Dining Chair',
    vendor: 'Herman Miller',
    relatedTag: 'CH-02, CH-03'
  };

  const context = {
    ffeTags: {
      tags: ['CH-01', 'CH-02', 'CH-03'],
      vendors: ['Herman Miller', 'Knoll']
    }
  };

  const result = validateDocument(raw, context);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.disciplineDetails.discipline, 'FF&E');
    if (result.data.disciplineDetails.discipline === 'FF&E') {
      assert.equal(result.data.disciplineDetails.specTag, 'CH-01');
      assert.equal(result.data.disciplineDetails.vendor, 'Herman Miller');
    }
  }
});

test('validateDocument - FF&E invalid related tags failure', () => {
  const raw = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'CH-01',
    specTitle: 'Dining Chair',
    vendor: 'Herman Miller',
    relatedTag: 'INVALID-TAG'
  };

  const context = {
    ffeTags: {
      tags: ['CH-01'],
      vendors: ['Herman Miller']
    }
  };

  const result = validateDocument(raw, context);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.match(result.errors[0], /Invalid Related Tags: INVALID-TAG/);
  }
});

test('validateDocument - FF&E prompt for missing spec tag', () => {
  const raw = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'NEW-TAG',
    specTitle: 'Dining Chair',
    vendor: 'Herman Miller'
  };

  const context = {
    ffeTags: {
      tags: ['CH-01'],
      vendors: ['Herman Miller']
    }
  };

  const result = validateDocument(raw, context);

  assert.equal(result.status, 'interaction_required');
  if (result.status === 'interaction_required') {
    assert.equal(result.interactionType, 'ADD_TAG');
    assert.match(result.message, /Spec Tag "NEW-TAG" is not in the Tag List/);
  }
});

test('validateDocument - FF&E prompt for missing vendor', () => {
  const raw = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'CH-01',
    specTitle: 'Dining Chair',
    vendor: 'Unknown Vendor'
  };

  const context = {
    ffeTags: {
      tags: ['CH-01'],
      vendors: ['Herman Miller']
    }
  };

  const result = validateDocument(raw, context);

  assert.equal(result.status, 'interaction_required');
  if (result.status === 'interaction_required') {
    assert.equal(result.interactionType, 'ADD_VENDOR');
    assert.match(result.message, /Vendor "Unknown Vendor" is not in the Tag List/);
  }
});

test('validateDocument - FF&E bypass tag and vendor validation', () => {
  const raw = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'NEW-TAG',
    specTitle: 'Dining Chair',
    vendor: 'Unknown Vendor'
  };

  const context = {
    ffeTags: {
      tags: ['CH-01'],
      vendors: ['Herman Miller']
    },
    bypassTagValidation: true,
    bypassVendorValidation: true
  };

  const result = validateDocument(raw, context);

  assert.equal(result.status, 'success');
});

test('FormIntakeParser.parse - extracts common form fields into RawDocument dictionary with trimming', () => {
  const formInput = {
    date: ' 2026-07-25 ',
    contact: ' Jane Doe ',
    action: ' Received ',
    incomingRouting: ' To Refer ',
    discipline: ' Architecture ',
    title: ' Plumbing Spec ',
    section: ' 220000 ',
    number: ' 001 ',
    revision: ' 00 ',
    notes: ' Urgent review '
  };

  const raw = FormIntakeParser.parse(formInput);

  assert.equal(raw.date, '2026-07-25');
  assert.equal(raw.contact, 'Jane Doe');
  assert.equal(raw.action, 'Received');
  assert.equal(raw.incomingRouting, 'To Refer');
  assert.equal(raw.discipline, 'Architecture');
  assert.equal(raw.title, 'Plumbing Spec');
  assert.equal(raw.section, '220000');
  assert.equal(raw.number, '001');
  assert.equal(raw.revision, '00');
  assert.equal(raw.notes, 'Urgent review');
  assert.equal(raw.documentType, 'Submittal');
});

test('DocumentPipeline.processFormIntake - returns status error and missingFields when common required fields are empty', () => {
  const formInput = {
    discipline: 'Architecture',
    action: ''
  };

  const result = DocumentPipeline.processFormIntake(formInput);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.deepEqual(result.missingFields, ['Date', 'Contact', 'Action', 'Title']);
    assert.match(result.errors[0], /Missing required fields: Date, Contact, Action, Title/);
  }
});

test('DocumentPipeline.processFormIntake - requires incomingRouting when action is Received', () => {
  const formInput = {
    date: '2026-07-25',
    contact: 'John Smith',
    action: 'Received',
    title: 'HVAC Submittal',
    discipline: 'Architecture'
  };

  const result = DocumentPipeline.processFormIntake(formInput);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.deepEqual(result.missingFields, ['Incoming Routing']);
  }
});

test('DocumentPipeline.processFormIntake - end-to-end success path for common & discipline fields', () => {
  const rawDoc = {
    date: '2026-07-25',
    contact: 'John Smith',
    action: 'Received',
    incomingRouting: 'To Refer',
    title: 'HVAC Submittal',
    discipline: 'Architecture',
    section: '230000',
    number: '001',
    revision: '01'
  };

  const result = DocumentPipeline.processFormIntake(rawDoc);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.date, '2026-07-25');
    assert.equal(result.data.contact, 'John Smith');
    assert.equal(result.data.action, 'Received');
    assert.equal(result.data.incomingRouting, 'To Refer');
    assert.equal(result.warnings.length, 0);
    const details = result.data.disciplineDetails;
    assert.equal(details.discipline, 'Architecture');
    if (details.discipline === 'Architecture') {
      assert.equal(details.section, '230000');
      assert.equal(details.number, '001');
      assert.equal(details.title, 'HVAC Submittal');
      assert.equal(details.revision, '01');
    }
  }
});



test('DocumentPipeline.processFormIntake - Architecture warnings for missing section, number, revision', () => {
  const rawDoc = {
    date: '2026-07-25',
    contact: 'John Smith',
    action: 'Approved',
    title: 'HVAC Submittal',
    discipline: 'Architecture'
  };

  const result = DocumentPipeline.processFormIntake(rawDoc);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.warnings, ['Section', 'Number', 'Revision']);
    const details = result.data.disciplineDetails;
    assert.equal(details.discipline, 'Architecture');
    if (details.discipline === 'Architecture') {
      assert.equal(details.section, '');
      assert.equal(details.number, '');
      assert.equal(details.title, 'HVAC Submittal');
      assert.equal(details.revision, '');
    }
  }
});



test('DocumentPipeline.processFormIntake - Architecture validation fails when title is missing', () => {
  const rawDoc = {
    date: '2026-07-25',
    contact: 'John Smith',
    action: 'Approved',
    discipline: 'Architecture'
  };

  const result = DocumentPipeline.processFormIntake(rawDoc);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.deepEqual(result.missingFields, ['Title']);
  }
});

test('DocumentPipeline.validate - validates RawDocument directly', () => {
  const raw = {
    date: '2026-07-25',
    contact: 'John Smith',
    action: 'Approved',
    title: 'HVAC Submittal',
    discipline: 'Architecture'
  };

  const result = DocumentPipeline.validate(raw);

  assert.equal(result.status, 'success');
});

test('FormIntakeParser.parse - extracts FF&E form fields into RawDocument dictionary with trimming', () => {
  const formInput = {
    discipline: ' FF&E ',
    date: ' 2026-07-25 ',
    contact: ' Jane Smith ',
    action: ' Approved ',
    specTag: ' CH-01 ',
    specTitle: ' Dining Chair ',
    vendor: ' Herman Miller ',
    revision: ' 02 ',
    relatedTag: ' CH-02, CH-03 '
  };

  const raw = FormIntakeParser.parse(formInput);

  assert.equal(raw.discipline, 'FF&E');
  assert.equal(raw.date, '2026-07-25');
  assert.equal(raw.contact, 'Jane Smith');
  assert.equal(raw.action, 'Approved');
  assert.equal(raw.specTag, 'CH-01');
  assert.equal(raw.specTitle, 'Dining Chair');
  assert.equal(raw.vendor, 'Herman Miller');
  assert.equal(raw.revision, '02');
  assert.equal(raw.relatedTag, 'CH-02, CH-03');
  assert.equal(raw.documentType, 'Submittal');
});

test('DocumentPipeline.processFormIntake - enforces required fields (specTag, specTitle, vendor) for FF&E discipline', () => {
  const formInput = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved'
  };

  const result = DocumentPipeline.processFormIntake(formInput);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.deepEqual(result.missingFields, ['Spec Tag', 'Spec Title', 'Vendor']);
    assert.match(result.errors[0], /Missing required fields: Spec Tag, Spec Title, Vendor/);
  }
});

test('DocumentPipeline.processFormIntake - validates comma-separated relatedTag against ffeTags.tags and returns error status for invalid tags', () => {
  const formInput = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'CH-01',
    specTitle: 'Dining Chair',
    vendor: 'Herman Miller',
    relatedTag: 'CH-02, BAD-TAG-1, BAD-TAG-2'
  };

  const context = {
    ffeTags: {
      tags: ['CH-01', 'CH-02', 'CH-03'],
      vendors: ['Herman Miller']
    }
  };

  const result = DocumentPipeline.processFormIntake(formInput, context);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.match(result.errors[0], /Invalid Related Tags: BAD-TAG-1, BAD-TAG-2/);
  }
});

test('DocumentPipeline.processFormIntake - end-to-end success path for FF&E returning FFEDetails', () => {
  const formInput = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'CH-01',
    specTitle: 'Dining Chair',
    vendor: 'Herman Miller',
    revision: '01',
    relatedTag: 'CH-02'
  };

  const context = {
    ffeTags: {
      tags: ['CH-01', 'CH-02'],
      vendors: ['Herman Miller']
    }
  };

  const result = DocumentPipeline.processFormIntake(formInput, context);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.disciplineDetails.discipline, 'FF&E');
    if (result.data.disciplineDetails.discipline === 'FF&E') {
      assert.equal(result.data.disciplineDetails.specTag, 'CH-01');
      assert.equal(result.data.disciplineDetails.specTitle, 'Dining Chair');
      assert.equal(result.data.disciplineDetails.vendor, 'Herman Miller');
      assert.equal(result.data.disciplineDetails.revision, '01');
      assert.equal(result.data.disciplineDetails.relatedTag, 'CH-02');
    }
  }
});

test('DocumentPipeline.processFormIntake - returns error status when relatedTag is provided but ffeTags.tags list is empty', () => {
  const formInput = {
    discipline: 'FF&E',
    date: '2026-07-25',
    contact: 'Jane Smith',
    action: 'Approved',
    specTag: 'CH-01',
    specTitle: 'Dining Chair',
    vendor: 'Herman Miller',
    relatedTag: 'CH-02'
  };

  const context = {
    ffeTags: {
      tags: [],
      vendors: ['Herman Miller']
    }
  };

  const result = DocumentPipeline.processFormIntake(formInput, context);

  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.match(result.errors[0], /Invalid Related Tags: CH-02/);
  }
});
