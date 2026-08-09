import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TransientOverrideLogger, AiOverrideEntry, LogFn } from '../../../src/core/ai/TransientOverrideLogger';
import { AiClassificationResult, AiClassificationField } from '../../../src/core/interfaces/AiAnalysisService';

test('TransientOverrideLogger - logs single field manual override with structured JSON', () => {
  const logs: string[] = [];
  const spyLog: LogFn = (msg) => logs.push(msg);
  const logger = new TransientOverrideLogger(spyLog);

  const initialAi: AiClassificationResult = {
    overallConfidence: 0.85,
    fields: {
      specSection: { value: '08 11 13', confidence: 0.82 }
    }
  };

  const finalPayload: Record<string, string> = {
    specSection: '08 11 16'
  };

  const overrides = logger.logOverrides(initialAi, finalPayload);

  assert.equal(overrides.length, 1);
  assert.deepEqual(overrides[0], {
    fieldKey: 'specSection',
    aiValue: '08 11 13',
    aiConfidence: 0.82,
    userValue: '08 11 16'
  });

  assert.equal(logs.length, 1);
  const loggedObj = JSON.parse(logs[0]);
  assert.deepEqual(loggedObj, {
    fieldKey: 'specSection',
    aiValue: '08 11 13',
    aiConfidence: 0.82,
    userValue: '08 11 16'
  });
});

test('TransientOverrideLogger - logs multiple field overrides and ignores matching fields', () => {
  const logs: string[] = [];
  const spyLog: LogFn = (msg) => logs.push(msg);
  const logger = new TransientOverrideLogger(spyLog);

  const initialAi: AiClassificationResult = {
    overallConfidence: 0.80,
    fields: {
      specSection: { value: '08 11 13', confidence: 0.82 },
      contactAbbr: { value: 'ABC', confidence: 0.65 },
      title: { value: 'Hollow Metal Doors', confidence: 0.95 }
    }
  };

  const finalPayload: Record<string, string> = {
    specSection: '08 11 16',
    contactAbbr: 'XYZ',
    title: 'Hollow Metal Doors'
  };

  const overrides = logger.logOverrides(initialAi, finalPayload);

  assert.equal(overrides.length, 2);
  assert.equal(logs.length, 2);

  assert.equal(overrides[0].fieldKey, 'specSection');
  assert.equal(overrides[0].userValue, '08 11 16');

  assert.equal(overrides[1].fieldKey, 'contactAbbr');
  assert.equal(overrides[1].userValue, 'XYZ');
});

test('TransientOverrideLogger - suppresses logging when user value matches AI value (ignoring whitespace)', () => {
  const logs: string[] = [];
  const spyLog: LogFn = (msg) => logs.push(msg);
  const logger = new TransientOverrideLogger(spyLog);

  const initialAi: AiClassificationResult = {
    fields: {
      specSection: { value: '08 11 13', confidence: 0.90 }
    }
  };

  const finalPayload: Record<string, string> = {
    specSection: '08 11 13 '
  };

  const overrides = logger.logOverrides(initialAi, finalPayload);

  assert.equal(overrides.length, 0);
  assert.equal(logs.length, 0);
});

test('TransientOverrideLogger - handles null/undefined inputs gracefully', () => {
  const logs: string[] = [];
  const spyLog: LogFn = (msg) => logs.push(msg);
  const logger = new TransientOverrideLogger(spyLog);

  assert.deepEqual(logger.logOverrides(null, { a: '1' }), []);
  assert.deepEqual(logger.logOverrides(undefined, { a: '1' }), []);
  assert.deepEqual(logger.logOverrides({ fields: {} }, null), []);
  assert.deepEqual(logger.logOverrides({ fields: {} }, undefined), []);
  assert.equal(logs.length, 0);
});

test('TransientOverrideLogger - accepts flat field dictionary for initialAi', () => {
  const logs: string[] = [];
  const spyLog: LogFn = (msg) => logs.push(msg);

  const initialFields: Record<string, AiClassificationField> = {
    vendor: { value: 'Acme Corp', confidence: 0.70 }
  };

  const finalPayload = {
    vendor: 'Global Supplies Inc'
  };

  const overrides = TransientOverrideLogger.logOverrides(initialFields, finalPayload, spyLog);

  assert.equal(overrides.length, 1);
  assert.equal(logs.length, 1);
  assert.equal(overrides[0].fieldKey, 'vendor');
  assert.equal(overrides[0].aiValue, 'Acme Corp');
  assert.equal(overrides[0].userValue, 'Global Supplies Inc');
});

test('TransientOverrideLogger - default logger invocation executes without error', () => {
  const logger = new TransientOverrideLogger();
  const initialAi: AiClassificationResult = {
    fields: {
      docTypeKey: { value: 'SUBMITTAL_ARCH', confidence: 0.90 }
    }
  };
  const finalPayload = {
    docTypeKey: 'SUBMITTAL_FFE'
  };

  const overrides = logger.logOverrides(initialAi, finalPayload);
  assert.equal(overrides.length, 1);
});
