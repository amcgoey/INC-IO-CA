# 0005-ai-analysis-service-consolidation.md

> [!NOTE]
> **Extended by [ADR 0018](0018-unbiased-multi-document-ui-intake-and-generalized-log-disambiguation.md)**: AI Triage now executes first at intake activation to classify project and document type, returning 3 separate confidence scores with UserCache persistence.

Consolidate AI auto-triage predictions, deep submittal document analysis, error masking, and caching behind a deep `AiAnalysisService` interface with `GeminiAiAnalysisAdapter` and `FakeAiAnalysisAdapter` implementations.

## Context & Decision

Previously, AI prediction and analysis logic was scattered across shallow functions in `AIUtils.ts` (`predictProjectAndDiscipline`, `analyzeSubmittalDeep`, `getCachedDrives`, `getCachedPrediction`, `splitPdfToBase64`). `Main.ts` directly orchestrated caching, Drive API list calls, and error handling, while `splitPdfToBase64` duplicated `pdf-lib` initialization and page copying logic from `PdfDocumentService`.

We decided to consolidate all AI prediction and analysis capabilities into `AiAnalysisService` with the following architectural choices:

1. **Service Interface (`AiAnalysisService`)**: Exposes `triageEmail(emailData, messageId?)` and `analyzeSubmittal(sourceBlob, emailText, contextObj)` methods. Supports future document types and analysis techniques while keeping a consistent abstraction seam.
2. **Discriminated Union Error Outcomes**: Returns typed `AiPredictionResult` and `DeepAnalysisResult` discriminated unions with error codes (`RATE_LIMITED`, `MISSING_KEY`, `API_FAILURE`, `PARSE_FAILURE`) and user-facing messages. `GeminiAiAnalysisAdapter` encapsulates `sanitizeErrorString` so sensitive script properties and keys are masked automatically.
3. **Decoupled Infrastructure Dependencies**: Injects `DriveNameProvider` and `CacheAdapter` abstractions into `GeminiAiAnalysisAdapter`, removing direct `CacheService` and `Drive.Drives.list` dependencies for Node.js unit testing.
4. **Delegated PDF Slicing**: Extends `PdfDocumentService` with `slicePagesToBase64(sourceBlob, maxPages)` to eliminate duplicated `pdf-lib` evaluation logic in `AIUtils.ts`.

## Consequences

- `Main.ts` delegates all AI triage execution, caching, and error masking to `AiAnalysisService`.
- Gemini API retries, error sanitization, prompt generation, and schema parsing are isolated within `GeminiAiAnalysisAdapter`.
- `FakeAiAnalysisAdapter` and `FakePdfDocumentService` enable complete offline unit testing of triage and deep submittal analysis flows in Node.js.
