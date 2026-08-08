# 0030-documenttype-aware-log-workbook-disambiguation-engine.md

Establish disjunctive Drive query construction, DocumentType-scoped search caching, multi-tier candidate spreadsheet disambiguation scoring, and Tier 1 pure scoring architecture for project log discovery.

## Context & Decision

In multi-document-type architectures, locating the correct project log workbook per `DocumentType` in a Shared Drive requires dynamic query building, isolated caching, and structural candidate ranking:

1. **Disjunctive Drive Query Construction (`DisjunctiveLogSearchQuery`)**:
   - Drive API queries (`(Drive as any).Files.list({ q: ..., pageSize: 10 })`) dynamically format `DocumentTypeConfig.logSearchTerms` into disjunctive `OR` clauses:
     ```
     (title contains 'submittal log' or title contains 'submittal') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false
     ```
   - Results are strictly capped at **10 candidate files at the most** to optimize execution latency and avoid API quota exhaustion.

2. **DocumentType-Scoped Cache Key & Invalidation (`DocumentTypeSearchCacheKey`)**:
   - Discovered candidate workbooks are cached in `UserCache` per Shared Drive and document type using `log_search_<DriveId>_<DocTypeKey>` (e.g., `log_search_0A123_Submittal` vs `log_search_0A123_RFI`) with 3600s TTL.
   - Admin cache invalidation in `TriageAdminFoldOut` purges all `log_search_<DriveId>_*` keys across all document types.

3. **Multi-Tier Candidate Disambiguation & Scoring Engine (`LogDisambiguationScoringEngine`)**:
   - Candidate spreadsheets returned from Drive are evaluated and scored against `DocumentTypeConfig`:
     - **Structural Inspection**:
       - `_Config` manifest contains active `docTypeKey` in `Config_Manifest` (+50 pts)
       - Sheet tab matches `DocumentTypeConfig.logSheetName` (+40 pts)
       - Title matches primary `logSearchTerms` exactly (+20 pts)
     - **Parent Folder Match** (+30 pts): Parent folder matches `"1 Admin"`, `"01 Admin"`, `"00 Admin"`, `"Admin"`, or `logParentFolderTerms`.
     - **Title Affirmative Terms** (+10 pts): Title contains `"Document"` or `"Log"`.
     - **Demotion Penalty**:
       - Non-Production / Archive Demotion (-30 pts): Candidate contains `"Copy"`, `"Backup"`, `"Bak"`, `"Duplicate"`, `"Archive"`, `"Archived"`, `"Old"`, `"Legacy"`, `"Draft"`, `"WIP"`, `"Temp"`, `"Test"`.
       - *Rationale*: -30 pts ensures archived/copy log sheets are demoted low on the candidate list while remaining discoverable if active workbooks are absent.
   - **Candidate Ordering & Tie-Breaking Rules**:
     - Candidates are ranked primarily by total score.
     - When candidates tie in score, the engine breaks ties by **most recent modified date** (`lastModifiedDate`, descending order).
     - If still tied after `lastModifiedDate` comparison, candidate order of retrieval from Drive API is preserved.
   - If a single candidate achieves the top score, it is auto-selected; if multiple candidates exist, `UnbiasedIntakeCard` populates the log selection dropdown ordered by rank.

4. **Tier 1 Pure Scorer & Tier 2 GAS Search Adapter (ADR 0013)**:
   - **Tier 1 (`LogDisambiguationScorer.ts`)**: Pure core logic (0 GAS dependencies) taking candidate metadata structs (`{ id, title, parentFolderNames, sheetTabNames, manifestDocTypes }`) and returning ranked candidates with numeric confidence scores. 100% testable in Node.js via `npm test`.
   - **Tier 2 (`GoogleDriveLogSearchAdapter.ts` / `UI.ts`)**: GAS-specific adapter executing Drive file queries and tab inspections before calling Tier 1 scoring routines.

## Consequences

- Log discovery is 100% dynamic across document types without hardcoded search terms.
- Cache collisions between document types in the same Shared Drive are eliminated.
- Low-quality candidate workbooks (backups, copies, archived sheets) are systematically demoted below active production workbooks.
- Scoring algorithms are 100% unit-testable in Node without requiring GAS mocks or Google Drive API calls.
