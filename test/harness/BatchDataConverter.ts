import type { DocumentLogWorkbookSpec, TabSpec } from "../../src/core/config/DocumentLogWorkbookSpec";
import type { SpreadsheetBatchData, SheetPayload } from "../../src/adapters/gas/SpreadsheetBatchReaderAdapter";

const ASCII_OFFSET_UPPERCASE = 64;
const ALPHABET_LENGTH = 26;

function columnLetterToIndex(letter: string): number {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * ALPHABET_LENGTH + (letter.charCodeAt(i) - ASCII_OFFSET_UPPERCASE);
  }
  return index - 1;
}

function parseRangeNotation(notation: string): {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
} {
  const parts = notation.split(":");
  const startPart = parts[0].match(/([A-Z]+)(\d+)/);
  if (!startPart) return { startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 26 };
  const startCol = columnLetterToIndex(startPart[1]);
  const startRow = parseInt(startPart[2], 10) - 1;
  if (parts.length === 1) {
    return { startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: startCol, endColumnIndex: startCol + 1 };
  }
  const endPart = parts[1].match(/([A-Z]+)(\d+)/);
  if (!endPart) return { startRowIndex: startRow, endRowIndex: startRow + 100, startColumnIndex: startCol, endColumnIndex: startCol + 26 };
  const endCol = columnLetterToIndex(endPart[1]) + 1;
  const endRow = parseInt(endPart[2], 10);
  return { startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol };
}

/**
 * Test helper converting a declarative DocumentLogWorkbookSpec model into a SpreadsheetBatchData payload.
 */
export function convertWorkbookSpecToBatchData(
  workbookSpec: DocumentLogWorkbookSpec,
  spreadsheetId: string
): SpreadsheetBatchData {
  const sheetMap = new Map<string, number>();
  const sheets: SheetPayload[] = workbookSpec.tabs.map((tab: TabSpec, idx: number) => {
    const sheetId = idx + 1;
    sheetMap.set(tab.name, sheetId);
    const rowData = (tab.seedRows || []).map((row) => ({
      values: row.map((val) => {
        if (typeof val === "number") return { userEnteredValue: { numberValue: val } };
        if (typeof val === "boolean") return { userEnteredValue: { boolValue: val } };
        if (typeof val === "string") {
          if (val.startsWith("=")) return { userEnteredValue: { formulaValue: val } };
          return { userEnteredValue: { stringValue: val } };
        }
        return { userEnteredValue: {} };
      })
    }));
    return {
      properties: { sheetId, title: tab.name },
      data: [{ rowData }]
    };
  });

  const namedRanges = workbookSpec.namedRanges.map((nr) => {
    const sheetId = sheetMap.get(nr.tabName) || 1;
    const parsedRange = parseRangeNotation(nr.rangeNotation || (nr as any).range || "A1:Z100");
    return {
      name: nr.name,
      range: {
        sheetId,
        ...parsedRange
      }
    };
  });

  return {
    spreadsheetId,
    namedRanges,
    sheets
  };
}
