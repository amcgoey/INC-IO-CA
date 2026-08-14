/**
 * @file DocumentTypeSpecRegistry.ts
 * @description Central Tier 1 registry managing, validating, and serving DocumentTypeSpec instances.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

globalThis.__currentFileTier = 1;

import type { DocumentTypeSpec } from './DocumentTypeSpec';
import { ValidationEngine } from './ValidationEngine';
import archSpecJson from '../../specs/submittal_arch.json';
import ffeSpecJson from '../../specs/submittal_ffe.json';

export interface RegisterSpecOptions {
  validate?: boolean;
  aliases?: string[];
}

export class DocumentTypeSpecRegistry {
  private specs: Map<string, DocumentTypeSpec>;
  private aliases: Map<string, string>;

  constructor() {
    this.specs = new Map<string, DocumentTypeSpec>();
    this.aliases = new Map<string, string>();
    this.reset();
  }

  /**
   * Registers a DocumentTypeSpec instance in the registry.
   * Validates spec structure via ValidationEngine by default.
   */
  public registerSpec(
    spec: DocumentTypeSpec,
    options?: RegisterSpecOptions
  ): void {
    if (!options || options.validate !== false) {
      const validationResult = ValidationEngine.validateSpec(spec);
      if (validationResult.status === 'invalid') {
        throw new Error(
          'Invalid DocumentTypeSpec: ' + validationResult.errors.join(', ')
        );
      }
    } else if (!spec || typeof spec !== 'object' || !spec.key) {
      throw new Error('Invalid DocumentTypeSpec: key is required');
    }

    this.specs.set(spec.key, spec);
    this.aliases.set(spec.key.toLowerCase(), spec.key);

    if (options?.aliases) {
      for (const alias of options.aliases) {
        if (alias && typeof alias === 'string') {
          this.aliases.set(alias.toLowerCase().trim(), spec.key);
        }
      }
    }
  }

  /**
   * Finds the canonical spec key for a given document type string,
   * supporting case-insensitivity and registered aliases.
   */
  public findSpecKey(documentType: string): string | undefined {
    if (!documentType || typeof documentType !== 'string') return undefined;

    if (this.specs.has(documentType)) return documentType;

    const lower = documentType.toLowerCase().trim();

    if (this.aliases.has(lower)) {
      return this.aliases.get(lower);
    }

    for (const key of this.specs.keys()) {
      if (key.toLowerCase() === lower) return key;
    }

    return undefined;
  }

  /**
   * Retrieves a DocumentTypeSpec by document type key or alias.
   * Throws an error if not registered.
   */
  public getSpec(documentType: string): DocumentTypeSpec {
    const key = this.findSpecKey(documentType);
    if (key && this.specs.has(key)) {
      return this.specs.get(key)!;
    }
    throw new Error('DocumentTypeSpec not registered for document type: ' + documentType);
  }

  /**
   * Checks whether a DocumentTypeSpec is registered for a given key or alias.
   */
  public hasSpec(documentType: string): boolean {
    return this.findSpecKey(documentType) !== undefined;
  }

  /**
   * Returns all primary canonical DocumentTypeSpec instances.
   */
  public getAllSpecs(): DocumentTypeSpec[] {
    return Array.from(this.specs.values());
  }

  /**
   * Resets the registry back to default canonical seeds (SUBMITTAL_ARCH and SUBMITTAL_FFE)
   * and registers standard aliases.
   */
  public reset(): void {
    this.specs.clear();
    this.aliases.clear();

    this.registerSpec(archSpecJson as DocumentTypeSpec, {
      aliases: ['submittal_arch', 'submittal arch', 'architecture', 'submittal'],
    });

    this.registerSpec(ffeSpecJson as DocumentTypeSpec, {
      aliases: ['submittal_ffe', 'submittal ffe', 'submittal ff&e', 'ff&e', 'ffe'],
    });
  }
}

export const defaultDocumentTypeSpecRegistry = new DocumentTypeSpecRegistry();
