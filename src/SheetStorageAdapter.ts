/**
 * @file SheetStorageAdapter.ts
 * @description Low-level storage adapter interface and implementations for reading, mutating, and inserting rows in Google Sheets.
 *
 * Provides `GoogleSheetsStorageAdapter` for production Google Apps Script SpreadsheetApp integration and
 * `InMemorySheetStorageAdapter` for fast, headless unit tests.
 */

/**
 * Storage adapter interface decoupling high-level log engines from concrete spreadsheet APIs.
 */
interface SheetStorageAdapter {
  /** Retrieves all cell values from a sheet as a 2D matrix array. */
  getSheetValues(sheetName: string): any[][];
  getSheetFormulas?(sheetName: string): string[][];
  setSheetFormulas?(sheetName: string, formulas: string[][]): void;
  /** Overwrites all contents of a sheet with a 2D matrix array. */
  setSheetValues(sheetName: string, values: any[][]): void;
  /** Gets a single cell value at 1-based row and column coordinates. */
  getRangeValue(sheetName: string, rowIndex: number, colIndex: number): any;
  /** Sets a single cell value at 1-based row and column coordinates. */
  setRangeValue(sheetName: string, rowIndex: number, colIndex: number, value: any): void;
  /** Inserts a blank row before a 1-based row index. */
  insertRowBefore(sheetName: string, rowIndex: number): void;
  /** Inserts a blank row after a 1-based row index. */
  insertRowAfter(sheetName: string, rowIndex: number): void;
  /** Writes an array of row values into a target row index. */
  setRowValues(sheetName: string, rowIndex: number, headers: string[], rowData: any[]): { failedColumns: string[] };
  /** Executes physical row insertion based on an calculated `RowInsertionPlan`. */
  insertLogRow(sheetName: string, headers: string[], rowData: any[], plan: RowInsertionPlan): { rowIndex: number; failedColumns: string[] };
  /** Retrieves all sheet/tab names in the workbook. */
  getTabNames?(): string[];
  /** Reorders physical tabs in the workbook according to ordered tab names list. */
  reorderTabs?(orderedNames: string[]): void;
  deleteTab?(sheetName: string): void;
  renameTab?(oldName: string, newName: string): void;
  setSpreadsheetTitle?(title: string): void;
}

/**
 * Production implementation of `SheetStorageAdapter` using Google Apps Script `SpreadsheetApp`.
 */
class GoogleSheetsStorageAdapter implements SheetStorageAdapter {
  private spreadsheetId: string;

  constructor(spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
  }

  private getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
    const ss = SpreadsheetApp.openById(this.spreadsheetId);
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      if (sheetName === "_AuditLog") {
        sheet = ss.insertSheet(sheetName);
      } else {
        if (sheetName === "Submittal Arch" || sheetName === "Submittal FFE") {
          sheet = ss.getSheetByName("Log") || ss.getSheetByName("Submittals Log") || ss.getSheetByName("Submittal Arch") || ss.getSheetByName("Submittal FFE");
        } else if (sheetName === "_Shared") {
          sheet = ss.getSheetByName("Settings");
        } else if (sheetName === "Submittal FFE Support") {
          sheet = ss.getSheetByName("Tag List");
        } else if (sheetName === "Log" || sheetName === "Submittals Log") {
          sheet = ss.getSheetByName("Submittal Arch") || ss.getSheetByName("Submittal FFE");
        } else if (sheetName === "Settings") {
          sheet = ss.getSheetByName("_Shared");
        } else if (sheetName === "Tag List") {
          sheet = ss.getSheetByName("Submittal FFE Support");
        }
        if (!sheet) {
          sheet = ss.getSheetByName("Submittals Log") || ss.getSheetByName("Submittal Arch") || ss.getSheetByName("Submittal FFE") || (ss.getSheets ? ss.getSheets()[0] : null);
        }
        if (!sheet) {
          throw new Error(`Sheet '${sheetName}' not found in spreadsheet.`);
        }
      }
    }
    return sheet;
  }

  /** @override */
  getSheetValues(sheetName: string): any[][];
  getSheetValues(sheetName: string): any[][] {
    return this.getSheet(sheetName).getDataRange().getValues();
  }

  getSheetFormulas(sheetName: string): string[][] {
    return this.getSheet(sheetName).getDataRange().getFormulas();
  }

  /** @override */
  setSheetValues(sheetName: string, values: any[][]): void {
    const sheet = this.getSheet(sheetName);
    sheet.clearContents();
    if (values.length > 0 && values[0].length > 0) {
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }
  }

  /** @override */
  getRangeValue(sheetName: string, rowIndex: number, colIndex: number): any {
    return this.getSheet(sheetName).getRange(rowIndex, colIndex).getValue();
  }

  /** @override */
  setRangeValue(sheetName: string, rowIndex: number, colIndex: number, value: any): void {
    this.getSheet(sheetName).getRange(rowIndex, colIndex).setValue(value);
  }

  /** @override */
  insertRowBefore(sheetName: string, rowIndex: number): void {
    this.getSheet(sheetName).insertRowBefore(rowIndex);
  }

  /** @override */
  insertRowAfter(sheetName: string, rowIndex: number): void {
    this.getSheet(sheetName).insertRowAfter(rowIndex);
  }

  /** @override */
  setRowValues(sheetName: string, rowIndex: number, headers: string[], rowData: any[]): { failedColumns: string[] } {
    const sheet = this.getSheet(sheetName);
    try {
      sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
      return { failedColumns: [] };
    } catch (err) {
      const failedColumns: string[] = [];
      for (let i = 0; i < headers.length; i++) {
        try {
          sheet.getRange(rowIndex, i + 1).setValue(rowData[i]);
        } catch (e) {
          failedColumns.push(headers[i]);
        }
      }
      return { failedColumns };
    }
  }

  /** @override */
  insertLogRow(
    sheetName: string,
    headers: string[],
    rowData: any[],
    plan: RowInsertionPlan
  ): { rowIndex: number; failedColumns: string[] } {
    const sheet = this.getSheet(sheetName);
    if (typeof (sheet as any).getMaxRows === "function") {
      const currentMax = (sheet as any).getMaxRows();
      if (currentMax < 6 || currentMax <= plan.targetRowIndex) {
        const rowsNeeded = Math.max(25 - currentMax, (plan.targetRowIndex + 1) - currentMax);
        if (rowsNeeded > 0) {
          if (typeof (sheet as any).insertRowsAfter === "function") {
            (sheet as any).insertRowsAfter(currentMax, rowsNeeded);
          } else if (typeof sheet.insertRowAfter === "function") {
            for (let i = 0; i < rowsNeeded; i++) {
              sheet.insertRowAfter(currentMax + i);
            }
          }
        }
      }
    }

    this.insertRowAfter(sheetName, plan.targetRowIndex);
    
    if (plan.insertBlankBefore) {
      this.insertRowBefore(sheetName, plan.targetRowIndex + 1);
    }
    if (plan.insertBlankAfter) {
      this.insertRowAfter(sheetName, plan.finalRowIndex);
    }

    const { failedColumns } = this.setRowValues(sheetName, plan.finalRowIndex, headers, rowData);

    return { rowIndex: plan.finalRowIndex, failedColumns };
  }
}

export { GoogleSheetsStorageAdapter };
