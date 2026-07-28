/// <reference path="./types.ts" />
/**
 * @file DocumentWorkflowModule.ts
 * @description Orchestration application service for submittal document workflows.
 *
 * Coordinates workflow delegation to OutgoingWorkflow and IncomingWorkflow modules.
 */

declare var require: any;

if (typeof require !== "undefined") {
  try {
    const _iw = eval('require("./IncomingWorkflow")');
    if (_iw && _iw.IncomingWorkflow && typeof IncomingWorkflow === "undefined") {
      (globalThis as any).IncomingWorkflow = _iw.IncomingWorkflow;
    }
  } catch (e) {}
  try {
    const _ow = eval('require("./OutgoingWorkflow")');
    if (_ow && _ow.OutgoingWorkflow && typeof OutgoingWorkflow === "undefined") {
      (globalThis as any).OutgoingWorkflow = _ow.OutgoingWorkflow;
    }
  } catch (e) {}
  try {
    const _wla = eval('require("./WriteLogAction")');
    if (_wla && _wla.WriteLogAction && typeof WriteLogAction === "undefined") {
      (globalThis as any).WriteLogAction = _wla.WriteLogAction;
    }
  } catch (e) {}
  try {
    const _wfr = eval('require("./WorkflowRunner")');
    if (_wfr && _wfr.WorkflowRunner && typeof WorkflowRunner === "undefined") {
      (globalThis as any).WorkflowRunner = _wfr.WorkflowRunner;
    }
  } catch (e) {}
  try {
    const _ipa = eval('require("./InsertPagesAction")');
    if (_ipa && _ipa.InsertPagesAction && typeof InsertPagesAction === "undefined") {
      (globalThis as any).InsertPagesAction = _ipa.InsertPagesAction;
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
}

/**
 * Resolves execution policy settings based on the specified workflow action string.
 *
 * @param action - The workflow action string (e.g., "Received", "Reviewed", "Referred").
 * @returns WorkflowActionPolicy containing execution instructions.
 */
function getActionPolicy(action: string): WorkflowActionPolicy {
  if (action === "Received") {
    return {
      direction: "incoming",
      stampPdf: true,
      updatePreviousStatus: false
    };
  }
  return {
    direction: "outgoing",
    stampPdf: false,
    updatePreviousStatus: true,
    previousRowStatus: "Closed"
  };
}

/**
 * Factory function returning the appropriate DocumentLogStrategy implementation for a given document.
 *
 * @param doc - The ValidatedDocument instance.
 * @returns FFESubmittalStrategy for FF&E discipline or ArchitectureSubmittalStrategy for Architecture.
 */
function getDocumentLogStrategy(doc: ValidatedDocument): DocumentLogStrategy {
  const details = doc ? doc.disciplineDetails : null;
  if (details && details.discipline === "FF&E") {
    return new FFESubmittalStrategy();
  }
  return new ArchitectureSubmittalStrategy();
}

/**
 * Extracts the primary document title from a validated document based on discipline details.
 *
 * @param doc - The ValidatedDocument instance.
 * @returns Document title string or empty string.
 */
function getDocumentTitle(doc: ValidatedDocument): string {
  const details = doc ? doc.disciplineDetails : null;
  if (!details) return "";
  return details.discipline === "Architecture" ? details.title : details.specTitle;
}

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
      const incomingWf = (globalThis as any).IncomingWorkflow || (typeof IncomingWorkflow !== "undefined" ? IncomingWorkflow : null);
      if (incomingWf && typeof incomingWf.execute === "function") {
        return await incomingWf.execute(input);
      }
      throw new Error("Unable to execute incoming workflow: IncomingWorkflow module unavailable");
    }

    const outgoingWf = (globalThis as any).OutgoingWorkflow || (typeof OutgoingWorkflow !== "undefined" ? OutgoingWorkflow : null);
    if (outgoingWf && typeof outgoingWf.execute === "function") {
      return await outgoingWf.execute(input);
    }

    throw new Error("Unable to execute workflow: OutgoingWorkflow or IncomingWorkflow unavailable");
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getActionPolicy,
    getDocumentLogStrategy,
    getDocumentTitle,
    DocumentWorkflowModule
  };
}

(globalThis as any).getActionPolicy = getActionPolicy;
(globalThis as any).getDocumentLogStrategy = getDocumentLogStrategy;
(globalThis as any).getDocumentTitle = getDocumentTitle;
(globalThis as any).DocumentWorkflowModule = DocumentWorkflowModule;
