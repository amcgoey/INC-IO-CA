import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { JsonWorkbookSpecAdapter } from '../../../src/core/specs/JsonWorkbookSpecAdapter';
import type { DocumentLogWorkbookSpec } from '../../../src/core/config/DocumentLogWorkbookSpec';
import type { DocumentLogWorkbookViewSpec } from '../../../src/core/config/DocumentLogWorkbookViewSpec';

describe('JsonWorkbookSpecAdapter', () => {
  const minimalValidBaseSpec: Partial<DocumentLogWorkbookSpec> = {
    schemaVersion: '1.0.0',
    tabs: [
      {
        name: '_AuditLog',
        title: 'Audit Log',
        rowCount: 7,
        columnCount: 10,
        isAuditLogTab: true,
        columns: [
          { id: 'timestamp', header: 'Timestamp' },
          { id: 'category', header: 'Category' },
          { id: 'eventType', header: 'EventType' },
          { id: 'actor', header: 'Actor' },
          { id: 'status', header: 'Status' },
          { id: 'details', header: 'Details' },
        ],
        seedRows: [
          [
            '2026-08-08T00:00:00.000Z',
            'SYSTEM',
            'SCHEMA_INIT',
            'system',
            'SUCCESS',
            'Initial MVT Template Provisioning',
          ],
        ],
      },
    ],
    namedRanges: [
      {
        name: 'AuditLog_Events',
        tabName: '_AuditLog',
        rangeNotation: 'A6:F7',
        scope: 'Workbook',
      },
    ],
  };

  const minimalValidViewSpec: DocumentLogWorkbookViewSpec = {
    titleRowStyle: {
      fillHex: '#666666',
      fillRgb: { red: 0.4, green: 0.4, blue: 0.4 },
      fontColorHex: '#FFFFFF',
      fontColorRgb: { red: 1.0, green: 1.0, blue: 1.0 },
      bold: true,
      fontSize: 27,
      fontFamily: 'Abril Fatface',
    },
    dateRowStyle: {
      fillHex: '#666666',
      fillRgb: { red: 0.4, green: 0.4, blue: 0.4 },
      fontColorHex: '#FFFFFF',
      fontColorRgb: { red: 1.0, green: 1.0, blue: 1.0 },
      italic: true,
      fontSize: 10,
      fontFamily: 'Raleway',
    },
    headerStyle: {
      fillHex: '#666666',
      fillRgb: { red: 0.4, green: 0.4, blue: 0.4 },
      fontColorHex: '#FFFFFF',
      fontColorRgb: { red: 1.0, green: 1.0, blue: 1.0 },
      bold: true,
      fontSize: 11,
      fontFamily: 'Raleway',
    },
    formulaRowStyle: {
      fontColorHex: '#B7B7B7',
      fontColorRgb: { red: 0.7176, green: 0.7176, blue: 0.7176 },
      fillHex: '#666666',
      fillRgb: { red: 0.4, green: 0.4, blue: 0.4 },
      italic: true,
      fontSize: 7,
      fontFamily: 'Raleway',
    },
    offsets: {
      TITLE_ROW_INDEX: 1,
      DATE_ROW_INDEX: 2,
      HEADER_ROW_INDEX: 3,
      FORMULA_ROW_INDEX: 4,
      TOP_BUFFER_ROW_INDEX: 5,
      BUFFER_ROW_INDEX: 5,
      FIRST_DATA_ROW_INDEX: 6,
      FIRST_DATA_ROW_OFFSET: 5,
    },
    columnWidths: {
      section: 100,
      number: 100,
    },
    defaultColumnWidth: 150,
    defaultFontFamily: 'Raleway',
    namedRangeFills: {
      MANIFEST_SCHEMA_VERSION: { red: 0.9451, green: 0.9529, blue: 0.9569 },
    },
    settingHeaderRanges: {
      _Config: ['A1:B1', 'A5:D5'],
    },
    statusColors: {
      Open: {
        hex: '#F4CCCC',
        rgb: { red: 0.9569, green: 0.8, blue: 0.8 },
      },
    },
  };

  describe('parseBaseSpec', () => {
    it('should successfully parse a valid JSON string into a valid base spec', () => {
      const jsonStr = JSON.stringify(minimalValidBaseSpec);
      const result = JsonWorkbookSpecAdapter.parseBaseSpec(jsonStr);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.spec.schemaVersion).toBe('1.0.0');
        expect(result.spec.tabs).toHaveLength(1);
        expect(result.spec.tabs?.[0].name).toBe('_AuditLog');
        expect(result.spec.namedRanges).toHaveLength(1);
      }
    });

    it('should successfully parse an in-memory object directly', () => {
      const result = JsonWorkbookSpecAdapter.parseBaseSpec(minimalValidBaseSpec);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.spec.schemaVersion).toBe('1.0.0');
      }
    });

    it('should catch JSON syntax errors gracefully', () => {
      const malformed = '{ "schemaVersion": "1.0.0", "tabs": [';
      const result = JsonWorkbookSpecAdapter.parseBaseSpec(malformed);

      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.errors[0]).toMatch(/Invalid JSON syntax:/);
      }
    });

    it('should return invalid for non-string and non-object inputs', () => {
      const numRes = JsonWorkbookSpecAdapter.parseBaseSpec(123 as any);
      expect(numRes.status).toBe('invalid');
      if (numRes.status === 'invalid') {
        expect(numRes.errors[0]).toBe('Expected JSON string or object input');
      }

      const nullRes = JsonWorkbookSpecAdapter.parseBaseSpec(null as any);
      expect(nullRes.status).toBe('invalid');
      if (nullRes.status === 'invalid') {
        expect(nullRes.errors[0]).toBe('Expected JSON string or object input');
      }
    });

    it('should accumulate structural validation errors on invalid base spec', () => {
      const invalidBase = {
        schemaVersion: '',
        tabs: [
          {
            name: '',
            rowCount: -1,
            columnCount: 0,
            columns: [
              {
                id: '',
                header: '',
                validationRule: {
                  type: 'INVALID_TYPE',
                  allowInvalid: 'not-a-bool',
                },
              },
            ],
          },
        ],
        namedRanges: [
          {
            name: '',
            tabName: '',
            rangeNotation: '',
            scope: 'InvalidScope',
          },
        ],
      };

      const result = JsonWorkbookSpecAdapter.parseBaseSpec(invalidBase);
      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
        expect(result.errors.some((e) => e.includes('tab name'))).toBe(true);
        expect(result.errors.some((e) => e.includes('rowCount'))).toBe(true);
        expect(result.errors.some((e) => e.includes('columnCount'))).toBe(true);
        expect(result.errors.some((e) => e.includes('column id'))).toBe(true);
        expect(result.errors.some((e) => e.includes('column header'))).toBe(true);
        expect(result.errors.some((e) => e.includes('validation rule type'))).toBe(true);
        expect(result.errors.some((e) => e.includes('namedRange name'))).toBe(true);
        expect(result.errors.some((e) => e.includes('namedRange tabName'))).toBe(true);
        expect(result.errors.some((e) => e.includes('namedRange rangeNotation'))).toBe(true);
        expect(result.errors.some((e) => e.includes('namedRange scope'))).toBe(true);
      }
    });
  });

  describe('parseViewSpec', () => {
    it('should successfully parse a valid JSON string into a valid view spec', () => {
      const jsonStr = JSON.stringify(minimalValidViewSpec);
      const result = JsonWorkbookSpecAdapter.parseViewSpec(jsonStr);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.spec.defaultFontFamily).toBe('Raleway');
        expect(result.spec.offsets.HEADER_ROW_INDEX).toBe(3);
        expect(result.spec.headerStyle.fillHex).toBe('#666666');
      }
    });

    it('should successfully parse an in-memory object directly', () => {
      const result = JsonWorkbookSpecAdapter.parseViewSpec(minimalValidViewSpec);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.spec.offsets.FIRST_DATA_ROW_INDEX).toBe(6);
      }
    });

    it('should catch JSON syntax errors gracefully', () => {
      const malformed = '{ "titleRowStyle": { ';
      const result = JsonWorkbookSpecAdapter.parseViewSpec(malformed);

      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.errors[0]).toMatch(/Invalid JSON syntax:/);
      }
    });

    it('should return invalid for non-string and non-object inputs', () => {
      const boolRes = JsonWorkbookSpecAdapter.parseViewSpec(false as any);
      expect(boolRes.status).toBe('invalid');
      if (boolRes.status === 'invalid') {
        expect(boolRes.errors[0]).toBe('Expected JSON string or object input');
      }
    });

    it('should accumulate structural validation errors on invalid view spec', () => {
      const invalidView = {
        titleRowStyle: {
          fillHex: '',
          fillRgb: { red: 2.5, green: -1, blue: 'blue' },
          fontColorHex: '',
          fontColorRgb: null,
          bold: 'yes',
          fontSize: -5,
          fontFamily: '',
        },
        offsets: {
          TITLE_ROW_INDEX: 'one',
          // missing remaining offset keys
        },
        columnWidths: {
          section: -10,
        },
        defaultColumnWidth: 0,
      };

      const result = JsonWorkbookSpecAdapter.parseViewSpec(invalidView);
      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.errors.some((e) => e.includes('titleRowStyle'))).toBe(true);
        expect(result.errors.some((e) => e.includes('dateRowStyle'))).toBe(true);
        expect(result.errors.some((e) => e.includes('headerStyle'))).toBe(true);
        expect(result.errors.some((e) => e.includes('formulaRowStyle'))).toBe(true);
        expect(result.errors.some((e) => e.includes('offsets'))).toBe(true);
        expect(result.errors.some((e) => e.includes('columnWidths'))).toBe(true);
        expect(result.errors.some((e) => e.includes('defaultColumnWidth'))).toBe(true);
      }
    });
  });

  describe('parse (polymorphic)', () => {
    it('should automatically route base spec input', () => {
      const result = JsonWorkbookSpecAdapter.parse(minimalValidBaseSpec);
      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.type).toBe('base');
        expect((result.spec as Partial<DocumentLogWorkbookSpec>).schemaVersion).toBe('1.0.0');
      }
    });

    it('should automatically route view spec input', () => {
      const result = JsonWorkbookSpecAdapter.parse(minimalValidViewSpec);
      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.type).toBe('view');
        expect((result.spec as DocumentLogWorkbookViewSpec).defaultFontFamily).toBe('Raleway');
      }
    });

    it('should return invalid when spec format cannot be inferred', () => {
      const result = JsonWorkbookSpecAdapter.parse({ unknownKey: 'value' });
      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.errors[0]).toMatch(/Cannot infer workbook spec type/);
      }
    });
  });

  describe('stringifyBaseSpec and stringifyViewSpec', () => {
    it('should serialize base spec into indented JSON and allow roundtrip', () => {
      const serialized = JsonWorkbookSpecAdapter.stringifyBaseSpec(minimalValidBaseSpec);
      expect(typeof serialized).toBe('string');
      expect(serialized).toContain('"schemaVersion": "1.0.0"');

      const roundtrip = JsonWorkbookSpecAdapter.parseBaseSpec(serialized);
      expect(roundtrip.status).toBe('valid');
      if (roundtrip.status === 'valid') {
        expect(roundtrip.spec).toEqual(minimalValidBaseSpec);
      }
    });

    it('should serialize view spec into indented JSON and allow roundtrip', () => {
      const serialized = JsonWorkbookSpecAdapter.stringifyViewSpec(minimalValidViewSpec);
      expect(typeof serialized).toBe('string');
      expect(serialized).toContain('"defaultFontFamily": "Raleway"');

      const roundtrip = JsonWorkbookSpecAdapter.parseViewSpec(serialized);
      expect(roundtrip.status).toBe('valid');
      if (roundtrip.status === 'valid') {
        expect(roundtrip.spec).toEqual(minimalValidViewSpec);
      }
    });

    it('should support custom indentation space', () => {
      const compact = JsonWorkbookSpecAdapter.stringifyBaseSpec(minimalValidBaseSpec, { space: 0 });
      expect(compact).not.toContain('\n');
    });
  });

  describe('Canonical JSON Specs Validation', () => {
    const specsDir = path.resolve(__dirname, '../../../src/specs');

    it('should parse and validate src/specs/workbook_base.json successfully', () => {
      const baseFilePath = path.join(specsDir, 'workbook_base.json');
      expect(fs.existsSync(baseFilePath)).toBe(true);

      const jsonText = fs.readFileSync(baseFilePath, 'utf-8');
      const result = JsonWorkbookSpecAdapter.parseBaseSpec(jsonText);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        const spec = result.spec;
        expect(spec.schemaVersion).toBe('1.0.0');
        expect(spec.tabs).toBeDefined();
        const auditTab = spec.tabs?.find((t) => t.name === '_AuditLog');
        expect(auditTab).toBeDefined();
        expect(auditTab?.isAuditLogTab).toBe(true);
        expect(auditTab?.columns?.length).toBe(6);
        expect(auditTab?.seedRows?.length).toBe(1);

        const auditNR = spec.namedRanges?.find((nr) => nr.name === 'AuditLog_Events');
        expect(auditNR).toBeDefined();
        expect(auditNR?.tabName).toBe('_AuditLog');
        expect(auditNR?.rangeNotation).toBe('A6:F7');
        expect(auditNR?.scope).toBe('Workbook');
      }
    });

    it('should parse and validate src/specs/workbook_view.json successfully', () => {
      const viewFilePath = path.join(specsDir, 'workbook_view.json');
      expect(fs.existsSync(viewFilePath)).toBe(true);

      const jsonText = fs.readFileSync(viewFilePath, 'utf-8');
      const result = JsonWorkbookSpecAdapter.parseViewSpec(jsonText);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        const spec = result.spec;
        expect(spec.offsets.TITLE_ROW_INDEX).toBe(1);
        expect(spec.offsets.DATE_ROW_INDEX).toBe(2);
        expect(spec.offsets.HEADER_ROW_INDEX).toBe(3);
        expect(spec.offsets.FORMULA_ROW_INDEX).toBe(4);
        expect(spec.offsets.FIRST_DATA_ROW_INDEX).toBe(6);
        expect(spec.offsets.FIRST_DATA_ROW_OFFSET).toBe(5);

        expect(spec.headerStyle.fillHex).toBe('#666666');
        expect(spec.headerStyle.bold).toBe(true);
        expect(spec.headerStyle.fontSize).toBe(11);
        expect(spec.titleRowStyle.fontSize).toBe(27);
        expect(spec.formulaRowStyle.fontSize).toBe(7);

        expect(spec.defaultColumnWidth).toBe(150);
        expect(spec.defaultFontFamily).toBe('Raleway');

        expect(spec.namedRangeFills?.['MANIFEST_SCHEMA_VERSION']).toBeDefined();
        expect(spec.settingHeaderRanges?.['_Config']).toEqual(['A1:B1', 'A5:D5']);
        expect(spec.statusColors?.['Open'].hex).toBe('#F4CCCC');
      }
    });
  });
});