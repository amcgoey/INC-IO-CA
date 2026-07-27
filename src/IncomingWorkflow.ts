/// <reference path="./types.ts" />
/**
 * @file IncomingWorkflow.ts
 * @description Incoming submittal dual-path workflow execution service ("Received" action).
 *
 * Implements the dual-path workflow using WorkflowRunner action primitives:
 * 1. Writes initial receiving log record via WriteLogAction to derive calculated file name.
 * 2. Saves pristine untouched OriginalDocument to Submittals\Closed\<Subfolder>\<Calculated File Name>.pdf via MoveDocumentAction.
 * 3. Duplicates OriginalDocument to create ReviewDocument via DuplicateDocumentAction.
 * 4. Prepends CoverPageDocument onto ReviewDocument via InsertPagesAction.
 * 5. Applies [Filename Prefix] (STAMPED_) and places ReviewDocument in Submittals\ root via MoveDocumentAction.
 */

declare var require: any;

if (typeof require !== "undefined") {
  try {
    const _wla = eval('require("./WriteLogAction")');
    if (_wla && _wla.WriteLogAction && typeof WriteLogAction === "undefined") {
      (globalThis as any).WriteLogAction = _wla.WriteLogAction;
    }
  } catch (e) {}
  try {
    const _dda = eval('require("./DuplicateDocumentAction")');
    if (_dda && _dda.DuplicateDocumentAction && typeof DuplicateDocumentAction === "undefined") {
      (globalThis as any).DuplicateDocumentAction = _dda.DuplicateDocumentAction;
    }
  } catch (e) {}
  try {
    const _ipa = eval('require("./InsertPagesAction")');
    if (_ipa && _ipa.InsertPagesAction && typeof InsertPagesAction === "undefined") {
      (globalThis as any).InsertPagesAction = _ipa.InsertPagesAction;
    }
  } catch (e) {}
  try {
    const _wfr = eval('require("./WorkflowRunner")');
    if (_wfr) {
      if (_wfr.WorkflowRunner && typeof WorkflowRunner === "undefined") {
        (globalThis as any).WorkflowRunner = _wfr.WorkflowRunner;
      }
      if (_wfr.MoveDocumentAction && typeof MoveDocumentAction === "undefined") {
        (globalThis as any).MoveDocumentAction = _wfr.MoveDocumentAction;
      }
      if (_wfr.RenameDocumentAction && typeof RenameDocumentAction === "undefined") {
        (globalThis as any).RenameDocumentAction = _wfr.RenameDocumentAction;
      }
    }
  } catch (e) {}
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
  try {
    const _dwm = eval('require("./DocumentWorkflowModule")');
    if (_dwm) {
      if (_dwm.getActionPolicy && typeof getActionPolicy === "undefined") {
        (globalThis as any).getActionPolicy = _dwm.getActionPolicy;
      }
      if (_dwm.getDocumentLogStrategy && typeof getDocumentLogStrategy === "undefined") {
        (globalThis as any).getDocumentLogStrategy = _dwm.getDocumentLogStrategy;
      }
      if (_dwm.getDocumentTitle && typeof getDocumentTitle === "undefined") {
        (globalThis as any).getDocumentTitle = _dwm.getDocumentTitle;
      }
    }
  } catch (e) {}
}

declare var defaultDriveFilingRepository: DriveFilingRepository;
declare var defaultLogRepository: LogRepository;
declare var defaultPdfDocumentService: PdfDocumentService;
declare var defaultDuplicateDocumentAction: DuplicateDocumentAction;

export class IncomingWorkflow {
  /**
   * Resolves source document blob from Drive file ID, email attachment, or Drive URL.
   */
  static resolveSourceBlob(input: DocumentWorkflowInput): GoogleAppsScript.Base.Blob | null {
    const driveApp = input.driveApp || (typeof DriveApp !== "undefined" ? DriveApp : null);
    const gmailApp = input.gmailApp || (typeof GmailApp !== "undefined" ? GmailApp : null);

    if (input.driveFileId && driveApp) {
      return driveApp.getFileById(input.driveFileId).getBlob();
    }

    if (input.fileSource === "Email Attachment" && input.messageId && input.attachmentName && gmailApp) {
      const msg = gmailApp.getMessageById(input.messageId);
      const att = msg ? msg.getAttachments().find((a: any) => a.getName() === input.attachmentName) : null;
      if (att) return att.getBlob();
    }

    if (input.driveFileUrl && driveApp) {
      const urlMatch = input.driveFileUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/) ||
                       input.driveFileUrl.match(/[?&]id=([a-zA-Z0-9_-]{25,})/) ||
                       input.driveFileUrl.match(/([a-zA-Z0-9_-]{25,})/);
      const extractedId = urlMatch ? (urlMatch[1] || urlMatch[0]) : null;
      if (extractedId) {
        return driveApp.getFileById(extractedId).getAs((typeof MimeType !== "undefined" ? MimeType : (globalThis as any).MimeType || {}).PDF || "application/pdf");
      }
    }

    return null;
  }

  /**
   * Constructs direct Google Sheets row edit URL using CONFIG.LOG_SHEET_NAME.
   */
  static buildDirectRowUrl(logFileId: string, rowIndex: number, sheetId?: number | null, spreadsheetApp?: any): string {
    let resolvedSheetId = sheetId;
    if ((resolvedSheetId === undefined || resolvedSheetId === null) && spreadsheetApp) {
      try {
        const openSs = spreadsheetApp.openById(logFileId);
        const sheetName = typeof CONFIG !== "undefined" && CONFIG.LOG_SHEET_NAME ? CONFIG.LOG_SHEET_NAME : "";
        const logSheet = sheetName ? openSs.getSheetByName(sheetName) : (openSs ? openSs.getSheets()[0] : null);
        resolvedSheetId = logSheet ? logSheet.getSheetId() : 0;
      } catch (e) {
        resolvedSheetId = 0;
      }
    } else if (resolvedSheetId === undefined || resolvedSheetId === null) {
      resolvedSheetId = 0;
    }

    return `https://docs.google.com/spreadsheets/d/${logFileId}/edit#gid=${resolvedSheetId}&range=A${rowIndex}`;
  }

  /**
   * Executes the incoming submittal dual-path workflow.
   *
   * @param input - DocumentWorkflowInput containing validated doc, selected action, target folders, and context options.
   * @returns Resolves to DocumentWorkflowResult.
   */
  static async execute(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const action = input.validatedDoc.action || (input.selectedAction ? input.selectedAction.action : "");
    const policy: WorkflowActionPolicy = (typeof getActionPolicy !== "undefined" ? getActionPolicy(action) : {
      direction: "incoming",
      stampPdf: true,
      updatePreviousStatus: false
    });

    const strategy = input.strategy || (typeof getDocumentLogStrategy !== "undefined" ? getDocumentLogStrategy(input.validatedDoc) : new ArchitectureSubmittalStrategy());
    const runner = typeof WorkflowRunner !== "undefined" ? WorkflowRunner : (globalThis as any).WorkflowRunner;

    const driveApp = input.driveApp || (typeof DriveApp !== "undefined" ? DriveApp : null);
    const spreadsheetApp = input.spreadsheetApp || (typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp : null);
    const driveFilingRepo = input.driveFilingRepository || (typeof defaultDriveFilingRepository !== "undefined" ? defaultDriveFilingRepository : null);
    const logRepo = input.logRepository || (typeof defaultLogRepository !== "undefined" ? defaultLogRepository : null);
    const moveAction = new (typeof MoveDocumentAction !== "undefined" ? MoveDocumentAction : (globalThis as any).MoveDocumentAction)();

    // 1. Resolve source document blob
    const blob = this.resolveSourceBlob(input);

    // Step 1: Write initial receiving log entry via WriteLogAction to derive calculated file name
    const writeLogAction = input.writeLogAction || new (typeof WriteLogAction !== "undefined" ? WriteLogAction : (globalThis as any).WriteLogAction)();
    const appendResult = await runner.runAction(writeLogAction, {
      spreadsheetId: input.logFileId,
      document: input.validatedDoc,
      strategy: strategy,
      identityData: strategy.getIdentityData(input.validatedDoc),
      options: {
        link: input.driveFileId ? ("http://drive.google.com/" + input.driveFileId) : "",
        status: input.selectedAction?.status || "",
        actionAbbr: input.selectedAction?.abbr || "",
        updatePreviousStatus: policy.updatePreviousStatus,
        previousRowStatus: policy.previousRowStatus
      },
      logRepository: logRepo
    });

    // Path 1: Save pristine untouched OriginalDocument to Submittals\Closed\<Subfolder>\<Calculated File Name>.pdf via MoveDocumentAction
    const closedSubfolderPath = strategy.getFilingSubfolders ? strategy.getFilingSubfolders(input.validatedDoc) : undefined;
    const originalFileName = appendResult.newFileName + ".pdf";

    const origContext: DocumentActionContext = await runner.runAction(moveAction, {
      fileId: input.driveFileId,
      blob: blob || undefined,
      targetFolderId: input.targetFolderId,
      subfolderPath: closedSubfolderPath,
      newFileName: originalFileName,
      driveFilingRepository: driveFilingRepo
    });

    // Path 2: Duplicate OriginalDocument to create ReviewDocument via DuplicateDocumentAction
    const dupAction = input.duplicateDocumentAction || new (typeof DuplicateDocumentAction !== "undefined" ? DuplicateDocumentAction : (globalThis as any).DuplicateDocumentAction)();
    const dupContext: DocumentActionContext = await runner.runAction(dupAction, {
      blob: blob || undefined,
      fileId: origContext.fileId,
      driveFilingRepository: driveFilingRepo
    });

    let reviewBlob: GoogleAppsScript.Base.Blob | null = dupContext.blob || blob;
    if (!reviewBlob && driveApp && origContext.fileId) {
      reviewBlob = driveApp.getFileById(origContext.fileId).getBlob();
    }

    // Step 4: Prepend CoverPageDocument onto ReviewDocument via InsertPagesAction (if policy.stampPdf)
    let stampedBlob = reviewBlob;
    if (policy.stampPdf && reviewBlob) {
      const templateId = (input.incomingRouting === "To Refer")
        ? (typeof CONFIG !== "undefined" ? CONFIG.TRANSMITTAL_TEMPLATE_ID : "")
        : (typeof CONFIG !== "undefined" ? CONFIG.PDF_TEMPLATE_ID : "");

      const titleVal = typeof getDocumentTitle !== "undefined" ? getDocumentTitle(input.validatedDoc) : "";
      const insertAction = input.insertPagesAction || new (typeof InsertPagesAction !== "undefined" ? InsertPagesAction : (globalThis as any).InsertPagesAction)();

      stampedBlob = await runner.runAction(insertAction, {
        sourceBlob: reviewBlob,
        data: { action, title: titleVal, incomingRouting: input.incomingRouting },
        options: {
          newFileName: appendResult.newFileName,
          stampSubmittalNo: appendResult.targetKey,
          templateId: templateId
        },
        pdfDocumentService: input.pdfDocumentService || (typeof defaultPdfDocumentService !== "undefined" ? defaultPdfDocumentService : null)
      });
    }

    // Step 5: Apply STAMPED_ prefix and place ReviewDocument in Submittals\ root folder via MoveDocumentAction
    const stampedPrefix = typeof CONFIG !== "undefined" && CONFIG.STAMPED_FILE_PREFIX ? CONFIG.STAMPED_FILE_PREFIX : "STAMPED_";
    const reviewFileName = stampedPrefix + appendResult.newFileName + ".pdf";
    if (stampedBlob && typeof stampedBlob.setName === "function") {
      stampedBlob.setName(reviewFileName);
    }

    const reviewContext: DocumentActionContext = await runner.runAction(moveAction, {
      blob: stampedBlob || undefined,
      targetFolderId: input.targetFolderId,
      subfolderPath: undefined,
      newFileName: reviewFileName,
      driveFilingRepository: driveFilingRepo
    });

    const directRowUrl = this.buildDirectRowUrl(input.logFileId, appendResult.rowIndex, input.logSheetId, spreadsheetApp);
    const itemTitle = typeof getDocumentTitle !== "undefined" ? getDocumentTitle(input.validatedDoc) : "";

    return {
      fileId: origContext.fileId || reviewContext.fileId || "",
      targetKey: appendResult.targetKey,
      url: origContext.url || reviewContext.url || "",
      localPath: origContext.localPath || reviewContext.localPath || "",
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
    IncomingWorkflow
  };
}

(globalThis as any).IncomingWorkflow = IncomingWorkflow;
