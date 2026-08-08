/// <reference path="./types.ts" />
/**
 * @file DocumentTypeConfigRegistry.ts
 * @description Central application registry managing DocumentTypeConfig instances by document type name,
 * dynamic field spec subtable parsing, and 5-tier field state hydration logic.
 */

const DEFAULT_SUBMITTAL_FIELDS: DocumentFieldSpec[] = [
  { key: 'section', label: 'Section', type: 'string', required: true, description: 'CSI Section # (6 digits)', header: 'Section' },
  { key: 'number', label: 'Number', type: 'string', required: true, description: 'Submittal #', header: 'Number' },
  { key: 'title', label: 'Title', type: 'string', required: true, description: 'Submittal Title', header: 'Title' },
  { key: 'revision', label: 'Revision', type: 'string', required: false, description: 'Revision #', defaultValue: '0', header: 'Revision' },
  { key: 'date', label: 'Date', type: 'date', required: true, description: 'Date (YYMMDD)', header: 'Date' },
  { key: 'notes', label: 'Notes', type: 'multiline', required: false, description: 'Notes', header: 'Notes' },
  { key: 'calcFileName', label: 'Calc File Name', type: 'string', isCalculated: true, header: 'Calc File Name', formulaOrFunction: '=CONCAT()' }
];

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
  public getConfig(documentType: string): DocumentTypeConfig {
    const config = this.configs.get(documentType);
    if (!config) {
      throw new Error('DocumentTypeConfig not registered for document type: ' + documentType);
    }
    return config;
  }

  /**
   * Checks if a DocumentTypeConfig is registered for a given document type.
   */
  public hasConfig(documentType: string): boolean {
    return this.configs.has(documentType);
  }

  /**
   * Parses dynamic field subtable 2D array rows from _Config (Config_<DocTypeKey>_Fields) into DocumentFieldSpec[].
   */
  public parseFieldSpecs(rows: any[][]): DocumentFieldSpec[] {
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
   * Resets the registry back to default state (pre-configured for Submittal).
   */
  public reset(): void {
    this.configs.clear();
    this.registerConfig({ ...DEFAULT_SUBMITTAL_CONFIG });
  }
}

const defaultDocumentTypeConfigRegistry = new DocumentTypeConfigRegistry();

declare var module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DocumentTypeConfigRegistry,
    defaultDocumentTypeConfigRegistry,
    resolve5TierFieldValue,
    DEFAULT_SUBMITTAL_FIELDS
  };
}

(globalThis as any).resolve5TierFieldValue = resolve5TierFieldValue;
(globalThis as any).DocumentTypeConfigRegistry = DocumentTypeConfigRegistry;
(globalThis as any).defaultDocumentTypeConfigRegistry = defaultDocumentTypeConfigRegistry;
