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

    it('should preserve baseSpec tabs and namedRanges when provided', () => {
      const baseSpec = {
        schemaVersion: '1.0.0',
        tabs: [
          { name: '_Config', rowCount: 50, columnCount: 20, isConfigTab: true },
          { name: '_Shared', rowCount: 100, columnCount: 20, isSharedTab: true },
        ],
        namedRanges: [
          { name: 'Config_Manifest', tabName: '_Config', rangeNotation: 'A1:B5', scope: 'Workbook' as const },
        ],
      };

      const workbookSpec = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSubmittalArchSpec], baseSpec);

      expect(workbookSpec.tabs.some((t) => t.name === '_Config')).toBe(true);
      expect(workbookSpec.tabs.some((t) => t.name === '_Shared')).toBe(true);
      expect(workbookSpec.tabs.some((t) => t.name === 'Submittal Arch')).toBe(true);
      expect(workbookSpec.namedRanges).toEqual(baseSpec.namedRanges);
    });
  });
});
