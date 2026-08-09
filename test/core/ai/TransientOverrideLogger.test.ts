import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TransientOverrideLogger, AiOverrideEntry, LogFn } from '../../../src/core/ai/TransientOverrideLogger';
import { AiClassificationResult } from '../../../src/core/interfaces/AiAnalysisService';

function createSpyLogger(): { logs: string[]; spyLog: LogFn } {
  const logs: string[] = [];
  return { logs, spyLog: (msg: string) => logs.push(msg) };
}

test('TransientOverrideLogger - logs single field manual override with structured JSON', () => {
  const { logs, spyLog } = createSpyLogger();
  const logger = new TransientOverrideLogger(spyLog);

  const initialAi: AiClassificationResult = {
    overallConfidence: 0.85,
    fields: {
      specSection: { value: '08 11 13', confidence: 0.82 }
    }
  };

  const finalPayload: Record<string, unknown> = {
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
  const { logs, spyLog } = createSpyLogger();
  const logger = new TransientOverrideLogger(spyLog);

  const initialAi: AiClassificationResult = {
    overallConfidence: 0.80,
    fields: {
      specSection: { value: '08 11 13', confidence: 0.82 },
      contactAbbr: { value: 'ABC', confidence: 0.65 },
      title: { value: 'Hollow Metal Doors', confidence: 0.95 }
    }
  };

  const finalPayload: Record<string, unknown> = {
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

test('TransientOverrideLogger - logs override when user manually clears an AI-predicted field', () => {
  const { logs, spyLog } = createSpyLogger();
  const logger = new TransientOverrideLogger(spyLog);

  const initialAi: AiClassificationResult = {
    fields: {
      specSection: { value: '08 11 13', confidence: 0.82 }
    }
  };

  const finalPayloadCleared: Record<string, unknown> = {
    specSection: ''
  };

  const overrides = logger.logOverrides(initialAi, finalPayloadCleared);

  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].fieldKey, 'specSection');
  assert.equal(overrides[0].aiValue, '08 11 13');
  assert.equal(overrides[0].userValue, '');
  assert.equal(logs.length, 1);
});

test('TransientOverrideLogger - detects string modification differences without silent trimming', () => {
  const { logs, spyLog } = createSpyLogger();
  const logger = new TransientOverrideLogger(spyLog);

  const initialAi: AiClassificationResult = {
    fields: {
      specSection: { value: '08 11 13', confidence: 0.90 }
    }
  };

  const finalPayload: Record<string, unknown> = {
    specSection: '08 11 13 '
  };

  const overrides = logger.logOverrides(initialAi, finalPayload);

  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].userValue, '08 11 13 ');
});

test('TransientOverrideLogger - handles null/undefined inputs gracefully', () => {
  const { logs, spyLog } = createSpyLogger();
  const logger = new TransientOverrideLogger(spyLog);

  assert.deepEqual(logger.logOverrides(null, { a: '1' }), []);
  assert.deepEqual(logger.logOverrides(undefined, { a: '1' }), []);
  assert.deepEqual(logger.logOverrides({ fields: {} }, null), []);
  assert.deepEqual(logger.logOverrides({ fields: {} }, undefined), []);
  assert.equal(logs.length, 0);
});

test('TransientOverrideLogger - default logger instance executes console.log fallback cleanly', () => {
  const logger = new TransientOverrideLogger();
  const initialAi: AiClassificationResult = {
    fields: {
      docTypeKey: { value: 'SUBMITTAL_ARCH', confidence: 0.90 }
    }
  };
  const finalPayload: Record<string, unknown> = {
    docTypeKey: 'SUBMITTAL_FFE'
  };

  const overrides = logger.logOverrides(initialAi, finalPayload);
  assert.equal(overrides.length, 1);
});
