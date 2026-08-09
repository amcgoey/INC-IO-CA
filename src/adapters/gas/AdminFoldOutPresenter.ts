/**
 * @file AdminFoldOutPresenter.ts
 * @description Declarative presenter module for context-sensitive admin foldouts (`SheetAdminFoldOut` for `GoogleSheets`, `TriageAdminFoldOut` for `Gmail`/`GoogleDrive`).
 */

import { SpreadsheetBatchReadException } from "./SpreadsheetBatchReaderAdapter";

export interface AdminFoldOutContextData {
  spreadsheetId?: string;
  driveId?: string;
  documentType?: string;
  tabName?: string;
  auditReport?: any;
  error?: any;
}

export class AdminFoldOutPresenter {
  /**
   * Declaratively renders context-appropriate administrative foldout section.
   *
   * @param appContext - Target AppContext ("GoogleSheets", "Gmail", "GoogleDrive").
   * @param contextData - Context metadata and optional audit report/error state.
   * @returns CardService.CardSection instance.
   */
  public static renderAdminSection(appContext: string, contextData: AdminFoldOutContextData = {}): GoogleAppsScript.Card_Service.CardSection {
    if (
      contextData.error instanceof SpreadsheetBatchReadException ||
      (contextData.error && contextData.error.name === "SpreadsheetBatchReadException")
    ) {
      return AdminFoldOutPresenter.renderAdminErrorSection(contextData.spreadsheetId || "", contextData.error);
    }

    if (appContext === "GoogleSheets") {
      return AdminFoldOutPresenter.renderSheetAdminFoldOut(contextData);
    } else {
      return AdminFoldOutPresenter.renderTriageAdminFoldOut(contextData);
    }
  }

  /**
   * Renders `SheetAdminFoldOut` section for `GoogleSheets` AppContext.
   */
  public static renderSheetAdminFoldOut(contextData: AdminFoldOutContextData): GoogleAppsScript.Card_Service.CardSection {
    const section = CardService.newCardSection()
      .setHeader("⚙️ Sheet Administration (SheetAdminFoldOut)")
      .setCollapsible(true);

    const targetTab = contextData.tabName || "Submittal Arch";
    const manifestKey = contextData.documentType || "SUBMITTAL_ARCH";

    section.addWidget(CardService.newTextParagraph().setText(`📊 **Target Log Tab:** \`${targetTab}\``));
    section.addWidget(CardService.newTextParagraph().setText(`🗂️ **Config Tier:** \`Config_Manifest\` ➔ \`Config_${manifestKey}\``));
    section.addWidget(CardService.newTextParagraph().setText("📐 **Relative Offsets:** Header=Row 1 | Formula=Row 2 | Buffer=Row 3 | Data=Row 4"));

    if (contextData.auditReport) {
      const report = contextData.auditReport;
      const statusIcon = report.status === "MATCH" ? "✅" : report.status === "MINOR_DRIFT" ? "⚠️" : "❌";
      section.addWidget(
        CardService.newTextParagraph().setText(
          `**Schema Health Report:** ${statusIcon} \`${report.status}\` (Version: ${report.liveVersion || "N/A"} vs ${report.codeVersion || "1.2.0"})`
        )
      );

      if (report.issues && report.issues.length > 0) {
        const issueList = report.issues.map((i: string) => `• ${i}`).join("\n");
        section.addWidget(CardService.newTextParagraph().setText(`**Discrepancies:**\n${issueList}`));
      }

      if (report.canAutoPatch) {
        section.addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText("🛠️ Auto-Patch Workbook")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onAutoPatchWorkbook")
                  .setParameters({ spreadsheetId: contextData.spreadsheetId || "" })
              )
          )
        );
      }
    } else {
      section.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText("🔍 Run Schema Drift Audit")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("onRunSchemaDriftAudit")
                .setParameters({ spreadsheetId: contextData.spreadsheetId || "" })
            )
        )
      );
    }

    section.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("🔄 Refresh Workbook Config Cache")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("handleRefreshCache")
              .setParameters({ spreadsheetId: contextData.spreadsheetId || "" })
          )
      )
    );

    return section;
  }

  /**
   * Renders dedicated Error State Card when `SpreadsheetBatchReadException` occurs.
   */
  public static renderAdminErrorSection(spreadsheetId: string, error: any): GoogleAppsScript.Card_Service.CardSection {
    const section = CardService.newCardSection()
      .setHeader("⚠️ Advanced Sheets API Unavailable")
      .setCollapsible(false);

    const errorMessage = error && error.message ? error.message : "Advanced Sheets API batch read failed.";

    section.addWidget(
      CardService.newTextParagraph().setText(
        `⚠️ **Advanced Sheets API Unavailable**\n` +
        `The Advanced Sheets Service (v4) could not read workbook structure.\n\n` +
        `**Details:** ${errorMessage}\n\n` +
        `**Troubleshooting Instructions:**\n` +
        `1. Ensure \`Sheets\` (v4) is enabled under \`dependencies.enabledAdvancedServices\` in \`appsscript.json\` manifest.\n` +
        `2. Verify Google Workspace domain API permissions and quota settings.\n` +
        `3. Click **Retry Audit** below to attempt inspecting the spreadsheet again.`
      )
    );

    section.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("🔄 Retry Audit")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onRunSchemaDriftAudit")
              .setParameters({ spreadsheetId: spreadsheetId || "" })
          )
      )
    );

    return section;
  }

  /**
   * Renders `TriageAdminFoldOut` section for `Gmail` and `GoogleDrive` AppContext.
   */
  public static renderTriageAdminFoldOut(contextData: AdminFoldOutContextData): GoogleAppsScript.Card_Service.CardSection {
    const section = CardService.newCardSection()
      .setHeader("⚙️ Intake Administration (TriageAdminFoldOut)")
      .setCollapsible(true);

    section.addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("🔄 Reset Log Search Cache")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("handleResetLogSearchCache")
                .setParameters({ driveId: contextData.driveId || "" })
            )
        )
        .addButton(
          CardService.newTextButton()
            .setText("🧠 Clear AI Triage Cache")
            .setOnClickAction(CardService.newAction().setFunctionName("handleClearAiTriageCache"))
        )
        .addButton(
          CardService.newTextButton()
            .setText("👥 Flush Contacts & Actions Cache")
            .setOnClickAction(CardService.newAction().setFunctionName("handleFlushContactsCache"))
        )
    );

    return section;
  }
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).AdminFoldOutPresenter = (globalThis as any).AdminFoldOutPresenter || AdminFoldOutPresenter;
  module.exports = {
    AdminFoldOutPresenter
  };
}
