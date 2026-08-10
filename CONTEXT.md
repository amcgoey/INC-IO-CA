# Submittal Logging

Validates and records incoming or outgoing project submittals into the log sheet and Google Drive.

## Language

**DocumentLogWorkbook**:
The single, standardized Google Sheet workbook that acts as the project source of truth across all document types. Contains consolidated tabs (`_Config`, `_Shared`), discipline/document log tabs (`Submittal Arch`, `Submittal FFE`), and support info tabs.
_Avoid_: Unified Workbook, Master Sheet, Log Spreadsheet

**Minimum Viable Template (MVT)**:
The ground-truth Google Sheet template layout, styling, and named-range specification established in Milestone 3, serving as the master baseline for offline fixture generation and live sheet provisioning across all document types.

**DocumentLogWorkbookViewSpec**:
The MVVM View specification containing aesthetic formatting rules (header background fill colors, font styles, text alignment, column pixel widths, number/date format strings, and conditional formatting rules) derived from live reference submittal log templates.

**WorkbookTemplateViewModel**:
The MVVM ViewModel binding component that maps pure domain model definitions (`DocumentLogWorkbookSpec`) and visual presentation specifications (`DocumentLogWorkbookViewSpec`) into Google Sheets API batch update request payloads and offline JSON test fixtures.


**FormulaRow**:
The dedicated row immediately following the header row in a log tab that holds formula definitions for calculated columns (`Calc File Name`, `Calc Number`, `Calc Title`, `Calc Contact Chain`, `Calc Sort`) so manual log entries inherit formatting and backup calculations. Occupies the second row of the `<TabName>_Headers` Named Range.

**BufferRow**:
An empty, data-protected row used as a boundary marker. In log tabs, a top BufferRow sits immediately below the FormulaRow, and a bottom BufferRow sits at the bottom of the log. These two buffer rows bound the sheet-scoped `Data` Named Range. When the `Data` Named Range exists, the bottom BufferRow serves as the absolute hard cutoff for `LogEngine` read operations.

**Headers Named Range (`Headers`)**:
The generic Sheet-Scoped 2-row Named Range on a log tab spanning the header row (Row 1) and the FormulaRow (Row 2), serving as the primary anchor for dynamic header column resolution. Sheet-scoped naming (`Headers`) allows log tabs to be cloned or duplicated for new document types without breaking or renaming range references.

**Data Named Range (`Data`)**:
The generic Sheet-Scoped dynamic Named Range on a log tab enclosing active data rows, anchored at the top and bottom by protected BufferRows (`Data`). `LogEngine` reads all data rows bounded by top and bottom BufferRows without applying blank-row cutoffs; $K=5$ sparse blank row tolerance is used strictly as an un-bounded fallback heuristic when `Data` range cannot be identified.

**Dual-Tier Named Range Scoping Taxonomy**:
The architectural convention categorizing workbook Named Ranges into:
1. *Sheet-Scoped Generic Ranges* (`Headers`, `FormulaRow`, `Data`, `Vendors`, `SpecTags`): Used on log tabs and dedicated support tabs to enable instant tab cloning/duplication.
2. *Workbook-Scoped Specific Ranges* (`MANIFEST_SCHEMA_VERSION`, `Config_Manifest`, `Config_<DocTypeKey>`, `Shared_Contacts_<Discipline>`, `Actions_<DocType>`): Used on consolidated tabs (`_Config`, `_Shared`) housing multiple tables to prevent namespace collisions.

**Document**:
The core domain concept representing a formal project correspondence or record (such as a Submittal, RFI, ASI, Bulletin, etc.) processed through the system.

**AppContext**:
The environment in which the application is executing (`GoogleDrive`, `Gmail`, or `GoogleSheets`). Governs contextual root card rendering, workflow step sequences (immediate vs. deferred filing), and active workbook auto-binding in Google Sheets context.

**Submittal**:
A specific document type representing shop drawings, product data, samples, or mockups submitted for architect/engineer review.

**OriginalDocument**:
The pristine, unmodified document file received from a Source, saved directly into the Closed subfolder hierarchy upon initial receipt.

**ReviewDocument**:
The working copy of an incoming document created by duplicating the OriginalDocument, inserting the CoverPageDocument at the front, and placing it in the Root Folder for user review and markup.

**CoverPageDocument**:
The cover sheet document (template PDF or doc) inserted into the front of a ReviewDocument to receive review markup, routing details, and status updates.

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

**ListDocumentField**:
A document field backed by a dynamic list of options (long form and abbreviation) loaded at runtime from spreadsheet settings. Defines whether the primary stored value is long form or abbreviation, while preserving bi-directional resolution.

**DocumentPipeline**:
The pure application service that ingests raw intake data (email subjects, filenames, or UI form inputs as RawDocument) and coordinates parsing, normalization, and validation rules to produce a ValidationResult.
_Avoid_: IntakeManager, FormValidator, DataProcessor

**EmailIntakeParser**:
The email parsing component of `DocumentPipeline` that dispatches targeted document-type email parsers (`SubmittalEmailParser`, `RfiEmailParser`, `AsiEmailParser`) following initial AI triage to extract high-precision regex metadata that overwrites initial AI guesses.
_Avoid_: EmailUtils, MailParser

**GenericEmailParser**:
The Tier 2 generic email parsing strategy that extracts 6-digit CSI MasterFormat sections, padded 3-digit submittal numbers, and revisions from non-vendor-specific submittal emails while leaving discipline and project assessment to AI Triage.


**DocumentWorkflowModule**:
The application workflow service that orchestrates file retrieval, PDF stamping, drive filing, spreadsheet logging, and direct spreadsheet URL generation for any document type.
_Avoid_: ProcessManager, SubmittalWorkflowModule, WorkflowHelper

**DocumentAction**:
The abstract, reusable workflow step interface (`execute(context: DocumentActionContext<TDoc>): Promise<DocumentActionContext<TDoc>>`) representing a primitive transformation or operation (e.g., `MoveDocument`, `RenameDocument`, `InsertPages`, `ExtractPages`, `WriteLog`, `AnalyzeDocument`, `TriageDocument`) executed by `WorkflowRunner`.
_Avoid_: ActionStep, PipelineTask

**DocumentTypeConfig**:
Pure, serializable configuration schema encapsulating document-type specific search criteria (root folder and log search terms), closed subfolder maps, cover page template references, filename prefixes, string adapter selection keys, and the unified `fields` specification list (`DocumentFieldSpec[]`).

**DisjunctiveLogSearchQuery**:
The Google Drive API search query string built dynamically from `DocumentTypeConfig.logSearchTerms` by joining terms with `OR` operators (e.g., `(title contains 'submittal log' or title contains 'submittal') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`) to discover candidate log spreadsheets in a single API request.

**DocumentTypeSearchCacheKey**:
The `UserCache` key pattern (`log_search_<DriveId>_<DocTypeKey>`) used to isolate and persist discovered candidate log spreadsheets per Shared Drive and document type with targeted invalidation during admin cache purges.

**LogDisambiguationScoringEngine**:
The multi-tier scoring and ranking engine that evaluates candidate log spreadsheets returned from Drive queries using structural tab inspection (`_Config` manifest and target `logSheetName`), parent folder path verification (`logParentFolderTerms`), affirmative filename match weighting, and negative term demotion penalties (`Copy`, `Archive`, `Draft`).




**DocumentFieldSpec**:
Declarative property schema defining a field's key, target spreadsheet header, UI label, input type, calculation flag (`isCalculated`), optional formula/function reference (`FormulaOrFunction`), and optional `optionsRange` reference. Drives UI card generation, pre-flight header validation, and log row payload formatting.
_Avoid_: ColumnDefinition, FieldSchema

**Declarative UI Field Rendering Engine**:
The dynamic card rendering mechanism within `UnbiasedIntakeCard` (`renderDynamicFormFields`) that reads `DocumentFieldSpec[]` from `DocumentTypeConfig`, skips calculated fields (`isCalculated === true`), resolves 2D picklist ranges (`optionsRange`), and generates `CardService` input widgets dynamically without hardcoded `if/else` document type branches.

**PicklistOption**:
The normalized key-label tuple (`value`, `label`) resolved from a Named Range reference (`optionsRange`) in Google Sheets or static JSON fallback files for populating UI dropdown widgets.

**Config_<DocTypeKey>_Fields**:
The structured subtable Named Range on `_Config` tab for a specific `DocumentType` defining its `DocumentFieldSpec` rows (Key, Header, Label, Type, IsCalculated, FormulaOrFunction, OptionsRange).
_Avoid_: ColumnTable, FieldConfigTab

**Config_Manifest**:
The master Named Range on the `_Config` spreadsheet tab listing all enabled DocumentType entries, their display names, primary log tab names, and strategy key associations.
_Avoid_: DocTypeIndex, ManifestSheet

**DocumentTypeConfigRegistry**:
The application registry that manages, registers, and resolves `DocumentTypeConfig` instances by document type name and spreadsheet ID at runtime, utilizing Google Apps Script `CacheService.getScriptCache()` (6-hour TTL) with `SpreadsheetId`-scoped cache keys (`DOC_CONFIG_<SpreadsheetId>_<DocTypeKey>`) for zero-latency lookup and cross-workbook isolation, with automatic fallback to `_Config` spreadsheet tab parsing.

**PrefixCacheManager**:
The Tier 1 application cache service that wraps `CacheAdapter` to maintain tracked key manifest index entries (`_INDEX_<prefix>`), enabling targeted batch cache eviction (`invalidatePrefix`) across Google Script and test fake storage adapters without requiring native key queries or regex pattern matching.
_Avoid_: CacheIndexCleaner, KeyPatternEvictor

**ScopedCacheEviction**:
The architectural targeted cache flushing pattern that invalidates only keys belonging to a specific scope/prefix (e.g. `DOC_CONFIG_<SpreadsheetId>_*` or `log_search_<DriveId>_*`) during administrative resets without wiping unrelated user card drafts, AI triage predictions, or separate workbook caches.

**WorkflowContextFactory**:
The application factory that ingests `DocumentTypeConfig`, `AppContext`, document payloads, and optional overrides to construct a `DocumentActionContext` equipped with lazy adapter getter properties.
_Avoid_: ContextBuilder, ActionContextFactory

**DocumentActionContext**:
The polymorphic, strongly-typed execution context passed through `DocumentAction` execution steps, containing target document data, configuration, execution state, and lazy adapter instances.
_Avoid_: ActionPayload, PipelineContext

**WorkflowRunner**:
The pipeline engine that executes a step-by-step sequence of `DocumentAction` instances for a target `DocumentType` and `AppContext`.

**WorkflowActionRouter**:
The central application router that resolves ordered step sequences of `DocumentAction` instances for a target document type and workflow direction.
_Avoid_: ActionResolver, StepMapper

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

**IdentityData**:
The abstract identity model containing `identityGroup`, `identityRevisionGroup`, and `identity` used for sheet grouping, revision history tracking, and unique document identification.

**IdentityGroup**:
The normalized string key used to group related document entries in the log tab for sheet formatting and blank row gap separation (e.g. `[CSI Section]-[Number]` for Arch Submittals, `[Spec Tag]` for FF&E, or `[RFI Number]` for RFIs).

**IdentityRevisionGroup**:
The normalized string key used to group document revisions for contact history concatenation and revision tracking (`[IdentityGroup]-[Revision]`).

**Identity**:
The target string key that uniquely identifies a specific document submission/revision instance (`[IdentityRevisionGroup]-[Date]`). Serves as the primary sort key.

**normalizePicklistValue**:
The Tier 1 pure helper that performs in-memory normalization of picklist string values during `RowKeyFn` identity calculation, trimming whitespace, uppercasing comparison strings, and dynamically resolving `options.label` $\rightarrow$ `options.value` using `DocumentFieldSpec.options` without hardcoding TypeScript alias maps.

**keyNormalizationRule**:
The declarative property on `DocumentFieldSpec` (`'picklist'` | `'code'` | `'exact'`) that specifies field-specific key normalization behavior during identity key calculation, controlling whether values resolve via picklists, strip labels from numeric codes, or perform exact string matching.

**resolvePicklistOptionsRange**:
The 3-tier picklist range resolution mechanism in `PicklistResolver` that resolves sheet-scoped named ranges (`'<SheetTabName>'!<RangeName>`), defensively retries bare range names against the active sheet tab, and falls back to static JSON defaults (`src/config/defaults/<DocTypeKey>.json`) for 100% offline execution.



**LogEngine**:
The application module that coordinates contact history, status transitions, and generic row positioning for any document type using a DocumentLogStrategy and storage adapter.
_Avoid_: LogProcessor, LogManager

**LogMigrationEngine**:
The application service responsible for inspecting, validating, remapping, and transforming legacy standalone log spreadsheets into unified DocumentLogWorkbook log tabs with dry-run audit reporting.
_Avoid_: SheetConverter, LegacyImporter

**LogMigrationStrategy**:
Encapsulates discipline-specific rules (`ArchLogMigrationStrategy`, `FfeLogMigrationStrategy`) for mapping legacy headers to target `<TabName>_Headers`, skipping calculated formula columns so they inherit `FormulaRow` formulas, and normalizing date/status cell values.

**Calculated Column Null Coercion**:
The migration rule within `LogMigrationEngine` that systematically forces data row cells mapping to calculated columns (`isCalculated: true`) to empty values (`null` or `""`), clearing inline formulas so `FormulaRow` top-level `MAP`/`LAMBDA` formulas take over and spill down across migrated rows without triggering `#SPILL!` collision errors.

**Legacy Inline Formula Coercion**:
The 4-tier migration formula policy within `LogMigrationEngine`:
1. *Calculated columns*: Inline formulas are cleared (`null`/`""`) so `FormulaRow` `MAP`/`LAMBDA` formulas spill down.
2. *Standard non-calculated columns*: Custom inline formulas are coerced to evaluated static snapshot values (`getValues()`) and migrated.
3. *User-created columns (data rows)*: Custom inline formulas in user-created columns are coerced to evaluated static snapshot values (`getValues()`) and migrated.
4. *User-created columns (`FormulaRow`)*: Top-level `FormulaRow` formulas (Row 2) in user-created columns are preserved, allowing post-migration user editing.

**MigrationAuditReport**:
The structured dry-run audit result detailing column mappings, row validation metrics, formula coercion stats (`calculatedColumnsCoercedCount`, `inlineFormulasDetectedCount`, `legacyCalculatedFormulaDiscrepancies`), target spill collision risk (`targetSpillCollisionBlocked`), and the boolean `canProceed` execution gate (blocked if `targetSpillCollisionBlocked === true`) prior to log migration.

_Avoid_: DryRunResult, MigrationSummary

**TargetTabSnapshot**:
The temporary duplicate tab (`_Backup_<TabName>_<Timestamp>`) created at the tail end of the tab list within `DocumentLogWorkbook` prior to data transformation to enable lossless atomic rollback in case of migration execution failures.
_Avoid_: SheetBackup, TemporaryTab

**AtomicWorkbookTransactionBoundary**:
The transactional boundary rule mandating that individual workbook migrations operate atomically within a `TargetTabSnapshot`; if a 270s quota timekeeper limit (`GasTimeoutBudget`) or execution failure occurs mid-write, the transaction immediately executes `restoreFromSnapshot()`, releases `PropertiesService` locks, sets manifest status to `PAUSED_TIMEOUT`, and schedules continuation, resuming cleanly from a fresh pre-migration snapshot.

**SpreadsheetScopedTransactionLock**:
The dual-layer concurrency lock protocol where short-lived native `LockService.getScriptLock()` acquisitions guard atomic reads and writes of `LOCK_MIGRATION_<SpreadsheetId>` key payloads stored in `PropertiesService.getScriptProperties()`. Ensures non-colliding, spreadsheet-isolated transaction locks during multi-minute migrations while eliminating global script lock contention across concurrent workbook executions.
_Avoid_: ScriptWideLock, MonolithicScriptLock

**TwoPhaseBatchHyperlinkRepair**:
The 2-phase execution sequence for multi-workbook batch migrations where Phase 1 completes row migration and validation across all workbooks (`MIGRATION_COMPLETE`), followed by Phase 2 (`repairCrossLogReferences`) executing cross-log hyperlink repair across all workbooks once target spreadsheet IDs, tab GIDs, and row positions are 100% finalized. Phase 2 hyperlink repairs use isolated per-workbook `TargetTabSnapshot` boundaries. If a cross-log reference targets an unmigrated or failed workbook, the scanner preserves the existing legacy URL, logs a `HYPERLINK_TARGET_UNMIGRATED` diagnostic event to `_AuditLog`, and continues repairing valid references.


**BatchMigrationLifecyclePhases**:
The explicit state machine governing `migration_batch_manifest.json` execution phases (`PHASE_1_ROW_MIGRATION`, `PHASE_2_HYPERLINK_REPAIR`, `PAUSED_TIMEOUT`, `COMPLETED`, `FAILED`) and per-workbook entry statuses (`PENDING`, `IN_PROGRESS`, `PAUSED_TIMEOUT`, `MIGRATION_COMPLETE`, `REPAIR_IN_PROGRESS`, `COMPLETED`, `FAILED`), supporting automated stale snapshot crash recovery upon trigger resumption. Individual workbook pre-flight or migration failures mark the workbook status as `FAILED`, emit an execution report to `_AuditLog`, and skip to the next workbook without aborting the broader batch run.


**AuditLogTab (`_AuditLog`)**:
The dedicated, system-managed administrative tab within `DocumentLogWorkbook` used to persist structured execution logs, telemetry, and event history across system features (e.g. `MIGRATION`, `SCHEMA_DRIFT`, `CACHE_PURGE`, `ADMIN_ACTION`). Includes a dedicated `Category` column alongside `Timestamp`, `EventType`, `Actor`, `Status`, and `Details` JSON for structured filtering and parsing, keeping telemetry completely separate from `_Config`.
_Avoid_: AuditTab, ConfigTelemetry, SystemLog, MigrationAuditTab




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
The abstract service interface encapsulating 1-pass lightweight AI triage (project, docType, polymorphic metadata with 3 separate confidence scores) and deep document analysis across varying document types.
_Avoid_: AiTriageModule, AiUtils, AIHelper

**AiClassificationResult**:
The standardized payload returned from 1-pass AI document triage containing an `overallConfidence` score alongside a dictionary of predicted document fields, where each field encapsulates its extracted string `value` and numerical `confidence` float (`0.00` to `1.00`).
_Avoid_: AiPredictionDict, TriageResultMap

**FieldConfidenceThreshold**:
The fixed numerical cut-off (`0.85`) below which AI-predicted fields and overall triage scores trigger visual warning indicators in field labels and non-blocking yellow status banners on `UnbiasedIntakeCard` UI cards.
_Avoid_: ConfidenceCutoff, UncertaintyLimit

**TransientOverrideLogger**:
The lightweight logging approach for manual AI field overrides, emitting non-persistent diagnostic entries strictly to `Logger.log()` / Apps Script Cloud execution logs during submission for debugging purposes, avoiding sheet tab bloat.
_Avoid_: OverrideAuditTab, MetricRepository




**TargetedDocumentEmailParser**:
DocumentType-specific email parser strategies (`SubmittalEmailParser`, `RfiEmailParser`, `AsiEmailParser`) dispatched after initial AI triage to extract high-precision regex fields that overwrite initial AI metadata guesses.
_Avoid_: MonolithicEmailParser, GenericSubjectParser

**GeminiAiAnalysisAdapter**:
The concrete implementation of AiAnalysisService that formats prompts, handles Gemini API retries, error masking, and caching.
_Avoid_: GeminiTriageAdapter

**FakeAiAnalysisAdapter**:
The in-memory test implementation of AiAnalysisService that returns deterministic predictions without network or script property dependencies.

**CardPresenter**:
The application presenter module responsible for assembling Google Apps Script CardService action responses, navigation updates (card refreshes and pushes), and notification toasts.
_Avoid_: UIHelper, CardNavigator, CardResponseBuilder

**IntakeCard (`buildIntakeCard`)**:
The dynamic multi-document contextual Google Workspace Add-on form intake card (`buildIntakeCard`) rendered upon email or file selection, featuring dynamic Project, DocumentType, and LogFile dropdown controls with loss-less state preservation during re-bind re-renders. Supersedes `UnbiasedIntakeCard` (`buildUnbiasedIntakeCard`) and `buildMainCard`.
_Avoid_: SubmittalFormCard, IntakeFormView

**TemplateDriftAuditor**:
The inspection tool and service that audits live Google Sheet workbooks across 8 structural dimensions against `DocumentLogWorkbookSpec` to detect version, tab, named range, header, formula, validation, or protection discrepancies prior to template deployment or runtime config loading. Always performs direct, uncached live reads (`bypassCache: true`) of target workbooks to guarantee structural ground truth without stale `ScriptCache` / `UserCache` masking. Formula Integrity Audit (Dimension 5) is strictly scoped to `FormulaRow` (Row 2) to respect `1:2` range bounding; data row formula coercion is handled exclusively during migration by `LogMigrationEngine`.
_Avoid_: SheetInspector, SchemaChecker

**ValidationRuleSpec**:
The declarative cell validation specification attached to a log column defining validation type (`LIST_FROM_RANGE`, `REGEX_MATCH`, `DATE_FORMAT`, `NUMBER_RANGE`, `CUSTOM_FORMULA`), dedicated single-column target Named Range (`targetNamedRange`), regex pattern string, numeric boundaries, `allowInvalid` flag, and custom error tooltip text.

**ProtectionTierSpec**:
The 3-tier workbook protection taxonomy establishing soft warning-based range protections (`warningOnly: true`) across:
1. *System Tab Protection*: Applied to `_Config` and `_AuditLog` tabs.
2. *Header Stack & Formula Protection*: Applied to Rows 1–3 of all log tabs (`LOCK_HEADERS_<TabName>`), protecting headers and Row 2 `MAP/LAMBDA` formula definitions.
3. *Calculated Column Protection*: Applied to calculated column ranges across data rows, preventing manual hardcoded overwrites while preserving dynamic formula spill.

**SheetValidationAndProtectionAdapter**:
The Tier 2 Apps Script adapter encapsulating native Google Sheets `Protection` and `DataValidation` APIs to programmatically compile validation rules and apply range protection warning banners across log sheets.

**Single-Pass Structural Audit**:
The batch inspection pattern where `TemplateDriftAuditor` delegates uncached spreadsheet reads across all 15+ tabs to `Sheets.Spreadsheets.get` (Advanced Sheets Service v4), fetching named ranges, headers, formulas, and validations in 1-2 HTTP roundtrips to collapse execution times from >30s down to <1-3s.

**SpreadsheetBatchReaderAdapter**:
The Tier 2 infrastructure adapter (`SpreadsheetBatchReaderAdapter`) wrapping `Sheets.Spreadsheets.get` with strict range (`_Config!A1:Z100` and rows `1:2`) and field mask (`namedRanges,sheets(properties(sheetId,title),data(rowData(values(userEnteredValue,dataValidation))))`) bounding, throwing `SpreadsheetBatchReadException` on API failures. When caught by `SheetAdminFoldOut`, renders an actionable error card with troubleshooting steps and a retry control without falling back to synchronous `SpreadsheetApp` RPC loops.

**Uncached Audit Eviction Policy**:
The cache invalidation protocol where `TemplateDriftAuditor` executes uncached live sheet reads (`bypassCache: true`) and triggers `PrefixCacheManager.invalidatePrefix("DOC_CONFIG_" + spreadsheetId)` strictly when structural drift is detected or an auto-repair operation is performed, leaving existing valid cache entries untouched during zero-drift audits.

**Lazy Cache Hydration**:
The cache management design where `TemplateDriftAuditor` invalidates stale cache keys (`invalidatePrefix`) upon drift/repair without performing direct cache warm-up, delegating cache re-population to `DocumentTypeConfigRegistry` upon subsequent runtime lookups.

**TemplateDriftReport**:
The structured audit result generated by `TemplateDriftAuditor`, containing the overall alignment status (`MATCH`, `MINOR_DRIFT`, `MAJOR_DRIFT`, `INCOMPATIBLE`), live vs. code version comparison, categorized drift issues, and the boolean `canAutoPatch` execution gate.
_Avoid_: DriftSummary, AuditResult

**Concurrent Auto-Patching Protocol**:
The mutual exclusion protocol where `TemplateDriftAuditor.autoPatchWorkbook` acquires `SpreadsheetLockAdapter.acquireLock(spreadsheetId)` (`LOCK_MIGRATION_<SpreadsheetId>`) under a 5-second bounded timeout with double-checked audit verification, while dry-run `auditWorkbook` executions remain lock-free. If an unexpected exception occurs mid-repair, `autoPatchWorkbook` logs a `DRIFT_REPAIR_FAILED` event to `_AuditLog`, invalidates `PrefixCacheManager` keys (`DOC_CONFIG_<SpreadsheetId>`), releases the lock in `finally`, and returns `status: "REPAIR_FAILED"` to prevent serving partially patched schemas.

**Auto-Patch Eligibility Boundary**:
The drift classification contract restricting automated patching (`canAutoPatch: true`) strictly to non-destructive `MINOR_DRIFT` issues (missing named ranges, missing default `_Config` fallback rows, `_AuditLog` initialization, non-destructive header labels), while `MAJOR_DRIFT` and `INCOMPATIBLE` strictly reject auto-patching (`canAutoPatch: false`) to prevent data loss.


**SheetsRootCard**:
The dedicated Google Workspace Add-on root card rendered when running in GoogleSheets context (`AppContext.GoogleSheets`). Minimal layout consisting of a top Workbook Status Header and a bottom `SheetAdminFoldOut` for dry-run schema drift audits (`TemplateDriftAuditor`) and ScriptCache clearing. Handles non-log spreadsheets with a friendly fallback state (Header: "Unrecognized Document Log", Description: "The active spreadsheet is not a Document Log (missing configuration information)."). Includes a manual "Refresh Card" context button to re-inspect active sheet and tab context on demand.

**SheetsRootCard Tab Role Classification**:
The 5-tier taxonomy categorizing active spreadsheet tab context within `SheetsRootCard`:
1. *Log Tab*: Tab linked to an active `DocumentType` schema (e.g., `Submittal Arch`, `Submittal FFE`). Displays `DocumentType` key and active data row count.
2. *System Config Tab*: The `_Config` tab housing system manifests and schemas (`Role: System Config`).
3. *Audit Log Tab*: The `_AuditLog` system telemetry tab (`Role: System Audit Log`).
4. *Documentation Tab*: User instructions or documentation tab (`Role: Documentation`).
5. *User Created Tab*: Custom user-created scratch or report tab (`Role: User Created`).

**SheetAdminFoldOut**:
The AppContext-sensitive section of the Workspace Add-on main card rendered when running in Google Sheets context, providing spreadsheet configuration inspection, live schema drift validation, and target workbook ScriptCache invalidation controls.

**Schema Health Report**:
The inline card section rendered within `SheetAdminFoldOut` following a `TemplateDriftAuditor` execution, displaying overall workbook alignment status (`MATCH`, `MINOR_DRIFT`, `MAJOR_DRIFT`, `INCOMPATIBLE`), a bulleted breakdown of structural issues, and `canAutoPatch` status to non-technical administrators.

**TriageAdminFoldOut**:
The AppContext-sensitive section of the Workspace Add-on main card rendered when running in Gmail or Drive context, providing AI triage prediction cache clearing, shared drive log search cache resetting, and contact/action cache flushing.

**AdminFoldOutPresenter**:
The declarative presenter module (`AdminFoldOutPresenter.renderAdminSection`) that inspects execution `AppContext` and builds the context-appropriate admin foldout (`SheetAdminFoldOut` for `GoogleSheets`, `TriageAdminFoldOut` for `Gmail`/`GoogleDrive`), decoupling root cards from administrative UI construction.

**AppContext-Scoped Cache Partitioning**:
The architectural rule strictly isolating administrative cache eviction controls by execution context: `SheetAdminFoldOut` flushes target workbook config (`DOC_CONFIG_<SpreadsheetId>_*`), while `TriageAdminFoldOut` flushes drive search (`log_search_<DriveId>_*`), AI triage predictions (`ai_triage_*`), and shared picklists (`contacts_*`, `actions_*`), preventing cross-context cache pollution.

**Centralized Workspace Add-on Execution Policy**:
The architectural decision and policy mandating that all `DocumentLogWorkbook` administration, cache management, diagnostic auditing (`TemplateDriftAuditor`), and document intake operations are driven exclusively through the Google Workspace Add-on (`AppContext.GoogleSheets`, `SheetsRootCard`, `SheetAdminFoldOut`). Prohibits container-bound Apps Script code and custom menus (`onOpen`/`onEdit`) in individual log workbooks to eliminate script fragmentation and version drift across cloned spreadsheets.

**SheetsUserCacheDraftKey**:
The `UserCache` key format (`CARD_DRAFT_V1_SHEETS_<SpreadsheetId>_<TabName>`) used when running in `AppContext.GoogleSheets` to isolate unsubmitted form draft state per active spreadsheet ID and sheet tab name, ensuring switching tabs in a log workbook preserves draft inputs on each tab without cross-tab leakage.

**SystemTabContextBinding**:
The context binding rule in `AppContext.GoogleSheets` specifying that system tabs (`_Config`, `_AuditLog`), documentation tabs, and user-created non-log tabs resolve `documentType = null` and display their classified tab role header with `DocType: N/A`. Omits log entry form rendering and bypasses draft state hydration when viewing non-log system tabs.

**PolymorphicDraftContextKey**:
The abstract context key parameter (`contextKey: string`) accepted by `CardDraftStateManager` to isolate `UserCache` draft state across execution environments (`GMAIL_<messageId>` for `AppContext.Gmail` vs `SHEETS_<SpreadsheetId>_<TabName>` for `AppContext.GoogleSheets`), ensuring state resolution logic remains generic, decoupled, and testable across all add-on execution modes.








