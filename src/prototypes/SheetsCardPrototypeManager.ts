/**
 * @file SheetsCardPrototypeManager.ts
 * @description Pure portable logic module for Issue #150 prototype: Google Sheets Contextual Add-on UI Card & Active-Sheet State Binding.
 *
 * Models buildSheetsMainCard, tab role classification across 5 tiers, context refresh action responses,
 * and SheetAdminFoldOut dry-run audit / cache eviction state transitions.
 */

export type TabRole = "LOG_TAB" | "SYSTEM_CONFIG" | "AUDIT_LOG" | "DOCUMENTATION" | "USER_CREATED";

export interface SpreadsheetContext {
  spreadsheetId: string;
  spreadsheetTitle: string;
  activeSheetName: string;
  activeSheetId: number;
  isDocumentLogWorkbook: boolean;
  activeTabRole: TabRole;
  documentTypeKey: string; // e.g. "SUBMITTAL_ARCH" or "N/A"
  dataRowCount: number | string; // e.g. 142 or "N/A"
  schemaVersion: string; // e.g. "1.2.0"
}

export interface SchemaDriftReport {
  timestamp: string;
  status: "HEALTHY" | "DRIFT_DETECTED";
  totalNamedRanges: number;
  missingRanges: string[];
  versionMatch: boolean;
  summary: string;
}

export interface SheetsCardState {
  context: SpreadsheetContext;
  isAuditRunning: boolean;
  auditReport?: SchemaDriftReport;
  isCacheFlushing: boolean;
  notificationMessage?: string;
  activeVariant: "A" | "B" | "C";
}

export interface SheetsContextEvent {
  spreadsheetId?: string;
  sheetName?: string;
  sheetId?: number;
  parameters?: Record<string, string>;
}

const MOCK_SPREADSHEETS: Record<string, { title: string; isLogWorkbook: boolean; schemaVersion: string; sheets: Record<string, { role: TabRole; docTypeKey: string; rowCount: number | string }> }> = {
  "log-wb-001": {
    title: "PROJ-2026 Architectural Submittals Log",
    isLogWorkbook: true,
    schemaVersion: "1.2.0",
    sheets: {
      "Submittal Arch": { role: "LOG_TAB", docTypeKey: "SUBMITTAL_ARCH", rowCount: 142 },
      "Submittal FFE": { role: "LOG_TAB", docTypeKey: "SUBMITTAL_FFE", rowCount: 89 },
      "_Config": { role: "SYSTEM_CONFIG", docTypeKey: "N/A", rowCount: "N/A" },
      "_AuditLog": { role: "AUDIT_LOG", docTypeKey: "N/A", rowCount: 350 },
      "Documentation": { role: "DOCUMENTATION", docTypeKey: "N/A", rowCount: "N/A" },
      "ScratchPad": { role: "USER_CREATED", docTypeKey: "N/A", rowCount: "N/A" },
    },
  },
  "non-log-wb-999": {
    title: "Q3 Project Financial Estimation.xlsx",
    isLogWorkbook: false,
    schemaVersion: "N/A",
    sheets: {
      "Summary": { role: "USER_CREATED", docTypeKey: "N/A", rowCount: "N/A" },
      "Budget Breakdown": { role: "USER_CREATED", docTypeKey: "N/A", rowCount: "N/A" },
    },
  },
};

export class SheetsCardPrototypeManager {
  /**
   * Classify tab role based on sheet name and configuration context.
   */
  public static classifyTabRole(sheetName: string, isLogWorkbook: boolean): { role: TabRole; docTypeKey: string } {
    if (!isLogWorkbook) {
      return { role: "USER_CREATED", docTypeKey: "N/A" };
    }

    if (sheetName === "_Config") {
      return { role: "SYSTEM_CONFIG", docTypeKey: "N/A" };
    }

    if (sheetName === "_AuditLog") {
      return { role: "AUDIT_LOG", docTypeKey: "N/A" };
    }

    if (sheetName.toLowerCase().includes("doc") || sheetName.toLowerCase().includes("guide")) {
      return { role: "DOCUMENTATION", docTypeKey: "N/A" };
    }

    if (sheetName.startsWith("Submittal") || sheetName.startsWith("RFI") || sheetName.startsWith("Transmittal")) {
      const docType = sheetName.toUpperCase().replace(/\s+/g, "_");
      return { role: "LOG_TAB", docTypeKey: docType };
    }

    return { role: "USER_CREATED", docTypeKey: "N/A" };
  }

  /**
   * Build initial Google Sheets contextual main card state from event context.
   */
  public static buildSheetsMainCard(event: SheetsContextEvent = {}, variant: "A" | "B" | "C" = "A"): SheetsCardState {
    const spreadsheetId = event.spreadsheetId || "log-wb-001";
    const sheetName = event.sheetName || "Submittal Arch";

    const wb = MOCK_SPREADSHEETS[spreadsheetId] || MOCK_SPREADSHEETS["log-wb-001"];
    const sheetInfo = wb.sheets[sheetName] || { role: "USER_CREATED", docTypeKey: "N/A", rowCount: "N/A" };

    const context: SpreadsheetContext = {
      spreadsheetId,
      spreadsheetTitle: wb.title,
      activeSheetName: sheetName,
      activeSheetId: event.sheetId || 0,
      isDocumentLogWorkbook: wb.isLogWorkbook,
      activeTabRole: sheetInfo.role,
      documentTypeKey: sheetInfo.docTypeKey,
      dataRowCount: sheetInfo.rowCount,
      schemaVersion: wb.schemaVersion,
    };

    return {
      context,
      isAuditRunning: false,
      isCacheFlushing: false,
      activeVariant: variant,
    };
  }

  /**
   * Action handler: Refresh card context on demand (e.g. user clicked Refresh Card or switched sheets).
   */
  public static onSheetsContextRefresh(currentState: SheetsCardState, event: SheetsContextEvent): SheetsCardState {
    const newState = this.buildSheetsMainCard(event, currentState.activeVariant);
    newState.notificationMessage = `Card context refreshed for tab '${newState.context.activeSheetName}'.`;
    return newState;
  }

  /**
   * Action handler: Run dry-run schema drift audit via TemplateDriftAuditor.
   */
  public static onRunSchemaDriftAudit(currentState: SheetsCardState): SheetsCardState {
    if (!currentState.context.isDocumentLogWorkbook) {
      return {
        ...currentState,
        notificationMessage: "Cannot audit schema drift on non-DocumentLog spreadsheet.",
      };
    }

    const report: SchemaDriftReport = {
      timestamp: new Date().toISOString(),
      status: "HEALTHY",
      totalNamedRanges: 14,
      missingRanges: [],
      versionMatch: true,
      summary: "All 14 required sheet-scoped and workbook-scoped Named Ranges validated against Schema v1.2.0.",
    };

    return {
      ...currentState,
      isAuditRunning: false,
      auditReport: report,
      notificationMessage: "Schema drift audit completed: HEALTHY (14/14 ranges verified).",
    };
  }

  /**
   * Action handler: Flush ScriptCache for active workbook.
   */
  public static onFlushScriptCache(currentState: SheetsCardState): SheetsCardState {
    return {
      ...currentState,
      isCacheFlushing: false,
      notificationMessage: `ScriptCache purged for workbook '${currentState.context.spreadsheetTitle}'. Schema cache invalidated.`,
    };
  }

  /**
   * Formats the CardService ActionResponse into a human-readable, structured visual summary.
   */
  public static formatActionResponseVisual(state: SheetsCardState): { actionType: string; subtitle: string; sectionsSummary: Array<{ header: string; collapsible: boolean; widgetsCount: number; widgetTypes: string[] }>; toastNotification?: string } {
    const responseJson = this.serializeToCardServiceResponse(state);
    const card = responseJson.actionResponse.card;

    const sectionsSummary = (card.sections || []).map((sec: any) => ({
      header: sec.header || "Section",
      collapsible: !!sec.collapsible,
      widgetsCount: (sec.widgets || []).length,
      widgetTypes: (sec.widgets || []).map((w: any) => Object.keys(w)[0]),
    }));

    return {
      actionType: responseJson.actionResponse.type,
      subtitle: card.header?.subtitle || "Google Sheets Sidebar",
      sectionsSummary,
      toastNotification: responseJson.notification?.text,
    };
  }

  /**
   * Serialize prototype state to standard CardService ActionResponse JSON format.
   */
  public static serializeToCardServiceResponse(state: SheetsCardState): Record<string, any> {
    const { context, auditReport, notificationMessage, activeVariant } = state;

    if (!context.isDocumentLogWorkbook) {
      return {
        actionResponse: {
          type: "UPDATE_CARD",
          card: {
            header: {
              title: "INC Core Add-on",
              subtitle: "Google Sheets Context",
            },
            sections: [
              {
                header: "Unrecognized Document Log",
                widgets: [
                  {
                    textParagraph: {
                      text: "The active spreadsheet <b>" + context.spreadsheetTitle + "</b> is not a recognized Document Log (missing <code>_Config</code> manifest or schema version range).",
                    },
                  },
                  {
                    buttonSet: {
                      buttons: [
                        {
                          text: "Select Target Log Workbook",
                          onClick: { action: { functionName: "onSelectTargetWorkbook" } },
                        },
                        {
                          text: "Refresh Card",
                          onClick: { action: { functionName: "onSheetsContextRefresh" } },
                        },
                      ],
                    },
                  },
                ],
              },
              {
                header: "Sheet Administration (Disabled)",
                collapsible: true,
                uncollapsibleWidgetsCount: 1,
                widgets: [
                  {
                    textParagraph: {
                      text: "Admin actions are inactive for non-DocumentLog spreadsheets.",
                    },
                  },
                ],
              },
            ],
          },
        },
        notification: notificationMessage ? { text: notificationMessage } : undefined,
      };
    }

    // Role badge text
    const roleLabels: Record<TabRole, string> = {
      LOG_TAB: "Log Tab (Active DocumentType)",
      SYSTEM_CONFIG: "System Config Tab (_Config)",
      AUDIT_LOG: "System Audit Log (_AuditLog)",
      DOCUMENTATION: "Documentation Tab",
      USER_CREATED: "User Created Tab (Non-Log)",
    };

    const headerSectionWidgets: any[] = [
      {
        keyValue: {
          topLabel: "Active Spreadsheet",
          content: context.spreadsheetTitle,
          bottomLabel: "ID: " + context.spreadsheetId + " | Schema v" + context.schemaVersion,
        },
      },
      {
        keyValue: {
          topLabel: "Active Tab & Role",
          content: context.activeSheetName,
          bottomLabel: roleLabels[context.activeTabRole],
        },
      },
    ];

    if (context.activeTabRole === "LOG_TAB") {
      headerSectionWidgets.push({
        keyValue: {
          topLabel: "DocumentType & Active Data Rows",
          content: context.documentTypeKey,
          bottomLabel: "Data Rows: " + context.dataRowCount + " bounded by Sheet-Scoped 'Data' range",
        },
      });
    }

    headerSectionWidgets.push({
      buttonSet: {
        buttons: [
          {
            text: "Refresh Context",
            onClick: { action: { functionName: "onSheetsContextRefresh" } },
          },
        ],
      },
    });

    // Foldout section
    const foldoutWidgets: any[] = [
      {
        textParagraph: {
          text: "<b>Configuration & Administrative Health</b>",
        },
      },
      {
        buttonSet: {
          buttons: [
            {
              text: "Run Schema Drift Audit",
              onClick: { action: { functionName: "onRunSchemaDriftAudit" } },
            },
            {
              text: "Purge ScriptCache",
              onClick: { action: { functionName: "onFlushScriptCache" } },
            },
          ],
        },
      },
    ];

    if (auditReport) {
      foldoutWidgets.push({
        textParagraph: {
          text: "<b>Schema Audit Status:</b> <font color=\"#2e7d32\">" + auditReport.status + "</font><br/>" + auditReport.summary,
        },
      });
    }

    return {
      actionResponse: {
        type: "UPDATE_CARD",
        card: {
          header: {
            title: "INC Core Add-on",
            subtitle: "Google Sheets Sidebar [Variant " + activeVariant + "]",
          },
          sections: [
            {
              header: "Workbook Context",
              widgets: headerSectionWidgets,
            },
            {
              header: "Sheet Administration (SheetAdminFoldOut)",
              collapsible: true,
              uncollapsibleWidgetsCount: 1,
              widgets: foldoutWidgets,
            },
          ],
        },
      },
      notification: notificationMessage ? { text: notificationMessage } : undefined,
    };
  }
}

export { MOCK_SPREADSHEETS };

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MOCK_SPREADSHEETS,
    SheetsCardPrototypeManager
  };
}

(globalThis as any).MOCK_SPREADSHEETS = MOCK_SPREADSHEETS;
(globalThis as any).SheetsCardPrototypeManager = SheetsCardPrototypeManager;
