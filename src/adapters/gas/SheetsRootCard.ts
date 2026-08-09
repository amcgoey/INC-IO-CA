/**
 * @file SheetsRootCard.ts
 * @description GAS Infrastructure Adapter for rendering the SheetsRootCard sidebar root card in AppContext.GoogleSheets.
 *
 * Implements minimal layout hierarchy:
 * 1. Workbook Context Header with Spreadsheet Title, Tab Name, 5-Tier Tab Role Badge, DocType Key, Data Row Count, and "Refresh Context" action button.
 * 2. SheetAdminFoldOut for dry-run schema drift auditing and ScriptCache clearing.
 * 3. Friendly "Unrecognized Document Log" fallback banner for non-log spreadsheets.
 */

import { SheetsContextBinder, SpreadsheetContext, SheetsContextParams } from "./SheetsContextBinder";
import { TabRole } from "../../core/log/SheetsTabRoleClassifier";
import { AdminFoldOutPresenter } from "./AdminFoldOutPresenter";

export class SheetsRootCard {
  /**
   * Builds the root CardService.Card instance for AppContext.GoogleSheets.
   */
  public static buildSheetsRootCard(params?: SheetsContextParams): GoogleAppsScript.Card_Service.Card {
    const context: SpreadsheetContext = SheetsContextBinder.bindActiveSheetsContext(params || {});
    const cardBuilder = CardService.newCardBuilder();

    cardBuilder.setHeader(
      CardService.newCardHeader()
        .setTitle("INC Core Add-on")
        .setSubtitle("Google Sheets Context")
    );

    if (!context.isDocumentLogWorkbook) {
      // Unrecognized non-log spreadsheet fallback state
      const fallbackSection = CardService.newCardSection()
        .setHeader("Unrecognized Document Log")
        .addWidget(
          CardService.newTextParagraph().setText(
            "The active spreadsheet <b>" + context.spreadsheetTitle + "</b> is not a recognized Document Log (missing configuration information)."
          )
        )
        .addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText("Refresh Context")
              .setOnClickAction(CardService.newAction().setFunctionName("onSheetsContextRefresh"))
          )
        );

      const disabledAdminSection = AdminFoldOutPresenter.renderAdminSection("GoogleSheets", { disabled: true });

      cardBuilder.addSection(fallbackSection);
      cardBuilder.addSection(disabledAdminSection);
      return cardBuilder.build();
    }

    // Role badge descriptions
    const roleLabels: Record<TabRole, string> = {
      LOG_TAB: "Log Tab (Active DocumentType)",
      SYSTEM_CONFIG: "System Config Tab (_Config)",
      AUDIT_LOG: "System Audit Log Tab (_AuditLog)",
      DOCUMENTATION: "Documentation Tab",
      USER_CREATED: "User Created Tab (Non-Log)"
    };

    // 1. Workbook Context Header Section
    const headerSection = CardService.newCardSection()
      .setHeader("Workbook Context")
      .addWidget(
        CardService.newKeyValue()
          .setTopLabel("Active Spreadsheet")
          .setContent(context.spreadsheetTitle)
          .setBottomLabel("ID: " + context.spreadsheetId + " | Schema v" + context.schemaVersion)
      )
      .addWidget(
        CardService.newKeyValue()
          .setTopLabel("Active Tab & Role")
          .setContent(context.activeSheetName)
          .setBottomLabel(roleLabels[context.activeTabRole])
      );

    if (context.activeTabRole === "LOG_TAB") {
      headerSection.addWidget(
        CardService.newKeyValue()
          .setTopLabel("DocumentType & Active Data Rows")
          .setContent(context.documentTypeKey)
          .setBottomLabel("Data Rows: " + context.dataRowCount + " bounded by Sheet-Scoped 'Data' range")
      );
    }

    headerSection.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("Refresh Context")
          .setOnClickAction(CardService.newAction().setFunctionName("onSheetsContextRefresh"))
      )
    );

    // 2. SheetAdminFoldOut Section dispatched via AdminFoldOutPresenter
    const foldOutSection = AdminFoldOutPresenter.renderAdminSection("GoogleSheets", {
      spreadsheetId: context.spreadsheetId,
      auditReport: params?.auditReport,
      lockContention: params?.lockContention
    });

    cardBuilder.addSection(headerSection);
    cardBuilder.addSection(foldOutSection);

    return cardBuilder.build();
  }
}

/**
 * Top-level builder function for GAS framework invocation.
 */
export function buildSheetsRootCard(params?: SheetsContextParams): GoogleAppsScript.Card_Service.Card {
  return SheetsRootCard.buildSheetsRootCard(params);
}

/**
 * Action handler: Re-inspects active spreadsheet context and updates the card.
 */
export function onSheetsContextRefresh(e?: any): GoogleAppsScript.Card_Service.ActionResponse {
  const BinderClass = (globalThis as any).SheetsContextBinder ||
    (typeof SheetsContextBinder !== "undefined" ? SheetsContextBinder : require("./SheetsContextBinder").SheetsContextBinder);
  const spreadsheetId = BinderClass.extractSpreadsheetId(e);

  const params: SheetsContextParams = {
    spreadsheetId,
    sheetName: e?.sheetsContext?.sheetName || e?.parameters?.sheetName || undefined
  };

  const updatedCard = buildSheetsRootCard(params);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(updatedCard))
    .setNotification(CardService.newNotification().setText("Card context refreshed."))
    .build();
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).SheetsRootCard = SheetsRootCard;
  (globalThis as any).buildSheetsRootCard = buildSheetsRootCard;
  (globalThis as any).onSheetsContextRefresh = onSheetsContextRefresh;
  module.exports = {
    SheetsRootCard,
    buildSheetsRootCard,
    onSheetsContextRefresh
  };
}
