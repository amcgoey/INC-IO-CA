# 0007-submittal-review-process-and-document-io-architecture.md

Abstract submittal review procedures, document intake, action primitives, and workflow orchestration into a generic Document IO architecture extensible to future document types (e.g., RFIs, ASIs, Bulletins).

## Context & Decision

During recent codebase refactoring, some submittal review behaviors (such as maintaining a separate untouched `OriginalDocument` in closed archives while placing a cover-paged `ReviewDocument` in active submittal roots) were lost. Additionally, existing workflow code was tightly bound to architectural submittals without a formal abstraction for expanding to other document types or non-Drive execution contexts.

We decided to formalize the Document IO architecture around the following core design decisions:

1. **`OriginalDocument` vs. `ReviewDocument` Dual-Lifecycle**:
   - **`IncomingWorkflow` (`Action = "Received"`)**:
     1. Save raw incoming document to `Submittals\Closed\<Closed Subfolder>\<Calculated File Name>.pdf` as the **`OriginalDocument`**.
     2. Write initial receiving record to the Sheet Log.
     3. Duplicate `OriginalDocument` to create the **`ReviewDocument`**.
     4. Prepend **`CoverPageDocument`** to the front of `ReviewDocument`, apply `[Filename Prefix]`, and place it in `Submittals\` (Root Folder) for active architect markup and review.

2. **`AppContext`-Driven Outgoing Workflow Execution**:
   - **`GoogleDrive` App Context**:
     - `OutgoingWorkflow`: Form submission logs data and renames the active `ReviewDocument` in place within `Submittals\` (Root).
     - `FileSubmittalWorkflow`: Triggered when the user clicks "File Submittal" on the UI card, moving the document to `Submittals\Closed\<Closed Subfolder>\`.
   - **`Gmail` / Standalone App Contexts**:
     - `OutgoingWorkflow`: Logs data, renames file, and files directly to `Submittals\Closed\<Closed Subfolder>\` in a single pass.

3. **Non-CSI Project & Blank Section Handling**:
   - `ArchitectureSubmittalStrategy` conditionally omits `CSI Section` and trailing hyphen when empty (`001-0` instead of `-001-0` or `000000-001-0`).
   - `Calculated Closed Folder` evaluates to empty string when `CSI Section` is absent, filing directly under `Submittals\Closed\`.

4. **Primitive `DocumentAction` & `WorkflowRunner` Pipeline**:
   - Workflows (`Incoming`, `Outgoing`, `File Submittal`, `Triage`, `Analyze`) are composed as step-by-step sequences of primitive `DocumentAction` handlers (`DuplicateDocument`, `MoveDocument`, `RenameDocument`, `InsertPages`, `ExtractPages`, `WriteLog`, `AnalyzeDocument`, `TriageDocument`).
   - Workflow execution is driven by `DocumentTypeConfig` (encapsulating root folder names, closed subfolder rules, cover page template ID, filename prefix, and log identity).

5. **AI Extraction & Triage Actions**:
   - **`ExtractPagesAction`**: Slices PDF to first $N$ pages (e.g. 3 pages).
   - **`AnalyzeDocumentAction`**: Passes sliced PDF bytes to `AiAnalysisService` to populate candidate `RawDocument` form fields.
   - **`TriageDocumentAction`**: Passes email metadata to `AiAnalysisService` to auto-identify project and document type.

6. **Dynamic `ListDocumentField` Value Mapping**:
   - `ListDocumentField` defines whether primary stored values are `abbreviation` (e.g., `Contact` stored as `"INC"`) or `longForm` (e.g., `Action` stored as `"Received"`).
   - Option pairs are dynamically retrieved at runtime from spreadsheet settings (`LogSettings`) and never hardcoded in application logic.

7. **Storage-Agnostic `IdentityData` Logging**:
   - `Read Log` and `Write Log` actions operate using document **`IdentityData`** (`IdentityGroup`, `IdentityRevisionGroup`, `Identity`) via the abstract `LogRepository` interface.
   - Workflow actions remain completely agnostic to whether logs reside in multi-file spreadsheets, a single spreadsheet, or a database.

## Consequences

- The submittal review procedure preserves exact historical behavior: untouched contractor originals are archived immediately, and marked-up review copies are placed in the active root folder.
- New document types (e.g., RFIs, ASIs, Bulletins) can be introduced by defining a `DocumentTypeConfig` and binding action primitives without rewriting core workflow runner or filing logic.
- Execution across Google Drive and Gmail add-on environments is governed cleanly by `AppContext`.
