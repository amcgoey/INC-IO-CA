/**
 * @file PicklistResolver.ts
 * @description Tier 1 pure module for sheet-scoped 2D optionsRange picklist option resolution,
 * single-quoted sheet tab qualification retry against DocumentLogWorkbookSpec, defensive exception handling,
 * static JSON fallback defaults, and key normalization (normalizePicklistValue) adhering to ADR 0038.
 */

import { DOCUMENT_LOG_WORKBOOK_SPEC, NamedRangeSpec } from "./DocumentLogWorkbookSpec";
import type { DocumentTypeSpec, PicklistSourceSpec, SupportDataSpec } from "../specs/DocumentTypeSpec";

export interface PicklistOption {
  label: string;
  value: string;
}

export interface PicklistAuditEvent {
  eventType: string;
  details: string;
}

export interface PicklistResolveResult {
  options: PicklistOption[];
  success: boolean;
  isFallback: boolean;
  warningBanner?: string;
  auditEvent?: PicklistAuditEvent;
}

export interface MinimalFieldSpec {
  key: string;
  label?: string;
  optionsRange?: string;
  options?: PicklistOption[];
  picklistSource?: PicklistSourceSpec;
  keyNormalizationRule?: "picklist" | "code" | "exact";
}

export interface PicklistResolutionContext {
  spec?: DocumentTypeSpec | null;
  supportData?: Record<string, SupportDataSpec>;
  spreadsheet?: SpreadsheetLike | null;
  docTypeKey?: string;
  activeSheetName?: string;
  logSettings?: Record<string, any>;
  fieldSpec?: MinimalFieldSpec;
  [key: string]: any;
}

export interface SpreadsheetRangeLike {
  getValues(): unknown[][];
}

export interface SpreadsheetSheetLike {
  getName(): string;
  getRange(rangeNotation: string): SpreadsheetRangeLike | null;
}

export interface SpreadsheetLike {
  getRangeByName(name: string): SpreadsheetRangeLike | null;
  getSheetByName(name: string): SpreadsheetSheetLike | null;
}

const DEFAULT_CONTACTS_LIST = [
  { abbr: "ARCH", name: "Architect" },
  { abbr: "GC", name: "General Contractor" },
  { abbr: "CLIENT", name: "Client" },
  { abbr: "MEP", name: "MEP Engineer" },
  { abbr: "STR", name: "Structural Engineer" }
];

const DEFAULT_ACTIONS_LIST = [
  { action: "Received", abbr: "REC", status: "Incoming" },
  { action: "Reviewed", abbr: "REV", status: "Outgoing" },
  { action: "Referred", abbr: "REF", status: "Outgoing" },
  { action: "Rejected", abbr: "REJ", status: "Outgoing" }
];

export class PicklistResolver {
  /**
   * Generic resolution seam for picklist options based on configuration.
   * Resolves options from supportData, spreadsheet named ranges, or logSettings,
   * dynamically appending hydrated draftValue as a fallback option when missing to prevent data loss.
   */
  public static resolve(
    picklistSource?: PicklistSourceSpec,
    context?: PicklistResolutionContext,
    draftValue?: any
  ): PicklistResolveResult {
    let resolvedOptions: PicklistOption[] = [];
    let isSuccess = false;
    let isFallback = false;

    const field = context?.fieldSpec;
    const supportDataKey = picklistSource?.supportDataKey;
    const valueColKey = picklistSource?.valueColumnKey;
    const displayColKey = picklistSource?.displayColumnKey;

    // 1. Resolve from context.supportData or context.spec.supportData
    const datasets = context?.supportData || context?.spec?.supportData;
    if (supportDataKey && datasets && datasets[supportDataKey]) {
      const dataset = datasets[supportDataKey];
      if (Array.isArray(dataset.items) && dataset.items.length > 0) {
        resolvedOptions = dataset.items
          .map((item: Record<string, any>) => {
            const rawVal = valueColKey && item[valueColKey] !== undefined && item[valueColKey] !== null
              ? String(item[valueColKey]).trim()
              : '';
            const rawLabel = displayColKey && item[displayColKey] !== undefined && item[displayColKey] !== null && String(item[displayColKey]).trim() !== ''
              ? String(item[displayColKey]).trim()
              : rawVal;
            return {
              value: rawVal,
              label: rawLabel || rawVal
            };
          })
          .filter(opt => opt.value !== '');

        if (resolvedOptions.length > 0) {
          isSuccess = true;
        }
      }
    }

    // 2. Resolve from context.spreadsheet via named range matching supportDataKey
    if (!isSuccess && supportDataKey && context?.spreadsheet) {
      const docTypeKey = context.docTypeKey || context.spec?.key || 'Submittal_Arch';
      const activeSheetName = context.activeSheetName || context.spec?.label || context.spec?.name || 'Submittal Arch';
      const rangeResult = PicklistResolver.resolvePicklistOptionsRange(
        supportDataKey,
        context.spreadsheet,
        docTypeKey,
        activeSheetName,
        field
      );
      if (rangeResult && rangeResult.options && rangeResult.options.length > 0 && rangeResult.success) {
        resolvedOptions = rangeResult.options;
        isSuccess = true;
      }
    }

    // 3. Resolve from field.optionsRange if defined
    if (!isSuccess && field?.optionsRange && context?.spreadsheet) {
      const docTypeKey = context.docTypeKey || context.spec?.key || 'Submittal_Arch';
      const activeSheetName = context.activeSheetName || context.spec?.label || context.spec?.name || 'Submittal Arch';
      const rangeResult = PicklistResolver.resolvePicklistOptionsRange(
        field.optionsRange,
        context.spreadsheet,
        docTypeKey,
        activeSheetName,
        field
      );
      if (rangeResult && rangeResult.options && rangeResult.options.length > 0 && rangeResult.success) {
        resolvedOptions = rangeResult.options;
        isSuccess = true;
      }
    }

    // 4. Resolve from context.logSettings
    if (!isSuccess && context?.logSettings) {
      const logSettings = context.logSettings;
      const keyLower = (supportDataKey || field?.key || '').toLowerCase();

      if (keyLower.includes('contact')) {
        const contacts = logSettings.contacts && logSettings.contacts.length > 0
          ? logSettings.contacts
          : DEFAULT_CONTACTS_LIST;
        resolvedOptions = contacts.map((c: any) => ({
          value: String(c.abbr || c.code || c.value || ''),
          label: c.name ? `${c.abbr || c.code} - ${c.name}` : String(c.abbr || c.code || '')
        })).filter((o: PicklistOption) => o.value !== '');
        if (resolvedOptions.length > 0) isSuccess = true;
      } else if (keyLower.includes('action')) {
        const actions = logSettings.actions && logSettings.actions.length > 0
          ? logSettings.actions
          : DEFAULT_ACTIONS_LIST;
        resolvedOptions = actions.map((a: any) => ({
          value: String(a.action || a.code || a.value || ''),
          label: String(a.action || a.name || a.label || a.value || '')
        })).filter((o: PicklistOption) => o.value !== '');
        if (resolvedOptions.length > 0) isSuccess = true;
      } else if (keyLower.includes('vendor')) {
        const vendors = logSettings.ffeTags?.vendors;
        if (Array.isArray(vendors) && vendors.length > 0) {
          resolvedOptions = vendors.map((v: string) => ({
            value: String(v),
            label: String(v)
          }));
          if (resolvedOptions.length > 0) isSuccess = true;
        }
      } else if (keyLower.includes('spectag') || keyLower.includes('tag')) {
        const tags = logSettings.ffeTags?.tags;
        if (Array.isArray(tags) && tags.length > 0) {
          resolvedOptions = tags.map((t: string) => ({
            value: String(t),
            label: String(t)
          }));
          if (resolvedOptions.length > 0) isSuccess = true;
        }
      }
    }

    // 5. Fallback to field.options if defined
    if (!isSuccess && field?.options && Array.isArray(field.options) && field.options.length > 0) {
      resolvedOptions = field.options.map((opt: any) => ({
        value: String(opt.value ?? ''),
        label: String(opt.label ?? opt.value ?? '')
      }));
      isSuccess = true;
    }

    if (!isSuccess && resolvedOptions.length === 0) {
      isFallback = true;
    }

    // 6. Draft Value Fallback Injection:
    // If a hydrated draftValue is not present in the resolved options list, dynamically append it as a fallback option
    if (draftValue !== undefined && draftValue !== null) {
      const draftValStr = String(draftValue).trim();
      if (draftValStr !== '') {
        const exists = resolvedOptions.some(
          opt => opt.value === draftValStr || opt.label === draftValStr
        );
        if (!exists) {
          resolvedOptions.push({
            value: draftValStr,
            label: draftValStr
          });
        }
      }
    }

    return {
      options: resolvedOptions,
      success: isSuccess,
      isFallback
    };
  }

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

      let rawVal = '';
      let rawLabel = '';

      if (row.length === 1) {
        rawVal = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
        rawLabel = rawVal;
      } else if (row.length === 2) {
        rawVal = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
        rawLabel = row[1] !== undefined && row[1] !== null && String(row[1]).trim() !== ''
          ? String(row[1]).trim()
          : rawVal;
      } else {
        const col0Str = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
        const col1Str = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
        const col2Str = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : '';

        if (/^\d+$/.test(col0Str) && col1Str) {
          rawVal = col1Str;
          rawLabel = col1Str;
        } else if (col2Str && (col2Str.includes('@') || col0Str.toLowerCase() === 'arch' || col0Str.toLowerCase() === 'ffe')) {
          rawVal = col2Str;
          rawLabel = col2Str;
        } else {
          rawVal = col0Str || col1Str || col2Str;
          rawLabel = col1Str || col2Str || rawVal;
        }
      }

      if (!rawVal) continue;

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
    const fallbackOptions: PicklistOption[] = (fieldSpec && Array.isArray(fieldSpec.options))
      ? fieldSpec.options
      : [];

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

    const specRanges: NamedRangeSpec[] = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges || [];
    const matchedSpec = specRanges.find(r => r.name === bareRangeName || r.name === cleanRangeStr);
    if (matchedSpec && matchedSpec.tabName) {
      candidateTabNames.push(matchedSpec.tabName);
    }

    if (activeSheetName && !candidateTabNames.includes(activeSheetName)) {
      candidateTabNames.push(activeSheetName);
    }

    if (matchedSpec && matchedSpec.tabName && matchedSpec.rangeNotation && spreadsheet && typeof spreadsheet.getSheetByName === 'function') {
      try {
        const specSheet = spreadsheet.getSheetByName(matchedSpec.tabName);
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
        // Proceed to loop
      }
    }

    for (const tabName of candidateTabNames) {
      try {
        // Google Sheets range syntax doubles single quotes inside tab names
        const escapedTabName = tabName.replace(/'/g, "''");
        const qualifiedName = `'${escapedTabName}'!${bareRangeName}`;
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
    const auditEvent: PicklistAuditEvent = {
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
      const codePart = rawVal.split(/\s+-\s+|\s+-(?=[A-Za-z])/)[0];
      return codePart.replace(/[\s.-]+/g, '').toUpperCase();
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

declare let module: { exports?: unknown };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PicklistResolver
  };
}
