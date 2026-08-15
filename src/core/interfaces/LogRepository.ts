/**
 * @file LogRepository.ts
 * @description Tier 1 Pure Core abstract repository interface managing log persistence, settings, and tag lists.
 *
 * Refer to CODING_STANDARDS.md and docs/adr/0013-three-tier-gas-compatibility-architecture.md.
 * Strictly forbidden in Tier 1: GAS Globals (SpreadsheetApp, DriveApp) and Node built-in imports (fs, path).
 */

/// <reference path="../../types.ts" />

export interface LogRepository {
  /**
   * Retrieves consolidated log settings for a spreadsheet and discipline.
   */
  getLogSettings(spreadsheetId: string, discipline: string): LogSettings;

  /**
   * Verifies required log sheet structure and returns missing header list.
   */
  verifyAndFormatLogSheet(spreadsheetId: string): string[];

  /**
   * Appends a new tag entry to the Tag List configuration.
   */
  addNewTagToTagList(spreadsheetId: string, newTag: string, newTitle: string): void;

  /**
   * Appends a new vendor entry to the Tag List configuration.
   */
  addNewVendorToTagList(spreadsheetId: string, newVendor: string): void;

  /**
   * Inserts a formatted row payload into the target log sheet using a row insertion plan.
   */
  insertLogRow(
    spreadsheetId: string,
    headers: string[],
    rowData: unknown[],
    plan: RowInsertionPlan
  ): { rowIndex: number; failedColumns: string[] };

  /**
   * Appends a validated document to the log spreadsheet using a document log strategy.
   */
  appendDocument(
    spreadsheetId: string,
    document: ValidatedDocument,
    strategy: DocumentLogStrategy,
    options?: AppendDocumentOptions
  ): AppendDocumentResult;

  /**
   * Reads log entries matching IdentityData to extract contact history and previous row details.
   */
  readLog(
    spreadsheetId: string,
    identityData: IdentityData,
    strategy?: DocumentLogStrategy,
    options?: ReadLogOptions
  ): ReadLogResult;
}

declare const module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
