# 0002-unified-pdf-document-service.md

Unify PDF form action extraction and submittal document stamping behind a deep `PdfDocumentService` interface with lazy PDFLib CDN initialization and in-memory test fake capabilities.

## Context & Decision

Previously, low-level PDFLib CDN fetching (`UrlFetchApp.fetch`), `eval`, `Uint8Array` byte array conversion, form field matching, and page copying were duplicated across shallow top-level functions (`extractActionFromPdfForm` in `Parser.ts` and `manipulatePdf` in `PdfUtils.ts`). This caused redundant network round-trips to fetch PDFLib on every call and created tight coupling to the Google Apps Script environment, making offline Node.js testing difficult.

We decided to unify all PDF operations behind `PdfDocumentService`:
1. **Unified Interface (`PdfDocumentService`)**: Exposes two high-level methods: `extractFormAction(fileId)` and `stampSubmittal(sourceBlob, data, options)`.
2. **Lazy CDN Singleton Loader (`getPdfLib()`)**: Encapsulates `UrlFetchApp.fetch` and dynamic `eval` within a lazy loader that evaluates `PDFLib` once per execution context and caches the global reference.
3. **Adapter Strategy (`FakePdfDocumentService` & `defaultPdfDocumentService`)**: Follows the `LogRepository` pattern by introducing an in-memory fake (`FakePdfDocumentService`) and global reference (`defaultPdfDocumentService`), allowing unit and integration tests to run without network or Google Apps Script runtime dependencies.
4. **Differentiated Error Handling**: `extractFormAction` acts as a best-effort heuristic returning `string | null`, while `stampSubmittal` fails fast with explicit exceptions (`TEMPLATE_MISSING`, corrupt PDF stream) when critical operations fail.

## Consequences

- Low-level PDF library loading, byte buffer mapping, and field matching logic are completely hidden inside `PdfDocumentService`.
- Multiple PDF operations during a single script execution invoke `UrlFetchApp.fetch` and `eval` at most once.
- Integration tests can stub PDF form extraction and stamping behavior deterministically in Node.js test suites.
