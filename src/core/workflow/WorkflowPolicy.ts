/// <reference path="../../types.ts" />
/**
 * @file WorkflowPolicy.ts
 * @description Helper functions for workflow action policy, strategy resolution, title extraction, and sheet URL generation.
 */

import { DeclarativeDocumentLogStrategy } from '../logging/DeclarativeDocumentLogStrategy';
import { defaultDocumentTypeSpecRegistry } from '../specs/DocumentTypeSpecRegistry';

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
 * @returns DeclarativeDocumentLogStrategy for the document type spec.
 */
export function getDocumentLogStrategy(doc: ValidatedDocument): DocumentLogStrategy {
  const details = doc ? doc.disciplineDetails : null;
  const docTypeKey = (details && (details as any).discipline === "FF&E")
    ? "SUBMITTAL_FFE"
    : (doc?.docTypeKey || "SUBMITTAL_ARCH");
  const spec = defaultDocumentTypeSpecRegistry.getSpec(docTypeKey);
  return new DeclarativeDocumentLogStrategy(spec);
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
  return (details as any).discipline === "Architecture" ? (details as any).title : (details as any).specTitle;
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
    } catch (_e) {
      resolvedSheetId = 0;
    }
  } else if (resolvedSheetId === undefined || resolvedSheetId === null) {
    resolvedSheetId = 0;
  }

  return `https://docs.google.com/spreadsheets/d/${logFileId}/edit#gid=${resolvedSheetId}&range=A${rowIndex}`;
}
