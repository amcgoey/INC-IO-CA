/// <reference path="./types.ts" />
/**
 * @file WorkflowActionRouter.ts
 * @description Central application router resolving ordered sequences of DocumentAction instances for document types and workflow directions.
 */

declare var require: any;

let _ReadLogActionClass: any = null;
let _MoveDocumentActionRouter: any = null;
let _AnalyzeDocumentActionClass: any = null;
let _InsertPagesActionClass: any = null;
let _WriteLogActionClass: any = null;

if (typeof require !== 'undefined') {
  try {
    const _rla = eval("require('./ReadLogAction')");
    if (_rla && _rla.ReadLogAction) _ReadLogActionClass = _rla.ReadLogAction;
  } catch (e) {}
  try {
    const _mda = eval("require('./core/workflow/MoveDocumentAction')");
    if (_mda && _mda.MoveDocumentAction) _MoveDocumentActionRouter = _mda.MoveDocumentAction;
  } catch (e) {}
  try {
    const _ada = eval("require('./AnalyzeDocumentAction')");
    if (_ada && _ada.AnalyzeDocumentAction) _AnalyzeDocumentActionClass = _ada.AnalyzeDocumentAction;
  } catch (e) {}
  try {
    const _ipa = eval("require('./InsertPagesAction')");
    if (_ipa && _ipa.InsertPagesAction) _InsertPagesActionClass = _ipa.InsertPagesAction;
  } catch (e) {}
  try {
    const _wla = eval("require('./WriteLogAction')");
    if (_wla && _wla.WriteLogAction) _WriteLogActionClass = _wla.WriteLogAction;
  } catch (e) {}
}

class WorkflowActionRouter {
  private static sequenceRegistry: Record<string, DocumentAction[]> = {};

  /**
   * Retrieves an ordered sequence of DocumentActions for a given document type and workflow direction.
   * Adheres to ADR 0012 §12.
   *
   * @param documentType - Domain document type (e.g. 'Submittal', 'Transmittal', 'RFI')
   * @param directionOrAction - Workflow direction / sequence type (e.g. 'Incoming_Filing', 'Incoming_Analysis', 'Outgoing')
   * @returns Array of DocumentAction instances to execute in sequence.
   */
  static getSequence(documentType: string, directionOrAction: string): DocumentAction[] {
    const key = documentType + ':' + directionOrAction;
    if (this.sequenceRegistry[key]) {
      return this.sequenceRegistry[key];
    }

    if (documentType === 'Submittal') {
      if (directionOrAction === 'Incoming_Filing' || directionOrAction === 'Incoming') {
        const RLA = _ReadLogActionClass || (globalThis as any).ReadLogAction;
        const MDA = _MoveDocumentActionRouter || (globalThis as any).MoveDocumentAction;

        const readLog = RLA ? new RLA() : null;
        const moveDoc = MDA ? new MDA() : null;

        const sequence: DocumentAction[] = [];
        if (readLog) sequence.push(readLog);
        if (moveDoc) sequence.push(moveDoc);
        return sequence;
      }

      if (directionOrAction === 'Incoming_Analysis') {
        const AnalyzeCtor = _AnalyzeDocumentActionClass || (globalThis as any).AnalyzeDocumentAction;
        const InsertCtor = _InsertPagesActionClass || (globalThis as any).InsertPagesAction;

        const analyzeAction = AnalyzeCtor ? new AnalyzeCtor() : (globalThis as any).defaultAnalyzeDocumentAction;
        const insertAction = InsertCtor ? new InsertCtor() : (globalThis as any).defaultInsertPagesAction;

        const sequence: DocumentAction[] = [];
        if (analyzeAction) sequence.push(analyzeAction);
        if (insertAction) sequence.push(insertAction);
        return sequence;
      }

      if (directionOrAction === 'Outgoing') {
        const WLA = _WriteLogActionClass || (globalThis as any).WriteLogAction;
        const MDA = _MoveDocumentActionRouter || (globalThis as any).MoveDocumentAction;

        const writeLog = WLA ? new WLA() : null;
        const moveDoc = MDA ? new MDA() : null;

        const sequence: DocumentAction[] = [];
        if (writeLog) sequence.push(writeLog);
        if (moveDoc) sequence.push(moveDoc);
        return sequence;
      }
    }

    return [];
  }

  /**
   * Registers a custom action sequence for a given document type and direction.
   */
  static registerSequence(documentType: string, direction: string, sequence: DocumentAction[]): void {
    const key = documentType + ':' + direction;
    this.sequenceRegistry[key] = sequence;
  }

  /**
   * Clears registered custom sequences (useful for testing).
   */
  static clearRegistry(): void {
    this.sequenceRegistry = {};
  }
}

declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WorkflowActionRouter
  };
}

(globalThis as any).WorkflowActionRouter = WorkflowActionRouter;
