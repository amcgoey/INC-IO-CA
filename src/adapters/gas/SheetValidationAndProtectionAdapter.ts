/**
 * @file SheetValidationAndProtectionAdapter.ts
 * @description Tier 2 GAS Infrastructure Adapter encapsulating Google Sheets DataValidation and Range Protection APIs.
 * Implements declarative cell formatting (applyNumberFormats) across data columns during workbook provisioning and auto-patching.
 */

import { DocumentLogWorkbookSpec, DOCUMENT_LOG_WORKBOOK_SPEC } from "../../core/config/DocumentLogWorkbookSpec";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from "../../core/config/DocumentLogWorkbookViewSpec";

export class SheetValidationAndProtectionAdapter {
  /**
   * Applies declarative numberFormat strings to data columns across log tabs.
   */
  public applyNumberFormats(
    spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | any,
    spec: DocumentLogWorkbookSpec = DOCUMENT_LOG_WORKBOOK_SPEC
  ): void {
    if (!spreadsheet || !spec || !spec.tabs) return;

    const firstDataRow = DOCUMENT_LOG_WORKBOOK_VIEW_SPEC?.offsets?.FIRST_DATA_ROW_INDEX || 6;

    for (const tab of spec.tabs) {
      if (!tab.isLogTab || !tab.columns || tab.columns.length === 0) {
        continue;
      }

      const sheet = spreadsheet.getSheetByName(tab.name);
      if (!sheet) continue;

      const maxRows = typeof sheet.getMaxRows === "function" ? sheet.getMaxRows() : (tab.rowCount || 25);
      const numRows = Math.max(1, maxRows - firstDataRow + 1);

      tab.columns.forEach((colSpec, idx) => {
        if (colSpec.numberFormat) {
          const colIdx = idx + 1;
          const range = sheet.getRange(firstDataRow, colIdx, numRows, 1);
          if (range && typeof range.setNumberFormat === "function") {
            range.setNumberFormat(colSpec.numberFormat);
          }
        }
      });
    }
  }
}

const defaultSheetValidationAndProtectionAdapter = new SheetValidationAndProtectionAdapter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SheetValidationAndProtectionAdapter,
    defaultSheetValidationAndProtectionAdapter
  };
}

(globalThis as any).SheetValidationAndProtectionAdapter = SheetValidationAndProtectionAdapter;
(globalThis as any).defaultSheetValidationAndProtectionAdapter = defaultSheetValidationAndProtectionAdapter;
