/**
 * @file PicklistResolver.ts
 * @description Tier 1 pure module for sheet-scoped 2D optionsRange picklist option resolution,
 * single-quoted sheet tab qualification retry against DocumentLogWorkbookSpec, defensive exception handling,
 * static JSON fallback defaults, and key normalization (normalizePicklistValue) adhering to ADR 0038.
 */

import { NamedRangeSpec, DocumentLogWorkbookSpec } from "./DocumentLogWorkbookSpec";
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
  type?: string;
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

export class PicklistResolver {
  /**
   * Dynamically appends unlisted draftValue tokens as valid fallback PicklistOption entries
   * when not already present in the options list.
   */
  public static injectDraftValue(
    options: PicklistOption[],
    draftValue: any,
    fieldSpec?: MinimalFieldSpec
  ): PicklistOption[] {
    if (draftValue === undefined || draftValue === null) {
      return options;
    }

    const tokens: string[] = [];
    if (Array.isArray(draftValue)) {
      tokens.push(...draftValue.map(v => String(v).trim()).filter(Boolean));
    } else if (typeof draftValue === 'string' && fieldSpec?.type === 'multi_select') {
      tokens.push(...draftValue.split(',').map(s => s.trim()).filter(Boolean));
    } else {
      const single = String(draftValue).trim();
      if (single !== '') {
        tokens.push(single);
      }
    }

    const result = [...options];
    for (const token of tokens) {
      const exists = result.some(
        opt => opt.value === token || opt.label === token
      );
      if (!exists) {
        result.push({
          value: token,
          label: token
        });
      }
    }
    return result;
  }

  /**
   * Helper extracting picklist options from repository logSettings (Tier 2).
   */
  public static resolveFromLogSettings(
    logSettings: Record<string, any> | undefined,
    picklistSource?: PicklistSourceSpec,
    field?: MinimalFieldSpec
  ): PicklistOption[] {
    if (!logSettings) return [];

    const supportDataKey = picklistSource?.supportDataKey;
    const fieldKey = (field?.key || '').toLowerCase();
    const sKey = (supportDataKey || '').toLowerCase();
    const valCol = picklistSource?.valueColumnKey;
    const dispCol = picklistSource?.displayColumnKey;

    // 1. Contacts
    if (fieldKey === 'contact' || sKey.includes('contact')) {
      if (Array.isArray(logSettings.contacts) && logSettings.contacts.length > 0) {
        return logSettings.contacts
          .map((c: any) => {
            const val = (valCol && c[valCol] !== undefined)
              ? String(c[valCol]).trim()
              : String(c.abbr || c.code || c.name || '').trim();
            const label = (dispCol && c[dispCol] !== undefined)
              ? String(c[dispCol]).trim()
              : String(c.name || c.label || val).trim();
            return { value: val, label: label || val };
          })
          .filter((opt: PicklistOption) => opt.value !== '');
      }
    }

    // 2. Actions
    if (fieldKey === 'action' || sKey.includes('action')) {
      if (Array.isArray(logSettings.actions) && logSettings.actions.length > 0) {
        return logSettings.actions
          .map((a: any) => {
            const val = (valCol && a[valCol] !== undefined)
              ? String(a[valCol]).trim()
              : String(a.action || a.abbr || a.name || '').trim();
            const label = (dispCol && a[dispCol] !== undefined)
              ? String(a[dispCol]).trim()
              : String(a.action || a.label || val).trim();
            return { value: val, label: label || val };
          })
          .filter((opt: PicklistOption) => opt.value !== '');
      }
    }

    // 3. Statuses
    if (fieldKey === 'status' || sKey.includes('status')) {
      const statuses = logSettings.statuses;
      if (Array.isArray(statuses) && statuses.length > 0) {
        return statuses
          .map((s: any) => {
            if (typeof s === 'string') return { value: s.trim(), label: s.trim() };
            const val = (valCol && s[valCol] !== undefined)
              ? String(s[valCol]).trim()
              : String(s.status || s.name || s.key || '').trim();
            const label = (dispCol && s[dispCol] !== undefined)
              ? String(s[dispCol]).trim()
              : String(s.label || s.status || val).trim();
            return { value: val, label: label || val };
          })
          .filter((opt: PicklistOption) => opt.value !== '');
      }
    }

    // 4. Vendors (ffeTags.vendors or logSettings.vendors)
    if (fieldKey === 'vendor' || sKey.includes('vendor')) {
      const vendors = logSettings.ffeTags?.vendors || logSettings.vendors;
      if (Array.isArray(vendors) && vendors.length > 0) {
        return vendors
          .map((v: any) => {
            if (typeof v === 'string') return { value: v.trim(), label: v.trim() };
            const val = (valCol && v[valCol] !== undefined)
              ? String(v[valCol]).trim()
              : String(v.code || v.vendor || v.name || '').trim();
            const label = (dispCol && v[dispCol] !== undefined)
              ? String(v[dispCol]).trim()
              : String(v.name || v.vendor || val).trim();
            return { value: val, label: label || val };
          })
          .filter((opt: PicklistOption) => opt.value !== '');
      }
    }

    // 5. SpecTags (ffeTags.tags or logSettings.specTags)
    if (fieldKey === 'spectag' || fieldKey === 'relatedtag' || sKey.includes('spectag')) {
      const tags = logSettings.ffeTags?.tags || logSettings.specTags;
      if (Array.isArray(tags) && tags.length > 0) {
        return tags
          .map((t: any) => {
            if (typeof t === 'string') return { value: t.trim(), label: t.trim() };
            const val = (valCol && t[valCol] !== undefined)
              ? String(t[valCol]).trim()
              : String(t.tag || t.code || t.name || '').trim();
            const label = (dispCol && t[dispCol] !== undefined)
              ? String(t[dispCol]).trim()
              : String(t.tag || t.name || val).trim();
            return { value: val, label: label || val };
          })
          .filter((opt: PicklistOption) => opt.value !== '');
      }
    }

    // 6. Generic lookup in logSettings matching supportDataKey or fieldKey
    const genericKey = supportDataKey || field?.key;
    if (genericKey && Array.isArray(logSettings[genericKey]) && logSettings[genericKey].length > 0) {
      return logSettings[genericKey]
        .map((item: any) => {
          if (typeof item === 'string') return { value: item.trim(), label: item.trim() };
          const val = (valCol && item[valCol] !== undefined)
            ? String(item[valCol]).trim()
            : String(item.value || item.key || item.code || '').trim();
          const label = (dispCol && item[dispCol] !== undefined)
            ? String(item[dispCol]).trim()
            : String(item.label || item.name || val).trim();
          return { value: val, label: label || val };
        })
        .filter((opt: PicklistOption) => opt.value !== '');
    }

    return [];
  }

  /**
   * Generic resolution seam for picklist options based on 3-tier precedence:
   * Tier 1: Live Workbook Named Ranges (Primary)
   * Tier 2: Repository Settings logSettings (Secondary)
   * Tier 3: Static JSON seed defaults supportData[key].items / field.options (Tertiary)
   * Dynamically appends hydrated draftValue as a fallback option when missing to prevent data loss.
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
    const docTypeKey = context?.docTypeKey || context?.spec?.key || 'Submittal_Arch';
    const activeSheetName = context?.activeSheetName || context?.spec?.label || context?.spec?.name || 'Submittal Arch';
    const namedRanges = context?.namedRanges || context?.spec?.namedRanges;

    // Helper to collect candidate range names for spreadsheet querying (Tier 1)
    const collectCandidateRanges = (): string[] => {
      const candidates: string[] = [];
      const add = (r?: string) => {
        if (r && typeof r === 'string' && r.trim() !== '' && !candidates.includes(r.trim())) {
          candidates.push(r.trim());
        }
      };

      // 1. Direct field optionsRange
      if (field?.optionsRange) add(field.optionsRange);

      // 2. targetNamedRange from validationRule (ADR-0047)
      if (field?.validationRule?.targetNamedRange) add(field.validationRule.targetNamedRange);

      // 3. Dedicated ADR-0047 single-column and multi-column named ranges
      const isFFE = docTypeKey.toLowerCase().includes('ffe') ||
                    activeSheetName.toLowerCase().includes('ffe') ||
                    (supportDataKey || '').toLowerCase().includes('ffe');

      const fieldKey = (field?.key || '').toLowerCase();
      const sKey = (supportDataKey || '').toLowerCase();

      if (fieldKey === 'contact' || sKey.includes('contact')) {
        if (isFFE) {
          add('Shared_Contacts_FFE_Keys');
          add('Shared_Contacts_FFE');
          add('Contacts_FFE_Keys');
          add('Contacts_FFE');
        } else {
          add('Shared_Contacts_Arch_Keys');
          add('Shared_Contacts_Arch');
          add('Contacts_Arch_Keys');
          add('Contacts_Arch');
        }
      }

      if (fieldKey === 'action' || sKey.includes('action')) {
        add('Actions_Submittal_Labels');
        add('Actions_Submittal');
        add('Actions_Labels');
        add('Actions');
      }

      if (fieldKey === 'status' || sKey.includes('status')) {
        add('Statuses_Submittal_Labels');
        add('Statuses_Submittal');
        add('Statuses_Labels');
        add('Statuses');
      }

      if (fieldKey === 'vendor' || sKey.includes('vendor')) {
        add('Vendors_Keys');
        add('Vendors');
      }

      if (fieldKey === 'spectag' || fieldKey === 'relatedtag' || sKey.includes('spectag')) {
        add('SpecTags_Keys');
        add('SpecTags');
      }

      // 4. supportDataKey if not already added
      if (supportDataKey) add(supportDataKey);

      return candidates;
    };

    // Tier 1: Query live spreadsheet Named Ranges as primary priority
    if (context?.spreadsheet) {
      const candidateRanges = collectCandidateRanges();
      for (const rangeName of candidateRanges) {
        const rangeResult = PicklistResolver.resolvePicklistOptionsRange(
          rangeName,
          context.spreadsheet,
          docTypeKey,
          activeSheetName,
          field,
          namedRanges
        );
        if (rangeResult && rangeResult.options && rangeResult.options.length > 0 && rangeResult.success) {
          resolvedOptions = rangeResult.options;
          isSuccess = true;
          break;
        }
      }
    }

    // Tier 2: Query repository logSettings as secondary priority
    if (!isSuccess && context?.logSettings) {
      const logOptions = PicklistResolver.resolveFromLogSettings(context.logSettings, picklistSource, field);
      if (logOptions.length > 0) {
        resolvedOptions = logOptions;
        isSuccess = true;
      }
    }

    // Tier 3: Fall back to static JSON seed defaults strictly for offline execution or when live resolution yields zero items
    if (!isSuccess) {
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
            .filter((opt: PicklistOption) => opt.value !== '');

          if (resolvedOptions.length > 0) {
            isSuccess = true;
          }
        }
      }
    }

    // Tier 3b: Fall back to field.options if defined
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

    // Draft Value Fallback Injection:
    // If a hydrated draftValue is not present in the resolved options list, dynamically append it as a fallback option
    resolvedOptions = PicklistResolver.injectDraftValue(resolvedOptions, draftValue, field);

    return {
      options: resolvedOptions,
      success: isSuccess,
      isFallback
    };
  }

  /**
   * Alias for PicklistResolver.resolve matching Ticket #306 specification.
   */
  public static resolveOptions(
    picklistSource?: PicklistSourceSpec,
    context?: PicklistResolutionContext,
    draftValue?: any
  ): PicklistResolveResult {
    return PicklistResolver.resolve(picklistSource, context, draftValue);
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
   * Tier 1: Direct getRangeByName(optionsRange), ADR-0047 single-column range lookups, direct <Tab>!<Range> parsing
   * Tier 2: Tab-qualification retry against DocumentLogWorkbookSpec, active sheet, and standard support tabs
   * Tier 3: Defensive exception handling, diagnostic audit logging, JSON field options fallback & warning banner
   * Dynamically injects unlisted draftValue when supplied to prevent UI selection drop.
   */
  public static resolvePicklistOptionsRange(
    optionsRange: string | undefined,
    spreadsheet: SpreadsheetLike | null | undefined,
    docTypeKey: string = 'Submittal_Arch',
    activeSheetName: string = 'Submittal Arch',
    fieldSpec?: MinimalFieldSpec,
    namedRanges?: NamedRangeSpec[],
    draftValue?: any
  ): PicklistResolveResult {
    const fallbackOptions: PicklistOption[] = (fieldSpec && Array.isArray(fieldSpec.options))
      ? fieldSpec.options
      : [];

    if (!optionsRange || typeof optionsRange !== 'string' || optionsRange.trim() === '') {
      return {
        options: PicklistResolver.injectDraftValue(fallbackOptions, draftValue, fieldSpec),
        success: false,
        isFallback: true
      };
    }

    const cleanRangeStr = optionsRange.trim();
    const bareRangeName = cleanRangeStr.includes('!')
      ? cleanRangeStr.split('!')[1].replace(/^'|'$/g, '')
      : cleanRangeStr;

    // ADR-0047 synonym map for dedicated single-column vs multi-column ranges
    const rangeSynonyms: Record<string, string[]> = {
      'Shared_Contacts_Arch': ['Shared_Contacts_Arch_Keys'],
      'Shared_Contacts_Arch_Keys': ['Shared_Contacts_Arch'],
      'Shared_Contacts_FFE': ['Shared_Contacts_FFE_Keys'],
      'Shared_Contacts_FFE_Keys': ['Shared_Contacts_FFE'],
      'Actions_Submittal': ['Actions_Submittal_Labels'],
      'Actions_Submittal_Labels': ['Actions_Submittal'],
      'Statuses_Submittal': ['Statuses_Submittal_Labels'],
      'Statuses_Submittal_Labels': ['Statuses_Submittal'],
      'Vendors': ['Vendors_Keys'],
      'Vendors_Keys': ['Vendors'],
      'SpecTags': ['SpecTags_Keys'],
      'SpecTags_Keys': ['SpecTags']
    };

    const candidateRangeNames: string[] = [cleanRangeStr];
    if (bareRangeName !== cleanRangeStr) {
      candidateRangeNames.push(bareRangeName);
    }
    const synonyms = rangeSynonyms[bareRangeName] || rangeSynonyms[cleanRangeStr] || [];
    for (const syn of synonyms) {
      if (!candidateRangeNames.includes(syn)) {
        candidateRangeNames.push(syn);
      }
    }

    // Tier 1: Direct getRangeByName lookup across candidate names and ADR-0047 synonyms
    for (const rName of candidateRangeNames) {
      try {
        if (spreadsheet && typeof spreadsheet.getRangeByName === 'function') {
          const range = spreadsheet.getRangeByName(rName);
          if (range && typeof range.getValues === 'function') {
            const values = range.getValues();
            const options = PicklistResolver.resolveFrom2DArray(values);
            if (options.length > 0) {
              return {
                options: PicklistResolver.injectDraftValue(options, draftValue, fieldSpec),
                success: true,
                isFallback: false
              };
            }
          }
        }
      } catch (_err) {
        // Proceed
      }
    }

    // Direct sheet qualification if notation contains "!" (e.g. "_Shared!F2:F3" or "'Submittal FFE Support'!A2:A50")
    if (cleanRangeStr.includes('!') && spreadsheet && typeof spreadsheet.getSheetByName === 'function') {
      const match = cleanRangeStr.match(/^(?:'([^']+)'|([^!]+))!(.+)$/);
      if (match) {
        const tabName = match[1] || match[2];
        const notation = match[3];
        try {
          const sheet = spreadsheet.getSheetByName(tabName);
          if (sheet && typeof sheet.getRange === 'function') {
            const range = sheet.getRange(notation);
            if (range && typeof range.getValues === 'function') {
              const values = range.getValues();
              const options = PicklistResolver.resolveFrom2DArray(values);
              if (options.length > 0) {
                return {
                  options: PicklistResolver.injectDraftValue(options, draftValue, fieldSpec),
                  success: true,
                  isFallback: false
                };
              }
            }
          }
        } catch (_err) {
          // Proceed
        }
      }
    }

    // Tier 2: Retry with sheet qualification from DocumentLogWorkbookSpec, active sheet, or standard support tabs
    const candidateTabNames: string[] = [];

    const specRanges: NamedRangeSpec[] = namedRanges || [];
    const matchedSpec = specRanges.find(r => r.name === bareRangeName || r.name === cleanRangeStr);
    if (matchedSpec && matchedSpec.tabName) {
      candidateTabNames.push(matchedSpec.tabName);
    }

    if (activeSheetName && !candidateTabNames.includes(activeSheetName)) {
      candidateTabNames.push(activeSheetName);
    }

    // Standard support tabs per ADR-0047 and MVT architecture
    const standardTabs = ["_Shared", "Submittal FFE Support", "Settings", "Tag List"];
    for (const stdTab of standardTabs) {
      if (!candidateTabNames.includes(stdTab)) {
        candidateTabNames.push(stdTab);
      }
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
              return {
                options: PicklistResolver.injectDraftValue(options, draftValue, fieldSpec),
                success: true,
                isFallback: false
              };
            }
          }
        }
      } catch (_err) {
        // Proceed to loop
      }
    }

    const candidateBares: string[] = [bareRangeName, ...synonyms];
    for (const tabName of candidateTabNames) {
      for (const bare of candidateBares) {
        try {
          // Google Sheets range syntax doubles single quotes inside tab names
          const escapedTabName = tabName.replace(/'/g, "''");
          const qualifiedName = `'${escapedTabName}'!${bare}`;
          if (spreadsheet && typeof spreadsheet.getRangeByName === 'function') {
            const range = spreadsheet.getRangeByName(qualifiedName);
            if (range && typeof range.getValues === 'function') {
              const values = range.getValues();
              const options = PicklistResolver.resolveFrom2DArray(values);
              if (options.length > 0) {
                return {
                  options: PicklistResolver.injectDraftValue(options, draftValue, fieldSpec),
                  success: true,
                  isFallback: false
                };
              }
            }
          }
        } catch (_err) {
          // Continue trying remaining candidate tabs
        }
      }
    }

    // Tier 3: Defensive exception handling, diagnostic audit logging, JSON field options fallback
    const auditEvent: PicklistAuditEvent = {
      eventType: "AUDIT_EVENT_MISSING_OPTIONS_RANGE",
      details: `Options range '${cleanRangeStr}' missing or invalid for docType '${docTypeKey}'. Displaying fallback options.`
    };

    const warningBanner = `⚠️ Options range '${cleanRangeStr}' is missing or invalid. Displaying fallback defaults.`;

    return {
      options: PicklistResolver.injectDraftValue(fallbackOptions, draftValue, fieldSpec),
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
