/// <reference path="./types.ts" />
/**
 * @file DocumentTypeConfigRegistry.ts
 * @description Central application registry managing DocumentTypeConfig instances by document type name,
 * dynamic field spec subtable parsing, and 5-tier field state hydration logic.
 */

const DEFAULT_SUBMITTAL_FIELDS: DocumentFieldSpec[] = [
  { key: 'date', label: 'Date', type: 'date', required: true, header: 'Date' },
  { key: 'contact', label: 'Contact', type: 'string', required: true, header: 'Contact' },
  { key: 'action', label: 'Action', type: 'string', required: true, header: 'Action' },
  { key: 'incomingRouting', label: 'Incoming Routing', type: 'string', required: false, header: 'Incoming Routing' },
  { key: 'title', label: 'Title', type: 'string', required: true, header: 'Title' },
  { key: 'section', label: 'Section', type: 'string', required: false, description: 'CSI Section # (6 digits)', header: 'Section', keyNormalizationRule: 'code' },
  { key: 'number', label: 'Number', type: 'string', required: false, description: 'Submittal #', header: 'Number' },
  { key: 'revision', label: 'Revision', type: 'string', required: false, description: 'Revision #', defaultValue: '0', header: 'Revision' },
  { key: 'notes', label: 'Notes', type: 'multiline', required: false, description: 'Notes', header: 'Notes' },
  { key: 'calcFileName', label: 'Calc File Name', type: 'string', isCalculated: true, header: 'Calc File Name', formulaOrFunction: '=CONCAT()' }
];

const DEFAULT_FFE_SUBMITTAL_FIELDS: DocumentFieldSpec[] = [
  { key: 'date', label: 'Date', type: 'date', required: true, header: 'Date' },
  { key: 'contact', label: 'Contact', type: 'string', required: true, header: 'Contact' },
  { key: 'action', label: 'Action', type: 'string', required: true, header: 'Action' },
  { key: 'incomingRouting', label: 'Incoming Routing', type: 'string', required: false, header: 'Incoming Routing' },
  { key: 'specTag', label: 'Spec Tag', type: 'string', required: true, header: 'Spec Tag' },
  { key: 'specTitle', label: 'Spec Title', type: 'string', required: true, header: 'Spec Title' },
  { key: 'vendor', label: 'Vendor', type: 'string', required: true, header: 'Vendor' },
  { key: 'revision', label: 'Revision', type: 'string', required: false, header: 'Revision' },
  { key: 'relatedTag', label: 'Related Tag', type: 'string', required: false, header: 'Related Tag' },
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

const DEFAULT_SUBMITTAL_CONFIG: DocumentTypeConfig = {
  documentType: 'Submittal',
  rootFolderSearchTerms: ['Submittals', 'Submittal'],
  projectSearchTerms: ['Submittals', 'Submittal'],
  closedRootFolderName: 'Closed',
  closedSubfolderMap: {
    Architecture: 'Architecture',
    'FF&E': 'FFE'
  },
  filenamePrefix: '_',
  coverPageTemplateId: '',
  logSearchTerms: ['submittal log', 'submittal'],
  logSheetName: 'Log',
  logParentFolderTerms: ['Submittals'],
  logAdapterKey: 'GoogleSheetsLogRepository',
  filingAdapterKey: 'GoogleDriveFilingRepository',
  pdfAdapterKey: 'PdfDocumentService',
  aiAdapterKey: 'GeminiAiAnalysisAdapter',
  fields: DEFAULT_SUBMITTAL_FIELDS
};

const DEFAULT_ARCH_CONFIG: DocumentTypeConfig = {
  ...DEFAULT_SUBMITTAL_CONFIG,
  documentType: 'Architecture'
};

const DEFAULT_FFE_CONFIG: DocumentTypeConfig = {
  documentType: 'FF&E',
  rootFolderSearchTerms: ['FF&E', 'FFE'],
  projectSearchTerms: ['FF&E', 'FFE'],
  closedRootFolderName: 'Closed',
  filenamePrefix: '_',
  logSearchTerms: ['ffe log', 'ff&e log'],
  logSheetName: 'Submittal FFE',
  logAdapterKey: 'GoogleSheetsLogRepository',
  filingAdapterKey: 'GoogleDriveFilingRepository',
  fields: DEFAULT_FFE_SUBMITTAL_FIELDS,
  validateHook: ffeStrategyValidationHook
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
  private configs: Map<string, DocumentTypeConfig>;

  constructor() {
    this.configs = new Map<string, DocumentTypeConfig>();
    this.reset();
  }

  /**
   * Registers a DocumentTypeConfig instance in the registry.
   */
  public registerConfig(config: DocumentTypeConfig): void {
    if (!config || !config.documentType) {
      throw new Error('Invalid DocumentTypeConfig: documentType is required');
    }
    this.configs.set(config.documentType, config);
  }

  /**
   * Retrieves a DocumentTypeConfig by document type name.
   */
  private findConfigKey(documentType: string): string | undefined {
    if (!documentType) return undefined;
    if (this.configs.has(documentType)) return documentType;
    const lower = documentType.toLowerCase();
    for (const key of this.configs.keys()) {
      if (key.toLowerCase() === lower) return key;
    }
    return undefined;
  }

  /**
   * Retrieves a DocumentTypeConfig by document type name.
   */
  public getConfig(documentType: string): DocumentTypeConfig {
    const key = this.findConfigKey(documentType);
    if (key) return this.configs.get(key)!;
    throw new Error('DocumentTypeConfig not registered for document type: ' + documentType);
  }

  /**
   * Checks if a DocumentTypeConfig is registered for a given document type.
   */
  public hasConfig(documentType: string): boolean {
    return this.findConfigKey(documentType) !== undefined;
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
        ...(keyNormalizationRule ? { keyNormalizationRule } : {})
      };

      fieldSpecs.push(spec);
    }

    return fieldSpecs;
  }

  /**
   * Resets the registry back to default state (pre-configured for Submittal, Architecture, FF&E).
   */
  public reset(): void {
    this.configs.clear();
    this.registerConfig({ ...DEFAULT_SUBMITTAL_CONFIG });
    this.registerConfig({ ...DEFAULT_ARCH_CONFIG });
    this.registerConfig({ ...DEFAULT_FFE_CONFIG });
  }
}

const defaultDocumentTypeConfigRegistry = new DocumentTypeConfigRegistry();

declare var module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DocumentTypeConfigRegistry,
    defaultDocumentTypeConfigRegistry,
    resolve5TierFieldValue,
    DEFAULT_SUBMITTAL_FIELDS,
    DEFAULT_FFE_SUBMITTAL_FIELDS,
    ffeStrategyValidationHook
  };
}

(globalThis as any).resolve5TierFieldValue = resolve5TierFieldValue;
(globalThis as any).DocumentTypeConfigRegistry = DocumentTypeConfigRegistry;
(globalThis as any).defaultDocumentTypeConfigRegistry = defaultDocumentTypeConfigRegistry;
