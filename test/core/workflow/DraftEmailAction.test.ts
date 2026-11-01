import { describe, it, expect, beforeEach } from 'vitest';
import { DraftEmailAction } from '../../../src/core/workflow/DraftEmailAction';
import { FakeEmailDraftAdapter } from '../../harness/fakes/FakeEmailDraftAdapter';
import { createValidatedArchitectureSubmittal } from '../../harness/factories/DocumentFactory';

describe('DraftEmailAction', () => {
  let action: DraftEmailAction;
  let fakeDraftAdapter: FakeEmailDraftAdapter;

  beforeEach(() => {
    action = new DraftEmailAction();
    fakeDraftAdapter = new FakeEmailDraftAdapter();
  });

  it('generates a referral email draft with toRefer template when incomingRouting === "To Refer"', async () => {
    const doc = createValidatedArchitectureSubmittal({
      disciplineDetails: {
        section: '081100',
        number: '001',
        title: 'Hollow Metal Doors',
        revision: '01'
      }
    });

    const context: any = {
      validatedDoc: doc,
      targetKey: '081100-001-01',
      projectAbbr: 'PRJ',
      title: 'Hollow Metal Doors',
      action: 'Received',
      incomingRouting: 'To Refer',
      driveFileUrl: 'https://drive.google.com/file/d/test1234/view',
      adapters: {
        emailDraftAdapter: fakeDraftAdapter
      }
    };

    const result = await action.execute(context);

    expect(fakeDraftAdapter.createdDrafts.length).toBe(1);
    const draft = fakeDraftAdapter.drafts[0];
    expect(draft.subject).toContain('Submittal for Review: 081100-001-01 Hollow Metal Doors');
    expect(draft.htmlBody).toContain('https://drive.google.com/file/d/test1234/view');
    expect(result.draftUrl).toBeDefined();
    expect(result.draftUrl).toContain('mail.google.com');
  });

  it('skips email draft creation on incoming submittals when incomingRouting !== "To Refer"', async () => {
    const doc = createValidatedArchitectureSubmittal();

    const context: any = {
      validatedDoc: doc,
      targetKey: '081100-001-01',
      action: 'Received',
      incomingRouting: 'To Review',
      adapters: {
        emailDraftAdapter: fakeDraftAdapter
      }
    };

    const result = await action.execute(context);

    expect(fakeDraftAdapter.createdDrafts.length).toBe(0);
    expect(result.draftUrl).toBeUndefined();
  });

  it('generates a rejected email draft when action === "Rejected"', async () => {
    const doc = createValidatedArchitectureSubmittal();

    const context: any = {
      validatedDoc: doc,
      targetKey: '081100-001-01',
      projectAbbr: 'PRJ',
      title: 'Hollow Metal Doors',
      action: 'Rejected',
      driveFileUrl: 'https://drive.google.com/file/d/test5678/view',
      adapters: {
        emailDraftAdapter: fakeDraftAdapter
      }
    };

    const result = await action.execute(context);

    expect(fakeDraftAdapter.createdDrafts.length).toBe(1);
    const draft = fakeDraftAdapter.drafts[0];
    expect(draft.subject).toContain('REJECTED');
    expect(draft.htmlBody).toContain('ACTION REQUIRED');
    expect(result.draftUrl).toBeDefined();
  });

  it('generates a standard outgoing email draft for approved actions', async () => {
    const doc = createValidatedArchitectureSubmittal();

    const context: any = {
      validatedDoc: doc,
      targetKey: '081100-001-01',
      projectAbbr: 'PRJ',
      title: 'Hollow Metal Doors',
      action: 'Approved',
      driveFileUrl: 'https://drive.google.com/file/d/test9999/view',
      adapters: {
        emailDraftAdapter: fakeDraftAdapter
      }
    };

    const result = await action.execute(context);

    expect(fakeDraftAdapter.createdDrafts.length).toBe(1);
    const draft = fakeDraftAdapter.drafts[0];
    expect(draft.subject).toContain('Approved');
    expect(result.draftUrl).toBeDefined();
  });
});
