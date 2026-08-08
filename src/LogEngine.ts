/**
 * @file LogEngine.ts
 * @description Forwarding re-export wrapper for LogEngine domain engine relocated to Tier 1 src/core/log/LogEngine.ts.
 */

const { LogEngine } = require("./core/log/LogEngine");

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LogEngine
  };
}

(globalThis as any).LogEngine = LogEngine;
