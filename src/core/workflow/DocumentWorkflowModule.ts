/// <reference path="../../types.ts" />
/**
 * @file DocumentWorkflowModule.ts
 * @description Orchestration application service for submittal document workflows.
 *
 * Coordinates workflow delegation to OutgoingWorkflow and IncomingWorkflow modules.
 */

import { getActionPolicy, getDocumentLogStrategy, getDocumentTitle, buildDirectRowUrl } from "./WorkflowPolicy";
import { IncomingWorkflow } from "./IncomingWorkflow";
import { OutgoingWorkflow } from "./OutgoingWorkflow";

/**
 * Core workflow orchestrator service that delegates to IncomingWorkflow and OutgoingWorkflow modules.
 */
class DocumentWorkflowModule {
  /**
   * Executes the end-to-end submittal workflow.
   *
   * @param input - DocumentWorkflowInput containing validated document data, target folders, and repository references.
   * @returns A Promise resolving to DocumentWorkflowResult.
   */
  static async executeWorkflow(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const action = input.validatedDoc.action || (input.selectedAction ? input.selectedAction.action : "");
    const policy = getActionPolicy(action);

    if (policy.direction === "incoming") {
      return await IncomingWorkflow.execute(input);
    }

    return await OutgoingWorkflow.execute(input);
  }
}

export {
  getActionPolicy,
  getDocumentLogStrategy,
  getDocumentTitle,
  buildDirectRowUrl,
  DocumentWorkflowModule
};
