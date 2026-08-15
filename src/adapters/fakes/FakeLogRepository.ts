/// <reference path="../../types.ts" />
/**
 * @file FakeLogRepository.ts
 * @description Pure in-memory fake implementation of `LogRepository` for fast offline testing without Google Sheets runtime dependencies.
 */

import { LogRepository } from "../../core/interfaces/LogRepository";

export class FakeLogRepository implements LogRepository {
  public calls: Array<{ method: string; args: unknown[] }> = [];
  public configuredSettings: Record<string, LogSettings> = {};
  public configuredMissingHeaders: string[] = [];
  public insertedRows: Array<{ spreadsheetId: string; headers: string[]; rowData: unknown[]; plan: RowInsertionPlan }> = [];
  public appendedDocuments: Array<{ spreadsheetId: string; document: ValidatedDocument; strategy: DocumentLogStrategy; options?: AppendDocumentOptions }> = [];
  public readLogEntries: Array<{ spreadsheetId: string; identityData: IdentityData; strategy?: DocumentLogStrategy; options?: ReadLogOptions }> = [];
  public customReadResult?: ReadLogResult;
  public customAppendResult?: AppendDocumentResult | ((ssId: string, doc: ValidatedDocument, strategy: DocumentLogStrategy, options?: AppendDocumentOptions) => AppendDocumentResult);

  constructor(initialSettings?: Record<string, LogSettings>) {
    if (initialSettings) {
      this.configuredSettings = { ...initialSettings };
    }
  }

  updateDocumentLink(
    spreadsheetId: string,
    options: { sheetName?: string; rowIndex: number; url: string }
  ): void {
    this.calls.push({ method: "updateDocumentLink", args: [spreadsheetId, options] });
  }

  reset(): void {
    this.calls = [];
    this.insertedRows = [];
    this.appendedDocuments = [];
    this.readLogEntries = [];
    this.customAppendResult = undefined;
    this.customReadResult = undefined;
  }

  getLogSettings(spreadsheetId: string, discipline: string): LogSettings {
    this.calls.push({ method: "getLogSettings", args: [spreadsheetId, discipline] });
    const key = `${spreadsheetId}:${discipline}`;
    if (this.configuredSettings[key]) {
      return this.configuredSettings[key];
    }
    if (this.configuredSettings[spreadsheetId]) {
      return this.configuredSettings[spreadsheetId];
    }
    return {
      contacts: [],
      actions: [],
      ffeTags: { tags: [], vendors: [], tagMap: {} },
      projectAbbr: "DEFAULT",
      logSheetId: 0,
      sheetGids: {
        "Submittal Arch": 0,
        "Submittal FFE": 101,
        "RFI Log": 202,
        "ASI Log": 303
      }
    };
  }

  verifyAndFormatLogSheet(spreadsheetId: string): string[] {
    this.calls.push({ method: "verifyAndFormatLogSheet", args: [spreadsheetId] });
    return [...this.configuredMissingHeaders];
  }

  addNewTagToTagList(spreadsheetId: string, newTag: string, newTitle: string): void {
    this.calls.push({ method: "addNewTagToTagList", args: [spreadsheetId, newTag, newTitle] });
  }

  addNewVendorToTagList(spreadsheetId: string, newVendor: string): void {
    this.calls.push({ method: "addNewVendorToTagList", args: [spreadsheetId, newVendor] });
  }

  insertLogRow(
    spreadsheetId: string,
    headers: string[],
    rowData: unknown[],
    plan: RowInsertionPlan
  ): { rowIndex: number; failedColumns: string[] } {
    this.calls.push({ method: "insertLogRow", args: [spreadsheetId, headers, rowData, plan] });
    this.insertedRows.push({ spreadsheetId, headers, rowData, plan });
    return { rowIndex: plan.finalRowIndex, failedColumns: [] };
  }

  readLog(
    spreadsheetId: string,
    identityData: IdentityData,
    strategy?: DocumentLogStrategy,
    options: ReadLogOptions = {}
  ): ReadLogResult {
    this.calls.push({ method: "readLog", args: [spreadsheetId, identityData, strategy, options] });
    this.readLogEntries.push({ spreadsheetId, identityData, strategy, options });
    if (this.customReadResult) {
      return this.customReadResult;
    }
    return {
      found: false,
      rowIndex: null,
      contactHistory: "",
      previousStatus: "",
      rowData: null,
      identityData,
      previousRowUpdated: false
    };
  }

  appendDocument(
    spreadsheetId: string,
    document: ValidatedDocument,
    strategy: DocumentLogStrategy,
    options: AppendDocumentOptions = {}
  ): AppendDocumentResult {
    this.calls.push({ method: "appendDocument", args: [spreadsheetId, document, strategy, options] });
    this.appendedDocuments.push({ spreadsheetId, document, strategy, options });
    if (this.customAppendResult) {
      if (typeof this.customAppendResult === "function") {
        return this.customAppendResult(spreadsheetId, document, strategy, options);
      }
      return this.customAppendResult;
    }
    const targetKey = strategy ? strategy.getTargetKey(document) : "KEY-001";
    const newFileName = strategy ? strategy.getFileName(document, document.contact, options?.actionAbbr || "") : "test.pdf";
    return {
      targetKey,
      newFileName,
      contactHistory: document.contact || "",
      rowIndex: 5,
      failedColumns: [],
      previousRowUpdated: !!options?.updatePreviousStatus
    };
  }
}

declare let module: { exports?: unknown };
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeLogRepository
  };
}
