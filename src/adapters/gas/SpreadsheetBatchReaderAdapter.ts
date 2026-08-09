/**
 * @file SpreadsheetBatchReaderAdapter.ts
 * @description Tier 2 Infrastructure Adapter wrapping `Sheets.Spreadsheets.get` (Advanced Sheets Service v4)
 * with strict range (`_Config!A1:Z100` and `1:2`) and field mask bounding.
 */

export class SpreadsheetBatchReadException extends Error {
  public readonly spreadsheetId: string;
  public readonly cause?: unknown;

  constructor(message: string, spreadsheetId: string, cause?: unknown) {
    super(message);
    this.name = "SpreadsheetBatchReadException";
    this.spreadsheetId = spreadsheetId;
    this.cause = cause;
  }
}

export interface SheetValueCell {
  userEnteredValue?: {
    stringValue?: string;
    numberValue?: number;
    boolValue?: boolean;
    formulaValue?: string;
  };
  dataValidation?: any;
}

export interface SheetRowData {
  values?: SheetValueCell[];
}

export interface SheetGridData {
  rowData?: SheetRowData[];
}

export interface SheetProperties {
  sheetId?: number;
  title?: string;
}

export interface SheetPayload {
  properties?: SheetProperties;
  data?: SheetGridData[];
}

export interface NamedRangePayload {
  name?: string;
  namedRangeId?: string;
  range?: {
    sheetId?: number;
    startRowIndex?: number;
    endRowIndex?: number;
    startColumnIndex?: number;
    endColumnIndex?: number;
  };
}

export interface SpreadsheetBatchData {
  spreadsheetId: string;
  properties?: {
    title?: string;
  };
  namedRanges: NamedRangePayload[];
  sheets: SheetPayload[];
}

export class SpreadsheetBatchReaderAdapter {
  /**
   * Executes single-pass bounded batch fetch via `Sheets.Spreadsheets.get`.
   * Bounded ranges: `["_Config!A1:Z100", "1:2"]`
   * Bounded fields: `"namedRanges,sheets(properties(sheetId,title),data(rowData(values(userEnteredValue,dataValidation))))"`
   *
   * Throws `SpreadsheetBatchReadException` immediately on API failures or un-enabled service errors.
   */
  public readWorkbookBatch(spreadsheetId: string): SpreadsheetBatchData {
    if (
      typeof Sheets === "undefined" ||
      !Sheets ||
      !Sheets.Spreadsheets ||
      typeof Sheets.Spreadsheets.get !== "function"
    ) {
      throw new SpreadsheetBatchReadException(
        "Advanced Sheets Service (v4) is un-enabled or unavailable in appsscript.json manifest.",
        spreadsheetId
      );
    }

    const options = {
      ranges: ["_Config!A1:Z100", "1:2"],
      fields: "namedRanges,sheets(properties(sheetId,title),data(rowData(values(userEnteredValue,dataValidation))))"
    };

    try {
      const response = Sheets.Spreadsheets.get(spreadsheetId, options);
      if (!response) {
        throw new Error("Null or empty response returned by Sheets API.");
      }

      return {
        spreadsheetId: response.spreadsheetId || spreadsheetId,
        properties: response.properties || {},
        namedRanges: response.namedRanges || [],
        sheets: response.sheets || []
      };
    } catch (err: any) {
      if (err instanceof SpreadsheetBatchReadException) {
        throw err;
      }
      const msg = err && err.message ? err.message : String(err);
      throw new SpreadsheetBatchReadException(
        `Advanced Sheets API batch read failed for spreadsheet '${spreadsheetId}': ${msg}`,
        spreadsheetId,
        err
      );
    }
  }
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).SpreadsheetBatchReadException = (globalThis as any).SpreadsheetBatchReadException || SpreadsheetBatchReadException;
  (globalThis as any).SpreadsheetBatchReaderAdapter = (globalThis as any).SpreadsheetBatchReaderAdapter || SpreadsheetBatchReaderAdapter;
  module.exports = {
    SpreadsheetBatchReadException,
    SpreadsheetBatchReaderAdapter
  };
}
