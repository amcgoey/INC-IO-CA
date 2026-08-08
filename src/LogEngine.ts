/**
 * @file LogEngine.ts
 * @description Backward compatibility wrapper for LogEngine relocated to Tier 1 src/core/log/LogEngine.ts.
 */

declare var require: any;

if (typeof require !== "undefined") {
  try {
    const _logEngine = require("./core/log/LogEngine");
    if (_logEngine && _logEngine.LogEngine) {
      (globalThis as any).LogEngine = _logEngine.LogEngine;
    }
  } catch (e) {}
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  try {
    const _le = require("./core/log/LogEngine");
    module.exports = {
      LogEngine: _le.LogEngine
    };
  } catch (e) {}
}
