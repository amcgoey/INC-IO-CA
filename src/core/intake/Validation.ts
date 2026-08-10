/**
 * @file Validation.ts
 * @description Core validation module for submittal form inputs.
 */

import { validateDocument as validateDocFn } from './DocumentPipeline';

function validateDocument(raw: RawDocument, context?: ValidationContext): ValidationResult {
  return validateDocFn(raw, context);
}

function normalizePicklistValue(value: string, fieldSpec?: MinimalFieldSpec): string {
  return String(value || "").trim().toUpperCase();
}

export { validateDocument, normalizePicklistValue };
