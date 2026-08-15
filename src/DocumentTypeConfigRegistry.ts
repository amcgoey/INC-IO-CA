/// <reference path="./types.ts" />
/**
 * @file DocumentTypeConfigRegistry.ts
 * @description Central application registry managing DocumentTypeConfig instances by document type name,
 * acting as an adapter seam over DocumentTypeSpecRegistry with lazy cached projections,
 * dynamic field spec subtable parsing, and 5-tier field state hydration logic.
 */

globalThis.__currentFileTier = 1;

import {
  DocumentTypeSpecRegistry,
  defaultDocumentTypeSpecRegistry,
} from './core/specs/DocumentTypeSpecRegistry';
import { specToConfigAdapter } from './core/specs/specToConfigAdapter';
import { defaultValidationHookRegistry } from './core/specs/ValidationHookRegistry';
import { DynamicDocumentLogStrategy } from './core/strategy/DynamicDocumentLogStrategy';
import { TemplateFormatCompiler } from './core/specs/TemplateFormatCompiler';

const DEFAULT_SUBMITTAL_FIELDS: DocumentFieldSpec[] = [
  { key: 'section', label: 'Section', type: 'string', required: false, description: 'CSI Section # (6 digits)', header: 'Section', keyNormalizationRule: 'code' },
  { key: 'number', label: 'Number', type: 'string', required: false, description: 'Submittal #', header: 'Number' },
  { key: 'revision', label: 'Revision', type: 'string', required: false, description: 'Revision #', defaultValue: '0', header: 'Revision' },
  { key: 'title', label: 'Title', type: 'string', required: true, header: 'Title' },
  { key: 'date', label: 'Date', type: 'date', required: true, description: 'Date (YYMMDD)', header: 'Date' },
  { key: 'contact', label: 'Contact', type: 'enum', required: true, header: 'Contact' },
  { key: 'action', label: 'Action', type: 'enum', required: true, header: 'Action' },
  { key: 'incomingRouting', label: 'Incoming Routing', type: 'enum', required: false, header: 'Incoming Routing' },
  { key: 'notes', label: 'Notes', type: 'multiline', required: false, description: 'Notes', header: 'Notes' },
  { key: 'calcFileName', label: 'Calc File Name', type: 'string', isCalculated: true, header: 'Calc File Name', formulaOrFunction: '=CONCAT()' }
];

const DEFAULT_FFE_SUBMITTAL_FIELDS: DocumentFieldSpec[] = [
  { key: 'specTag', label: 'Spec Tag', type: 'string', required: true, header: 'Spec Tag' },
  { key: 'relatedTag', label: 'Related Tag', type: 'string', required: false, header: 'Related Tag' },
  { key: 'specTitle', label: 'Spec Title', type: 'string', required: true, header: 'Spec Title' },
  { key: 'vendor', label: 'Vendor', type: 'string', required: true, header: 'Vendor' },
  { key: 'revision', label: 'Revision', type: 'string', required: false, header: 'Revision' },
  { key: 'date', label: 'Date', type: 'date', required: true, description: 'Date (YYMMDD)', header: 'Date' },
  { key: 'contact', label: 'Contact', type: 'enum', required: true, header: 'Contact' },
  { key: 'action', label: 'Action', type: 'enum', required: true, header: 'Action' },
  { key: 'incomingRouting', label: 'Incoming Routing', type: 'enum', required: false, header: 'Incoming Routing' },
  { key: 'notes', label: 'Notes', type: 'multiline', required: false, header: 'Notes' }
];

function ffeStrategyValidationHook(rawDoc: RawDocument, context?: ValidationContext): ValidationResult | void {
  const specTag = (rawDoc.specTag || '').trim();
  const vendor = (rawDoc.vendor || '').trim();
  const relatedTag = (rawDoc.relatedTag || '').trim();

  const validTags = context?.ffeTags?.tags || [];
  const validVendors = context?.ffeTags?.vendors || [];

  if (relatedTag) {
    const inputRelatedTags = relatedTag.split(',').map(t => t.trim()).filter(Boolean);
    const invalidRelatedTags = inputRelatedTags.filter(
      t => !validTags.some(valid => valid.toLowerCase() === t.toLowerCase())
    );
    if (invalidRelatedTags.length > 0) {
      return {
        status: 'error',
        errors: [`Invalid Related Tags: ${invalidRelatedTags.join(', ')}. Only valid options from the tag list are accepted.`]
      };
    }
  }

  const bypassTag = !!context?.bypassTagValidation;
  const bypassVendor = !!context?.bypassVendorValidation;

  if (specTag) {
    const tagExists = validTags.some(t => t.toLowerCase() === specTag.toLowerCase());
    if (!tagExists && !bypassTag) {
      return {
        status: 'interaction_required',
        interactionType: 'ADD_TAG',
        message: `Spec Tag "${specTag}" is not in the Tag List. Would you like to add it?`
      };
    }
  }

  if (vendor) {
    const vendorExists = validVendors.some(v => v.toLowerCase() === vendor.toLowerCase());
    if (!vendorExists && !bypassVendor) {
      return {
        status: 'interaction_required',
        interactionType: 'ADD_VENDOR',
        message: `Vendor "${vendor}" is not in the Tag List. Would you like to add it?`
      };
    }
  }
}

// Register default validation hook
defaultValidationHookRegistry.registerHook('ffeStrategyValidationHook', ffeStrategyValidationHook);

const DEFAULT_RFI_FIELDS: DocumentFieldSpec[] = [
  { key: 'rfiNumber', label: 'RFI Number', type: 'string', required: true, description: 'RFI Number', header: 'RFI Number' },
  { key: 'title', label: 'Title', type: 'string', required: true, description: 'RFI Subject / Title', header: 'Title' },
  { key: 'revision', label: 'Revision', type: 'string', required: false, description: 'Revision #', defaultValue: '0', header: 'Revision' },
  { key: 'date', label: 'Date', type: 'date', required: true, description: 'Date (YYMMDD)', header: 'Date' },
  { key: 'contact', label: 'Contact', type: 'enum', required: true, header: 'Contact' },
  { key: 'action', label: 'Action', type: 'enum', required: true, header: 'Action' },
  { key: 'incomingRouting', label: 'Incoming Routing', type: 'enum', required: false, header: 'Incoming Routing' },
  { key: 'notes', label: 'Notes', type: 'multiline', required: false, description: 'Notes', header: 'Notes' },
  { key: 'calcFileName', label: 'Calc File Name', type: 'string', isCalculated: true, header: 'Calc File Name', formulaOrFunction: '=CONCAT()' }
];

const DEFAULT_RFI_CONFIG: DocumentTypeConfig = {
  documentType: 'RFI',
  displayName: 'RFI (Request for Information)',
  targetTab: 'RFI Log',
  rootFolderSearchTerms: ['RFIs', 'RFI'],
  projectSearchTerms: ['RFIs', 'RFI'],
  closedRootFolderName: 'Closed',
  filenamePrefix: '_',
  logSearchTerms: ['document log', 'rfi log'],
  logSheetName: 'RFI Log',
  logAdapterKey: 'GoogleSheetsLogRepository',
  filingAdapterKey: 'GoogleDriveFilingRepository',
  fields: DEFAULT_RFI_FIELDS
};

const DEFAULT_ASI_FIELDS: DocumentFieldSpec[] = [
  { key: 'asiNumber', label: 'ASI Number', type: 'string', required: true, description: 'ASI Number', header: 'ASI Number' },
  { key: 'title', label: 'Title', type: 'string', required: true, description: 'ASI Title', header: 'Title' },
  { key: 'revision', label: 'Revision', type: 'string', required: false, description: 'Revision #', defaultValue: '0', header: 'Revision' },
  { key: 'date', label: 'Date', type: 'date', required: true, description: 'Date (YYMMDD)', header: 'Date' },
  { key: 'contact', label: 'Contact', type: 'enum', required: true, header: 'Contact' },
  { key: 'action', label: 'Action', type: 'enum', required: true, header: 'Action' },
  { key: 'incomingRouting', label: 'Incoming Routing', type: 'enum', required: false, header: 'Incoming Routing' },
  { key: 'notes', label: 'Notes', type: 'multiline', required: false, description: 'Notes', header: 'Notes' },
  { key: 'calcFileName', label: 'Calc File Name', type: 'string', isCalculated: true, header: 'Calc File Name', formulaOrFunction: '=CONCAT()' }
];

const DEFAULT_ASI_CONFIG: DocumentTypeConfig = {
  documentType: 'ASI',
  displayName: "ASI (Architect's Supplemental Instructions)",
  targetTab: 'ASI Log',
  rootFolderSearchTerms: ['ASIs', 'ASI'],
  projectSearchTerms: ['ASIs', 'ASI'],
  closedRootFolderName: 'Closed',
  filenamePrefix: '_',
  logSearchTerms: ['document log', 'asi log'],
  logSheetName: 'ASI Log',
  logAdapterKey: 'GoogleSheetsLogRepository',
  filingAdapterKey: 'GoogleDriveFilingRepository',
  fields: DEFAULT_ASI_FIELDS
};

/**
 * Hydration options for 5-tier state resolution.
 */
interface HydrationContext {
  formInput?: Record<string, any>;
  userCacheDraft?: Record<string, any>;
  parserResult?: Record<string, any>;
  aiMetadata?: Record<string, any>;
}

/**
 * Resolves a field's input value following the strict 5-tier state hydration hierarchy:
 * 1. Form Inputs (Tier 1: Live user inputs)
 * 2. User Cache Draft (Tier 2: Persisted draft state)
 * 3. Parser Result (Tier 3: Email/Filename parser extraction)
 * 4. AI Metadata (Tier 4: Multimodal AI triage predictions)
 * 5. Field Default / "" (Tier 5: Fallback schema default)
 */
function resolve5TierFieldValue(
  field: DocumentFieldSpec,
  context: HydrationContext = {}
): string {
  const { formInput, userCacheDraft, parserResult, aiMetadata } = context;

  if (formInput && formInput[field.key] !== undefined && formInput[field.key] !== null) {
    return String(formInput[field.key]);
  }
  if (userCacheDraft && userCacheDraft[field.key] !== undefined && userCacheDraft[field.key] !== null && String(userCacheDraft[field.key]).trim() !== '') {
    return String(userCacheDraft[field.key]);
  }
  if (parserResult && parserResult[field.key] !== undefined && parserResult[field.key] !== null && String(parserResult[field.key]).trim() !== '') {
    return String(parserResult[field.key]);
  }
  if (aiMetadata && aiMetadata[field.key] !== undefined && aiMetadata[field.key] !== null && String(aiMetadata[field.key]).trim() !== '') {
    return String(aiMetadata[field.key]);
  }
  return field.defaultValue !== undefined ? field.defaultValue : '';
}

class DocumentTypeConfigRegistry {
  private customConfigs: Map<string, DocumentTypeConfig>;
  private projectedCache: Map<string, DocumentTypeConfig>;
  private specRegistry: DocumentTypeSpecRegistry;

  constructor(specRegistry?: DocumentTypeSpecRegistry) {
    this.customConfigs = new Map<string, DocumentTypeConfig>();
    this.projectedCache = new Map<string, DocumentTypeConfig>();
    this.specRegistry = specRegistry || defaultDocumentTypeSpecRegistry;
    this.reset();
  }

  /**
   * Registers a DocumentTypeConfig instance in the registry.
   */
  public registerConfig(config: DocumentTypeConfig): void {
    if (!config || !config.documentType) {
      throw new Error('Invalid DocumentTypeConfig: documentType is required');
    }
    this.customConfigs.set(config.documentType, config);
    // Invalidate and purge all projected cache entries including aliases
    this.projectedCache.clear();
  }

  /**
   * Finds matching key in custom configs.
   */
  private findCustomConfigKey(documentType: string): string | undefined {
    if (!documentType) return undefined;
    if (this.customConfigs.has(documentType)) return documentType;
    const lower = documentType.toLowerCase().trim();
    for (const key of this.customConfigs.keys()) {
      if (key.toLowerCase() === lower) return key;
    }
    return undefined;
  }

  /**
   * Retrieves a DocumentTypeConfig by document type name, utilizing lazy cached projection.
   */
  public getConfig(documentType: string): DocumentTypeConfig {
    if (!documentType || typeof documentType !== 'string') {
      throw new Error('DocumentTypeConfig not registered for document type: ' + documentType);
    }

    // 1. Check custom configs first
    const customKey = this.findCustomConfigKey(documentType);
    if (customKey) {
      return this.customConfigs.get(customKey)!;
    }

    // 2. Check projected cache
    const lower = documentType.toLowerCase().trim();
    if (this.projectedCache.has(lower)) {
      return this.projectedCache.get(lower)!;
    }

    // 3. Resolve from DocumentTypeSpecRegistry
    const specKey = this.specRegistry.findSpecKey(documentType);
    if (specKey && this.specRegistry.hasSpec(specKey)) {
      const spec = this.specRegistry.getSpec(specKey);
      const projected = specToConfigAdapter(spec);
      const logStrategy = new DynamicDocumentLogStrategy(spec, TemplateFormatCompiler);

      // Customize legacy alias presentation
      let finalConfig: DocumentTypeConfig = projected;
      if (lower === 'submittal' || lower === 'architecture') {
        finalConfig = {
          ...projected,
          documentType: lower === 'submittal' ? 'Submittal' : 'Architecture',
          displayName: 'Submittal (Architecture)',
          targetTab: 'Submittal Arch',
        };
      } else if (lower === 'ff&e' || lower === 'ffe') {
        finalConfig = {
          ...projected,
          documentType: lower === 'ff&e' ? 'FF&E' : 'FFE',
          displayName: 'Submittal (FF&E)',
          targetTab: 'Submittal FFE',
        };
      } else if (lower === 'submittal_arch') {
        finalConfig = {
          ...projected,
          documentType: 'SUBMITTAL_ARCH',
          displayName: 'Architectural Submittals',
          targetTab: 'Submittal Arch',
        };
      } else if (lower === 'submittal_ffe') {
        finalConfig = {
          ...projected,
          documentType: 'SUBMITTAL_FFE',
          displayName: 'FFE Submittals',
          targetTab: 'Submittal FFE',
        };
      }

      (finalConfig as any).logStrategy = logStrategy;
      this.projectedCache.set(lower, finalConfig);
      this.projectedCache.set(finalConfig.documentType, finalConfig);
      this.projectedCache.set(specKey, finalConfig);
      return finalConfig;
    }

    throw new Error('DocumentTypeConfig not registered for document type: ' + documentType);
  }

  /**
   * Checks if a DocumentTypeConfig is registered for a given document type.
   */
  public hasConfig(documentType: string): boolean {
    if (!documentType || typeof documentType !== 'string') return false;
    if (this.findCustomConfigKey(documentType) !== undefined) return true;
    return this.specRegistry.hasSpec(documentType);
  }

  /**
   * Returns all primary registered DocumentTypeConfigs.
   */
  public getAllConfigs(): DocumentTypeConfig[] {
    const list: DocumentTypeConfig[] = [];
    const seen = new Set<string>();

    // 1. Include custom configs
    for (const config of this.customConfigs.values()) {
      const key = config.documentType;
      if (key === 'Architecture' || key === 'FF&E' || key === 'Submittal') continue;
      const lower = key.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(config);
      }
    }

    // 2. Include active canonical specs if not overridden by custom configs
    const specs = this.specRegistry.getAllSpecs();
    for (const spec of specs) {
      const lower = spec.key.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(this.getConfig(spec.key));
      }
    }

    return list;
  }

  /**
   * Parses dynamic field subtable 2D array rows from _Config (Config_<DocTypeKey>_Fields) into DocumentFieldSpec[].
   */
  public parseFieldSpecs(rows: unknown[][]): DocumentFieldSpec[] {
    if (!rows || rows.length === 0) return [];

    let headerRowIdx = 0;
    const headerMap = new Map<string, number>();

    // Detect header row by checking for 'Key' or 'Label' or 'Type'
    for (let r = 0; r < Math.min(rows.length, 3); r++) {
      const rowStr = rows[r].map(c => String(c).toLowerCase().trim());
      if (rowStr.includes('key') && rowStr.includes('type')) {
        headerRowIdx = r;
        rows[r].forEach((col: any, idx: number) => {
          headerMap.set(String(col).toLowerCase().trim(), idx);
        });
        break;
      }
    }

    if (headerMap.size === 0) {
      headerMap.set('key', 0);
      headerMap.set('header', 1);
      headerMap.set('label', 2);
      headerMap.set('type', 3);
      headerMap.set('iscalculated', 4);
      headerMap.set('formulaorfunction', 5);
      headerMap.set('optionsrange', 6);
      headerMap.set('required', 7);
      headerMap.set('description', 8);
      headerMap.set('defaultvalue', 9);
      headerMap.set('keynormalizationrule', 10);
      headerMap.set('numberformat', 11);
    }

    const fieldSpecs: DocumentFieldSpec[] = [];
    const getVal = (row: any[], colName: string): string => {
      const idx = headerMap.get(colName);
      return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : '';
    };

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const key = getVal(row, 'key');
      if (!key) continue;

      const label = getVal(row, 'label') || key;
      const typeRaw = getVal(row, 'type').toLowerCase();
      const type: 'string' | 'multiline' | 'date' | 'list' | 'enum' =
        (typeRaw === 'multiline' || typeRaw === 'date' || typeRaw === 'list' || typeRaw === 'enum')
          ? typeRaw
          : 'string';

      const isCalculatedStr = getVal(row, 'iscalculated').toUpperCase();
      const isCalculated = isCalculatedStr === 'TRUE' || isCalculatedStr === '1';

      const requiredStr = getVal(row, 'required').toUpperCase();
      const required = requiredStr === 'TRUE' || requiredStr === '1';

      const header = getVal(row, 'header') || label;
      const formulaOrFunction = getVal(row, 'formulaorfunction');
      const optionsRange = getVal(row, 'optionsrange');
      const description = getVal(row, 'description');
      const defaultValue = getVal(row, 'defaultvalue');
      const normRuleRaw = getVal(row, 'keynormalizationrule').toLowerCase();
      const keyNormalizationRule = (normRuleRaw === 'picklist' || normRuleRaw === 'code' || normRuleRaw === 'exact')
        ? (normRuleRaw as 'picklist' | 'code' | 'exact')
        : undefined;

      const numberFormat = getVal(row, 'numberformat');
      const spec: DocumentFieldSpec = {
        key,
        label,
        type,
        ...(header ? { header } : {}),
        ...(required ? { required: true } : {}),
        ...(description ? { description } : {}),
        ...(defaultValue ? { defaultValue } : {}),
        ...(isCalculated ? { isCalculated: true } : {}),
        ...(formulaOrFunction ? { formulaOrFunction } : {}),
        ...(optionsRange ? { optionsRange } : {}),
        ...(keyNormalizationRule ? { keyNormalizationRule } : {}),
        ...(numberFormat ? { numberFormat } : {})
      };

      fieldSpecs.push(spec);
    }

    return fieldSpecs;
  }

  /**
   * Deserializes DocumentTypeConfig entries directly from a live _Config tab's DocTypes table and field subtables.
   */
  public loadFromSpreadsheetConfig(docTypeRows: unknown[][], fieldSpecsMap: Record<string, unknown[][]> = {}): void {
    if (!docTypeRows || docTypeRows.length <= 1) return;

    let headerRowIdx = 0;
    const headerMap = new Map<string, number>();
    for (let r = 0; r < Math.min(docTypeRows.length, 3); r++) {
      const rowStr = docTypeRows[r].map(c => String(c).toLowerCase().trim());
      if (rowStr.includes('doctypekey') || rowStr.includes('displayname')) {
        headerRowIdx = r;
        docTypeRows[r].forEach((col: any, idx: number) => {
          headerMap.set(String(col).toLowerCase().trim(), idx);
        });
        break;
      }
    }

    if (headerMap.size === 0) {
      headerMap.set('doctypekey', 0);
      headerMap.set('displayname', 1);
      headerMap.set('prefix', 2);
      headerMap.set('logtabname', 3);
    }

    const getVal = (row: any[], colName: string): string => {
      const idx = headerMap.get(colName);
      return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : '';
    };

    for (let r = headerRowIdx + 1; r < docTypeRows.length; r++) {
      const row = docTypeRows[r];
      const rawKey = getVal(row, 'doctypekey');
      if (!rawKey) continue;

      const displayName = getVal(row, 'displayname') || rawKey;
      const prefix = getVal(row, 'prefix') || '_';
      const logTabName = getVal(row, 'logtabname') || 'Log';

      const fieldRows = fieldSpecsMap[rawKey] || fieldSpecsMap[rawKey.toUpperCase()] || [];
      const parsedFields = this.parseFieldSpecs(fieldRows);
      const fields = parsedFields.length > 0
        ? parsedFields
        : (rawKey.toLowerCase().includes('ffe') ? DEFAULT_FFE_SUBMITTAL_FIELDS : DEFAULT_SUBMITTAL_FIELDS);

      const isFfe = rawKey.toLowerCase().includes('ffe');
      const baseConfig = this.hasConfig(rawKey)
        ? this.getConfig(rawKey)
        : this.getConfig(isFfe ? 'SUBMITTAL_FFE' : 'SUBMITTAL_ARCH');

      const config: DocumentTypeConfig = {
        ...baseConfig,
        documentType: rawKey,
        displayName,
        filenamePrefix: prefix,
        logSheetName: logTabName,
        targetTab: logTabName,
        fields
      };

      this.registerConfig(config);

      // Register uppercase alias (e.g. SUBMITTAL_ARCH for Submittal_Arch)
      const upperKey = rawKey.toUpperCase();
      if (upperKey !== rawKey) {
        this.registerConfig({ ...config, documentType: upperKey });
      }
    }
  }

  /**
   * Resets the registry back to default state.
   */
  public reset(): void {
    this.customConfigs.clear();
    this.projectedCache.clear();
    this.specRegistry.reset();
  }
}

const defaultDocumentTypeConfigRegistry = new DocumentTypeConfigRegistry();

export {
  DocumentTypeConfigRegistry,
  defaultDocumentTypeConfigRegistry,
  resolve5TierFieldValue,
  DEFAULT_SUBMITTAL_FIELDS,
  DEFAULT_FFE_SUBMITTAL_FIELDS,
  DEFAULT_RFI_CONFIG,
  DEFAULT_ASI_CONFIG,
  ffeStrategyValidationHook
};

