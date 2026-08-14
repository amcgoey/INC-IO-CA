/// <reference path="./types.ts" />
/**
 * @file DocumentLogStrategy.ts
 * @description Strategy design pattern exports for document identity, sorting, tabular row formatting, and filing rules.
 * Re-exports DeclarativeDocumentLogStrategy for spec-driven execution across all document types.
 */

export {
  DeclarativeDocumentLogStrategy,
  formatDateStr
} from './core/logging/DeclarativeDocumentLogStrategy';
