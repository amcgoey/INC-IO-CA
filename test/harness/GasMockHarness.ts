import { MockDriveState, MockDriveApp } from "./MockDrive";
import { MockCardService } from "./CardServiceMocks";
import { CardSerializer, ButtonJson } from "./CardSerializer";

/**
 * @file GasMockHarness.ts
 * @description Centralized testing infrastructure harness managing globalThis stubs for CONFIG, CacheService, PropertiesService, SpreadsheetApp, DriveApp, and CardService with explicit lifecycle methods.
 */

/// <reference path="../../src/Config.ts" />
declare var CONFIG: any;

let DEFAULT_CONFIG: Record<string, unknown> = {};
try {
  const req = require("../../src/Config");
  DEFAULT_CONFIG = req.CONFIG || {};
} catch (e) {
  if (typeof CONFIG !== "undefined") {
    DEFAULT_CONFIG = CONFIG as Record<string, unknown>;
  }
}


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
}

export class MockSheet {
  private grid: any[][] = [];
  public calls: CallLog[] = [];

  constructor(public name: string, initialData: any[][] = [], public sheetId: number = 101) {
    this.grid = initialData.map(row => [...row]);
  }

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
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

  public clearContents(): void {
    this.recordCall("clearContents", []);
    this.grid = [];
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
    return this.sheets.get(name) || this.getSheets()[0] || null;
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
  private spreadsheets: Map<string, MockSpreadsheet> = new Map();
  public calls: CallLog[] = [];

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  public openById(id: string): MockSpreadsheet {
    this.recordCall("openById", [id]);
    if (!this.spreadsheets.has(id)) {
      this.spreadsheets.set(id, new MockSpreadsheet(id));
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
}

export interface HarnessInstallOptions {
  configOverrides?: Record<string, unknown>;
}


let cachedDefaultConfig: Record<string, unknown> | null = null;

function getDefaultConfig(): Record<string, unknown> {
  if (cachedDefaultConfig) return cachedDefaultConfig;
  try {
    const loaded = require("../../src/Config");
    cachedDefaultConfig = loaded.CONFIG || {};
  } catch (_err) {
    if (typeof (globalThis as any).CONFIG !== "undefined" && (globalThis as any).CONFIG) {
      cachedDefaultConfig = { ...(globalThis as any).CONFIG };
    } else {
      cachedDefaultConfig = {};
    }
  }
  return cachedDefaultConfig!;
}


export interface CardServiceStateCallable {
  (card: any): Record<string, unknown>;
  hasWidgetText: typeof CardSerializer.hasWidgetText;
  findButton: typeof CardSerializer.findButton;
  getNotificationText: typeof CardSerializer.getNotificationText;
}

export class GasMockHarness {
  private static instance: GasMockHarness | null = null;
  private static originalGlobals: Map<string, unknown> = new Map();

  public propertiesService: MockPropertiesService = new MockPropertiesService();
  public cacheService: MockCacheService = new MockCacheService();
  public sheetsService: MockSheetsService = new MockSheetsService();
  public driveState: MockDriveState = new MockDriveState();
  public cardService: MockCardService = new MockCardService();
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
    const globalsToStub = ["CONFIG", "CacheService", "PropertiesService", "SpreadsheetApp", "DriveApp", "CardService"];
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
    (globalThis as any).CONFIG = GasMockHarness.instance.config;
    (globalThis as any).DriveApp = new MockDriveApp(GasMockHarness.instance.driveState);

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
    GasMockHarness.instance!.configOverrides = {};
    GasMockHarness.instance!.resetConfig();
    (globalThis as any).CONFIG = GasMockHarness.instance!.config;
    (globalThis as any).CardService = GasMockHarness.instance!.cardService;
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
