import { CONFIG, MESSAGES } from "./Config";
import { CardDraftStateManager } from "./prototypes/CardDraftStateManager";
import { TransientOverrideLogger } from "./core/logging/TransientOverrideLogger";
import { buildSuccessCard } from "./adapters/gas/UI";
import { DocumentPipeline } from "./core/intake/DocumentPipeline";
import { DeclarativeDocumentLogStrategy } from "./core/logging/DeclarativeDocumentLogStrategy";
import { DocumentTypeSpecRegistry } from "./core/specs/DocumentTypeSpecRegistry";
import { DocumentTypeConfigRegistry } from "./DocumentTypeConfigRegistry";
import { PipelineBuilder } from "./core/workflow/PipelineBuilder";
import { ActionRegistry } from "./core/workflow/ActionRegistry";
import { LogRepository } from "./core/interfaces/LogRepository";
import { DriveFilingRepository } from "./core/interfaces/DriveFilingRepository";
import { CardPresenter } from "./core/interfaces/UserInterfacePresenter";

export interface ProcessDependencies {
  actionRegistry: ActionRegistry;
  specRegistry: DocumentTypeSpecRegistry;
  configRegistry: DocumentTypeConfigRegistry;
  logRepository: LogRepository;
  driveFilingRepository: DriveFilingRepository;
  cardPresenter: CardPresenter;
}

/**
 * Primary action handler executed when the user clicks "File & Log" in the add-on interface.
 *
 * Enforces URL fetch checks, retrieves spreadsheet settings, validates form inputs against business rules,
 * handles interaction prompts for new tags or vendors, executes the submittal workflow, and renders the result card.
 *
 * @param e - Google Apps Script event object containing form values and execution parameters.
 * @param deps - Injected dependencies including action, spec, config registries, repositories, and UI presenter.
 * @returns A Promise resolving to an `ActionResponse` with card navigation or error toast notifications.
 */
async function processSubmission(e: GoogleAppsScriptEvent, deps: ProcessDependencies): Promise<any> {
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

    const logRepo = deps.logRepository;
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
      new TransientOverrideLogger().logOverrides(initialAi, form);
    }

    const validationResult = DocumentPipeline.processFormIntake(form, validationContext);

    if (validationResult.status === "error") {
      return deps.cardPresenter.presentValidationError(
        e,
        validationResult.errors,
        validationResult.missingFields
      );
    }

    if (validationResult.status === "interaction_required") {
      return deps.cardPresenter.presentInteractionPrompt(
        e,
        validationResult.interactionType,
        validationResult.message
      );
    }

    const validatedDoc = validationResult.data;
    const emptyFallbacks = validationResult.warnings;
    const logSheetId = logSheet && typeof logSheet.getSheetId === "function" ? logSheet.getSheetId() : undefined;

    const logRepository = deps.logRepository;
    const driveFilingRepository = deps.driveFilingRepository;

    const docType = validatedDoc.documentType || disc;
    const config = deps.configRegistry.hasConfig(docType)
      ? deps.configRegistry.getConfig(docType)
      : undefined;

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

    const result: DocumentWorkflowResult = await PipelineBuilder.buildAndExecute(
      input,
      deps.actionRegistry,
      deps.specRegistry,
      deps.configRegistry
    );

    try {
      const userCache = typeof CacheService !== "undefined" ? CacheService.getUserCache() : null;
      if (userCache) {
        const cdsm = CardDraftStateManager;
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

    const policy = result.policy;

    if (policy?.direction === "incoming" || (!policy?.direction && result.action === "Received")) {
      return deps.cardPresenter.presentIncomingSuccess(e, result);
    }

    return deps.cardPresenter.presentOutgoingSuccess(e, result, p);

  } catch (err: any) {
    console.error("IntakeCard error:", err);
    
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build();
  }
}

/**
 * Action handler for moving a logged submittal PDF into its final destination subfolder (e.g. Closed subfolder).
 * Uses `DriveFilingRepository` to determine the target folder structure and file the document.
 *
 * @param e - Google Apps Script event object containing document parameters (file ID, discipline, section/tag).
 * @param deps - Injected process dependencies.
 * @returns ActionResponse updating the card with filing confirmation.
 */
function moveSubmittalToClosed(e: GoogleAppsScriptEvent, deps: ProcessDependencies): any {
  const p = e.parameters || {};
  try {
    const docTypeKey = p.documentType || (p.discipline ? (deps.specRegistry.findSpecKey(p.discipline) || (p.discipline === "Architecture" ? "SUBMITTAL_ARCH" : "SUBMITTAL_FFE")) : "SUBMITTAL_ARCH");
    const spec = deps.specRegistry.getSpec(docTypeKey);
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

    const driveFilingRepo = deps.driveFilingRepository;
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
    return deps.cardPresenter.presentMoveToClosedSuccess(e, updated, destName);
  } catch (err: any) {
    console.error("IntakeCard error:", err);
    
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build();
  }
}

export {
  processSubmission,
  moveSubmittalToClosed
};
