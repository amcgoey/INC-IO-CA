/**
 * @file FakeAiAnalysisAdapter.ts
 * @description Test harness re-export of FakeAiAnalysisAdapter from src/adapters/fakes/FakeAiAnalysisAdapter.
 */

import { FakeAiAnalysisAdapter } from '../../../src/adapters/fakes/FakeAiAnalysisAdapter';

export { FakeAiAnalysisAdapter };

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeAiAnalysisAdapter
  };
}
