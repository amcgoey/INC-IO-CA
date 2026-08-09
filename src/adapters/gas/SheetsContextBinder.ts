/**
 * @file SheetsContextBinder.ts
 * @description GAS Infrastructure Adapter for auto-binding active spreadsheet ID and sheet tab context in AppContext.GoogleSheets.
 */

import { SheetsTabRoleClassifier, TabRole } from "../../core/log/SheetsTabRoleClassifier";
import { TemplateDriftReport } from "../../core/admin/TemplateDriftAuditor";

export interface SpreadsheetContext {
  spreadsheetId: string;
  spreadsheetTitle: string;
  activeSheetName: string;
  activeSheetId: number;
  isDocumentLogWorkbook: boolean;
  activeTabRole: TabRole;
  documentTypeKey: string;
  dataRowCount: number | string;
  schemaVersion: string;
}

export interface SheetsContextParams {
  spreadsheetId?: string;
  sheetName?: string;
  sheetId?: number;
  auditReport?: TemplateDriftReport;
  lockContention?: boolean;
}

export class SheetsContextBinder {
  /**
   * Helper method to extract target spreadsheetId from action event parameters or active spreadsheet context.
   */
  public static extractSpreadsheetId(e?: any): string {
    if (e && e.sheetsContext && e.sheetsContext.spreadsheetId) {
      return e.sheetsContext.spreadsheetId;
    }
    if (e && e.parameters && e.parameters.spreadsheetId) {
      return e.parameters.spreadsheetId;
    }
    if (e && e.parameter && e.parameter.spreadsheetId) {
      return e.parameter.spreadsheetId;
    }
    if (typeof SpreadsheetApp !== "undefined" && (SpreadsheetApp as any).getActiveSpreadsheet) {
      try {
        const activeSs = (SpreadsheetApp as any).getActiveSpreadsheet();
        if (activeSs) return activeSs.getId();
      } catch (err) {}
    }
    return "";
  }

  /**
   * Binds active spreadsheet and sheet tab context automatically from SpreadsheetApp or given event parameters.
   */
  public static bindActiveSheetsContext(params: SheetsContextParams = {}): SpreadsheetContext {
    let ss: any = null;

    if (params.spreadsheetId && typeof SpreadsheetApp !== "undefined") {
      try {
        ss = SpreadsheetApp.openById(params.spreadsheetId);
      } catch (e) {
        ss = null;
      }
    }

    if (!ss && typeof SpreadsheetApp !== "undefined") {
      try {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      } catch (e) {
        ss = null;
      }
    }

    const spreadsheetId = params.spreadsheetId || (ss ? ss.getId() : "default-ss");
    const spreadsheetTitle = ss ? ss.getName() : "Google Sheets Workbook";

    let sheet: any = null;
    if (ss && params.sheetName) {
      sheet = ss.getSheetByName(params.sheetName);
    }
    if (!sheet && ss) {
      sheet = ss.getSheets()[0] || null;
    }

    const activeSheetName = params.sheetName || (sheet ? sheet.getName() : "Sheet1");
    const activeSheetId = params.sheetId !== undefined ? params.sheetId : (sheet ? (sheet.getSheetId ? sheet.getSheetId() : 0) : 0);

    let isDocumentLogWorkbook = false;
    let schemaVersion = "N/A";

    if (ss) {
      const configSheet = ss.getSheetByName("_Config");
      const schemaRange = ss.getRangeByName ? ss.getRangeByName("MANIFEST_SCHEMA_VERSION") : null;
      if (configSheet || schemaRange) {
        isDocumentLogWorkbook = true;
        if (schemaRange) {
          try {
            const val = schemaRange.getValue();
            if (val) schemaVersion = String(val);
          } catch (e) {}
        }
        if (schemaVersion === "N/A") {
          schemaVersion = "1.2.0";
        }
      }
    }

    const classification = SheetsTabRoleClassifier.classifyTabRole(activeSheetName, isDocumentLogWorkbook);

    let dataRowCount: number | string = classification.dataRowCount;

    if (classification.role === "LOG_TAB" && sheet) {
      try {
        const gridData = sheet.getDataRange().getValues();
        dataRowCount = SheetsTabRoleClassifier.calculateBoundedDataRowCount(gridData);
      } catch (e) {
        dataRowCount = "N/A";
      }
    }

    return {
      spreadsheetId,
      spreadsheetTitle,
      activeSheetName,
      activeSheetId,
      isDocumentLogWorkbook,
      activeTabRole: classification.role,
      documentTypeKey: classification.docTypeKey,
      dataRowCount,
      schemaVersion,
    };
  }
}
