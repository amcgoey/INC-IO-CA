/// <reference path="./types.ts" />
/**
 * @file OutgoingWorkflow.ts
 * @description Outgoing submittal workflow execution service.
 *
 * Coordinates WriteLogAction, RenameDocumentAction, and conditional MoveDocumentAction
 * based on AppContext (GoogleDrive vs. Gmail).
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

export class OutgoingWorkflow {
  /**
   * Executes the outgoing submittal workflow.
   *
   * @param input - DocumentWorkflowInput containing validated doc, selected action, target folders, and context options.
   * @returns Resolves to DocumentWorkflowResult.
   */
  static async execute(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const action = input.validatedDoc.action || (input.selectedAction ? input.selectedAction.action : "");
    const policy = (typeof getActionPolicy !== "undefined" ? getActionPolicy(action) : {
      direction: "outgoing",
      useCsiSubfolder: false,
      stampPdf: false,
      updatePreviousStatus: true,
      previousRowStatus: "Closed"
    });

    const strategy = input.strategy || (typeof getDocumentLogStrategy !== "undefined" ? getDocumentLogStrategy(input.validatedDoc) : new ArchitectureSubmittalStrategy());
    const writeLogAction = input.writeLogAction || new (typeof WriteLogAction !== "undefined" ? WriteLogAction : (globalThis as any).WriteLogAction)();
    const runner = typeof WorkflowRunner !== "undefined" ? WorkflowRunner : (globalThis as any).WorkflowRunner;

    // Step 1: Write Log Action
    const appendResult = await runner.runAction(writeLogAction, {
      spreadsheetId: input.logFileId,
      document: input.validatedDoc,
      strategy: strategy,
      identityData: strategy.getIdentityData(input.validatedDoc),
      options: {
        link: "",
        status: input.selectedAction.status,
        actionAbbr: input.selectedAction.abbr,
        updatePreviousStatus: policy.updatePreviousStatus,
        previousRowStatus: policy.previousRowStatus
      },
      logRepository: input.logRepository || (typeof defaultLogRepository !== "undefined" ? defaultLogRepository : null)
    });

    // Step 2: Resolve AppContext
    const appContext: AppContext = input.appContext ||
      ((input.fileSource === "Email Attachment" || input.messageId) ? "Gmail" : "GoogleDrive");

    const driveApp = input.driveApp || (typeof DriveApp !== "undefined" ? DriveApp : null);
    const spreadsheetApp = input.spreadsheetApp || (typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp : null);

    // Step 3: Rename Document Action
    const renameAction = new (typeof RenameDocumentAction !== "undefined" ? RenameDocumentAction : (globalThis as any).RenameDocumentAction)();
    const newFileName = appendResult.newFileName + ".pdf";
    await runner.runAction(renameAction, {
      fileId: input.driveFileId,
      newFileName: newFileName,
      driveApp: driveApp
    });

    // Step 4: Move Document Action if AppContext === 'Gmail' (Single-pass immediate filing)
    let finalFilingResult: FilingResult = {
      fileId: input.driveFileId || "",
      url: "",
      localPath: "",
      folderId: input.targetFolderId
    };

    const driveFilingRepo = input.driveFilingRepository || (typeof defaultDriveFilingRepository !== "undefined" ? defaultDriveFilingRepository : null);

    if (appContext === "Gmail") {
      const closedFolder = (typeof CONFIG !== "undefined" && CONFIG.CLOSED_FOLDER_NAME) ? CONFIG.CLOSED_FOLDER_NAME : "Closed";
      const subfolderPath = strategy.getFilingSubfolders
        ? strategy.getFilingSubfolders(input.validatedDoc)
        : [closedFolder];

      if (driveFilingRepo) {
        finalFilingResult = driveFilingRepo.fileDocument(
          { fileId: input.driveFileId },
          { targetFolderId: input.targetFolderId, subfolderPath: subfolderPath }
        );
      }
    } else {
      // AppContext === 'GoogleDrive': retain file in root target folder
      if (driveFilingRepo && input.driveFileId) {
        finalFilingResult = driveFilingRepo.fileDocument(
          { fileId: input.driveFileId },
          { targetFolderId: input.targetFolderId }
        );
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
      fileId: finalFilingResult.fileId || input.driveFileId || "",
      targetKey: appendResult.targetKey,
      url: finalFilingResult.url,
      localPath: finalFilingResult.localPath,
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
    OutgoingWorkflow
  };
}

(globalThis as any).OutgoingWorkflow = OutgoingWorkflow;
