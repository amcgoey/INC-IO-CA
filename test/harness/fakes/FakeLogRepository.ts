/**
 * @file FakeLogRepository.ts
 * @description Pure in-memory fake implementation of `LogRepository` for fast offline unit testing without Google Sheets runtime dependencies.
 */

export class FakeLogRepository implements LogRepository {
  public calls: Array<{ method: string; args: any[] }> = [];
  public configuredSettings: Record<string, LogSettings> = {};
  public configuredMissingHeaders: string[] = [];
  public insertedRows: Array<{ spreadsheetId: string; headers: string[]; rowData: any[]; plan: RowInsertionPlan }> = [];
  public appendedDocuments: Array<{ spreadsheetId: string; document: ValidatedDocument; strategy: DocumentLogStrategy; options?: AppendDocumentOptions }> = [];

  constructor(initialSettings?: Record<string, LogSettings>) {
    if (initialSettings) {
      this.configuredSettings = { ...initialSettings };
    }
  }

  reset(): void {
    this.calls = [];
    this.insertedRows = [];
    this.appendedDocuments = [];
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
      logSheetId: null
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
    rowData: any[],
    plan: RowInsertionPlan
  ): { rowIndex: number; failedColumns: string[] } {
    this.calls.push({ method: "insertLogRow", args: [spreadsheetId, headers, rowData, plan] });
    this.insertedRows.push({ spreadsheetId, headers, rowData, plan });
    return { rowIndex: plan.finalRowIndex, failedColumns: [] };
  }

  appendDocument(
    spreadsheetId: string,
    document: ValidatedDocument,
    strategy: DocumentLogStrategy,
    options: AppendDocumentOptions = {}
  ): AppendDocumentResult {
    this.calls.push({ method: "appendDocument", args: [spreadsheetId, document, strategy, options] });
    this.appendedDocuments.push({ spreadsheetId, document, strategy, options });
    return {
      targetKey: "KEY-001",
      newFileName: "test.pdf",
      contactHistory: "",
      rowIndex: 10,
      failedColumns: [],
      previousRowUpdated: false
    };
  }
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeLogRepository
  };
}
