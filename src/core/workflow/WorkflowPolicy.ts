/// <reference path="../../types.ts" />
/**
 * @file WorkflowPolicy.ts
 * @description Helper functions for workflow action policy, strategy resolution, title extraction, and sheet URL generation.
 */

declare var ArchitectureSubmittalStrategy: any;
declare var FFESubmittalStrategy: any;

/**
 * Resolves execution policy settings based on the specified workflow action string.
 *
 * @param action - The workflow action string (e.g., "Received", "Reviewed", "Referred").
 * @returns WorkflowActionPolicy containing execution instructions.
 */
export function getActionPolicy(action: string): WorkflowActionPolicy {
  if (action === "Received") {
    return {
      direction: "incoming",
      stampPdf: true,
      updatePreviousStatus: false
    };
  }
  return {
    direction: "outgoing",
    stampPdf: false,
    updatePreviousStatus: true,
    previousRowStatus: "Closed"
  };
}

/**
 * Factory function returning the appropriate DocumentLogStrategy implementation for a given document.
 *
 * @param doc - The ValidatedDocument instance.
 * @returns FFESubmittalStrategy for FF&E discipline or ArchitectureSubmittalStrategy for Architecture.
 */
export function getDocumentLogStrategy(doc: ValidatedDocument): DocumentLogStrategy {
  const details = doc ? doc.disciplineDetails : null;
  const FfeCtor = (globalThis as any).FFESubmittalStrategy || (typeof FFESubmittalStrategy !== "undefined" ? FFESubmittalStrategy : null);
  const ArchCtor = (globalThis as any).ArchitectureSubmittalStrategy || (typeof ArchitectureSubmittalStrategy !== "undefined" ? ArchitectureSubmittalStrategy : null);

  if (details && details.discipline === "FF&E" && FfeCtor) {
    return new FfeCtor();
  }
  if (ArchCtor) {
    return new ArchCtor();
  }
  throw new Error("Unable to resolve DocumentLogStrategy: strategy constructors unavailable");
}

/**
 * Extracts the primary document title from a validated document based on discipline details.
 *
 * @param doc - The ValidatedDocument instance.
 * @returns Document title string or empty string.
 */
export function getDocumentTitle(doc: ValidatedDocument): string {
  const details = doc ? doc.disciplineDetails : null;
  if (!details) return "";
  return details.discipline === "Architecture" ? details.title : details.specTitle;
}

/**
 * Constructs direct Google Sheets row edit URL using CONFIG.LOG_SHEET_NAME.
 */
export function buildDirectRowUrl(logFileId: string, rowIndex: number, sheetId?: number | null, spreadsheetApp?: any): string {
  let resolvedSheetId = sheetId;
  if ((resolvedSheetId === undefined || resolvedSheetId === null) && spreadsheetApp) {
    try {
      const openSs = spreadsheetApp.openById(logFileId);
      const sheetName = typeof CONFIG !== "undefined" && CONFIG.LOG_SHEET_NAME ? CONFIG.LOG_SHEET_NAME : "Submittals Log";
      const logSheet = sheetName ? openSs.getSheetByName(sheetName) : (openSs ? openSs.getSheets()[0] : null);
      resolvedSheetId = logSheet ? logSheet.getSheetId() : 0;
    } catch (e) {
      resolvedSheetId = 0;
    }
  } else if (resolvedSheetId === undefined || resolvedSheetId === null) {
    resolvedSheetId = 0;
  }

  return `https://docs.google.com/spreadsheets/d/${logFileId}/edit#gid=${resolvedSheetId}&range=A${rowIndex}`;
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getActionPolicy,
    getDocumentLogStrategy,
    getDocumentTitle,
    buildDirectRowUrl
  };
}

(globalThis as any).getActionPolicy = getActionPolicy;
(globalThis as any).getDocumentLogStrategy = getDocumentLogStrategy;
(globalThis as any).getDocumentTitle = getDocumentTitle;
(globalThis as any).buildDirectRowUrl = buildDirectRowUrl;
