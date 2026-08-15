/// <reference path="../../types.ts" />
/**
 * @file WorkflowRunner.ts
 * @description Action pipeline engine and primitive document actions (MoveDocumentAction & RenameDocumentAction).
 */

import { MoveDocumentAction } from './MoveDocumentAction';

/**
 * Pipeline engine executing an ordered sequence of DocumentAction instances.
 */
class WorkflowRunner {
  /**
   * Executes actions in order, threading and updating the context through each step.
   * Preserves context.adapters across step executions, injects policy into action context,
   * and enriches step error propagation.
   *
   * @param actions - Array of DocumentAction instances to execute.
   * @param initialContext - Starting DocumentActionContext.
   * @param policy - Optional WorkflowPolicySpec passed directly into DocumentActionContext.
   * @returns Resolves to final updated DocumentActionContext.
   */
  static async run(
    actions: DocumentAction[],
    initialContext: DocumentActionContext,
    policy?: WorkflowPolicySpec
  ): Promise<DocumentActionContext> {
    let context: DocumentActionContext = {
      ...initialContext,
      ...(policy !== undefined ? { policy } : {})
    };
    for (const action of actions) {
      try {
        if (policy !== undefined) {
          context.policy = policy;
        }
        const nextContext = await action.execute(context);
        context = {
          ...nextContext,
          adapters: nextContext.adapters || context.adapters,
          ...(policy !== undefined ? { policy } : (nextContext.policy !== undefined ? { policy: nextContext.policy } : {}))
        };
      } catch (error: any) {
        const actionName = action.name || action.constructor?.name || 'DocumentAction';
        if (error instanceof Error && !error.message.startsWith('WorkflowRunner step')) {
          error.message = "WorkflowRunner step [" + actionName + "] failed: " + error.message;
        }
        throw error;
      }
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
    const driveApp = context.driveApp || (typeof globalThis !== 'undefined' ? (globalThis as any).DriveApp : null);

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

export {
  WorkflowRunner,
  RenameDocumentAction,
  MoveDocumentAction
};
