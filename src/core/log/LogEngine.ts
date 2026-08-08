/// <reference path="../../types.ts" />
/// <reference path="../interfaces/LogRepository.ts" />
/**
 * @file LogEngine.ts
 * @description Tier 1 Pure Core application domain engine coordinating contact history chains, status transitions, row insertion plans, and log persistence.
 *
 * Consumes Tier 1 SheetStorageAdapter seam without GAS globals or Node built-in imports.
 */

declare var require: any;

let getBoundedDataFn: ((logData: unknown[][]) => unknown[][]) | null = null;
let computeRowInsertionPlanFn: (
  boundedData: unknown[][],
  headers: string[],
  rowData: unknown[],
  disciplineOrGroupKeyFn: string | RowKeyFn,
  sortKeyFn?: RowKeyFn
) => RowInsertionPlan = (globalThis as Record<string, unknown>).computeRowInsertionPlan as any;

if (typeof (globalThis as Record<string, unknown>).getBoundedData === "function") {
  getBoundedDataFn = (globalThis as Record<string, unknown>).getBoundedData as any;
}

if (typeof require !== "undefined") {
  try {
    const rpc = require("../../RowPositionCalculator");
    if (rpc) {
      if (rpc.getBoundedData) getBoundedDataFn = rpc.getBoundedData;
      if (rpc.computeRowInsertionPlan) computeRowInsertionPlanFn = rpc.computeRowInsertionPlan;
    }
  } catch (e) {}
}

export function getBoundedData(logData: unknown[][]): unknown[][] {
  if (getBoundedDataFn) return getBoundedDataFn(logData);
  if (typeof (globalThis as Record<string, unknown>).getBoundedData === "function") {
    return ((globalThis as Record<string, unknown>).getBoundedData as any)(logData);
  }
  return logData;
}

/**
 * Extracts the resolved contact abbreviation
 */
function getContactAbbreviation(document: ValidatedDocument): string {
  return document.listFields?.contact?.abbreviation || "";
}

function safePadNumLogEngine_(val: unknown, len: number): string {
  if (typeof padNum !== "undefined") return padNum(val as any, len);
  if ((globalThis as Record<string, unknown>).padNum) return ((globalThis as Record<string, unknown>).padNum as any)(val, len);
  return String(val ?? "").trim().padStart(len, '0');
}

/**
 * Domain engine responsible for inserting validated submittals into tabular log sheets.
 * Calculates contact history chains, handles previous row status transitions (e.g. marking previous revisions Closed),
 * computes group/sort row insertion plans, and writes rows via the storage adapter.
 */
export class LogEngine {
  /** Low-level storage adapter executing spreadsheet operations. */
  private storageAdapter: SheetStorageAdapter;

  /**
   * Constructs a new `LogEngine` instance consuming a `SheetStorageAdapter` seam.
   *
   * @param storageAdapter - Storage adapter executing raw sheet reads/writes.
   */
  static getBoundedData(logData: unknown[][]): unknown[][] {
    return getBoundedData(logData);
  }


  /**
   * Appends a standardized 6-column audit event entry to the _AuditLog system tab.
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @param event - Audit log event payload.
   */
    logAuditEvent(_spreadsheetId: string, event: AuditLogEventInput): AuditLogResult {
    const sheetName = "_AuditLog";
    const timestamp = event.timestamp || new Date().toISOString();
    const actor = event.actor || "GoogleAppsScript";
    const details = typeof event.details === "object" && event.details !== null
      ? JSON.stringify(event.details)
      : String(event.details || "");

    const auditHeaders = ["Timestamp", "Category", "EventType", "Actor", "Status", "Details"];
    const logData = this.storageAdapter.getSheetValues(sheetName);
    const boundedData = getBoundedData(logData);

    let targetRowIndex = boundedData.length + 1;
    if (logData.length === 0) {
      this.storageAdapter.setRowValues(sheetName, 1, auditHeaders, auditHeaders);
      targetRowIndex = 2;
    }

    const rowData = [timestamp, event.category, event.eventType, actor, event.status, details];
    this.storageAdapter.setRowValues(sheetName, targetRowIndex, auditHeaders, rowData);

    return {
      sheetName,
      rowIndex: targetRowIndex,
      event
    };
  }

  constructor(storageAdapter: SheetStorageAdapter) {
    this.storageAdapter = storageAdapter;
  }

  /**
   * Helper function searching bounded log data backwards for matching group or target key.
   */
  private findMatchingRowIndex(
    boundedData: unknown[][],
    headers: string[],
    identityData: IdentityData,
    strategy?: DocumentLogStrategy,
    dataStartIdx: number = 3
  ): { rowIndex: number | null; row: unknown[] | null } {
    for (let i = boundedData.length - 1; i >= dataStartIdx; i--) {
      const row = boundedData[i];
      let matches = false;
      if (strategy) {
        const groupKey = strategy.getGroupKeyFromRow(row as any[], headers);
        const targetKey = strategy.getTargetKeyFromRow(row as any[], headers);
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
        const rowGroup = sec ? `${safePadNumLogEngine_(sec, 6)}-${safePadNumLogEngine_(num, 3)}`.toLowerCase() : (specTag ? specTag.toLowerCase() : num.toLowerCase());
        if (rowGroup === identityData.identityGroup || (row[0] && String(row[0]).trim() === identityData.identity)) {
          matches = true;
        }
      }

      if (matches) {
        return { rowIndex: i + 1, row };
      }
    }
    return { rowIndex: null, row: null };
  }

  /**
   * Reads existing log entries matching IdentityData, extracts contact history and previous row details,
   * and optionally updates previous row status (e.g. marking previous revision Closed).
   */
  readLog(
    spreadsheetId: string,
    identityData: IdentityData,
    strategy?: DocumentLogStrategy,
    options: ReadLogOptions = {}
  ): ReadLogResult {
    const sheetName = options.sheetName || (typeof CONFIG !== "undefined" ? CONFIG.LOG_SHEET_NAME : "Submittals Log");
    const logData = this.storageAdapter.getSheetValues(sheetName);

    const headerRowSetting = typeof CONFIG !== "undefined" ? CONFIG.LOG_HEADER_ROW : 3;
    const headerRowIdx = headerRowSetting > 0 ? headerRowSetting - 1 : 2;

    const headers = options.headers || (
      logData.length > headerRowIdx
        ? logData[headerRowIdx].map((h: unknown) => String(h || "").trim())
        : []
    );

    const boundedData = getBoundedDataFn ? getBoundedDataFn(logData) : logData;
    const historyColIdx = headers.indexOf("Contact History");
    const calcChainColIdx = headers.indexOf("Calc Contact Chain");
    const statusColIdx = headers.indexOf("Status");
    const dataStartIdx = headerRowSetting > 0 ? headerRowSetting : 3;

    const { rowIndex, row } = this.findMatchingRowIndex(boundedData, headers, identityData, strategy, dataStartIdx);

    let found = false;
    let contactHistory = "";
    let previousStatus = "";
    let rowDataMap: Record<string, unknown> | null = null;

    if (rowIndex !== null && row !== null) {
      found = true;
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
    const sheetName = options.sheetName || (typeof CONFIG !== "undefined" ? CONFIG.LOG_SHEET_NAME : "Submittals Log");
    const logData = this.storageAdapter.getSheetValues(sheetName);

    const headerRowSetting = typeof CONFIG !== "undefined" ? CONFIG.LOG_HEADER_ROW : 3;
    const headerRowIdx = headerRowSetting > 0 ? headerRowSetting - 1 : 2;

    const headers = options.headers || (
      logData.length > headerRowIdx
        ? logData[headerRowIdx].map((h: unknown) => String(h || "").trim())
        : []
    );

    const boundedData = getBoundedDataFn ? getBoundedDataFn(logData) : logData;
    const identityData: IdentityData = options.identityData || (strategy.getIdentityData ? strategy.getIdentityData(document) : {
      identityGroup: strategy.getGroupKey(document),
      identityRevisionGroup: strategy.getSortKey(document),
      identity: strategy.getTargetKey(document)
    });
    const targetKey = identityData.identity;

    const historyColIdx = headers.indexOf("Contact History");
    const calcChainColIdx = headers.indexOf("Calc Contact Chain");
    const dataStartIdx = headerRowSetting > 0 ? headerRowSetting : 3;

    const { rowIndex: previousRowSheetIndex, row: previousRow } = this.findMatchingRowIndex(boundedData, headers, identityData, strategy, dataStartIdx);

    let previousChain = "";
    if (previousRow !== null) {
      const histVal = (historyColIdx !== -1) ? String(previousRow[historyColIdx] || "").trim() : "";
      const calcVal = (calcChainColIdx !== -1) ? String(previousRow[calcChainColIdx] || "").trim() : "";
      previousChain = histVal ? histVal : calcVal;
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

    const plan = computeRowInsertionPlanFn(
      boundedData,
      headers,
      rowData,
      (r: unknown[], h: string[]) => strategy.getGroupKeyFromRow(r as any[], h),
      (r: unknown[], h: string[]) => strategy.getSortKeyFromRow(r as any[], h)
    );

    const writeResult = this.storageAdapter.insertLogRow(sheetName, headers, rowData, plan);

    try {
      this.logAuditEvent(spreadsheetId, {
        category: "SUBMITTAL_LOG",
        eventType: "SUBMITTAL_APPENDED",
        actor: options.actor || "GoogleAppsScript",
        status: "SUCCESS",
        details: {
          targetKey,
          newFileName,
          contactHistory: newChain,
          rowIndex: writeResult.rowIndex
        }
      });
    } catch (err) {
      if (typeof console !== "undefined" && console.warn) console.warn("Audit log write warning:", err);
    }

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

declare var module: Record<string, unknown>;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LogEngine,
    getBoundedData
  };
}

(globalThis as Record<string, unknown>).LogEngine = LogEngine;
