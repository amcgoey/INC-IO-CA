/**
 * @file SheetValidationAndProtectionAdapter.ts
 * @description Tier 2 GAS Infrastructure Adapter encapsulating Google Sheets DataValidation, Protection, and Cell Formatting APIs.
 * Implements declarative cell formatting (applyNumberFormats) across data columns during workbook provisioning and patching.
 */

import { DocumentLogWorkbookSpec, DOCUMENT_LOG_WORKBOOK_SPEC } from "../../core/config/DocumentLogWorkbookSpec";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from "../../core/config/DocumentLogWorkbookViewSpec";

class SheetValidationAndProtectionAdapter {
  /**
   * Applies declarative numberFormat strings to data columns across log tabs.
   */
  /**
   * Applies DataValidation rules to picklist columns linked to target single-column Named Ranges.
   */
  public applyValidationRules(
    spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | any,
    spec: DocumentLogWorkbookSpec = DOCUMENT_LOG_WORKBOOK_SPEC
  ): void {
    if (!spreadsheet || !spec || !spec.tabs) return;

    const firstDataRow = DOCUMENT_LOG_WORKBOOK_VIEW_SPEC?.offsets?.FIRST_DATA_ROW_INDEX || 6;
    const spreadsheetApp = (globalThis as any).SpreadsheetApp;

    for (const tab of spec.tabs) {
      if (!tab.isLogTab || !tab.columns || tab.columns.length === 0) {
        continue;
      }

      const sheet = typeof spreadsheet.getSheetByName === "function" ? spreadsheet.getSheetByName(tab.name) : null;
      if (!sheet) continue;

      const maxRows = typeof sheet.getMaxRows === "function" ? sheet.getMaxRows() : (tab.rowCount || 25);
      const numRows = Math.max(1, maxRows - firstDataRow + 1);

      tab.columns.forEach((colSpec, idx) => {
        const ruleSpec = colSpec.validationRule;
        if (ruleSpec && ruleSpec.type === "LIST_FROM_RANGE" && ruleSpec.targetNamedRange) {
          const targetRange = typeof spreadsheet.getRangeByName === "function"
            ? spreadsheet.getRangeByName(ruleSpec.targetNamedRange)
            : null;

          if (targetRange) {
            const colIdx = idx + 1;
            const range = typeof sheet.getRange === "function" ? sheet.getRange(firstDataRow, colIdx, numRows, 1) : null;
            if (range && typeof range.setDataValidation === "function" && spreadsheetApp && typeof spreadsheetApp.newDataValidation === "function") {
              const builder = spreadsheetApp.newDataValidation();
              builder.requireValueInRange(targetRange);
              builder.setAllowInvalid(ruleSpec.allowInvalid);
              if (ruleSpec.helpText) {
                builder.setHelpText(ruleSpec.helpText);
              }
              const validation = builder.build();
              range.setDataValidation(validation);
            }
          }
        }
      });
    }
  }

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

      const sheet = typeof spreadsheet.getSheetByName === "function" ? spreadsheet.getSheetByName(tab.name) : null;
      if (!sheet) continue;

      const maxRows = typeof sheet.getMaxRows === "function" ? sheet.getMaxRows() : (tab.rowCount || 25);
      const numRows = Math.max(1, maxRows - firstDataRow + 1);

      tab.columns.forEach((colSpec, idx) => {
        if (colSpec.numberFormat) {
          const colIdx = idx + 1;
          const range = typeof sheet.getRange === "function" ? sheet.getRange(firstDataRow, colIdx, numRows, 1) : null;
          if (range && typeof range.setNumberFormat === "function") {
            range.setNumberFormat(colSpec.numberFormat);
          }
        }
      });
    }
  }
}

const defaultSheetValidationAndProtectionAdapter = new SheetValidationAndProtectionAdapter();

export {
  SheetValidationAndProtectionAdapter,
  defaultSheetValidationAndProtectionAdapter
};

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SheetValidationAndProtectionAdapter,
    defaultSheetValidationAndProtectionAdapter
  };
}

(globalThis as any).SheetValidationAndProtectionAdapter = SheetValidationAndProtectionAdapter;
(globalThis as any).defaultSheetValidationAndProtectionAdapter = defaultSheetValidationAndProtectionAdapter;
