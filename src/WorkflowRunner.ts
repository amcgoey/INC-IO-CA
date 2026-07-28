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

  /**
   * Executes a single DocumentAction with the provided input.
   *
   * @param action - DocumentAction instance to execute.
   * @param input - Input options required by the action.
   * @returns Promise resolving to the action output.
   */
  static async runAction<TInput, TOutput>(
    action: DocumentAction<TInput, TOutput>,
    input: TInput
  ): Promise<TOutput> {
    return await action.execute(input);
  }

  /**
   * Executes an ordered sequence of action steps.
   *
   * @param steps - Array of steps, each containing an action and its input payload.
   * @returns Promise resolving to an array of output results for each step.
   */
  static async runSequence(
    steps: Array<{ action: DocumentAction<any, any>; input: any }>
  ): Promise<any[]> {
    const results: any[] = [];
    for (const step of steps) {
      const res = await step.action.execute(step.input);
      results.push(res);
    }
    return results;
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
 * Decoupled from file renaming.
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
   * Executes file renaming using explicit target name.
   *
   * @param context - Action context containing fileId, newFileName, and optional driveApp reference.
   * @returns Updated context with newFileName.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    if (!context.newFileName) {
      return context;
    }

    const finalName = context.newFileName;

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

(globalThis as any).WorkflowRunner = WorkflowRunner;
(globalThis as any).MoveDocumentAction = MoveDocumentAction;
(globalThis as any).RenameDocumentAction = RenameDocumentAction;
