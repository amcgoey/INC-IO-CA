/// <reference path="../../types.ts" />
/**
 * @file OutgoingWorkflow.ts
 * @description Outgoing submittal workflow execution service.
 */

declare var require: any;
declare var defaultDriveFilingRepository: DriveFilingRepository;
declare var defaultLogRepository: LogRepository;

if (typeof require !== "undefined") {
  try {
    const _wla = eval('require("../../WriteLogAction")');
    if (_wla && _wla.WriteLogAction) (globalThis as any).WriteLogAction = _wla.WriteLogAction;
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
  try {
    const _dwm = eval('require("./DocumentWorkflowModule")');
    if (_dwm) {
      if (_dwm.getActionPolicy) (globalThis as any).getActionPolicy = _dwm.getActionPolicy;
      if (_dwm.getDocumentLogStrategy) (globalThis as any).getDocumentLogStrategy = _dwm.getDocumentLogStrategy;
      if (_dwm.getDocumentTitle) (globalThis as any).getDocumentTitle = _dwm.getDocumentTitle;
    }
  } catch (e) {}
}

class OutgoingWorkflow {
  /**
   * Executes the outgoing submittal workflow.
   *
   * @param input - DocumentWorkflowInput containing validated doc, selected action, target folders, and context options.
   * @returns Resolves to DocumentWorkflowResult.
   */
  static async execute(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const action = input.validatedDoc.action || (input.selectedAction ? input.selectedAction.action : "");
    const policyFn = (globalThis as any).getActionPolicy || (typeof getActionPolicy !== "undefined" ? getActionPolicy : null);
    const policy = policyFn ? policyFn(action) : {
      direction: "outgoing",
      useCsiSubfolder: false,
      stampPdf: false,
      updatePreviousStatus: true,
      previousRowStatus: "Closed"
    };

    const stratFn = (globalThis as any).getDocumentLogStrategy || (typeof getDocumentLogStrategy !== "undefined" ? getDocumentLogStrategy : null);
    const ArchCtor = (globalThis as any).ArchitectureSubmittalStrategy || (typeof ArchitectureSubmittalStrategy !== "undefined" ? ArchitectureSubmittalStrategy : null);
    const strategy = input.strategy || (stratFn ? stratFn(input.validatedDoc) : (ArchCtor ? new ArchCtor() : null));

    const WriteCtor = (globalThis as any).WriteLogAction || (typeof WriteLogAction !== "undefined" ? WriteLogAction : null);
    const writeLogAction = input.writeLogAction || (WriteCtor ? new WriteCtor() : null);

    const runner = (globalThis as any).WorkflowRunner || (typeof WorkflowRunner !== "undefined" ? WorkflowRunner : null);

    // Step 1: Write Log Action
    const appendResult = await runner.runAction(writeLogAction, {
      spreadsheetId: input.logFileId,
      document: input.validatedDoc,
      strategy: strategy,
      identityData: strategy.getIdentityData(input.validatedDoc),
      options: {
        link: "",
        status: input.selectedAction?.status || "",
        actionAbbr: input.selectedAction?.abbr || "",
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
    const RenameCtor = (globalThis as any).RenameDocumentAction || (typeof RenameDocumentAction !== "undefined" ? RenameDocumentAction : null);
    const renameAction = RenameCtor ? new RenameCtor() : null;
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

    if (driveFilingRepo && input.driveFileId) {
      const filingOpts: FilingOptions = {
        targetFolderId: input.targetFolderId,
        newFileName: newFileName
      };
      if (appContext === "Gmail") {
        const subfolderPath = strategy.getFilingSubfolders ? strategy.getFilingSubfolders(input.validatedDoc) : undefined;
        if (subfolderPath) {
          filingOpts.subfolderPath = subfolderPath;
        }
      }
      finalFilingResult = driveFilingRepo.fileDocument(
        { fileId: input.driveFileId },
        filingOpts
      );
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
    const titleFn = (globalThis as any).getDocumentTitle || (typeof getDocumentTitle !== "undefined" ? getDocumentTitle : null);
    const itemTitle = titleFn ? titleFn(input.validatedDoc) : "";

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
