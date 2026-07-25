declare var require: any;

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
    const rawDoc: RawDocument = form;
    const validationContext: ValidationContext = {
      ffeTags: settings.ffeTags,
      bypassTagValidation: p.bypassTagValidation === "true",
      bypassVendorValidation: p.bypassVendorValidation === "true"
    };

    const validationResult = validateDocument(rawDoc, validationContext);

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
  const { e, form, p, discipline, logSheet, selectedAction, sectionVal, emptyFallbacks, validatedDoc } = ctx;

  const root = DriveApp.getFolderById(p.targetFolderId);
  const closedId = getOrCreateFilingFolder(p.targetFolderId, discipline, sectionVal, form.specTag);
  const closed = DriveApp.getFolderById(closedId);

  let url = "", blob: GoogleAppsScript.Base.Blob | null = null, id = "";

  if (p.driveFileId) {
    const file = DriveApp.getFileById(p.driveFileId);
    file.moveTo(closed);
    url = file.getUrl();
    id = file.getId();
    blob = file.getBlob();
  } else {
    if (form.fileSource === "Email Attachment") {
      const msg = GmailApp.getMessageById(p.messageId);
      const att = msg.getAttachments().find(a => a.getName() === form.attachmentName);
      if (att) blob = att.copyBlob();
    } else if (form.fileSource === "Google Drive URL") {
      const match = form.driveFileUrl ? form.driveFileUrl.match(/[-\w]{25,}/) : null;
      if (match) blob = DriveApp.getFileById(match[0]).getAs((MimeType as any).PDF);
    }
    if (blob) {
      const file = closed.createFile(blob.copyBlob().setName("temp.pdf"));
      url = file.getUrl();
      id = file.getId();
    }
  }

  const strategy: DocumentLogStrategy = (discipline === "Architecture") 
    ? new ArchitectureSubmittalStrategy() 
    : new FFESubmittalStrategy();

  const appendResult = defaultLogRepository.appendDocument(
    p.logFileId,
    validatedDoc,
    strategy,
    {
      link: url,
      status: selectedAction.status,
      actionAbbr: selectedAction.abbr
    }
  );

  if (p.driveFileId) {
    DriveApp.getFileById(p.driveFileId).setName(appendResult.newFileName + ".pdf");
  } else if (blob && id) {
    DriveApp.getFileById(id).setName(appendResult.newFileName + ".pdf");
  }

  if (blob) {
    const templateId = (form.incomingRouting === "To Refer") ? CONFIG.TRANSMITTAL_TEMPLATE_ID : CONFIG.PDF_TEMPLATE_ID;
    try {
      const stamped = await defaultPdfDocumentService.stampSubmittal(blob, form, {
        newFileName: appendResult.newFileName,
        stampSubmittalNo: appendResult.targetKey,
        templateId: templateId
      });
      stamped.setName(CONFIG.STAMPED_FILE_PREFIX + appendResult.newFileName + ".pdf");
      root.createFile(stamped);
    } catch (err: any) {
      if (err.message === "TEMPLATE_MISSING") {
        root.createFile(blob.copyBlob().setName(CONFIG.STAMPED_FILE_PREFIX + appendResult.newFileName + ".pdf"));
      } else { throw err; }
    }
  }

  const logSheetId = logSheet.getSheetId();
  const directRowUrl = `https://docs.google.com/spreadsheets/d/${p.logFileId}/edit#gid=${logSheetId}&range=A${appendResult.rowIndex}`;

  const flashData = { 
    fileId: id, 
    targetKey: appendResult.targetKey, 
    url, 
    localPath: getLocalDrivePath(id), 
    title: form.title || form.specTitle || "", 
    action: form.action, 
    incomingRouting: form.incomingRouting, 
    projectAbbr: p.projectAbbr,
    directRowUrl: directRowUrl,
    failedColumns: appendResult.failedColumns,
    emptyFallbacks: emptyFallbacks,
    newFileName: appendResult.newFileName
  };

  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(buildMainCard(e, null, false, flashData))).build();
}

async function executeOutgoingWorkflow(ctx: any): Promise<any> {
  const { form, p, discipline, logSheet, selectedAction, sectionVal, emptyFallbacks, validatedDoc } = ctx;

  let url = "", path = "", id = "", root = DriveApp.getFolderById(p.targetFolderId);

  if (p.driveFileId) {
    const file = DriveApp.getFileById(p.driveFileId);
    if (file.getParents().hasNext() && file.getParents().next().getId() !== p.targetFolderId) file.moveTo(root);
    url = file.getUrl(); id = p.driveFileId; path = getLocalDrivePath(id);
  } else {
    let blob: GoogleAppsScript.Base.Blob | null = null;
    if (form.fileSource === "Email Attachment") {
      const msg = GmailApp.getMessageById(p.messageId);
      const att = msg.getAttachments().find(a => a.getName() === form.attachmentName);
      if (att) blob = att.copyBlob();
    } else if (form.fileSource === "Google Drive URL") {
      const match = form.driveFileUrl ? form.driveFileUrl.match(/[-\w]{25,}/) : null;
      if (match) blob = DriveApp.getFileById(match[0]).getAs((MimeType as any).PDF);
    }
    if (blob) {
      const file = root.createFile(blob.copyBlob().setName("temp.pdf"));
      url = file.getUrl(); id = file.getId(); path = getLocalDrivePath(id);
    }
  }

  const strategy: DocumentLogStrategy = (discipline === "Architecture")
    ? new ArchitectureSubmittalStrategy()
    : new FFESubmittalStrategy();

  const appendResult = defaultLogRepository.appendDocument(
    p.logFileId,
    validatedDoc,
    strategy,
    {
      link: url,
      status: selectedAction.status,
      actionAbbr: selectedAction.abbr,
      updatePreviousStatus: true,
      previousRowStatus: "Closed"
    }
  );

  if (id) {
    DriveApp.getFileById(id).setName(appendResult.newFileName + ".pdf");
  }

  const logSheetId = logSheet.getSheetId();
  const directRowUrl = `https://docs.google.com/spreadsheets/d/${p.logFileId}/edit#gid=${logSheetId}&range=A${appendResult.rowIndex}`;

  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(buildSuccessCard(
    id, appendResult.newFileName, url, path, appendResult.targetKey, form.title || form.specTitle, discipline, sectionVal, form.specTag, 
    p.targetFolderId, p.logFileId, false, p.projectAbbr, form.action, form.incomingRouting, null,
    directRowUrl, appendResult.failedColumns, emptyFallbacks
  ))).build();
}

/**
 * Maps the Google Drive file structure back to a local G:\ drive path for the user.
 */
function getLocalDrivePath(fileId: string): string {
  try {
    const fileMeta = (Drive as any).Files.get(fileId, {supportsAllDrives: true});
    let path = [fileMeta.title];
    if (fileMeta.driveId) {
      const driveMeta = (Drive as any).Drives.get(fileMeta.driveId);
      let currentParentId = (fileMeta.parents && fileMeta.parents.length > 0) ? fileMeta.parents[0].id : null;
      while (currentParentId && currentParentId !== fileMeta.driveId) {
        let pFolder = (Drive as any).Files.get(currentParentId, {supportsAllDrives: true});
        path.unshift(pFolder.title);
        currentParentId = (pFolder.parents && pFolder.parents.length > 0) ? pFolder.parents[0].id : null;
      }
      path.unshift(driveMeta.name);
      return "G:\\Shared drives\\" + path.join("\\");
    } else {
      let curFile = DriveApp.getFileById(fileId); path = [curFile.getName()]; let parents = curFile.getParents();
      while (parents.hasNext()) {
        let pFolder = parents.next(); let n = pFolder.getName();
        if (n !== "Drive" && n !== "My Drive") path.unshift(n);
        parents = pFolder.getParents();
      }
      return "G:\\My Drive\\" + path.join("\\");
    }
  } catch (e) { return "G:\\Error\\" + fileId; }
}

/**
 * Logic to find or create the specific subfolder for a division or FF&E tag.
 */
function getOrCreateFilingFolder(parentFolderId: string, discipline: string, section?: string, specTag?: string): string {
  const parent = DriveApp.getFolderById(parentFolderId);
  const closedIter = parent.getFoldersByName(CONFIG.CLOSED_FOLDER_NAME);
  const closed = closedIter.hasNext() ? closedIter.next() : parent.createFolder(CONFIG.CLOSED_FOLDER_NAME);
  let subName: string | null = null;
  if (discipline === "Architecture" && section) {
    subName = CSI_DIVISIONS[String(section).substring(0, 2)];
  } else if (discipline === "FF&E" && specTag) {
    const trimmedTag = String(specTag).trim();
    if (trimmedTag) subName = trimmedTag.substring(0, 2);
  }
  if (subName) {
    const subIter = closed.getFoldersByName(subName);
    return subIter.hasNext() ? subIter.next().getId() : closed.createFolder(subName).getId();
  }
  return closed.getId();
}

/**
 * Handles moving a file to its final destination after logging.
 */
function moveSubmittalToClosed(e: GoogleAppsScriptEvent): any {
  const p = e.parameters || {};
  try {
    const destId = getOrCreateFilingFolder(p.targetFolderId, p.discipline, p.section, p.specTag);
    DriveApp.getFileById(p.fileId).moveTo(DriveApp.getFolderById(destId));
    const newPath = getLocalDrivePath(p.fileId);
    
    const failedCols = p.failedColumns ? JSON.parse(p.failedColumns) : [];
    const emptyFalls = p.emptyFallbacks ? JSON.parse(p.emptyFallbacks) : [];

    const updated = buildSuccessCard(
      p.fileId, p.newFileName, p.fileUrl, newPath, p.stampSubNo, p.itemTitle, p.discipline, p.section, p.specTag, 
      p.targetFolderId, p.logFileId, true, p.projectAbbr, p.action, p.incomingRouting, null,
      p.directRowUrl, failedCols, emptyFalls
    );
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(updated)).setNotification(CardService.newNotification().setText(MESSAGES.SUCCESS_MOVED(DriveApp.getFolderById(destId).getName()))).build();
  } catch (err: any) { return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build(); }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    processSubmission,
    executeIncomingWorkflow,
    executeOutgoingWorkflow,
    getOrCreateFilingFolder,
    getLocalDrivePath
  };
}
