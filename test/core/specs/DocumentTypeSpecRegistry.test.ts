import { describe, it, expect, beforeEach } from 'vitest';
import {
  DocumentTypeSpecRegistry,
  defaultDocumentTypeSpecRegistry,
} from '../../../src/core/specs/DocumentTypeSpecRegistry';
import type { DocumentTypeSpec } from '../../../src/core/specs/DocumentTypeSpec';

describe('DocumentTypeSpecRegistry (Tier 1 Pure Core)', () => {
  let registry: DocumentTypeSpecRegistry;

  beforeEach(() => {
    registry = new DocumentTypeSpecRegistry();
  });

  describe('Default Canonical Seed Initialization', () => {
    it('should pre-register canonical SUBMITTAL_ARCH and SUBMITTAL_FFE specs by default', () => {
      expect(registry.hasSpec('SUBMITTAL_ARCH')).toBe(true);
      expect(registry.hasSpec('SUBMITTAL_FFE')).toBe(true);

      const archSpec = registry.getSpec('SUBMITTAL_ARCH');
      expect(archSpec.key).toBe('SUBMITTAL_ARCH');
      expect(archSpec.label).toBe('Submittal Arch');
      expect(archSpec.name).toBe('Submittal Architecture');
      expect(archSpec.identity.format).toBe('${section}-${number}-${revision}-${date}');
      expect(archSpec.fields.length).toBeGreaterThanOrEqual(10);
      expect(archSpec.storage[0].type).toBe('drive');

      const ffeSpec = registry.getSpec('SUBMITTAL_FFE');
      expect(ffeSpec.key).toBe('SUBMITTAL_FFE');
      expect(ffeSpec.label).toBe('Submittal FF&E');
      expect(ffeSpec.name).toBe('Submittal Furniture, Fixtures & Equipment');
      expect(ffeSpec.validationHookKey).toBe('ffeStrategyValidationHook');
    });

    it('should resolve case-insensitively and through standard aliases', () => {
      // Arch aliases
      expect(registry.getSpec('submittal_arch').key).toBe('SUBMITTAL_ARCH');
      expect(registry.getSpec('Submittal Arch').key).toBe('SUBMITTAL_ARCH');
      expect(registry.getSpec('Architecture').key).toBe('SUBMITTAL_ARCH');
      expect(registry.getSpec('Submittal').key).toBe('SUBMITTAL_ARCH');

      // FF&E aliases
      expect(registry.getSpec('submittal_ffe').key).toBe('SUBMITTAL_FFE');
      expect(registry.getSpec('Submittal FFE').key).toBe('SUBMITTAL_FFE');
      expect(registry.getSpec('Submittal FF&E').key).toBe('SUBMITTAL_FFE');
      expect(registry.getSpec('FF&E').key).toBe('SUBMITTAL_FFE');
      expect(registry.getSpec('FFE').key).toBe('SUBMITTAL_FFE');
    });

    it('should report hasSpec correctly for valid keys and aliases', () => {
      expect(registry.hasSpec('submittal_arch')).toBe(true);
      expect(registry.hasSpec('Architecture')).toBe(true);
      expect(registry.hasSpec('Submittal')).toBe(true);
      expect(registry.hasSpec('FF&E')).toBe(true);
      expect(registry.hasSpec('NON_EXISTENT')).toBe(false);
    });

    it('should throw an error for unregistered document types', () => {
      expect(() => registry.getSpec('UNKNOWN_TYPE')).toThrow(
        /DocumentTypeSpec not registered for document type: UNKNOWN_TYPE/
      );
    });

    it('should return all primary distinct canonical specs with getAllSpecs()', () => {
      const allSpecs = registry.getAllSpecs();
      expect(allSpecs.length).toBe(2);
      const keys = allSpecs.map((s) => s.key);
      expect(keys).toContain('SUBMITTAL_ARCH');
      expect(keys).toContain('SUBMITTAL_FFE');
    });
  });

  describe('Spec Registration and Validation', () => {
    const validCustomSpec: DocumentTypeSpec = {
      key: 'RFI',
      label: 'RFI',
      name: 'Request for Information',
      identity: {
        format: '${rfiNumber}-${date}',
        groupFormat: '${rfiNumber}',
        revisionGroupFormat: '${rfiNumber}',
      },
      fields: [
        { key: 'rfiNumber', label: 'RFI Number', type: 'string', required: true },
        { key: 'date', label: 'Date', type: 'date', required: true },
      ],
      storage: [
        {
          type: 'drive',
          rootFolderSearchTerms: ['RFIs'],
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

    it('should register and retrieve a custom DocumentTypeSpec', () => {
      registry.registerSpec(validCustomSpec);
      expect(registry.hasSpec('RFI')).toBe(true);
      expect(registry.hasSpec('rfi')).toBe(true);

      const retrieved = registry.getSpec('RFI');
      expect(retrieved.key).toBe('RFI');
      expect(retrieved.name).toBe('Request for Information');

      const all = registry.getAllSpecs();
      expect(all.length).toBe(3);
    });

    it('should reject invalid DocumentTypeSpec upon registration by default', () => {
      const invalidSpec = {
        key: 'INVALID',
        fields: [],
        storage: [],
        workflows: [],
      } as unknown as DocumentTypeSpec;

      expect(() => registry.registerSpec(invalidSpec)).toThrow(
        /Invalid DocumentTypeSpec/
      );
    });

    it('should allow registering with validate: false if key is present', () => {
      const partialSpec = {
        key: 'UNVALIDATED_MOCK',
        label: 'Mock',
      } as unknown as DocumentTypeSpec;

      registry.registerSpec(partialSpec, { validate: false });
      expect(registry.hasSpec('UNVALIDATED_MOCK')).toBe(true);
      expect(registry.getSpec('unvalidated_mock').key).toBe('UNVALIDATED_MOCK');
    });

    it('should reject registerSpec with validate: false if key is missing', () => {
      const noKeySpec = {
        label: 'No Key',
      } as unknown as DocumentTypeSpec;

      expect(() => registry.registerSpec(noKeySpec, { validate: false })).toThrow(
        /Invalid DocumentTypeSpec: key is required/
      );
    });

    it('should support registering aliases explicitly', () => {
      registry.registerSpec(validCustomSpec, { aliases: ['RFI_LOG', 'REQUEST_FOR_INFO'] });
      expect(registry.hasSpec('RFI_LOG')).toBe(true);
      expect(registry.hasSpec('REQUEST_FOR_INFO')).toBe(true);
      expect(registry.getSpec('rfi_log').key).toBe('RFI');
    });
  });

  describe('Reset', () => {
    it('should restore default canonical specs and purge custom registrations', () => {
      const customSpec: DocumentTypeSpec = {
        key: 'TEMP_SPEC',
        label: 'Temp',
        name: 'Temporary Spec',
        identity: {
          format: '${id}',
          groupFormat: '${id}',
          revisionGroupFormat: '${id}',
        },
        fields: [{ key: 'id', label: 'ID', type: 'string', required: true }],
        storage: [{ type: 'drive', rootFolderSearchTerms: ['Temp'], closedRootFolderName: 'Closed' }],
        workflows: [{ context: 'GoogleDrive', sequence: ['WriteLog'] }],
      };

      registry.registerSpec(customSpec);
      expect(registry.hasSpec('TEMP_SPEC')).toBe(true);

      registry.reset();
      expect(registry.hasSpec('TEMP_SPEC')).toBe(false);
      expect(registry.hasSpec('SUBMITTAL_ARCH')).toBe(true);
      expect(registry.hasSpec('SUBMITTAL_FFE')).toBe(true);
      expect(registry.getAllSpecs().length).toBe(2);
    });
  });

  describe('Singleton defaultDocumentTypeSpecRegistry', () => {
    it('should be instantiated and pre-seeded with canonical specs', () => {
      expect(defaultDocumentTypeSpecRegistry).toBeDefined();
      expect(defaultDocumentTypeSpecRegistry.hasSpec('SUBMITTAL_ARCH')).toBe(true);
      expect(defaultDocumentTypeSpecRegistry.hasSpec('SUBMITTAL_FFE')).toBe(true);
    });
  });
});
