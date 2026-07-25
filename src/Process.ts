/**
 * Generates a sortable key for the row based on Discipline.
 * Combines section/tag, revision, and date into a single string for comparison.
 */
function getRowSortKey(row: any[], discipline: string, headers: string[]): string {
  const padNum = (val: any, len: number) => String(val || "").trim().padStart(len, '0');
  let rev = padNum(row[headers.indexOf("Revision")], 3);
  let rawDate = row[headers.indexOf("Date")];
  let dateStr = "";

  if (rawDate instanceof Date) {
    dateStr = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyMMdd");
  } else {
    dateStr = String(rawDate || "").replace(/\D/g, '').padEnd(6, '0');
  }

  if (discipline === "Architecture") {
    let sec = padNum(row[headers.indexOf("Section")], 6);
    let num = padNum(row[headers.indexOf("Number")], 3);
    return `${sec}-${num}-${rev}-${dateStr}`;
  } else {
    let tag = String(row[headers.indexOf("Spec Tag")] || "").trim().toLowerCase();
    return `${tag}-${rev}-${dateStr}`;
  }
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

    let sectionVal = "";
    let numberVal = "";
    let revisionVal = "";
    let specTagVal = "";

    if (details.discipline === "Architecture") {
      sectionVal = details.section;
      numberVal = details.number;
      revisionVal = details.revision;
    } else {
      specTagVal = details.specTag;
      revisionVal = details.revision;
    }

    const logData = logSheet.getDataRange().getValues();  
    let targetKey = (details.discipline === "Architecture") ? `${sectionVal}-${numberVal}-${revisionVal}` : `${specTagVal}-${revisionVal}`;  
    const groupKey = (details.discipline === "Architecture") ? sectionVal : specTagVal;

    // Establish boundaries of existing data for smart insertion
    let boundedData: any[][] = [];  
    let emptyGapCount = 0;
    for (let i = 0; i < logData.length; i++) {   
      boundedData.push(logData[i]);   
      if (i >= CONFIG.LOG_HEADER_ROW) {   
        let isRowBlank = logData[i].slice(0, 8).every((cell: any) => String(cell).trim() === "");   
        if (String(logData[i][0]).toLowerCase().includes("formula row")) isRowBlank = false;   
        if (isRowBlank) {   
          emptyGapCount++;   
          if (emptyGapCount >= 3) break;   
        } else {   
          emptyGapCount = 0;   
        }   
      }   
    }

    // Build the Contact History Chain and capture previous row for status updating
    let historyColIdx = getColIdx("Contact History");  
    let calcChainColIdx = getColIdx("Calc Contact Chain");  
    let previousChain = "";
    let previousRowSheetIndex: number | null = null;

    for (let i = boundedData.length - 1; i >= CONFIG.LOG_HEADER_ROW; i--) {   
        let row = boundedData[i];   
        let rowKey = (disc === "Architecture") ? `${row[getColIdx("Section")]}-${row[getColIdx("Number")]}-${row[getColIdx("Revision")]}` : `${row[getColIdx("Spec Tag")]}-${row[getColIdx("Revision")]}`;   
        if (rowKey === targetKey) {   
            let histVal = (historyColIdx !== -1) ? String(row[historyColIdx] || "").trim() : "";  
            let calcVal = (calcChainColIdx !== -1) ? String(row[calcChainColIdx] || "").trim() : "";  
            previousChain = histVal ? histVal : calcVal;  
            previousRowSheetIndex = i + 1; // Capture 1-based sheet row index
            break;   
        }   
    }

    const newChain = previousChain ? `${previousChain} ${form.contact}` : form.contact;  
    const actionSuffix = selectedAction.abbr || "";  
    let newFileName = (disc === "Architecture") ? `${targetKey} ${form.title} - ${form.date} ${newChain}${actionSuffix}` : `${targetKey} ${form.vendor} - ${form.date} ${newChain}${actionSuffix}`;

    const ctx = { 
      e, form, p, discipline: disc, logSheet, headers, getColIdx, selectedAction, 
      targetKey, groupKey, newFileName, boundedData, newChain, previousRowSheetIndex,
      sectionVal, numberVal, revisionVal, emptyFallbacks 
    };  
    
    // Branch logic based on whether the action is "Received" (Incoming) or a Review status (Outgoing)
    return form.action === "Received" ? await executeIncomingWorkflow(ctx) : await executeOutgoingWorkflow(ctx);

  } catch (err: any) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(MESSAGES.ERROR_GENERAL(err.message))).build();
  }
}

async function executeIncomingWorkflow(ctx: any): Promise<any> {
  const { e, form, p, discipline, logSheet, headers, getColIdx, selectedAction, targetKey, newFileName, boundedData, newChain, sectionVal, numberVal, revisionVal, emptyFallbacks } = ctx;

  const root = DriveApp.getFolderById(p.targetFolderId);
  const closedId = getOrCreateFilingFolder(p.targetFolderId, discipline, sectionVal, form.specTag);
  const closed = DriveApp.getFolderById(closedId);

  let url = "", blob: GoogleAppsScript.Base.Blob | null = null, id = "";

  if (p.driveFileId) {
    const file = DriveApp.getFileById(p.driveFileId);
    file.moveTo(closed);
    file.setName(newFileName + ".pdf");
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
      if (match) blob = DriveApp.getFileById(form.driveFileUrl.match(/[-\w]{25,}/)[0]).getAs((MimeType as any).PDF);
    }
    if (blob) {   
      const file = closed.createFile(blob.copyBlob().setName(newFileName + ".pdf"));   
      url = file.getUrl();   
      id = file.getId();   
    } 
  }

  if (blob) {
    const templateId = (form.incomingRouting === "To Refer") ? CONFIG.TRANSMITTAL_TEMPLATE_ID : CONFIG.PDF_TEMPLATE_ID;
    try {
      const stamped = await manipulatePdf(blob, form, newFileName, targetKey, templateId);
      stamped.setName(CONFIG.STAMPED_FILE_PREFIX + newFileName + ".pdf");
      root.createFile(stamped); 
    } catch (err: any) { 
      if (err.message === "TEMPLATE_MISSING") { 
        root.createFile(blob.copyBlob().setName(CONFIG.STAMPED_FILE_PREFIX + newFileName + ".pdf"));
      } else { throw err; }
    }
  }

  const payload: Record<string, string> = { "Status": selectedAction.status, "Revision": revisionVal, "Date": form.date, "Contact": form.contact, "Action": form.action, "Notes": form.notes, "Link": url, "Contact History": newChain };
  if (discipline === "Architecture") {
    payload["Section"] = sectionVal; payload["Number"] = numberVal; payload["Title"] = form.title;
  } else {
    payload["Spec Tag"] = form.specTag; payload["Related Tag"] = form.relatedTag; payload["Spec Title"] = form.specTitle; payload["Vendor"] = form.vendor;
  }

  const rowData = new Array(headers.length).fill("");
  for (const [k, v] of Object.entries(payload)) {
    let i = getColIdx(k); if (i !== -1) rowData[i] = v;
  }

  const writeResult = insertSmartRowGapAware(logSheet, headers, rowData, discipline, getRowSortKey(rowData, discipline, headers), boundedData);
  const logSheetId = logSheet.getSheetId();
  const directRowUrl = `https://docs.google.com/spreadsheets/d/${p.logFileId}/edit#gid=${logSheetId}&range=A${writeResult.rowIndex}`;

  const flashData = { 
    fileId: id, 
    targetKey, 
    url, 
    localPath: getLocalDrivePath(id), 
    title: form.title || form.specTitle || "", 
    action: form.action, 
    incomingRouting: form.incomingRouting, 
    projectAbbr: p.projectAbbr,
    directRowUrl: directRowUrl,
    failedColumns: writeResult.failedColumns,
    emptyFallbacks: emptyFallbacks,
    newFileName: newFileName
  };

  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(buildMainCard(e, null, false, flashData))).build();
}

async function executeOutgoingWorkflow(ctx: any): Promise<any> {
  const { form, p, discipline, logSheet, headers, getColIdx, selectedAction, targetKey, newFileName, boundedData, newChain, previousRowSheetIndex, sectionVal, numberVal, revisionVal, emptyFallbacks } = ctx;
  let url = "", path = "", id = "", root = DriveApp.getFolderById(p.targetFolderId);

  if (p.driveFileId) {
    const file = DriveApp.getFileById(p.driveFileId);
    if (file.getParents().hasNext() && file.getParents().next().getId() !== p.targetFolderId) file.moveTo(root);
    file.setName(newFileName + ".pdf");
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
      const file = root.createFile(blob.copyBlob().setName(newFileName + ".pdf"));
      url = file.getUrl(); id = file.getId(); path = getLocalDrivePath(id);
    }
  }

  const payload: Record<string, string> = { "Status": selectedAction.status, "Revision": revisionVal, "Date": form.date, "Contact": form.contact, "Action": form.action, "Notes": form.notes, "Link": url, "Contact History": newChain };
  if (discipline === "Architecture") {
    payload["Section"] = sectionVal; payload["Number"] = numberVal; payload["Title"] = form.title;
  } else {
    payload["Spec Tag"] = form.specTag; payload["Related Tag"] = form.relatedTag; payload["Spec Title"] = form.specTitle; payload["Vendor"] = form.vendor;
  }

  const rowData = new Array(headers.length).fill("");
  for (const [k, v] of Object.entries(payload)) {
    let i = getColIdx(k); if (i !== -1) rowData[i] = v;
  }

  // Update the previous row's Status to "Closed" before inserting the new row
  if (previousRowSheetIndex) {
    const statusColIdx = getColIdx("Status");
    if (statusColIdx !== -1) {
      logSheet.getRange(previousRowSheetIndex, statusColIdx + 1).setValue("Closed");
    }
  }

  const writeResult = insertSmartRowGapAware(logSheet, headers, rowData, discipline, getRowSortKey(rowData, discipline, headers), boundedData);
  const logSheetId = logSheet.getSheetId();
  const directRowUrl = `https://docs.google.com/spreadsheets/d/${p.logFileId}/edit#gid=${logSheetId}&range=A${writeResult.rowIndex}`;

  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(buildSuccessCard(
    id, newFileName, url, path, targetKey, form.title || form.specTitle, discipline, sectionVal, form.specTag, 
    p.targetFolderId, p.logFileId, false, p.projectAbbr, form.action, form.incomingRouting, null,
    directRowUrl, writeResult.failedColumns, emptyFallbacks
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

/**
 * Injects a row into the spreadsheet while maintaining group sorting and handling gaps.
 */
function insertSmartRowGapAware(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  headers: string[],
  rowData: any[],
  discipline: string,
  sortKey: string,
  boundedData: any[][]
): { rowIndex: number; failedColumns: string[] } {
  const getGroupKeyFromRow = (row: any[]) => {
    if (discipline === "Architecture") {
      const secIdx = headers.indexOf("Section");
      const numIdx = headers.indexOf("Number");
      let sec = String(secIdx !== -1 ? row[secIdx] : "").trim();
      let num = String(numIdx !== -1 ? row[numIdx] : "").trim();
      if (/^\d+$/.test(sec)) sec = sec.padStart(6, '0');
      if (/^\d+$/.test(num)) num = num.padStart(3, '0');
      return `${sec}-${num}`.toLowerCase();
    } else {
      const tagIdx = headers.indexOf("Spec Tag");
      let tag = String(tagIdx !== -1 ? row[tagIdx] : "").trim();
      return tag.toLowerCase();
    }
  };

  let groups: Array<{ val: string; start: number; end: number; rows: Array<{ index: number; key: string }> }> = [];
  let currentGroup: { val: string; start: number; end: number; rows: Array<{ index: number; key: string }> } | null = null;
  let firstDataRowIdx = -1;
  const normalizedTargetGroupKey = getGroupKeyFromRow(rowData);

  for (let i = CONFIG.LOG_HEADER_ROW; i < boundedData.length; i++) {
    let row = boundedData[i]; if (String(row[0]).toLowerCase().includes("formula row")) continue;
    let isRowBlank = row.slice(0, 8).every((cell: any) => String(cell).trim() === "");  
    if (isRowBlank) { if (currentGroup) { groups.push(currentGroup); currentGroup = null; } continue; }
    
    let rowGroupVal = getGroupKeyFromRow(row);
    if (rowGroupVal && rowGroupVal !== "-") {  
      if (firstDataRowIdx === -1) firstDataRowIdx = i;  
      if (!currentGroup) { 
        currentGroup = { val: rowGroupVal, start: i, end: i, rows: [] }; 
      } else if (currentGroup.val !== rowGroupVal) { 
        groups.push(currentGroup); 
        currentGroup = { val: rowGroupVal, start: i, end: i, rows: [] }; 
      } else { 
        currentGroup.end = i; 
      }  
      currentGroup.rows.push({ index: i, key: getRowSortKey(row, discipline, headers) });  
    } else if (currentGroup) { 
      groups.push(currentGroup); 
      currentGroup = null; 
    }
  }
  if (currentGroup) groups.push(currentGroup);

  const targetGroup = groups.find(g => g.val === normalizedTargetGroupKey);
  let finalRowIndex = -1;
  if (targetGroup) {
    let insertAfterIdx = targetGroup.start - 1;
    for (let r of targetGroup.rows) { if (sortKey.localeCompare(r.key) >= 0) insertAfterIdx = r.index; }
    sheet.insertRowAfter(insertAfterIdx + 1);
    finalRowIndex = insertAfterIdx + 2;
  } else {
    let insertAfterRow1Based = firstDataRowIdx !== -1 ? firstDataRowIdx : CONFIG.LOG_HEADER_ROW;
    for (let g of groups) { if (normalizedTargetGroupKey.localeCompare(g.val) > 0) insertAfterRow1Based = g.end + 1; }
    sheet.insertRowAfter(insertAfterRow1Based);  
    let newRowIndex = insertAfterRow1Based + 1;
    if (insertAfterRow1Based >= firstDataRowIdx && firstDataRowIdx !== -1) { sheet.insertRowBefore(newRowIndex); newRowIndex++; }
    finalRowIndex = newRowIndex;
    let isRowBelowBlank = false; let dataRowBelow = boundedData[insertAfterRow1Based];   
    if (!dataRowBelow || dataRowBelow.slice(0, 8).every((cell: any) => String(cell).trim() === "")) isRowBelowBlank = true;  
    if (!isRowBelowBlank) sheet.insertRowAfter(finalRowIndex);
  }

  let failedColumns: string[] = [];
  try {
    sheet.getRange(finalRowIndex, 1, 1, headers.length).setValues([rowData]);
  } catch (err) {
    failedColumns = setValuesCellByCell(sheet, finalRowIndex, headers, rowData);
  }

  return { rowIndex: finalRowIndex, failedColumns: failedColumns };
}

function setValuesCellByCell(sheet: GoogleAppsScript.Spreadsheet.Sheet, rowIndex: number, headers: string[], rowData: any[]): string[] {
  const failedColumns: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const colName = headers[i];
    const cellValue = rowData[i];
    try {
      sheet.getRange(rowIndex, i + 1).setValue(cellValue);
    } catch (err: any) {
      console.warn(`Failed to write cell at row ${rowIndex}, col ${i+1} (${colName}): ${err.message}`);
      failedColumns.push(colName);
    }
  }
  return failedColumns;
}
