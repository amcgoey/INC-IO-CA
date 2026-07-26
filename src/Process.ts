declare var require: any;

if (typeof require !== "undefined") {
  try {
    const documentPipelineModule = eval('require("./DocumentPipeline")');
    if (documentPipelineModule) {
      if (documentPipelineModule.FormIntakeParser && typeof FormIntakeParser === "undefined") {
        (globalThis as any).FormIntakeParser = documentPipelineModule.FormIntakeParser;
      }
      if (documentPipelineModule.DocumentPipeline && typeof DocumentPipeline === "undefined") {
        (globalThis as any).DocumentPipeline = documentPipelineModule.DocumentPipeline;
      }
    }
  } catch (e) {}
}

if (typeof require !== "undefined") {
  try {
    const documentLogStrategyModule = eval('require("./DocumentLogStrategy")');
    if (documentLogStrategyModule) {
      if (documentLogStrategyModule.ArchitectureSubmittalStrategy && typeof ArchitectureSubmittalStrategy === "undefined") {
        (globalThis as any).ArchitectureSubmittalStrategy = documentLogStrategyModule.ArchitectureSubmittalStrategy;
      }
      if (documentLogStrategyModule.FFESubmittalStrategy && typeof FFESubmittalStrategy === "undefined") {
        (globalThis as any).FFESubmittalStrategy = documentLogStrategyModule.FFESubmittalStrategy;
      }
    }
  } catch (e) {}
}

if (typeof require !== "undefined") {
  try {
    const documentWorkflowModule = eval('require("./DocumentWorkflowModule")');
    if (documentWorkflowModule) {
      if (documentWorkflowModule.DocumentWorkflowModule && typeof DocumentWorkflowModule === "undefined") {
        (globalThis as any).DocumentWorkflowModule = documentWorkflowModule.DocumentWorkflowModule;
      }
      if (documentWorkflowModule.getActionPolicy && typeof getActionPolicy === "undefined") {
        (globalThis as any).getActionPolicy = documentWorkflowModule.getActionPolicy;
      }
    }
  } catch (e) {}
}

/**
 * Main execution entry point for logging a submittal.
 * Triggered by the "File & Log" button in the UI.
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
    const logSheet = openSs.getSheetByName(CONFIG.LOG_SHEET_NAME);  
    if (!logSheet) throw new Error("Log sheet not found in spreadsheet");

    const settings = defaultLogRepository.getLogSettings(p.logFileId, disc);  
    const selectedAction = settings.actions.find(a => a.action === form.action) || { action: "", abbr: "", status: "" };

    // Validate form inputs using pure validation module
    const validationContext: ValidationContext = {
      ffeTags: settings.ffeTags,
      bypassTagValidation: p.bypassTagValidation === "true",
      bypassVendorValidation: p.bypassVendorValidation === "true"
    };

    const validationResult = DocumentPipeline.processFormIntake(form, validationContext);

    if (validationResult.status === "error") {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildMainCard(e, null, false, {
          error: validationResult.errors.join("\n"),
          missingFields: validationResult.missingFields || []
        })))
        .build();
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
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildMainCard(e, null, false, flash)))
        .build();
    }

    const validatedDoc = validationResult.data;
    const emptyFallbacks = validationResult.warnings;
    const logSheetId = logSheet && typeof logSheet.getSheetId === "function" ? logSheet.getSheetId() : undefined;

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
      selectedAction
    };

    const result: DocumentWorkflowResult = await DocumentWorkflowModule.executeWorkflow(input);
    const policy = getActionPolicy(result.action);

    if (policy.direction === "incoming") {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildMainCard(e, null, false, result)))
        .build();
    }

    const details = validatedDoc.disciplineDetails;
    const isArchitecture = details.discipline === "Architecture";
    const isFFE = details.discipline === "FF&E";
    const sectionVal = isArchitecture ? details.section : "";
    const specTagVal = isFFE ? details.specTag : (form.specTag || "");
    const itemTitle = result.title || form.title || (isFFE ? details.specTitle : "");

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildSuccessCard(
        result.fileId,
        result.newFileName,
        result.url,
        result.localPath,
        result.targetKey,
        itemTitle,
        details.discipline,
        sectionVal,
        specTagVal,
        p.targetFolderId,
        p.logFileId,
        false,
        result.projectAbbr || p.projectAbbr,
        result.action || form.action,
        result.incomingRouting || form.incomingRouting,
        null,
        result.directRowUrl,
        result.failedColumns,
        result.emptyFallbacks
      )))
      .build();

  } catch (err: any) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build();
  }
}

/**
 * Handles moving a file to its final destination after logging.
 */
function moveSubmittalToClosed(e: GoogleAppsScriptEvent): any {
  const p = e.parameters || {};
  try {
    const strategy: DocumentLogStrategy = (p.discipline === "Architecture")
      ? new ArchitectureSubmittalStrategy()
      : new FFESubmittalStrategy();

    const doc: ValidatedDocument = {
      documentType: "Submittal",
      date: "",
      contact: "",
      action: "",
      disciplineDetails: p.discipline === "Architecture"
        ? { discipline: "Architecture", section: p.section || "", number: "", title: "", revision: "" }
        : { discipline: "FF&E", specTag: p.specTag || "", specTitle: "", vendor: "", revision: "" }
    };

    const subfolderPath = strategy.getFilingSubfolders
      ? strategy.getFilingSubfolders(doc)
      : [(typeof CONFIG !== "undefined" && CONFIG.CLOSED_FOLDER_NAME) ? CONFIG.CLOSED_FOLDER_NAME : "Closed"];

    const filingResult = defaultDriveFilingRepository.fileDocument(
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
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(updated)).setNotification(CardService.newNotification().setText(MESSAGES.SUCCESS_MOVED(destName))).build();
  } catch (err: any) { return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build(); }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    processSubmission,
    moveSubmittalToClosed
  };
}
