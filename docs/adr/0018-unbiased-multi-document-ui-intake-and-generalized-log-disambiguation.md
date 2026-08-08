# 0018-unbiased-multi-document-ui-intake-and-generalized-log-disambiguation.md

Establish the AI-first triage pipeline, targeted document email parsers (`SubmittalEmailParser`, `RfiEmailParser`), UserCache persistence, 3-tier confidence threshold guards, and unbiased card reload procedures.

## Context & Decision

> [!NOTE]
> **Precedence Notice**: Log workbook discovery and disambiguation rules defined in this document are superseded by **ADR 0030 ([Decision] DocumentType-Aware Log Workbook Disambiguation Engine)**. ADR 0030 replaces unbiased general log queries with DocumentType-aware disjunctive search queries (`logSearchTerms`) and DocumentType-scoped cache keys (`log_search_<DriveId>_<DocTypeKey>`).

To support multiple document types (Submittals, RFIs, ASIs, Bulletins, Change Orders) during Google Workspace add-on intake, resolve project-to-shared-drive matching limitations, and avoid monolithic switch statements:

1. **Lightweight AI Triage First $\rightarrow$ Targeted Parser Ingestion Second**:
   - **Step 1: AI Triage (Always Runs First)**: `AiAnalysisService` executes a fast, 1-pass Gemini triage call predicting `predictedProject`, `predictedDocType`, polymorphic `metadata: Record<string, string>`, and 3 separate confidence metrics (`projectConfidence`, `docTypeConfidence`, `metadataConfidence`).
   - **Step 2: Targeted Email Parser Execution**: Using `predictedDocType`, the pipeline dispatches the docType-specific parser (`SubmittalEmailParser`, `RfiEmailParser`, `AsiEmailParser`). High-precision regex matches **overwrite** initial AI metadata predictions.

2. **Zero AI Re-runs on Dropdown Changes & `UserCache` Persistence**:
   - AI is **never** re-invoked on `ProjectDropdown` or `DocumentTypeDropdown` changes.
   - Initial AI recommendations are cached in `CacheService.getUserCache()` (`AI_TRIAGE_<messageId>`, 2-hour TTL) for 0ms instant reload upon returning to emails/files.
   - Swapping `DocumentType` re-dispatches the targeted parser for the new type, overwriting fields where regex matches.
   - Swapping `Project` re-binds the target `DocumentLogWorkbook` and `_Config` settings without calling AI.

3. **Confidence Threshold Guards (70%) & Admin UI Rendering**:
   - `projectConfidence >= 0.70`: Pre-selects `ProjectDropdown`. Below `0.70`, defaults to `-- Select Project --`, disables primary submit action, and displays an informational warning banner.
   - `docTypeConfidence >= 0.70`: Pre-selects `DocumentTypeDropdown`. Below `0.70`, defaults to `-- Select Document Type --`.
   - Collapsible **Admin & Status** foldout section renders `projectConfidence`, `docTypeConfidence`, `metadataConfidence`, AI vs. Parser overwrite diff, and a cache reset button.

## Consequences

- Project-to-shared-drive disambiguation is handled cleanly by AI Triage at intake start.
- Email subject parsers are modularized by document type, eliminating monolithic parser switch statements.
- Interactive card dropdown changes achieve instant re-renders with 0 extra LLM calls or API latency.
- Users are protected against filing into incorrect projects when AI confidence is low (< 70%).
