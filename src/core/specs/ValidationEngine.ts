/**
 * @file ValidationEngine.ts
 * @description Pure Tier 1 validation engine for DocumentTypeSpec instances and form submission validation.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

import type {
  DocumentTypeSpec,
  DriveStorageSpec,
  DynamicPromptConfig,
  SupportDataColumnSpec,
  SupportDataSpec,
} from './DocumentTypeSpec';
import { TemplateFormatCompiler } from './TemplateFormatCompiler';
import type { ValidationHookRegistry } from './ValidationHookRegistry';

export type SpecValidationResult =
  | { status: 'valid'; spec: DocumentTypeSpec }
  | { status: 'invalid'; errors: string[] };

export interface ValidationEngineOptions {
  hookRegistry?: ValidationHookRegistry;
  requireRegisteredHook?: boolean;
}

export interface SubmissionValidationOptions {
  bypassTagValidation?: boolean;
  bypassVendorValidation?: boolean;
  supportData?: Record<string, SupportDataSpec>;
  [key: string]: any;
}

export type SubmissionValidationResult =
  | { status: 'valid'; data: Record<string, any>; warnings?: string[] }
  | { status: 'invalid'; errors: string[]; missingFields?: string[] }
  | {
      status: 'interaction_required';
      interactionType?: 'ADD_TAG' | 'ADD_VENDOR' | string;
      supportDataKey: string;
      fieldKey: string;
      userValue: string;
      dynamicPrompts: DynamicPromptConfig[];
      message: string;
    };

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

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

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

    const checkTemplateBinding = (formatStr: string | undefined, locationDesc: string) => {
      if (!formatStr || typeof formatStr !== 'string') return;
      const tokens = TemplateFormatCompiler.extractVariableTokens(formatStr);
      for (const token of tokens) {
        if (!fieldKeySet.has(token) && !STANDARD_BUILTIN_VARIABLES.has(token)) {
          errors.push(`Unbound template variable '${token}' in ${locationDesc}`);
        }
      }
    };

    // 4. Validate Template Format Variable Bindings in Identity and Calculated Fields
    if (spec.identity && typeof spec.identity === 'object') {
      checkTemplateBinding(spec.identity.format, 'identity.format');
      checkTemplateBinding(spec.identity.groupFormat, 'identity.groupFormat');
      checkTemplateBinding(spec.identity.revisionGroupFormat, 'identity.revisionGroupFormat');
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

          if (supportDataKey) {
            if (!spec.supportData || !spec.supportData[supportDataKey]) {
              errors.push(
                `Field '${field.key}' picklistSource references non-existent supportDataKey '${supportDataKey}'`
              );
            } else {
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
          return;
        }

        if (st.type === 'drive') {
          const driveStorage = st as Partial<DriveStorageSpec>;
          checkTemplateBinding(driveStorage.closedSubfolderFormat, `storage[${idx}].closedSubfolderFormat`);
          checkTemplateBinding(driveStorage.filenameFormat, `storage[${idx}].filenameFormat`);
        }
      });
    }

    // 7. Validate Workflows
    if (!spec.workflows || !Array.isArray(spec.workflows) || spec.workflows.length === 0) {
      errors.push("Property 'workflows' must be a non-empty array of WorkflowSpec");
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
      } else if (options?.requireRegisteredHook) {
        if (!options.hookRegistry) {
          errors.push(
            `validationHookKey '${spec.validationHookKey}' requires hookRegistry when requireRegisteredHook is true`
          );
        } else if (!options.hookRegistry.hasHook(spec.validationHookKey)) {
          errors.push(`validationHookKey '${spec.validationHookKey}' is not registered in ValidationHookRegistry`);
        }
      }
    }

    if (errors.length > 0) {
      return { status: 'invalid', errors };
    }

    return { status: 'valid', spec: spec as DocumentTypeSpec };
  }

  /**
   * Validates form submission values against a DocumentTypeSpec and its SupportDataSpec definitions.
   * Detects missing top-level required fields, verifies dynamic picklist entries, and emits
   * `interaction_required` with `dynamicPrompts` when required support data columns are missing.
   *
   * @param spec - Declarative document type specification.
   * @param formInput - Raw form submission key-value pairs.
   * @param options - Additional validation options.
   * @returns SubmissionValidationResult discriminated union.
   */
  public static validateSubmission(
    spec: DocumentTypeSpec,
    formInput: Record<string, any> = {},
    options?: SubmissionValidationOptions
  ): SubmissionValidationResult {
    const raw = { ...formInput };
    const missingFields: string[] = [];
    const fields = spec.fields || [];

    // Step 1: Check required top-level document fields
    for (const field of fields) {
      if (field.isCalculated) continue;

      const rawVal = raw[field.key];
      const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';

      if (field.key === 'incomingRouting') {
        const actionVal = String(raw.action || '').trim().toLowerCase();
        if (actionVal === 'received' && strVal === '') {
          missingFields.push(field.label || 'Incoming Routing');
        }
        continue;
      }

      if (field.required && strVal === '') {
        missingFields.push(field.label || field.key);
      }
    }

    if (missingFields.length > 0) {
      return {
        status: 'invalid',
        errors: [`Missing required fields: ${missingFields.join(', ')}`],
        missingFields,
      };
    }

    const sanitizedData: Record<string, any> = { ...raw };
    const supportDatasets = options?.supportData || spec.supportData || {};

    // Step 2: Validate picklist sources and detect dynamic additions
    for (const field of fields) {
      if (!field.picklistSource) continue;

      const { supportDataKey, valueColumnKey, displayColumnKey } = field.picklistSource;
      const dataset = supportDatasets[supportDataKey];
      if (!dataset) continue;

      const userVal = String(raw[field.key] ?? '').trim();
      if (!userVal) continue;

      const items = Array.isArray(dataset.items) ? dataset.items : [];
      const userValLower = userVal.toLowerCase();

      let matchedItem: Record<string, any> | undefined;
      for (const item of items) {
        const itemVal = item[valueColumnKey] !== undefined && item[valueColumnKey] !== null
          ? String(item[valueColumnKey]).trim().toLowerCase()
          : '';
        const itemDisplay = item[displayColumnKey] !== undefined && item[displayColumnKey] !== null
          ? String(item[displayColumnKey]).trim().toLowerCase()
          : '';

        if (itemVal === userValLower || itemDisplay === userValLower) {
          matchedItem = item;
          break;
        }
      }

      if (matchedItem) {
        // Normalize field to canonical valueColumnKey
        sanitizedData[field.key] = matchedItem[valueColumnKey] || userVal;
      } else {
        // Unknown dynamic picklist value
        if (dataset.allowDynamicAddition) {
          const dynamicPrompts = this.resolveDynamicPrompts(dataset);

          const isBypassed =
            (options?.bypassTagValidation && dataset.key.toLowerCase().includes('tag')) ||
            (options?.bypassVendorValidation && dataset.key.toLowerCase().includes('vendor'));

          let missingRequiredPrompt = false;

          if (!isBypassed) {
            for (const prompt of dynamicPrompts) {
              const promptVal =
                raw[prompt.columnKey] ??
                raw[`${field.key}_${prompt.columnKey}`] ??
                raw[`${dataset.key}_${prompt.columnKey}`];

              const promptValStr =
                promptVal !== undefined && promptVal !== null ? String(promptVal).trim() : '';

              if (prompt.required) {
                if (promptValStr === '') {
                  // If prompt is valueColumnKey and userVal is identical to displayColumnKey, check if action prompt requires confirmation
                  if (
                    prompt.columnKey === valueColumnKey &&
                    valueColumnKey === displayColumnKey &&
                    userVal !== '' &&
                    (!Array.isArray(dataset.dynamicPrompts) || !dataset.dynamicPrompts.some((p) => typeof p === 'string' && p.startsWith('ADD_')))
                  ) {
                    sanitizedData[prompt.columnKey] = userVal;
                  } else {
                    missingRequiredPrompt = true;
                  }
                } else {
                  sanitizedData[prompt.columnKey] = promptValStr;
                }
              } else {
                // Unprompted or skipped optional columns default to implicit blanks ("")
                sanitizedData[prompt.columnKey] = promptValStr;
              }
            }
          }

          if (missingRequiredPrompt && !isBypassed) {
            let interactionType = 'ADD_ITEM';
            if (Array.isArray(dataset.dynamicPrompts) && typeof dataset.dynamicPrompts[0] === 'string' && dataset.dynamicPrompts[0].startsWith('ADD_')) {
              interactionType = dataset.dynamicPrompts[0];
            } else if (dataset.key.toLowerCase().includes('vendor')) {
              interactionType = 'ADD_VENDOR';
            } else if (dataset.key.toLowerCase().includes('tag')) {
              interactionType = 'ADD_TAG';
            }

            return {
              status: 'interaction_required',
              interactionType,
              supportDataKey: dataset.key,
              fieldKey: field.key,
              userValue: userVal,
              dynamicPrompts,
              message: `Missing required support data columns for ${field.label || field.key}`,
            };
          }

          // If all required prompts are satisfied, normalize the field value
          const canonicalVal = sanitizedData[valueColumnKey] || userVal;
          sanitizedData[field.key] = canonicalVal;
        }
      }
    }

    return {
      status: 'valid',
      data: sanitizedData,
    };
  }

  /**
   * Resolves the list of dynamic prompts from a SupportDataSpec definition.
   */
  public static resolveDynamicPrompts(dataset: SupportDataSpec): DynamicPromptConfig[] {
    const columns = dataset.columns || [];
    const colMap = new Map<string, SupportDataColumnSpec>();
    for (const col of columns) {
      colMap.set(col.key, col);
    }

    const configs: DynamicPromptConfig[] = [];

    if (Array.isArray(dataset.dynamicPrompts) && dataset.dynamicPrompts.length > 0) {
      for (const prompt of dataset.dynamicPrompts) {
        if (typeof prompt === 'object' && prompt !== null && 'columnKey' in prompt) {
          configs.push({
            columnKey: prompt.columnKey,
            uiLabel: prompt.uiLabel || colMap.get(prompt.columnKey)?.label || capitalize(prompt.columnKey),
            required: Boolean(prompt.required),
          });
        } else if (typeof prompt === 'string') {
          if (colMap.has(prompt)) {
            const col = colMap.get(prompt)!;
            configs.push({
              columnKey: col.key,
              uiLabel: col.label || capitalize(col.key),
              required: Boolean(col.required || col.isPrimaryKey),
            });
          }
        }
      }
    }

    // If dynamicPrompts did not resolve any column configs, derive from dataset.columns
    if (configs.length === 0) {
      for (const col of columns) {
        configs.push({
          columnKey: col.key,
          uiLabel: col.label || capitalize(col.key),
          required: Boolean(col.required || col.isPrimaryKey),
        });
      }
    }

    return configs;
  }
}
