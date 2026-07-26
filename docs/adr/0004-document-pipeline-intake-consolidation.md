# 0004-document-pipeline-intake-consolidation.md

Consolidate raw document intake parsing (email metadata, Drive filenames, UI form inputs) and validation rules into a single deep `DocumentPipeline` module with dedicated intake submodules (`EmailIntakeParser`, `DriveFilenameIntakeParser`, `FormIntakeParser`).

## Context & Decision

Previously, document intake logic was fragmented across standalone functions in `Parser.ts` (`parseEmailData`, `parseDriveFilename`), `Validation.ts` (`validateDocument`), and `Process.ts` (manual form input extraction). This forced orchestrators and UI card builders to juggle overlapping data structures (`ParsedData`, `RawDocument`, `ValidatedDocument`) and led to duplicated field mapping across entry points.

We decided to consolidate intake parsing and validation into `DocumentPipeline` based on the following key decisions:

1. **Decoupled Input Boundaries**: `DocumentPipeline` accepts pure `RawDocument` dictionaries and `ValidationContext` objects, completely decoupled from Google Apps Script `GoogleAppsScriptEvent` objects or card builder UI logic.
2. **Pure Interactive Callouts**: `DocumentPipeline` returns pure `ValidationResult` discriminated unions (including `status: "interaction_required"` with `interactionType` and `message`). Card builder logic in `Process.ts` formats `FlashMessage` and CardService navigation updates without leaking UI concerns into the pipeline.
3. **Submodules Across Testing Seams**: Intake parsing is divided into explicit submodules (`EmailIntakeParser`, `DriveFilenameIntakeParser`, `FormIntakeParser`) that expose internal seams for unit testing before `DocumentPipeline` validates the resulting `RawDocument`.
4. **Direct Clean Refactor**: Direct migration of callers (`Main.ts`, `Process.ts`, `Validation.test.ts`) without retaining legacy shim functions, ensuring clean code hygiene and immediate removal of dead code.

## Consequences

- Intake parsing, validation, and discipline details normalization are unified under a single deep module interface.
- Email subjects, Drive filenames, and UI form entries pass through consistent parsing and validation pipelines.
- Unit tests can verify intake submodules and business validation rules independently in pure Node.js environments without Google Apps Script runtime dependencies.
