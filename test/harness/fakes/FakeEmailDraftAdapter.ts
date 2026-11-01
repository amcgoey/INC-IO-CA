import { DraftEmailOptions, DraftEmailResult, EmailDraftAdapter } from '../../../src/core/interfaces/EmailDraftAdapter';

export class FakeEmailDraftAdapter implements EmailDraftAdapter {
  public drafts: DraftEmailOptions[] = [];
  public createdDrafts: DraftEmailResult[] = [];
  public signature: string = "";

  getSignature(): string {
    return this.signature;
  }

  createDraft(options: DraftEmailOptions): DraftEmailResult {
    this.drafts.push(options);
    const draftId = `draft-${this.drafts.length}`;
    const draftUrl = `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`;
    const result: DraftEmailResult = {
      draftId,
      draftUrl,
      subject: options.subject
    };
    this.createdDrafts.push(result);
    return result;
  }

  reset(): void {
    this.drafts = [];
    this.createdDrafts = [];
  }
}
