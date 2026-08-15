/**
 * @file SheetValidationAndProtectionAdapter.ts
 * @description Tier 2 GAS Infrastructure Adapter encapsulating Google Sheets DataValidation, Protection, and Cell Formatting APIs.
 * Implements declarative cell formatting (applyNumberFormats) and data validation rules (applyValidationRules) across data columns during workbook provisioning and patching.
 */

import { DocumentLogWorkbookSpec, PROTECTION_TIER_SPECS, ColumnSpec } from "../../core/config/DocumentLogWorkbookSpec";
import { DocumentLogWorkbookViewSpec } from "../../core/config/DocumentLogWorkbookViewSpec";

export interface LogTabContext {
  tab: any;
  sheet: any;
  firstDataRow: number;
  numRows: number;
}

export interface SheetValidationAndProtectionAdapterOptions {
  spreadsheetApp?: typeof SpreadsheetApp;
}

class SheetValidationAndProtectionAdapter {
  private readonly workbookSpec: DocumentLogWorkbookSpec;
  private readonly viewSpec: DocumentLogWorkbookViewSpec;
  private readonly spreadsheetApp?: typeof SpreadsheetApp;

  constructor(
    workbookSpec: DocumentLogWorkbookSpec,
    viewSpec: DocumentLogWorkbookViewSpec,
    optionsOrSpreadsheetApp?: SheetValidationAndProtectionAdapterOptions | typeof SpreadsheetApp
  ) {
    if (!workbookSpec) {
      throw new Error("DocumentLogWorkbookSpec is required for SheetValidationAndProtectionAdapter");
    }
    if (!viewSpec) {
      throw new Error("DocumentLogWorkbookViewSpec is required for SheetValidationAndProtectionAdapter");
    }
    this.workbookSpec = workbookSpec;
    this.viewSpec = viewSpec;

    if (optionsOrSpreadsheetApp && typeof (optionsOrSpreadsheetApp as any).newDataValidation === "function") {
      this.spreadsheetApp = optionsOrSpreadsheetApp as typeof SpreadsheetApp;
    } else if (optionsOrSpreadsheetApp && (optionsOrSpreadsheetApp as SheetValidationAndProtectionAdapterOptions).spreadsheetApp) {
      this.spreadsheetApp = (optionsOrSpreadsheetApp as SheetValidationAndProtectionAdapterOptions).spreadsheetApp;
    } else if (typeof SpreadsheetApp !== "undefined") {
      this.spreadsheetApp = SpreadsheetApp;
    }
  }

  private getLogTabContexts(spreadsheet: any): LogTabContext[] {
    if (!spreadsheet || !this.workbookSpec || !this.workbookSpec.tabs) return [];

    const firstDataRow = this.viewSpec.offsets.FIRST_DATA_ROW_INDEX;
    const results: LogTabContext[] = [];

    for (const tab of this.workbookSpec.tabs) {
      if (!tab.isLogTab || !tab.columns || tab.columns.length === 0) {
        continue;
      }

      const sheet = typeof spreadsheet.getSheetByName === "function" ? spreadsheet.getSheetByName(tab.name) : null;
      if (!sheet) continue;

      const maxRows = typeof sheet.getMaxRows === "function" ? sheet.getMaxRows() : (tab.rowCount || 25);
      const numRows = Math.max(1, maxRows - firstDataRow + 1);

      results.push({ tab, sheet, firstDataRow, numRows });
    }
    return results;
  }

  /**
   * Applies DataValidation rules to picklist columns linked to target single-column Named Ranges.
   */
  public applyValidationRules(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
    if (!spreadsheet) return;
    const spreadsheetApp = this.spreadsheetApp || (typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp : undefined);
    const contexts = this.getLogTabContexts(spreadsheet);

    for (const { tab, sheet, firstDataRow, numRows } of contexts) {
      tab.columns.forEach((colSpec: ColumnSpec, idx: number) => {
        const ruleSpec = colSpec.validationRule;
        if (ruleSpec && ruleSpec.type === "LIST_FROM_RANGE" && ruleSpec.targetNamedRange) {
          const targetRange = typeof spreadsheet.getRangeByName === "function"
            ? spreadsheet.getRangeByName(ruleSpec.targetNamedRange)
            : null;

          if (!targetRange) {
            throw new Error(`Target Named Range '${ruleSpec.targetNamedRange}' for validation rule on column '${colSpec.id}' could not be found in spreadsheet.`);
          }

          const colIdx = idx + 1;
          const range = typeof sheet.getRange === "function" ? sheet.getRange(firstDataRow, colIdx, numRows, 1) : null;
          if (range && typeof range.setDataValidation === "function" && spreadsheetApp && typeof spreadsheetApp.newDataValidation === "function") {
            const builder = spreadsheetApp.newDataValidation();
            const validationRange = typeof targetRange.offset === "function" && typeof targetRange.getNumRows === "function"
              ? targetRange.offset(0, 0, targetRange.getNumRows(), 1)
              : targetRange;
            builder.requireValueInRange(validationRange);
            builder.setAllowInvalid(ruleSpec.allowInvalid);
            if (ruleSpec.helpText) {
              builder.setHelpText(ruleSpec.helpText);
            }
            const validation = builder.build();
            range.setDataValidation(validation);
          }
        }
      });
    }
  }

  /**
   * Configures soft warning-based range and sheet protections across all 3 tiers using PROTECTION_TIER_SPECS.
   * Tier 1: SYSTEM_TAB_PROTECTION on system tabs (_Config, _AuditLog, etc.).
   * Tier 2: HEADER_AND_FORMULA_PROTECTION on header stack (Rows 1..firstDataRow-1) named LOCK_HEADERS_<TabName>.
   * Tier 3: CALCULATED_COLUMN_PROTECTION on calculated column ranges across data rows.
   * Data entry cells remain strictly unprotected.
   */
  public applyRangeProtections(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | any): void {
    if (!spreadsheet || !this.workbookSpec || !this.workbookSpec.tabs) return;

    const firstDataRow = this.viewSpec.offsets.FIRST_DATA_ROW_INDEX;
    const sysTier = PROTECTION_TIER_SPECS?.SYSTEM_TAB_PROTECTION || { warningOnly: true };
    const headerTier = PROTECTION_TIER_SPECS?.HEADER_AND_FORMULA_PROTECTION || { warningOnly: true };
    const calcTier = PROTECTION_TIER_SPECS?.CALCULATED_COLUMN_PROTECTION || { warningOnly: true };

    for (const tab of this.workbookSpec.tabs) {
      const sheet = typeof spreadsheet.getSheetByName === "function" ? spreadsheet.getSheetByName(tab.name) : null;
      if (!sheet) continue;

      // Tier 1: System Tab Protection
      if (tab.isConfigTab || tab.isAuditLogTab || tab.isSupportTab || tab.name.startsWith("_")) {
        if (typeof sheet.protect === "function") {
          const sheetProtection = sheet.protect();
          if (sheetProtection && typeof sheetProtection.setWarningOnly === "function") {
            sheetProtection.setDescription(`SYSTEM_TAB_PROTECTION_${tab.name}`);
            sheetProtection.setWarningOnly(sysTier.warningOnly);
          }
        }
        continue;
      }

      // Log Tabs
      if (tab.isLogTab && tab.columns && tab.columns.length > 0) {
        const headerRowCount = Math.max(1, firstDataRow - 1);
        const colCount = tab.columns.length;

        // Tier 2: Header Stack & Formula Protection
        if (typeof sheet.getRange === "function") {
          const headerRange = sheet.getRange(1, 1, headerRowCount, colCount);
          if (headerRange && typeof headerRange.protect === "function") {
            const headerProtection = headerRange.protect();
            if (headerProtection && typeof headerProtection.setWarningOnly === "function") {
              headerProtection.setDescription(`LOCK_HEADERS_${tab.name}`);
              headerProtection.setWarningOnly(headerTier.warningOnly);
            }
          }
        }

        // Tier 3: Calculated Column Protection
        const maxRows = typeof sheet.getMaxRows === "function" ? sheet.getMaxRows() : (tab.rowCount || 25);
        const numRows = Math.max(1, maxRows - firstDataRow + 1);

        tab.columns.forEach((colSpec: ColumnSpec, idx: number) => {
          const isCalculated = colSpec.formula !== undefined || (colSpec.id && colSpec.id.startsWith("calc"));
          if (isCalculated) {
            const colIdx = idx + 1;
            if (typeof sheet.getRange === "function") {
              const calcRange = sheet.getRange(firstDataRow, colIdx, numRows, 1);
              if (calcRange && typeof calcRange.protect === "function") {
                const calcProtection = calcRange.protect();
                if (calcProtection && typeof calcProtection.setWarningOnly === "function") {
                  calcProtection.setDescription(`PROTECT_CALC_${tab.name}_${colSpec.id}`);
                  calcProtection.setWarningOnly(calcTier.warningOnly);
                }
              }
            }
          }
        });
      }
    }
  }

  public applyNumberFormats(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | any): void {
    if (!spreadsheet) return;
    const contexts = this.getLogTabContexts(spreadsheet);

    for (const { tab, sheet, firstDataRow, numRows } of contexts) {
      tab.columns.forEach((colSpec: ColumnSpec, idx: number) => {
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

export {
  SheetValidationAndProtectionAdapter
};

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SheetValidationAndProtectionAdapter
  };
}

(globalThis as any).SheetValidationAndProtectionAdapter = SheetValidationAndProtectionAdapter;