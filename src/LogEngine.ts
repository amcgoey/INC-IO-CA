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
 * Domain engine responsible for inserting validated submittals into tabular log sheets.
 * Calculates contact history chains, handles previous row status transitions (e.g. marking previous revisions Closed),
 * computes group/sort row insertion plans, and writes rows via the storage adapter.
 */
/**
 * Extracts the resolved contact abbreviation from a validated document's ListDocumentField metadata.
 *
 * @param document - Validated document domain model.
 * @returns Abbreviated contact string, or empty string if not resolved.
 */
function getContactAbbreviation(document: ValidatedDocument): string {
  return document.listFields?.contact?.abbreviation || "";
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
   * Appends or inserts a validated document into the specified spreadsheet log.
   *
   * 1. Reads current sheet values and extracts column headers.
   * 2. Searches bounded sheet data for previous submittal instances matching the target key to compute contact history chains.
   * 3. Optionally updates previous revision row statuses (e.g. setting status to "Closed").
   * 4. Formats row payload and destination file name via `DocumentLogStrategy`.
   * 5. Computes target row index and gap insertion rules via `computeRowInsertionPlan`.
   * 6. Executes physical row insertion via `storageAdapter`.
   *
   * @param spreadsheetId - Target spreadsheet ID string.
   * @param document - Validated submittal document.
   * @param strategy - Strategy instance defining grouping, sorting, and formatting rules.
   * @param options - Additional append parameters (headers, status, previous row update flags).
   * @returns `AppendDocumentResult` containing row index, contact history, filename, and validation details.
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
