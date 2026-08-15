/**
 * @file FakeAiAnalysisAdapter.ts
 * @description Test harness re-export of FakeAiAnalysisAdapter from src/adapters/fakes/FakeAiAnalysisAdapter.
 */

import { FakeAiAnalysisAdapter } from '../../../src/adapters/fakes/FakeAiAnalysisAdapter';

export { FakeAiAnalysisAdapter };

declare let module: { exports?: unknown };
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeAiAnalysisAdapter
  };
}
