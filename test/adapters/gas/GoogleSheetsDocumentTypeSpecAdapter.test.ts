import { describe, it, expect } from 'vitest';
import { GoogleSheetsDocumentTypeSpecAdapter } from '../../../src/adapters/gas/GoogleSheetsDocumentTypeSpecAdapter';
import type { DocumentTypeSpec } from '../../../src/core/specs/DocumentTypeSpec';

describe('GoogleSheetsDocumentTypeSpecAdapter', () => {
  const mockSubmittalArchSpec: DocumentTypeSpec = {
    key: 'SUBMITTAL_ARCH',
    label: 'Submittal Arch',
    name: 'Architectural Submittals',
    identity: {
      format: '${section}-${number}-${revision}',
      groupFormat: '${section}-${number}',
      revisionGroupFormat: '${section}',
    },
    fields: [
      { key: 'status', label: 'Status', type: 'list', required: true },
      { key: 'section', label: 'Section', type: 'string', numberFormat: '000000' },
      { key: 'number', label: 'Number', type: 'string', numberFormat: '000' },
      { key: 'revision', label: 'Revision', type: 'string', numberFormat: '0' },
      { key: 'title', label: 'Title', type: 'string', required: true },
      {
        key: 'calcFileName',
        label: 'Calc File Name',
        type: 'string',
        isCalculated: true,
        calcFormat: '${section}-${number}-${revision}',
      },
      {
        key: 'calcCustom',
        label: 'Calc Custom',
        type: 'string',
        isCalculated: true,
        formulaOrFunction: '=CUSTOM_FORMULA()',
      },
    ],
    storage: [
      {
        type: 'drive',
        rootFolderSearchTerms: ['Submittals'],
        closedRootFolderName: 'Closed',
      },
    ],
    workflows: [
      {
        context: 'INCOMING',
        sequence: ['extractPages', 'analyze', 'log'],
      },
    ],
  };

  describe('compileWorkbookSpec', () => {
    it('should compile DocumentTypeSpec to DocumentLogWorkbookSpec with Log Tab and calculated formulas', () => {
      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSubmittalArchSpec]);

      expect(workbookSpec).toBeDefined();
      expect(workbookSpec.tabs.length).toBeGreaterThanOrEqual(1);

      const logTab = workbookSpec.tabs.find((t) => t.name === 'Submittal Arch');
      expect(logTab).toBeDefined();
      expect(logTab?.isLogTab).toBe(true);
      expect(logTab?.columns).toBeDefined();
      expect(logTab?.columns?.length).toBe(7);

      const calcFileNameCol = logTab?.columns?.find((c) => c.id === 'calcFileName');
      expect(calcFileNameCol).toBeDefined();
      expect(calcFileNameCol?.formula).toBe(
        '=MAP(B4:B, C4:C, D4:D, LAMBDA(section, number, revision, TEXTJOIN("-", TRUE, IF(ISBLANK(section), "", section), IF(ISBLANK(number), "", number), IF(ISBLANK(revision), "", revision))))'
      );

      const calcCustomCol = logTab?.columns?.find((c) => c.id === 'calcCustom');
      expect(calcCustomCol).toBeDefined();
      expect(calcCustomCol?.formula).toBe('=CUSTOM_FORMULA()');
    });

    it('should derive correct column coordinate mapping for calculated fields', () => {
      const mockSpecWithShiftedCols: DocumentTypeSpec = {
        ...mockSubmittalArchSpec,
        key: 'MOCK_SHIFTED',
        label: 'Shifted Log',
        name: 'Shifted Log Spec',
        fields: [
          { key: 'colA', label: 'Col A', type: 'string' },
          { key: 'colB', label: 'Col B', type: 'string' },
          { key: 'colC', label: 'Col C', type: 'string' },
          { key: 'colD', label: 'Col D', type: 'string' },
          { key: 'colE', label: 'Col E', type: 'string' },
          {
            key: 'calcCol',
            label: 'Calc Col',
            type: 'string',
            isCalculated: true,
            calcFormat: '${colB}-${colE}',
          },
        ],
      };

      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSpecWithShiftedCols]);
      const logTab = workbookSpec.tabs.find((t) => t.name === 'Shifted Log');
      const calcCol = logTab?.columns?.find((c) => c.id === 'calcCol');

      expect(calcCol?.formula).toBe(
        '=MAP(B4:B, E4:E, LAMBDA(colB, colE, TEXTJOIN("-", TRUE, IF(ISBLANK(colB), "", colB), IF(ISBLANK(colE), "", colE))))'
      );
    });

    it('should generate _Config tab with Manifest, DocTypes, Identity, Storage, Workflows, and Fields tables', () => {
      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSubmittalArchSpec]);

      const configTab = workbookSpec.tabs.find((t) => t.name === '_Config');
      expect(configTab).toBeDefined();
      expect(configTab?.isConfigTab).toBe(true);
      expect(configTab?.seedRows).toBeDefined();

      const seedRows = configTab?.seedRows || [];

      // 1. Manifest Table (Row 1-5)
      expect(seedRows[0]).toEqual(['Key', 'Value']);
      expect(seedRows[1]).toEqual(['MANIFEST_SCHEMA_VERSION', '1.0.0']);
      expect(seedRows[2]).toEqual(['LOG_TITLE', 'INC Project Document Log']);
      expect(seedRows[3]).toEqual(['PROJECT_ABBREVIATION', 'INC']);
      expect(seedRows[4]).toEqual(['CONTACT_CHAIN_MAX', '-5']);

      // 2. DocTypes Table (Row 7-8)
      expect(seedRows[5]).toEqual(['', '']);
      expect(seedRows[6]).toEqual(['DocTypeKey', 'DisplayName', 'Prefix', 'LogTabName']);
      expect(seedRows[7]).toEqual(['SUBMITTAL_ARCH', 'Architectural Submittals', 'SUB-ARCH', 'Submittal Arch']);

      // 3. Identity Table
      expect(seedRows[8]).toEqual(['', '', '']);
      expect(seedRows[9]).toEqual(['Format', 'GroupFormat', 'RevisionGroupFormat']);
      expect(seedRows[10]).toEqual(['${section}-${number}-${revision}', '${section}-${number}', '${section}']);

      // 4. Storage Table
      expect(seedRows[11]).toEqual(['', '', '', '', '', '', '', '']);
      expect(seedRows[12]).toEqual([
        'Type',
        'RootFolderSearchTerms',
        'ProjectSearchTerms',
        'ClosedRootFolderName',
        'ClosedSubfolderFormat',
        'FilenamePrefix',
        'FilenameFormat',
        'CoverPageTemplateId',
      ]);
      expect(seedRows[13]).toEqual(['drive', 'Submittals', '', 'Closed', '', '', '', '']);

      // 5. Workflows Table
      expect(seedRows[14]).toEqual(['', '', '']);
      expect(seedRows[15]).toEqual(['Context', 'FieldMatches', 'Sequence']);
      expect(seedRows[16]).toEqual(['INCOMING', '', 'extractPages,analyze,log']);

      // 6. Fields Table
      expect(seedRows[17]).toEqual(['', '', '', '', '', '', '', '', '', '', '', '']);
      expect(seedRows[18]).toEqual([
        'Key',
        'Header',
        'Label',
        'Type',
        'IsCalculated',
        'FormulaOrFunction',
        'OptionsRange',
        'Required',
        'Description',
        'DefaultValue',
        'KeyNormalizationRule',
        'NumberFormat',
      ]);
      expect(seedRows[19]).toEqual([
        'status',
        'Status',
        'Status',
        'list',
        'FALSE',
        '',
        '',
        'TRUE',
        '',
        '',
        '',
        '',
      ]);
      expect(seedRows[20]).toEqual([
        'section',
        'Section',
        'Section',
        'string',
        'FALSE',
        '',
        '',
        'FALSE',
        '',
        '',
        '',
        '000000',
      ]);
    });

    it('should generate all required Workbook-scoped Named Ranges on _Config tab', () => {
      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSubmittalArchSpec]);

      const getNR = (name: string) => workbookSpec.namedRanges.find((r) => r.name === name);

      expect(getNR('MANIFEST_SCHEMA_VERSION')).toEqual({
        name: 'MANIFEST_SCHEMA_VERSION',
        tabName: '_Config',
        rangeNotation: 'B2',
        scope: 'Workbook',
      });

      expect(getNR('Config_Manifest')).toEqual({
        name: 'Config_Manifest',
        tabName: '_Config',
        rangeNotation: 'A1:B5',
        scope: 'Workbook',
      });

      expect(getNR('Config_DocTypes')).toEqual({
        name: 'Config_DocTypes',
        tabName: '_Config',
        rangeNotation: 'A7:D8',
        scope: 'Workbook',
      });

      expect(getNR('_Config_Doc_Types')).toEqual({
        name: '_Config_Doc_Types',
        tabName: '_Config',
        rangeNotation: 'A7:D8',
        scope: 'Workbook',
      });

      expect(getNR('Config_SUBMITTAL_ARCH')).toEqual({
        name: 'Config_SUBMITTAL_ARCH',
        tabName: '_Config',
        rangeNotation: 'A8:D8',
        scope: 'Workbook',
      });

      expect(getNR('Config_SUBMITTAL_ARCH_Identity')).toEqual({
        name: 'Config_SUBMITTAL_ARCH_Identity',
        tabName: '_Config',
        rangeNotation: 'A10:C11',
        scope: 'Workbook',
      });

      expect(getNR('Config_SUBMITTAL_ARCH_Storage')).toEqual({
        name: 'Config_SUBMITTAL_ARCH_Storage',
        tabName: '_Config',
        rangeNotation: 'A13:H14',
        scope: 'Workbook',
      });

      expect(getNR('Config_SUBMITTAL_ARCH_Workflows')).toEqual({
        name: 'Config_SUBMITTAL_ARCH_Workflows',
        tabName: '_Config',
        rangeNotation: 'A16:C17',
        scope: 'Workbook',
      });

      expect(getNR('Config_SUBMITTAL_ARCH_Fields')).toEqual({
        name: 'Config_SUBMITTAL_ARCH_Fields',
        tabName: '_Config',
        rangeNotation: 'A19:L26',
        scope: 'Workbook',
      });
    });

    it('should correctly stack tables and named ranges for multiple DocumentTypeSpecs', () => {
      const mockFfeSpec: DocumentTypeSpec = {
        key: 'SUBMITTAL_FFE',
        label: 'Submittal FF&E',
        name: 'FFE Submittals',
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
            sequence: ['Analyze', 'WriteLog'],
          },
        ],
      };

      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([
        mockSubmittalArchSpec,
        mockFfeSpec,
      ]);

      const configTab = workbookSpec.tabs.find((t) => t.name === '_Config');
      expect(configTab).toBeDefined();

      const docTypesNR = workbookSpec.namedRanges.find((r) => r.name === 'Config_DocTypes');
      expect(docTypesNR?.rangeNotation).toBe('A7:D9');

      const archFieldsNR = workbookSpec.namedRanges.find((r) => r.name === 'Config_SUBMITTAL_ARCH_Fields');
      expect(archFieldsNR).toBeDefined();

      const ffeIdentityNR = workbookSpec.namedRanges.find((r) => r.name === 'Config_SUBMITTAL_FFE_Identity');
      expect(ffeIdentityNR).toBeDefined();

      const ffeFieldsNR = workbookSpec.namedRanges.find((r) => r.name === 'Config_SUBMITTAL_FFE_Fields');
      expect(ffeFieldsNR).toBeDefined();
    });

    it('should route supportData with isShared: true to _Shared tab and isShared: false to <Type> Support tab', () => {
      const archSpecWithSupport: DocumentTypeSpec = {
        ...mockSubmittalArchSpec,
        supportData: {
          Contacts_Arch: {
            key: 'Contacts_Arch',
            isShared: false,
            columns: [
              { key: 'code', type: 'string', isPrimaryKey: true },
              { key: 'name', type: 'string', isDisplayLabel: true },
              { key: 'email', type: 'string' }
            ],
            items: [
              { code: 'ARCH', name: 'Architect', email: 'arch@example.com' },
              { code: 'GC', name: 'General Contractor', email: 'gc@example.com' }
            ]
          },
          Actions: {
            key: 'Actions',
            isShared: true,
            columns: [
              { key: 'code', type: 'string', isPrimaryKey: true },
              { key: 'name', type: 'string', isDisplayLabel: true }
            ],
            items: [
              { code: 'Received', name: 'Received' },
              { code: 'Approved', name: 'Approved' }
            ]
          }
        }
      };

      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([archSpecWithSupport]);

      const sharedTab = workbookSpec.tabs.find((t) => t.name === '_Shared');
      expect(sharedTab).toBeDefined();
      expect(sharedTab?.isSharedTab).toBe(true);
      expect(sharedTab?.seedRows).toBeDefined();
      expect(sharedTab?.seedRows?.[0]).toEqual(['code', 'name']);
      expect(sharedTab?.seedRows?.[1]).toEqual(['Received', 'Received']);
      expect(sharedTab?.seedRows?.[2]).toEqual(['Approved', 'Approved']);

      const actionsNR = workbookSpec.namedRanges.find((nr) => nr.name === 'Actions');
      expect(actionsNR).toBeDefined();
      expect(actionsNR?.tabName).toBe('_Shared');
      expect(actionsNR?.scope).toBe('Workbook');
      expect(actionsNR?.rangeNotation).toBe(`A2:B${sharedTab?.rowCount || 100}`);

      const supportTab = workbookSpec.tabs.find((t) => t.name === 'Submittal Arch Support');
      expect(supportTab).toBeDefined();
      expect(supportTab?.isSupportTab).toBe(true);
      expect(supportTab?.seedRows).toBeDefined();
      expect(supportTab?.seedRows?.[0]).toEqual(['code', 'name', 'email']);
      expect(supportTab?.seedRows?.[1]).toEqual(['ARCH', 'Architect', 'arch@example.com']);
      expect(supportTab?.seedRows?.[2]).toEqual(['GC', 'General Contractor', 'gc@example.com']);

      const contactsNR = workbookSpec.namedRanges.find((nr) => nr.name === 'Contacts_Arch');
      expect(contactsNR).toBeDefined();
      expect(contactsNR?.tabName).toBe('Submittal Arch Support');
      expect(contactsNR?.scope).toBe('Workbook');
      expect(contactsNR?.rangeNotation).toBe(`A2:C${supportTab?.rowCount || 50}`);
    });

    it('should layout multiple support datasets side-by-side on the same tab with full-table Named Ranges', () => {
      const ffeSpecWithMultiSupport: DocumentTypeSpec = {
        key: 'SUBMITTAL_FFE',
        label: 'Submittal FFE',
        name: 'FFE Submittals',
        identity: {
          format: '${specTag}-${revision}',
          groupFormat: '${specTag}',
          revisionGroupFormat: '${specTag}',
        },
        fields: [
          {
            key: 'vendor',
            label: 'Vendor',
            type: 'string',
            picklistSource: {
              supportDataKey: 'Vendors',
              valueColumnKey: 'code',
              displayColumnKey: 'name'
            }
          },
          {
            key: 'specTag',
            label: 'Spec Tag',
            type: 'string',
            picklistSource: {
              supportDataKey: 'SpecTags',
              valueColumnKey: 'tag',
              displayColumnKey: 'description'
            }
          }
        ],
        storage: [],
        workflows: [],
        supportData: {
          Vendors: {
            key: 'Vendors',
            isShared: false,
            columns: [
              { key: 'code', type: 'string', isPrimaryKey: true },
              { key: 'name', type: 'string', isDisplayLabel: true }
            ],
            items: [
              { code: 'HERMAN_MILLER', name: 'Herman Miller' },
              { code: 'STEELCASE', name: 'Steelcase' }
            ]
          },
          SpecTags: {
            key: 'SpecTags',
            isShared: false,
            columns: [
              { key: 'tag', type: 'string', isPrimaryKey: true },
              { key: 'category', type: 'string' },
              { key: 'description', type: 'string', isDisplayLabel: true }
            ],
            items: [
              { tag: 'FB101', category: 'FBE', description: 'Fabric Task Chair' },
              { tag: 'CG138', category: 'CASE', description: 'Conference Credenza' },
              { tag: 'LT205', category: 'LGT', description: 'Pendant Task Light' }
            ]
          }
        }
      };

      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([ffeSpecWithMultiSupport]);

      const supportTab = workbookSpec.tabs.find((t) => t.name === 'Submittal FFE Support');
      expect(supportTab).toBeDefined();
      expect(supportTab?.isSupportTab).toBe(true);

      expect(supportTab?.seedRows?.[0]).toEqual(['code', 'name', 'tag', 'category', 'description']);
      expect(supportTab?.seedRows?.[1]).toEqual(['HERMAN_MILLER', 'Herman Miller', 'FB101', 'FBE', 'Fabric Task Chair']);
      expect(supportTab?.seedRows?.[2]).toEqual(['STEELCASE', 'Steelcase', 'CG138', 'CASE', 'Conference Credenza']);
      expect(supportTab?.seedRows?.[3]).toEqual(['', '', 'LT205', 'LGT', 'Pendant Task Light']);

      const vendorsNR = workbookSpec.namedRanges.find((nr) => nr.name === 'Vendors');
      expect(vendorsNR).toEqual({
        name: 'Vendors',
        tabName: 'Submittal FFE Support',
        rangeNotation: `A2:B${supportTab?.rowCount || 50}`,
        scope: 'Workbook'
      });

      const specTagsNR = workbookSpec.namedRanges.find((nr) => nr.name === 'SpecTags');
      expect(specTagsNR).toEqual({
        name: 'SpecTags',
        tabName: 'Submittal FFE Support',
        rangeNotation: `C2:E${supportTab?.rowCount || 50}`,
        scope: 'Workbook'
      });

      const logTab = workbookSpec.tabs.find((t) => t.name === 'Submittal FFE');
      const vendorCol = logTab?.columns?.find((c) => c.id === 'vendor');
      expect(vendorCol?.validationRule).toEqual({
        type: 'LIST_FROM_RANGE',
        targetNamedRange: 'Vendors',
        allowInvalid: false
      });

      const specTagCol = logTab?.columns?.find((c) => c.id === 'specTag');
      expect(specTagCol?.validationRule).toEqual({
        type: 'LIST_FROM_RANGE',
        targetNamedRange: 'SpecTags',
        allowInvalid: false
      });
    });

    it('should deduplicate shared datasets across multiple specs on _Shared tab', () => {
      const specA: DocumentTypeSpec = {
        ...mockSubmittalArchSpec,
        key: 'SPEC_A',
        label: 'Spec A',
        name: 'Spec A',
        supportData: {
          Actions: {
            key: 'Actions',
            isShared: true,
            columns: [
              { key: 'code', type: 'string' },
              { key: 'name', type: 'string' }
            ],
            items: [
              { code: 'A1', name: 'Action 1' }
            ]
          }
        }
      };

      const specB: DocumentTypeSpec = {
        ...mockSubmittalArchSpec,
        key: 'SPEC_B',
        label: 'Spec B',
        name: 'Spec B',
        supportData: {
          Actions: {
            key: 'Actions',
            isShared: true,
            columns: [
              { key: 'code', type: 'string' },
              { key: 'name', type: 'string' }
            ],
            items: [
              { code: 'A1', name: 'Action 1' }
            ]
          }
        }
      };

      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([specA, specB]);
      const sharedTab = workbookSpec.tabs.find((t) => t.name === '_Shared');
      expect(sharedTab).toBeDefined();
      expect(sharedTab?.seedRows?.[0]).toEqual(['code', 'name']);

      const actionsNRs = workbookSpec.namedRanges.filter((nr) => nr.name === 'Actions');
      expect(actionsNRs.length).toBe(1);
    });
  });
});
