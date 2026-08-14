import { CONFIG, MESSAGES } from "./Config";
import { CardDraftStateManager } from "./prototypes/CardDraftStateManager";
import { TransientOverrideLogger } from "./core/logging/TransientOverrideLogger";
import { buildIntakeCard } from "./adapters/gas/UI";
import { defaultCardPresenter } from "./adapters/gas/CardPresenter";
import { DocumentPipeline } from "./core/intake/DocumentPipeline";
import { DeclarativeDocumentLogStrategy } from "./core/logging/DeclarativeDocumentLogStrategy";
import { defaultDocumentTypeSpecRegistry } from "./core/specs/DocumentTypeSpecRegistry";
import { DocumentWorkflowModule, getActionPolicy } from "./core/workflow/DocumentWorkflowModule";
import { defaultLogRepository } from "./GoogleSheetsLogRepository";
import { defaultDriveFilingRepository } from "./DriveFilingRepository";

/**
 * Primary action handler executed when the user clicks "File & Log" in the add-on interface.
 *
 * Enforces URL fetch checks, retrieves spreadsheet settings, validates form inputs against business rules,
 * handles interaction prompts for new tags or vendors, executes the submittal workflow, and renders the result card.
 *
 * @param e - Google Apps Script event object containing form values and execution parameters.
 * @returns A Promise resolving to an `ActionResponse` with card navigation or error toast notifications.
 */
async function processSubmission(e: GoogleAppsScriptEvent): Promise<any> {
  try {
    const form = e.formInput || {};
    const p = e.parameters || {};

    // Task 1: Fetch Bypass Validation
    // Ensures users don't skip the "Fetch" step when using external URLs.
    if (form.fileSource && form.fileSource.startsWith("http") && form.fileSource !== form.driveFileUrl) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("⚠️ Please click 'Fetch & Save to Drive' before logging."))
        .build();
    }

    const disc = form.discipline || CONFIG.DEFAULT_DISCIPLINE;
    if (!p.logFileId) throw new Error(MESSAGES.ERROR_NO_LOG);

    const openSs = SpreadsheetApp.openById(p.logFileId);
    const logSheet = openSs.getSheetByName(CONFIG.LOG_SHEET_NAME) || openSs.getSheetByName("Submittals Log") || openSs.getSheetByName("Submittal Arch") || (openSs.getSheets ? openSs.getSheets()[0] : null);  
    if (!logSheet) throw new Error("Log sheet not found in spreadsheet");

    const logRepo = (globalThis as any).defaultLogRepository || defaultLogRepository;
    const settings = logRepo.getLogSettings(p.logFileId, disc);  
    const selectedAction = settings.actions.find(a => a.action === form.action) || { action: "", abbr: "", status: "" };

    // Validate form inputs using pure validation module
    const validationContext: ValidationContext = {
      ffeTags: settings.ffeTags,
      bypassTagValidation: p.bypassTagValidation === "true",
      bypassVendorValidation: p.bypassVendorValidation === "true"
    };

    const initialAi = (e as any).aiResult || (p && p.aiResult ? JSON.parse(p.aiResult) : null) || null;
if (initialAi) {
    const LoggerClass = typeof (globalThis as any).TransientOverrideLogger !== "undefined" ? (globalThis as any).TransientOverrideLogger : (typeof TransientOverrideLogger !== "undefined" ? TransientOverrideLogger : null);
    if (LoggerClass) {
      new LoggerClass().logOverrides(initialAi, form);
    }
}

const validationResult = DocumentPipeline.processFormIntake(form, validationContext);

    if (validationResult.status === "error") {
      return defaultCardPresenter.presentValidationError(
        e,
        validationResult.errors,
        validationResult.missingFields
      );
    }

    if (validationResult.status === "interaction_required") {
      const flash: FlashMessage = {};
      if (validationResult.interactionType === "ADD_TAG") {
        flash.promptAddTag = true;
        flash.warning = validationResult.message;
      } else if (validationResult.interactionType === "ADD_VENDOR") {
        flash.promptAddVendor = true;
        flash.warning = validationResult.message;
      }
      const builder = (globalThis as any).buildIntakeCard || buildIntakeCard;
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(builder(e, null, flash)))
        .build();
    }

    const validatedDoc = validationResult.data;
    const emptyFallbacks = validationResult.warnings;
    const logSheetId = logSheet && typeof logSheet.getSheetId === "function" ? logSheet.getSheetId() : undefined;

    const logRepository = (globalThis as any).defaultLogRepository || defaultLogRepository;
    const driveFilingRepository = (globalThis as any).defaultDriveFilingRepository || defaultDriveFilingRepository;

    const input: DocumentWorkflowInput = {
      validatedDoc,
      logFileId: p.logFileId,
      logSheetId,
      targetFolderId: p.targetFolderId,
      driveFileId: p.driveFileId,
      fileSource: form.fileSource,
      messageId: p.messageId,
      attachmentName: form.attachmentName,
      driveFileUrl: form.driveFileUrl,
      incomingRouting: form.incomingRouting,
      projectAbbr: p.projectAbbr,
      emptyFallbacks,
      selectedAction,
      logRepository,
      driveFilingRepository
    };

    const dwm = (globalThis as any).DocumentWorkflowModule || DocumentWorkflowModule;
    const policyFn = (globalThis as any).getActionPolicy || getActionPolicy;
    const result: DocumentWorkflowResult = await dwm.executeWorkflow(input);
    try {
      const userCache = typeof CacheService !== "undefined" ? CacheService.getUserCache() : null;
      if (userCache) {
        const cdsm = typeof CardDraftStateManager !== "undefined" ? CardDraftStateManager : (globalThis as any).CardDraftStateManager;
        const evictDraft = (key: string) => {
          const cacheKey = key.startsWith("CARD_DRAFT_V1_") ? key : `CARD_DRAFT_V1_${key}`;
          if (userCache && typeof userCache.remove === "function") {
            userCache.remove(cacheKey);
            userCache.remove(key);
          }
          if (cdsm && typeof cdsm.clearDraft === "function") {
            try { cdsm.clearDraft(userCache, key); } catch (_e) {}
          }
        };

        const msgId = p.messageId || form.messageId;
        if (msgId) evictDraft(`GMAIL_${msgId}`);
        const drvId = p.driveFileId || form.driveFileId;
        if (drvId) evictDraft(`DRIVE_${drvId}`);
        const ctxKey = p.contextKey || form.contextKey;
        if (ctxKey) evictDraft(ctxKey);
        const drftKey = p.draftKey || form.draftKey;
        if (drftKey) evictDraft(drftKey);
      }
    } catch (_err) {}

    const policy = policyFn(result.action);

    if (policy.direction === "incoming") {
      const builder = (globalThis as any).buildIntakeCard || buildIntakeCard;
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(builder(e, null, result)))
        .build();
    }

    const cp = (globalThis as any).defaultCardPresenter || defaultCardPresenter;
    return cp.presentOutgoingSuccess(e, result, p);

  } catch (err: any) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build();
  }
}

/**
 * Action handler for moving a logged submittal PDF into its final destination subfolder (e.g. Closed subfolder).
 * Uses `DriveFilingRepository` to determine the target folder structure and file the document.
 *
 * @param e - Google Apps Script event object containing document parameters (file ID, discipline, section/tag).
 * @returns ActionResponse updating the card with filing confirmation.
 */
function moveSubmittalToClosed(e: GoogleAppsScriptEvent): any {
  const p = e.parameters || {};
  try {
    const docTypeKey = p.documentType || (p.discipline ? (defaultDocumentTypeSpecRegistry.findSpecKey(p.discipline) || (p.discipline === "Architecture" ? "SUBMITTAL_ARCH" : "SUBMITTAL_FFE")) : "SUBMITTAL_ARCH");
    const spec = defaultDocumentTypeSpecRegistry.getSpec(docTypeKey);
    const strategy: DocumentLogStrategy = new DeclarativeDocumentLogStrategy(spec);

    const doc: ValidatedDocument = {
      documentType: spec.key,
      date: p.date || "",
      contact: p.contact || "",
      action: p.action || "",
      disciplineDetails: {
        discipline: p.discipline || spec.label,
        section: p.section || "",
        specTag: p.specTag || "",
        number: p.number || "",
        revision: p.revision || "",
        title: p.title || p.itemTitle || "",
        vendor: p.vendor || "",
      },
      section: p.section || "",
      specTag: p.specTag || "",
    } as any;

    const closedFolder = (typeof CONFIG !== "undefined" && CONFIG.CLOSED_FOLDER_NAME) ? CONFIG.CLOSED_FOLDER_NAME : "Closed";
    const subfolderPath = strategy.getFilingSubfolders
      ? strategy.getFilingSubfolders(doc)
      : [closedFolder];

    const driveFilingRepo = (e && (e as any).driveFilingRepository) || (globalThis as any).defaultDriveFilingRepository || defaultDriveFilingRepository;
    const filingResult = driveFilingRepo.fileDocument(
      { fileId: p.fileId },
      { targetFolderId: p.targetFolderId, subfolderPath }
    );

    const destName = DriveApp.getFolderById(filingResult.folderId).getName();
    const failedCols = p.failedColumns ? JSON.parse(p.failedColumns) : [];
    const emptyFalls = p.emptyFallbacks ? JSON.parse(p.emptyFallbacks) : [];

    const updated = buildSuccessCard(
      p.fileId, p.newFileName, p.fileUrl, filingResult.localPath, p.stampSubNo, p.itemTitle, p.discipline, p.section, p.specTag, 
      p.targetFolderId, p.logFileId, true, p.projectAbbr, p.action, p.incomingRouting, null,
      p.directRowUrl, failedCols, emptyFalls
    );
    return defaultCardPresenter.presentMoveToClosedSuccess(e, updated, destName);
  } catch (err: any) { return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build(); }
}

export {
  processSubmission,
  moveSubmittalToClosed
};
