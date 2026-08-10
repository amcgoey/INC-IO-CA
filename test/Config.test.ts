import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, MESSAGES } from '../src/Config';

test('Config - messaging constants use Document Log terminology', () => {
  assert.equal(CONFIG.LOG_FILE_SEARCH_TERM, 'document log');
  assert.equal(MESSAGES.LOG_LOADED_SUCCESS, '✅ Document Log loaded.');
  assert.equal(MESSAGES.LOG_MULTIPLE_FOUND, '⚠️ Multiple Document Logs detected. Please select the correct log below.');
  assert.equal(MESSAGES.ERROR_NO_LOG, '❌ No Document Log found in this Drive.');
});
