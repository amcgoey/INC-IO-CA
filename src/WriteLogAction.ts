/// <reference path="./types.ts" />
/**
 * @file WriteLogAction.ts
 * @description DocumentAction implementation for persisting validated document log entries using abstract IdentityData.
 *
 * Operates on DocumentActionContext and executes single-pass atomic row insertion under SpreadsheetLockAdapter concurrency lock.
 * Zero direct SpreadsheetApp or LockService calls (ADR-0013).
 */

import { getDocumentLogStrategy } from './core/workflow/WorkflowPolicy';
import { SpreadsheetLockAdapter } from './core/interfaces/SpreadsheetLockAdapter';

class WriteLogAction
  implements DocumentAction<DocumentActionContext, DocumentActionContext> {
  name: string = 'WriteLog';

  /**
   * Executes the write log action.
   *
   * @param context - Action context containing validatedDoc, logRepository adapter, and optional log options.
   * @returns A Promise resolving to updated DocumentActionContext.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    const logRepository =
      context.adapters?.logRepository ||
      context.logRepository;

    if (!logRepository) {
      throw new Error('WriteLogAction requires logRepository adapter');
    }

    const doc = context.validatedDoc || context.document;
    if (!doc) {
      throw new Error('WriteLogAction requires validatedDoc in context');
    }

    const getStrategyFn = (globalThis as any).getDocumentLogStrategy || (typeof getDocumentLogStrategy !== 'undefined' ? getDocumentLogStrategy : undefined);
    const strategy: DocumentLogStrategy | undefined =
      context.strategy ||
      (getStrategyFn ? getStrategyFn(doc) : undefined);

    if (!strategy) {
      throw new Error('WriteLogAction requires strategy or getDocumentLogStrategy helper');
    }

    const identityData: IdentityData =
      context.identityData || strategy.getIdentityData(doc);

    const spreadsheetId = context.spreadsheetId || context.logFileId || '';

    // Concurrency locking under SpreadsheetLockAdapter
    const lockAdapter: SpreadsheetLockAdapter | undefined =
      context.adapters?.spreadsheetLockAdapter ||
      (context as any).spreadsheetLockAdapter ||
      (globalThis as any).defaultSpreadsheetLockAdapter;

    let lockId: string | null = null;
    if (lockAdapter && spreadsheetId) {
      lockId = lockAdapter.acquireLock(spreadsheetId);
      if (!lockId) {
        throw new Error(`Failed to acquire lock for spreadsheet: ${spreadsheetId}`);
      }
    }

    try {
      const actionObj = context.selectedAction || { action: doc.action || '', abbr: '', status: '' };
      const isIncoming = (doc.action && doc.action.toLowerCase() === 'received') || context.policy?.direction === 'incoming';
      const defaultStatus = isIncoming ? 'Under Review' : '';
      const status = actionObj.status || context.status || defaultStatus;

      const targetKey = identityData.identityRevisionGroup || (strategy.getTargetKey ? strategy.getTargetKey(doc) : identityData.identity);
      let link = context.options?.link || context.link || context.url || '';
      if (context.driveFileUrl) {
        link = `=HYPERLINK("${context.driveFileUrl}", "${targetKey}")`;
      } else if (link && link.startsWith('http') && targetKey) {
        link = `=HYPERLINK("${link}", "${targetKey}")`;
      }

      const appendOptions: AppendDocumentOptions = {
        link,
        status,
        actionAbbr: actionObj.abbr || context.actionAbbr || '',
        updatePreviousStatus: context.updatePreviousStatus ?? (isIncoming ? false : true),
        previousRowStatus: context.previousRowStatus ?? 'Closed',
        sheetName: context.config?.logSheetName || context.sheetName || (strategy as any).logSheetName,
        identityData,
        ...context.options,
        ...(link ? { link } : {}),
        ...(status ? { status } : {})
      };

      const appendResult = await logRepository.appendDocument(
        spreadsheetId,
        doc,
        strategy,
        appendOptions
      );

      return {
        ...context,
        targetKey: appendResult.targetKey,
        newFileName: appendResult.newFileName,
        contactHistory: appendResult.contactHistory,
        rowIndex: appendResult.rowIndex,
        failedColumns: appendResult.failedColumns,
        previousRowUpdated: appendResult.previousRowUpdated,
        appendDocumentResult: appendResult
      };
    } finally {
      if (lockAdapter && lockId && spreadsheetId) {
        lockAdapter.releaseLock(spreadsheetId, lockId);
      }
    }
  }
}

export { WriteLogAction };

(globalThis as any).WriteLogAction = WriteLogAction;
