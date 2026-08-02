/// <reference path="./types.ts" />
/**
 * @file WorkflowRunner.ts
 * @description Action pipeline engine and primitive document actions (MoveDocumentAction & RenameDocumentAction).
 */

declare var require: any;

if (typeof require !== 'undefined') {
  try {
    const _mda = eval("require(\"./MoveDocumentAction\")");
    if (_mda && _mda.MoveDocumentAction && typeof (globalThis as any).MoveDocumentAction === 'undefined') {
      (globalThis as any).MoveDocumentAction = _mda.MoveDocumentAction;
    }
  } catch (e) {}
}

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

/**
 * Primitive action that renames a document in Google Drive.
 */
class RenameDocumentAction implements DocumentAction<DocumentActionContext, DocumentActionContext> {
  name: string = 'RenameDocument';

  /**
   * Executes file renaming using explicit target name.
   *
   * @param context - Action context containing fileId, newFileName, and options.
   * @returns Updated context with newFileName.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    if (!context.newFileName) {
      return context;
    }

    const finalName = context.newFileName;
    const driveApp = context.driveApp || (typeof DriveApp !== 'undefined' ? DriveApp : null);

    if (context.fileId && driveApp) {
      const file = driveApp.getFileById(context.fileId);
      if (file && typeof file.setName === 'function') {
        file.setName(finalName);
      }
    } else if (context.blob && typeof context.blob.setName === 'function') {
      context.blob.setName(finalName);
    }

    return {
      ...context,
      newFileName: finalName
    };
  }
}

declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WorkflowRunner,
    RenameDocumentAction,
    MoveDocumentAction: (globalThis as any).MoveDocumentAction
  };
}

(globalThis as any).WorkflowRunner = WorkflowRunner;
(globalThis as any).RenameDocumentAction = RenameDocumentAction;
