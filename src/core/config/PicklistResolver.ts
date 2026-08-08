/**
 * @file PicklistResolver.ts
 * @description Tier 1 pure module for sheet-scoped 2D optionsRange picklist option resolution,
 * single-quoted sheet tab qualification retry against DocumentLogWorkbookSpec, defensive exception handling,
 * static JSON fallback defaults, and key normalization (normalizePicklistValue) adhering to ADR 0038.
 */

import { DOCUMENT_LOG_WORKBOOK_SPEC, NamedRangeSpec } from "./DocumentLogWorkbookSpec";

export interface PicklistOption {
  label: string;
  value: string;
}

export interface PicklistResolveResult {
  options: PicklistOption[];
  success: boolean;
  isFallback: boolean;
  warningBanner?: string;
  auditEvent?: {
    eventType: string;
    details: string;
  };
}

export interface MinimalFieldSpec {
  key: string;
  label?: string;
  optionsRange?: string;
  options?: PicklistOption[];
  keyNormalizationRule?: "picklist" | "code" | "exact";
}

export interface SpreadsheetRangeLike {
  getValues(): unknown[][];
}

export interface SpreadsheetLike {
  getRangeByName(name: string): SpreadsheetRangeLike | null;
}

export class PicklistResolver {
  /**
   * Transforms a 2D range array into PicklistOption[].
   * row[0] = value (canonical key)
   * row[1] = label (display text, defaults to row[0] if omitted/blank)
   */
  public static resolveFrom2DArray(rows: unknown[][]): PicklistOption[] {
    if (!rows || !Array.isArray(rows)) return [];
    const options: PicklistOption[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row) || row.length === 0) continue;
      const rawVal = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
      if (!rawVal) continue;

      const rawLabel = row.length > 1 && row[1] !== undefined && row[1] !== null && String(row[1]).trim() !== ''
        ? String(row[1]).trim()
        : rawVal;

      options.push({ value: rawVal, label: rawLabel });
    }

    return options;
  }

  /**
   * Resolves options range using 3-tier lookup sequence:
   * Tier 1: Direct getRangeByName(optionsRange)
   * Tier 2: Tab-qualification retry against DocumentLogWorkbookSpec & active sheet
   * Tier 3: Defensive exception handling, diagnostic audit logging, JSON field options fallback & warning banner
   */
  public static resolvePicklistOptionsRange(
    optionsRange: string | undefined,
    spreadsheet: SpreadsheetLike | null | undefined,
    docTypeKey: string = 'Submittal_Arch',
    activeSheetName: string = 'Submittal Arch',
    fieldSpec?: MinimalFieldSpec
  ): PicklistResolveResult {
    const fallbackOptions: PicklistOption[] = (fieldSpec && Array.isArray(fieldSpec.options) && fieldSpec.options.length > 0)
      ? fieldSpec.options
      : [
          { value: "DEFAULT_1", label: "Default Option 1" },
          { value: "DEFAULT_2", label: "Default Option 2" }
        ];

    if (!optionsRange || typeof optionsRange !== 'string' || optionsRange.trim() === '') {
      return {
        options: fallbackOptions,
        success: false,
        isFallback: true
      };
    }

    const cleanRangeStr = optionsRange.trim();
    const bareRangeName = cleanRangeStr.includes('!')
      ? cleanRangeStr.split('!')[1].replace(/^'|'$/g, '')
      : cleanRangeStr;

    // Tier 1: Direct getRangeByName lookup
    try {
      if (spreadsheet && typeof spreadsheet.getRangeByName === 'function') {
        const range = spreadsheet.getRangeByName(cleanRangeStr);
        if (range && typeof range.getValues === 'function') {
          const values = range.getValues();
          const options = PicklistResolver.resolveFrom2DArray(values);
          if (options.length > 0) {
            return { options, success: true, isFallback: false };
          }
        }
      }
    } catch (_err) {
      // Catch and proceed to Tier 2
    }

    // Tier 2: Retry with sheet qualification from DocumentLogWorkbookSpec or active sheet
    const candidateTabNames: string[] = [];

    // Check DocumentLogWorkbookSpec namedRanges matching bareRangeName
    const specRanges: NamedRangeSpec[] = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges || [];
    const matchedSpec = specRanges.find(r => r.name === bareRangeName || r.name === cleanRangeStr);
    if (matchedSpec && matchedSpec.tabName) {
      candidateTabNames.push(matchedSpec.tabName);
    }

    if (activeSheetName && !candidateTabNames.includes(activeSheetName)) {
      candidateTabNames.push(activeSheetName);
    }

    if (matchedSpec && matchedSpec.tabName && matchedSpec.rangeNotation && spreadsheet && typeof (spreadsheet as any).getSheetByName === 'function') {
      try {
        const specSheet = (spreadsheet as any).getSheetByName(matchedSpec.tabName);
        if (specSheet && typeof specSheet.getRange === 'function') {
          const range = specSheet.getRange(matchedSpec.rangeNotation);
          if (range && typeof range.getValues === 'function') {
            const values = range.getValues();
            const options = PicklistResolver.resolveFrom2DArray(values);
            if (options.length > 0) {
              return { options, success: true, isFallback: false };
            }
          }
        }
      } catch (_err) {
        // Proceed
      }
    }

    for (const tabName of candidateTabNames) {
      try {
        const qualifiedName = `'${tabName.replace(/'/g, "\\'")}'!${bareRangeName}`;
        if (spreadsheet && typeof spreadsheet.getRangeByName === 'function') {
          const range = spreadsheet.getRangeByName(qualifiedName);
          if (range && typeof range.getValues === 'function') {
            const values = range.getValues();
            const options = PicklistResolver.resolveFrom2DArray(values);
            if (options.length > 0) {
              return { options, success: true, isFallback: false };
            }
          }
        }
      } catch (_err) {
        // Continue trying remaining candidate tabs
      }
    }

    // Tier 3: Defensive exception handling, diagnostic audit logging, JSON field options fallback
    const auditEvent = {
      eventType: "AUDIT_EVENT_MISSING_OPTIONS_RANGE",
      details: `Options range '${cleanRangeStr}' missing or invalid for docType '${docTypeKey}'. Displaying fallback options.`
    };

    const warningBanner = `⚠️ Options range '${cleanRangeStr}' is missing or invalid. Displaying fallback defaults.`;

    return {
      options: fallbackOptions,
      success: false,
      isFallback: true,
      warningBanner,
      auditEvent
    };
  }

  /**
   * Performs key normalization according to ADR 0038 rules:
   * 'picklist': Case-insensitive match against option label -> canonical value
   * 'code': Strips whitespace and extracts leading section code before dashes
   * 'exact': Trim + uppercase matching only
   */
  public static normalizePicklistValue(value: string, fieldSpec?: MinimalFieldSpec): string {
    if (!value || typeof value !== 'string') return '';
    const rawVal = value.trim();
    if (!rawVal) return '';

    const rule = (fieldSpec && fieldSpec.keyNormalizationRule) ? fieldSpec.keyNormalizationRule : 'picklist';

    if (rule === 'code') {
      const beforeDash = rawVal.split('-')[0].replace(/\s+/g, '');
      return beforeDash.toUpperCase();
    }

    if (rule === 'exact') {
      return rawVal.toUpperCase();
    }

    // Default 'picklist' rule
    if (fieldSpec && Array.isArray(fieldSpec.options)) {
      const lowerInput = rawVal.toLowerCase();
      for (const opt of fieldSpec.options) {
        if (opt.label && opt.label.toLowerCase() === lowerInput) {
          return opt.value;
        }
        if (opt.value && opt.value.toLowerCase() === lowerInput) {
          return opt.value;
        }
      }
    }

    return rawVal.toUpperCase();
  }
}

declare var module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PicklistResolver
  };
}

(globalThis as any).PicklistResolver = PicklistResolver;
