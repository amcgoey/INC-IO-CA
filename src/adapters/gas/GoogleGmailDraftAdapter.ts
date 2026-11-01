/**
 * @file GoogleGmailDraftAdapter.ts
 * @description Tier 2 GAS adapter implementing EmailDraftAdapter using GmailApp and the advanced Gmail service.
 */

import type { EmailDraftAdapter, DraftEmailOptions, DraftEmailResult } from '../../core/interfaces/EmailDraftAdapter';

export class GoogleGmailDraftAdapter implements EmailDraftAdapter {
  createDraft(options: DraftEmailOptions): DraftEmailResult {
    try {
      if (typeof GmailApp === 'undefined') {
        return {
          draftId: '',
          draftUrl: '',
          subject: options.subject
        };
      }
      const draft = GmailApp.createDraft(
        options.to || '',
        options.subject,
        options.body || '',
        { htmlBody: options.htmlBody || options.body }
      );
      const draftId = draft.getId();
      const messageId = draft.getMessage().getId();
      const draftUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`;
      return {
        draftId: draftId || '',
        draftUrl: draftUrl || '',
        subject: options.subject
      };
    } catch (_err) {
      return {
        draftId: '',
        draftUrl: '',
        subject: options.subject
      };
    }
  }

  getSignature(): string {
    try {
      if (typeof (globalThis as any).Gmail !== 'undefined') {
        const configs = (globalThis as any).Gmail.Users?.Settings?.SendAs?.list('me');
        const primary = configs?.sendAs?.find((c: any) => c.isPrimary);
        if (primary && primary.signature) {
          return primary.signature;
        }
      }
    } catch (_err) {}
    return '';
  }
}

export const defaultEmailDraftAdapter = new GoogleGmailDraftAdapter();
