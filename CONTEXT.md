# Submittal Logging

Validates and records incoming or outgoing project submittals into the log sheet and Google Drive.

## Language

**Document**:
The core domain concept representing a formal project correspondence or record (such as a Submittal, RFI, ASI, Bulletin, etc.) processed through the system.

**Submittal**:
A specific document type representing shop drawings, product data, samples, or mockups submitted for architect/engineer review.

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

**DocumentPipeline**:
The pure application service that ingests raw intake data (email subjects, filenames, or UI form inputs as RawDocument) and coordinates parsing, normalization, and validation rules to produce a ValidationResult.
_Avoid_: IntakeManager, FormValidator, DataProcessor

**DocumentWorkflowModule**:
The application workflow service that orchestrates file retrieval, PDF stamping, drive filing, spreadsheet logging, and direct spreadsheet URL generation for any document type.
_Avoid_: ProcessManager, SubmittalWorkflowModule, WorkflowHelper

**WorkflowActionPolicy**:
Encapsulates action-specific execution policies (such as direction, filing subfolder handling, PDF stamping rules, and previous row status updates) to keep document workflow execution generic and extensible.
_Avoid_: ActionRules, FlowConfig


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

**PdfDocumentService**:
The module responsible for reading form field responses from PDF documents and stamping submittal approval metadata onto cover sheets.
_Avoid_: PdfUtils, PdfParser

**DriveFilingRepository**:
The abstract interface for resolving target Google Drive folder hierarchies, filing physical document blobs/files, and converting Google Drive file IDs into local G:\ drive paths without exposing underlying Drive APIs. Receives relative subfolder path segments from document strategies.
_Avoid_: DriveHelper, FolderManager

**GoogleDriveFilingRepository**:
The concrete implementation of DriveFilingRepository that interacts with Google Apps Script's DriveApp and Drive Advanced Service APIs.
_Avoid_: GoogleDriveAdapter

**FakeDriveFilingRepository**:
The in-memory test implementation of DriveFilingRepository that records filing actions without making Google API calls.

**FilingOptions**:

The contextual parameters (target folder ID, discipline/document details, destination target folder rules) passed into DriveFilingRepository to direct document storage.

**FilingResult**:
The structured outcome of filing a document in Drive, containing the file ID, web URL, Windows G:\ local path, and destination folder ID.

**AiAnalysisService**:
The abstract service interface encapsulating AI predictions, triage, and deep document analysis across varying document types.
_Avoid_: AiTriageModule, AiUtils, AIHelper

**GeminiAiAnalysisAdapter**:
The concrete implementation of AiAnalysisService that formats prompts, handles Gemini API retries, error masking, and caching.
_Avoid_: GeminiTriageAdapter

**FakeAiAnalysisAdapter**:
The in-memory test implementation of AiAnalysisService that returns deterministic predictions without network or script property dependencies.

**CardPresenter**:
The application presenter module responsible for assembling Google Apps Script CardService action responses, navigation updates (card refreshes and pushes), and notification toasts.
_Avoid_: UIHelper, CardNavigator, CardResponseBuilder

