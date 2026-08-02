/// <reference path="./types.ts" />
/**
 * @file WorkflowActionRouter.ts
 * @description Registry and routing module for retrieving ordered sequences of DocumentAction handlers.
 */

declare var require: any;

let _ReadLogActionClass: any = null;
let _MoveDocumentActionClass: any = null;

if (typeof require !== 'undefined') {
  try {
    const _rla = eval("require(\"./ReadLogAction\")");
    if (_rla && _rla.ReadLogAction) _ReadLogActionClass = _rla.ReadLogAction;
  } catch (e) {}
  try {
    const _mda = eval("require(\"./MoveDocumentAction\")");
    if (_mda && _mda.MoveDocumentAction) _MoveDocumentActionClass = _mda.MoveDocumentAction;
  } catch (e) {}
}

class WorkflowActionRouter {
  private static sequenceRegistry: Record<string, DocumentAction[]> = {};

  /**
   * Retrieves an ordered sequence of DocumentActions for a given document type and workflow direction.
   * Adheres to ADR 0012 §12.
   *
   * @param documentType - Domain document type (e.g. 'Submittal', 'Transmittal', 'RFI')
   * @param direction - Workflow direction / sequence type (e.g. 'Incoming_Filing', 'Standard_Filing')
   * @returns Array of DocumentAction instances to execute in sequence.
   */
  static getSequence(documentType: string, direction: string): DocumentAction[] {
    const key = documentType + ':' + direction;
    if (this.sequenceRegistry[key]) {
      return this.sequenceRegistry[key];
    }

    if ((documentType === 'Submittal') && (direction === 'Incoming_Filing' || direction === 'Incoming')) {
      const RLA = _ReadLogActionClass || (globalThis as any).ReadLogAction;
      const MDA = _MoveDocumentActionClass || (globalThis as any).MoveDocumentAction;

      const readLog = RLA ? new RLA() : null;
      const moveDoc = MDA ? new MDA() : null;

      const sequence: DocumentAction[] = [];
      if (readLog) sequence.push(readLog);
      if (moveDoc) sequence.push(moveDoc);
      return sequence;
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
