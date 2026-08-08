/**
 * @file FakeAiAnalysisAdapter.ts
 * @description Re-export of promoted FakeAiAnalysisAdapter from src/adapters/fakes/FakeAiAnalysisAdapter.
 */

export { FakeAiAnalysisAdapter } from '../../../src/adapters/fakes/FakeAiAnalysisAdapter';

const { FakeAiAnalysisAdapter } = require('../../../src/adapters/fakes/FakeAiAnalysisAdapter');

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeAiAnalysisAdapter
  };
}
