# Submittal Logging

Validates and records incoming or outgoing project submittals into the log sheet and Google Drive.

## Language

**RawDocument**:
The untrusted, string-heavy data coming directly from the UI form submission for any document type (Submittals, RFIs, etc).
_Avoid_: FormInput, RawSubmittal

**ValidatedDocument**:
The pristine, trusted data structure produced after the RawDocument passes all business rules. Uses composition to store common fields alongside discipline-specific details.
_Avoid_: NormalizedSubmittal, ValidatedSubmittal

**ArchitectureDetails**:
The pristine, validated data specific to the Architecture discipline (e.g., Section, Number, Title).

**FFEDetails**:
The pristine, validated data specific to the FF&E discipline (e.g., Spec Tag, Vendor, Related Tags).

**ValidationContext**:
The dependencies (like LogSettings, valid tags, valid vendors) passed into the pure validation module from the orchestrator so it can validate without reaching out to external services.

**ValidationResult**:
A discriminated union that represents the three universal outcomes of validating a RawDocument: `success` (with the ValidatedDocument and any non-fatal warnings), `error` (fatal failures), or `interaction_required` (when the UI must prompt the user before continuing).

**RowInsertionPlan**:
The pure calculation output describing the target row index and structural modifications (like inserting blank separator rows or leading gaps) required to place a new log entry in the spreadsheet.
_Avoid_: InsertionIndex, RowActionResult

**LogRepository**:
The abstract storage interface used by the application core to save validated documents, fetch settings, and manage tags without knowing the underlying storage technology.
_Avoid_: StorageAdapter, SheetManager

**GoogleSheetsLogRepository**:
The concrete implementation of LogRepository that persists documents, settings, and tags using the Google Sheets API.
_Avoid_: SheetHelper

**DocumentLogStrategy**:
Encapsulates document-type specific rules for identity, group/sort keys, target keys, and field mapping into tabular row payloads.
_Avoid_: KeyExtractor, DocumentFormatter

**LogEngine**:
The application module that coordinates contact history, status transitions, and generic row positioning for any document type using a DocumentLogStrategy and storage adapter.
_Avoid_: LogProcessor, LogManager

**SheetStorageAdapter**:
The low-level infrastructure adapter that executes physical spreadsheet operations without any business logic or document-type assumptions.
_Avoid_: SheetHelper



