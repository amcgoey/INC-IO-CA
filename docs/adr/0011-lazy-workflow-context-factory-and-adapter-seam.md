# 0011-lazy-workflow-context-factory-and-adapter-seam.md

Lazy `WorkflowContextFactory` instantiation seam, getter-backed adapter access, and test harness integration.

## Context & Decision

To support generic workflow execution without introducing performance overhead in Google Apps Script, `DocumentActionContext` needs access to external service adapters (`logRepository`, `filingRepository`, `pdfService`, `aiService`) without eagerly instantiating unnecessary services on every script invocation. Furthermore, unit tests in `test/harness/fakes/` require a deterministic, zero-boilerplate mechanism to inject test fakes without leaking state across tests.

We decided to establish `WorkflowContextFactory` with the following design choices:
1. **Lazy Getter Properties (`context.adapters`)**: `WorkflowContextFactory` populates `context.adapters` using ES5 lazy getters (`Object.defineProperty`). Concrete adapter instances are created and cached only upon first property access (e.g. `context.adapters.logRepository`).
2. **`createTestContext` & Adapter Overrides**: `WorkflowContextFactory.createContext(...)` accepts an optional `overrides?: Partial<AdapterMap>` parameter. `WorkflowContextFactory.createTestContext(...)` automatically supplies in-memory fakes (`FakeLogRepository`, `FakeDriveFilingRepository`, `FakePdfDocumentService`, `FakeAiAnalysisAdapter`) for any un-overridden adapters, guaranteeing unit tests execute in isolation without external network/script API dependencies.
3. **Immutable Context State Transition Preservation**: `WorkflowRunner` and action execution steps preserve the `context.adapters` reference across step state transitions (`{ ...context, adapters: context.adapters, ...stepResult }`), sharing cached adapter instances for the lifetime of a single workflow execution.

## Consequences

- Zero performance penalty in Google Apps Script from unused adapters during partial workflow step runs.
- Unit and integration tests run deterministically without boilerplate mock setup or risk of external API calls.
- Natural property access (`context.adapters.logRepository`) is maintained across all `DocumentAction` implementations.
