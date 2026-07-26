declare var require: any;

if (typeof require !== "undefined") {
  try {
    const _dp = eval('require("./DocumentPipeline")');
    if (_dp) {
      if (_dp.FormIntakeParser && typeof FormIntakeParser === "undefined") {
        (globalThis as any).FormIntakeParser = _dp.FormIntakeParser;
      }
      if (_dp.DocumentPipeline && typeof DocumentPipeline === "undefined") {
        (globalThis as any).DocumentPipeline = _dp.DocumentPipeline;
      }
    }
  } catch (e) {}
}

if (typeof require !== "undefined") {
  try {
    const _dls = eval('require("./DocumentLogStrategy")');
    if (_dls) {
      if (_dls.ArchitectureSubmittalStrategy && typeof ArchitectureSubmittalStrategy === "undefined") {
        (globalThis as any).ArchitectureSubmittalStrategy = _dls.ArchitectureSubmittalStrategy;
      }
      if (_dls.FFESubmittalStrategy && typeof FFESubmittalStrategy === "undefined") {
        (globalThis as any).FFESubmittalStrategy = _dls.FFESubmittalStrategy;
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

    const headers = defaultLogRepository.verifyAndFormatLogSheet(p.logFileId);  
    const getColIdx = (n: string) => headers.indexOf(n);  
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
    const details = validatedDoc.disciplineDetails;
    const sectionVal = (details.discipline === "Architecture") ? details.section : "";

    const ctx = { 
      e, form, p, discipline: disc, logSheet, headers, getColIdx, selectedAction, 
      sectionVal, emptyFallbacks, validatedDoc
    };  
    
    // Branch logic based on whether the action is "Received" (Incoming) or a Review status (Outgoing)
    return form.action === "Received" ? await executeIncomingWorkflow(ctx) : await executeOutgoingWorkflow(ctx);

  } catch (err: any) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build();
  }
}

async function executeIncomingWorkflow(ctx: any): Promise<any> {
  const { e, form, p, logSheet, selectedAction, emptyFallbacks, validatedDoc } = ctx;

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

  const workflowModule = (globalThis as any).DocumentWorkflowModule || DocumentWorkflowModule;
  const result: DocumentWorkflowResult = await workflowModule.executeWorkflow(input);

  const flashData = {
    fileId: result.fileId,
    targetKey: result.targetKey,
    url: result.url,
    localPath: result.localPath,
    title: result.title,
    action: result.action,
    incomingRouting: result.incomingRouting,
    projectAbbr: result.projectAbbr,
    directRowUrl: result.directRowUrl,
    failedColumns: result.failedColumns,
    emptyFallbacks: result.emptyFallbacks,
    newFileName: result.newFileName
  };

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainCard(e, null, false, flashData)))
    .build();
}

async function executeOutgoingWorkflow(ctx: any): Promise<any> {
  const { form, p, discipline, logSheet, selectedAction, sectionVal, emptyFallbacks, validatedDoc } = ctx;

  let blob: GoogleAppsScript.Base.Blob | null = null;
  if (!p.driveFileId) {
    if (form.fileSource === "Email Attachment") {
      const msg = GmailApp.getMessageById(p.messageId);
      const att = msg.getAttachments().find(a => a.getName() === form.attachmentName);
      if (att) blob = att.copyBlob();
    } else if (form.fileSource === "Google Drive URL") {
      const match = form.driveFileUrl ? form.driveFileUrl.match(/[-\w]{25,}/) : null;
      if (match) blob = DriveApp.getFileById(match[0]).getAs((MimeType as any).PDF);
    }
  }

  const filingResult = defaultDriveFilingRepository.fileDocument(
    { fileId: p.driveFileId, blob: blob || undefined },
    { targetFolderId: p.targetFolderId }
  );

  const strategy: DocumentLogStrategy = (discipline === "Architecture")
    ? new ArchitectureSubmittalStrategy()
    : new FFESubmittalStrategy();

  const appendResult = defaultLogRepository.appendDocument(
    p.logFileId,
    validatedDoc,
    strategy,
    {
      link: filingResult.url,
      status: selectedAction.status,
      actionAbbr: selectedAction.abbr,
      updatePreviousStatus: true,
      previousRowStatus: "Closed"
    }
  );

  if (filingResult.fileId) {
    DriveApp.getFileById(filingResult.fileId).setName(appendResult.newFileName + ".pdf");
  }

  const logSheetId = logSheet.getSheetId();
  const directRowUrl = `https://docs.google.com/spreadsheets/d/${p.logFileId}/edit#gid=${logSheetId}&range=A${appendResult.rowIndex}`;

  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(buildSuccessCard(
    filingResult.fileId, appendResult.newFileName, filingResult.url, filingResult.localPath, appendResult.targetKey, form.title || form.specTitle, discipline, sectionVal, form.specTag, 
    p.targetFolderId, p.logFileId, false, p.projectAbbr, form.action, form.incomingRouting, null,
    directRowUrl, appendResult.failedColumns, emptyFallbacks
  ))).build();
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
    executeIncomingWorkflow,
    executeOutgoingWorkflow,
    moveSubmittalToClosed
  };
}
