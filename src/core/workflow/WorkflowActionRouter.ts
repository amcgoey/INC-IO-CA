/// <reference path="../../types.ts" />
/**
 * @file WorkflowActionRouter.ts
 * @description Central application router resolving ordered sequences of DocumentAction instances for document types and workflow directions.
 */

import { ReadLogAction } from '../../ReadLogAction';
import { MoveDocumentAction } from './MoveDocumentAction';
import { AnalyzeDocumentAction } from '../../AnalyzeDocumentAction';
import { InsertPagesAction } from '../../InsertPagesAction';
import { WriteLogAction } from '../../WriteLogAction';

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
        return [new ReadLogAction(), new MoveDocumentAction()];
      }

      if (directionOrAction === 'Incoming_Analysis') {
        return [new AnalyzeDocumentAction(), new InsertPagesAction()];
      }

      if (directionOrAction === 'Outgoing') {
        return [new WriteLogAction(), new MoveDocumentAction()];
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

export {
  WorkflowActionRouter
};
