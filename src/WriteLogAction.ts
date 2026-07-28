/**
 * @file WriteLogAction.ts
 * @description DocumentAction implementation for persisting validated document log entries using abstract IdentityData.
 *
 * Wraps LogRepository.appendDocument() into a primitive DocumentAction handler operating strictly on IdentityData.
 */

/**
 * Primitive workflow action that persists validated submittal documents to the log repository
 * using abstract IdentityData (IdentityGroup, IdentityRevisionGroup, Identity).
 */
class WriteLogAction implements DocumentAction<WriteLogInput, AppendDocumentResult> {
  /**
   * Executes the write log action.
   *
   * @param input - WriteLogInput containing spreadsheetId, document, strategy, optional identityData, options, and logRepository.
   * @returns A Promise resolving to AppendDocumentResult.
   */
  async execute(input: WriteLogInput): Promise<AppendDocumentResult> {
    const logRepository =
      input.logRepository ||
      (typeof defaultLogRepository !== 'undefined'
        ? defaultLogRepository
        : (globalThis as any).defaultLogRepository);

    if (!logRepository) {
      throw new Error('LogRepository is required for WriteLogAction');
    }

    const identityData: IdentityData =
      input.identityData || input.strategy.getIdentityData(input.document);

    const appendOptions: AppendDocumentOptions = {
      ...input.options,
      identityData
    };

    return logRepository.appendDocument(
      input.spreadsheetId,
      input.document,
      input.strategy,
      appendOptions
    );
  }
}

declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WriteLogAction
  };
}
