import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../../../src/core/specs/ValidationEngine';
import type { DocumentTypeSpec } from '../../../src/core/specs/DocumentTypeSpec';

describe('ValidationEngine - Submission & Dynamic Prompt Intercept', () => {
  const ffeSpec: DocumentTypeSpec = {
    key: 'SUBMITTAL_FFE',
    label: 'Submittal FF&E',
    name: 'Submittal Furniture, Fixtures & Equipment',
    identity: {
      format: '${specTag}-${revision}-${date}',
      groupFormat: '${specTag}',
      revisionGroupFormat: '${specTag}-${revision}',
    },
    fields: [
      {
        key: 'specTag',
        label: 'Spec Tag',
        type: 'string',
        required: true,
        picklistSource: {
          supportDataKey: 'SpecTags',
          valueColumnKey: 'tag',
          displayColumnKey: 'tag',
        },
      },
      {
        key: 'vendor',
        label: 'Vendor',
        type: 'string',
        required: true,
        picklistSource: {
          supportDataKey: 'Vendors',
          valueColumnKey: 'code',
          displayColumnKey: 'name',
        },
      },
      { key: 'specTitle', label: 'Spec Title', type: 'string', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'action', label: 'Action', type: 'enum', required: true },
      { key: 'contact', label: 'Contact', type: 'enum', required: true },
      { key: 'revision', label: 'Revision', type: 'string', required: false, defaultValue: '0' },
      { key: 'notes', label: 'Notes', type: 'multiline', required: false },
    ],
    storage: [
      {
        type: 'drive',
        rootFolderSearchTerms: ['FF&E'],
        closedRootFolderName: 'Closed',
      },
    ],
    workflows: [
      {
        context: 'GoogleDrive',
        sequence: ['AnalyzeDocument', 'MoveDocument', 'WriteLog'],
      },
    ],
    supportData: {
      Vendors: {
        key: 'Vendors',
        isShared: true,
        allowDynamicAddition: true,
        dynamicPrompts: [
          { columnKey: 'code', uiLabel: 'Vendor Code', required: true },
          { columnKey: 'notes', uiLabel: 'Vendor Notes', required: false },
        ],
        columns: [
          { key: 'code', type: 'string', isPrimaryKey: true, label: 'Vendor Code', required: true },
          { key: 'name', type: 'string', isDisplayLabel: true, label: 'Vendor Name', required: true },
          { key: 'notes', type: 'string', label: 'Vendor Notes', required: false },
        ],
        items: [
          { code: 'HERMAN_MILLER', name: 'Herman Miller' },
          { code: 'STEELCASE', name: 'Steelcase' },
        ],
      },
      SpecTags: {
        key: 'SpecTags',
        isShared: false,
        allowDynamicAddition: true,
        dynamicPrompts: ['ADD_TAG'],
        columns: [
          { key: 'tag', type: 'string', isPrimaryKey: true, label: 'Tag', required: true },
          { key: 'category', type: 'string', label: 'Category', required: false },
          { key: 'description', type: 'string', isDisplayLabel: true, label: 'Description', required: false },
        ],
        items: [
          { tag: 'FB101', category: 'FBE', description: 'Fabric Task Chair' },
        ],
      },
    },
  };

  it('should emit valid state when all required fields and known picklist items are provided', () => {
    const formInput = {
      specTag: 'FB101',
      vendor: 'Herman Miller',
      specTitle: 'Task Chair',
      date: '260815',
      action: 'Received',
      contact: 'INT',
      incomingRouting: 'To Review',
    };

    const result = ValidationEngine.validateSubmission(ffeSpec, formInput);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.data.vendor).toBe('HERMAN_MILLER');
      expect(result.data.specTag).toBe('FB101');
    }
  });

  it('should emit invalid state when missing top-level required fields', () => {
    const formInput = {
      specTag: 'FB101',
      // vendor is missing
      specTitle: 'Task Chair',
      date: '260815',
      action: 'Received',
      contact: 'INT',
    };

    const result = ValidationEngine.validateSubmission(ffeSpec, formInput);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.missingFields).toContain('Vendor');
    }
  });

  it('should detect unknown picklist item and return interaction_required with dynamicPrompts from SupportDataSpec', () => {
    const formInput = {
      specTag: 'FB101',
      vendor: 'Brand New Vendor Inc', // Unknown vendor
      specTitle: 'Task Chair',
      date: '260815',
      action: 'Received',
      contact: 'INT',
      incomingRouting: 'To Review',
    };

    const result = ValidationEngine.validateSubmission(ffeSpec, formInput);
    expect(result.status).toBe('interaction_required');
    if (result.status === 'interaction_required') {
      expect(result.supportDataKey).toBe('Vendors');
      expect(result.fieldKey).toBe('vendor');
      expect(result.userValue).toBe('Brand New Vendor Inc');
      expect(result.dynamicPrompts).toEqual([
        { columnKey: 'code', uiLabel: 'Vendor Code', required: true },
        { columnKey: 'notes', uiLabel: 'Vendor Notes', required: false },
      ]);
    }
  });

  it('should derive dynamicPrompts from columns when dynamicPrompts has string token or is not explicitly object-configured', () => {
    const formInput = {
      specTag: 'NEWTAG99', // Unknown tag
      vendor: 'Herman Miller',
      specTitle: 'Custom Desk',
      date: '260815',
      action: 'Received',
      contact: 'INT',
      incomingRouting: 'To Review',
    };

    const result = ValidationEngine.validateSubmission(ffeSpec, formInput);
    expect(result.status).toBe('interaction_required');
    if (result.status === 'interaction_required') {
      expect(result.supportDataKey).toBe('SpecTags');
      expect(result.fieldKey).toBe('specTag');
      expect(result.userValue).toBe('NEWTAG99');
      expect(result.dynamicPrompts.some((p) => p.columnKey === 'tag' && p.required === true)).toBe(true);
    }
  });

  it('should seamlessly pass skipped/unprompted optional columns as implicit blanks ("")', () => {
    const formInput = {
      specTag: 'FB101',
      vendor: 'Brand New Vendor Inc',
      code: 'BRAND_NEW', // Required prompt supplied
      // 'notes' is skipped (optional)
      specTitle: 'Task Chair',
      date: '260815',
      action: 'Received',
      contact: 'INT',
      incomingRouting: 'To Review',
    };

    const result = ValidationEngine.validateSubmission(ffeSpec, formInput);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.data.vendor).toBe('BRAND_NEW');
      expect(result.data.code).toBe('BRAND_NEW');
      expect(result.data.notes).toBe(''); // Seamless empty string fallback
    }
  });

  it('should emit invalid status with error when a user submits a required dynamic prompt with a blank value', () => {
    const formInput = {
      specTag: 'FB101',
      vendor: 'Brand New Vendor Inc',
      code: '   ', // Blank value submitted for required prompt
      specTitle: 'Task Chair',
      date: '260815',
      action: 'Received',
      contact: 'INT',
      incomingRouting: 'To Review',
      resumedFromDynamicPrompt: 'true',
    };

    const result = ValidationEngine.validateSubmission(ffeSpec, formInput);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toEqual(["Missing required support data field: Vendor Code"]);
      expect(result.missingFields).toEqual(["Vendor Code"]);
    }
  });

  it('should respect generic bypassDatasets option and validate cleanly', () => {
    const formInput = {
      specTag: 'FB101',
      vendor: 'Brand New Vendor Inc',
      specTitle: 'Task Chair',
      date: '260815',
      action: 'Received',
      contact: 'INT',
      incomingRouting: 'To Review',
    };

    const result = ValidationEngine.validateSubmission(ffeSpec, formInput, {
      bypassDatasets: ['Vendors'],
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.data.vendor).toBe('Brand New Vendor Inc');
    }
  });

  it('remains purely generic: does not enforce unconfigured or non-required incomingRouting field', () => {
    const formInputWithoutRouting = {
      specTag: 'FB101',
      vendor: 'Herman Miller',
      specTitle: 'Task Chair',
      date: '260815',
      action: 'Received', // action is Received but incomingRouting is not required in ffeSpec
      contact: 'INT',
    };

    const result = ValidationEngine.validateSubmission(ffeSpec, formInputWithoutRouting);
    expect(result.status).toBe('valid');
  });

  it('respects explicit interactionType configured directly on SupportDataSpec', () => {
    const customSpec: DocumentTypeSpec = {
      ...ffeSpec,
      supportData: {
        ...ffeSpec.supportData,
        Vendors: {
          ...ffeSpec.supportData!.Vendors,
          interactionType: 'CUSTOM_ADD_VENDOR_PROMPT',
        }
      }
    };

    const formInput = {
      specTag: 'FB101',
      vendor: 'Unseen Vendor Corp',
      specTitle: 'Task Chair',
      date: '260815',
      action: 'Received',
      contact: 'INT',
    };

    const result = ValidationEngine.validateSubmission(customSpec, formInput);
    expect(result.status).toBe('interaction_required');
    if (result.status === 'interaction_required') {
      expect(result.interactionType).toBe('CUSTOM_ADD_VENDOR_PROMPT');
    }
  });
});
