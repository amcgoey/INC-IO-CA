/// <reference path="./types.ts" />
/**
 * @file ReadLogAction.ts
 * @description DocumentAction implementation for reading validated document log entries and status transitions using abstract IdentityData.
 *
 * Operates on DocumentActionContext and wraps LogRepository.readLog() into a primitive DocumentAction handler.
 */

export class ReadLogAction implements DocumentAction<DocumentActionContext, DocumentActionContext> {
  name: string = 'ReadLog';

  /**
   * Executes the read log action.
   *
   * @param context - Action context containing validatedDoc, logRepository adapter, and optional log options.
   * @returns A Promise resolving to updated DocumentActionContext.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    const logRepository =
      context.adapters?.logRepository ||
      context.logRepository;

    if (!logRepository) {
      throw new Error('ReadLogAction requires logRepository adapter');
    }

    const doc = context.validatedDoc || context.document;
    if (!doc && !context.identityData) {
      throw new Error('ReadLogAction requires validatedDoc in context');
    }

    const getStrategyFn = (globalThis as any).getDocumentLogStrategy || (typeof (globalThis as any).getDocumentLogStrategy !== 'undefined' ? (globalThis as any).getDocumentLogStrategy : undefined);

    const strategy: DocumentLogStrategy | undefined =
      context.strategy ||
      (doc && getStrategyFn ? getStrategyFn(doc) : undefined);

    const identityData: IdentityData | undefined =
      context.identityData ||
      (strategy && doc ? strategy.getIdentityData(doc) : undefined);

    if (!identityData) {
      throw new Error('IdentityData or document & strategy is required for ReadLogAction');
    }

    const spreadsheetId = context.spreadsheetId || context.logFileId || '';

    const readOptions: ReadLogOptions = {
      sheetName: context.config?.logSheetName || context.sheetName,
      updatePreviousStatus: context.updatePreviousStatus,
      previousRowStatus: context.previousRowStatus
    };

    const readLogResult = await logRepository.readLog(
      spreadsheetId,
      identityData,
      strategy,
      readOptions
    );

    return {
      ...context,
      found: readLogResult.found,
      rowIndex: readLogResult.rowIndex,
      contactHistory: readLogResult.contactHistory,
      previousStatus: readLogResult.previousStatus,
      identityData: readLogResult.identityData,
      previousRowUpdated: readLogResult.previousRowUpdated,
      readLogResult
    };
  }
}
