/**
 * @file JsonDocumentTypeSpecAdapter.ts
 * @description Pure Tier 1 JSON serializer and deserializer for DocumentTypeSpec instances.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

import type { DocumentTypeSpec } from './DocumentTypeSpec';
import {
  ValidationEngine,
  type SpecValidationResult,
  type ValidationEngineOptions,
} from './ValidationEngine';

export interface JsonStringifyOptions {
  space?: number;
}

export class JsonDocumentTypeSpecAdapter {
  /**
   * Parses a JSON string or in-memory object into a validated DocumentTypeSpec result.
   * Catches native JSON SyntaxErrors and delegates structural validation to ValidationEngine.
   */
  public static parse(
    jsonInput: string | object,
    options?: ValidationEngineOptions
  ): SpecValidationResult {
    let parsed: unknown;

    if (typeof jsonInput === 'string') {
      try {
        parsed = JSON.parse(jsonInput);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          status: 'invalid',
          errors: ['Invalid JSON syntax: ' + message],
        };
      }
    } else if (jsonInput !== null && typeof jsonInput === 'object') {
      parsed = jsonInput;
    } else {
      return {
        status: 'invalid',
        errors: ['Expected JSON string or object input'],
      };
    }

    return ValidationEngine.validateSpec(parsed, options);
  }

  /**
   * Serializes a DocumentTypeSpec instance into a formatted JSON string.
   */
  public static stringify(
    spec: DocumentTypeSpec,
    options?: JsonStringifyOptions
  ): string {
    const space = options?.space !== undefined ? options.space : 2;
    return JSON.stringify(spec, null, space);
  }
}
