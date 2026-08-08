/**
 * @file Validation.ts
 * @description Core validation module for submittal form inputs.
 */

function validateDocument(raw: RawDocument, context?: ValidationContext): ValidationResult {
  if (typeof validateDocFn !== "undefined") {
    return validateDocFn(raw, context);
  }
  try {
    const dp = require('./DocumentPipeline');
    if (dp && dp.validateDocument) {
      return dp.validateDocument(raw, context);
    }
  } catch(e) {}
  return { status: "error", errors: ["Validation unavailable"] };
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { validateDocument };
}
