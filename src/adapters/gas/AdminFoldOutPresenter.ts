/**
 * @file AdminFoldOutPresenter.ts
 * @description Declarative presenter module constructing AppContext-scoped admin foldouts
 * (SheetAdminFoldOut for GoogleSheets, TriageAdminFoldOut for Gmail/GoogleDrive) and managing
 * targeted cache eviction, dry-run schema drift audits, audit telemetry, and exception guards (Issue #220, Issue #221, Issue #224, ADR 0029, ADR 0035).
 *
 * Tier 2 GAS Infrastructure Adapter.
 */

import { TemplateDriftReport, TemplateDriftIssue, AutoPatchResult } from "../../core/admin/TemplateDriftAuditor";
import { SpreadsheetBatchReadException, SpreadsheetBatchReaderAdapter } from "./SpreadsheetBatchReaderAdapter";
import { GoogleSheetsDocumentTypeSpecAdapter } from "./GoogleSheetsDocumentTypeSpecAdapter";
import { JsonDocumentTypeSpecAdapter } from "../../core/specs/JsonDocumentTypeSpecAdapter";
import type { SpecValidationResult } from "../../core/specs/ValidationEngine";
import type { DocumentTypeSpec } from "../../core/specs/DocumentTypeSpec";

import { SheetsContextBinder } from "./SheetsContextBinder";
import { GoogleSheetsStorageAdapter } from "../../SheetStorageAdapter";
import { TemplateDriftAuditor } from "../../core/admin/TemplateDriftAuditor";
import { LogEngine } from "../../core/log/LogEngine";
import { SheetsRootCard } from "./SheetsRootCard";
import { GoogleScriptCacheAdapter } from "./GoogleScriptCacheAdapter";
import { PrefixCacheManager } from "../../core/admin/PrefixCacheManager";

function getSheetsContextBinderClass(): any {
  return SheetsContextBinder;
}

function getGoogleSheetsStorageAdapterClass(): any {
  return GoogleSheetsStorageAdapter;
}

function getTemplateDriftAuditorClass(): any {
  return TemplateDriftAuditor;
}

function getLogEngineClass(): any {
  return LogEngine;
}

function getSheetsRootCardClass(): any {
  return SheetsRootCard;
}

function getGoogleScriptCacheAdapterClass(): any {
  return GoogleScriptCacheAdapter;
}

function getPrefixCacheManagerClass(): any {
  return PrefixCacheManager;
}

function getGoogleSheetsDocumentTypeSpecAdapterClass(): any {
  return GoogleSheetsDocumentTypeSpecAdapter;
}

function getJsonDocumentTypeSpecAdapterClass(): any {
  return JsonDocumentTypeSpecAdapter;
}

function getSpreadsheetBatchReaderAdapterClass(): any {
  return SpreadsheetBatchReaderAdapter;
}

export type AppContextType = "GoogleSheets" | "Gmail" | "GoogleDrive";

export interface AdminFoldOutContextData {
  spreadsheetId?: string;
  driveId?: string;
  disabled?: boolean;
  documentType?: string;
  tabName?: string;
  auditReport?: TemplateDriftReport;
  lockContention?: boolean;
  error?: Error | SpreadsheetBatchReadException | unknown;
  [key: string]: any;
}

export class AdminFoldOutPresenter {
  /**
   * Dispatches and renders the context-appropriate admin foldout section.
   *
   * @param appContext - Target execution environment ("GoogleSheets" | "Gmail" | "GoogleDrive")
   * @param contextData - Contextual data (spreadsheetId, driveId, disabled flag, auditReport, error)
   * @returns CardService.CardSection instance
   */
  public static renderAdminSection(
    appContext: AppContextType | AppContext,
    contextData: AdminFoldOutContextData = {}
  ): GoogleAppsScript.Card_Service.CardSection {
    try {
      if (
        contextData.error instanceof SpreadsheetBatchReadException ||
        (contextData.error && typeof contextData.error === "object" && (contextData.error as any).name === "SpreadsheetBatchReadException")
      ) {
        return AdminFoldOutPresenter.renderAdminErrorSection(contextData.spreadsheetId || "", contextData.error);
      }

      if (appContext === "GoogleSheets") {
        return AdminFoldOutPresenter.renderSheetAdminFoldOut(contextData);
      } else {
        return AdminFoldOutPresenter.renderTriageAdminFoldOut(contextData);
      }
    } catch (err: unknown) {
      if (
        err instanceof SpreadsheetBatchReadException ||
        (err && typeof err === "object" && (err as any).name === "SpreadsheetBatchReadException")
      ) {
        return AdminFoldOutPresenter.renderAdminErrorSection(contextData.spreadsheetId || "", err);
      }
      throw err;
    }
  }

  /**
   * Renders dedicated Error State Card when SpreadsheetBatchReadException occurs.
   */
  public static renderAdminErrorSection(
    spreadsheetId: string,
    error: Error | SpreadsheetBatchReadException | unknown
  ): GoogleAppsScript.Card_Service.CardSection {
    const section = CardService.newCardSection()
      .setHeader("⚠️ Advanced Sheets API Unavailable")
      .setCollapsible(false);

    const errorMessage = error && typeof error === "object" && "message" in error
      ? String((error as any).message)
      : "Advanced Sheets API batch read failed.";

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
    const report: TemplateDriftReport | undefined = contextData?.auditReport;

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
              .setText("🔍 Run Schema Drift Audit")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onRunSchemaDriftAudit")
                  .setParameters({ spreadsheetId })
              )
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
          .addButton(
            CardService.newTextButton()
              .setText("💾 Save to JSON Configuration")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onSaveToJsonConfiguration")
                  .setParameters({ spreadsheetId })
              )
          )
      );


    if (contextData?.lockContention) {
      section.addWidget(
        CardService.newTextParagraph().setText(
          "🔒 <b>Workbook Lock Contention Detected</b><br/>" +
          "Another administrative process or migration is currently modifying this spreadsheet. " +
          "The spreadsheet lock could not be acquired within the 5-second timeout.<br/><br/>" +
          "Please wait a moment and click below to retry auto-patching."
        )
      );
      section.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText("🔄 Retry Auto-Patch")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("onAutoPatchWorkbook")
                .setParameters({ spreadsheetId })
            )
        )
      );
    }
    // If an inline Schema Health Report is present, render it
    if (report) {
      const statusPillMap: Record<string, string> = {
        MATCH: "🟢 Status: MATCH",
        MINOR_DRIFT: "🟡 Status: MINOR_DRIFT",
        MAJOR_DRIFT: "🔴 Status: MAJOR_DRIFT",
        INCOMPATIBLE: "❌ Status: INCOMPATIBLE"
      };
      const statusPill = statusPillMap[report.status] || ("Status: " + report.status);
      const patchReadiness = report.canAutoPatch
        ? "🛠️ Auto-Patch Readiness: Ready (true)"
        : "⚠️ Auto-Patch Readiness: Requires Manual Migration (false)";

      let issueBulletsText = "";
      if (Array.isArray(report.issues) && report.issues.length > 0) {
        issueBulletsText = report.issues
          .map((i: TemplateDriftIssue) => "• [" + i.severity + "] " + i.category + ": " + i.description)
          .join("<br/>");
      } else {
        issueBulletsText = "• No structural drift detected. Workbook matches Schema contract.";
      }

      section.addWidget(
        CardService.newTextParagraph().setText(
          "<b>Schema Health Report</b><br/>" + statusPill + "<br/>" +
          "<b>Code Schema:</b> v" + (report.codeSchemaVersion || "1.2.0") + " | <b>Live Schema:</b> v" + (report.liveSchemaVersion || "1.2.0") + "<br/>" +
          patchReadiness + "<br/><br/>" +
          "<b>Discrepancy Breakdown:</b><br/>" + issueBulletsText
        )
      );

      if (report.canAutoPatch && !contextData?.lockContention) {
        section.addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText("🛠️ Auto-Patch Workbook")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onAutoPatchWorkbook")
                  .setParameters({ spreadsheetId })
              )
          )
        );
      }
    }

    return section;
  }

  /**
   * Renders TriageAdminFoldOut collapsible card section for Gmail and GoogleDrive contexts.
   */
  public static renderTriageAdminFoldOut(
    contextData?: AdminFoldOutContextData
  ): GoogleAppsScript.Card_Service.CardSection {
    const driveId = contextData?.driveId || "";
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
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onResetLogSearchCache")
                  .setParameters({ driveId })
              )
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
 * Action Handler: Executes TemplateDriftAuditor.auditWorkbook in read-only dry-run mode (bypassCache: true),
 * re-renders SheetAdminFoldOut with inline Schema Health Report card, emits notification toast,
 * and logs telemetry event to _AuditLog tab under Category: SCHEMA_DRIFT (Issue #221, Issue #224).
 */
export function onRunSchemaDriftAudit(e?: any): GoogleAppsScript.Card_Service.ActionResponse {
  const BinderClass = getSheetsContextBinderClass();
  const spreadsheetId = BinderClass.extractSpreadsheetId(e);

  const StorageAdapterClass = getGoogleSheetsStorageAdapterClass();
  const AuditorClass = getTemplateDriftAuditorClass();

  let report: TemplateDriftReport | undefined;
  let batchReadError: any = undefined;

  const storageAdapter = new StorageAdapterClass(spreadsheetId);

  try {
    report = AuditorClass.auditWorkbook(storageAdapter, { bypassCache: true });
  } catch (err: any) {
    if (
      err instanceof SpreadsheetBatchReadException ||
      (err && typeof err === "object" && (err as any).name === "SpreadsheetBatchReadException")
    ) {
      batchReadError = err;
    } else {
      throw err;
    }
  }

  if (spreadsheetId && report) {
    try {
      const LogEngineClass = getLogEngineClass();

      const engine = new LogEngineClass(storageAdapter);

      let actor = "GoogleAppsScript";
      if (typeof Session !== "undefined" && (Session as any).getActiveUser) {
        try {
          const email = (Session as any).getActiveUser().getEmail();
          if (email) actor = email;
        } catch (err) {}
      }

      engine.logAuditEvent(spreadsheetId, {
        category: "SCHEMA_DRIFT",
        eventType: "DRIFT_AUDIT_EXECUTED",
        actor: actor,
        status: report.status,
        details: {
          spreadsheetId,
          status: report.status,
          canAutoPatch: report.canAutoPatch,
          issuesCount: report.issues ? report.issues.length : 0
        }
      });
    } catch (err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("Audit log write warning during schema drift audit:", err);
      }
    }
  }

  const SheetsRootCardClass = getSheetsRootCardClass();

  const sheetName = e?.sheetsContext?.sheetName || e?.parameters?.sheetName || undefined;

  if (batchReadError) {
    const errorSection = AdminFoldOutPresenter.renderAdminErrorSection(spreadsheetId, batchReadError);
    const card = CardService.newCardBuilder().addSection(errorSection).build();
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification().setText("Advanced Sheets API Unavailable"))
      .build();
  }

  const updatedCard = SheetsRootCardClass.buildSheetsRootCard({
    spreadsheetId,
    sheetName,
    auditReport: report
  });

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(updatedCard))
    .setNotification(CardService.newNotification().setText("Schema audit complete: " + (report?.status || "UNKNOWN")))
    .build();
}

/**
 * Action Handler: Flushes strictly target workbook DOC_CONFIG_<SpreadsheetId>_* ScriptCache entries
 * and logs telemetry event to _AuditLog tab under Category: CACHE_PURGE.
 */
export function onFlushScriptCache(e?: any): GoogleAppsScript.Card_Service.ActionResponse {
  const BinderClass = getSheetsContextBinderClass();
  const spreadsheetId = BinderClass.extractSpreadsheetId(e);

  if (spreadsheetId) {
    const CacheAdapterClass = getGoogleScriptCacheAdapterClass();
    const PrefixManagerClass = getPrefixCacheManagerClass();

    const cacheAdapter = (globalThis as any).defaultCacheAdapter || new CacheAdapterClass();
    const prefixManager = new PrefixManagerClass(cacheAdapter);
    prefixManager.invalidatePrefix("DOC_CONFIG_" + spreadsheetId);

    try {
      const StorageAdapterClass = getGoogleSheetsStorageAdapterClass();
      const LogEngineClass = getLogEngineClass();

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


/**
 * Action Handler: Executes TemplateDriftAuditor.autoPatchWorkbook under SpreadsheetLockAdapter lock,
 * invalidates PrefixCacheManager cache keys, logs telemetry to _AuditLog tab, and re-renders SheetAdminFoldOut card (Issue #226).
 */
export function onAutoPatchWorkbook(e?: any): GoogleAppsScript.Card_Service.ActionResponse {
  const BinderClass = getSheetsContextBinderClass();
  const spreadsheetId = BinderClass.extractSpreadsheetId(e);

  const StorageAdapterClass = getGoogleSheetsStorageAdapterClass();
  const AuditorClass = getTemplateDriftAuditorClass();

  const CacheAdapterClass = getGoogleScriptCacheAdapterClass();

  const storageAdapter = new StorageAdapterClass(spreadsheetId);
  const lockAdapter = (globalThis as any).defaultSpreadsheetLockAdapter;
  const cacheAdapter = (globalThis as any).defaultCacheAdapter || new CacheAdapterClass();

  let result: AutoPatchResult | null = null;
  let batchReadError: unknown = undefined;

  try {
    result = AuditorClass.autoPatchWorkbook(storageAdapter, { lockAdapter, cacheAdapter });
  } catch (err: unknown) {
    if (
      err instanceof SpreadsheetBatchReadException ||
      (err && typeof err === "object" && (err as { name?: string }).name === "SpreadsheetBatchReadException")
    ) {
      batchReadError = err;
    } else {
      throw err;
    }
  }

  if (batchReadError) {
    const errorSection = AdminFoldOutPresenter.renderAdminErrorSection(spreadsheetId, batchReadError);
    const card = CardService.newCardBuilder().addSection(errorSection).build();
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification().setText("Advanced Sheets API Unavailable"))
      .build();
  }

  if (!result) {
    result = { success: false, status: "REPAIR_FAILED", spreadsheetId, repairsApplied: [], error: "No result" };
  }

  let notificationText = "";
  if (result.status === "PATCHED") {
    notificationText = "Auto-patch complete: " + result.repairsApplied.length + " repair(s) applied.";
  } else if (result.status === "NO_OP") {
    notificationText = "Workbook is already fully aligned with template schema. Zero repairs needed.";
  } else if (result.status === "LOCK_CONTENTION") {
    notificationText = "Workbook lock currently held by another process. Please retry shortly.";
  } else if (result.status === "UNPATCHABLE") {
    notificationText = "Auto-patching blocked: Workbook has major structural discrepancies requiring manual migration.";
  } else {
    notificationText = "Auto-patching failed: " + (result.error || "Mid-repair exception occurred.");
  }

  const SheetsRootCardClass = getSheetsRootCardClass();
  const sheetName = e?.sheetsContext?.sheetName || e?.parameters?.sheetName || undefined;

  const updatedCard = SheetsRootCardClass.buildSheetsRootCard({
    spreadsheetId,
    sheetName,
    auditReport: result.auditReport,
    lockContention: result.status === "LOCK_CONTENTION"
  });

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(updatedCard))
    .setNotification(CardService.newNotification().setText(notificationText))
    .build();
}

/**
 * Action Handler: Decompiles the active DocumentLogWorkbook configuration, serializes each valid
 * DocumentTypeSpec to canonical JSON via JsonDocumentTypeSpecAdapter.stringify(), and saves timestamped
 * JSON file(s) to the workbook's parent Google Drive folder via DriveApp (Issue #291).
 */
export function onSaveToJsonConfiguration(e?: any): GoogleAppsScript.Card_Service.ActionResponse {
  const BinderClass = getSheetsContextBinderClass();
  const spreadsheetId = BinderClass.extractSpreadsheetId(e);

  if (!spreadsheetId) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Error: Missing active spreadsheet ID."))
      .build();
  }

  const BatchReaderClass = getSpreadsheetBatchReaderAdapterClass();
  const batchReader: SpreadsheetBatchReaderAdapter = (globalThis as any).defaultSpreadsheetBatchReaderAdapter || new BatchReaderClass();

  const DocTypeSpecAdapterClass = getGoogleSheetsDocumentTypeSpecAdapterClass();
  const JsonAdapterClass = getJsonDocumentTypeSpecAdapterClass();

  let validationResults: SpecValidationResult[] = [];
  let batchReadError: unknown = undefined;

  try {
    const batchData = batchReader.readWorkbookBatch(spreadsheetId);
    validationResults = DocTypeSpecAdapterClass.decompile(batchData);
  } catch (err: unknown) {
    if (
      err instanceof SpreadsheetBatchReadException ||
      (err && typeof err === "object" && (err as { name?: string }).name === "SpreadsheetBatchReadException")
    ) {
      batchReadError = err;
    } else {
      throw err;
    }
  }

  if (batchReadError) {
    const errorSection = AdminFoldOutPresenter.renderAdminErrorSection(spreadsheetId, batchReadError);
    const card = CardService.newCardBuilder().addSection(errorSection).build();
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification().setText("Advanced Sheets API Unavailable"))
      .build();
  }

  const hasInvalid = validationResults.some((r: SpecValidationResult) => r.status === "invalid");
  if (hasInvalid || validationResults.length === 0) {
    const errors: string[] = [];
    for (const res of validationResults) {
      if (res.status === "invalid") {
        errors.push(...res.errors);
      }
    }
    const errorSummary = errors.length > 0 ? errors.join("; ") : "No valid document type specifications found.";
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Decompilation failed: " + errorSummary))
      .build();
  }

  const validSpecs: DocumentTypeSpec[] = [];
  for (const res of validationResults) {
    if (res.status === "valid") {
      validSpecs.push(res.spec);
    }
  }

  // Resolve parent folder in Drive
  const driveApp = (globalThis as any).DriveApp || (typeof DriveApp !== "undefined" ? DriveApp : undefined);
  if (!driveApp || typeof driveApp.getFileById !== "function") {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Error: Google DriveApp is unavailable."))
      .build();
  }

  const file = driveApp.getFileById(spreadsheetId);
  const parents = file.getParents();
  if (!parents || !parents.hasNext()) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Error: Could not resolve parent Google Drive folder for workbook."))
      .build();
  }
  const parentFolder = parents.next();

  const timestamp = Date.now();
  const savedFileNames: string[] = [];

  for (const spec of validSpecs) {
    const jsonContent = JsonAdapterClass.stringify(spec, { space: 2 });
    const fileName = `${spec.key.toLowerCase()}_spec_${timestamp}.json`;
    parentFolder.createFile(fileName, jsonContent, "application/json");
    savedFileNames.push(fileName);
  }

  // Telemetry event logging to _AuditLog
  try {
    const StorageAdapterClass = getGoogleSheetsStorageAdapterClass();
    const LogEngineClass = getLogEngineClass();

    const storageAdapter = new StorageAdapterClass(spreadsheetId);
    const engine = new LogEngineClass(storageAdapter);

    let actor = "GoogleAppsScript";
    if (typeof Session !== "undefined" && (Session as any).getActiveUser) {
      try {
        const email = (Session as any).getActiveUser().getEmail();
        if (email) actor = email;
      } catch (err) {}
    }

    engine.logAuditEvent(spreadsheetId, {
      category: "ADMIN_ACTION",
      eventType: "SPEC_SAVED_TO_JSON",
      actor: actor,
      status: "SUCCESS",
      details: {
        spreadsheetId,
        savedFiles: savedFileNames,
        specCount: validSpecs.length
      }
    });
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("Audit log write warning during save JSON configuration:", err);
    }
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Saved " + savedFileNames.length + " configuration file(s) to Google Drive."))
    .build();
}

