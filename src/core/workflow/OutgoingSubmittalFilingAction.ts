/// <reference path="../../types.ts" />
/**
 * @file OutgoingSubmittalFilingAction.ts
 * @description Pure Tier 1 DocumentAction for outgoing submittal filing lifecycle (Ticket 310 forward-compatibility).
 * Zero direct DriveApp or GmailApp calls (ADR-0013).
 */

export class OutgoingSubmittalFilingAction
  implements DocumentAction<DocumentActionContext, DocumentActionContext> {
  name: string = 'OutgoingSubmittalFiling';

  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    const driveFilingRepository =
      context.adapters?.driveFilingRepository ||
      context.driveFilingRepository;

    if (!driveFilingRepository) {
      throw new Error('driveFilingRepository adapter is required for OutgoingSubmittalFilingAction');
    }

    const doc = context.validatedDoc || context.document;
    if (!doc) {
      throw new Error('validatedDoc or document is required for OutgoingSubmittalFilingAction');
    }

    const targetFolderId = context.targetFolderId || context.folderId || '';
    const strategy = context.strategy;
    const targetKey = context.targetKey || (strategy?.getTargetKey ? strategy.getTargetKey(doc) : '');
    const contactHistory = context.contactHistory || doc.contact || '';
    const actionAbbr = context.selectedAction?.abbr || context.actionAbbr || '';

    const newFileName = strategy?.getFileName
      ? strategy.getFileName(doc, contactHistory, actionAbbr)
      : `${targetKey} - ${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

    return {
      ...context,
      newFileName,
      targetKey
    };
  }
}

(globalThis as any).OutgoingSubmittalFilingAction = OutgoingSubmittalFilingAction;
