/**
 * @file InMemorySheetStorageAdapter.ts
 * @description In-memory test implementation of SheetStorageAdapter.
 */

export class InMemorySheetStorageAdapter implements SheetStorageAdapter {
  getTabNames(): string[] {
    return Array.from(this.sheets.keys());
  }

  deleteTab(sheetName: string): void {
    this.sheets.delete(sheetName);
    this.formulas.delete(sheetName);
  }
  private sheets: Map<string, any[][]> = new Map();
  private formulas: Map<string, string[][]> = new Map();

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

  private insertBlankRowAt(sheetName: string, insertIdx: number): void {
    const grid = this.getOrCreateSheet(sheetName);
    const safeIdx = Math.min(grid.length, Math.max(0, insertIdx));
    const colCount = grid.reduce((max, r) => Math.max(max, r.length), 0);
    grid.splice(safeIdx, 0, new Array(colCount).fill(""));
  }

  /** @override */
  setSheetFormulas(sheetName: string, formulas: string[][]): void {
    this.formulas.set(sheetName, formulas.map(row => [...row]));
  }

  getSheetFormulas(sheetName: string): string[][] {
    if (this.formulas.has(sheetName)) {
      return this.formulas.get(sheetName)!.map(row => [...row]);
    }
    const values = this.getSheetValues(sheetName);
    return values.map(row =>
      row.map(val => (typeof val === "string" && val.startsWith("=") ? val : ""))
    );
  }

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

  /** @override */
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

/**
 * In-memory test fake alias for `SheetStorageAdapter` used in unit test suites.
 */

export const FakeSheetStorageAdapter = InMemorySheetStorageAdapter;

declare let module: { exports?: unknown };
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    InMemorySheetStorageAdapter,
    FakeSheetStorageAdapter
  };
}
