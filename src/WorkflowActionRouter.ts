/// <reference path="./types.ts" />
/**
 * @file WorkflowActionRouter.ts
 * @description Central application router resolving ordered sequences of DocumentAction instances for document types and workflow directions.
 */

declare var require: any;
let AnalyzeDocumentActionClass: any;
let InsertPagesActionClass: any;

if (typeof require !== 'undefined') {
  try {
    AnalyzeDocumentActionClass = require('./AnalyzeDocumentAction').AnalyzeDocumentAction;
  } catch (e) {}
  try {
    InsertPagesActionClass = require('./InsertPagesAction').InsertPagesAction;
  } catch (e) {}
}

/**
 * Router managing workflow action sequence definitions per document type and action/direction.
 */
class WorkflowActionRouter {
  /**
   * Resolves the ordered sequence of DocumentAction instances for the specified document type and direction.
   *
   * @param documentType - Target document type name (e.g., "Submittal", "RFI").
   * @param directionOrAction - Workflow direction or action key (e.g., "Incoming_Analysis", "Incoming", "Outgoing").
   * @returns Array of DocumentAction instances to execute in sequence.
   */
  static getSequence(documentType: string, directionOrAction: string): DocumentAction[] {
    const AnalyzeCtor = AnalyzeDocumentActionClass || (globalThis as any).AnalyzeDocumentAction;
    const InsertCtor = InsertPagesActionClass || (globalThis as any).InsertPagesAction;

    if (documentType === 'Submittal' && (directionOrAction === 'Incoming_Analysis' || directionOrAction === 'Incoming')) {
      const analyzeAction = AnalyzeCtor ? new AnalyzeCtor() : (globalThis as any).defaultAnalyzeDocumentAction;
      const insertAction = InsertCtor ? new InsertCtor() : (globalThis as any).defaultInsertPagesAction;
      return [analyzeAction, insertAction];
    }

    return [];
  }
}

declare var module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WorkflowActionRouter
  };
}

(globalThis as any).WorkflowActionRouter = WorkflowActionRouter;