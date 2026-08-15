
import { CONFIG as ConfigConst } from "../../src/Config";

export class MockProtection {
  private description: string = "";
  private warningOnly: boolean = false;
  private unprotectedRanges: MockRange[] = [];

  constructor(
    private target: MockSheet | MockRange,
    private protectionType: "SHEET" | "RANGE"
  ) {}

  public getDescription(): string {
    return this.description;
  }

  public setDescription(description: string): this {
    this.description = description;
    return this;
  }

  public isWarningOnly(): boolean {
    return this.warningOnly;
  }

  public setWarningOnly(warningOnly: boolean): this {
    this.warningOnly = warningOnly;
    return this;
  }

  public getProtectionType(): "SHEET" | "RANGE" {
    return this.protectionType;
  }

  public getRange(): MockRange {
    if (this.target instanceof MockRange) {
      return this.target;
    }
    return (this.target as MockSheet).getRange(1, 1, (this.target as MockSheet).getGrid().length || 100, 26);
  }

  public getUnprotectedRanges(): MockRange[] {
    return [...this.unprotectedRanges];
  }

  public setUnprotectedRanges(ranges: MockRange[]): this {
    this.unprotectedRanges = [...ranges];
    return this;
  }

  public remove(): void {
    if (this.target instanceof MockSheet) {
      this.target.removeProtection(this);
    } else if (this.target instanceof MockRange) {
      this.target.getSheet().removeProtection(this);
    }
  }
}


export class MockDataValidation {
  constructor(
    private criteriaType: string,
    private criteriaValues: any[],
    private allowInvalid: boolean,
    private helpText?: string
  ) {}

  public getCriteriaType(): string {
    return this.criteriaType;
  }

  public getCriteriaValues(): any[] {
    return this.criteriaValues;
  }

  public getAllowInvalid(): boolean {
    return this.allowInvalid;
  }

  public getHelpText(): string | undefined {
    return this.helpText;
  }
}

export class MockDataValidationBuilder {
  private criteriaType: string = "";
  private criteriaValues: any[] = [];
  private allowInvalid: boolean = true;
  private helpText?: string;

  public requireValueInRange(range: MockRange | any, showDropdown: boolean = true): this {
    this.criteriaType = "VALUE_IN_RANGE";
    this.criteriaValues = [range, showDropdown];
    return this;
  }

  public requireValueInList(values: string[], showDropdown: boolean = true): this {
    this.criteriaType = "VALUE_IN_LIST";
    this.criteriaValues = [values, showDropdown];
    return this;
  }

  public setAllowInvalid(allow: boolean): this {
    this.allowInvalid = allow;
    return this;
  }

  public setHelpText(helpText: string): this {
    this.helpText = helpText;
    return this;
  }

  public build(): MockDataValidation {
    return new MockDataValidation(this.criteriaType, this.criteriaValues, this.allowInvalid, this.helpText);
  }
}
import { ColumnSpec, DocumentLogWorkbookSpec } from "../../src/core/config/DocumentLogWorkbookSpec";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from "../../src/core/config/DocumentLogWorkbookViewSpec";
import { MockDriveState, MockDriveApp } from "./MockDrive";
import { MockCardService } from "./CardServiceMocks";
import { CardSerializer, ButtonJson } from "./CardSerializer";

/**
 * @file GasMockHarness.ts
 * @description Centralized testing infrastructure harness managing globalThis stubs for CONFIG, CacheService, PropertiesService, SpreadsheetApp, DriveApp, and CardService with explicit lifecycle methods.
 */

/// <reference path="../../src/Config.ts" />
declare let CONFIG: typeof ConfigConst | Record<string, unknown>;

const DEFAULT_CONFIG: Record<string, unknown> = { ...(ConfigConst as Record<string, unknown>) };


const DEFAULT_CSI_DIVISIONS: Record<string, string> = { "03": "03-Concrete" };

export interface CallLog {
  method: string;
  args: unknown[];
  timestamp: number;
}

export class MockPropertiesStore {
  private store: Map<string, string> = new Map();
  public calls: CallLog[] = [];

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  public getProperty(key: string): string | null {
    this.recordCall("getProperty", [key]);
    return this.store.get(key) ?? null;
  }

  public setProperty(key: string, value: string): this {
    this.recordCall("setProperty", [key, value]);
    this.store.set(key, String(value));
    return this;
  }

  public getProperties(): Record<string, string> {
    this.recordCall("getProperties", []);
    const result: Record<string, string> = {};
    for (const [k, v] of this.store.entries()) {
      result[k] = v;
    }
    return result;
  }

  public setProperties(properties: Record<string, string>, deleteAllOthers: boolean = false): this {
    this.recordCall("setProperties", [properties, deleteAllOthers]);
    if (deleteAllOthers) {
      this.store.clear();
    }
    for (const [k, v] of Object.entries(properties)) {
      this.store.set(k, String(v));
    }
    return this;
  }

  public deleteProperty(key: string): this {
    this.recordCall("deleteProperty", [key]);
    this.store.delete(key);
    return this;
  }

  public deleteAllProperties(): this {
    this.recordCall("deleteAllProperties", []);
    this.store.clear();
    return this;
  }

  public getKeys(): string[] {
    this.recordCall("getKeys", []);
    return Array.from(this.store.keys());
  }

  public reset(): void {
    this.store.clear();
    this.calls = [];
  }
}

export class MockPropertiesService {
  public scriptProperties: MockPropertiesStore = new MockPropertiesStore();
  public userProperties: MockPropertiesStore = new MockPropertiesStore();
  public documentProperties: MockPropertiesStore = new MockPropertiesStore();

  public getScriptProperties(): MockPropertiesStore {
    return this.scriptProperties;
  }

  public getUserProperties(): MockPropertiesStore {
    return this.userProperties;
  }

  public getDocumentProperties(): MockPropertiesStore {
    return this.documentProperties;
  }

  public reset(): void {
    this.scriptProperties.reset();
    this.userProperties.reset();
    this.documentProperties.reset();
  }
}

interface CacheEntry {
  value: string;
  expiresAt: number | null;
}

export class MockCacheStore {
  private store: Map<string, CacheEntry> = new Map();
  public calls: CallLog[] = [];

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  public get(key: string): string | null {
    this.recordCall("get", [key]);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  public put(key: string, value: string, expirationInSeconds?: number): void {
    this.recordCall("put", [key, value, expirationInSeconds]);
    let expiresAt: number | null = null;
    if (expirationInSeconds !== undefined) {
      if (expirationInSeconds <= 0) {
        this.store.delete(key);
        return;
      }
      expiresAt = Date.now() + expirationInSeconds * 1000;
    }
    this.store.set(key, { value: String(value), expiresAt });
  }

  public remove(key: string): void {
    this.recordCall("remove", [key]);
    this.store.delete(key);
  }

  public removeAll(keys: string[]): void {
    this.recordCall("removeAll", [keys]);
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  public getAll(keys: string[]): Record<string, string> {
    this.recordCall("getAll", [keys]);
    const result: Record<string, string> = {};
    for (const key of keys) {
      const val = this.get(key);
      if (val !== null) {
        result[key] = val;
      }
    }
    return result;
  }

  public putAll(values: Record<string, string>, expirationInSeconds?: number): void {
    this.recordCall("putAll", [values, expirationInSeconds]);
    for (const [k, v] of Object.entries(values)) {
      this.put(k, v, expirationInSeconds);
    }
  }

  public reset(): void {
    this.store.clear();
    this.calls = [];
  }
}

export class MockCacheService {
  public userCache: MockCacheStore = new MockCacheStore();
  public scriptCache: MockCacheStore = new MockCacheStore();
  public documentCache: MockCacheStore = new MockCacheStore();

  public getUserCache(): MockCacheStore {
    return this.userCache;
  }

  public getScriptCache(): MockCacheStore {
    return this.scriptCache;
  }

  public getDocumentCache(): MockCacheStore {
    return this.documentCache;
  }

  public reset(): void {
    this.userCache.reset();
    this.scriptCache.reset();
    this.documentCache.reset();
  }
}

function columnNumberToLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex - 1;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

function columnLetterToNumber(letter: string): number {
  let col = 0;
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64);
  }
  return col;
}

function parseA1Notation(notation: string, maxRows: number = 100): {
  sheetName?: string;
  startRow: number;
  startCol: number;
  numRows: number;
  numCols: number;
} {
  let cleanNotation = notation;
  let sheetName: string | undefined;
  if (cleanNotation.includes("!")) {
    const parts = cleanNotation.split("!");
    sheetName = parts[0];
    cleanNotation = parts[1];
  }

  const rangeParts = cleanNotation.split(":");
  const firstCell = rangeParts[0];
  const secondCell = rangeParts.length > 1 ? rangeParts[1] : firstCell;

  const firstMatch = firstCell.match(/^([A-Za-z]+)(\d+)?$/);
  if (!firstMatch) {
    return { sheetName, startRow: 1, startCol: 1, numRows: 1, numCols: 1 };
  }

  const startCol = columnLetterToNumber(firstMatch[1].toUpperCase());
  const startRow = firstMatch[2] ? parseInt(firstMatch[2], 10) : 1;

  const secondMatch = secondCell.match(/^([A-Za-z]+)(\d+)?$/);
  let endCol = startCol;
  let endRow = startRow;

  if (secondMatch) {
    endCol = columnLetterToNumber(secondMatch[1].toUpperCase());
    endRow = secondMatch[2] ? parseInt(secondMatch[2], 10) : Math.max(startRow, maxRows);
  }

  const numRows = Math.max(1, endRow - startRow + 1);
  const numCols = Math.max(1, endCol - startCol + 1);

  return { sheetName, startRow, startCol, numRows, numCols };
}

export class MockRange {
  constructor(
    private sheet: MockSheet,
    private startRow: number,
    private startCol: number,
    private numRows: number,
    private numCols: number
  ) {}

  public getValues(): any[][] {
    return this.sheet.getGridSlice(this.startRow, this.startCol, this.numRows, this.numCols);
  }

  public setValues(values: any[][]): this {
    this.sheet.setGridSlice(this.startRow, this.startCol, values);
    return this;
  }

  public getValue(): any {
    const values = this.getValues();
    return values.length > 0 && values[0].length > 0 ? values[0][0] : "";
  }

  public setValue(value: any): this {
    this.sheet.setGridSlice(this.startRow, this.startCol, [[value]]);
    return this;
  }

  public getFormulas(): string[][] {
    const values = this.getValues();
    return values.map(row =>
      row.map(val => (typeof val === "string" && val.startsWith("=") ? val : ""))
    );
  }

  public getFormula(): string {
    const formulas = this.getFormulas();
    return formulas.length > 0 && formulas[0].length > 0 ? formulas[0][0] : "";
  }

  public getDataValidation(): any {
    return this.sheet.getDataValidation(this.startRow, this.startCol);
  }

  public getDataValidations(): any[][] {
    const result: any[][] = [];
    for (let r = 0; r < this.numRows; r++) {
      const row: any[] = [];
      for (let c = 0; c < this.numCols; c++) {
        row.push(this.sheet.getDataValidation(this.startRow + r, this.startCol + c));
      }
      result.push(row);
    }
    return result;
  }

  public setDataValidation(rule: any): this {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setDataValidation(this.startRow + r, this.startCol + c, rule);
      }
    }
    return this;
  }

  public getNumberFormat(): string {
    return this.sheet.getNumberFormat(this.startRow, this.startCol);
  }

  public getNumberFormats(): string[][] {
    const result: string[][] = [];
    for (let r = 0; r < this.numRows; r++) {
      const row: string[] = [];
      for (let c = 0; c < this.numCols; c++) {
        row.push(this.sheet.getNumberFormat(this.startRow + r, this.startCol + c));
      }
      result.push(row);
    }
    return result;
  }

  public setNumberFormat(numberFormat: string): this {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setNumberFormat(this.startRow + r, this.startCol + c, numberFormat);
      }
    }
    return this;
  }

  
  public getNumRows(): number {
    return this.numRows;
  }

  public getNumColumns(): number {
    return this.numCols;
  }

  public getRow(): number {
    return this.startRow;
  }

  public getColumn(): number {
    return this.startCol;
  }

  public offset(rowOffset: number, columnOffset: number, numRows?: number, numCols?: number): MockRange {
    return new MockRange(
      this.sheet,
      this.startRow + rowOffset,
      this.startCol + columnOffset,
      numRows !== undefined ? numRows : this.numRows,
      numCols !== undefined ? numCols : this.numCols
    );
  }

  public getA1Notation(): string {
    const startLetter = columnNumberToLetter(this.startCol);
    const endLetter = columnNumberToLetter(this.startCol + this.numCols - 1);
    return `${startLetter}${this.startRow}:${endLetter}${this.startRow + this.numRows - 1}`;
  }

  public getSheet(): MockSheet {
    return this.sheet;
  }

  public protect(): MockProtection {
    const p = new MockProtection(this, "RANGE");
    this.sheet.addProtection(p);
    return p;
  }

  public getProtections(): MockProtection[] {
    return this.sheet.getProtections("RANGE");
  }

  public setNumberFormats(numberFormats: string[][]): this {
    for (let r = 0; r < Math.min(this.numRows, numberFormats.length); r++) {
      for (let c = 0; c < Math.min(this.numCols, numberFormats[r].length); c++) {
        this.sheet.setNumberFormat(this.startRow + r, this.startCol + c, numberFormats[r][c]);
      }
    }
    return this;
  }
}

export class MockSheet {
  private grid: any[][] = [];
  private validations: Map<string, any> = new Map();
  private numberFormats: Map<string, string> = new Map();
  private protections: MockProtection[] = [];
  public calls: CallLog[] = [];

  constructor(public name: string, initialData: any[][] = [], public sheetId: number = 101) {
    this.grid = initialData.map(row => [...row]);
  }

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  
  public protect(): MockProtection {
    const p = new MockProtection(this, "SHEET");
    this.protections.push(p);
    return p;
  }

  public addProtection(protection: MockProtection): void {
    this.protections.push(protection);
  }

  public removeProtection(protection: MockProtection): void {
    this.protections = this.protections.filter(p => p !== protection);
  }

  public getProtections(type?: string): MockProtection[] {
    if (!type) return [...this.protections];
    return this.protections.filter(p => p.getProtectionType() === type);
  }

  public getName(): string {
    this.recordCall("getName", []);
    return this.name;
  }

  public getSheetId(): number {
    this.recordCall("getSheetId", []);
    return this.sheetId;
  }

  public getGrid(): any[][] {
    return this.grid.map(row => [...row]);
  }

  public setGrid(data: any[][]): void {
    this.grid = data.map(row => [...row]);
  }

  public getGridSlice(startRow: number, startCol: number, numRows: number, numCols: number): any[][] {
    const result: any[][] = [];
    for (let r = 0; r < numRows; r++) {
      const rowIdx = startRow - 1 + r;
      const row: any[] = [];
      const gridRow = rowIdx >= 0 && rowIdx < this.grid.length ? this.grid[rowIdx] : [];
      for (let c = 0; c < numCols; c++) {
        const colIdx = startCol - 1 + c;
        const val = colIdx >= 0 && colIdx < gridRow.length ? gridRow[colIdx] : "";
        row.push(val);
      }
      result.push(row);
    }
    return result;
  }

  public setGridSlice(startRow: number, startCol: number, values: any[][]): void {
    for (let r = 0; r < values.length; r++) {
      const rowIdx = startRow - 1 + r;
      while (this.grid.length <= rowIdx) {
        this.grid.push([]);
      }
      const gridRow = this.grid[rowIdx];
      const valRow = values[r];
      for (let c = 0; c < valRow.length; c++) {
        const colIdx = startCol - 1 + c;
        while (gridRow.length <= colIdx) {
          gridRow.push("");
        }
        gridRow[colIdx] = valRow[c];
      }
    }
  }

  public getDataRange(): MockRange {
    this.recordCall("getDataRange", []);
    const numRows = Math.max(1, this.grid.length);
    const numCols = Math.max(1, ...this.grid.map(r => r.length), 1);
    return new MockRange(this, 1, 1, numRows, numCols);
  }

  public getRange(rowOrA1: number | string, col?: number, numRows?: number, numCols?: number): MockRange {
    this.recordCall("getRange", [rowOrA1, col, numRows, numCols]);
    if (typeof rowOrA1 === "string") {
      const parsed = parseA1Notation(rowOrA1, this.grid.length);
      return new MockRange(this, parsed.startRow, parsed.startCol, parsed.numRows, parsed.numCols);
    }
    const targetRow = rowOrA1;
    const targetCol = col || 1;
    const rowCount = numRows !== undefined ? numRows : 1;
    const colCount = numCols !== undefined ? numCols : 1;
    return new MockRange(this, targetRow, targetCol, rowCount, colCount);
  }

  public getDataValidation(row: number, col: number): any {
    return this.validations.get(`${row},${col}`) || null;
  }

  public setDataValidation(row: number, col: number, rule: any): void {
    if (rule === null) {
      this.validations.delete(`${row},${col}`);
    } else {
      this.validations.set(`${row},${col}`, rule);
    }
  }

  public getNumberFormat(row: number, col: number): string {
    return this.numberFormats.get(`${row},${col}`) || "";
  }

  public setNumberFormat(row: number, col: number, format: string): void {
    if (!format) {
      this.numberFormats.delete(`${row},${col}`);
    } else {
      this.numberFormats.set(`${row},${col}`, format);
    }
  }

  public clearContents(): void {
    this.recordCall("clearContents", []);
    this.grid = [];
    this.validations.clear();
  }

  private insertBlankRowAt(insertIdx: number): void {
    const colCount = Math.max(1, ...this.grid.map(r => r.length), 1);
    const safeIdx = Math.min(this.grid.length, Math.max(0, insertIdx));
    this.grid.splice(safeIdx, 0, new Array(colCount).fill(""));
  }

  public insertRowBefore(rowIndex: number): void {
    this.recordCall("insertRowBefore", [rowIndex]);
    this.insertBlankRowAt(rowIndex - 1);
  }

  public insertRowAfter(rowIndex: number): void {
    this.recordCall("insertRowAfter", [rowIndex]);
    this.insertBlankRowAt(rowIndex);
  }
}

export class MockSpreadsheet {
  private sheets: Map<string, MockSheet> = new Map();
  private namedRanges: Map<string, { tabName: string; rangeNotation: string }> = new Map();
  public calls: CallLog[] = [];

  constructor(public id: string, public name: string = "Mock Spreadsheet") {
    this.insertSheet("Sheet1");
  }

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  public getId(): string {
    this.recordCall("getId", []);
    return this.id;
  }

  public getName(): string {
    this.recordCall("getName", []);
    return this.name;
  }

  public getSheetByName(name: string): MockSheet | null {
    this.recordCall("getSheetByName", [name]);
    return this.sheets.get(name) || null;
  }

  public getNamedRanges(): Array<{ getName(): string; getRange(): MockRange | null }> {
    this.recordCall("getNamedRanges", []);
    const result: Array<{ getName(): string; getRange(): MockRange | null }> = [];
    for (const [name, entry] of this.namedRanges.entries()) {
      result.push({
        getName: () => name,
        getRange: () => {
          const sheet = this.getSheetByName(entry.tabName);
          return sheet ? sheet.getRange(entry.rangeNotation) : null;
        }
      });
    }
    return result;
  }


  public setNamedRange(name: string, tabName: string, rangeNotation: string): void {
    this.namedRanges.set(name, { tabName, rangeNotation });
  }

  public loadWorkbookSpec(spec: { tabs?: any[]; namedRanges?: any[] }): void {
    this.recordCall("loadWorkbookSpec", [spec]);
    if (spec.tabs) {
      for (const tabDef of spec.tabs) {
        let sheet = this.getSheetByName(tabDef.name);
        if (!sheet) {
          sheet = this.insertSheet(tabDef.name);
        }
        if (tabDef.seedRows && tabDef.seedRows.length > 0 && (!tabDef.columns || tabDef.columns.length === 0)) {
          sheet.setGridSlice(1, 1, tabDef.seedRows);
        }
        if (tabDef.columns && tabDef.columns.length > 0) {
          const offsets = DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.offsets;
          sheet.setGridSlice(offsets.TITLE_ROW_INDEX, 1, [[tabDef.title || tabDef.name]]);
          sheet.setGridSlice(offsets.DATE_ROW_INDEX, 1, [["=TODAY()"]]);
          const headers = tabDef.columns.map((c: ColumnSpec) => c.header);
          sheet.setGridSlice(offsets.HEADER_ROW_INDEX, 1, [headers]);
          const formulas = tabDef.columns.map((c: ColumnSpec) => c.formula || "");
          sheet.setGridSlice(offsets.FORMULA_ROW_INDEX, 1, [formulas]);
        }
      }
    }
    if (spec.namedRanges) {
      for (const nrDef of spec.namedRanges) {
        this.setNamedRange(nrDef.name, nrDef.tabName, nrDef.rangeNotation);
      }
    }
  }

  public getRangeByName(name: string): MockRange | null {
    this.recordCall("getRangeByName", [name]);
    let targetTab: string | undefined;
    let notation: string | undefined;

    if (this.namedRanges.has(name)) {
      const entry = this.namedRanges.get(name)!;
      targetTab = entry.tabName;
      notation = entry.rangeNotation;
    } else if (name.includes("!")) {
      const parts = name.split("!");
      targetTab = parts[0].replace(/^'|'$/g, "");
      notation = parts[1];
    } else {
      // Check if any named range ends with !name or has matching name
      for (const [key, entry] of this.namedRanges.entries()) {
        if (key === name || key.endsWith("!" + name)) {
          targetTab = entry.tabName;
          notation = entry.rangeNotation;
          break;
        }
      }
    }

    if (!notation) return null;
    const sheet = targetTab ? this.getSheetByName(targetTab) : (this.getSheets()[0] || null);
    if (!sheet) return null;
    return sheet.getRange(notation);
  }

  public evaluateVlookup(
    searchKey: string,
    rangeNameOrNotation: string,
    columnIndex: number,
    exactMatch: boolean = true
  ): string {
    this.recordCall("evaluateVlookup", [searchKey, rangeNameOrNotation, columnIndex, exactMatch]);
    const range = this.getRangeByName(rangeNameOrNotation);
    if (!range) {
      return "#N/A";
    }
    const values = range.getValues();
    const searchTarget = String(searchKey || "").trim();
    if (!searchTarget) {
      return "#N/A";
    }

    for (const row of values) {
      if (row.length === 0) continue;
      const keyVal = String(row[0] || "").trim();
      const isMatch = exactMatch
        ? keyVal.toLowerCase() === searchTarget.toLowerCase()
        : keyVal.toLowerCase().includes(searchTarget.toLowerCase());
      if (isMatch) {
        const val = row[columnIndex - 1];
        return val !== undefined && val !== null ? String(val) : "";
      }
    }
    return "#N/A";
  }


  public getProtections(type?: string): MockProtection[] {
    this.recordCall("getProtections", [type]);
    const result: MockProtection[] = [];
    for (const sheet of this.getSheets()) {
      result.push(...sheet.getProtections(type));
    }
    return result;
  }

  public getSheets(): MockSheet[] {
    this.recordCall("getSheets", []);
    return Array.from(this.sheets.values());
  }

  public insertSheet(name: string, initialData: any[][] = []): MockSheet {
    this.recordCall("insertSheet", [name]);
    const sheet = new MockSheet(name, initialData);
    this.sheets.set(name, sheet);
    return sheet;
  }

  public reset(): void {
    this.sheets.clear();
    this.insertSheet("Sheet1");
    this.calls = [];
  }
}

export class MockSheetsService {
  public ProtectionType = { RANGE: "RANGE", SHEET: "SHEET" };
  private spreadsheets: Map<string, MockSpreadsheet> = new Map();
  public calls: CallLog[] = [];

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  public openById(id: string): MockSpreadsheet {
    this.recordCall("openById", [id]);
    if (!this.spreadsheets.has(id)) {
      const ss = new MockSpreadsheet(id);
      const logSheetName = (globalThis as any).CONFIG?.LOG_SHEET_NAME;
      if (logSheetName && logSheetName !== "Sheet1") {
        ss.insertSheet(logSheetName);
      }
      this.spreadsheets.set(id, ss);
    }
    return this.spreadsheets.get(id)!;
  }

  public create(name: string): MockSpreadsheet {
    this.recordCall("create", [name]);
    const id = `ss-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const ss = new MockSpreadsheet(id, name);
    this.spreadsheets.set(id, ss);
    return ss;
  }

  public getActiveSpreadsheet(): MockSpreadsheet {
    this.recordCall("getActiveSpreadsheet", []);
    let first = Array.from(this.spreadsheets.values())[0];
    if (!first) {
      first = this.openById("default-ss");
    }
    return first;
  }

  public newDataValidation(): MockDataValidationBuilder {
    this.recordCall("newDataValidation", []);
    return new MockDataValidationBuilder();
  }

  public reset(): void {
    this.spreadsheets.clear();
    this.calls = [];
  }
}

export class MockSheetsState {
  constructor(private harness: GasMockHarness, private spreadsheetId?: string) {}

  private getSpreadsheet(): MockSpreadsheet {
    if (this.spreadsheetId) {
      return this.harness.sheetsService.openById(this.spreadsheetId);
    }
    return this.harness.sheetsService.getActiveSpreadsheet();
  }

  private resolveSheet(sheetName?: string): MockSheet | null {
    const ss = this.getSpreadsheet();
    return sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0] || null;
  }

  public getSheetData(sheetName?: string): any[][] {
    const sheet = this.resolveSheet(sheetName);
    if (!sheet) return [];
    return sheet.getGrid();
  }

  public getRangeValues(rangeNotation: string, sheetName?: string): any[][] {
    let targetSheetName = sheetName;
    let notation = rangeNotation;

    if (rangeNotation.includes("!")) {
      const parts = rangeNotation.split("!");
      targetSheetName = parts[0];
      notation = parts[1];
    }

    const sheet = this.resolveSheet(targetSheetName);
    if (!sheet) return [];

    return sheet.getRange(notation).getValues();
  }

  public getSheets(): string[] {
    const ss = this.getSpreadsheet();
    return ss.getSheets().map(s => s.getName());
  }

  public evaluateVlookup(
    searchKey: string,
    rangeNameOrNotation: string,
    columnIndex: number,
    exactMatch: boolean = true
  ): string {
    const ss = this.getSpreadsheet();
    return ss.evaluateVlookup(searchKey, rangeNameOrNotation, columnIndex, exactMatch);
  }

  public evaluateFfeFormula(
    formulaIdOrExpression: string,
    row: FfeFormulaRowInput
  ): string {
    return evaluateFfeFormula(formulaIdOrExpression, row, this.harness);
  }
}

export interface HarnessInstallOptions {
  configOverrides?: Record<string, unknown>;
  csiDivisionsOverrides?: Record<string, string>;
  driveAdvancedServiceOverrides?: Record<string, unknown>;
  sheetsAdvancedServiceOverrides?: any;
}


let cachedDefaultConfig: Record<string, unknown> | null = null;

function getDefaultConfig(): Record<string, unknown> {
  if (cachedDefaultConfig) return cachedDefaultConfig;
  cachedDefaultConfig = (ConfigConst || (globalThis as any).CONFIG || {}) as Record<string, unknown>;
  return cachedDefaultConfig;
}


export interface CardServiceStateCallable {
  (card: any): Record<string, unknown>;
  hasWidgetText: typeof CardSerializer.hasWidgetText;
  findButton: typeof CardSerializer.findButton;
  getNotificationText: typeof CardSerializer.getNotificationText;
}


export class MockLock {
  private locked: boolean = false;
  public calls: CallLog[] = [];

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  public tryLock(timeoutInMillis: number): boolean {
    this.recordCall("tryLock", [timeoutInMillis]);
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  public hasLock(): boolean {
    this.recordCall("hasLock", []);
    return this.locked;
  }

  public releaseLock(): void {
    this.recordCall("releaseLock", []);
    this.locked = false;
  }

  public reset(): void {
    this.locked = false;
    this.calls = [];
  }
}

export class MockLockService {
  public scriptLock: MockLock = new MockLock();
  public userLock: MockLock = new MockLock();
  public documentLock: MockLock = new MockLock();
  public calls: CallLog[] = [];

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  public getScriptLock(): MockLock {
    this.recordCall("getScriptLock", []);
    return this.scriptLock;
  }

  public getUserLock(): MockLock {
    this.recordCall("getUserLock", []);
    return this.userLock;
  }

  public getDocumentLock(): MockLock {
    this.recordCall("getDocumentLock", []);
    return this.documentLock;
  }

  public reset(): void {
    this.scriptLock.reset();
    this.userLock.reset();
    this.documentLock.reset();
    this.calls = [];
  }
}

export class GasMockHarness {
  private static instance: GasMockHarness | null = null;
  private static originalGlobals: Map<string, unknown> = new Map();

  public propertiesService: MockPropertiesService = new MockPropertiesService();
  public cacheService: MockCacheService = new MockCacheService();
  public sheetsService: MockSheetsService = new MockSheetsService();
  public driveState: MockDriveState = new MockDriveState();
  public cardService: MockCardService = new MockCardService();
  public lockService: MockLockService = new MockLockService();
  public config: Record<string, unknown> = {};
  private configOverrides: Record<string, unknown> = {};

  private constructor(options?: HarnessInstallOptions) {
    this.configOverrides = options?.configOverrides || {};
    this.resetConfig();
  }

  private resetConfig(): void {
    const defaultDescriptors = Object.getOwnPropertyDescriptors(getDefaultConfig());
    const overrideDescriptors: Record<string, PropertyDescriptor> = {};

    for (const [key, val] of Object.entries(this.configOverrides)) {
      overrideDescriptors[key] = {
        value: val,
        writable: true,
        enumerable: true,
        configurable: true
      };
    }

    this.config = Object.defineProperties({}, {
      ...defaultDescriptors,
      ...overrideDescriptors
    });
  }

  public static install(options?: HarnessInstallOptions): GasMockHarness {
    const globalsToStub = ["CONFIG", "CacheService", "PropertiesService", "SpreadsheetApp", "DriveApp", "CardService", "LockService", "CSI_DIVISIONS", "Drive", "Sheets"];
    for (const name of globalsToStub) {
      if (!GasMockHarness.originalGlobals.has(name)) {
        GasMockHarness.originalGlobals.set(name, (globalThis as any)[name]);
      }
    }

    if (!GasMockHarness.instance) {
      GasMockHarness.instance = new GasMockHarness(options);
    } else {
      if (options?.configOverrides) {
        GasMockHarness.instance.configOverrides = options.configOverrides;
      }
      GasMockHarness.reset();
    }

    (globalThis as any).PropertiesService = GasMockHarness.instance.propertiesService;
    (globalThis as any).CacheService = GasMockHarness.instance.cacheService;
    (globalThis as any).SpreadsheetApp = GasMockHarness.instance.sheetsService;
    (globalThis as any).CardService = GasMockHarness.instance.cardService;
    (globalThis as any).LockService = GasMockHarness.instance.lockService;
    (globalThis as any).CONFIG = GasMockHarness.instance.config;
    (globalThis as any).DriveApp = new MockDriveApp(GasMockHarness.instance.driveState);
    (globalThis as any).Utilities = (globalThis as any).Utilities || { formatDate: (d: any, tz: string, f: string)=> (d && d.toISOString ? d.toISOString().slice(2, 10).replace(/-/g, "") : "260726") };
    (globalThis as any).Session = (globalThis as any).Session || { getScriptTimeZone : () => "America/New_York", getActiveUser: () => ({ getEmail: () => "user@example.com" }) };
    (globalThis as any).CSI_DIVISIONS = options?.csiDivisionsOverrides || DEFAULT_CSI_DIVISIONS;
    (globalThis as any).Drive = options?.driveAdvancedServiceOverrides !== undefined ? options.driveAdvancedServiceOverrides : undefined;
    (globalThis as any).Sheets = options?.sheetsAdvancedServiceOverrides !== undefined ? options.sheetsAdvancedServiceOverrides : undefined;

    return GasMockHarness.instance;
  }

  public static reset(): void {
    if (!GasMockHarness.instance) {
      GasMockHarness.install();
    }
    GasMockHarness.instance!.propertiesService.reset();
    GasMockHarness.instance!.cacheService.reset();
    GasMockHarness.instance!.sheetsService.reset();
    GasMockHarness.instance!.driveState.reset();
    GasMockHarness.instance!.cardService = new MockCardService();
    GasMockHarness.instance!.lockService.reset();
    GasMockHarness.instance!.configOverrides = {};
    GasMockHarness.instance!.resetConfig();
    (globalThis as any).CONFIG = GasMockHarness.instance!.config;
    (globalThis as any).CardService = GasMockHarness.instance!.cardService;
    (globalThis as any).CSI_DIVISIONS = DEFAULT_CSI_DIVISIONS;
  }

  public static getCardServiceState: CardServiceStateCallable = Object.assign(
    function (card: any): Record<string, unknown> {
      return CardSerializer.toJSON(card) as unknown as Record<string, unknown>;
    },
    {
      hasWidgetText: CardSerializer.hasWidgetText,
      findButton: CardSerializer.findButton,
      getNotificationText: CardSerializer.getNotificationText
    }
  );

  public static uninstall(): void {
    for (const [name, originalValue] of GasMockHarness.originalGlobals.entries()) {
      if (originalValue === undefined) {
        delete (globalThis as any)[name];
      } else {
        (globalThis as any)[name] = originalValue;
      }
    }
    GasMockHarness.originalGlobals.clear();
    GasMockHarness.instance = null;
  }

  public get scriptProperties(): MockPropertiesStore {
    return this.propertiesService.getScriptProperties();
  }

  public get userProperties(): MockPropertiesStore {
    return this.propertiesService.getUserProperties();
  }

  public get documentProperties(): MockPropertiesStore {
    return this.propertiesService.getDocumentProperties();
  }

  public get userCache(): MockCacheStore {
    return this.cacheService.getUserCache();
  }

  public get scriptCache(): MockCacheStore {
    return this.cacheService.getScriptCache();
  }

  public getDriveState(): MockDriveState {
    return this.driveState;
  }

  public get documentCache(): MockCacheStore {
    return this.cacheService.getDocumentCache();
  }

  public getSheetsState(spreadsheetId?: string): MockSheetsState {
    return new MockSheetsState(this, spreadsheetId);
  }
}

export interface FfeFormulaRowInput {
  specTag?: string;
  relatedTag?: string;
  revision?: string;
  specTitle?: string;
  contact?: string;
  action?: string;
}

export function evaluateFfeFormula(
  formulaIdOrExpression: string,
  row: FfeFormulaRowInput,
  harness?: GasMockHarness
): string {
  const tag = String(row.specTag || "").trim();
  const rel = String(row.relatedTag || "").trim();
  const rev = String(row.revision || "").trim();
  const title = String(row.specTitle || "").trim();
  const contact = String(row.contact || "").trim();
  const action = String(row.action || "").trim();

  if (
    formulaIdOrExpression === "calcFileName" ||
    formulaIdOrExpression.includes("calcFileName") ||
    formulaIdOrExpression.includes("tag, rel, rev")
  ) {
    if (!tag) return "";
    return tag + (rel ? "-" + rel : "") + "-" + rev;
  }

  if (
    formulaIdOrExpression === "calcNumber" ||
    formulaIdOrExpression.includes("calcNumber") ||
    formulaIdOrExpression.includes("tag, rev")
  ) {
    if (!tag) return "";
    return tag + "-" + rev;
  }

  if (
    formulaIdOrExpression === "calcTitle" ||
    formulaIdOrExpression.includes("calcTitle") ||
    formulaIdOrExpression.includes("VLOOKUP")
  ) {
    if (!tag) {
      return title;
    }
    let lookedUp = "#N/A";
    if (harness) {
      const activeSs = harness.sheetsService.getActiveSpreadsheet();
      lookedUp = activeSs.evaluateVlookup(tag, "'Submittal FFE Support'!SpecTags", 2, true);
      if (lookedUp === "#N/A") {
        lookedUp = activeSs.evaluateVlookup(tag, "SpecTags", 2, true);
      }
    } else {
      const seedSpecTags: Record<string, string> = {
        "CH-01": "Dining Chair",
        "TBL-01": "Conference Table"
      };
      lookedUp = seedSpecTags[tag] || "#N/A";
    }
    return lookedUp !== "#N/A" ? lookedUp : title;
  }

  if (
    formulaIdOrExpression === "calcContactChain" ||
    formulaIdOrExpression.includes("calcContactChain") ||
    formulaIdOrExpression.includes("c, a")
  ) {
    if (!contact) return "";
    return contact + (action ? " (" + action + ")" : "");
  }

  if (
    formulaIdOrExpression === "calcSort" ||
    formulaIdOrExpression.includes("calcSort")
  ) {
    if (!tag) return "";
    return tag + "_" + rev;
  }

  return "";
}
