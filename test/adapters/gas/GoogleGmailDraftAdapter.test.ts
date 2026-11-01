import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleGmailDraftAdapter } from '../../../src/adapters/gas/GoogleGmailDraftAdapter';

describe('GoogleGmailDraftAdapter', () => {
  let adapter: GoogleGmailDraftAdapter;
  let origGmailApp: any;
  let origGmail: any;

  beforeEach(() => {
    adapter = new GoogleGmailDraftAdapter();
    origGmailApp = (globalThis as any).GmailApp;
    origGmail = (globalThis as any).Gmail;
  });

  afterEach(() => {
    (globalThis as any).GmailApp = origGmailApp;
    (globalThis as any).Gmail = origGmail;
  });

  it('satisfies DraftEmailResult contract when GmailApp is undefined', () => {
    delete (globalThis as any).GmailApp;

    const result = adapter.createDraft({
      to: 'contractor@example.com',
      subject: '033000-001 Concrete Approved',
      body: 'Please find attached.'
    });

    expect(result).toEqual({
      draftId: '',
      draftUrl: '',
      subject: '033000-001 Concrete Approved'
    });
  });

  it('satisfies DraftEmailResult contract and creates draft with GmailApp', () => {
    const mockDraft = {
      getId: vi.fn().mockReturnValue('draft-abc-123'),
      getMessage: vi.fn().mockReturnValue({
        getId: vi.fn().mockReturnValue('msg-xyz-789')
      })
    };

    (globalThis as any).GmailApp = {
      createDraft: vi.fn().mockReturnValue(mockDraft)
    };

    const result = adapter.createDraft({
      to: 'contractor@example.com',
      subject: '033000-001 Concrete Submittal',
      body: 'Review completed.',
      htmlBody: '<p>Review completed.</p>'
    });

    expect((globalThis as any).GmailApp.createDraft).toHaveBeenCalledWith(
      'contractor@example.com',
      '033000-001 Concrete Submittal',
      'Review completed.',
      { htmlBody: '<p>Review completed.</p>' }
    );
    expect(result).toEqual({
      draftId: 'draft-abc-123',
      draftUrl: 'https://mail.google.com/mail/u/0/#drafts?compose=msg-xyz-789',
      subject: '033000-001 Concrete Submittal'
    });
  });

  it('returns signature when primary sendAs exists', () => {
    (globalThis as any).Gmail = {
      Users: {
        Settings: {
          SendAs: {
            list: vi.fn().mockReturnValue({
              sendAs: [
                { isPrimary: false, signature: 'Other' },
                { isPrimary: true, signature: '<p>Architect Signature</p>' }
              ]
            })
          }
        }
      }
    };

    const sig = adapter.getSignature();
    expect(sig).toBe('<p>Architect Signature</p>');
  });

  it('returns empty string when signature API is unavailable', () => {
    delete (globalThis as any).Gmail;
    const sig = adapter.getSignature();
    expect(sig).toBe('');
  });
});
