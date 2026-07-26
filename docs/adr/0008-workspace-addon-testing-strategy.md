# 0008-workspace-addon-testing-strategy.md

Workspace Add-on Modular Testing Strategy (GasMockHarness, Domain Fakes, Test Generators, and Card UI Structural Snapshots).

## Context & Decision

Testing Google Apps Script (GAS) Workspace Add-ons has historically relied on ad-hoc global stubbing (`globalThis.CardService = ...`) duplicated across individual test files, exposing tests to cross-contamination, brittle UI builder index assertions, and potential test-double leakage into production deployment bundles (`clasp push`). As the application expands to support multi-document pipelines (Submittals, RFIs, ASIs, Bulletins), a structured, high-leverage testing architecture is required.

We decided to establish a comprehensive, dual-layer modular testing architecture:

1. **Centralized Infrastructure Harness (`test/harness/GasMockHarness.ts`)**:
   - Manages mutations to `globalThis` (`CardService`, `DriveApp`, `SpreadsheetApp`, `CacheService`, `PropertiesService`, `CONFIG`) via explicit lifecycle methods (`install()` and `reset()`).
   - Translates raw API builder chains into queryable in-memory state models (virtual Drive file trees, 2D Spreadsheet grid matrices, JSON Card output trees).

2. **Isolated Domain Fakes & Composite Context (`test/harness/fakes/`)**:
   - In-memory domain fakes (`FakeLogRepository`, `FakeDriveFilingRepository`, `FakePdfDocumentService`, `FakeAiAnalysisAdapter`) live strictly in `test/harness/fakes/`, maintaining a clean seam that prevents test double code from leaking into production `src/` builds.
   - Provides a `createTestContext()` builder in `test/harness/` that instantiates and wires all domain fakes in a single line for unit testing multi-document pipelines.

3. **Strongly-Typed Fixture Generators (`test/harness/factories/`)**:
   - `DocumentFactory`: Specialized generator functions (`createRawSubmittal()`, `createValidatedArchitectureSubmittal()`, `createRawRfi()`, etc.) accepting `Partial<T>` overrides.
   - `EventFactory`: Trigger-context generators (`createCardSubmitEvent()`, `createGmailContextEvent()`, `createDriveContextEvent()`) with automatic dual-form (`formInput`/`formInputs`) normalization.

4. **Card UI Serialization & Semantic Assertions**:
   - `CardSerializer.toJSON(card)` compiles `CardService` builder outputs into normalized JSON trees.
   - `GasMockHarness.getCardServiceState()` provides semantic assertion helpers (`hasWidgetText()`, `findButton()`, `getNotificationText()`) to keep unit tests green during UI section layout refactors.
   - `npm run preview:card` (`scripts/previewCard.ts`) and JSON baseline snapshots (`test/snapshots/cards/*.json`) support rapid local visual verification in the terminal.

## Consequences

- Unit tests for any document type (Submittal, RFI, ASI, Bulletin) run 100% locally in Node.js in milliseconds without live Google API credentials or network calls.
- `src/` production bundles pushed to Google Apps Script via `clasp` remain clean and devoid of test double code.
- UI presenter tests assert on semantic content and interactive actions rather than fragile array indices, dramatically reducing test maintenance overhead.
