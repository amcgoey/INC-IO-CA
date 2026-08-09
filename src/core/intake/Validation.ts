/**
 * @file Validation.ts
 * @description Core validation module for submittal form inputs.
 */

declare var require: any;

function validateDocument(raw: RawDocument, context?: ValidationContext): ValidationResult {
  if (typeof validateDocFn !== "undefined") {
    return validateDocFn(raw, context);
  }
  if (typeof require !== "undefined") {
    try {
      const dp = require('./DocumentPipeline');
      if (dp && dp.validateDocument) {
        return dp.validateDocument(raw, context);
      }
    } catch(e) {}
  }
  return { status: "error", errors: ["Validation unavailable"] };
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { validateDocument };
}


function normalizePicklistValue(value: string, fieldSpec?: MinimalFieldSpec): string {
  if (typeof PicklistResolver !== "undefined" && typeof PicklistResolver.normalizePicklistValue === "function") {
    return PicklistResolver.normalizePicklistValue(value, fieldSpec);
  }
  return String(value || "").trim().toUpperCase();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports.normalizePicklistValue = normalizePicklistValue;
}
