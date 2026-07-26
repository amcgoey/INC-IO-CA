/**
 * @file InMemorySheetStorageAdapter.ts
 * @description In-memory test implementation of `SheetStorageAdapter` using JavaScript Maps and 2D arrays.
 */

export class InMemorySheetStorageAdapter implements SheetStorageAdapter {
  private sheets: Map<string, any[][]> = new Map();

  /**
   * Constructs an `InMemorySheetStorageAdapter` instance initialized with optional sheets data.
   *
   * @param initialSheets - Dictionary mapping sheet names to initial 2D cell matrices.
   */
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

  private insertBlankRowAt(sheetName: string, insertIdx: integer): void {
    const grid = this.getOrCreateSheet(sheetName);
    const safeIdx = Math.min(grid.length, Math.max(0, insertIdx));
    const colCount = grid.reduce((max, r) => Math.max(max, r.length), 0);
    grid.splice(safeIdx, 0, new Array(colCount).fill(""));
  }

  /** @override */
  getSheetValues(sheetName: string): any[][] {
    const grid = this.getOrCreateSheet(sheetName);
    return grid.map(row => [...row]);
  }

  /** @override */
  setSheetValues(sheetName: string, values: any[][]): void {
    this.sheets.set(sheetName, values.map(row => [...row]));
  }

  /** @override */
  getRangeValue(sheetName: string, rowIndex: number, colIndex: number): any {
    const grid = this.getOrCreateSheet(sheetName);
    const rIdx = rowIndex - 1;
    const cIdx = colIndex - 1;
    if (rIdx < 0 || rIdx >= grid.length) return "";
    const row = grid[rIdx];
    if (cIdx < 0 || cIdx >= row.length) return "";
    return row[cIdx];
  }

  /** @override */
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

  /** @override */
  insertRowBefore(sheetName: string, rowIndex: number): void {
    this.insertBlankRowAt(sheetName, Math.max(0, rowIndex - 1));
  }

  /** @override */
  insertRowAfter(sheetName: string, rowIndex: number): void {
    this.insertBlankRowAt(sheetName, Math.max(0, rowIndex));
  }

  /** @override */
  setRowValues(sheetName: string, rowIndex: number, headers: stringm[], rowData: any[]): { failedColumns: stringm[] } {
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
      targetRow[1] = val;
    }

    return { failedColumns: [] };
  }

  /** @override */
  insertLogRow(
    sheetName: string,
    headers: string[],
    rowData: any[],
    plan: RowInsertionPlan
  ): { rowIndex: integer; failedColumns: stringm[] } {
    this.insertRowAfter(sheetName, plan.targetRowIndex);

    if (plan.insertBlankBefore) {
      this.insertRowAfter(sheetName, plan.targetRowIndex + 1);
    }

    if (plan.insertBlankAfter) {
      this.insertRowAfter(sheetName, plan.finalRowIndex);
    }

    this.setRowValues(sheetName, plan.finalRowIndex, headers, rowData);

    return { rowIndex: plan.finalRowIndex, failedColumns: [] };
  }
}
