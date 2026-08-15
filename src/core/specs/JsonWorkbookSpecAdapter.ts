/**
 * @file JsonWorkbookSpecAdapter.ts
 * @description Pure Tier 1 JSON serializer and validator for Workbook Base and View specifications.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

import type { DocumentLogWorkbookSpec } from '../config/DocumentLogWorkbookSpec';
import type {
  DocumentLogWorkbookViewSpec,
  ColorRgb,
  LayoutOffsetSpec,
} from '../config/DocumentLogWorkbookViewSpec';

export interface JsonStringifyOptions {
  space?: number;
}

export type WorkbookBaseSpecValidationResult =
  | { status: 'valid'; spec: Partial<DocumentLogWorkbookSpec> }
  | { status: 'invalid'; errors: string[] };

export type WorkbookViewSpecValidationResult =
  | { status: 'valid'; spec: DocumentLogWorkbookViewSpec }
  | { status: 'invalid'; errors: string[] };

export type WorkbookSpecValidationResult =
  | { status: 'valid'; type: 'base'; spec: Partial<DocumentLogWorkbookSpec> }
  | { status: 'valid'; type: 'view'; spec: DocumentLogWorkbookViewSpec }
  | { status: 'invalid'; errors: string[] };

const VALID_VALIDATION_TYPES: Set<string> = new Set([
  'LIST_FROM_RANGE',
  'REGEX_MATCH',
  'DATE_FORMAT',
  'NUMBER_RANGE',
  'CUSTOM_FORMULA',
]);

const REQUIRED_OFFSET_KEYS: Array<keyof LayoutOffsetSpec> = [
  'TITLE_ROW_INDEX',
  'DATE_ROW_INDEX',
  'HEADER_ROW_INDEX',
  'FORMULA_ROW_INDEX',
  'TOP_BUFFER_ROW_INDEX',
  'BUFFER_ROW_INDEX',
  'FIRST_DATA_ROW_INDEX',
  'FIRST_DATA_ROW_OFFSET',
];

export class JsonWorkbookSpecAdapter {
  /**
   * Parses and validates a JSON string or in-memory object as a DocumentLogWorkbookSpec base specification.
   */
  public static parseBaseSpec(jsonInput: string | object): WorkbookBaseSpecValidationResult {
    const parseResult = this.parseInput(jsonInput);
    if (parseResult.status === 'invalid') {
      return parseResult;
    }
    return this.validateBaseSpec(parseResult.parsed);
  }

  /**
   * Parses and validates a JSON string or in-memory object as a DocumentLogWorkbookViewSpec view specification.
   */
  public static parseViewSpec(jsonInput: string | object): WorkbookViewSpecValidationResult {
    const parseResult = this.parseInput(jsonInput);
    if (parseResult.status === 'invalid') {
      return parseResult;
    }
    return this.validateViewSpec(parseResult.parsed);
  }

  /**
   * Polymorphic parse method that dynamically determines whether the input is a base spec or a view spec.
   */
  public static parse(jsonInput: string | object): WorkbookSpecValidationResult {
    const parseResult = this.parseInput(jsonInput);
    if (parseResult.status === 'invalid') {
      return parseResult;
    }

    const parsed = parseResult.parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if ('offsets' in obj || 'headerStyle' in obj || 'titleRowStyle' in obj) {
        const viewRes = this.validateViewSpec(parsed);
        if (viewRes.status === 'valid') {
          return { status: 'valid', type: 'view', spec: viewRes.spec };
        }
        return viewRes;
      }
      if ('schemaVersion' in obj || 'tabs' in obj || 'namedRanges' in obj) {
        const baseRes = this.validateBaseSpec(parsed);
        if (baseRes.status === 'valid') {
          return { status: 'valid', type: 'base', spec: baseRes.spec };
        }
        return baseRes;
      }
    }

    return {
      status: 'invalid',
      errors: [
        'Cannot infer workbook spec type: input does not contain recognized base spec or view spec keys',
      ],
    };
  }

  /**
   * Serializes a DocumentLogWorkbookSpec base specification into a formatted JSON string.
   */
  public static stringifyBaseSpec(
    spec: Partial<DocumentLogWorkbookSpec>,
    options?: JsonStringifyOptions
  ): string {
    const space = options?.space !== undefined ? options.space : 2;
    return JSON.stringify(spec, null, space);
  }

  /**
   * Serializes a DocumentLogWorkbookViewSpec view specification into a formatted JSON string.
   */
  public static stringifyViewSpec(
    spec: DocumentLogWorkbookViewSpec,
    options?: JsonStringifyOptions
  ): string {
    const space = options?.space !== undefined ? options.space : 2;
    return JSON.stringify(spec, null, space);
  }

  /**
   * Helper to parse raw input into an in-memory unknown object.
   */
  private static parseInput(
    jsonInput: string | object
  ): { status: 'valid'; parsed: unknown } | { status: 'invalid'; errors: string[] } {
    if (typeof jsonInput === 'string') {
      try {
        const cleaned = jsonInput.replace(/^\uFEFF/, '').trim();
        return { status: 'valid', parsed: JSON.parse(cleaned) };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          status: 'invalid',
          errors: ['Invalid JSON syntax: ' + message],
        };
      }
    } else if (jsonInput !== null && typeof jsonInput === 'object') {
      return { status: 'valid', parsed: jsonInput };
    }

    return {
      status: 'invalid',
      errors: ['Expected JSON string or object input'],
    };
  }

  /**
   * Validates structural integrity of a base specification.
   */
  private static validateBaseSpec(rawSpec: unknown): WorkbookBaseSpecValidationResult {
    const errors: string[] = [];

    if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) {
      return {
        status: 'invalid',
        errors: ['WorkbookBaseSpec must be a non-null object'],
      };
    }

    const spec = rawSpec as Partial<DocumentLogWorkbookSpec>;

    if (spec.schemaVersion !== undefined) {
      if (typeof spec.schemaVersion !== 'string' || spec.schemaVersion.trim() === '') {
        errors.push("Property 'schemaVersion' must be a non-empty string when defined");
      }
    }

    if (spec.tabs !== undefined) {
      if (!Array.isArray(spec.tabs)) {
        errors.push("Property 'tabs' must be an array of TabSpec");
      } else {
        spec.tabs.forEach((tab, tabIdx) => {
          if (!tab || typeof tab !== 'object' || Array.isArray(tab)) {
            errors.push(`Tab at index ${tabIdx} must be a non-null object`);
            return;
          }

          if (!tab.name || typeof tab.name !== 'string' || tab.name.trim() === '') {
            errors.push(`Tab at index ${tabIdx} has missing or empty tab name`);
          }

          if (typeof tab.rowCount !== 'number' || tab.rowCount < 1) {
            errors.push(`Tab '${tab.name || tabIdx}' has invalid rowCount (must be >= 1)`);
          }

          if (typeof tab.columnCount !== 'number' || tab.columnCount < 1) {
            errors.push(`Tab '${tab.name || tabIdx}' has invalid columnCount (must be >= 1)`);
          }

          if (tab.columns !== undefined) {
            if (!Array.isArray(tab.columns)) {
              errors.push(`Tab '${tab.name || tabIdx}' property 'columns' must be an array`);
            } else {
              tab.columns.forEach((col, colIdx) => {
                if (!col || typeof col !== 'object' || Array.isArray(col)) {
                  errors.push(`Tab '${tab.name}' column at index ${colIdx} must be an object`);
                  return;
                }

                if (!col.id || typeof col.id !== 'string' || col.id.trim() === '') {
                  errors.push(`Tab '${tab.name}' column at index ${colIdx} has missing or empty column id`);
                }

                if (!col.header || typeof col.header !== 'string' || col.header.trim() === '') {
                  errors.push(
                    `Tab '${tab.name}' column '${col.id || colIdx}' has missing or empty column header`
                  );
                }

                if (col.validationRule !== undefined) {
                  if (
                    !col.validationRule ||
                    typeof col.validationRule !== 'object' ||
                    Array.isArray(col.validationRule)
                  ) {
                    errors.push(
                      `Tab '${tab.name}' column '${col.id || colIdx}' has invalid validationRule`
                    );
                  } else {
                    if (
                      !col.validationRule.type ||
                      !VALID_VALIDATION_TYPES.has(col.validationRule.type)
                    ) {
                      errors.push(
                        `Tab '${tab.name}' column '${col.id || colIdx}' has invalid validation rule type '${col.validationRule.type}'`
                      );
                    }
                    if (typeof col.validationRule.allowInvalid !== 'boolean') {
                      errors.push(
                        `Tab '${tab.name}' column '${col.id || colIdx}' validationRule.allowInvalid must be a boolean`
                      );
                    }
                  }
                }
              });
            }
          }

          if (tab.seedRows !== undefined && !Array.isArray(tab.seedRows)) {
            errors.push(`Tab '${tab.name || tabIdx}' property 'seedRows' must be an array`);
          }
        });
      }
    }

    if (spec.namedRanges !== undefined) {
      if (!Array.isArray(spec.namedRanges)) {
        errors.push("Property 'namedRanges' must be an array of NamedRangeSpec");
      } else {
        spec.namedRanges.forEach((nr, nrIdx) => {
          if (!nr || typeof nr !== 'object' || Array.isArray(nr)) {
            errors.push(`NamedRange at index ${nrIdx} must be an object`);
            return;
          }

          if (!nr.name || typeof nr.name !== 'string' || nr.name.trim() === '') {
            errors.push(`NamedRange at index ${nrIdx} has missing or empty namedRange name`);
          }

          if (!nr.tabName || typeof nr.tabName !== 'string' || nr.tabName.trim() === '') {
            errors.push(`NamedRange '${nr.name || nrIdx}' has missing or empty namedRange tabName`);
          }

          if (!nr.rangeNotation || typeof nr.rangeNotation !== 'string' || nr.rangeNotation.trim() === '') {
            errors.push(
              `NamedRange '${nr.name || nrIdx}' has missing or empty namedRange rangeNotation`
            );
          }

          if (nr.scope !== undefined && nr.scope !== 'Workbook' && nr.scope !== 'Sheet') {
            errors.push(
              `NamedRange '${nr.name || nrIdx}' has invalid namedRange scope '${nr.scope}' (must be 'Workbook' or 'Sheet')`
            );
          }
        });
      }
    }

    if (errors.length > 0) {
      return { status: 'invalid', errors };
    }

    return { status: 'valid', spec };
  }

  /**
   * Validates structural integrity of a view specification.
   */
  private static validateViewSpec(rawSpec: unknown): WorkbookViewSpecValidationResult {
    const errors: string[] = [];

    if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) {
      return {
        status: 'invalid',
        errors: ['DocumentLogWorkbookViewSpec must be a non-null object'],
      };
    }

    const spec = rawSpec as Partial<DocumentLogWorkbookViewSpec>;

    // 1. Validate Offsets
    if (!spec.offsets || typeof spec.offsets !== 'object' || Array.isArray(spec.offsets)) {
      errors.push("Missing or invalid required object 'offsets'");
    } else {
      const offsets = spec.offsets as Record<string, unknown>;
      for (const key of REQUIRED_OFFSET_KEYS) {
        if (typeof offsets[key] !== 'number' || isNaN(offsets[key] as number)) {
          errors.push(`offsets.${key} must be a valid number`);
        }
      }
    }

    // 2. Validate Row Styles
    this.validateRowStyle(spec.titleRowStyle, 'titleRowStyle', 'bold', errors);
    this.validateRowStyle(spec.dateRowStyle, 'dateRowStyle', 'italic', errors);
    this.validateRowStyle(spec.headerStyle, 'headerStyle', 'bold', errors);
    this.validateRowStyle(spec.formulaRowStyle, 'formulaRowStyle', 'italic', errors);

    // 3. Validate Column Widths
    if (
      !spec.columnWidths ||
      typeof spec.columnWidths !== 'object' ||
      Array.isArray(spec.columnWidths)
    ) {
      errors.push("Missing or invalid required object 'columnWidths'");
    } else {
      for (const [colKey, width] of Object.entries(spec.columnWidths)) {
        if (typeof width !== 'number' || width <= 0 || isNaN(width)) {
          errors.push(`columnWidths['${colKey}'] must be a positive number`);
        }
      }
    }

    // 4. Validate defaultColumnWidth
    if (
      typeof spec.defaultColumnWidth !== 'number' ||
      spec.defaultColumnWidth <= 0 ||
      isNaN(spec.defaultColumnWidth)
    ) {
      errors.push("Property 'defaultColumnWidth' must be a positive number");
    }

    // 5. Validate defaultFontFamily (optional)
    if (spec.defaultFontFamily !== undefined) {
      if (typeof spec.defaultFontFamily !== 'string' || spec.defaultFontFamily.trim() === '') {
        errors.push("Property 'defaultFontFamily' must be a non-empty string when defined");
      }
    }

    // 6. Validate namedRangeFills (optional)
    if (spec.namedRangeFills !== undefined) {
      if (typeof spec.namedRangeFills !== 'object' || Array.isArray(spec.namedRangeFills)) {
        errors.push("Property 'namedRangeFills' must be an object");
      } else {
        for (const [nrName, color] of Object.entries(spec.namedRangeFills)) {
          this.validateColorRgb(color, `namedRangeFills['${nrName}']`, errors);
        }
      }
    }

    // 7. Validate settingHeaderRanges (optional)
    if (spec.settingHeaderRanges !== undefined) {
      if (
        typeof spec.settingHeaderRanges !== 'object' ||
        Array.isArray(spec.settingHeaderRanges)
      ) {
        errors.push("Property 'settingHeaderRanges' must be an object");
      } else {
        for (const [tabName, ranges] of Object.entries(spec.settingHeaderRanges)) {
          if (!Array.isArray(ranges)) {
            errors.push(`settingHeaderRanges['${tabName}'] must be an array of range strings`);
          } else {
            ranges.forEach((r, idx) => {
              if (typeof r !== 'string' || r.trim() === '') {
                errors.push(`settingHeaderRanges['${tabName}'][${idx}] must be a non-empty string`);
              }
            });
          }
        }
      }
    }

    // 8. Validate statusColors (optional)
    if (spec.statusColors !== undefined) {
      if (typeof spec.statusColors !== 'object' || Array.isArray(spec.statusColors)) {
        errors.push("Property 'statusColors' must be an object");
      } else {
        for (const [statusName, statusConfig] of Object.entries(spec.statusColors)) {
          if (!statusConfig || typeof statusConfig !== 'object' || Array.isArray(statusConfig)) {
            errors.push(`statusColors['${statusName}'] must be an object with hex and rgb`);
          } else {
            if (
              !statusConfig.hex ||
              typeof statusConfig.hex !== 'string' ||
              statusConfig.hex.trim() === ''
            ) {
              errors.push(`statusColors['${statusName}'].hex must be a non-empty hex string`);
            }
            this.validateColorRgb(statusConfig.rgb, `statusColors['${statusName}'].rgb`, errors);
          }
        }
      }
    }

    if (errors.length > 0) {
      return { status: 'invalid', errors };
    }

    return { status: 'valid', spec: spec as DocumentLogWorkbookViewSpec };
  }

  /**
   * Helper to validate a ColorRgb object.
   */
  private static validateColorRgb(rgb: unknown, fieldName: string, errors: string[]): boolean {
    if (!rgb || typeof rgb !== 'object' || Array.isArray(rgb)) {
      errors.push(`${fieldName} must be a ColorRgb object with red, green, and blue numbers`);
      return false;
    }

    const c = rgb as Partial<ColorRgb>;
    let valid = true;

    if (typeof c.red !== 'number' || c.red < 0 || c.red > 1 || isNaN(c.red)) {
      errors.push(`${fieldName}.red must be a number between 0 and 1`);
      valid = false;
    }
    if (typeof c.green !== 'number' || c.green < 0 || c.green > 1 || isNaN(c.green)) {
      errors.push(`${fieldName}.green must be a number between 0 and 1`);
      valid = false;
    }
    if (typeof c.blue !== 'number' || c.blue < 0 || c.blue > 1 || isNaN(c.blue)) {
      errors.push(`${fieldName}.blue must be a number between 0 and 1`);
      valid = false;
    }

    return valid;
  }

  /**
   * Helper to validate standard row style specifications.
   */
  private static validateRowStyle(
    style: unknown,
    styleName: string,
    booleanKey: 'bold' | 'italic',
    errors: string[]
  ): void {
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      errors.push(`Missing or invalid required style object '${styleName}'`);
      return;
    }

    const s = style as Record<string, unknown>;

    if (!s.fillHex || typeof s.fillHex !== 'string' || (s.fillHex as string).trim() === '') {
      errors.push(`${styleName}.fillHex must be a non-empty hex string`);
    }
    this.validateColorRgb(s.fillRgb, `${styleName}.fillRgb`, errors);

    if (
      !s.fontColorHex ||
      typeof s.fontColorHex !== 'string' ||
      (s.fontColorHex as string).trim() === ''
    ) {
      errors.push(`${styleName}.fontColorHex must be a non-empty hex string`);
    }
    this.validateColorRgb(s.fontColorRgb, `${styleName}.fontColorRgb`, errors);

    if (typeof s[booleanKey] !== 'boolean') {
      errors.push(`${styleName}.${booleanKey} must be a boolean`);
    }

    if (typeof s.fontSize !== 'number' || (s.fontSize as number) <= 0 || isNaN(s.fontSize as number)) {
      errors.push(`${styleName}.fontSize must be a positive number`);
    }

    if (!s.fontFamily || typeof s.fontFamily !== 'string' || (s.fontFamily as string).trim() === '') {
      errors.push(`${styleName}.fontFamily must be a non-empty string`);
    }
  }
}