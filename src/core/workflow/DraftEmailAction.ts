/// <reference path="../../types.ts" />
/**
 * @file DraftEmailAction.ts
 * @description Pure Tier 1 DocumentAction for creating Gmail drafts via EmailDraftAdapter.
 * Zero direct GmailApp calls (ADR-0013).
 */

import { EMAIL_TEMPLATES } from '../../Config';
import { getDocumentTitle } from './WorkflowPolicy';
import { EmailDraftAdapter, DraftEmailResult } from '../interfaces/EmailDraftAdapter';

export class DraftEmailAction implements DocumentAction<DocumentActionContext, DocumentActionContext> {
  name: string = 'DraftEmail';

  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    const doc = context.validatedDoc || context.document;
    const actionName = context.action || context.selectedAction?.action || doc?.action || '';
    const incomingRouting = context.incomingRouting || doc?.incomingRouting || '';
    const isIncoming = actionName.toLowerCase() === 'received' || context.policy?.direction === 'incoming';

    // Incoming workflows only create an email draft when routed "To Refer"
    if (isIncoming && incomingRouting !== 'To Refer') {
      return context;
    }

    const emailDraftAdapter: EmailDraftAdapter | undefined =
      context.adapters?.emailDraftAdapter ||
      (context as any).emailDraftAdapter ||
      (globalThis as any).defaultEmailDraftAdapter;

    if (!emailDraftAdapter) {
      // If no draft adapter is configured, skip cleanly
      return context;
    }

    const projectAbbr = context.projectAbbr || '';
    const targetKey = context.targetKey || '';
    const title = context.title || (doc ? getDocumentTitle(doc) : '') || doc?.title || '';
    const url = context.driveFileUrl || context.url || '';
    const localPath = context.localPath || '';

    const templateParams = {
      projectAbbr,
      targetKey,
      title,
      action: actionName,
      url,
      localPath
    };

    let templateData: { subject: string; body: string };

    if (isIncoming) {
      templateData = EMAIL_TEMPLATES.toRefer(templateParams);
    } else if (actionName === 'Rejected') {
      templateData = EMAIL_TEMPLATES.rejectedOutgoing(templateParams);
    } else {
      templateData = EMAIL_TEMPLATES.standardOutgoing(templateParams);
    }

    const draftResult: DraftEmailResult = await emailDraftAdapter.createDraft({
      subject: templateData.subject,
      body: templateData.body,
      htmlBody: templateData.body
    });

    return {
      ...context,
      draftUrl: draftResult.draftUrl,
      draftId: draftResult.draftId,
      emailDraftResult: draftResult
    };
  }
}

(globalThis as any).DraftEmailAction = DraftEmailAction;
