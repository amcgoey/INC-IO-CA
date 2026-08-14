/**
 * @file ValidationEngine.ts
 * @description Pure Tier 1 validation engine for DocumentTypeSpec instances.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

import type { DocumentTypeSpec } from './DocumentTypeSpec';
import { TemplateFormatCompiler } from './TemplateFormatCompiler';
import type { ValidationHookRegistry } from './ValidationHookRegistry';

export type SpecValidationResult =
  | { status: 'valid'; spec: DocumentTypeSpec }
  | { status: 'invalid'; errors: string[] };

export interface ValidationEngineOptions {
  hookRegistry?: ValidationHookRegistry;
  requireRegisteredHook?: boolean;
}

const STANDARD_BUILTIN_VARIABLES = new Set([
  'date',
  'timestamp',
  'group',
  'revisionGroup',
  'revision',
  'identityGroup',
  'identityRevisionGroup',
  'identity',
]);

export class ValidationEngine {
  /**
   * Validates a candidate DocumentTypeSpec object and returns a discriminated union result.
   */
  public static validateSpec(
    rawSpec: unknown,
    options?: ValidationEngineOptions
  ): SpecValidationResult {
    const errors: string[] = [];

    if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) {
      return {
        status: 'invalid',
        errors: ['DocumentTypeSpec must be a non-null object'],
      };
    }

    const spec = rawSpec as Partial<DocumentTypeSpec>;

    // 1. Validate Naming Triad (key, label, name)
    if (!spec.key || typeof spec.key !== 'string' || spec.key.trim() === '') {
      errors.push("Missing or empty required property 'key'");
    }
    if (!spec.label || typeof spec.label !== 'string' || spec.label.trim() === '') {
      errors.push("Missing or empty required property 'label'");
    }
    if (!spec.name || typeof spec.name !== 'string' || spec.name.trim() === '') {
      errors.push("Missing or empty required property 'name'");
    }

    // 2. Validate Identity Specification
    if (!spec.identity || typeof spec.identity !== 'object') {
      errors.push("Missing required object 'identity'");
    } else {
      if (!spec.identity.format || typeof spec.identity.format !== 'string' || spec.identity.format.trim() === '') {
        errors.push("Missing or empty required property 'identity.format'");
      }
      if (!spec.identity.groupFormat || typeof spec.identity.groupFormat !== 'string' || spec.identity.groupFormat.trim() === '') {
        errors.push("Missing or empty required property 'identity.groupFormat'");
      }
      if (!spec.identity.revisionGroupFormat || typeof spec.identity.revisionGroupFormat !== 'string' || spec.identity.revisionGroupFormat.trim() === '') {
        errors.push("Missing or empty required property 'identity.revisionGroupFormat'");
      }
    }

    // 3. Validate Fields Specification
    const fieldKeySet = new Set<string>();
    if (!spec.fields || !Array.isArray(spec.fields) || spec.fields.length === 0) {
      errors.push("Property 'fields' must be a non-empty array of DocumentFieldSpec");
    } else {
      spec.fields.forEach((field, index) => {
        if (!field || typeof field !== 'object') {
          errors.push(`Field at index ${index} must be an object`);
          return;
        }

        if (!field.key || typeof field.key !== 'string' || field.key.trim() === '') {
          errors.push(`Field at index ${index} has missing or empty 'key'`);
        } else {
          const trimmedKey = field.key.trim();
          if (fieldKeySet.has(trimmedKey)) {
            errors.push(`Duplicate field key '${trimmedKey}' detected`);
          } else {
            fieldKeySet.add(trimmedKey);
          }
        }

        if (!field.label || typeof field.label !== 'string' || field.label.trim() === '') {
          errors.push(`Field '${field.key || index}' has missing or empty 'label'`);
        }

        const validTypes = ['string', 'multiline', 'date', 'list', 'enum', 'number', 'boolean'];
        if (!field.type || !validTypes.includes(field.type)) {
          errors.push(`Field '${field.key || index}' has invalid type '${field.type}'`);
        }

        if (field.isCalculated) {
          if (!field.calcFormat && !field.formulaOrFunction) {
            errors.push(`Calculated field '${field.key || index}' must specify 'calcFormat' or 'formulaOrFunction'`);
          }
        }
      });
    }

    // 4. Validate Template Format Variable Bindings
    if (spec.identity && typeof spec.identity === 'object') {
      const checkIdentityBinding = (formatStr: string | undefined, propName: string) => {
        if (!formatStr || typeof formatStr !== 'string') return;
        const tokens = TemplateFormatCompiler.extractVariableTokens(formatStr);
        for (const token of tokens) {
          if (!fieldKeySet.has(token) && !STANDARD_BUILTIN_VARIABLES.has(token)) {
            errors.push(`Unbound template variable '${token}' in ${propName}`);
          }
        }
      };

      checkIdentityBinding(spec.identity.format, 'identity.format');
      checkIdentityBinding(spec.identity.groupFormat, 'identity.groupFormat');
      checkIdentityBinding(spec.identity.revisionGroupFormat, 'identity.revisionGroupFormat');
    }

    if (spec.fields && Array.isArray(spec.fields)) {
      spec.fields.forEach((field) => {
        if (field.calcFormat && typeof field.calcFormat === 'string') {
          const tokens = TemplateFormatCompiler.extractVariableTokens(field.calcFormat);
          for (const token of tokens) {
            if (token === field.key) {
              errors.push(`Calculated field '${field.key}' contains illegal self-reference in calcFormat`);
            } else if (!fieldKeySet.has(token) && !STANDARD_BUILTIN_VARIABLES.has(token)) {
              errors.push(`Unbound template variable '${token}' in calcFormat of field '${field.key}'`);
            }
          }
        }
      });
    }

    // 5. Validate Picklist / Support Data Linkages
    if (spec.fields && Array.isArray(spec.fields)) {
      spec.fields.forEach((field) => {
        if (field.picklistSource) {
          const { supportDataKey, valueColumnKey, displayColumnKey } = field.picklistSource;
          if (!supportDataKey || typeof supportDataKey !== 'string') {
            errors.push(`Field '${field.key}' picklistSource missing 'supportDataKey'`);
          }
          if (!valueColumnKey || typeof valueColumnKey !== 'string') {
            errors.push(`Field '${field.key}' picklistSource missing 'valueColumnKey'`);
          }
          if (!displayColumnKey || typeof displayColumnKey !== 'string') {
            errors.push(`Field '${field.key}' picklistSource missing 'displayColumnKey'`);
          }

          if (spec.supportData && supportDataKey && spec.supportData[supportDataKey]) {
            const dataset = spec.supportData[supportDataKey];
            const datasetCols = new Set((dataset.columns || []).map((c) => c.key));
            if (valueColumnKey && !datasetCols.has(valueColumnKey)) {
              errors.push(
                `Field '${field.key}' picklistSource references non-existent value column '${valueColumnKey}' in supportData '${supportDataKey}'`
              );
            }
            if (displayColumnKey && !datasetCols.has(displayColumnKey)) {
              errors.push(
                `Field '${field.key}' picklistSource references non-existent display column '${displayColumnKey}' in supportData '${supportDataKey}'`
              );
            }
          }
        }
      });
    }

    // 6. Validate Polymorphic Storage
    if (!spec.storage || !Array.isArray(spec.storage) || spec.storage.length === 0) {
      errors.push("Property 'storage' must be a non-empty array of PolymorphicStorageSpec");
    } else {
      spec.storage.forEach((st, idx) => {
        if (!st || typeof st !== 'object' || !st.type || typeof st.type !== 'string') {
          errors.push(`Storage at index ${idx} missing required 'type' discriminator`);
        }
      });
    }

    // 7. Validate Workflows
    if (!spec.workflows || !Array.isArray(spec.workflows) || spec.workflows.length === 0) {
      errors.push("Property 'workflows' must be a non-empty array of WorkflowTriggerSpec");
    } else {
      spec.workflows.forEach((wf, idx) => {
        if (!wf || typeof wf !== 'object') {
          errors.push(`Workflow at index ${idx} must be an object`);
          return;
        }
        if (!wf.context || typeof wf.context !== 'string' || wf.context.trim() === '') {
          errors.push(`Workflow at index ${idx} missing required 'context'`);
        }
        if (!wf.sequence || !Array.isArray(wf.sequence) || wf.sequence.length === 0) {
          errors.push(`Workflow at index ${idx} must have non-empty 'sequence' array of action names`);
        }
      });
    }

    // 8. Validate Validation Hook (if present or required)
    if (spec.validationHookKey !== undefined) {
      if (typeof spec.validationHookKey !== 'string' || spec.validationHookKey.trim() === '') {
        errors.push("Property 'validationHookKey' must be a non-empty string when defined");
      } else if (options?.requireRegisteredHook && options.hookRegistry) {
        if (!options.hookRegistry.hasHook(spec.validationHookKey)) {
          errors.push(`validationHookKey '${spec.validationHookKey}' is not registered in ValidationHookRegistry`);
        }
      }
    }

    if (errors.length > 0) {
      return { status: 'invalid', errors };
    }

    return { status: 'valid', spec: spec as DocumentTypeSpec };
  }
}
