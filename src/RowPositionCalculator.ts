/**
 * @file RowPositionCalculator.ts
 * @description Pure calculation functions for log sheet row positioning, group key extraction, sorting, and gap formatting.
 *
 * Computes `RowInsertionPlan` to place new submittals within existing groups or create new groups
 * with appropriate blank separator rows in the Google Sheet.
 */

/**
 * Safely pads a numeric or string value with leading zeros up to specified length.
 *
 * @param val - Raw input value.
 * @param len - Target minimum string length.
 * @returns Zero-padded string.
 */
function padNum(val: unknown, len: number): string {
  return String(val || "").trim().padStart(len, '0');
}

/**
 * Evaluates whether a raw log sheet row array is blank (empty/whitespace across first 8 columns).
 *
 * @param row - Raw row array.
 * @returns `true` if all first 8 cells are empty/whitespace, `false` otherwise.
 */

/**
 * Formats a raw date value into YYMMDD string format.
 */
function formatRowDate(rawDate: unknown): string {
  if (rawDate instanceof Date) {
    const yy = String(rawDate.getFullYear()).slice(-2);
    const mm = String(rawDate.getMonth() + 1).padStart(2, "0");
    const dd = String(rawDate.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  }
  return String(rawDate || "").replace(/\D/g, "").padStart(6, "0");
}

function isRowBlank(row: unknown[]): boolean {
  return row.slice(0, 8).every((cell: unknown) => String(cell || "").trim() === "");
}

/**
 * Truncates raw 2D spreadsheet data after encountering 5 consecutive blank rows below headers.
 * Ignores "formula row" markers.
 *
 * @param logData - Full 2D array of spreadsheet values.
 * @returns Bounded 2D array ending after data boundaries.
 */
export function getBoundedData(logData: unknown[][]): unknown[][] {
  const boundedData: unknown[][] = [];
  let emptyGapCount = 0;

  for (let i = 0; i < logData.length; i++) {
    boundedData.push(logData[i]);
    const headerRow = typeof CONFIG !== "undefined" && CONFIG.LOG_HEADER_ROW ? CONFIG.LOG_HEADER_ROW : 3;
    if (i >= headerRow) {
      let blank = isRowBlank(logData[i]);
      if (String(logData[i][0] || "").toLowerCase().includes("formula row")) {
        blank = false;
      }
      if (blank) {
        emptyGapCount++;
        if (emptyGapCount > 5) break;
      } else {
        emptyGapCount = 0;
      }
    }
  }

  return boundedData;
}

/**
 * Normalizes string values using PicklistResolver when available, or fallback rule logic.
 */
function normalizeValueForGroupKey(val: string, fieldSpec?: MinimalFieldSpec): string {
  if (typeof PicklistResolver !== "undefined" && typeof PicklistResolver.normalizePicklistValue === "function") {
    return PicklistResolver.normalizePicklistValue(val, fieldSpec);
  }
  const rule = fieldSpec?.keyNormalizationRule || 'exact';
  if (rule === 'code') {
    const codePart = val.trim().split(/\s+-\s+|\s+-(?=[A-Za-z])/)[0];
    return codePart.replace(/[\s.-]+/g, '').toUpperCase();
  }
  return val.trim().toUpperCase();
}

/**
 * Extracts normalized group key from a raw row array based on discipline (section-number for Architecture, specTag for FF&E).
 *
 * @param row - Raw row array.
 * @param discipline - Architectural or FF&E discipline string.
 * @param headers - Sheet header columns array.
 * @param fieldSpecs - Optional document field specifications array.
 * @returns Uppercase group key string.
 */
/**
 * Creates an in-memory RowKeyFn for IdentityGroup calculation.
 */
export function createRowIdentityGroupKeyFn(fieldSpecs?: DocumentFieldSpec[]): RowKeyFn {
  return (row: unknown[], headers: string[]) => {
    return getRowGroupKey(row, "", headers, fieldSpecs);
  };
}

/**
 * Creates an in-memory RowKeyFn for IdentityRevisionGroup calculation.
 */
export function createRowIdentityRevisionGroupKeyFn(fieldSpecs?: DocumentFieldSpec[]): RowKeyFn {
  return (row: unknown[], headers: string[]) => {
    const groupKey = getRowGroupKey(row, "", headers, fieldSpecs);
    const revIdx = headers.indexOf("Revision");
    if (revIdx !== -1 && row[revIdx] !== undefined && String(row[revIdx]).trim() !== "") {
      const revStr = String(row[revIdx]).trim();
      const rev = /^\d+$/.test(revStr) ? padNum(revStr, 1) : revStr;
      return `${groupKey}-${rev}`;
    }
    return groupKey;
  };
}

/**
 * Creates an in-memory RowKeyFn for Identity (sort key) calculation.
 */
export function createRowIdentityKeyFn(fieldSpecs?: DocumentFieldSpec[]): RowKeyFn {
  return (row: unknown[], headers: string[]) => {
    const revGroupKey = createRowIdentityRevisionGroupKeyFn(fieldSpecs)(row, headers);
    const dateIdx = headers.indexOf("Date");
    const rawDate = dateIdx !== -1 ? row[dateIdx] : "";
    const dateStr = formatRowDate(rawDate);
    return dateStr ? `${revGroupKey}-${dateStr}` : revGroupKey;
  };
}

const createRowGroupKeyFn = createRowIdentityGroupKeyFn;
const createRowSortKeyFn = createRowIdentityKeyFn;

export {
  createRowGroupKeyFn,
  createRowSortKeyFn
};

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getBoundedData,
    getRowGroupKey,
    getRowSortKey,
    computeRowInsertionPlan,
    createRowGroupKeyFn,
    createRowSortKeyFn,
    createRowIdentityGroupKeyFn,
    createRowIdentityRevisionGroupKeyFn,
    createRowIdentityKeyFn
  };
}

(globalThis as any).getBoundedData = getBoundedData;
(globalThis as any).getRowGroupKey = getRowGroupKey;
(globalThis as any).getRowSortKey = getRowSortKey;
(globalThis as any).computeRowInsertionPlan = computeRowInsertionPlan;
(globalThis as any).createRowGroupKeyFn = createRowGroupKeyFn;
(globalThis as any).createRowSortKeyFn = createRowSortKeyFn;

export function getRowGroupKey(row: unknown[], disciplineOrGroupKeyFn: string | RowKeyFn, headers: string[], fieldSpecs?: DocumentFieldSpec[]): string {
  if (typeof disciplineOrGroupKeyFn === "function") return disciplineOrGroupKeyFn(row, headers);
  if (headers.includes("Section") && headers.includes("Number")) {
    const secIdx = headers.indexOf("Section");
    const numIdx = headers.indexOf("Number");
    const secVal = secIdx !== -1 ? String(row[secIdx] || "").trim() : "";
    const num = padNum(numIdx !== -1 ? row[numIdx] : "", 3);
    if (secVal) {
      const secSpec = fieldSpecs?.find(f => f.key === "section" || f.key === "specSection") || { key: "section", keyNormalizationRule: "code" as const };
      const secCode = normalizeValueForGroupKey(secVal, secSpec);
      const sec = padNum(secCode, 6);
      return `${sec}-${num}`.toUpperCase();
    }
    return num.toUpperCase();
  } else {
    const tagIdx = headers.indexOf("Spec Tag");
    const tag = String(tagIdx !== -1 ? row[tagIdx] || "" : "").trim();
    const tagSpec = fieldSpecs?.find(f => f.key === "specTag" || f.key === "tag") || { key: "specTag", keyNormalizationRule: "exact" as const };
    const normalizedTag = normalizeValueForGroupKey(tag, tagSpec);
    return normalizedTag.toUpperCase();
  }
}

/**
 * Extracts sort key from a raw row array formatted as `${groupKey}-${revision}-${dateStr}`.
 *
 * @param row - Raw row array.
 * @param discipline - Architectural or FF&E discipline string.
 * @param headers - Sheet header columns array.
 * @param fieldSpecs - Optional document field specifications array.
 * @returns Sort key string used to order submittal revisions within a group.
 */
export function getRowSortKey(row: unknown[], disciplineOrGroupKeyFn: string | RowKeyFn, headers: string[], fieldSpecs?: DocumentFieldSpec[]): string {
  if (typeof disciplineOrGroupKeyFn === "function") return disciplineOrGroupKeyFn(row, headers);
  const revIdx = headers.indexOf("Revision");
  const dateIdx = headers.indexOf("Date");
  
  const rev = padNum(revIdx !== -1 ? row[revIdx] : "", 3);
  const rawDate = dateIdx !== -1 ? row[dateIdx] : "";
  let dateStr = "";

  if (rawDate instanceof Date) {
    if (typeof Utilities !== "undefined" && Utilities.formatDate && typeof Session !== "undefined") {
      dateStr = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyMMdd");
    } else {
      const yy = String(rawDate.getFullYear()).slice(-2);
      const mm = String(rawDate.getMonth() + 1).padStart(2, '0');
      const dd = String(rawDate.getDate()).padStart(2, '0');
      dateStr = `${yy}${mm}${dd}`;
    }
  } else {
    dateStr = String(rawDate || "").replace(/\D/g, '').padStart(6, '0');
  }

  const groupKey = getRowGroupKey(row, disciplineOrGroupKeyFn, headers, fieldSpecs);
  return `${groupKey}-${rev}-${dateStr}`;
}

/**
 * Pure function computing the row insertion plan for placing a new submittal into the log sheet.
 */
export function computeRowInsertionPlan(
  boundedData: unknown[][],
  headers: string[],
  rowData: unknown[],
  disciplineOrGroupKeyFn: string | RowKeyFn,
  sortKeyFn?: RowKeyFn,
  fieldSpecs?: DocumentFieldSpec[]
): RowInsertionPlan {
  const getGroupKeyFn: RowKeyFn = typeof disciplineOrGroupKeyFn === "function"
    ? disciplineOrGroupKeyFn
    : (row, h) => getRowGroupKey(row, disciplineOrGroupKeyFn, h, fieldSpecs);

  const getSortKeyFn: RowKeyFn = sortKeyFn
    ? sortKeyFn
    : (row, h) => getRowSortKey(row, typeof disciplineOrGroupKeyFn === "string" ? disciplineOrGroupKeyFn : "", h, fieldSpecs);

  const normalizedTargetGroupKey = getGroupKeyFn(rowData, headers);
  const targetSortKey = getSortKeyFn(rowData, headers);

  const groups: Array<{ val: string; start: number; end: number; rows: Array<{ index: number; key: string }> }> = [];
  let currentGroup: { val: string; start: number; end: number; rows: Array<{ index: number; key: string }> } | null = null;
  let firstDataRowIdx = -1;

  const headerRowIdx = typeof CONFIG !== "undefined" && CONFIG.LOG_HEADER_ROW ? CONFIG.LOG_HEADER_ROW : 3;
  for (let i = headerRowIdx; i < boundedData.length; i++) {
    const row = boundedData[i];
    if (String(row[0] || "").toLowerCase().includes("formula row")) continue;
    if (isRowBlank(row)) {
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      continue;
    }

    const rowGroupVal = getGroupKeyFn(row, headers);
    if (rowGroupVal && rowGroupVal !== "-") {
      if (firstDataRowIdx === -1) firstDataRowIdx = i;
      if (!currentGroup) {
        currentGroup = { val: rowGroupVal, start: i, end: i, rows: [] };
      } else if (currentGroup.val !== rowGroupVal) {
        groups.push(currentGroup);
        currentGroup = { val: rowGroupVal, start: i, end: i, rows: [] };
      } else {
        currentGroup.end = i;
      }
      currentGroup.rows.push({ index: i, key: getSortKeyFn(row, headers) });
    } else if (currentGroup) {
      groups.push(currentGroup);
      currentGroup = null;
    }
  }
  if (currentGroup) groups.push(currentGroup);

  const targetGroup = groups.find(g => g.val === normalizedTargetGroupKey);

  if (targetGroup) {
    let insertAfterIdx = targetGroup.start - 1;
    for (const r of targetGroup.rows) {
      if (targetSortKey.localeCompare(r.key) >= 0) insertAfterIdx = r.index;
    }
    return {
      targetRowIndex: insertAfterIdx + 1,
      insertBlankBefore: false,
      insertBlankAfter: false,
      finalRowIndex: insertAfterIdx + 2
    };
  } else {
    const firstDataRow1Based = firstDataRowIdx !== -1 ? firstDataRowIdx + 1 : -1;
    const headerRowConfig = typeof CONFIG !== "undefined" && CONFIG.LOG_HEADER_ROW ? CONFIG.LOG_HEADER_ROW : 3;
    let insertAfterRow1Based = firstDataRow1Based !== -1 ? firstDataRow1Based - 1 : headerRowConfig;
    for (const g of groups) {
      if (normalizedTargetGroupKey.localeCompare(g.val) > 0) insertAfterRow1Based = g.end + 1;
    }

    let newRowIndex = insertAfterRow1Based + 1;
    let insertBlankBefore = false;
    if (insertAfterRow1Based >= firstDataRow1Based && firstDataRow1Based !== -1) {
      insertBlankBefore = true;
      newRowIndex++;
    }

    let insertBlankAfter = false;
    const dataRowBelow = insertAfterRow1Based < boundedData.length ? boundedData[insertAfterRow1Based] : null;
    let isRowBelowBlank = false;
    if (!dataRowBelow || isRowBlank(dataRowBelow)) {
      isRowBelowBlank = true;
    }
    if (!isRowBelowBlank) {
      insertBlankAfter = true;
    }

    return {
      targetRowIndex: insertAfterRow1Based,
      insertBlankBefore,
      insertBlankAfter,
      finalRowIndex: newRowIndex
    };
  }
}


