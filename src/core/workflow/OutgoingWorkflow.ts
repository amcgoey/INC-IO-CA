/// <reference path="../../types.ts" />
/**
 * @file OutgoingWorkflow.ts
 * @description Outgoing submittal workflow execution service.
 */

import { getActionPolicy, getDocumentLogStrategy, getDocumentTitle, buildDirectRowUrl } from './WorkflowPolicy';
import { WriteLogAction } from '../../WriteLogAction';
import { WorkflowRunner, RenameDocumentAction } from './WorkflowRunner';


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
    
    const strategy = input.strategy || (stratFn ? stratFn(input.validatedDoc) : null);

    const WriteCtor = (globalThis as any).WriteLogAction || (typeof WriteLogAction !== "undefined" ? WriteLogAction : null);
    const writeLogAction = input.writeLogAction || (WriteCtor ? new WriteCtor() : null);

    const runner = (globalThis as any).WorkflowRunner || (typeof WorkflowRunner !== "undefined" ? WorkflowRunner : null);

    // Step 1: Write Log Action
    const appendResult = await runner.runAction(writeLogAction, {
      spreadsheetId: input.logFileId,
      validatedDoc: input.validatedDoc,
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
      logRepository: input.logRepository || (globalThis as any).defaultLogRepository || defaultLogRepository
    });

    // Step 2: Resolve AppContext
    const appContext: AppContext = input.appContext ||
      ((input.fileSource === "Email Attachment" || input.messageId) ? "Gmail" : "GoogleDrive");

    const driveApp = input.driveApp;
    const spreadsheetApp = input.spreadsheetApp;

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

    const logRepo = input.logRepository || (globalThis as any).defaultLogRepository || defaultLogRepository;
    const finalPdfUrl = finalFilingResult.url || (finalFilingResult.fileId ? `https://drive.google.com/file/d/${finalFilingResult.fileId}/view` : "");

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
    const titleFn = (globalThis as any).getDocumentTitle || (typeof getDocumentTitle !== "undefined" ? getDocumentTitle : null);
    const itemTitle = titleFn ? titleFn(input.validatedDoc) : "";

    return {
      fileId: finalFilingResult.fileId || input.driveFileId || "",
      targetKey: appendResult.targetKey,
      url: finalPdfUrl,
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

export {
  OutgoingWorkflow
};
