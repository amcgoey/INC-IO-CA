import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationEngine, type SpecValidationResult } from '../../../src/core/specs/ValidationEngine';
import type { DocumentTypeSpec } from '../../../src/core/specs/DocumentTypeSpec';
import { ValidationHookRegistry } from '../../../src/core/specs/ValidationHookRegistry';

describe('ValidationEngine', () => {
  let validSpec: DocumentTypeSpec;

  beforeEach(() => {
    validSpec = {
      key: 'SUBMITTAL_ARCH',
      label: 'Submittal Arch',
      name: 'Submittal Architecture',
      identity: {
        format: '${section}-${number}-${revision}-${date}',
        groupFormat: '${section}-${number}',
        revisionGroupFormat: '${section}-${number}-${revision}',
      },
      fields: [
        { key: 'section', label: 'Spec Section', type: 'string', required: true },
        { key: 'number', label: 'Submittal #', type: 'string', required: true },
        { key: 'revision', label: 'Rev', type: 'string', defaultValue: '0' },
        {
          key: 'calcFileName',
          label: 'File Name',
          type: 'string',
          isCalculated: true,
          calcFormat: '${section}-${number}-${revision}',
        },
        {
          key: 'contact',
          label: 'Contact',
          type: 'list',
          picklistSource: {
            supportDataKey: 'Contacts_Arch',
            valueColumnKey: 'code',
            displayColumnKey: 'name',
          },
        },
      ],
      storage: [
        {
          type: 'drive',
          rootFolderSearchTerms: ['Submittals'],
          closedRootFolderName: '01 - Closed Submittals',
          closedSubfolderFormat: 'Closed/${section}',
          filenameFormat: '${calcFileName}',
        },
      ],
      workflows: [
        {
          context: 'GoogleDrive',
          sequence: ['AnalyzeDocument', 'MoveDocument', 'WriteLog'],
        },
      ],
      supportData: {
        Contacts_Arch: {
          key: 'Contacts_Arch',
          columns: [
            { key: 'code', type: 'string', isPrimaryKey: true },
            { key: 'name', type: 'string', isDisplayLabel: true },
          ],
        },
      },
    };
  });

  it('should validate a complete, well-formed DocumentTypeSpec and return valid status', () => {
    const result: SpecValidationResult = ValidationEngine.validateSpec(validSpec);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.spec.key).toBe('SUBMITTAL_ARCH');
    }
  });

  it('should return invalid when spec is not an object or null', () => {
    expect(ValidationEngine.validateSpec(null).status).toBe('invalid');
    expect(ValidationEngine.validateSpec(undefined).status).toBe('invalid');
    expect(ValidationEngine.validateSpec('string').status).toBe('invalid');
  });

  it('should fail when naming triad (key, label, name) is missing or empty', () => {
    const invalidSpec: any = { ...validSpec, key: '', label: '   ', name: undefined };
    const result = ValidationEngine.validateSpec(invalidSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes('key'))).toBe(true);
      expect(result.errors.some((e) => e.includes('label'))).toBe(true);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    }
  });

  it('should fail when identity formats are missing or invalid', () => {
    const invalidSpec: any = {
      ...validSpec,
      identity: { format: '', groupFormat: undefined, revisionGroupFormat: ' ' },
    };
    const result = ValidationEngine.validateSpec(invalidSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes('identity'))).toBe(true);
    }
  });

  it('should detect duplicate field keys', () => {
    const duplicateFieldsSpec = {
      ...validSpec,
      fields: [
        ...validSpec.fields,
        { key: 'section', label: 'Duplicate Section', type: 'string' as const },
      ],
    };
    const result = ValidationEngine.validateSpec(duplicateFieldsSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes("Duplicate field key 'section'"))).toBe(true);
    }
  });

  it('should detect calculated fields missing calcFormat or formulaOrFunction', () => {
    const badCalcSpec = {
      ...validSpec,
      fields: [
        ...validSpec.fields,
        { key: 'brokenCalc', label: 'Broken Calc', type: 'string' as const, isCalculated: true },
      ],
    };
    const result = ValidationEngine.validateSpec(badCalcSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes('brokenCalc'))).toBe(true);
    }
  });

  it('should detect unbound template variables in identity format strings', () => {
    const unboundIdentitySpec = {
      ...validSpec,
      identity: {
        ...validSpec.identity,
        format: '${section}-${nonExistentField}-${date}',
      },
    };
    const result = ValidationEngine.validateSpec(unboundIdentitySpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes('nonExistentField'))).toBe(true);
    }
  });

  it('should detect self-referencing calcFormat', () => {
    const recursiveCalcSpec = {
      ...validSpec,
      fields: [
        {
          key: 'selfRef',
          label: 'Self Ref',
          type: 'string' as const,
          isCalculated: true,
          calcFormat: '${selfRef}-${section}',
        },
        ...validSpec.fields,
      ],
    };
    const result = ValidationEngine.validateSpec(recursiveCalcSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes('selfRef') && e.includes('self-reference'))).toBe(true);
    }
  });

  it('should detect invalid picklist linkages when supportDataKey does not exist in spec.supportData', () => {
    const missingSupportDataSpec: DocumentTypeSpec = {
      ...validSpec,
      fields: [
        ...validSpec.fields,
        {
          key: 'unknownPicklist',
          label: 'Unknown Picklist',
          type: 'list' as const,
          picklistSource: {
            supportDataKey: 'NonExistentDataset',
            valueColumnKey: 'code',
            displayColumnKey: 'name',
          },
        },
      ],
    };
    const result = ValidationEngine.validateSpec(missingSupportDataSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes("references non-existent supportDataKey 'NonExistentDataset'"))).toBe(true);
    }
  });

  it('should detect invalid picklist linkages when supportData is undefined', () => {
    const noSupportDataSpec: DocumentTypeSpec = {
      ...validSpec,
      supportData: undefined,
      fields: [
        { key: 'section', label: 'Section', type: 'string' },
        {
          key: 'contact',
          label: 'Contact',
          type: 'list',
          picklistSource: {
            supportDataKey: 'Contacts_Arch',
            valueColumnKey: 'code',
            displayColumnKey: 'name',
          },
        },
      ],
    };
    const result = ValidationEngine.validateSpec(noSupportDataSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes("references non-existent supportDataKey 'Contacts_Arch'"))).toBe(true);
    }
  });

  it('should detect invalid picklist linkages to non-existent columns in supportData', () => {
    const badPicklistSpec = {
      ...validSpec,
      fields: [
        ...validSpec.fields,
        {
          key: 'badPicklist',
          label: 'Bad Picklist',
          type: 'list' as const,
          picklistSource: {
            supportDataKey: 'Contacts_Arch',
            valueColumnKey: 'nonExistentCol',
            displayColumnKey: 'name',
          },
        },
      ],
    };
    const result = ValidationEngine.validateSpec(badPicklistSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes('nonExistentCol'))).toBe(true);
    }
  });

  it('should detect unbound template variables in storage closedSubfolderFormat and filenameFormat', () => {
    const unboundStorageSpec: DocumentTypeSpec = {
      ...validSpec,
      storage: [
        {
          type: 'drive',
          rootFolderSearchTerms: ['Submittals'],
          closedRootFolderName: 'Closed',
          closedSubfolderFormat: 'Closed/${unknownFolderVar}',
          filenameFormat: '${unknownFileVar}',
        },
      ],
    };
    const result = ValidationEngine.validateSpec(unboundStorageSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes("Unbound template variable 'unknownFolderVar' in storage[0].closedSubfolderFormat"))).toBe(true);
      expect(result.errors.some((e) => e.includes("Unbound template variable 'unknownFileVar' in storage[0].filenameFormat"))).toBe(true);
    }
  });

  it('should detect missing or empty action sequences in workflows', () => {
    const emptyWorkflowSpec = {
      ...validSpec,
      workflows: [
        {
          context: 'GoogleDrive',
          sequence: [],
        },
      ],
    };
    const result = ValidationEngine.validateSpec(emptyWorkflowSpec);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes('sequence'))).toBe(true);
    }
  });

  it('should record an error when requireRegisteredHook is true but hookRegistry is not provided', () => {
    const specWithHook: DocumentTypeSpec = {
      ...validSpec,
      validationHookKey: 'UnregisteredHook',
    };
    const result = ValidationEngine.validateSpec(specWithHook, {
      requireRegisteredHook: true,
    });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes("validationHookKey 'UnregisteredHook' requires hookRegistry when requireRegisteredHook is true"))).toBe(true);
    }
  });

  it('should validate against hookRegistry when requireRegisteredHook option is true', () => {
    const specWithHook: DocumentTypeSpec = {
      ...validSpec,
      validationHookKey: 'UnregisteredHook',
    };
    const registry = new ValidationHookRegistry();

    const result = ValidationEngine.validateSpec(specWithHook, {
      hookRegistry: registry,
      requireRegisteredHook: true,
    });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.some((e) => e.includes('UnregisteredHook'))).toBe(true);
    }

    // Now register hook and revalidate
    registry.registerHook('UnregisteredHook', () => {});
    const validResult = ValidationEngine.validateSpec(specWithHook, {
      hookRegistry: registry,
      requireRegisteredHook: true,
    });
    expect(validResult.status).toBe('valid');
  });
});
