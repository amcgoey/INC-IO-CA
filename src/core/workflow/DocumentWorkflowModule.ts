/// <reference path="../../types.ts" />
/**
 * @file DocumentWorkflowModule.ts
 * @description Orchestration application service for submittal document workflows.
 *
 * Coordinates workflow delegation to OutgoingWorkflow and IncomingWorkflow modules.
 */

declare var require: any;

var _wp: any = typeof require !== "undefined" ? eval('require("./WorkflowPolicy")') : (globalThis as any);
var getActionPolicy: (action: string) => WorkflowActionPolicy = _wp.getActionPolicy;
var getDocumentLogStrategy: (doc: ValidatedDocument) => DocumentLogStrategy = _wp.getDocumentLogStrategy;
var getDocumentTitle: (doc: ValidatedDocument) => string = _wp.getDocumentTitle;
var buildDirectRowUrl: (logFileId: string, rowIndex: number, sheetId?: number | null, spreadsheetApp?: any) => string = _wp.buildDirectRowUrl;

if (typeof require !== "undefined") {
  try {
    const _mda = eval('require("./MoveDocumentAction")');
    if (_mda && _mda.MoveDocumentAction) (globalThis as any).MoveDocumentAction = _mda.MoveDocumentAction;
  } catch (e) {}
  try {
    const _iw = eval('require("./IncomingWorkflow")');
    if (_iw && _iw.IncomingWorkflow) (globalThis as any).IncomingWorkflow = _iw.IncomingWorkflow;
  } catch (e) {}
  try {
    const _ow = eval('require("./OutgoingWorkflow")');
    if (_ow && _ow.OutgoingWorkflow) (globalThis as any).OutgoingWorkflow = _ow.OutgoingWorkflow;
  } catch (e) {}
  try {
    const _wla = eval('require("../../WriteLogAction")');
    if (_wla && _wla.WriteLogAction) (globalThis as any).WriteLogAction = _wla.WriteLogAction;
  } catch (e) {}
  try {
    const _wfr = eval('require("./WorkflowRunner")');
    if (_wfr && _wfr.WorkflowRunner) (globalThis as any).WorkflowRunner = _wfr.WorkflowRunner;
  } catch (e) {}
  try {
    const _ipa = eval('require("../../InsertPagesAction")');
    if (_ipa && _ipa.InsertPagesAction) (globalThis as any).InsertPagesAction = _ipa.InsertPagesAction;
  } catch (e) {}
  try {
    const _dls = eval('require("../../DocumentLogStrategy")');
    if (_dls) {
      if (_dls.ArchitectureSubmittalStrategy) (globalThis as any).ArchitectureSubmittalStrategy = _dls.ArchitectureSubmittalStrategy;
      if (_dls.FFESubmittalStrategy) (globalThis as any).FFESubmittalStrategy = _dls.FFESubmittalStrategy;
    }
  } catch (e) {}
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
    buildDirectRowUrl,
    DocumentWorkflowModule
  };
}

(globalThis as any).getActionPolicy = getActionPolicy;
(globalThis as any).getDocumentLogStrategy = getDocumentLogStrategy;
(globalThis as any).getDocumentTitle = getDocumentTitle;
(globalThis as any).buildDirectRowUrl = buildDirectRowUrl;
(globalThis as any).DocumentWorkflowModule = DocumentWorkflowModule;
