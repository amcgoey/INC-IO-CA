/**
 * @file GoogleSheetsDocumentTypeSpecAdapter.ts
 * @description Tier 2 GAS Infrastructure Adapter for DocumentTypeSpec.
 * Compiles DocumentTypeSpec[] into DocumentLogWorkbookSpec models.
 * Pure model translation logic: zero Node.js built-in imports.
 */

import type { DocumentTypeSpec } from '../../core/specs/DocumentTypeSpec';
import type {
  DocumentLogWorkbookSpec,
  TabSpec,
  ColumnSpec,
  NamedRangeSpec,
} from '../../core/config/DocumentLogWorkbookSpec';
import { DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION } from '../../core/config/DocumentLogWorkbookSpec';
import { TemplateFormatCompiler } from '../../core/specs/TemplateFormatCompiler';

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
   * Transpiles calcFormat definitions on log tabs into =MAP(..., LAMBDA(...)) Row 2 spill formulas.
   */
  public static compileWorkbookSpec(
    specs: DocumentTypeSpec[],
    baseSpec?: Partial<DocumentLogWorkbookSpec>
  ): DocumentLogWorkbookSpec {
    const tabs: TabSpec[] = baseSpec?.tabs ? [...baseSpec.tabs] : [];
    const namedRanges: NamedRangeSpec[] = baseSpec?.namedRanges ? [...baseSpec.namedRanges] : [];

    for (const spec of specs) {
      const logTabName = spec.label || spec.name;

      // 1. Build column coordinates map for all fields (Row 4 data start)
      const columnMap: Record<string, string> = {};
      spec.fields.forEach((field, idx) => {
        const colLetter = getColumnLetter(idx);
        columnMap[field.key] = `${colLetter}4:${colLetter}`;
      });

      // 2. Build ColumnSpec array
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

      // 3. Create or update the Log Tab
      const existingTabIdx = tabs.findIndex((t) => t.name === logTabName);
      const logTab: TabSpec = {
        name: logTabName,
        rowCount: 25,
        columnCount: Math.max(columns.length, 26),
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

    return {
      schemaVersion: baseSpec?.schemaVersion || DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
      tabs,
      namedRanges,
    };
  }
}
