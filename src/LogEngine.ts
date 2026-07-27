/**
 * @file LogEngine.ts
 * @description Application domain engine coordinating contact history chains, status transitions, row insertion plans, and spreadsheet log persistence.
 *
 * Utilizes `SheetStorageAdapter` for sheet reading and mutation and `DocumentLogStrategy` for target keys,
 * sorting keys, and tabular row payload formatting.
 */


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

/**
 * Extracts the resolved contact abbreviation from a validated document's ListDocumentField metadata.
 *
 * @param document - Validated document domain model.
 * @returns Abbreviated contact string, or empty string if not resolved.
 */
function getContactAbbreviation(document: ValidatedDocument): string {
  return document.listFields?.contact?.abbreviation || "";
}


function safePadNum(val: any, len: number): string {
  if (typeof padNum !== "undefined") return padNum(val, len);
  if ((globalThis as any).padNum) return (globalThis as any).padNum(val, len);
  return String(val || "").trim().padStart(len, '0');
}
class LogEngine {
  /** Low-level storage adapter executing spreadsheet operations. */
  private storageAdapter: SheetStorageAdapter;

  /**
   * Constructs a new `LogEngine` instance.
   *
   * @param storageAdapter - Concrete or test implementation of `SheetStorageAdapter`.
   */
  constructor(storageAdapter: SheetStorageAdapter) {
    this.storageAdapter = storageAdapter;
  }

  /**
   * Reads existing log entries matching IdentityData, extracts contact history and previous row details,
   * and optionally updates previous row status (e.g. marking previous revision Closed).
   *
   * @param spreadsheetId - Target spreadsheet ID string.
   * @param identityData - Abstract identity model containing identityGroup, identityRevisionGroup, and identity.
   * @param strategy - Optional DocumentLogStrategy for row key extraction.
   * @param options - ReadLogOptions.
   * @returns `ReadLogResult` containing match status, row index, contact history, and status update outcome.
   */
  readLog(
    spreadsheetId: string,
    identityData: IdentityData,
    strategy?: DocumentLogStrategy,
    options: ReadLogOptions = {}
  ): ReadLogResult {
    const sheetName = options.sheetName || CONFIG.LOG_SHEET_NAME;
    const logData = this.storageAdapter.getSheetValues(sheetName);

    const headerRowIdx = CONFIG.LOG_HEADER_ROW > 0 ? CONFIG.LOG_HEADER_ROW - 1 : 2;

    const headers = options.headers || (
      logData.length > headerRowIdx
        ? logData[headerRowIdx].map((h: any) => String(h || "").trim())
        : []
    );

    const boundedData = getBoundedData(logData);
    const historyColIdx = headers.indexOf("Contact History");
    const calcChainColIdx = headers.indexOf("Calc Contact Chain");
    const statusColIdx = headers.indexOf("Status");

    const dataStartIdx = CONFIG.LOG_HEADER_ROW > 0 ? CONFIG.LOG_HEADER_ROW : 3;

    let found = false;
    let rowIndex: number | null = null;
    let contactHistory = "";
    let previousStatus = "";
    let rowDataMap: Record<string, any> | null = null;

    for (let i = boundedData.length - 1; i >= dataStartIdx; i--) {
      const row = boundedData[i];
      let matches = false;
      if (strategy) {
        const groupKey = strategy.getGroupKeyFromRow(row, headers);
        const targetKey = strategy.getTargetKeyFromRow(row, headers);
        if (groupKey === identityData.identityGroup || targetKey === identityData.identity) {
          matches = true;
        }
      } else {
        const secIdx = headers.indexOf("Section");
        const numIdx = headers.indexOf("Number");
        const specTagIdx = headers.indexOf("Spec Tag");
        const sec = secIdx !== -1 ? String(row[secIdx] || "").trim() : "";
        const num = numIdx !== -1 ? String(row[numIdx] || "").trim() : "";
        const specTag = specTagIdx !== -1 ? String(row[specTagIdx] || "").trim() : "";
        const rowGroup = sec ? `${safePadNum(sec, 6)}-${safePadNum(num, 3)}`.toLowerCase() : (specTag ? specTag.toLowerCase() : num.toLowerCase());
        if (rowGroup === identityData.identityGroup || (row[0] && String(row[0]).trim() === identityData.identity)) {
          matches = true;
        }
      }

      if (matches) {
        found = true;
        rowIndex = i + 1;
        const histVal = (historyColIdx !== -1) ? String(row[historyColIdx] || "").trim() : "";
        const calcVal = (calcChainColIdx !== -1) ? String(row[calcChainColIdx] || "").trim() : "";
        contactHistory = histVal ? histVal : calcVal;
        previousStatus = (statusColIdx !== -1) ? String(row[statusColIdx] || "").trim() : "";

        rowDataMap = {};
        for (let c = 0; c < headers.length; c++) {
          if (headers[c]) {
            rowDataMap[headers[c]] = row[c];
          }
        }
        break;
      }
    }

    let previousRowUpdated = false;
    if (options.updatePreviousStatus && rowIndex !== null && statusColIdx !== -1) {
      const newStatus = options.previousRowStatus || "Closed";
      this.storageAdapter.setRangeValue(sheetName, rowIndex, statusColIdx + 1, newStatus);
      previousRowUpdated = true;
    }

    return {
      found,
      rowIndex,
      contactHistory,
      previousStatus,
      rowData: rowDataMap,
      identityData,
      previousRowUpdated
    };
  }

  /**
   * Appends or inserts a validated document into the specified spreadsheet log.
   */
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
    const identityData: IdentityData = options.identityData || (strategy.getIdentityData ? strategy.getIdentityData(document) : {
      identityGroup: strategy.getGroupKey(document),
      identityRevisionGroup: strategy.getSortKey(document),
      identity: strategy.getTargetKey(document)
    });
    const targetKey = identityData.identity;

    const historyColIdx = headers.indexOf("Contact History");
    const calcChainColIdx = headers.indexOf("Calc Contact Chain");
    let previousChain = "";
    let previousRowSheetIndex: number | null = null;

    const dataStartIdx = CONFIG.LOG_HEADER_ROW > 0 ? CONFIG.LOG_HEADER_ROW : 3;

    for (let i = boundedData.length - 1; i >= dataStartIdx; i--) {
      const row = boundedData[i];
      const rowGroupKey = strategy.getGroupKeyFromRow(row, headers);
      const rowKey = strategy.getTargetKeyFromRow(row, headers);
      if (rowGroupKey === identityData.identityGroup || rowKey === targetKey) {
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

    const contact = getContactAbbreviation(document);
    const newChain = [previousChain, contact].filter(Boolean).join(" ");
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