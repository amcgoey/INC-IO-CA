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
      { key: 'section', label: 'Section', type: 'string', numberFormat: '000000', keyNormalizationRule: 'code' },
      { key: 'number', label: 'Number', type: 'string', numberFormat: '000' },
      { key: 'revision', label: 'Revision', type: 'string', numberFormat: '0', defaultValue: '0' },
      { key: 'title', label: 'Title', type: 'string', required: true, description: 'Submittal Title' },
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
        rootFolderSearchTerms: ['Submittals', 'Specs'],
        projectSearchTerms: ['Project Alpha', 'Site 1'],
        closedRootFolderName: 'Closed',
        closedSubfolderFormat: 'Closed/${section}',
        filenamePrefix: 'SUB-ARCH',
        filenameFormat: '${section}-${number}',
        coverPageTemplateId: 'tmpl_123',
      },
    ],
    workflows: [
      {
        context: 'INCOMING',
        fieldMatches: [{ field: 'status', value: 'Open' }],
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
      expect(seedRows[13]).toEqual([
        'drive',
        'Submittals,Specs',
        'Project Alpha,Site 1',
        'Closed',
        'Closed/${section}',
        'SUB-ARCH',
        '${section}-${number}',
        'tmpl_123',
      ]);

      // 5. Workflows Table
      expect(seedRows[14]).toEqual(['', '', '']);
      expect(seedRows[15]).toEqual(['Context', 'FieldMatches', 'Sequence']);
      expect(seedRows[16]).toEqual(['INCOMING', JSON.stringify([{ field: 'status', value: 'Open' }]), 'extractPages,analyze,log']);

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
        'code',
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

  describe('decompile', () => {
    function columnLetterToIndex(letter: string): number {
      let index = 0;
      for (let i = 0; i < letter.length; i++) {
        index = index * 26 + (letter.charCodeAt(i) - 64);
      }
      return index - 1;
    }

    function parseRangeNotation(notation: string): {
      startRowIndex: number;
      endRowIndex: number;
      startColumnIndex: number;
      endColumnIndex: number;
    } {
      const parts = notation.split(':');
      const startPart = parts[0].match(/([A-Z]+)(\d+)/);
      if (!startPart) {
        return { startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 26 };
      }
      const startCol = columnLetterToIndex(startPart[1]);
      const startRow = parseInt(startPart[2], 10) - 1;

      if (parts.length === 1) {
        return {
          startRowIndex: startRow,
          endRowIndex: startRow + 1,
          startColumnIndex: startCol,
          endColumnIndex: startCol + 1,
        };
      }

      const endPart = parts[1].match(/([A-Z]+)(\d+)/);
      if (!endPart) {
        return {
          startRowIndex: startRow,
          endRowIndex: startRow + 100,
          startColumnIndex: startCol,
          endColumnIndex: startCol + 26,
        };
      }
      const endCol = columnLetterToIndex(endPart[1]) + 1;
      const endRow = parseInt(endPart[2], 10);

      return {
        startRowIndex: startRow,
        endRowIndex: endRow,
        startColumnIndex: startCol,
        endColumnIndex: endCol,
      };
    }

    function workbookSpecToBatchData(workbookSpec: any, omitNamedRanges = false): any {
      const sheetMap = new Map<string, number>();
      const sheets = workbookSpec.tabs.map((tab: any, idx: number) => {
        const sheetId = idx + 1;
        sheetMap.set(tab.name, sheetId);

        const rowData = (tab.seedRows || []).map((row: any[]) => ({
          values: row.map((val: any) => {
            if (typeof val === 'number') {
              return { userEnteredValue: { numberValue: val } };
            }
            if (typeof val === 'boolean') {
              return { userEnteredValue: { boolValue: val } };
            }
            if (typeof val === 'string') {
              if (val.startsWith('=')) {
                return { userEnteredValue: { formulaValue: val } };
              }
              return { userEnteredValue: { stringValue: val } };
            }
            return { userEnteredValue: {} };
          }),
        }));

        return {
          properties: {
            sheetId,
            title: tab.name,
          },
          data: [
            {
              rowData,
            },
          ],
        };
      });

      const namedRanges = omitNamedRanges
        ? []
        : workbookSpec.namedRanges.map((nr: any, idx: number) => {
            const sheetId = sheetMap.get(nr.tabName) || 1;
            const rangeCoords = parseRangeNotation(nr.rangeNotation);
            return {
              name: nr.name,
              namedRangeId: `nr_${idx}`,
              range: {
                sheetId,
                ...rangeCoords,
              },
            };
          });

      return {
        spreadsheetId: 'test-ss-123',
        properties: {
          title: 'INC Project Document Log',
        },
        namedRanges,
        sheets,
      };
    }

    it('should decompile a compiled workbook back into a valid DocumentTypeSpec with full field properties', () => {
      const compiled = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSubmittalArchSpec]);
      const batchData = workbookSpecToBatchData(compiled);

      const results = GoogleSheetsDocumentTypeSpecAdapter.decompile(batchData);
      expect(results).toBeDefined();
      expect(results.length).toBe(1);

      const res = results[0];
      expect(res.status).toBe('valid');
      if (res.status === 'valid') {
        expect(res.spec.key).toBe(mockSubmittalArchSpec.key);
        expect(res.spec.name).toBe(mockSubmittalArchSpec.name);
        expect(res.spec.label).toBe(mockSubmittalArchSpec.label);
        expect(res.spec.identity).toEqual(mockSubmittalArchSpec.identity);
        expect(res.spec.fields.length).toBe(mockSubmittalArchSpec.fields.length);

        const sectionField = res.spec.fields.find((f) => f.key === 'section');
        expect(sectionField?.numberFormat).toBe('000000');
        expect(sectionField?.keyNormalizationRule).toBe('code');

        const revisionField = res.spec.fields.find((f) => f.key === 'revision');
        expect(revisionField?.defaultValue).toBe('0');

        const calcFileName = res.spec.fields.find((f) => f.key === 'calcFileName');
        expect(calcFileName?.isCalculated).toBe(true);
        expect(calcFileName?.calcFormat).toBe('${section}-${number}-${revision}');

        const calcCustom = res.spec.fields.find((f) => f.key === 'calcCustom');
        expect(calcCustom?.isCalculated).toBe(true);
        expect(calcCustom?.formulaOrFunction).toBe('=CUSTOM_FORMULA()');

        expect(res.spec.storage.length).toBe(1);
        const driveStorage = res.spec.storage[0] as any;
        expect(driveStorage.type).toBe('drive');
        expect(driveStorage.rootFolderSearchTerms).toEqual(['Submittals', 'Specs']);
        expect(driveStorage.projectSearchTerms).toEqual(['Project Alpha', 'Site 1']);
        expect(driveStorage.closedRootFolderName).toBe('Closed');
        expect(driveStorage.closedSubfolderFormat).toBe('Closed/${section}');
        expect(driveStorage.filenamePrefix).toBe('SUB-ARCH');
        expect(driveStorage.filenameFormat).toBe('${section}-${number}');
        expect(driveStorage.coverPageTemplateId).toBe('tmpl_123');

        expect(res.spec.workflows.length).toBe(1);
        expect(res.spec.workflows[0].context).toBe('INCOMING');
        expect(res.spec.workflows[0].fieldMatches).toEqual([{ field: 'status', value: 'Open' }]);
        expect(res.spec.workflows[0].sequence).toEqual(['extractPages', 'analyze', 'log']);
      }
    });

    it('should decompile correctly using sequential parsing fallback when named ranges are absent', () => {
      const compiled = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSubmittalArchSpec]);
      const batchDataWithoutNRs = workbookSpecToBatchData(compiled, true);

      const results = GoogleSheetsDocumentTypeSpecAdapter.decompile(batchDataWithoutNRs);
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('valid');
      if (results[0].status === 'valid') {
        expect(results[0].spec.key).toBe('SUBMITTAL_ARCH');
        expect(results[0].spec.identity.format).toBe('${section}-${number}-${revision}');
        expect(results[0].spec.fields.length).toBe(mockSubmittalArchSpec.fields.length);
      }
    });

    it('should decompile multiple specs with shared and per-type support tabs', () => {
      const ffeSpecWithMultiSupport: DocumentTypeSpec = {
        key: 'SUBMITTAL_FFE',
        label: 'Submittal FFE',
        name: 'FFE Submittals',
        identity: {
          format: '${specTag}-${vendor}-${revision}',
          groupFormat: '${specTag}-${vendor}',
          revisionGroupFormat: '${specTag}',
        },
        fields: [
          { key: 'specTag', label: 'Spec Tag', type: 'string', required: true, optionsRange: 'SpecTags' },
          { key: 'vendor', label: 'Vendor', type: 'string', required: true, optionsRange: 'Vendors' },
          { key: 'revision', label: 'Revision', type: 'string', numberFormat: '0' },
          { key: 'status', label: 'Status', type: 'list', required: true, optionsRange: 'Statuses' },
        ],
        storage: [
          {
            type: 'drive',
            rootFolderSearchTerms: ['FFE', 'Submittals'],
            closedRootFolderName: 'Closed FFE',
          },
        ],
        workflows: [
          {
            context: 'INCOMING',
            sequence: ['extractPages', 'analyze', 'log'],
          },
        ],
        supportData: {
          Statuses: {
            key: 'Statuses',
            isShared: true,
            columns: [
              { key: 'code', type: 'string' },
              { key: 'name', type: 'string' },
            ],
            items: [
              { code: 'OPEN', name: 'Open' },
              { code: 'CLOSED', name: 'Closed' },
            ],
          },
          Vendors: {
            key: 'Vendors',
            isShared: false,
            columns: [
              { key: 'code', type: 'string' },
              { key: 'name', type: 'string' },
            ],
            items: [
              { code: 'HERMAN_MILLER', name: 'Herman Miller' },
              { code: 'STEELCASE', name: 'Steelcase' },
            ],
          },
          SpecTags: {
            key: 'SpecTags',
            isShared: false,
            columns: [
              { key: 'tag', type: 'string' },
              { key: 'category', type: 'string' },
              { key: 'description', type: 'string' },
            ],
            items: [
              { tag: 'FB101', category: 'FBE', description: 'Fabric Task Chair' },
              { tag: 'CG138', category: 'CASE', description: 'Conference Credenza' },
            ],
          },
        },
      };

      const compiled = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([
        mockSubmittalArchSpec,
        ffeSpecWithMultiSupport,
      ]);
      const batchData = workbookSpecToBatchData(compiled);

      const results = GoogleSheetsDocumentTypeSpecAdapter.decompile(batchData);
      expect(results.length).toBe(2);

      const archResult = results.find((r) => r.status === 'valid' && r.spec.key === 'SUBMITTAL_ARCH');
      const ffeResult = results.find((r) => r.status === 'valid' && r.spec.key === 'SUBMITTAL_FFE');

      expect(archResult).toBeDefined();
      expect(ffeResult).toBeDefined();

      if (ffeResult && ffeResult.status === 'valid') {
        expect(ffeResult.spec.supportData).toBeDefined();
        expect(ffeResult.spec.supportData?.['Statuses']).toBeDefined();
        expect(ffeResult.spec.supportData?.['Vendors']).toBeDefined();
        expect(ffeResult.spec.supportData?.['SpecTags']).toBeDefined();
        expect(ffeResult.spec.supportData?.['Vendors'].items?.length).toBe(2);
        expect(ffeResult.spec.supportData?.['SpecTags'].items?.length).toBe(2);
      }
    });

    it('should decompile via SpreadsheetBatchReaderAdapter instance and catch errors gracefully', () => {
      const compiled = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSubmittalArchSpec]);
      const batchData = workbookSpecToBatchData(compiled);

      const mockReader: any = {
        readWorkbookBatch: (spreadsheetId: string) => {
          expect(spreadsheetId).toBe('test-ss-456');
          return batchData;
        },
      };

      const results = GoogleSheetsDocumentTypeSpecAdapter.decompile(mockReader, 'test-ss-456');
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('valid');

      // Missing spreadsheetId
      const missingIdResult = GoogleSheetsDocumentTypeSpecAdapter.decompile(mockReader);
      expect(missingIdResult[0].status).toBe('invalid');
      expect(missingIdResult[0].errors).toContain('Missing required spreadsheetId for SpreadsheetBatchReaderAdapter');

      // Throwing reader
      const throwingReader: any = {
        readWorkbookBatch: () => {
          throw new Error('API quota exceeded');
        },
      };
      const errorResult = GoogleSheetsDocumentTypeSpecAdapter.decompile(throwingReader, 'test-ss-fail');
      expect(errorResult[0].status).toBe('invalid');
      expect(errorResult[0].errors[0]).toContain('Spreadsheet batch read error: API quota exceeded');
    });

    it('should return invalid status on null, missing, or corrupted batch data without crashing', () => {
      const nullResult = GoogleSheetsDocumentTypeSpecAdapter.decompile(null as any);
      expect(nullResult[0].status).toBe('invalid');
      expect(nullResult[0].errors).toContain('Invalid or missing spreadsheet batch data');

      const noSheetsResult = GoogleSheetsDocumentTypeSpecAdapter.decompile({ sheets: [] } as any);
      expect(noSheetsResult[0].status).toBe('invalid');
      expect(noSheetsResult[0].errors).toContain('Workbook is missing _Config tab');

      const noConfigResult = GoogleSheetsDocumentTypeSpecAdapter.decompile({
        sheets: [{ properties: { title: 'Log Tab' }, data: [] }],
      } as any);
      expect(noConfigResult[0].status).toBe('invalid');
      expect(noConfigResult[0].errors).toContain('Workbook is missing _Config tab');
    });

    it('should return validation errors when _Config tab contains invalid spec data', () => {
      const invalidConfigTab = {
        properties: { sheetId: 1, title: '_Config' },
        data: [
          {
            rowData: [
              { values: [{ userEnteredValue: { stringValue: 'Key' } }, { userEnteredValue: { stringValue: 'Value' } }] },
              { values: [{ userEnteredValue: { stringValue: 'MANIFEST_SCHEMA_VERSION' } }, { userEnteredValue: { stringValue: '1.0.0' } }] },
              { values: [{ userEnteredValue: { stringValue: '' } }] },
              { values: [{ userEnteredValue: { stringValue: 'DocTypeKey' } }, { userEnteredValue: { stringValue: 'DisplayName' } }] },
              { values: [{ userEnteredValue: { stringValue: 'BAD_SPEC' } }, { userEnteredValue: { stringValue: 'Bad Spec' } }, { userEnteredValue: { stringValue: 'BAD' } }, { userEnteredValue: { stringValue: 'Bad' } }] },
              { values: [{ userEnteredValue: { stringValue: '' } }] },
              { values: [{ userEnteredValue: { stringValue: 'Format' } }, { userEnteredValue: { stringValue: 'GroupFormat' } }, { userEnteredValue: { stringValue: 'RevisionGroupFormat' } }] },
              { values: [{ userEnteredValue: { stringValue: '' } }, { userEnteredValue: { stringValue: '' } }, { userEnteredValue: { stringValue: '' } }] },
            ],
          },
        ],
      };

      const batchData: any = {
        spreadsheetId: 'test-ss-err',
        namedRanges: [],
        sheets: [invalidConfigTab],
      };

      const results = GoogleSheetsDocumentTypeSpecAdapter.decompile(batchData);
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('invalid');
      if (results[0].status === 'invalid') {
        expect(results[0].errors.length).toBeGreaterThan(0);
      }
    });
  });
});
