# 0001-decoupled-log-engine-and-document-strategies.md

Decouple document identity and payload formatting rules (`DocumentLogStrategy`) from generic log orchestration (`LogEngine`) and physical spreadsheet operations (`SheetStorageAdapter`).

## Context & Decision

Previously, low-level Google Sheets range reads, key matching, contact history concatenation, previous row status updates, and row position calculations were tightly coupled within `GoogleSheetsLogRepository` and caller scripts in `Process.ts`. As new document types (e.g. RFIs, Bulletins, Change Orders) are added to the application, embedding document-specific identity logic into the Google Sheets repository creates high architectural friction and duplication.

We decided to split logging into three distinct seams:
1. **`DocumentLogStrategy`**: A domain strategy interface implemented per document type/discipline (e.g., `ArchitectureSubmittalStrategy`, `FFESubmittalStrategy`) defining group keys, sort keys, target keys, and row field mappings.
2. **`LogEngine`**: A generic application orchestrator handling contact history concatenation, previous row status transitions, filename formatting, and generic row insertion planning (`computeRowInsertionPlan`).
3. **`SheetStorageAdapter`**: A dumb infrastructure adapter performing physical spreadsheet read/write operations without any document-type knowledge.

## Consequences

- Adding future document types requires creating a small ~20-line `DocumentLogStrategy` implementation without modifying row positioning, contact history, or spreadsheet storage code.
- Full end-to-end testing of row insertion, contact history chaining, and status updates can run in milliseconds using an `InMemorySheetStorageAdapter` fake without Google Apps Script runtime dependencies.
