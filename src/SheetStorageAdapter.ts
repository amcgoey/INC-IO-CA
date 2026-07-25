// src/SheetStorageAdapter.ts

interface SheetStorageAdapter {
  getSheetValues(sheetName: string): any[][];
  setSheetValues(sheetName: string, values: any[][]): void;
  getRangeValue(sheetName: string, rowIndex: number, colIndex: number): any;
  setRangeValue(sheetName: string, rowIndex: number, colIndex: number, value: any): void;
  insertRowBefore(sheetName: string, rowIndex: number): void;
  insertRowAfter(sheetName: string, rowIndex: number): void;
  setRowValues(sheetName: string, rowIndex: number, headers: string[], rowData: any[]): { failedColumns: string[] };
  insertLogRow(sheetName: string, headers: string[], rowData: any[], plan: RowInsertionPlan): { rowIndex: number; failedColumns: string[] };
}

class InMemorySheetStorageAdapter implements SheetStorageAdapter {
  private sheets: Map<string, any[][]> = new Map();

  constructor(initialSheets: Record<string, any[][]> = {}) {
    for (const [name, values] of Object.entries(initialSheets)) {
      this.sheets.set(name, values.map(row => [...row]));
    }
  }

  private getOrCreateSheet(sheetName: string): any[][] {
    if (!this.sheets.has(sheetName)) {
      this.sheets.set(sheetName, []);
    }
    return this.sheets.get(sheetName)!;
  }

  private insertBlankRowAt(sheetName: string, insertIdx: number): void {
    const grid = this.getOrCreateSheet(sheetName);
    const safeIdx = Math.min(grid.length, Math.max(0, insertIdx));
    const colCount = grid.reduce((max, r) => Math.max(max, r.length), 0);
    grid.splice(safeIdx, 0, new Array(colCount).fill(""));
  }

  getSheetValues(sheetName: string): any[][] {
    const grid = this.getOrCreateSheet(sheetName);
    return grid.map(row => [...row]);
  }

  setSheetValues(sheetName: string, values: any[][]): void {
    this.sheets.set(sheetName, values.map(row => [...row]));
  }

  getRangeValue(sheetName: string, rowIndex: number, colIndex: number): any {
    const grid = this.getOrCreateSheet(sheetName);
    const rIdx = rowIndex - 1;
    const cIdx = colIndex - 1;
    if (rIdx < 0 || rIdx >= grid.length) return "";
    const row = grid[rIdx];
    if (cIdx < 0 || cIdx >= row.length) return "";
    return row[cIdx];
  }

  setRangeValue(sheetName: string, rowIndex: number, colIndex: number, value: any): void {
    const grid = this.getOrCreateSheet(sheetName);
    const rIdx = rowIndex - 1;
    const cIdx = colIndex - 1;

    while (grid.length <= rIdx) {
      grid.push([]);
    }

    const row = grid[rIdx];
    while (row.length <= cIdx) {
      row.push("");
    }

    row[cIdx] = value;
  }

  insertRowBefore(sheetName: string, rowIndex: number): void {
    this.insertBlankRowAt(sheetName, Math.max(0, rowIndex - 1));
  }

  insertRowAfter(sheetName: string, rowIndex: number): void {
    this.insertBlankRowAt(sheetName, Math.max(0, rowIndex));
  }

  setRowValues(sheetName: string, rowIndex: number, headers: string[], rowData: any[]): { failedColumns: string[] } {
    const grid = this.getOrCreateSheet(sheetName);
    const rIdx = rowIndex - 1;

    while (grid.length <= rIdx) {
      grid.push([]);
    }

    const targetRow = grid[rIdx];

    for (let i = 0; i < headers.length; i++) {
      const val = rowData[i] !== undefined ? rowData[i] : "";
      while (targetRow.length <= i) {
        targetRow.push("");
      }
      targetRow[i] = val;
    }

    return { failedColumns: [] };
  }

  insertLogRow(
    sheetName: string,
    headers: string[],
    rowData: any[],
    plan: RowInsertionPlan
  ): { rowIndex: number; failedColumns: string[] } {
    // 1. Physical row insertion after targetRowIndex
    this.insertRowAfter(sheetName, plan.targetRowIndex);

    // 2. Insert blank row before if plan requires it
    if (plan.insertBlankBefore) {
      this.insertRowAfter(sheetName, plan.targetRowIndex + 1);
    }

    // 3. Insert blank row after if plan requires it
    if (plan.insertBlankAfter) {
      this.insertRowAfter(sheetName, plan.finalRowIndex);
    }

    // 4. Write new row data into finalRowIndex
    this.setRowValues(sheetName, plan.finalRowIndex, headers, rowData);

    return { rowIndex: plan.finalRowIndex, failedColumns: [] };
  }
}

class GoogleSheetsStorageAdapter implements SheetStorageAdapter {
  private spreadsheetId: string;

  constructor(spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
  }

  private getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
    const ss = SpreadsheetApp.openById(this.spreadsheetId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet '${sheetName}' not found in spreadsheet.`);
    return sheet;
  }

  getSheetValues(sheetName: string): any[][] {
    return this.getSheet(sheetName).getDataRange().getValues();
  }

  setSheetValues(sheetName: string, values: any[][]): void {
    const sheet = this.getSheet(sheetName);
    sheet.clearContents();
    if (values.length > 0 && values[0].length > 0) {
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }
  }

  getRangeValue(sheetName: string, rowIndex: number, colIndex: number): any {
    return this.getSheet(sheetName).getRange(rowIndex, colIndex).getValue();
  }

  setRangeValue(sheetName: string, rowIndex: number, colIndex: number, value: any): void {
    this.getSheet(sheetName).getRange(rowIndex, colIndex).setValue(value);
  }

  insertRowBefore(sheetName: string, rowIndex: number): void {
    this.getSheet(sheetName).insertRowBefore(rowIndex);
  }

  insertRowAfter(sheetName: string, rowIndex: number): void {
    this.getSheet(sheetName).insertRowAfter(rowIndex);
  }

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

  insertLogRow(
    sheetName: string,
    headers: string[],
    rowData: any[],
    plan: RowInsertionPlan
  ): { rowIndex: number; failedColumns: string[] } {
    return defaultLogRepository.insertLogRow(this.spreadsheetId, headers, rowData, plan);
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    InMemorySheetStorageAdapter,
    GoogleSheetsStorageAdapter
  };
}
