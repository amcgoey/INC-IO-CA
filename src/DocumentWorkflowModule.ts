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

export class DocumentWorkflowModule {
  static async executeWorkflow(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const action = input.validatedDoc.action || (input.selectedAction ? input.selectedAction.action : "");
    const policy = getActionPolicy(action);

    const discDetails = input.validatedDoc.disciplineDetails;
    const strategy: DocumentLogStrategy = (discDetails.discipline === "Architecture")
      ? new ArchitectureSubmittalStrategy()
      : new FFESubmittalStrategy();

    let blob: GoogleAppsScript.Base.Blob | null = null;
    if (!input.driveFileId) {
      if (input.fileSource === "Email Attachment" && input.messageId && input.attachmentName) {
        const msg = GmailApp.getMessageById(input.messageId);
        const att = msg.getAttachments().find(a => a.getName() === input.attachmentName);
        if (att) blob = att.copyBlob();
      } else if (input.fileSource === "Google Drive URL" && input.driveFileUrl) {
        const match = input.driveFileUrl.match(/[-w]{25,}/);
        if (match) blob = DriveApp.getFileById(match[0]).getAs((MimeType as any).PDF);
      }
    } else {
      blob = DriveApp.getFileById(input.driveFileId).getBlob();
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

    if (filingResult.fileId) {
      DriveApp.getFileById(filingResult.fileId).setName(appendResult.newFileName + ".pdf");
    }

    if (policy.stampPdf && blob) {
      const pdfService = input.pdfDocumentService || defaultPdfDocumentService;
      const root = DriveApp.getFolderById(input.targetFolderId);
      const templateId = (input.incomingRouting === "To Refer")
        ? CONFIG.TRANSMITTAL_TEMPLATE_ID
        : CONFIG.PDF_TEMPLATE_ID;

      const titleVal = discDetails.discipline === "Architecture" ? discDetails.title : discDetails.specTitle;

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
        stamped.setName(CONFIG.STAMPED_FILE_PREFIX + appendResult.newFileName + ".pdf");
        root.createFile(stamped);
      } catch (err: any) {
        if (err.message === "TEMPLATE_MISSING") {
          root.createFile(blob.copyBlob().setName(CONFIG.STAMPED_FILE_PREFIX + appendResult.newFileName + ".pdf"));
        } else {
          throw err;
        }
      }
    }

    let sheetId = input.logSheetId;
    if (sheetId === undefined || sheetId === null) {
      try {
        const openSs = SpreadsheetApp.openById(input.logFileId);
        const logSheet = openSs.getSheetByName(CONFIG.LOG_SHEET_NAME);
        sheetId = logSheet ? logSheet.getSheetId() : 0;
      } catch (e) {
        sheetId = 0;
      }
    }

    const directRowUrl = `https://docs.google.com/spreadsheets/d/${input.logFileId}/edit#gid=${sheetId}&range=A${appendResult.rowIndex}`;
    const itemTitle = discDetails.discipline === "Architecture" ? discDetails.title : discDetails.specTitle;

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
    DocumentWorkflowModule
  };
}
