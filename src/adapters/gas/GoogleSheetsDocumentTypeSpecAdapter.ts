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
} from './SpreadsheetBatchReaderAdapter';

/** Log Tab default layout constants */
const DATA_ROW_START_INDEX = 4;
const DEFAULT_LOG_TAB_ROW_COUNT = 25;
const DEFAULT_LOG_TAB_MIN_COLUMN_COUNT = 26;

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
    const tabs: TabSpec[] = baseSpec?.tabs ? [...baseSpec.tabs] : [];
    const namedRanges: NamedRangeSpec[] = baseSpec?.namedRanges ? [...baseSpec.namedRanges] : [];

    // 1. Process Log Tabs
    this.compileLogTabs(specs, tabs);

    // 2. Process Support Tabs (_Shared and <Type> Support)
    this.compileSupportTabs(specs, tabs, namedRanges);

    // 3. Build centralized _Config Tab and register Named Ranges
    this.compileConfigTab(specs, baseSpec, tabs, namedRanges);

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

    if ('readWorkbookBatch' in input && typeof (input as any).readWorkbookBatch === 'function') {
      if (!spreadsheetId) {
        return [{ status: 'invalid', errors: ['Missing required spreadsheetId for SpreadsheetBatchReaderAdapter'] }];
      }
      try {
        batchData = (input as SpreadsheetBatchReaderAdapter).readWorkbookBatch(spreadsheetId);
      } catch (err: unknown) {
        const msg = err && typeof err === 'object' && 'message' in err ? String((err as any).message) : String(err);
        return [{ status: 'invalid', errors: [`Spreadsheet batch read error: ${msg}`] }];
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
    const { sharedSupportData, typeSupportMap } = this.decompileSupportTabs(
      batchData.sheets,
      batchData.namedRanges || []
    );

    // 2. Decompile _Config Tab Subtables
    const candidateSpecs = this.decompileConfigTab(
      configRows,
      batchData.namedRanges || [],
      sharedSupportData,
      typeSupportMap
    );

    if (candidateSpecs.length === 0) {
      return [{ status: 'invalid', errors: ['No document type configurations found in _Config tab'] }];
    }

    // 3. Validate candidate specs through ValidationEngine
    return candidateSpecs.map((spec) => ValidationEngine.validateSpec(spec));
  }

  /**
   * Normalizes SheetPayload grid data into a 2D array of primitives.
   */
  private static extractGridRows(sheet?: SheetPayload): any[][] {
    if (!sheet || !sheet.data || sheet.data.length === 0) return [];
    const rows: any[][] = [];

    for (const gridData of sheet.data) {
      if (!gridData || !gridData.rowData) continue;
      const startRow = (gridData as any).startRow || 0;
      const startCol = (gridData as any).startColumn || 0;

      gridData.rowData.forEach((rowData, rIdx) => {
        const rowNum = startRow + rIdx;
        if (!rows[rowNum]) {
          rows[rowNum] = [];
        }
        if (rowData && rowData.values) {
          rowData.values.forEach((cell, cIdx) => {
            const colNum = startCol + cIdx;
            if (!cell || !cell.userEnteredValue) {
              rows[rowNum][colNum] = '';
              return;
            }
            const uev = cell.userEnteredValue;
            if (uev.stringValue !== undefined) rows[rowNum][colNum] = uev.stringValue;
            else if (uev.numberValue !== undefined) rows[rowNum][colNum] = uev.numberValue;
            else if (uev.boolValue !== undefined) rows[rowNum][colNum] = uev.boolValue;
            else if (uev.formulaValue !== undefined) rows[rowNum][colNum] = uev.formulaValue;
            else rows[rowNum][colNum] = '';
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
   * Decompiles Support Tabs (_Shared and <Type> Support) into SupportDataSpec maps.
   */
  private static decompileSupportTabs(
    sheets: SheetPayload[],
    namedRanges: NamedRangePayload[]
  ): {
    sharedSupportData: Record<string, SupportDataSpec>;
    typeSupportMap: Map<string, Record<string, SupportDataSpec>>;
  } {
    const sharedSupportData: Record<string, SupportDataSpec> = {};
    const typeSupportMap = new Map<string, Record<string, SupportDataSpec>>();

    for (const sheet of sheets) {
      const title = sheet.properties?.title || '';
      const isShared = title === '_Shared';
      const isSupport = title.endsWith(' Support');

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

      const processedDatasets: SupportDataSpec[] = [];

      if (tabNamedRanges.length > 0) {
        for (const nr of tabNamedRanges) {
          const datasetKey = nr.name || '';
          if (!datasetKey || datasetKey.startsWith('Config_') || datasetKey.startsWith('MANIFEST_')) continue;

          const startCol = nr.range?.startColumnIndex ?? 0;
          const endCol = nr.range?.endColumnIndex ?? headerRow.length;
          const startRow = nr.range?.startRowIndex ?? 1;
          const endRow = nr.range?.endRowIndex ?? gridRows.length;

          const columns: SupportDataColumnSpec[] = [];
          for (let c = startCol; c < endCol && c < headerRow.length; c++) {
            const colKey = String(headerRow[c] || '').trim();
            if (colKey) {
              columns.push({
                key: colKey,
                type: 'string',
              });
            }
          }

          if (columns.length === 0) continue;

          const items: Array<Record<string, any>> = [];
          for (let r = startRow; r < endRow && r < gridRows.length; r++) {
            const row = gridRows[r];
            if (!row) continue;

            const item: Record<string, any> = {};
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

          processedDatasets.push({
            key: datasetKey,
            isShared,
            columns,
            items,
          });
        }
      } else {
        // Fallback: contiguous column block scanning
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
              key: String(headerRow[c]).trim(),
              type: 'string',
            });
          }

          const datasetKey = columns[0]?.key || `Support_${blockStart}`;
          const items: Array<Record<string, any>> = [];
          for (let r = 1; r < gridRows.length; r++) {
            const row = gridRows[r];
            if (!row) continue;
            const item: Record<string, any> = {};
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

          processedDatasets.push({
            key: datasetKey,
            isShared,
            columns,
            items,
          });
        }
      }

      if (isShared) {
        for (const ds of processedDatasets) {
          sharedSupportData[ds.key] = ds;
        }
      } else if (isSupport) {
        const specNameOrLabel = title.replace(/\s+Support$/, '');
        if (!typeSupportMap.has(specNameOrLabel)) {
          typeSupportMap.set(specNameOrLabel, {});
        }
        const entry = typeSupportMap.get(specNameOrLabel)!;
        for (const ds of processedDatasets) {
          entry[ds.key] = ds;
        }
      }
    }

    return { sharedSupportData, typeSupportMap };
  }

  /**
   * Decompiles _Config tab subtables into candidate DocumentTypeSpec objects.
   */
  private static decompileConfigTab(
    configRows: any[][],
    namedRanges: NamedRangePayload[],
    sharedSupportData: Record<string, SupportDataSpec>,
    typeSupportMap: Map<string, Record<string, SupportDataSpec>>
  ): Partial<DocumentTypeSpec>[] {
    const specs: Partial<DocumentTypeSpec>[] = [];

    const getRowsByNamedRange = (nrName: string): any[][] | null => {
      const nr = namedRanges.find((r) => r.name === nrName);
      if (!nr || !nr.range) return null;
      const startRow = nr.range.startRowIndex ?? 0;
      const endRow = nr.range.endRowIndex ?? configRows.length;
      const startCol = nr.range.startColumnIndex ?? 0;
      const endCol = nr.range.endColumnIndex ?? (configRows[0]?.length || 20);

      const rows: any[][] = [];
      for (let r = startRow; r < endRow && r < configRows.length; r++) {
        const row = configRows[r];
        if (!row) continue;
        const rowSlice = row.slice(startCol, endCol);
        rows.push(rowSlice);
      }
      return rows;
    };

    // 1. Locate DocTypes Table
    const docTypeRows: Array<{ key: string; name: string; prefix: string; label: string }> = [];
    const docTypesNRRows = getRowsByNamedRange('Config_DocTypes') || getRowsByNamedRange('_Config_Doc_Types');

    if (docTypesNRRows && docTypesNRRows.length > 0) {
      const firstRowIsHeader = String(docTypesNRRows[0]?.[0] || '').toLowerCase() === 'doctypekey';
      const dataRows = firstRowIsHeader ? docTypesNRRows.slice(1) : docTypesNRRows;
      for (const row of dataRows) {
        const key = String(row[0] || '').trim();
        if (key) {
          docTypeRows.push({
            key,
            name: String(row[1] || key).trim(),
            prefix: String(row[2] || '').trim(),
            label: String(row[3] || row[1] || key).trim(),
          });
        }
      }
    } else {
      let docTypesHeaderIdx = -1;
      for (let i = 0; i < configRows.length; i++) {
        const row0 = String(configRows[i]?.[0] || '').trim();
        if (row0.toLowerCase() === 'doctypekey') {
          docTypesHeaderIdx = i;
          break;
        }
      }

      if (docTypesHeaderIdx >= 0) {
        for (let i = docTypesHeaderIdx + 1; i < configRows.length; i++) {
          const row = configRows[i];
          const key = String(row?.[0] || '').trim();
          if (!key) break;
          docTypeRows.push({
            key,
            name: String(row[1] || key).trim(),
            prefix: String(row[2] || '').trim(),
            label: String(row[3] || row[1] || key).trim(),
          });
        }
      }
    }

    if (docTypeRows.length === 0) {
      return [];
    }

    let currentIdx = 0;
    const findNextSubtableAfter = (
      startAfterRow: number,
      headerIdentifier: string
    ): { headerRowIdx: number; rows: any[][] } | null => {
      for (let r = startAfterRow; r < configRows.length; r++) {
        const row = configRows[r];
        if (!row) continue;
        const cell0 = String(row[0] || '').trim().toLowerCase();
        if (cell0 === headerIdentifier.toLowerCase()) {
          const subRows: any[][] = [];
          for (let nextR = r + 1; nextR < configRows.length; nextR++) {
            const nextRow = configRows[nextR];
            if (!nextRow || nextRow.every((c: any) => c === undefined || c === null || String(c).trim() === '')) {
              break;
            }
            subRows.push(nextRow);
          }
          return { headerRowIdx: r, rows: subRows };
        }
      }
      return null;
    };

    for (const dt of docTypeRows) {
      const specKey = dt.key;

      // Identity Subtable
      let identityRows = getRowsByNamedRange(`Config_${specKey}_Identity`);
      if (identityRows && identityRows.length > 0 && String(identityRows[0]?.[0] || '').toLowerCase() === 'format') {
        identityRows = identityRows.slice(1);
      }
      if (!identityRows || identityRows.length === 0) {
        const found = findNextSubtableAfter(currentIdx, 'Format');
        if (found) {
          identityRows = found.rows;
          currentIdx = found.headerRowIdx + 1;
        }
      }

      const idRow = identityRows?.[0] || [];
      const identity: DocumentIdentitySpec = {
        format: String(idRow[0] || '').trim(),
        groupFormat: String(idRow[1] || '').trim(),
        revisionGroupFormat: String(idRow[2] || '').trim(),
      };

      // Storage Subtable
      let storageRows = getRowsByNamedRange(`Config_${specKey}_Storage`);
      if (storageRows && storageRows.length > 0 && String(storageRows[0]?.[0] || '').toLowerCase() === 'type') {
        storageRows = storageRows.slice(1);
      }
      if (!storageRows || storageRows.length === 0) {
        const found = findNextSubtableAfter(currentIdx, 'Type');
        if (found) {
          storageRows = found.rows;
          currentIdx = found.headerRowIdx + 1;
        }
      }

      const storage: PolymorphicStorageSpec[] = [];
      if (storageRows) {
        for (const stRow of storageRows) {
          const type = String(stRow[0] || '').trim().toLowerCase();
          if (!type) continue;
          if (type === 'drive') {
            const rootTerms = stRow[1] ? String(stRow[1]).split(',').map((s) => s.trim()).filter(Boolean) : [];
            const projTerms = stRow[2] ? String(stRow[2]).split(',').map((s) => s.trim()).filter(Boolean) : undefined;
            const closedRoot = String(stRow[3] || '').trim();
            const closedSub = stRow[4] ? String(stRow[4]).trim() : undefined;
            const prefix = stRow[5] ? String(stRow[5]).trim() : undefined;
            const filenameFmt = stRow[6] ? String(stRow[6]).trim() : undefined;
            const coverPageId = stRow[7] ? String(stRow[7]).trim() : undefined;

            const driveSt: DriveStorageSpec = {
              type: 'drive',
              rootFolderSearchTerms: rootTerms,
              closedRootFolderName: closedRoot,
              ...(projTerms && projTerms.length > 0 ? { projectSearchTerms: projTerms } : {}),
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
      }

      // Workflows Subtable
      let workflowRows = getRowsByNamedRange(`Config_${specKey}_Workflows`);
      if (workflowRows && workflowRows.length > 0 && String(workflowRows[0]?.[0] || '').toLowerCase() === 'context') {
        workflowRows = workflowRows.slice(1);
      }
      if (!workflowRows || workflowRows.length === 0) {
        const found = findNextSubtableAfter(currentIdx, 'Context');
        if (found) {
          workflowRows = found.rows;
          currentIdx = found.headerRowIdx + 1;
        }
      }

      const workflows: WorkflowSpec[] = [];
      if (workflowRows) {
        for (const wfRow of workflowRows) {
          const context = String(wfRow[0] || '').trim();
          if (!context) continue;
          let fieldMatches: FieldMatchRule[] | undefined = undefined;
          if (wfRow[1] && String(wfRow[1]).trim()) {
            try {
              fieldMatches = JSON.parse(String(wfRow[1]));
            } catch {
              // Ignore invalid JSON in fieldMatches
            }
          }
          const sequence = wfRow[2] ? String(wfRow[2]).split(',').map((s) => s.trim()).filter(Boolean) : [];
          workflows.push({
            context,
            sequence,
            ...(fieldMatches ? { fieldMatches } : {}),
          });
        }
      }

      // Fields Subtable
      let fieldRows = getRowsByNamedRange(`Config_${specKey}_Fields`);
      if (fieldRows && fieldRows.length > 0 && String(fieldRows[0]?.[0] || '').toLowerCase() === 'key') {
        fieldRows = fieldRows.slice(1);
      }
      if (!fieldRows || fieldRows.length === 0) {
        const found = findNextSubtableAfter(currentIdx, 'Key');
        if (found) {
          fieldRows = found.rows;
          currentIdx = found.headerRowIdx + 1;
        }
      }

      const fields: DocumentFieldSpec[] = [];
      if (fieldRows) {
        for (const fRow of fieldRows) {
          const key = String(fRow[0] || '').trim();
          if (!key) continue;

          const header = fRow[1] ? String(fRow[1]).trim() : undefined;
          const label = String(fRow[2] || header || key).trim();
          const type = (String(fRow[3] || 'string').trim().toLowerCase()) as DocumentFieldSpec['type'];
          const isCalculated = fRow[4] === true || String(fRow[4]).trim().toUpperCase() === 'TRUE';
          const rawFormula = fRow[5] !== undefined && fRow[5] !== null ? String(fRow[5]).trim() : '';
          const optionsRange = fRow[6] ? String(fRow[6]).trim() : undefined;
          const required = fRow[7] === true || String(fRow[7]).trim().toUpperCase() === 'TRUE';
          const description = fRow[8] ? String(fRow[8]).trim() : undefined;
          const defaultValue = fRow[9] !== undefined && fRow[9] !== null && String(fRow[9]).trim() !== '' ? fRow[9] : undefined;
          const keyNorm = fRow[10] ? (String(fRow[10]).trim().toLowerCase() as 'picklist' | 'code' | 'exact') : undefined;
          const numFmt = fRow[11] ? String(fRow[11]).trim() : undefined;

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
      }

      // Attach Support Data
      const supportData: Record<string, SupportDataSpec> = {
        ...sharedSupportData,
        ...(typeSupportMap.get(dt.label) || {}),
        ...(typeSupportMap.get(dt.name) || {}),
        ...(typeSupportMap.get(dt.key) || {}),
      };

      // Link picklistSource for fields if optionsRange matches a SupportData dataset
      fields.forEach((f) => {
        if (f.optionsRange && supportData[f.optionsRange]) {
          const ds = supportData[f.optionsRange];
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
        ...(Object.keys(supportData).length > 0 ? { supportData } : {}),
      };

      specs.push(candidateSpec);
    }

    return specs;
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

    // 2. Compile _Shared tab
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

    // 3. Compile per-spec <Type> Support tabs
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
