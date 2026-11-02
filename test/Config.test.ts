import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG,
  MESSAGES,
  MAX_SUBMITTAL_PDF_BYTES,
  MAX_SUBMITTAL_DIRECT_ENCODE_BYTES,
  MAX_SUBMITTAL_DIRECT_ENCODE_PAGES
} from '../src/Config';

test('Config - messaging constants use Document Log terminology', () => {
  assert.equal(CONFIG.LOG_FILE_SEARCH_TERM, 'document log');
  assert.equal(MESSAGES.LOG_LOADED_SUCCESS, '✅ Document Log loaded.');
  assert.equal(MESSAGES.LOG_MULTIPLE_FOUND, '⚠️ Multiple Document Logs detected. Please select the correct log below.');
  assert.equal(MESSAGES.ERROR_NO_LOG, '❌ No Document Log found in this Drive.');
});

test('Config - GEMINI_API_URL_ANALYSIS default and precedence', () => {
  const originalProperties = (globalThis as any).PropertiesService;
  try {
    // 1. Default fallback when no PropertiesService
    delete (globalThis as any).PropertiesService;
    assert.equal(
      CONFIG.GEMINI_API_URL_ANALYSIS,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'
    );

    // 2. Fallback to GEMINI_API_URL when set
    let props: Record<string, string> = { GEMINI_API_URL: 'https://custom-proxy/v1beta/models/custom:generateContent' };
    (globalThis as any).PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k: string) => props[k] || null
      })
    };
    assert.equal(CONFIG.GEMINI_API_URL_ANALYSIS, 'https://custom-proxy/v1beta/models/custom:generateContent');

    // 3. GEMINI_API_URL_ANALYSIS takes highest precedence
    props = {
      GEMINI_API_URL: 'https://custom-proxy/v1beta/models/custom:generateContent',
      GEMINI_API_URL_ANALYSIS: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-custom:generateContent'
    };
    assert.equal(
      CONFIG.GEMINI_API_URL_ANALYSIS,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-custom:generateContent'
    );
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
  }
});

test('Config - GEMINI_API_URL_TRIAGE default and precedence', () => {
  const originalProperties = (globalThis as any).PropertiesService;
  try {
    // 1. Default fallback
    delete (globalThis as any).PropertiesService;
    assert.equal(
      CONFIG.GEMINI_API_URL_TRIAGE,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
    );

    // 2. Fallback to GEMINI_API_URL
    let props: Record<string, string> = { GEMINI_API_URL: 'https://custom-proxy/v1beta/models/custom:generateContent' };
    (globalThis as any).PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k: string) => props[k] || null
      })
    };
    assert.equal(CONFIG.GEMINI_API_URL_TRIAGE, 'https://custom-proxy/v1beta/models/custom:generateContent');

    // 3. GEMINI_API_URL_TRIAGE precedence
    props = {
      GEMINI_API_URL: 'https://custom-proxy/v1beta/models/custom:generateContent',
      GEMINI_API_URL_TRIAGE: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite-custom:generateContent'
    };
    assert.equal(
      CONFIG.GEMINI_API_URL_TRIAGE,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite-custom:generateContent'
    );
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
  }
});

test('Config - GEMINI_THINKING_BUDGET defaults to 0 and parses integer script property', () => {
  const originalProperties = (globalThis as any).PropertiesService;
  try {
    // 1. Default when no PropertiesService
    delete (globalThis as any).PropertiesService;
    assert.equal(CONFIG.GEMINI_THINKING_BUDGET, 0);

    // 2. Default when property is not set
    let props: Record<string, string> = {};
    (globalThis as any).PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k: string) => props[k] || null
      })
    };
    assert.equal(CONFIG.GEMINI_THINKING_BUDGET, 0);

    // 3. Valid integer string
    props = { GEMINI_THINKING_BUDGET: '1024' };
    assert.equal(CONFIG.GEMINI_THINKING_BUDGET, 1024);

    // 4. Zero explicitly
    props = { GEMINI_THINKING_BUDGET: '0' };
    assert.equal(CONFIG.GEMINI_THINKING_BUDGET, 0);

    // 5. Negative budget (used to disable thinkingConfig)
    props = { GEMINI_THINKING_BUDGET: '-1' };
    assert.equal(CONFIG.GEMINI_THINKING_BUDGET, -1);

    // 6. Non-numeric string defaults to 0
    props = { GEMINI_THINKING_BUDGET: 'not-a-number' };
    assert.equal(CONFIG.GEMINI_THINKING_BUDGET, 0);
  } finally {
    (globalThis as any).PropertiesService = originalProperties;
  }
});

test('Config - Guardrail threshold constants defined correctly', () => {
  assert.equal(MAX_SUBMITTAL_PDF_BYTES, 20 * 1024 * 1024);
  assert.equal(MAX_SUBMITTAL_DIRECT_ENCODE_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_SUBMITTAL_DIRECT_ENCODE_PAGES, 3);
  assert.equal(CONFIG.MAX_SUBMITTAL_PDF_BYTES, 20 * 1024 * 1024);
  assert.equal(CONFIG.MAX_SUBMITTAL_DIRECT_ENCODE_BYTES, 2 * 1024 * 1024);
  assert.equal(CONFIG.MAX_SUBMITTAL_DIRECT_ENCODE_PAGES, 3);
});


