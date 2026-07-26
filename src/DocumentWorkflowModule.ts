// src/DocumentWorkflowModule.ts

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

export function getActionPolicy(action: string): WorkflowActionPolicy {
  if (action === "Received") {
    return {
      direction: "incoming",
      useCsiSubfolder: true,
      stampPdf: true,
      updatePreviousStatus: false
    };
  }
  return {
    direction: "outgoing",
    useCsiSubfolder: false,
    stampPdf: false,
    updatePreviousStatus: true,
    previousRowStatus: "Closed"
  };
}

export function getDocumentLogStrategy(doc: ValidatedDocument): DocumentLogStrategy {
  const details = doc ? doc.disciplineDetails : null;
  if (details && details.discipline === "FF&E") {
    return new FFESubmittalStrategy();
  }
  return new ArchitectureSubmittalStrategy();
}

export function getDocumentTitle(doc: ValidatedDocument): string {
  const details = doc ? doc.disciplineDetails : null;
  if (!details) return "";
  return details.discipline === "Architecture" ? details.title : details.specTitle;
}

export class DocumentWorkflowModule {
  static async executeWorkflow(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const action = input.validatedDoc.action || (input.selectedAction ? input.selectedAction.action : "");
    const policy = getActionPolicy(action);

    const strategy = input.strategy || getDocumentLogStrategy(input.validatedDoc);

    const driveApp = input.driveApp || (typeof DriveApp !== "undefined" ? DriveApp : null);
    const gmailApp = input.gmailApp || (typeof GmailApp !== "undefined" ? GmailApp : null);
    const spreadsheetApp = input.spreadsheetApp || (typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp : null);

    let blob: GoogleAppsScript.Base.Blob | null = null;
    if (!input.driveFileId) {
      if (input.fileSource === "Email Attachment" && input.messageId && input.attachmentName && gmailApp) {
        const msg = gmailApp.getMessageById(input.messageId);
        const att = msg ? msg.getAttachments().find((a: any) => a.getName() === input.attachmentName) : null;
        if (att) blob = att.copyBlob();
      } else if (input.fileSource === "Google Drive URL" && input.driveFileUrl && driveApp) {
        const match = input.driveFileUrl.match(/([a-zA-Z0-9_-]{25,})/);
        if (match) blob = driveApp.getFileById(match[0]).getAs((typeof MimeType !== "undefined" ? MimeType : (globalThis as any).MimeType || {}).PDF || "application/pdf");
      }
    } else if (driveApp) {
      blob = driveApp.getFileById(input.driveFileId).getBlob();
    }

    const subfolderPath = (policy.useCsiSubfolder && strategy.getFilingSubfolders)
      ? strategy.getFilingSubfolders(input.validatedDoc)
      : undefined;

    const driveFilingRepo = input.driveFilingRepository || defaultDriveFilingRepository;
    const filingResult = driveFilingRepo.fileDocument(
      { fileId: input.driveFileId, blob: blob || undefined },
      { targetFolderId: input.targetFolderId, subfolderPath: subfolderPath }
    );

    const logRepo = input.logRepository || defaultLogRepository;
    const appendResult = logRepo.appendDocument(
      input.logFileId,
      input.validatedDoc,
      strategy,
      {
        link: filingResult.url,
        status: input.selectedAction.status,
        actionAbbr: input.selectedAction.abbr,
        updatePreviousStatus: policy.updatePreviousStatus,
        previousRowStatus: policy.previousRowStatus
      }
    );

    if (filingResult.fileId && driveApp) {
      driveApp.getFileById(filingResult.fileId).setName(appendResult.newFileName + ".pdf");
    }

    if (policy.stampPdf && blob && driveApp) {
      const pdfService = input.pdfDocumentService || defaultPdfDocumentService;
      const destinationFolderId = filingResult.folderId || input.targetFolderId;
      const targetFolder = driveApp.getFolderById(destinationFolderId);
      const templateId = (input.incomingRouting === "To Refer")
        ? (typeof CONFIG !== "undefined" ? CONFIG.TRANSMITTAL_TEMPLATE_ID : "")
        : (typeof CONFIG !== "undefined" ? CONFIG.PDF_TEMPLATE_ID : "");

      const titleVal = getDocumentTitle(input.validatedDoc);

      try {
        const stamped = await pdfService.stampSubmittal(
          blob,
          { action, title: titleVal, incomingRouting: input.incomingRouting },
          {
            newFileName: appendResult.newFileName,
            stampSubmittalNo: appendResult.targetKey,
            templateId: templateId
          }
        );
        const stampedPrefix = typeof CONFIG !== "undefined" && CONFIG.STAMPED_FILE_PREFIX ? CONFIG.STAMPED_FILE_PREFIX : "STAMPED_";
        stamped.setName(stampedPrefix + appendResult.newFileName + ".pdf");
        targetFolder.createFile(stamped);
      } catch (err: any) {
        if (err.message === "TEMPLATE_MISSING") {
          const stampedPrefix = typeof CONFIG !== "undefined" && CONFIG.STAMPED_FILE_PREFIX ? CONFIG.STAMPED_FILE_PREFIX : "STAMPED_";
          targetFolder.createFile(blob.copyBlob().setName(stampedPrefix + appendResult.newFileName + ".pdf"));
        } else {
          throw err;
        }
      }
    }

    let sheetId = input.logSheetId;
    if ((sheetId === undefined || sheetId === null) && spreadsheetApp) {
      try {
        const openSs = spreadsheetApp.openById(input.logFileId);
        const sheetName = typeof CONFIG !== "undefined" && CONFIG.LOG_SHEET_NAME ? CONFIG.LOG_SHEET_NAME : "Submittals Log";
        const logSheet = openSs ? openSs.getSheetByName(sheetName) : null;
        sheetId = logSheet ? logSheet.getSheetId() : 0;
      } catch (e) {
        sheetId = 0;
      }
    } else if (sheetId === undefined || sheetId === null) {
      sheetId = 0;
    }

    const directRowUrl = `https://docs.google.com/spreadsheets/d/${input.logFileId}/edit#gid=${sheetId}&range=A${appendResult.rowIndex}`;
    const itemTitle = getDocumentTitle(input.validatedDoc);

    return {
      fileId: filingResult.fileId,
      targetKey: appendResult.targetKey,
      url: filingResult.url,
      localPath: filingResult.localPath,
      title: itemTitle || "",
      action: action,
      incomingRouting: input.incomingRouting,
      projectAbbr: input.projectAbbr,
      directRowUrl: directRowUrl,
      failedColumns: appendResult.failedColumns || [],
      emptyFallbacks: input.emptyFallbacks || [],
      newFileName: appendResult.newFileName
    };
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getActionPolicy,
    getDocumentLogStrategy,
    getDocumentTitle,
    DocumentWorkflowModule
  };
}
