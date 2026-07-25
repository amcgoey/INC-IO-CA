// src/SheetStorageAdapter.ts

interface SheetStorageAdapter {
  getSheetValues(sheetName: string): any[][];
  setSheetValues(sheetName: string, values: any[][]): void;
  getRangeValue(sheetName: string, rowIndex: number, colIndex: number): any;
  setRangeValue(sheetName: string, rowIndex: number, colIndex: number, value: any): void;
  insertRowBefore(sheetName: string, rowIndex: number): void;
  insertRowAfter(sheetName: string, rowIndex: number): void;
  insertColumnAfter(sheetName: string, colIndex: number): void;
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

  insertColumnAfter(sheetName: string, colIndex: number): void {
    const grid = this.getOrCreateSheet(sheetName);
    const insertIdx = colIndex; // After colIndex (1-based), so 0-based array index is colIndex
    for (const row of grid) {
      row.splice(insertIdx, 0, "");
    }
  }

  setRowValues(sheetName: string, rowIndex: number, headers: string[], rowData: any[]): { failedColumns: string[] } {
    const grid = this.getOrCreateSheet(sheetName);
    const rIdx = rowIndex - 1;

    while (grid.length <= rIdx) {
      grid.push([]);
    }

    let sheetHeaderRow: string[] | null = null;
    for (const r of grid) {
      if (Array.isArray(r) && headers.some(h => r.includes(h))) {
        sheetHeaderRow = r.map(c => String(c).trim());
        break;
      }
    }

    const targetRow = grid[rIdx];

    for (let i = 0; i < headers.length; i++) {
      const colName = headers[i];
      const val = rowData[i] !== undefined ? rowData[i] : "";
      let colIdx = i;

      if (sheetHeaderRow) {
        const hIdx = sheetHeaderRow.indexOf(colName);
        if (hIdx !== -1) {
          colIdx = hIdx;
        }
      }

      while (targetRow.length <= colIdx) {
        targetRow.push("");
      }

      targetRow[colIdx] = val;
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

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    InMemorySheetStorageAdapter
  };
}
