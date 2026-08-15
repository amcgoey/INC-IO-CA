/// <reference path="./types.ts" />
/**
 * @file DocumentLogStrategy.ts
 * @description Strategy design pattern exports for document identity, sorting, tabular row formatting, and filing rules.
 * Re-exports DynamicDocumentLogStrategy for spec-driven execution across all document types.
 */

import { DynamicDocumentLogStrategy } from './core/strategy/DynamicDocumentLogStrategy';
import { TemplateFormatCompiler } from './core/specs/TemplateFormatCompiler';
import type { DocumentTypeSpec } from './core/specs/DocumentTypeSpec';

export class DynamicLogStrategyFactory extends DynamicDocumentLogStrategy {
  constructor(spec: DocumentTypeSpec) {
    super(spec, TemplateFormatCompiler);
  }
}

export {
  DynamicDocumentLogStrategy,
  DynamicLogStrategyFactory as DeclarativeDocumentLogStrategy
};
