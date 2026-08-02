# 0010-declarative-document-type-config-and-adapter-keys.md

Declarative `DocumentTypeConfig` schema with string adapter selection keys, project-scoped search criteria, and serializable metadata.

## Context & Decision

Previously, `DocumentTypeConfig` was envisioned as a light wrapper carrying runtime functions (e.g. `closedSubfolderRules: (doc: ValidatedDocument) => string[]`). However, hardcoding functions or environment-specific Google Drive / Spreadsheet file IDs into configuration objects prevents storing configuration externally (such as in a Google Sheet settings tab, JSON file, or database table) and makes multi-project folder/file resolution difficult across different Shared Drives.

We decided to structure `DocumentTypeConfig` as a pure, serializable schema:
1. **String Adapter Selection Keys**: Replaced direct adapter instantiation and class dependencies with string keys (`logAdapterKey`, `filingAdapterKey`, `pdfAdapterKey`, `aiAdapterKey`). A central `WorkflowContextFactory` resolves these keys lazily against an adapter registry per request.
2. **Project-Scoped Search Criteria**: Replaced hardcoded folder and spreadsheet file IDs with search term arrays (`rootFolderSearchTerms`, `logSearchTerms`, `logParentFolderTerms`). Business logic resolves actual Drive folder and log file resources at runtime within the context of the active project / Shared Drive.
3. **Serializable Subfolder Lookup Map**: Replaced inline function callbacks with a dictionary map (`closedSubfolderMap: Record<string, string>`) for CSI division codes or subfolder lookup keys.
4. **DocumentTypeConfigRegistry**: Established a central registry map (`DocumentTypeConfigRegistry`) for loading, registering, and retrieving `DocumentTypeConfig` instances by document type name (`'Submittal'`, `'RFI'`).

## Consequences

- `DocumentTypeConfig` instances can be stored directly in spreadsheet rows, JSON files, or database tables.
- The same `DocumentTypeConfig` definition can be reused across different Google Drive Shared Drives and project scopes without code modifications.
- Adapter resolution remains lazy and fast for Google Apps Script execution, instantiating only the required adapters per request.
