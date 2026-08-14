import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { JsonDocumentTypeSpecAdapter } from '../../../src/core/specs/JsonDocumentTypeSpecAdapter';
import type { DocumentTypeSpec } from '../../../src/core/specs/DocumentTypeSpec';

describe('JsonDocumentTypeSpecAdapter', () => {
  const minimalValidSpec: DocumentTypeSpec = {
    key: 'SUBMITTAL_TEST',
    label: 'Submittal Test',
    name: 'Submittal Test Name',
    identity: {
      format: '${number}-${date}',
      groupFormat: '${number}',
      revisionGroupFormat: '${number}',
    },
    fields: [
      { key: 'number', label: 'Number', type: 'string', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
    ],
    storage: [
      {
        type: 'drive',
        rootFolderSearchTerms: ['Test'],
        closedRootFolderName: 'Closed',
      },
    ],
    workflows: [
      {
        context: 'GoogleDrive',
        sequence: ['AnalyzeDocument', 'WriteLog'],
      },
    ],
  };

  describe('parse', () => {
    it('should successfully parse a valid JSON string into a valid DocumentTypeSpec result', () => {
      const jsonStr = JSON.stringify(minimalValidSpec);
      const result = JsonDocumentTypeSpecAdapter.parse(jsonStr);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.spec.key).toBe('SUBMITTAL_TEST');
        expect(result.spec.fields).toHaveLength(2);
      }
    });

    it('should catch native JSON syntax errors gracefully and return invalid status', () => {
      const malformedJson = '{ "key": "SUBMITTAL_TEST", "label": ';
      const result = JsonDocumentTypeSpecAdapter.parse(malformedJson);

      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/Invalid JSON syntax:/);
      }
    });

    it('should return invalid when non-string input is provided', () => {
      const result = JsonDocumentTypeSpecAdapter.parse(123 as any);
      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.errors[0]).toBe('Expected JSON input to be a string');
      }
    });

    it('should catch structural validation errors from ValidationEngine and return invalid status', () => {
      const structurallyInvalidSpec = {
        key: 'SUBMITTAL_TEST',
        // missing label and name
        identity: {
          format: '${number}',
          groupFormat: '${number}',
          revisionGroupFormat: '${number}',
        },
        fields: [],
        storage: [],
        workflows: [],
      };
      const jsonStr = JSON.stringify(structurallyInvalidSpec);
      const result = JsonDocumentTypeSpecAdapter.parse(jsonStr);

      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') {
        expect(result.errors.some((e) => e.includes('label'))).toBe(true);
        expect(result.errors.some((e) => e.includes('fields'))).toBe(true);
      }
    });
  });

  describe('stringify', () => {
    it('should serialize a DocumentTypeSpec into a JSON string with indentation', () => {
      const jsonStr = JsonDocumentTypeSpecAdapter.stringify(minimalValidSpec);
      expect(typeof jsonStr).toBe('string');
      expect(jsonStr).toContain('"key": "SUBMITTAL_TEST"');

      // Re-parse to verify equality
      const parsed = JSON.parse(jsonStr);
      expect(parsed.key).toBe('SUBMITTAL_TEST');
      expect(parsed.identity.format).toBe('${number}-${date}');
    });

    it('should allow custom spacing options', () => {
      const compactJson = JsonDocumentTypeSpecAdapter.stringify(minimalValidSpec, { space: 0 });
      expect(compactJson).not.toContain('\n');
    });
  });

  describe('Canonical JSON Specs Validation & Roundtrip', () => {
    const specsDir = path.resolve(__dirname, '../../../src/specs');

    it('should parse and validate src/specs/submittal_arch.json successfully', () => {
      const archFilePath = path.join(specsDir, 'submittal_arch.json');
      expect(fs.existsSync(archFilePath)).toBe(true);

      const jsonText = fs.readFileSync(archFilePath, 'utf-8');
      const result = JsonDocumentTypeSpecAdapter.parse(jsonText);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        const spec = result.spec;
        expect(spec.key).toBe('SUBMITTAL_ARCH');
        expect(spec.label).toBe('Submittal Arch');
        expect(spec.name).toBe('Submittal Architecture');
        expect(spec.identity.format).toBe('${section}-${number}-${revision}-${date}');
        expect(spec.identity.groupFormat).toBe('${section}-${number}');
        expect(spec.identity.revisionGroupFormat).toBe('${section}-${number}-${revision}');
        expect(spec.fields.length).toBeGreaterThanOrEqual(10);
        expect(spec.storage[0].type).toBe('drive');
        expect(spec.supportData?.Contacts_Arch).toBeDefined();
        expect(spec.supportData?.Actions).toBeDefined();
        expect(spec.supportData?.CSI_DIVISIONS).toBeDefined();

        // Test stringify roundtrip
        const serialized = JsonDocumentTypeSpecAdapter.stringify(spec);
        const roundtripResult = JsonDocumentTypeSpecAdapter.parse(serialized);
        expect(roundtripResult.status).toBe('valid');
        if (roundtripResult.status === 'valid') {
          expect(roundtripResult.spec).toEqual(spec);
        }
      }
    });

    it('should parse and validate src/specs/submittal_ffe.json successfully', () => {
      const ffeFilePath = path.join(specsDir, 'submittal_ffe.json');
      expect(fs.existsSync(ffeFilePath)).toBe(true);

      const jsonText = fs.readFileSync(ffeFilePath, 'utf-8');
      const result = JsonDocumentTypeSpecAdapter.parse(jsonText);

      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        const spec = result.spec;
        expect(spec.key).toBe('SUBMITTAL_FFE');
        expect(spec.label).toBe('Submittal FF&E');
        expect(spec.name).toBe('Submittal Furniture, Fixtures & Equipment');
        expect(spec.identity.format).toBe('${specTag}-${vendor}-${revision}-${date}');
        expect(spec.identity.groupFormat).toBe('${specTag}');
        expect(spec.identity.revisionGroupFormat).toBe('${specTag}-${vendor}-${revision}');
        expect(spec.validationHookKey).toBe('ffeStrategyValidationHook');
        expect(spec.supportData?.Contacts_FFE).toBeDefined();
        expect(spec.supportData?.Actions).toBeDefined();
        expect(spec.supportData?.Vendors).toBeDefined();
        expect(spec.supportData?.SpecTags).toBeDefined();

        // Test stringify roundtrip
        const serialized = JsonDocumentTypeSpecAdapter.stringify(spec);
        const roundtripResult = JsonDocumentTypeSpecAdapter.parse(serialized);
        expect(roundtripResult.status).toBe('valid');
        if (roundtripResult.status === 'valid') {
          expect(roundtripResult.spec).toEqual(spec);
        }
      }
    });
  });
});
