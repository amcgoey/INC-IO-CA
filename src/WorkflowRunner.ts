/**
 * @file WorkflowRunner.ts
 * @description Pipeline engine executing step-by-step primitive DocumentAction operations for target DocumentType and AppContext workflows.
 */

export class WorkflowRunner {
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


declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WorkflowRunner
  };
}
