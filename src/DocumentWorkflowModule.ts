/// <reference path="./types.ts" />
/**
 * @file DocumentWorkflowModule.ts
 * @description Orchestration application service for submittal document workflows.
 *
 * Coordinates file retrieval, Drive storage filing, spreadsheet row insertion, PDF stamping,
 * status transitions, and direct row link generation for incoming and outgoing submittals.
 */

declare var require: any;

  try {
    const _ow = eval('require("./OutgoingWorkflow")');
    if (_ow && _ow.OutgoingWorkflow && typeof OutgoingWorkflow === "undefined") {
      (globalThis as any).OutgoingWorkflow = _ow.OutgoingWorkflow;
    }
  } catch (e) {}

if (typeof require !== "undefined") {
  try {
    const _wla = eval('require("./WriteLogAction")');
    if (_wla && _wla.WriteLogAction && typeof WriteLogAction === "undefined") {
      (globalThis as any).WriteLogAction = _wla.WriteLogAction;
    }
  } catch (e) {}
  try {
    const _wfr = eval('require("./WorkflowRunner")');
    if (_wfr && _wfr.WorkflowRunner && typeof WorkflowRunner === "undefined") {
      (globalThis as any).WorkflowRunner = _wfr.WorkflowRunner;
    }
  } catch (e) {}
  try {
    const _ipa = eval('require("./InsertPagesAction")');
    if (_ipa && _ipa.InsertPagesAction && typeof InsertPagesAction === "undefined") {
      (globalThis as any).InsertPagesAction = _ipa.InsertPagesAction;
    }
  } catch (e) {}
  try {
    const _dls = eval('require("./DocumentLogStrategy")');
    const _wr = eval('require("./WorkflowRunner")');
    if (_wr) {
      if (_wr.WorkflowRunner && typeof WorkflowRunner === "undefined") {
        (globalThis as any).WorkflowRunner = _wr.WorkflowRunner;
      }
      if (_wr.MoveDocumentAction && typeof MoveDocumentAction === "undefined") {
        (globalThis as any).MoveDocumentAction = _wr.MoveDocumentAction;
      }
      if (_wr.RenameDocumentAction && typeof RenameDocumentAction === "undefined") {
        (globalThis as any).RenameDocumentAction = _wr.RenameDocumentAction;
      }
    }
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
 * Resolves execution policy settings based on the specified workflow action string.
 *
 * Incoming actions ("Received") trigger CSI subfolder filing and PDF stamping without updating past rows.
 * Outgoing actions trigger previous row status updates to "Closed".
 *
 * @param action - The workflow action string (e.g., "Received", "Reviewed", "Referred").
 * @returns `WorkflowActionPolicy` containing execution instructions.
 */
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

/**
 * Factory function returning the appropriate `DocumentLogStrategy` implementation for a given document.
 *
 * @param doc - The `ValidatedDocument` instance.
 * @returns `FFESubmittalStrategy` for FF&E discipline or `ArchitectureSubmittalStrategy` for Architecture.
 */
export function getDocumentLogStrategy(doc: ValidatedDocument): DocumentLogStrategy {
  const details = doc ? doc.disciplineDetails : null;
  if (details && details.discipline === "FF&E") {
    return new FFESubmittalStrategy();
  }
  return new ArchitectureSubmittalStrategy();
}

/**
 * Extracts the primary document title from a validated document based on discipline details.
 *
 * @param doc - The `ValidatedDocument` instance.
 * @returns Document title string or empty string.
 */
export function getDocumentTitle(doc: ValidatedDocument): string {
  const details = doc ? doc.disciplineDetails : null;
  if (!details) return "";
  return details.discipline === "Architecture" ? details.title : details.specTitle;
}

/**
 * Core workflow orchestrator service that executes submittal filing, spreadsheet logging, and PDF stamping.
 */
export class DocumentWorkflowModule {
  /**
   * Executes the end-to-end submittal workflow.
   *
   * Resolves the source document blob (from email attachment, Google Drive URL, or Drive file ID),
   * files the blob via `DriveFilingRepository`, appends the entry to the spreadsheet via `LogRepository`,
   * stamps cover sheets via `PdfDocumentService` if required by action policy, and constructs the result object.
   *
   * @param input - `DocumentWorkflowInput` containing validated document data, target folders, and repository references.
   * @returns A Promise resolving to `DocumentWorkflowResult` containing output file IDs, links, and log row URLs.
   */
  static async executeWorkflow(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const action = input.validatedDoc.action || (input.selectedAction ? input.selectedAction.action : "");
    const policy = getActionPolicy(action);

    if (policy.direction === "outgoing") {
      const outgoingWf = (globalThis as any).OutgoingWorkflow || (typeof OutgoingWorkflow !== "undefined" ? OutgoingWorkflow : null);
      if (outgoingWf && typeof outgoingWf.execute === "function") {
        return await outgoingWf.execute(input);
      }
    }

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
      } else if (input.driveFileUrl && driveApp) {
        const urlMatch = input.driveFileUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/) ||
                         input.driveFileUrl.match(/[?&]id=([a-zA-Z0-9_-]{25,})/) ||
                         input.driveFileUrl.match(/([a-zA-Z0-9_-]{25,})/);
        const extractedId = urlMatch ? (urlMatch[1] || urlMatch[0]) : null;
        if (extractedId) {
          blob = driveApp.getFileById(extractedId).getAs((typeof MimeType !== "undefined" ? MimeType : (globalThis as any).MimeType || {}).PDF || "application/pdf");
        }
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

    const writeLogAction = input.writeLogAction || new (typeof WriteLogAction !== "undefined" ? WriteLogAction : (globalThis as any).WriteLogAction)();
    const runner = typeof WorkflowRunner !== "undefined" ? WorkflowRunner : (globalThis as any).WorkflowRunner;
    const appendResult = await runner.runAction(writeLogAction, {
      spreadsheetId: input.logFileId,
      document: input.validatedDoc,
      strategy: strategy,
      identityData: strategy.getIdentityData(input.validatedDoc),
      options: {
        link: filingResult.url,
        status: input.selectedAction.status,
        actionAbbr: input.selectedAction.abbr,
        updatePreviousStatus: policy.updatePreviousStatus,
        previousRowStatus: policy.previousRowStatus
      },
      logRepository: input.logRepository || defaultLogRepository
    });

    let finalFileId = filingResult.fileId;

    if (filingResult.fileId && driveApp) {
      driveApp.getFileById(filingResult.fileId).setName(appendResult.newFileName + ".pdf");
    }

    if (policy.stampPdf && blob && driveApp) {
      const targetFolder = driveApp.getFolderById(input.targetFolderId);
      const templateId = (input.incomingRouting === "To Refer")
        ? (typeof CONFIG !== "undefined" ? CONFIG.TRANSMITTAL_TEMPLATE_ID : "")
        : (typeof CONFIG !== "undefined" ? CONFIG.PDF_TEMPLATE_ID : "");

      const titleVal = getDocumentTitle(input.validatedDoc);

      const insertAction = input.insertPagesAction || new (typeof InsertPagesAction !== "undefined" ? InsertPagesAction : (globalThis as any).InsertPagesAction)();
      const stamped = await insertAction.execute({
        sourceBlob: blob,
        data: { action, title: titleVal, incomingRouting: input.incomingRouting },
        options: {
          newFileName: appendResult.newFileName,
          stampSubmittalNo: appendResult.targetKey,
          templateId: templateId
        },
        pdfDocumentService: input.pdfDocumentService || defaultPdfDocumentService
      });

      const stampedPrefix = typeof CONFIG !== "undefined" && CONFIG.STAMPED_FILE_PREFIX ? CONFIG.STAMPED_FILE_PREFIX : "STAMPED_";
      stamped.setName(stampedPrefix + appendResult.newFileName + ".pdf");
      const stampedCreatedFile = targetFolder.createFile(stamped);
      if (stampedCreatedFile && typeof stampedCreatedFile.getId === "function") {
        const sId = stampedCreatedFile.getId();
        if (sId) finalFileId = sId;
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
      fileId: finalFileId,
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
