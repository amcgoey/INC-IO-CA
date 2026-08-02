/// <reference path="./types.ts" />
/**
 * @file MoveDocumentAction.ts
 * @description Standalone DocumentAction implementation for document relocation/filing using DriveFilingRepository.
 */

function resolveSubfolderPath(context: DocumentActionContext): string[] | undefined {
  if (context.subfolderPath) return context.subfolderPath;
  if (context.config && context.config.closedSubfolderMap && context.validatedDoc) {
    const disc = context.validatedDoc.disciplineDetails?.discipline;
    const mapped = disc ? context.config.closedSubfolderMap[disc] : undefined;
    return mapped ? [mapped] : undefined;
  }
  return undefined;
}

class MoveDocumentAction implements DocumentAction<DocumentActionContext, DocumentActionContext> {
  name: string = 'MoveDocument';

  /**
   * Executes file movement using DriveFilingRepository.
   *
   * @param context - Action context containing fileId/blob, targetFolderId, subfolderPath, and options.
   * @returns Promise resolving to updated context with fileId, url, localPath, and folderId.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    const repo =
      context.adapters?.driveFilingRepository ||
      context.driveFilingRepository;

    if (!repo) {
      throw new Error('MoveDocumentAction requires driveFilingRepository adapter');
    }

    if (!context.targetFolderId) {
      throw new Error('MoveDocumentAction requires targetFolderId in context');
    }

    const doc = context.validatedDoc || context.document;
    if (!doc && !context.fileId && !context.blob) {
      throw new Error('MoveDocumentAction requires validatedDoc or fileId/blob in context');
    }

    const result = await repo.fileDocument(
      { fileId: context.fileId, blob: context.blob },
      {
        targetFolderId: context.targetFolderId,
        subfolderPath: resolveSubfolderPath(context),
        newFileName: context.newFileName
      }
    );

    return {
      ...context,
      fileId: result.fileId,
      url: result.url,
      localPath: result.localPath,
      folderId: result.folderId
    };
  }
}

declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MoveDocumentAction,
    resolveSubfolderPath
  };
}

(globalThis as any).MoveDocumentAction = MoveDocumentAction;
(globalThis as any).resolveSubfolderPath = resolveSubfolderPath;
