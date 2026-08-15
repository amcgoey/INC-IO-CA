/**
 * @file GoogleSheetsDocumentTypeSpecAdapter.ts
 * @description Tier 2 GAS Infrastructure Adapter for DocumentTypeSpec.
 * Compiles DocumentTypeSpec[] into DocumentLogWorkbookSpec models and
 * decompiles live Google Sheets workbook batch data back into validated DocumentTypeSpec[].
 * Pure model translation logic: zero Node.js built-in imports.
 */

import type {
  DocumentTypeSpec,
  DocumentFieldSpec,
  DocumentIdentitySpec,
  DriveStorageSpec,
  PolymorphicStorageSpec,
  WorkflowSpec,
  FieldMatchRule,
  SupportDataSpec,
  SupportDataColumnSpec,
} from '../../core/specs/DocumentTypeSpec';
import type {
  DocumentLogWorkbookSpec,
  TabSpec,
  ColumnSpec,
  NamedRangeSpec,
} from '../../core/config/DocumentLogWorkbookSpec';
import { DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION } from '../../core/config/DocumentLogWorkbookSpec';
import { TemplateFormatCompiler } from '../../core/specs/TemplateFormatCompiler';
import { ValidationEngine, type SpecValidationResult } from '../../core/specs/ValidationEngine';
import type {
  SpreadsheetBatchData,
  SpreadsheetBatchReaderAdapter,
  SheetPayload,
  NamedRangePayload,
  ExtendedValuePayload,
} from './SpreadsheetBatchReaderAdapter';

/** Log Tab default layout constants */
const DATA_ROW_START_INDEX = 4;
const DEFAULT_LOG_TAB_ROW_COUNT = 25;
const DEFAULT_LOG_TAB_MIN_COLUMN_COUNT = 26;

/** Strict cell primitive types */
export type GridCellPrimitive = string | number | boolean;
export type GridRow = GridCellPrimitive[];

/** Subtable Column Index Constants */
const MANIFEST_COL_KEY = 0;
const MANIFEST_COL_VALUE = 1;

const DOCTYPE_COL_KEY = 0;
const DOCTYPE_COL_NAME = 1;
const DOCTYPE_COL_PREFIX = 2;
const DOCTYPE_COL_LABEL = 3;

const IDENTITY_COL_FORMAT = 0;
const IDENTITY_COL_GROUP_FORMAT = 1;
const IDENTITY_COL_REV_GROUP_FORMAT = 2;

const STORAGE_COL_TYPE = 0;
const STORAGE_COL_ROOT_TERMS = 1;
const STORAGE_COL_PROJ_TERMS = 2;
const STORAGE_COL_CLOSED_ROOT = 3;
const STORAGE_COL_CLOSED_SUB = 4;
const STORAGE_COL_PREFIX = 5;
const STORAGE_COL_FILENAME_FMT = 6;
const STORAGE_COL_COVER_PAGE = 7;

const WORKFLOW_COL_CONTEXT = 0;
const WORKFLOW_COL_FIELD_MATCHES = 1;
const WORKFLOW_COL_SEQUENCE = 2;

const FIELD_COL_KEY = 0;
const FIELD_COL_HEADER = 1;
const FIELD_COL_LABEL = 2;
const FIELD_COL_TYPE = 3;
const FIELD_COL_IS_CALCULATED = 4;
const FIELD_COL_FORMULA = 5;
const FIELD_COL_OPTIONS_RANGE = 6;
const FIELD_COL_REQUIRED = 7;
const FIELD_COL_DESCRIPTION = 8;
const FIELD_COL_DEFAULT_VALUE = 9;
const FIELD_COL_KEY_NORM = 10;
const FIELD_COL_NUMBER_FMT = 11;

/** Context bundle for parsing _Config tab tables */
interface ConfigTabContext {
  rows: GridRow[];
  namedRanges: NamedRangePayload[];
  scanIdx: number;
}

/** Container for extracted support datasets */
interface SupportDataCollection {
  shared: Record<string, SupportDataSpec>;
  perType: Map<string, Record<string, SupportDataSpec>>;
}

interface DecompileExtractionResult {
  specs: Partial<DocumentTypeSpec>[];
  errors: string[];
}

/**
 * Converts a 0-based column index to A1 column letters (e.g. 0 -> 'A', 25 -> 'Z', 26 -> 'AA').
 */
export function getColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export class GoogleSheetsDocumentTypeSpecAdapter {
  /**
   * Compiles an array of DocumentTypeSpec definitions into a DocumentLogWorkbookSpec intermediate model.
   * Transpiles calcFormat definitions on log tabs into =MAP(..., LAMBDA(...)) Row 2 spill formulas,
   * compiles _Shared and <Type> Support tabs with full-table Named Ranges,
   * and aggregates configuration metadata into 6 centralized tables on the _Config tab under SYSTEM_TAB_PROTECTION.
   */
  public static compileWorkbookSpec(
    specs: DocumentTypeSpec[],
    baseSpec?: Partial<DocumentLogWorkbookSpec>
  ): DocumentLogWorkbookSpec {
    const tabs: TabSpec[] = [];
    const namedRanges: NamedRangeSpec[] = baseSpec?.namedRanges ? [...baseSpec.namedRanges] : [];

    // 1. Process Log Tabs
    this.compileLogTabs(specs, tabs);

    // 2. Process Support Tabs (<Type> Support and _Shared)
    this.compileSupportTabs(specs, tabs, namedRanges);

    // 3. Build centralized _Config Tab and register Named Ranges
    this.compileConfigTab(specs, baseSpec, tabs, namedRanges);

    // 4. Append baseSpec tabs (e.g. _AuditLog)
    if (baseSpec?.tabs) {
      for (const baseTab of baseSpec.tabs) {
        if (!tabs.some((t) => t.name === baseTab.name)) {
          tabs.push(baseTab);
        }
      }
    }

    return {
      schemaVersion: baseSpec?.schemaVersion || DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
      tabs,
      namedRanges,
    };
  }

  /**
   * Decompiles a live Google Sheets workbook from batch data into validated DocumentTypeSpec instances.
   * Accepts either pre-fetched SpreadsheetBatchData or a SpreadsheetBatchReaderAdapter instance with target spreadsheetId.
   */
  public static decompile(
    input: SpreadsheetBatchData | SpreadsheetBatchReaderAdapter,
    spreadsheetId?: string
  ): SpecValidationResult[] {
    if (!input || typeof input !== 'object') {
      return [{ status: 'invalid', errors: ['Invalid or missing spreadsheet batch data'] }];
    }

    let batchData: SpreadsheetBatchData;

    if ('readWorkbookBatch' in input && typeof input.readWorkbookBatch === 'function') {
      if (!spreadsheetId) {
        return [{ status: 'invalid', errors: ['Missing required spreadsheetId for SpreadsheetBatchReaderAdapter'] }];
      }
      try {
        batchData = input.readWorkbookBatch(spreadsheetId);
      } catch (err: unknown) {
        return [{ status: 'invalid', errors: [`Spreadsheet batch read error: ${this.getErrorMessage(err)}`] }];
      }
    } else {
      batchData = input as SpreadsheetBatchData;
    }

    if (!batchData || !batchData.sheets || !Array.isArray(batchData.sheets) || batchData.sheets.length === 0) {
      return [{ status: 'invalid', errors: ['Workbook is missing _Config tab'] }];
    }

    const configSheet = batchData.sheets.find((s) => s.properties?.title === '_Config');
    if (!configSheet) {
      return [{ status: 'invalid', errors: ['Workbook is missing _Config tab'] }];
    }

    const configRows = this.extractGridRows(configSheet);
    if (!configRows || configRows.length === 0) {
      return [{ status: 'invalid', errors: ['Workbook is missing _Config tab'] }];
    }

    // 1. Decompile Support Tabs (_Shared and <Type> Support)
    const supportDataCollection = this.decompileSupportTabs(
      batchData.sheets,
      batchData.namedRanges || []
    );

    // 2. Decompile _Config Tab Subtables
    const { specs: candidateSpecs, errors: parseErrors } = this.decompileConfigTab(
      configRows,
      batchData.namedRanges || [],
      supportDataCollection
    );

    if (parseErrors.length > 0) {
      return [{ status: 'invalid', errors: parseErrors }];
    }

    if (candidateSpecs.length === 0) {
      return [{ status: 'invalid', errors: ['No document type configurations found in _Config tab'] }];
    }

    // 3. Validate candidate specs through ValidationEngine
    return candidateSpecs.map((spec) => ValidationEngine.validateSpec(spec));
  }

  /**
   * Extracts error message string from unknown error object.
   */
  private static getErrorMessage(err: unknown): string {
    return err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err);
  }

  /**
   * Extracts typed primitive from ExtendedValue cell object.
   */
  private static extractCellValue(uev?: ExtendedValuePayload): GridCellPrimitive {
    if (!uev) return '';
    if (uev.stringValue !== undefined) return uev.stringValue;
    if (uev.numberValue !== undefined) return uev.numberValue;
    if (uev.boolValue !== undefined) return uev.boolValue;
    if (uev.formulaValue !== undefined) return uev.formulaValue;
    return '';
  }

  /**
   * Safely gets trimmed string from row index.
   */
  private static getCellString(row: GridRow | undefined, colIdx: number): string {
    if (!row || row[colIdx] === undefined || row[colIdx] === null) return '';
    return String(row[colIdx]).trim();
  }

  /**
   * Safely gets boolean value from row index.
   */
  private static getCellBoolean(row: GridRow | undefined, colIdx: number): boolean {
    if (!row || row[colIdx] === undefined || row[colIdx] === null) return false;
    return row[colIdx] === true || String(row[colIdx]).trim().toUpperCase() === 'TRUE';
  }

  /**
   * Safely gets comma-separated string list from row index.
   */
  private static getCellStringList(row: GridRow | undefined, colIdx: number): string[] {
    const raw = this.getCellString(row, colIdx);
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Normalizes SheetPayload grid data into a 2D array of primitives.
   */
  private static extractGridRows(sheet?: SheetPayload): GridRow[] {
    if (!sheet || !sheet.data || sheet.data.length === 0) return [];
    const rows: GridRow[] = [];

    for (const gridData of sheet.data) {
      if (!gridData || !gridData.rowData) continue;
      const startRow = gridData.startRow || 0;
      const startCol = gridData.startColumn || 0;

      gridData.rowData.forEach((rowData, rIdx) => {
        const rowNum = startRow + rIdx;
        if (!rows[rowNum]) {
          rows[rowNum] = [];
        }
        if (rowData && rowData.values) {
          rowData.values.forEach((cell, cIdx) => {
            const colNum = startCol + cIdx;
            rows[rowNum][colNum] = this.extractCellValue(cell?.userEnteredValue);
          });
        }
      });
    }

    for (let i = 0; i < rows.length; i++) {
      if (!rows[i]) rows[i] = [];
    }
    return rows;
  }

  /**
   * Parses support datasets from sheet named ranges.
   */
  private static parseSupportDatasetsFromNamedRanges(
    tabNamedRanges: NamedRangePayload[],
    headerRow: GridRow,
    gridRows: GridRow[],
    isShared: boolean
  ): SupportDataSpec[] {
    const datasets: SupportDataSpec[] = [];

    for (const nr of tabNamedRanges) {
      const datasetKey = nr.name || '';
      if (!datasetKey || datasetKey.startsWith('Config_') || datasetKey.startsWith('MANIFEST_')) continue;

      const startCol = nr.range?.startColumnIndex ?? 0;
      const endCol = nr.range?.endColumnIndex ?? headerRow.length;
      const startRow = nr.range?.startRowIndex ?? 1;
      const endRow = nr.range?.endRowIndex ?? gridRows.length;

      const columns: SupportDataColumnSpec[] = [];
      for (let c = startCol; c < endCol && c < headerRow.length; c++) {
        const colKey = this.getCellString(headerRow, c);
        if (colKey) {
          columns.push({
            key: colKey,
            type: 'string',
          });
        }
      }

      if (columns.length === 0) continue;

      const items: Array<Record<string, GridCellPrimitive>> = [];
      for (let r = startRow; r < endRow && r < gridRows.length; r++) {
        const row = gridRows[r];
        if (!row) continue;

        const item: Record<string, GridCellPrimitive> = {};
        let hasValue = false;
        columns.forEach((col, idx) => {
          const val = row[startCol + idx];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            item[col.key] = val;
            hasValue = true;
          } else {
            item[col.key] = '';
          }
        });

        if (hasValue) {
          items.push(item);
        }
      }

      datasets.push({
        key: datasetKey,
        isShared,
        columns,
        items,
      });
    }

    return datasets;
  }

  /**
   * Fallback: Parses support datasets by scanning contiguous header column blocks.
   */
  private static parseSupportDatasetsFromColumns(
    headerRow: GridRow,
    gridRows: GridRow[],
    isShared: boolean
  ): SupportDataSpec[] {
    const datasets: SupportDataSpec[] = [];
    let colIdx = 0;

    while (colIdx < headerRow.length) {
      while (colIdx < headerRow.length && !headerRow[colIdx]) {
        colIdx++;
      }
      if (colIdx >= headerRow.length) break;

      const blockStart = colIdx;
      while (colIdx < headerRow.length && headerRow[colIdx]) {
        colIdx++;
      }
      const blockEnd = colIdx;

      const columns: SupportDataColumnSpec[] = [];
      for (let c = blockStart; c < blockEnd; c++) {
        columns.push({
          key: this.getCellString(headerRow, c),
          type: 'string',
        });
      }

      const datasetKey = columns[0]?.key || `Support_${blockStart}`;
      const items: Array<Record<string, GridCellPrimitive>> = [];
      for (let r = 1; r < gridRows.length; r++) {
        const row = gridRows[r];
        if (!row) continue;
        const item: Record<string, GridCellPrimitive> = {};
        let hasVal = false;
        columns.forEach((col, idx) => {
          const val = row[blockStart + idx];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            item[col.key] = val;
            hasVal = true;
          }
        });
        if (hasVal) items.push(item);
      }

      datasets.push({
        key: datasetKey,
        isShared,
        columns,
        items,
      });
    }

    return datasets;
  }

  /**
   * Decompiles Support Tabs (_Shared and <Type> Support) into SupportDataSpec maps.
   */
  private static decompileSupportTabs(
    sheets: SheetPayload[],
    namedRanges: NamedRangePayload[]
  ): SupportDataCollection {
    const shared: Record<string, SupportDataSpec> = {};
    const perType = new Map<string, Record<string, SupportDataSpec>>();

    for (const sheet of sheets) {
      const title = sheet.properties?.title || '';
      const isShared = title === '_Shared';
      const isSupport = title.endsWith(' Support') && title.length > ' Support'.length;

      if (!isShared && !isSupport) continue;

      const gridRows = this.extractGridRows(sheet);
      if (gridRows.length === 0) continue;

      const headerRow = gridRows[0] || [];
      const sheetId = sheet.properties?.sheetId;

      const tabNamedRanges = namedRanges.filter((nr) => {
        if (nr.range?.sheetId !== undefined && sheetId !== undefined) {
          return nr.range.sheetId === sheetId;
        }
        return false;
      });

      const processedDatasets = tabNamedRanges.length > 0
        ? this.parseSupportDatasetsFromNamedRanges(tabNamedRanges, headerRow, gridRows, isShared)
        : this.parseSupportDatasetsFromColumns(headerRow, gridRows, isShared);

      if (isShared) {
        for (const ds of processedDatasets) {
          shared[ds.key] = ds;
        }
      } else if (isSupport) {
        const specNameOrLabel = title.replace(/\s+Support$/, '');
        if (!perType.has(specNameOrLabel)) {
          perType.set(specNameOrLabel, {});
        }
        const entry = perType.get(specNameOrLabel)!;
        for (const ds of processedDatasets) {
          entry[ds.key] = ds;
        }
      }
    }

    return { shared, perType };
  }

  /**
   * Resolves subtable rows by Named Range first, falling back to sequential header scanning.
   */
  private static resolveSubtable(
    nrName: string,
    headerIdentifier: string,
    ctx: ConfigTabContext
  ): GridRow[] {
    const nr = ctx.namedRanges.find((r) => r.name === nrName);
    if (nr && nr.range) {
      const startRow = nr.range.startRowIndex ?? 0;
      const endRow = nr.range.endRowIndex ?? ctx.rows.length;
      const startCol = nr.range.startColumnIndex ?? 0;
      const endCol = nr.range.endColumnIndex ?? (ctx.rows[0]?.length || 20);

      const rows: GridRow[] = [];
      for (let r = startRow; r < endRow && r < ctx.rows.length; r++) {
        const row = ctx.rows[r];
        if (!row) continue;
        rows.push(row.slice(startCol, endCol));
      }
      if (rows.length > 0) {
        if (this.getCellString(rows[0], 0).toLowerCase() === headerIdentifier.toLowerCase()) {
          return rows.slice(1);
        }
        return rows;
      }
    }

    for (let r = ctx.scanIdx; r < ctx.rows.length; r++) {
      const row = ctx.rows[r];
      if (!row) continue;
      const cell0 = this.getCellString(row, 0).toLowerCase();
      if (cell0 === headerIdentifier.toLowerCase()) {
        const subRows: GridRow[] = [];
        let nextR = r + 1;
        for (; nextR < ctx.rows.length; nextR++) {
          const nextRow = ctx.rows[nextR];
          if (!nextRow || nextRow.every((c: GridCellPrimitive) => c === undefined || c === null || String(c).trim() === '')) {
            break;
          }
          subRows.push(nextRow);
        }
        ctx.scanIdx = nextR + 1;
        return subRows;
      }
    }

    return [];
  }

  /**
   * Parses Table 1 (Manifest) on _Config tab.
   */
  private static parseManifestSubtable(ctx: ConfigTabContext): Record<string, string> {
    const rows = this.resolveSubtable('Config_Manifest', 'Key', ctx);
    const manifest: Record<string, string> = {};
    for (const r of rows) {
      const k = this.getCellString(r, MANIFEST_COL_KEY);
      const v = this.getCellString(r, MANIFEST_COL_VALUE);
      if (k) manifest[k] = v;
    }
    return manifest;
  }

  /**
   * Parses Table 2 (DocTypes) on _Config tab.
   */
  private static parseDocTypesSubtable(
    ctx: ConfigTabContext
  ): Array<{ key: string; name: string; prefix: string; label: string }> {
    let rows = this.resolveSubtable('Config_DocTypes', 'DocTypeKey', ctx);
    if (rows.length === 0) {
      rows = this.resolveSubtable('_Config_Doc_Types', 'DocTypeKey', ctx);
    }
    const docTypes: Array<{ key: string; name: string; prefix: string; label: string }> = [];
    for (const r of rows) {
      const key = this.getCellString(r, DOCTYPE_COL_KEY);
      if (key) {
        docTypes.push({
          key,
          name: this.getCellString(r, DOCTYPE_COL_NAME) || key,
          prefix: this.getCellString(r, DOCTYPE_COL_PREFIX),
          label: this.getCellString(r, DOCTYPE_COL_LABEL) || this.getCellString(r, DOCTYPE_COL_NAME) || key,
        });
      }
    }
    return docTypes;
  }

  /**
   * Parses Table 3 (Identity) on _Config tab.
   */
  private static parseIdentitySubtable(rows: GridRow[]): DocumentIdentitySpec {
    const r = rows[0] || [];
    return {
      format: this.getCellString(r, IDENTITY_COL_FORMAT),
      groupFormat: this.getCellString(r, IDENTITY_COL_GROUP_FORMAT),
      revisionGroupFormat: this.getCellString(r, IDENTITY_COL_REV_GROUP_FORMAT),
    };
  }

  /**
   * Parses Table 4 (Storage) on _Config tab.
   */
  private static parseStorageSubtable(rows: GridRow[]): PolymorphicStorageSpec[] {
    const storage: PolymorphicStorageSpec[] = [];
    for (const r of rows) {
      const type = this.getCellString(r, STORAGE_COL_TYPE).toLowerCase();
      if (!type) continue;
      if (type === 'drive') {
        const rootTerms = this.getCellStringList(r, STORAGE_COL_ROOT_TERMS);
        const projTerms = this.getCellStringList(r, STORAGE_COL_PROJ_TERMS);
        const closedRoot = this.getCellString(r, STORAGE_COL_CLOSED_ROOT);
        const closedSub = this.getCellString(r, STORAGE_COL_CLOSED_SUB);
        const prefix = this.getCellString(r, STORAGE_COL_PREFIX);
        const filenameFmt = this.getCellString(r, STORAGE_COL_FILENAME_FMT);
        const coverPageId = this.getCellString(r, STORAGE_COL_COVER_PAGE);

        const driveSt: DriveStorageSpec = {
          type: 'drive',
          rootFolderSearchTerms: rootTerms,
          closedRootFolderName: closedRoot,
          ...(projTerms.length > 0 ? { projectSearchTerms: projTerms } : {}),
          ...(closedSub ? { closedSubfolderFormat: closedSub } : {}),
          ...(prefix ? { filenamePrefix: prefix } : {}),
          ...(filenameFmt ? { filenameFormat: filenameFmt } : {}),
          ...(coverPageId ? { coverPageTemplateId: coverPageId } : {}),
        };
        storage.push(driveSt);
      } else {
        storage.push({ type });
      }
    }
    return storage;
  }

  /**
   * Parses Table 5 (Workflows) on _Config tab.
   */
  private static parseWorkflowsSubtable(
    rows: GridRow[],
    errors: string[]
  ): WorkflowSpec[] {
    const workflows: WorkflowSpec[] = [];
    for (const r of rows) {
      const context = this.getCellString(r, WORKFLOW_COL_CONTEXT);
      if (!context) continue;
      let fieldMatches: FieldMatchRule[] | undefined = undefined;
      const rawMatches = this.getCellString(r, WORKFLOW_COL_FIELD_MATCHES);
      if (rawMatches) {
        try {
          fieldMatches = JSON.parse(rawMatches);
        } catch (err: unknown) {
          errors.push(`Malformed JSON in Workflows fieldMatches ('${rawMatches}'): ${this.getErrorMessage(err)}`);
        }
      }
      const sequence = this.getCellStringList(r, WORKFLOW_COL_SEQUENCE);
      workflows.push({
        context,
        sequence,
        ...(fieldMatches ? { fieldMatches } : {}),
      });
    }
    return workflows;
  }

  /**
   * Parses Table 6 (Fields) on _Config tab.
   */
  private static parseFieldsSubtable(rows: GridRow[]): DocumentFieldSpec[] {
    const fields: DocumentFieldSpec[] = [];
    for (const r of rows) {
      const key = this.getCellString(r, FIELD_COL_KEY);
      if (!key) continue;

      const header = this.getCellString(r, FIELD_COL_HEADER);
      const label = this.getCellString(r, FIELD_COL_LABEL) || header || key;
      const type = (this.getCellString(r, FIELD_COL_TYPE).toLowerCase() || 'string') as DocumentFieldSpec['type'];
      const isCalculated = this.getCellBoolean(r, FIELD_COL_IS_CALCULATED);
      const rawFormula = this.getCellString(r, FIELD_COL_FORMULA);
      const optionsRange = this.getCellString(r, FIELD_COL_OPTIONS_RANGE);
      const required = this.getCellBoolean(r, FIELD_COL_REQUIRED);
      const description = this.getCellString(r, FIELD_COL_DESCRIPTION);
      const defaultValue = r[FIELD_COL_DEFAULT_VALUE] !== undefined && r[FIELD_COL_DEFAULT_VALUE] !== null && String(r[FIELD_COL_DEFAULT_VALUE]).trim() !== '' ? r[FIELD_COL_DEFAULT_VALUE] : undefined;
      const keyNorm = this.getCellString(r, FIELD_COL_KEY_NORM).toLowerCase() as 'picklist' | 'code' | 'exact' | '';
      const numFmt = this.getCellString(r, FIELD_COL_NUMBER_FMT);

      const field: DocumentFieldSpec = {
        key,
        label,
        type,
        ...(header ? { header } : {}),
        ...(required ? { required: true } : {}),
        ...(description ? { description } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {}),
        ...(keyNorm ? { keyNormalizationRule: keyNorm } : {}),
        ...(numFmt ? { numberFormat: numFmt } : {}),
      };

      if (isCalculated) {
        field.isCalculated = true;
        if (rawFormula.startsWith('${') || (rawFormula.includes('${') && !rawFormula.startsWith('='))) {
          field.calcFormat = rawFormula;
        } else if (rawFormula) {
          field.formulaOrFunction = rawFormula;
        }
      }

      if (optionsRange) {
        field.optionsRange = optionsRange;
      }

      fields.push(field);
    }
    return fields;
  }

  /**
   * Decompiles _Config tab subtables into candidate DocumentTypeSpec objects.
   */
  private static decompileConfigTab(
    configRows: GridRow[],
    namedRanges: NamedRangePayload[],
    supportData: SupportDataCollection
  ): DecompileExtractionResult {
    const specs: Partial<DocumentTypeSpec>[] = [];
    const errors: string[] = [];
    const ctx: ConfigTabContext = {
      rows: configRows,
      namedRanges,
      scanIdx: 0,
    };

    // Parse Manifest (Table 1)
    const manifest = this.parseManifestSubtable(ctx);
    const schemaVersion = manifest['MANIFEST_SCHEMA_VERSION'];
    if (!schemaVersion) {
      errors.push('_Config tab is missing valid MANIFEST_SCHEMA_VERSION in Manifest table');
    }

    // Parse DocTypes (Table 2)
    const docTypes = this.parseDocTypesSubtable(ctx);
    if (docTypes.length === 0 && errors.length === 0) {
      return { specs: [], errors: ['No document type configurations found in _Config tab'] };
    }

    for (const dt of docTypes) {
      const specKey = dt.key;

      // Identity Subtable (Table 3)
      const identityRows = this.resolveSubtable(`Config_${specKey}_Identity`, 'Format', ctx);
      const identity = this.parseIdentitySubtable(identityRows);

      // Storage Subtable (Table 4)
      const storageRows = this.resolveSubtable(`Config_${specKey}_Storage`, 'Type', ctx);
      const storage = this.parseStorageSubtable(storageRows);

      // Workflows Subtable (Table 5)
      const workflowRows = this.resolveSubtable(`Config_${specKey}_Workflows`, 'Context', ctx);
      const workflows = this.parseWorkflowsSubtable(workflowRows, errors);

      // Fields Subtable (Table 6)
      const fieldRows = this.resolveSubtable(`Config_${specKey}_Fields`, 'Key', ctx);
      const fields = this.parseFieldsSubtable(fieldRows);

      // Attach Support Data
      const specSupportData: Record<string, SupportDataSpec> = {
        ...supportData.shared,
        ...(supportData.perType.get(dt.label) || {}),
        ...(supportData.perType.get(dt.name) || {}),
        ...(supportData.perType.get(dt.key) || {}),
      };

      // Link picklistSource for fields if optionsRange matches a SupportData dataset
      fields.forEach((f) => {
        if (f.optionsRange && specSupportData[f.optionsRange]) {
          const ds = specSupportData[f.optionsRange];
          if (ds && ds.columns && ds.columns.length > 0 && !f.picklistSource) {
            const pkCol = ds.columns.find((c) => c.isPrimaryKey) || ds.columns[0];
            const dispCol = ds.columns.find((c) => c.isDisplayLabel) || ds.columns[1] || pkCol;
            f.picklistSource = {
              supportDataKey: ds.key,
              valueColumnKey: pkCol.key,
              displayColumnKey: dispCol.key,
            };
          }
        }
      });

      const candidateSpec: Partial<DocumentTypeSpec> = {
        key: specKey,
        name: dt.name,
        label: dt.label,
        identity,
        fields,
        storage,
        workflows,
        ...(Object.keys(specSupportData).length > 0 ? { supportData: specSupportData } : {}),
      };

      specs.push(candidateSpec);
    }

    return { specs, errors };
  }

  /**
   * Compiles and creates/updates log tabs for each DocumentTypeSpec.
   */
  private static compileLogTabs(specs: DocumentTypeSpec[], tabs: TabSpec[]): void {
    for (const spec of specs) {
      const logTabName = spec.label || spec.name;

      // Build column coordinates map for all fields (Row 4 data start)
      const columnMap: Record<string, string> = {};
      spec.fields.forEach((field, idx) => {
        const colLetter = getColumnLetter(idx);
        columnMap[field.key] = `${colLetter}${DATA_ROW_START_INDEX}:${colLetter}`;
      });

      // Build ColumnSpec array
      const columns: ColumnSpec[] = spec.fields.map((field) => {
        const colSpec: ColumnSpec = {
          id: field.key,
          header: field.header || field.label,
        };

        if (field.numberFormat) {
          colSpec.numberFormat = field.numberFormat;
        }

        if (field.isCalculated) {
          if (field.formulaOrFunction) {
            colSpec.formula = field.formulaOrFunction;
          } else if (field.calcFormat) {
            colSpec.formula = TemplateFormatCompiler.compileToSheetsFormula(
              field.calcFormat,
              columnMap
            );
          }
        }

        if (field.picklistSource) {
          colSpec.validationRule = {
            type: 'LIST_FROM_RANGE',
            targetNamedRange: field.picklistSource.supportDataKey,
            allowInvalid: false,
          };
        } else if (field.optionsRange) {
          colSpec.validationRule = {
            type: 'LIST_FROM_RANGE',
            targetNamedRange: field.optionsRange,
            allowInvalid: false,
          };
        }

        return colSpec;
      });

      // Create or update the Log Tab
      const existingTabIdx = tabs.findIndex((t) => t.name === logTabName);
      const logTab: TabSpec = {
        name: logTabName,
        rowCount: DEFAULT_LOG_TAB_ROW_COUNT,
        columnCount: Math.max(columns.length, DEFAULT_LOG_TAB_MIN_COLUMN_COUNT),
        isLogTab: true,
        columns,
        seedRows: existingTabIdx >= 0 ? tabs[existingTabIdx].seedRows : undefined,
      };

      if (existingTabIdx >= 0) {
        tabs[existingTabIdx] = logTab;
      } else {
        tabs.push(logTab);
      }
    }
  }

  /**
   * Compiles and creates/updates _Shared and <Type> Support tabs from supportData definitions,
   * generating single full-table Named Ranges per dataset.
   */
  private static compileSupportTabs(
    specs: DocumentTypeSpec[],
    tabs: TabSpec[],
    namedRanges: NamedRangeSpec[]
  ): void {
    const generatedNamedRanges: NamedRangeSpec[] = [];

    const registerNamedRange = (name: string, tabName: string, rangeNotation: string) => {
      generatedNamedRanges.push({
        name,
        tabName,
        rangeNotation,
        scope: 'Workbook',
      });
    };

    // 1. Group supportData into shared datasets and per-spec datasets
    const sharedDatasetsMap = new Map<string, SupportDataSpec>();
    const specSupportMap = new Map<string, { tabName: string; datasets: SupportDataSpec[] }>();

    for (const spec of specs) {
      if (!spec.supportData) continue;
      const specSupportTabName = `${spec.label || spec.name} Support`;

      for (const [key, ds] of Object.entries(spec.supportData)) {
        const dataset: SupportDataSpec = { ...ds, key: ds.key || key };
        if (dataset.isShared === true) {
          if (!sharedDatasetsMap.has(dataset.key)) {
            sharedDatasetsMap.set(dataset.key, dataset);
          }
        } else {
          if (!specSupportMap.has(specSupportTabName)) {
            specSupportMap.set(specSupportTabName, { tabName: specSupportTabName, datasets: [] });
          }
          const entry = specSupportMap.get(specSupportTabName)!;
          if (!entry.datasets.some((d) => d.key === dataset.key)) {
            entry.datasets.push(dataset);
          }
        }
      }
    }

    // Helper to compile a support tab layout given an array of SupportDataSpec
    const buildSupportTabSeedRowsAndNamedRanges = (
      tabName: string,
      datasets: SupportDataSpec[],
      defaultRowCount: number
    ): { seedRows: (string | number | boolean)[][]; tabRowCount: number; tabColumnCount: number } => {
      let maxDataRows = 0;
      let totalCols = 0;

      const datasetLayouts: Array<{
        dataset: SupportDataSpec;
        startCol: number;
        numCols: number;
        columns: SupportDataColumnSpec[];
      }> = [];

      for (const ds of datasets) {
        let cols = ds.columns || [];
        if (cols.length === 0 && ds.items && ds.items.length > 0) {
          cols = Object.keys(ds.items[0]).map((k) => ({ key: k, type: 'string' as const }));
        }
        const numCols = Math.max(1, cols.length);
        datasetLayouts.push({
          dataset: ds,
          startCol: totalCols,
          numCols,
          columns: cols,
        });
        totalCols += numCols;
        maxDataRows = Math.max(maxDataRows, ds.items?.length || 0);
      }

      const tabRowCount = Math.max(defaultRowCount, maxDataRows + 10);
      const tabColumnCount = Math.max(10, totalCols);

      const seedRows: (string | number | boolean)[][] = [];

      // Row 0: Headers
      const headerRow: string[] = new Array(totalCols).fill('');
      for (const layout of datasetLayouts) {
        layout.columns.forEach((c, idx) => {
          headerRow[layout.startCol + idx] = c.key;
        });
      }
      seedRows.push(headerRow);

      // Subsequent rows: data items
      for (let r = 0; r < maxDataRows; r++) {
        const dataRow: (string | number | boolean)[] = new Array(totalCols).fill('');
        for (const layout of datasetLayouts) {
          const items = layout.dataset.items || [];
          if (r < items.length) {
            const item = items[r];
            layout.columns.forEach((c, idx) => {
              const val = item[c.key];
              dataRow[layout.startCol + idx] = val !== undefined && val !== null ? val : '';
            });
          }
        }
        seedRows.push(dataRow);
      }

      // Generate single full-table Named Ranges spanning all columns
      for (const layout of datasetLayouts) {
        const startLetter = getColumnLetter(layout.startCol);
        const endLetter = getColumnLetter(layout.startCol + layout.numCols - 1);
        const rangeNotation = `${startLetter}2:${endLetter}${tabRowCount}`;
        registerNamedRange(layout.dataset.key, tabName, rangeNotation);
      }

      return { seedRows, tabRowCount, tabColumnCount };
    };

    // 2. Compile per-spec <Type> Support tabs
    for (const { tabName, datasets } of Array.from(specSupportMap.values())) {
      if (datasets.length === 0) continue;
      const { seedRows, tabRowCount, tabColumnCount } = buildSupportTabSeedRowsAndNamedRanges(
        tabName,
        datasets,
        50
      );

      const existingTabIdx = tabs.findIndex((t) => t.name === tabName);
      const supportTab: TabSpec = {
        name: tabName,
        rowCount: tabRowCount,
        columnCount: tabColumnCount,
        isSupportTab: true,
        seedRows,
      };

      if (existingTabIdx >= 0) {
        tabs[existingTabIdx] = {
          ...tabs[existingTabIdx],
          ...supportTab,
        };
      } else {
        tabs.push(supportTab);
      }
    }

    // 3. Compile _Shared tab
    if (sharedDatasetsMap.size > 0) {
      const sharedDatasets = Array.from(sharedDatasetsMap.values());
      const { seedRows, tabRowCount, tabColumnCount } = buildSupportTabSeedRowsAndNamedRanges(
        '_Shared',
        sharedDatasets,
        100
      );

      const existingSharedTabIdx = tabs.findIndex((t) => t.name === '_Shared');
      const sharedTab: TabSpec = {
        name: '_Shared',
        rowCount: tabRowCount,
        columnCount: Math.max(20, tabColumnCount),
        isSharedTab: true,
        seedRows,
      };

      if (existingSharedTabIdx >= 0) {
        tabs[existingSharedTabIdx] = {
          ...tabs[existingSharedTabIdx],
          ...sharedTab,
        };
      } else {
        tabs.push(sharedTab);
      }
    }

    // Merge generated named ranges
    for (const genNR of generatedNamedRanges) {
      const existingIdx = namedRanges.findIndex((nr) => nr.name === genNR.name);
      if (existingIdx >= 0) {
        namedRanges[existingIdx] = genNR;
      } else {
        namedRanges.push(genNR);
      }
    }
  }

  /**
   * Compiles the centralized _Config tab and registers workbook-scoped Named Ranges.
   */
  private static compileConfigTab(
    specs: DocumentTypeSpec[],
    baseSpec: Partial<DocumentLogWorkbookSpec> | undefined,
    tabs: TabSpec[],
    namedRanges: NamedRangeSpec[]
  ): void {
    const configSeedRows: (string | number | boolean)[][] = [];
    const generatedNamedRanges: NamedRangeSpec[] = [];

    const addNamedRange = (name: string, rangeNotation: string) => {
      generatedNamedRanges.push({
        name,
        tabName: '_Config',
        rangeNotation,
        scope: 'Workbook',
      });
    };

    // Table 1: Manifest Table (Rows 1-5)
    configSeedRows.push(['Key', 'Value']);
    configSeedRows.push(['MANIFEST_SCHEMA_VERSION', baseSpec?.schemaVersion || DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION]);
    configSeedRows.push(['LOG_TITLE', 'INC Project Document Log']);
    configSeedRows.push(['PROJECT_ABBREVIATION', 'INC']);
    configSeedRows.push(['CONTACT_CHAIN_MAX', '-5']);

    addNamedRange('MANIFEST_SCHEMA_VERSION', 'B2');
    addNamedRange('Config_Manifest', 'A1:B5');

    // Table 2: DocTypes Table (Row 7+)
    configSeedRows.push(['', '']); // Row 6 blank separator
    const docTypesHeaderRow = configSeedRows.length + 1; // Row 7
    configSeedRows.push(['DocTypeKey', 'DisplayName', 'Prefix', 'LogTabName']);

    specs.forEach((spec, idx) => {
      const rowNum = docTypesHeaderRow + 1 + idx;
      let prefix = '';
      if (spec.key === 'SUBMITTAL_ARCH' || spec.key === 'Submittal_Arch') {
        prefix = 'SUB-ARCH';
      } else if (spec.key === 'SUBMITTAL_FFE' || spec.key === 'Submittal_FFE') {
        prefix = 'SUB-FFE';
      } else {
        const driveStorage = spec.storage?.find((s): s is DriveStorageSpec => s.type === 'drive');
        prefix = driveStorage?.filenamePrefix || spec.key.replace(/_/g, '-');
      }

      configSeedRows.push([
        spec.key,
        spec.name,
        prefix,
        spec.label || spec.name,
      ]);

      addNamedRange(`Config_${spec.key}`, `A${rowNum}:D${rowNum}`);
    });

    const docTypesEndRow = docTypesHeaderRow + specs.length;
    addNamedRange('Config_DocTypes', `A${docTypesHeaderRow}:D${docTypesEndRow}`);
    addNamedRange('_Config_Doc_Types', `A${docTypesHeaderRow}:D${docTypesEndRow}`);

    // Tables 3-6: Per-DocType Identity, Storage, Workflows, Fields Subtables
    for (const spec of specs) {
      // Table 3: Identity Subtable
      configSeedRows.push(['', '', '']); // separator
      const identityHeaderRow = configSeedRows.length + 1;
      configSeedRows.push(['Format', 'GroupFormat', 'RevisionGroupFormat']);
      configSeedRows.push([
        spec.identity?.format || '',
        spec.identity?.groupFormat || '',
        spec.identity?.revisionGroupFormat || '',
      ]);
      const identityEndRow = identityHeaderRow + 1;
      addNamedRange(`Config_${spec.key}_Identity`, `A${identityHeaderRow}:C${identityEndRow}`);

      // Table 4: Storage Subtable
      configSeedRows.push(['', '', '', '', '', '', '', '']); // separator
      const storageHeaderRow = configSeedRows.length + 1;
      configSeedRows.push([
        'Type',
        'RootFolderSearchTerms',
        'ProjectSearchTerms',
        'ClosedRootFolderName',
        'ClosedSubfolderFormat',
        'FilenamePrefix',
        'FilenameFormat',
        'CoverPageTemplateId',
      ]);

      if (spec.storage && spec.storage.length > 0) {
        for (const st of spec.storage) {
          if (st.type === 'drive') {
            const driveSt = st as DriveStorageSpec;
            configSeedRows.push([
              'drive',
              (driveSt.rootFolderSearchTerms || []).join(','),
              (driveSt.projectSearchTerms || []).join(','),
              driveSt.closedRootFolderName || '',
              driveSt.closedSubfolderFormat || '',
              driveSt.filenamePrefix || '',
              driveSt.filenameFormat || '',
              driveSt.coverPageTemplateId || '',
            ]);
          } else {
            configSeedRows.push([st.type, '', '', '', '', '', '', '']);
          }
        }
      }
      const storageEndRow = storageHeaderRow + (spec.storage?.length || 0);
      addNamedRange(
        `Config_${spec.key}_Storage`,
        `A${storageHeaderRow}:H${Math.max(storageHeaderRow, storageEndRow)}`
      );

      // Table 5: Workflows Subtable
      configSeedRows.push(['', '', '']); // separator
      const workflowsHeaderRow = configSeedRows.length + 1;
      configSeedRows.push(['Context', 'FieldMatches', 'Sequence']);

      if (spec.workflows && spec.workflows.length > 0) {
        for (const wf of spec.workflows) {
          configSeedRows.push([
            wf.context || '',
            wf.fieldMatches ? JSON.stringify(wf.fieldMatches) : '',
            (wf.sequence || []).join(','),
          ]);
        }
      }
      const workflowsEndRow = workflowsHeaderRow + (spec.workflows?.length || 0);
      addNamedRange(
        `Config_${spec.key}_Workflows`,
        `A${workflowsHeaderRow}:C${Math.max(workflowsHeaderRow, workflowsEndRow)}`
      );

      // Table 6: Fields Subtable
      configSeedRows.push(['', '', '', '', '', '', '', '', '', '', '', '']); // separator
      const fieldsHeaderRow = configSeedRows.length + 1;
      configSeedRows.push([
        'Key',
        'Header',
        'Label',
        'Type',
        'IsCalculated',
        'FormulaOrFunction',
        'OptionsRange',
        'Required',
        'Description',
        'DefaultValue',
        'KeyNormalizationRule',
        'NumberFormat',
      ]);

      if (spec.fields && spec.fields.length > 0) {
        for (const f of spec.fields) {
          const optRange = f.picklistSource ? f.picklistSource.supportDataKey : f.optionsRange || '';
          const formulaOrFormat = f.formulaOrFunction || f.calcFormat || '';
          configSeedRows.push([
            f.key,
            f.header || f.label,
            f.label,
            f.type,
            f.isCalculated ? 'TRUE' : 'FALSE',
            formulaOrFormat,
            optRange,
            f.required ? 'TRUE' : 'FALSE',
            f.description || '',
            f.defaultValue !== undefined ? String(f.defaultValue) : '',
            f.keyNormalizationRule || '',
            f.numberFormat || '',
          ]);
        }
      }
      const fieldsEndRow = fieldsHeaderRow + (spec.fields?.length || 0);
      addNamedRange(
        `Config_${spec.key}_Fields`,
        `A${fieldsHeaderRow}:L${Math.max(fieldsHeaderRow, fieldsEndRow)}`
      );
    }

    // Create or update the _Config Tab
    const existingConfigTabIdx = tabs.findIndex((t) => t.name === '_Config');
    const configTab: TabSpec = {
      name: '_Config',
      rowCount: Math.max(50, configSeedRows.length + 10),
      columnCount: 20,
      isConfigTab: true,
      seedRows: configSeedRows,
    };

    if (existingConfigTabIdx >= 0) {
      tabs[existingConfigTabIdx] = {
        ...tabs[existingConfigTabIdx],
        ...configTab,
        seedRows: configSeedRows,
      };
    } else {
      tabs.push(configTab);
    }

    // Merge named ranges: update or append generated named ranges
    for (const genNR of generatedNamedRanges) {
      const existingIdx = namedRanges.findIndex((nr) => nr.name === genNR.name);
      if (existingIdx >= 0) {
        namedRanges[existingIdx] = genNR;
      } else {
        namedRanges.push(genNR);
      }
    }
  }
}
