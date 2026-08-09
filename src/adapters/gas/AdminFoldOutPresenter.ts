/**
 * @file AdminFoldOutPresenter.ts
 * @description Declarative presenter module constructing AppContext-scoped admin foldouts
 * (SheetAdminFoldOut for GoogleSheets, TriageAdminFoldOut for Gmail/GoogleDrive) and managing
 * targeted cache eviction and audit telemetry (Issue #220, ADR 0035).
 *
 * Tier 2 GAS Infrastructure Adapter.
 */

declare var PrefixCacheManager: any;
declare var GoogleScriptCacheAdapter: any;
declare var GoogleSheetsStorageAdapter: any;
declare var LogEngine: any;

export interface AdminFoldOutContextData {
  spreadsheetId?: string;
  driveId?: string;
  disabled?: boolean;
  [key: string]: any;
}

export class AdminFoldOutPresenter {
  /**
   * Dispatches and renders the context-appropriate admin foldout section.
   *
   * @param appContext - Target execution environment ("GoogleSheets" | "Gmail" | "GoogleDrive")
   * @param contextData - Contextual data (spreadsheetId, driveId, disabled flag)
   * @returns CardService.CardSection instance
   */
  public static renderAdminSection(
    appContext: AppContext,
    contextData?: AdminFoldOutContextData
  ): GoogleAppsScript.Card_Service.CardSection {
    if (appContext === "GoogleSheets") {
      return AdminFoldOutPresenter.renderSheetAdminFoldOut(contextData);
    } else {
      return AdminFoldOutPresenter.renderTriageAdminFoldOut(contextData);
    }
  }

  /**
   * Renders SheetAdminFoldOut collapsible card section for GoogleSheets context.
   */
  public static renderSheetAdminFoldOut(
    contextData?: AdminFoldOutContextData
  ): GoogleAppsScript.Card_Service.CardSection {
    if (contextData?.disabled) {
      return CardService.newCardSection()
        .setHeader("Sheet Administration (Disabled)")
        .setCollapsible(true)
        .addWidget(
          CardService.newTextParagraph().setText(
            "Admin actions are inactive for non-DocumentLog spreadsheets."
          )
        );
    }

    const spreadsheetId = contextData?.spreadsheetId || "";

    const section = CardService.newCardSection()
      .setHeader("Sheet Administration (SheetAdminFoldOut)")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(1)
      .addWidget(
        CardService.newTextParagraph().setText("<b>Configuration & Administrative Health</b>")
      )
      .addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText("Run Schema Drift Audit")
              .setOnClickAction(CardService.newAction().setFunctionName("onRunSchemaDriftAudit"))
          )
          .addButton(
            CardService.newTextButton()
              .setText("🔄 Refresh Config Cache")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onFlushScriptCache")
                  .setParameters({ spreadsheetId })
              )
          )
      );

    return section;
  }

  /**
   * Renders TriageAdminFoldOut collapsible card section for Gmail and GoogleDrive contexts.
   */
  public static renderTriageAdminFoldOut(
    _contextData?: AdminFoldOutContextData
  ): GoogleAppsScript.Card_Service.CardSection {
    const section = CardService.newCardSection()
      .setHeader("Triage Administration (TriageAdminFoldOut)")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(1)
      .addWidget(
        CardService.newTextParagraph().setText("<b>Triage & Intake Cache Controls</b>")
      )
      .addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText("🔄 Reset Log Search Cache")
              .setOnClickAction(CardService.newAction().setFunctionName("onResetLogSearchCache"))
          )
          .addButton(
            CardService.newTextButton()
              .setText("🧠 Clear AI Triage Cache")
              .setOnClickAction(CardService.newAction().setFunctionName("onClearAiTriageCache"))
          )
          .addButton(
            CardService.newTextButton()
              .setText("👥 Flush Contacts & Actions Cache")
              .setOnClickAction(CardService.newAction().setFunctionName("onFlushContactsActionsCache"))
          )
      );

    return section;
  }
}

/**
 * Action Handler: Flushes strictly target workbook DOC_CONFIG_<SpreadsheetId>_* ScriptCache entries
 * and logs telemetry event to _AuditLog tab under Category: CACHE_PURGE.
 */
export function onFlushScriptCache(e?: any): GoogleAppsScript.Card_Service.ActionResponse {
  let spreadsheetId = "";
  if (e && e.sheetsContext && e.sheetsContext.spreadsheetId) {
    spreadsheetId = e.sheetsContext.spreadsheetId;
  } else if (e && e.parameters && e.parameters.spreadsheetId) {
    spreadsheetId = e.parameters.spreadsheetId;
  } else if (e && e.parameter && e.parameter.spreadsheetId) {
    spreadsheetId = e.parameter.spreadsheetId;
  } else if (typeof SpreadsheetApp !== "undefined" && (SpreadsheetApp as any).getActiveSpreadsheet) {
    try {
      const activeSs = (SpreadsheetApp as any).getActiveSpreadsheet();
      if (activeSs) spreadsheetId = activeSs.getId();
    } catch (err) {}
  }

  if (spreadsheetId) {
    const CacheAdapterClass = (globalThis as any).GoogleScriptCacheAdapter ||
      (typeof GoogleScriptCacheAdapter !== "undefined" ? GoogleScriptCacheAdapter : require("./GoogleScriptCacheAdapter").GoogleScriptCacheAdapter);
    const PrefixManagerClass = (globalThis as any).PrefixCacheManager ||
      (typeof PrefixCacheManager !== "undefined" ? PrefixCacheManager : require("../../core/admin/PrefixCacheManager").PrefixCacheManager);

    const cacheAdapter = (globalThis as any).defaultCacheAdapter || new CacheAdapterClass();
    const prefixManager = new PrefixManagerClass(cacheAdapter);
    prefixManager.invalidatePrefix("DOC_CONFIG_" + spreadsheetId);

    try {
      const StorageAdapterClass = (globalThis as any).GoogleSheetsStorageAdapter ||
        (typeof GoogleSheetsStorageAdapter !== "undefined" ? GoogleSheetsStorageAdapter : require("../../SheetStorageAdapter").GoogleSheetsStorageAdapter);
      const LogEngineClass = (globalThis as any).LogEngine ||
        (typeof LogEngine !== "undefined" ? LogEngine : require("../../core/log/LogEngine").LogEngine);

      const storageAdapter = new StorageAdapterClass(spreadsheetId);
      const engine = new LogEngineClass(storageAdapter);

      let actor = "GoogleAppsScript";
      if (typeof Session !== "undefined" && (Session as any).getActiveUser) {
        try {
          const email = (Session as any).getActiveUser().getEmail();
          if (email) actor = email;
        } catch (e) {}
      }

      engine.logAuditEvent(spreadsheetId, {
        category: "CACHE_PURGE",
        eventType: "CONFIG_CACHE_PURGED",
        actor: actor,
        status: "SUCCESS",
        details: {
          spreadsheetId,
          scope: "DOC_CONFIG_" + spreadsheetId
        }
      });
    } catch (err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("Audit log write warning during cache flush:", err);
      }
    }
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Workbook config cache purged."))
    .build();
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).AdminFoldOutPresenter = AdminFoldOutPresenter;
  (globalThis as any).onFlushScriptCache = onFlushScriptCache;
  module.exports = {
    AdminFoldOutPresenter,
    onFlushScriptCache
  };
}
