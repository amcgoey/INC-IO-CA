# 0044: Dedicated Adapter Namespace & Directory Architecture for Multi-Host Swappability

## Status
Accepted

## Context
As the Multi-DocumentType Architecture & Unified Workbook refactor progresses (Issue 114), keeping code modular, testable, and maintainable requires enforcing strict architectural boundaries between pure core domain logic (Tier 1) and platform-specific infrastructure implementations (Tier 2, such as Google Apps Script APIs `SpreadsheetApp`, `DriveApp`, `PropertiesService`, `CacheService`, `CardService`).

Without an explicit physical directory boundary, host-specific implementations risk leaking into core domain logic, making future migrations to non-GAS hosts (such as PostgreSQL/MongoDB backends or AWS S3/Cloud Storage) or pure Node.js CLI runtimes difficult.

## Decision
We establish a dedicated directory and namespace structure separating pure domain code (`src/core/`) from infrastructure adapter implementations (`src/adapters/`):

1. **`src/core/` (Tier 1 Pure Core)**:
   - Contains pure domain logic, data models, pipelines, and abstract interface seams.
   - Dual GAS V8 and Node.js compatible with zero GAS global references (`SpreadsheetApp`, `DriveApp`, etc.) and zero Node.js built-ins.
   - Modules: `src/core/config/`, `src/core/intake/`, `src/core/workflow/`, `src/core/log/`, `src/core/admin/`, and `src/core/interfaces/`.

2. **`src/adapters/` (Tier 2 & Future Host Implementations)**:
   - Contains concrete infrastructure implementations of Tier 1 abstract interfaces.
   - Provider subdirectories isolate host dependencies:
     - `src/adapters/gas/`: Google Apps Script implementations (`GoogleSheetsLogRepository`, `GoogleDriveFilingRepository`, `GeminiAiAnalysisAdapter`, `ScriptCacheAdapter`, `PropertiesServiceLockAdapter`, `CardPresenter`).
     - `src/adapters/postgres/` / `src/adapters/s3/`: Future non-GAS cloud/database adapters.

3. **Strict Seam Isolation**:
   - All Tier 1 workflows (`WorkflowRunner`, `LogEngine`, `DocumentPipeline`, `DocumentTypeConfigRegistry`) depend strictly on the 6 Tier 1 abstract interface contracts (`LogRepository`, `DriveFilingRepository`, `AiAnalysisService`, `CacheAdapter`, `SpreadsheetLockAdapter`, `UserInterfacePresenter`).

## Consequences
- Core domain logic can be tested in pure Node.js (`npm test`) using in-memory `Fake` adapters in <1s without GAS mocks.
- Adding database (PostgreSQL) or cloud storage (AWS S3) adapters requires zero modifications to Tier 1 domain logic or workflow runners.
- The physical directory structure makes compliance with 3-Tier GAS Architecture (ADR 0013) obvious and automatically verifiable in code reviews.
