import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument } from '../src/Validation';

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
