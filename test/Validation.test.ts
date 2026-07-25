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
