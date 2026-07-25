// src/RowPositionCalculator.ts

function padNum(val: any, len: number): string {
  return String(val || "").trim().padStart(len, '0');
}

function isRowBlank(row: any[]): boolean {
  return row.slice(0, 8).every((cell: any) => String(cell || "").trim() === "");
}

function getBoundedData(logData: any[][]): any[][] {
  const boundedData: any[][] = [];
  let emptyGapCount = 0;

  for (let i = 0; i < logData.length; i++) {
    boundedData.push(logData[i]);
    if (i >= CONFIG.LOG_HEADER_ROW) {
      let blank = isRowBlank(logData[i]);
      if (String(logData[i][0] || "").toLowerCase().includes("formula row")) {
        blank = false;
      }
      if (blank) {
        emptyGapCount++;
        if (emptyGapCount >= 3) break;
      } else {
        emptyGapCount = 0;
      }
    }
  }

  return boundedData;
}

function getRowGroupKey(row: any[], discipline: string, headers: string[]): string {
  if (discipline === "Architecture") {
    const secIdx = headers.indexOf("Section");
    const numIdx = headers.indexOf("Number");
    let sec = padNum(secIdx !== -1 ? row[secIdx] : "", 6);
    let num = padNum(numIdx !== -1 ? row[numIdx] : "", 3);
    return `${sec}-${num}`.toLowerCase();
  } else {
    const tagIdx = headers.indexOf("Spec Tag");
    let tag = String(tagIdx !== -1 ? row[tagIdx] || "" : "").trim();
    return tag.toLowerCase();
  }
}

function getRowSortKey(row: any[], discipline: string, headers: string[]): string {
  const revIdx = headers.indexOf("Revision");
  const dateIdx = headers.indexOf("Date");
  
  let rev = padNum(revIdx !== -1 ? row[revIdx] : "", 3);
  let rawDate = dateIdx !== -1 ? row[dateIdx] : "";
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
    dateStr = String(rawDate || "").replace(/\D/g, '').padEnd(6, '0');
  }

  if (discipline === "Architecture") {
    const secIdx = headers.indexOf("Section");
    const numIdx = headers.indexOf("Number");
    let sec = padNum(secIdx !== -1 ? row[secIdx] : "", 6);
    let num = padNum(numIdx !== -1 ? row[numIdx] : "", 3);
    return `${sec}-${num}-${rev}-${dateStr}`;
  } else {
    const tagIdx = headers.indexOf("Spec Tag");
    let tag = String(tagIdx !== -1 ? row[tagIdx] || "" : "").trim().toLowerCase();
    return `${tag}-${rev}-${dateStr}`;
  }
}

function computeRowInsertionPlan(
  boundedData: any[][],
  headers: string[],
  rowData: any[],
  discipline: string
): RowInsertionPlan {
  const normalizedTargetGroupKey = getRowGroupKey(rowData, discipline, headers);
  const targetSortKey = getRowSortKey(rowData, discipline, headers);

  let groups: Array<{ val: string; start: number; end: number; rows: Array<{ index: number; key: string }> }> = [];
  let currentGroup: { val: string; start: number; end: number; rows: Array<{ index: number; key: string }> } | null = null;
  let firstDataRowIdx = -1;

  for (let i = CONFIG.LOG_HEADER_ROW; i < boundedData.length; i++) {
    let row = boundedData[i];
    if (String(row[0] || "").toLowerCase().includes("formula row")) continue;
    if (isRowBlank(row)) {
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      continue;
    }

    let rowGroupVal = getRowGroupKey(row, discipline, headers);
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
      currentGroup.rows.push({ index: i, key: getRowSortKey(row, discipline, headers) });
    } else if (currentGroup) {
      groups.push(currentGroup);
      currentGroup = null;
    }
  }
  if (currentGroup) groups.push(currentGroup);

  const targetGroup = groups.find(g => g.val === normalizedTargetGroupKey);

  if (targetGroup) {
    let insertAfterIdx = targetGroup.start - 1;
    for (let r of targetGroup.rows) {
      if (targetSortKey.localeCompare(r.key) >= 0) insertAfterIdx = r.index;
    }
    return {
      targetRowIndex: insertAfterIdx + 1, // 1-based index to insert after
      insertBlankBefore: false,
      insertBlankAfter: false,
      finalRowIndex: insertAfterIdx + 2
    };
  } else {
    const firstDataRow1Based = firstDataRowIdx !== -1 ? firstDataRowIdx + 1 : -1;
    let insertAfterRow1Based = firstDataRow1Based !== -1 ? firstDataRow1Based - 1 : CONFIG.LOG_HEADER_ROW;
    for (let g of groups) {
      if (normalizedTargetGroupKey.localeCompare(g.val) > 0) insertAfterRow1Based = g.end + 1;
    }

    let newRowIndex = insertAfterRow1Based + 1;
    let insertBlankBefore = false;
    if (insertAfterRow1Based >= firstDataRow1Based && firstDataRow1Based !== -1) {
      insertBlankBefore = true;
      newRowIndex++;
    }

    let insertBlankAfter = false;
    let dataRowBelow = boundedData[insertAfterRow1Based];
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

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getBoundedData,
    getRowGroupKey,
    getRowSortKey,
    computeRowInsertionPlan
  };
}
