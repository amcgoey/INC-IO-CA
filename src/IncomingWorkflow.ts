/// <reference path="./types.ts" />
/**
 * @file IncomingWorkflow.ts
 * @description Incoming submittal workflow execution service ("Received" action).
 *
 * Implements the dual-path workflow:
 * 1. Saves untouched pristine OriginalDocument to Submittals\Closed\<Subfolder>\.
 * 2. Writes initial receiving record to the Sheet Log.
 * 3. Duplicates OriginalDocument to create ReviewDocument.
 * 4. Prepends CoverPageDocument onto ReviewDocument via InsertPagesAction.
 * 5. Applies [Filename Prefix] (STAMPED_) and places ReviewDocument in Submittals\ root.
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
    const writeLogAction = input.writeLogAction || new (typeof WriteLogAction !== "undefined" ? WriteLogAction : (globalThis as any).WriteLogAction)();
    const runner = typeof WorkflowRunner !== "undefined" ? WorkflowRunner : (globalThis as any).WorkflowRunner;

    const driveApp = input.driveApp || (typeof DriveApp !== "undefined" ? DriveApp : null);
    const gmailApp = input.gmailApp || (typeof GmailApp !== "undefined" ? GmailApp : null);
    const spreadsheetApp = input.spreadsheetApp || (typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp : null);
    const driveFilingRepo = input.driveFilingRepository || (typeof defaultDriveFilingRepository !== "undefined" ? defaultDriveFilingRepository : null);

    // 1. Resolve source document blob if needed
    let blob: GoogleAppsScript.Base.Blob | null = null;
    if (!input.driveFileId) {
      if (input.fileSource === "Email Attachment" && input.messageId && input.attachmentName && gmailApp) {
        const msg = gmailApp.getMessageById(input.messageId);
        const att = msg ? msg.getAttachments().find((a: any) => a.getName() === input.attachmentName) : null;
        if (att) {
          const dupAction = input.duplicateDocumentAction || (typeof defaultDuplicateDocumentAction !== "undefined" ? defaultDuplicateDocumentAction : new (typeof DuplicateDocumentAction !== "undefined" ? DuplicateDocumentAction : (globalThis as any).DuplicateDocumentAction)());
          const dupRes = await dupAction.execute({ blob: att.getBlob() });
          blob = dupRes.blob || null;
        }
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

    // Path 1: Save untouched OriginalDocument to Submittals\Closed\<Subfolder>\
    const closedSubfolderPath = strategy.getFilingSubfolders ? strategy.getFilingSubfolders(input.validatedDoc) : undefined;
    let originalFilingResult: FilingResult = {
      fileId: input.driveFileId || "",
      url: "",
      localPath: "",
      folderId: input.targetFolderId
    };

    if (driveFilingRepo) {
      originalFilingResult = driveFilingRepo.fileDocument(
        { fileId: input.driveFileId, blob: blob || undefined },
        { targetFolderId: input.targetFolderId, subfolderPath: closedSubfolderPath }
      );
    }

    // Step 2: Write initial receiving log entry
    const appendResult = await runner.runAction(writeLogAction, {
      spreadsheetId: input.logFileId,
      document: input.validatedDoc,
      strategy: strategy,
      identityData: strategy.getIdentityData(input.validatedDoc),
      options: {
        link: originalFilingResult.url,
        status: input.selectedAction?.status || "",
        actionAbbr: input.selectedAction?.abbr || "",
        updatePreviousStatus: policy.updatePreviousStatus,
        previousRowStatus: policy.previousRowStatus
      },
      logRepository: input.logRepository || (typeof defaultLogRepository !== "undefined" ? defaultLogRepository : null)
    });

    // Rename OriginalDocument in Drive to calculated name
    if (originalFilingResult.fileId && driveApp) {
      driveApp.getFileById(originalFilingResult.fileId).setName(appendResult.newFileName + ".pdf");
    }

    // Path 2: Duplicate OriginalDocument to create ReviewDocument
    const dupAction = input.duplicateDocumentAction || new (typeof DuplicateDocumentAction !== "undefined" ? DuplicateDocumentAction : (globalThis as any).DuplicateDocumentAction)();
    const dupResult = await dupAction.execute({
      fileId: originalFilingResult.fileId,
      blob: blob || undefined,
      driveFilingRepository: driveFilingRepo,
      targetFolderId: input.targetFolderId
    });

    let reviewFileId = dupResult.fileId || originalFilingResult.fileId;
    let reviewUrl = dupResult.url || originalFilingResult.url;
    let reviewLocalPath = dupResult.localPath || originalFilingResult.localPath;

    // Step 4: Prepend CoverPageDocument onto ReviewDocument via InsertPagesAction
    let reviewBlob: GoogleAppsScript.Base.Blob | null = dupResult.blob || blob;
    if (!reviewBlob && driveApp && reviewFileId) {
      reviewBlob = driveApp.getFileById(reviewFileId).getBlob();
    }

    if (policy.stampPdf && reviewBlob) {
      const templateId = (input.incomingRouting === "To Refer")
        ? (typeof CONFIG !== "undefined" ? CONFIG.TRANSMITTAL_TEMPLATE_ID : "")
        : (typeof CONFIG !== "undefined" ? CONFIG.PDF_TEMPLATE_ID : "");

      const titleVal = typeof getDocumentTitle !== "undefined" ? getDocumentTitle(input.validatedDoc) : "";
      const insertAction = input.insertPagesAction || new (typeof InsertPagesAction !== "undefined" ? InsertPagesAction : (globalThis as any).InsertPagesAction)();

      const stampedBlob = await insertAction.execute({
        sourceBlob: reviewBlob,
        data: { action, title: titleVal, incomingRouting: input.incomingRouting },
        options: {
          newFileName: appendResult.newFileName,
          stampSubmittalNo: appendResult.targetKey,
          templateId: templateId
        },
        pdfDocumentService: input.pdfDocumentService || (typeof defaultPdfDocumentService !== "undefined" ? defaultPdfDocumentService : null)
      });

      const stampedPrefix = typeof CONFIG !== "undefined" && CONFIG.STAMPED_FILE_PREFIX ? CONFIG.STAMPED_FILE_PREFIX : "STAMPED_";
      const reviewFileName = stampedPrefix + appendResult.newFileName + ".pdf";
      stampedBlob.setName(reviewFileName);

      // Place ReviewDocument in Submittals\ root (no subfolderPath)
      if (driveFilingRepo) {
        const reviewFiling = driveFilingRepo.fileDocument(
          { blob: stampedBlob },
          { targetFolderId: input.targetFolderId, newFileName: reviewFileName }
        );
        reviewFileId = reviewFiling.fileId;
        reviewUrl = reviewFiling.url;
        reviewLocalPath = reviewFiling.localPath;
      } else if (driveApp) {
        const targetFolder = driveApp.getFolderById(input.targetFolderId);
        const stampedCreatedFile = targetFolder.createFile(stampedBlob);
        if (stampedCreatedFile && typeof stampedCreatedFile.getId === "function") {
          reviewFileId = stampedCreatedFile.getId();
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

    const directRowUrl = "https://docs.google.com/spreadsheets/d/" + input.logFileId + "/edit#gid=" + sheetId + "&range=A" + appendResult.rowIndex;
    const itemTitle = typeof getDocumentTitle !== "undefined" ? getDocumentTitle(input.validatedDoc) : "";

    return {
      fileId: reviewFileId,
      targetKey: appendResult.targetKey,
      url: reviewUrl,
      localPath: reviewLocalPath,
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
