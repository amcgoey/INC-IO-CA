/**
 * @file GoogleSheetsDocumentTypeSpecAdapter.ts
 * @description Tier 2 GAS Infrastructure Adapter for DocumentTypeSpec.
 * Compiles DocumentTypeSpec[] into DocumentLogWorkbookSpec models.
 * Pure model translation logic: zero Node.js built-in imports.
 */

import type {
  DocumentTypeSpec,
  DriveStorageSpec,
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
          configSeedRows.push([
            f.key,
            f.header || f.label,
            f.label,
            f.type,
            f.isCalculated ? 'TRUE' : 'FALSE',
            f.formulaOrFunction || '',
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
