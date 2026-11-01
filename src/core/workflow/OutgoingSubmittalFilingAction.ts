/// <reference path="../../types.ts" />
/**
 * @file OutgoingSubmittalFilingAction.ts
 * @description Pure Tier 1 DocumentAction for outgoing submittal filing lifecycle (Ticket 310).
 * Handles AppContext.GoogleDrive in-place rename + ANYONE_WITH_LINK sharing + deferred filing metadata,
 * and AppContext.Gmail direct move to Closed/<Subfolder>/ + ANYONE_WITH_LINK sharing.
 * Zero direct DriveApp or GmailApp calls (ADR-0013).
 */

import { DriveFilingRepository, FilingResult } from '../interfaces/DriveFilingRepository';

export class OutgoingSubmittalFilingAction
  implements DocumentAction<DocumentActionContext, DocumentActionContext> {
  name: string = 'OutgoingSubmittalFiling';

  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    const driveFilingRepository: DriveFilingRepository | undefined =
      context.adapters?.driveFilingRepository ||
      context.driveFilingRepository ||
      (globalThis as any).defaultDriveFilingRepository;

    if (!driveFilingRepository) {
      throw new Error('driveFilingRepository adapter is required for OutgoingSubmittalFilingAction');
    }

    const doc = context.validatedDoc || context.document;
    if (!doc) {
      throw new Error('validatedDoc or document is required for OutgoingSubmittalFilingAction');
    }

    const strategy = context.strategy;
    const targetKey = context.targetKey || (strategy?.getTargetKey ? strategy.getTargetKey(doc) : (
      doc.disciplineDetails?.section
        ? `${doc.disciplineDetails.section}-${doc.disciplineDetails.number || '001'}-${doc.disciplineDetails.revision || '00'}`
        : doc.disciplineDetails?.specTag || 'Submittal'
    ));

    // Resolve contact history chaining
    const prevHistory = context.contactHistory || '';
    const currentContact = (typeof doc.contact === 'string' ? doc.contact : '') || doc.listFields?.contact?.abbreviation || '';
    let chainedContactHistory = prevHistory;
    if (currentContact) {
      if (!prevHistory) {
        chainedContactHistory = currentContact;
      } else if (!prevHistory.split(/\s+/).includes(currentContact)) {
        chainedContactHistory = `${prevHistory} ${currentContact}`;
      }
    }

    const actionAbbr = context.selectedAction?.abbr || context.actionAbbr || '';

    // Generate standardized outgoing filename
    let baseFileName = '';
    if (strategy?.getFileName) {
      baseFileName = strategy.getFileName(doc, chainedContactHistory, actionAbbr);
    } else {
      const title = doc.disciplineDetails?.title || doc.disciplineDetails?.specTitle || doc.title || '';
      baseFileName = `${targetKey} ${title} - ${doc.date || ''} ${chainedContactHistory} ${actionAbbr}`.trim();
    }

    const cleanBase = baseFileName.replace(/^_+/, '').replace(/\.pdf$/i, '').trim();
    const finalFileName = `${cleanBase}.pdf`;

    const appContext = context.appContext || 'GoogleDrive';
    const fileId = context.fileId || context.driveFileId || (context.stagedReviewFile && context.stagedReviewFile.fileId);

    // Resolve target folder ID if needed
    let targetFolderId = context.targetFolderId || context.folderId || '';
    if (!targetFolderId && driveFilingRepository.resolveSubmittalsFolder && (context.spreadsheetId || context.logFileId)) {
      const res = driveFilingRepository.resolveSubmittalsFolder(context.spreadsheetId || context.logFileId!);
      targetFolderId = res.submittalsFolderId;
    }

    let filingResult: FilingResult;
    let isFiled = false;

    if (appContext === 'Gmail') {
      // In Gmail context: move and rename reviewed file directly into Submittals/Closed/<Subfolder>/<BaseFileName>.pdf
      let subfolders: string[] = [];
      if (strategy?.getFilingSubfolders) {
        subfolders = strategy.getFilingSubfolders(doc);
      }
      if (!subfolders || subfolders.length === 0) {
        const sub = doc.disciplineDetails?.section || doc.disciplineDetails?.specTag || 'General';
        subfolders = ['Closed', sub];
      }
      if (!subfolders.includes('Closed')) {
        subfolders = ['Closed', ...subfolders];
      }

      const filePayload = fileId ? { fileId } : (context.blob ? { blob: context.blob } : { fileId: 'temp-file-id' });
      filingResult = driveFilingRepository.fileDocument(
        filePayload,
        {
          targetFolderId,
          subfolderPath: subfolders,
          newFileName: finalFileName
        }
      );
      isFiled = true;
    } else {
      // In GoogleDrive context: rename staged ReviewDocument in place within Submittals/ (stripping leading _)
      if (typeof driveFilingRepository.renameDocument === 'function' && fileId) {
        filingResult = driveFilingRepository.renameDocument(fileId, finalFileName);
      } else {
        filingResult = driveFilingRepository.fileDocument(
          fileId ? { fileId } : { blob: context.blob },
          {
            targetFolderId,
            subfolderPath: [],
            newFileName: finalFileName
          }
        );
      }
      isFiled = false;
    }

    // Set ANYONE_WITH_LINK view permissions
    if (typeof driveFilingRepository.setSharing === 'function' && filingResult.fileId) {
      driveFilingRepository.setSharing(filingResult.fileId, 'ANYONE_WITH_LINK', 'VIEW');
    }

    // Extract deferred filing metadata for Success Card's "File the Submittal"
    const number = String(doc.disciplineDetails?.number || (doc as any).number || '').trim();
    const title = String(doc.disciplineDetails?.title || doc.disciplineDetails?.specTitle || doc.title || '').trim();
    const rev = String(doc.disciplineDetails?.revision || (doc as any).revision || (doc as any).rev || '').trim();
    let docType = String(doc.documentType || (doc as any).docType || '').trim();
    if (docType === 'Submittal' || !docType) {
      const disc = String(doc.disciplineDetails?.discipline || (doc as any).discipline || '').toLowerCase();
      if (disc.includes('ffe') || disc.includes('ff&e') || doc.disciplineDetails?.specTag) {
        docType = 'SUBMITTAL_FFE';
      } else {
        docType = 'SUBMITTAL_ARCH';
      }
    }

    return {
      ...context,
      fileId: filingResult.fileId,
      driveFileId: filingResult.fileId,
      driveFileUrl: filingResult.url,
      url: filingResult.url,
      newFileName: finalFileName,
      localPath: filingResult.localPath,
      folderId: filingResult.folderId,
      contactHistory: chainedContactHistory,
      targetKey,
      isFiled,
      number,
      title,
      rev,
      docType,
      deferredFiling: {
        number,
        title,
        rev,
        docType
      }
    };
  }
}
