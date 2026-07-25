// src/LogEngine.ts

declare var require: any;

if (typeof require !== "undefined") {
  try {
    const _rpc = eval('require("./RowPositionCalculator")');
    if (_rpc) {
      if (typeof getBoundedData === "undefined" && _rpc.getBoundedData) (globalThis as any).getBoundedData = _rpc.getBoundedData;
      if (typeof computeRowInsertionPlan === "undefined" && _rpc.computeRowInsertionPlan) (globalThis as any).computeRowInsertionPlan = _rpc.computeRowInsertionPlan;
    }
  } catch (e) {}
}

class LogEngine {
  private storageAdapter: SheetStorageAdapter;

  constructor(storageAdapter: SheetStorageAdapter) {
    this.storageAdapter = storageAdapter;
  }

  appendDocument(
    spreadsheetId: string,
    document: ValidatedDocument,
    strategy: DocumentLogStrategy,
    options: AppendDocumentOptions = {}
  ): AppendDocumentResult {
    const sheetName = options.sheetName || CONFIG.LOG_SHEET_NAME;
    const logData = this.storageAdapter.getSheetValues(sheetName);

    const headerRowIdx = CONFIG.LOG_HEADER_ROW > 0 ? CONFIG.LOG_HEADER_ROW - 1 : 2;

    const headers = options.headers || (
      logData.length > headerRowIdx
        ? logData[headerRowIdx].map((h: any) => String(h || "").trim())
        : []
    );

    const boundedData = getBoundedData(logData);
    const targetKey = strategy.getTargetKey(document);

    const historyColIdx = headers.indexOf("Contact History");
    const calcChainColIdx = headers.indexOf("Calc Contact Chain");
    let previousChain = "";
    let previousRowSheetIndex: number | null = null;

    const dataStartIdx = CONFIG.LOG_HEADER_ROW > 0 ? CONFIG.LOG_HEADER_ROW : 3;

    for (let i = boundedData.length - 1; i >= dataStartIdx; i--) {
      const row = boundedData[i];
      const rowKey = strategy.getTargetKeyFromRow(row, headers);
      if (rowKey === targetKey) {
        const histVal = (historyColIdx !== -1) ? String(row[historyColIdx] || "").trim() : "";
        const calcVal = (calcChainColIdx !== -1) ? String(row[calcChainColIdx] || "").trim() : "";
        previousChain = histVal ? histVal : calcVal;
        previousRowSheetIndex = i + 1;
        break;
      }
    }

    let previousRowUpdated = false;
    if (options.updatePreviousStatus && previousRowSheetIndex !== null) {
      const statusColIdx = headers.indexOf("Status");
      if (statusColIdx !== -1) {
        const newStatus = options.previousRowStatus || "Closed";
        this.storageAdapter.setRangeValue(sheetName, previousRowSheetIndex, statusColIdx + 1, newStatus);
        previousRowUpdated = true;
      }
    }

    const contact = document.contact || "";
    const newChain = previousChain ? `${previousChain} ${contact}` : contact;
    const actionAbbr = options.actionAbbr || "";
    const newFileName = strategy.getFileName(document, newChain, actionAbbr);

    const status = options.status || "";
    const link = options.link || "";
    const payload = strategy.formatRowPayload(document, { link, contactHistory: newChain, status });

    const rowData = new Array(headers.length).fill("");
    for (const [k, v] of Object.entries(payload)) {
      const colIdx = headers.indexOf(k);
      if (colIdx !== -1) {
        rowData[colIdx] = v;
      }
    }

    const plan = computeRowInsertionPlan(
      boundedData,
      headers,
      rowData,
      (r: any[], h: string[]) => strategy.getGroupKeyFromRow(r, h),
      (r: any[], h: string[]) => strategy.getSortKeyFromRow(r, h)
    );

    const writeResult = this.storageAdapter.insertLogRow(sheetName, headers, rowData, plan);

    return {
      targetKey,
      newFileName,
      contactHistory: newChain,
      rowIndex: writeResult.rowIndex,
      failedColumns: writeResult.failedColumns || [],
      previousRowUpdated
    };
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LogEngine
  };
}
