/**
 * @file ReadLogAction.ts
 * @description DocumentAction implementation for reading validated document log entries and status transitions using abstract IdentityData.
 *
 * Wraps LogRepository.readLog() into a primitive DocumentAction handler operating strictly on IdentityData.
 */

export class ReadLogAction implements DocumentAction<ReadLogInput, ReadLogResult> {
  /**
   * Executes the read log action.
   *
   * @param input - ReadLogInput containing spreadsheetId, identityData or document & strategy, optional options, and logRepository.
   * @returns A Promise resolving to ReadLogResult.
   */
  async execute(input: ReadLogInput): Promise<ReadLogResult> {
    const logRepository =
      input.logRepository ||
      (typeof defaultLogRepository !== 'undefined'
        ? defaultLogRepository
        : (globalThis as any).defaultLogRepository);

    if (!logRepository) {
      throw new Error('LogRepository is required for ReadLogAction');
    }

    const identityData: IdentityData =
      input.identityData ||
      (input.strategy && input.document
        ? input.strategy.getIdentityData(input.document)
        : (undefined as any));

    if (!identityData) {
      throw new Error('IdentityData or document & strategy is required for ReadLogAction');
    }

    const readOptions: ReadLogOptions = {
      sheetName: input.sheetName,
      updatePreviousStatus: input.updatePreviousStatus,
      previousRowStatus: input.previousRowStatus
    };

    return logRepository.readLog(
      input.spreadsheetId,
      identityData,
      input.strategy,
      readOptions
    );
  }
}

declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReadLogAction
  };
}
