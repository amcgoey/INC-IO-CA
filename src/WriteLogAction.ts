/// <reference path="./types.ts" />
/**
 * @file WriteLogAction.ts
 * @description DocumentAction implementation for persisting validated document log entries using abstract IdentityData.
 *
 * Operates on DocumentActionContext and wraps LogRepository.appendDocument() into a primitive DocumentAction handler.
 */

class WriteLogAction<TDoc extends ValidatedDocument = ValidatedDocument>
  implements DocumentAction<DocumentActionContext<TDoc>, DocumentActionContext<TDoc>> {
  name: string = 'WriteLog';

  /**
   * Executes the write log action.
   *
   * @param context - Action context containing validatedDoc, logRepository adapter, and optional log options.
   * @returns A Promise resolving to updated DocumentActionContext.
   */
  async execute(context: DocumentActionContext<TDoc>): Promise<DocumentActionContext<TDoc>> {
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

    const actionObj = context.selectedAction || { action: doc.action || '', abbr: '', status: '' };
    const appendOptions: AppendDocumentOptions = {
      link: context.link || context.url || '',
      status: actionObj.status || context.status || '',
      actionAbbr: actionObj.abbr || context.actionAbbr || '',
      updatePreviousStatus: context.updatePreviousStatus ?? true,
      previousRowStatus: context.previousRowStatus ?? 'Closed',
      sheetName: context.config?.logSheetName || context.sheetName,
      identityData,
      ...context.options
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
  }
}

declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WriteLogAction
  };
}

(globalThis as any).WriteLogAction = WriteLogAction;
