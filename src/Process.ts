import { CONFIG, MESSAGES } from "./Config";
import { CardDraftStateManager } from "./core/state/CardDraftStateManager";
import { TransientOverrideLogger } from "./core/logging/TransientOverrideLogger";
import { buildSuccessCard } from "./adapters/gas/UI";
import { DocumentPipeline } from "./core/intake/DocumentPipeline";
import { DocumentTypeSpecRegistry, defaultDocumentTypeSpecRegistry } from "./core/specs/DocumentTypeSpecRegistry";
import { DocumentTypeConfigRegistry, defaultDocumentTypeConfigRegistry } from "./DocumentTypeConfigRegistry";
import { PipelineBuilder } from "./core/workflow/PipelineBuilder";
import { ActionRegistry, defaultActionRegistry } from "./core/workflow/ActionRegistry";
import { LogRepository } from "./core/interfaces/LogRepository";
import { DriveFilingRepository } from "./core/interfaces/DriveFilingRepository";
import { UserInterfacePresenter } from "./core/interfaces/UserInterfacePresenter";
import { defaultLogRepository } from "./GoogleSheetsLogRepository";
import { defaultDriveFilingRepository } from "./DriveFilingRepository";
import { defaultCardPresenter } from "./adapters/gas/CardPresenter";

export interface ProcessDependencies {
  actionRegistry: ActionRegistry;
  specRegistry: DocumentTypeSpecRegistry;
  configRegistry: DocumentTypeConfigRegistry;
  logRepository: LogRepository;
  driveFilingRepository: DriveFilingRepository;
  cardPresenter: UserInterfacePresenter;
}

const resolveDefaultDependencies = (deps?: ProcessDependencies): ProcessDependencies => {
  if (deps) return deps;
  return {
    actionRegistry: (globalThis as any).defaultActionRegistry || defaultActionRegistry,
    specRegistry: (globalThis as any).defaultDocumentTypeSpecRegistry || defaultDocumentTypeSpecRegistry,
    configRegistry: (globalThis as any).defaultDocumentTypeConfigRegistry || defaultDocumentTypeConfigRegistry,
    logRepository: (globalThis as any).defaultLogRepository || defaultLogRepository,
    driveFilingRepository: (globalThis as any).defaultDriveFilingRepository || defaultDriveFilingRepository,
    cardPresenter: (globalThis as any).defaultCardPresenter || defaultCardPresenter
  };
};

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
async function processSubmission(e: GoogleAppsScriptEvent, deps?: ProcessDependencies): Promise<any> {
  const activeDeps = resolveDefaultDependencies(deps);
  try {
    let form = e.formInput || {};
    const p = e.parameters || {};

    const bypassDatasets: string[] = [];
    if (p.resumedFromDynamicPrompt === "true" && p.originalFormInput) {
      try {
        const original = JSON.parse(p.originalFormInput);
        form = { ...original, ...form };
        e.formInput = form;
        if (p.promptSupportDataKey) {
          bypassDatasets.push(p.promptSupportDataKey);
        }
      } catch (_e) {}
    }

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

    const logRepo = activeDeps.logRepository;
    const settings = logRepo.getLogSettings(p.logFileId, disc);  
    const selectedAction = settings.actions.find(a => a.action === form.action) || { action: "", abbr: "", status: "" };

    // Validate form inputs using pure validation module
    const validationContext: ValidationContext = {
      ffeTags: settings.ffeTags,
      bypassTagValidation: p.bypassTagValidation === "true" || bypassDatasets.includes("SpecTags"),
      bypassVendorValidation: p.bypassVendorValidation === "true" || bypassDatasets.includes("Vendors"),
      bypassDatasets
    };

    const initialAi = (e as any).aiResult || (p && p.aiResult ? JSON.parse(p.aiResult) : null) || null;
    if (initialAi) {
      new TransientOverrideLogger().logOverrides(initialAi, form);
    }

    const validationResult = DocumentPipeline.processFormIntake(form, validationContext);

    if (validationResult.status === "error") {
      return activeDeps.cardPresenter.presentValidationError(
        e,
        validationResult.errors,
        validationResult.missingFields
      );
    }

    if (validationResult.status === "interaction_required") {
      if (validationResult.dynamicPrompts && validationResult.dynamicPrompts.length > 0 && activeDeps.cardPresenter.presentDynamicPromptCard) {
        return activeDeps.cardPresenter.presentDynamicPromptCard(e, validationResult);
      }
      const promptType = (validationResult.interactionType === "ADD_VENDOR" ? "ADD_VENDOR" : "ADD_TAG");
      return activeDeps.cardPresenter.presentInteractionPrompt(
        e,
        promptType,
        validationResult.message
      );
    }

    const validatedDoc = validationResult.data;
    const emptyFallbacks = validationResult.warnings;
    const logSheetId = logSheet && typeof logSheet.getSheetId === "function" ? logSheet.getSheetId() : undefined;

    const logRepository = activeDeps.logRepository;
    const driveFilingRepository = activeDeps.driveFilingRepository;

    const docType = validatedDoc.documentType || disc;
    const config = activeDeps.configRegistry.hasConfig(docType)
      ? activeDeps.configRegistry.getConfig(docType)
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
      activeDeps.actionRegistry,
      activeDeps.specRegistry,
      activeDeps.configRegistry
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
        if (cdsm && typeof cdsm.resolveContextKey === "function") {
          const resolvedKey = cdsm.resolveContextKey({ ...p, ...form });
          if (resolvedKey) evictDraft(resolvedKey);
        }
      }
    } catch (_err) {}

    const policy = result.policy;

    if (policy?.direction === "incoming" || (!policy?.direction && result.action === "Received")) {
      return activeDeps.cardPresenter.presentIncomingSuccess(e, result);
    }

    return activeDeps.cardPresenter.presentOutgoingSuccess(e, result, p);

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
function moveSubmittalToClosed(e: GoogleAppsScriptEvent, deps?: ProcessDependencies): any {
  const activeDeps = resolveDefaultDependencies(deps);
  const p = e.parameters || {};
  try {
    const docType = p.documentType || p.discipline || "SUBMITTAL_ARCH";
    const config = activeDeps.configRegistry.hasConfig(docType)
      ? activeDeps.configRegistry.getConfig(docType)
      : (activeDeps.specRegistry.findSpecKey(docType) && activeDeps.configRegistry.hasConfig(activeDeps.specRegistry.findSpecKey(docType)!))
        ? activeDeps.configRegistry.getConfig(activeDeps.specRegistry.findSpecKey(docType)!)
        : activeDeps.configRegistry.getConfig("SUBMITTAL_ARCH");
    const strategy: DocumentLogStrategy | undefined = config.logStrategy;

    const doc: ValidatedDocument = {
      documentType: config.documentType,
      date: p.date || "",
      contact: p.contact || "",
      action: p.action || "",
      disciplineDetails: {
        discipline: p.discipline || config.displayName,
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

    const closedFolder = config.closedRootFolderName || ((typeof CONFIG !== "undefined" && CONFIG.CLOSED_FOLDER_NAME) ? CONFIG.CLOSED_FOLDER_NAME : "Closed");
    const subfolderPath = strategy && strategy.getFilingSubfolders
      ? strategy.getFilingSubfolders(doc)
      : [closedFolder];

    const driveFilingRepo = activeDeps.driveFilingRepository;
    const filingResult = driveFilingRepo.fileDocument(
      { fileId: p.fileId },
      { targetFolderId: p.targetFolderId, subfolderPath }
    );

    const destFolder = typeof DriveApp !== "undefined" && DriveApp.getFolderById ? DriveApp.getFolderById(filingResult.folderId) : null;
    const destName = destFolder && typeof destFolder.getName === "function" ? destFolder.getName() : "Closed";
    const failedCols = p.failedColumns ? JSON.parse(p.failedColumns) : [];
    const emptyFalls = p.emptyFallbacks ? JSON.parse(p.emptyFallbacks) : [];

    const updated = buildSuccessCard(
      p.fileId, p.newFileName, p.fileUrl, filingResult.localPath, p.stampSubNo, p.itemTitle, p.discipline, p.section, p.specTag, 
      p.targetFolderId, p.logFileId, true, p.projectAbbr, p.action, p.incomingRouting, null,
      p.directRowUrl, failedCols, emptyFalls
    );
    if (activeDeps.cardPresenter.presentMoveToClosedSuccess) {
      return activeDeps.cardPresenter.presentMoveToClosedSuccess(e, updated, destName);
    }
    return null;
  } catch (err: any) {
    console.error("IntakeCard error:", err);
    return deps.cardPresenter.presentError(err);
  }
}

export {
  processSubmission,
  moveSubmittalToClosed
};
