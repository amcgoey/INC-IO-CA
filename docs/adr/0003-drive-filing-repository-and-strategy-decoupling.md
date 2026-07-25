# 0003-drive-filing-repository-and-strategy-decoupling.md

Encapsulate Google Drive folder hierarchy resolution, physical file storage, and Windows G:\ drive path building in `DriveFilingRepository`, decoupled from document-type specific subfolder path rules via document strategies.

## Context & Decision

Previously, Google Drive subfolder creation (`getOrCreateFilingFolder`) and Windows G:\ drive path building (`getLocalDrivePath`) were shallow helper functions in `Process.ts` that directly accessed global `DriveApp` and `Drive` APIs. Moreover, subfolder naming rules (e.g., CSI division for Architecture vs spec tag prefix for FF&E) were hardcoded inside `getOrCreateFilingFolder`.

We decided to refactor document filing into two decoupled seams:
1. **`DriveFilingRepository` Interface**: An abstract interface defined in `types.ts` with a production `GoogleDriveFilingRepository` and an in-memory `FakeDriveFilingRepository` for fast, zero-IO testing.
2. **High-Level `fileDocument` API**: `fileDocument(file, options)` moves or saves files in the resolved destination hierarchy and returns a unified `FilingResult` containing `{ fileId, url, localPath, folderId }`.
3. **Strategy-Provided Subfolder Paths**: `DocumentLogStrategy` or document details dictate relative subfolder path segments (e.g. `["Closed", "03-Concrete"]` or `["Closed", "CH"]`), allowing `DriveFilingRepository` to remain completely generic across future document types (RFIs, Bulletins, Change Orders, etc.).

## Consequences

- `Process.ts` orchestrators no longer manipulate `DriveApp` folder iterators or format Windows path strings inline.
- Adding future document types with distinct filing subfolder rules requires zero modifications to `DriveFilingRepository`.
- Filing workflows can be fully tested in fast, pure Node.js unit tests using `FakeDriveFilingRepository` without Google Apps Script runtime mocks.
