import { describe, it, expect } from 'vitest';
import type {
  DocumentTypeSpec,
  DocumentFieldSpec,
  DriveStorageSpec,
  WorkflowTriggerSpec,
  SupportDataSpec,
} from '../../../src/core/specs/DocumentTypeSpec';

describe('DocumentTypeSpec Tier 1 Core Schema', () => {
  it('should allow constructing a valid DocumentTypeSpec object matching ADR-0045 architecture', () => {
    const archSupportData: Record<string, SupportDataSpec> = {
      Contacts_Arch: {
        key: 'Contacts_Arch',
        isShared: true,
        columns: [
          { key: 'code', type: 'string', isPrimaryKey: true },
          { key: 'name', type: 'string', isDisplayLabel: true },
          { key: 'email', type: 'string' },
        ],
        items: [
          { code: 'ARCH', name: 'Architect', email: 'arch@example.com' },
          { code: 'GC', name: 'General Contractor', email: 'gc@example.com' },
        ],
      },
    };

    const archFields: DocumentFieldSpec[] = [
      {
        key: 'section',
        label: 'Spec Section',
        type: 'string',
        required: true,
        header: 'Spec Section',
      },
      {
        key: 'number',
        label: 'Submittal Number',
        type: 'string',
        required: true,
        header: 'Submittal #',
      },
      {
        key: 'revision',
        label: 'Revision',
        type: 'string',
        required: false,
        defaultValue: '0',
        header: 'Rev',
      },
      {
        key: 'calcFileName',
        label: 'Calculated File Name',
        type: 'string',
        isCalculated: true,
        calcFormat: '${section}-${number}-${revision}',
        header: 'File Name',
      },
      {
        key: 'contact',
        label: 'Contact',
        type: 'list',
        header: 'Contact',
        picklistSource: {
          supportDataKey: 'Contacts_Arch',
          valueColumnKey: 'code',
          displayColumnKey: 'name',
        },
      },
    ];

     const archDriveStorage: DriveStorageSpec = {
      type: 'drive',
      rootFolderSearchTerms: ['Submittals', 'Submittal Log'],
      closedRootFolderName: '01 - Closed Submittals',
      closedSubfolderFormat: 'Closed/${section}',
      filenameFormat: '${calcFileName}',
      coverPageTemplateId: 'tpl_123',
    };

    const archWorkflows: WorkflowTriggerSpec[] = [
      {
        context: 'GoogleDrive',
        fieldMatches: { action: 'Received' },
        sequence: ['AnalyzeDocument', 'MoveDocument', 'WriteLog'],
      },
      {
        context: 'Gmail',
        sequence: ['TriageDocument', 'InsertPages', 'WriteLog'],
      },
    ];

    const spec: DocumentTypeSpec = {
      key: 'SUBMITTAL_ARCH',
      label: 'Submittal Arch',
      name: 'Submittal Architecture',
      identity: {
        format: '${section}-${number}-${revision}-${date}',
        groupFormat: '${section}-${number}',
        revisionGroupFormat: '${section}-${number}-${revision}',
      },
      fields: archFields,
      storage: [archDriveStorage],
      workflows: archWorkflows,
      supportData: archSupportData,
      ui: {
        confidenceThreshold: 0.85,
        sections: [
          { title: 'Core Details', fields: ['section', 'number', 'revision'] },
          { title: 'Routing', fields: ['contact'] },
        ],
      },
      validationHookKey: 'ArchValidationHook',
    };

    expect(spec.key).toBe('SUBMITTAL_ARCH');
    expect(spec.label).toBe('Submittal Arch');
    expect(spec.name).toBe('Submittal Architecture');
    expect(spec.identity.format).toBe('${section}-${number}-${revision}-${date}');
    expect(spec.fields).toHaveLength(5);
    expect(spec.storage[0].type).toBe('drive');
    expect(spec.workflows).toHaveLength(2);
    expect(spec.supportData?.Contacts_Arch.columns).toHaveLength(3);
    expect(spec.ui?.confidenceThreshold).toBe(0.85);
  });
});
