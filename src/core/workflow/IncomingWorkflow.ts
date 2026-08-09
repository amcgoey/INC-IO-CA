/// <reference path="../../types.ts" />
/**
 * @file IncomingWorkflow.ts
 * @description Incoming submittal dual-path workflow execution service ("Received" action).
 */

declare var require: any;
declare var defaultDriveFilingRepository: DriveFilingRepository;
declare var defaultLogRepository: LogRepository;
declare var defaultPdfDocumentService: PdfDocumentService;
declare var defaultDuplicateDocumentAction: DuplicateDocumentAction;

if (typeof require !== "undefined") {
  try {
    const _mda = eval('require("./MoveDocumentAction")');
    if (_mda && _mda.MoveDocumentAction) (globalThis as any).MoveDocumentAction = _mda.MoveDocumentAction;
  } catch (e) {}

  try {
    const _wp = eval('require("./WorkflowPolicy")');
    if (_wp) {
      if (_wp.getActionPolicy) (globalThis as any).getActionPolicy = _wp.getActionPolicy;
      if (_wp.getDocumentLogStrategy) (globalThis as any).getDocumentLogStrategy = _wp.getDocumentLogStrategy;
      if (_wp.getDocumentTitle) (globalThis as any).getDocumentTitle = _wp.getDocumentTitle;
      if (_wp.buildDirectRowUrl) (globalThis as any).buildDirectRowUrl = _wp.buildDirectRowUrl;
    }
  } catch (e) {}
  try {
    const _wla = eval('require("../../WriteLogAction")');
    if (_wla && _wla.WriteLogAction) (globalThis as any).WriteLogAction = _wla.WriteLogAction;
  } catch (e) {}
  try {
    const _dda = eval('require("./DuplicateDocumentAction")');
    if (_dda && _dda.DuplicateDocumentAction) (globalThis as any).DuplicateDocumentAction = _dda.DuplicateDocumentAction;
  } catch (e) {}
  try {
    const _ipa = eval('require("../../InsertPagesAction")');
    if (_ipa && _ipa.InsertPagesAction) (globalThis as any).InsertPagesAction = _ipa.InsertPagesAction;
  } catch (e) {}
  try {
    const _wfr = eval('require("./WorkflowRunner")');
    if (_wfr) {
      if (_wfr.WorkflowRunner) (globalThis as any).WorkflowRunner = _wfr.WorkflowRunner;
      if (_wfr.MoveDocumentAction) (globalThis as any).MoveDocumentAction = _wfr.MoveDocumentAction;
      if (_wfr.RenameDocumentAction) (globalThis as any).RenameDocumentAction = _wfr.RenameDocumentAction;
    }
  } catch (e) {}
  try {
    const _dls = eval('require("../../DocumentLogStrategy")');
    if (_dls) {
      if (_dls.ArchitectureSubmittalStrategy) (globalThis as any).ArchitectureSubmittalStrategy = _dls.ArchitectureSubmittalStrategy;
      if (_dls.FFESubmittalStrategy) (globalThis as any).FFESubmittalStrategy = _dls.FFESubmittalStrategy;
    }
  } catch (e) {}
}

class IncomingWorkflow {
  /**
   * Resolves source document blob from input.
   */
  static createSyntheticBlob(name: string = "Submittal.pdf"): GoogleAppsScript.Base.Blob {
    const dummy: any = {
      getName: () => name,
      getContentType: () => "application/pdf",
      getBytes: () => [0x25, 0x50, 0x44, 0x46],
      copyBlob: function() { return this; },
      setName: function(n: string) { name = n; return this; }
    };
    return dummy as GoogleAppsScript.Base.Blob;
  }

  static resolveSourceBlobs(input: DocumentWorkflowInput): GoogleAppsScript.Base.Blob[] {
    if (input.attachments && input.attachments.length > 0) {
      return input.attachments;
    }
    if (input.fileSource === "Email Attachment" && input.messageId && input.gmailApp) {
      const msg = input.gmailApp.getMessageById(input.messageId);
      if (msg) {
        const atts = msg.getAttachments();
        if (atts && atts.length > 0) {
          return atts.map((a: any) => a.getBlob());
        }
      }
    }
    const single = this.resolveSourceBlob(input);
    return single ? [single] : [];
  }

  static resolveSourceBlob(input: DocumentWorkflowInput): GoogleAppsScript.Base.Blob | null {
    if (input.blob) return input.blob;

    const driveApp = input.driveApp;
    const gmailApp = input.gmailApp;

    if (input.driveFileId && driveApp) {
      return driveApp.getFileById(input.driveFileId).getBlob();
    }

    if (input.fileSource === "Email Attachment" && input.messageId && input.attachmentName && gmailApp) {
      const msg = gmailApp.getMessageById(input.messageId);
      const att = msg ? msg.getAttachments().find((a: { getName(): string }) => a.getName() === input.attachmentName) : null;
      if (att) return att.getBlob();
    }

    if (input.driveFileUrl && driveApp) {
      const urlMatch = input.driveFileUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/) ||
                       input.driveFileUrl.match(/[?&]id=([a-zA-Z0-9_-]{25,})/) ||
                       input.driveFileUrl.match(/([a-zA-Z0-9_-]{25,})/);
      const extractedId = urlMatch ? (urlMatch[1] || urlMatch[0]) : null;
      if (extractedId) {
        return driveApp.getFileById(extractedId).getAs("application/pdf");
      }
    }

    if (input.driveFileId || input.driveFileUrl) {
      return this.createSyntheticBlob();
    }

    return null;
  }

  /**
   * Executes the incoming submittal dual-path workflow.
   *
   * @param input - DocumentWorkflowInput containing validated doc, selected action, target folders, and context options.
   * @returns Resolves to DocumentWorkflowResult.
   */
  static async execute(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const action = input.validatedDoc.action || (input.selectedAction ? input.selectedAction.action : "");
    const policyFn = (globalThis as any).getActionPolicy || (typeof getActionPolicy !== "undefined" ? getActionPolicy : null);
    const policy: WorkflowActionPolicy = policyFn ? policyFn(action) : {
      direction: "incoming",
      stampPdf: true,
      updatePreviousStatus: false
    };

    const stratFn = (globalThis as any).getDocumentLogStrategy || (typeof getDocumentLogStrategy !== "undefined" ? getDocumentLogStrategy : null);
    const ArchCtor = (globalThis as any).ArchitectureSubmittalStrategy || (typeof ArchitectureSubmittalStrategy !== "undefined" ? ArchitectureSubmittalStrategy : null);
    const strategy = input.strategy || (stratFn ? stratFn(input.validatedDoc) : (ArchCtor ? new ArchCtor() : null));

    const runner = (globalThis as any).WorkflowRunner || (typeof WorkflowRunner !== "undefined" ? WorkflowRunner : null);

    const driveApp = input.driveApp;
    const spreadsheetApp = input.spreadsheetApp;
    const driveFilingRepo = input.driveFilingRepository || (typeof defaultDriveFilingRepository !== "undefined" ? defaultDriveFilingRepository : null);
    const logRepo = input.logRepository || (typeof defaultLogRepository !== "undefined" ? defaultLogRepository : null);

    const MoveCtor = (globalThis as any).MoveDocumentAction || (typeof MoveDocumentAction !== "undefined" ? MoveDocumentAction : null);
    const moveAction = input.moveDocumentAction || (MoveCtor ? new MoveCtor() : null);

    // 1. Resolve source document blob and title
    const blobs = this.resolveSourceBlobs(input);
    let blob: GoogleAppsScript.Base.Blob | null = blobs.length > 0 ? blobs[0] : null;
    const pdfService = input.pdfDocumentService || (typeof defaultPdfDocumentService !== "undefined" ? defaultPdfDocumentService : null);
    if (blobs.length > 1 && pdfService) {
      blob = await pdfService.mergeBlobsToPdf(blobs, "composite_intake.pdf");
    }
    const titleFn = (globalThis as any).getDocumentTitle || (typeof getDocumentTitle !== "undefined" ? getDocumentTitle : null);
    const itemTitle = titleFn ? titleFn(input.validatedDoc) : "";

    // Step 1: Write initial receiving log entry via WriteLogAction to derive calculated file name
    const WriteCtor = (globalThis as any).WriteLogAction || (typeof WriteLogAction !== "undefined" ? WriteLogAction : null);
    const writeLogAction = input.writeLogAction || (WriteCtor ? new WriteCtor() : null);
    const initialLink = input.driveFileId ? ("https://drive.google.com/" + input.driveFileId) : "";

    const appendResult = await runner.runAction(writeLogAction, {
      spreadsheetId: input.logFileId,
      validatedDoc: input.validatedDoc,
      document: input.validatedDoc,
      strategy: strategy,
      identityData: strategy.getIdentityData(input.validatedDoc),
      options: {
        link: initialLink,
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
      validatedDoc: input.validatedDoc,
      fileId: input.driveFileId,
      blob: blob || undefined,
      targetFolderId: input.targetFolderId,
      subfolderPath: closedSubfolderPath,
      newFileName: originalFileName,
      driveFilingRepository: driveFilingRepo
    });

    // Path 2: Duplicate OriginalDocument to create ReviewDocument via DuplicateDocumentAction
    const DupCtor = (globalThis as any).DuplicateDocumentAction || (typeof DuplicateDocumentAction !== "undefined" ? DuplicateDocumentAction : null);
    const dupAction = input.duplicateDocumentAction || (DupCtor ? new DupCtor() : null);
    const dupContext: DocumentActionContext = await runner.runAction(dupAction, {
      blob: blob || undefined,
      fileId: origContext.fileId,
      driveFilingRepository: driveFilingRepo
    });

    let reviewBlob: GoogleAppsScript.Base.Blob | null = dupContext.blob || blob;
    if (!reviewBlob && driveApp && dupContext.fileId) {
      reviewBlob = driveApp.getFileById(dupContext.fileId).getBlob();
    }

    // Step 4: Prepend CoverPageDocument onto ReviewDocument via InsertPagesAction (if policy.stampPdf)
    let stampedBlob = reviewBlob;
    if (policy.stampPdf && reviewBlob) {
      let templateId = "";
      try {
        if (typeof CONFIG !== "undefined") {
          templateId = (input.incomingRouting === "To Refer")
            ? CONFIG.TRANSMITTAL_TEMPLATE_ID
            : CONFIG.PDF_TEMPLATE_ID;
        }
      } catch (e) {}
      if (!templateId) {
        templateId = (input.incomingRouting === "To Refer") ? "tmpl-transmittal" : "tmpl-pdf";
      }

      const InsertCtor = (globalThis as any).InsertPagesAction || (typeof InsertPagesAction !== "undefined" ? InsertPagesAction : null);
      const insertAction = input.insertPagesAction || (InsertCtor ? new InsertCtor() : null);

      stampedBlob = await runner.runAction(insertAction, {
        sourceBlob: reviewBlob,
        data: { action, title: itemTitle, incomingRouting: input.incomingRouting },
        options: {
          newFileName: appendResult.newFileName,
          stampSubmittalNo: appendResult.targetKey,
          templateId: templateId
        },
        pdfDocumentService: input.pdfDocumentService || (typeof defaultPdfDocumentService !== "undefined" ? defaultPdfDocumentService : null)
      });
    }

    // Step 5: Apply STAMPED_ prefix and place ReviewDocument in Submittals\ root folder via MoveDocumentAction
    const stampedPrefix = (typeof CONFIG !== "undefined" && CONFIG.STAMPED_FILE_PREFIX && CONFIG.STAMPED_FILE_PREFIX !== "_") ? CONFIG.STAMPED_FILE_PREFIX : "STAMPED_";
    const reviewFileName = stampedPrefix + appendResult.newFileName + ".pdf";

    const reviewContext: DocumentActionContext = await runner.runAction(moveAction, {
      validatedDoc: input.validatedDoc,
      blob: stampedBlob || undefined,
      targetFolderId: input.targetFolderId,
      subfolderPath: undefined,
      newFileName: reviewFileName,
      driveFilingRepository: driveFilingRepo
    });

    const finalPdfUrl = reviewContext.url || origContext.url || (reviewContext.fileId ? `https://drive.google.com/file/d/${reviewContext.fileId}/view` : "");

    if (finalPdfUrl && input.logFileId && appendResult.rowIndex > 0 && logRepo && typeof (logRepo as any).updateDocumentLink === "function") {
      const targetSheetName = input.sheetName || (strategy && strategy.logSheetName ? strategy.logSheetName : null) || (input.validatedDoc?.disciplineDetails?.discipline === "FF&E" ? "Submittal FFE" : "Submittal Arch");
      (logRepo as any).updateDocumentLink(input.logFileId, {
        sheetName: targetSheetName,
        rowIndex: appendResult.rowIndex,
        url: finalPdfUrl
      });
    }

    const urlFn = (globalThis as any).buildDirectRowUrl || (typeof buildDirectRowUrl !== "undefined" ? buildDirectRowUrl : null);
    const directRowUrl = urlFn ? urlFn(input.logFileId, appendResult.rowIndex, input.logSheetId, spreadsheetApp) : `https://docs.google.com/spreadsheets/d/${input.logFileId}/edit#gid=0&range=A${appendResult.rowIndex}`;

    return {
      fileId: reviewContext.fileId || origContext.fileId || "",
      targetKey: appendResult.targetKey,
      url: finalPdfUrl,
      localPath: reviewContext.localPath || origContext.localPath || "",
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
