/// <reference path="./types.ts" />
/**
 * @file WorkflowRunner.ts
 * @description Action pipeline engine and primitive document actions (MoveDocumentAction & RenameDocumentAction).
 */

declare var defaultDriveFilingRepository: DriveFilingRepository;

/**
 * Pipeline engine executing an ordered sequence of DocumentAction instances.
 */
class WorkflowRunner {
  /**
   * Executes actions in order, threading and updating the context through each step.
   *
   * @param actions - Array of DocumentAction instances to execute.
   * @param initialContext - Starting DocumentActionContext.
   * @returns Resolves to final updated DocumentActionContext.
   */
  static async run(
    actions: DocumentAction[],
    initialContext: DocumentActionContext
  ): Promise<DocumentActionContext> {
    let context = { ...initialContext };
    for (const action of actions) {
      context = await action.execute(context);
    }
    return context;
  }
}

function resolveSubfolderPath(context: DocumentActionContext): string[] | undefined {
  if (context.subfolderPath) return context.subfolderPath;
  if (context.config && context.config.closedSubfolderRules && context.validatedDoc) {
    return context.config.closedSubfolderRules(context.validatedDoc);
  }
  return undefined;
}

/**
 * Primitive action that files/moves a document into a Google Drive folder/subfolder hierarchy.
 */
class MoveDocumentAction implements DocumentAction {
  name: string = "MoveDocument";

  /**
   * Executes file movement using DriveFilingRepository.
   *
   * @param context - Action context containing fileId/blob, targetFolderId, subfolderPath, and options.
   * @returns Updated context with fileId, url, localPath, and folderId.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    const repo = context.driveFilingRepository || (typeof defaultDriveFilingRepository !== "undefined" ? defaultDriveFilingRepository : null);
    if (!repo) {
      throw new Error("DriveFilingRepository not provided in context and defaultDriveFilingRepository unavailable");
    }

    const result = repo.fileDocument(
      { fileId: context.fileId, blob: context.blob },
      {
        targetFolderId: context.targetFolderId || "",
        subfolderPath: resolveSubfolderPath(context),
        newFileName: context.newFileName
      }
    );

    return {
      ...context,
      fileId: result.fileId,
      url: result.url,
      localPath: result.localPath,
      folderId: result.folderId
    };
  }
}

/**
 * Primitive action that renames a document in Google Drive.
 */
class RenameDocumentAction implements DocumentAction {
  name: string = "RenameDocument";

  /**
   * Executes file renaming.
   *
   * @param context - Action context containing fileId, newFileName, and optional driveApp reference.
   * @returns Updated context with formatted newFileName.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    if (!context.newFileName) {
      return context;
    }

    const finalName = context.newFileName.endsWith(".pdf")
      ? context.newFileName
      : context.newFileName + ".pdf";

    const driveApp = context.driveApp || (typeof DriveApp !== "undefined" ? DriveApp : null);

    if (context.fileId && driveApp) {
      const file = driveApp.getFileById(context.fileId);
      if (file && typeof file.setName === "function") {
        file.setName(finalName);
      }
    } else if (context.blob && typeof context.blob.setName === "function") {
      context.blob.setName(finalName);
    }

    return {
      ...context,
      newFileName: finalName
    };
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WorkflowRunner,
    MoveDocumentAction,
    RenameDocumentAction
  };
}
