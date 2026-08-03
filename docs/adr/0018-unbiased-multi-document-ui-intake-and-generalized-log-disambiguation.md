# 0018-unbiased-multi-document-ui-intake-and-generalized-log-disambiguation.md

Establish the unbiased contextual intake card architecture (`UnbiasedIntakeCard`), generalized project log disambiguation, and target-scoped card reload event handlers.

## Context & Decision

To support multiple document types (Submittals, RFIs, ASIs, Bulletins, Change Orders) during Google Workspace add-on intake while preserving existing vendor parsing logic and preventing hardcoded Submittal-only UI assumptions:

1. **Unified Intake & Disambiguation Pipeline**:
   - **Multi-Type `EmailIntakeParser`**: Extends existing vendor parsers (Procore, Forma, CMiC) and generic fallback parser to detect `documentType` (`Submittal`, `RFI`, `ASI`, etc.) alongside `driveName` (Project Abbr).
   - **Single-Pass AI Classifier Fallback**: Serves as a 1-pass triage fallback when regex parsing is unparsed or confidence is low.
   - **Generalized Project Log Disambiguation**: Binds target `DocumentLogWorkbook` by matching `driveName`, then uses `Config_Manifest` and `DocumentTypeConfig` to resolve the target log tab (`Submittal Arch`, `Submittal FFE`, `RFI Log`).

2. **Target-Scoped Card Reload & Loss-Less State Preservation**:
   - `CardPresenter` attaches event handlers (`onProjectChanged`, `onDocumentTypeChanged`, `onLogFileChanged`).
   - Changing `Project` re-disambiguates the workbook, re-loads `_Config` and `_Shared` settings, and refreshes available `DocumentType` / `LogFile` options.
   - Changing `DocumentType` swaps type-specific input fields (e.g. `CSI Section` vs `Spec Tag` vs `RFI Number`) while preserving universal user entries (title, date, notes).

3. **Graced Fallback UI & Manual Override Guard**:
   - Unparsed or low-confidence correspondence displays an informational warning banner.
   - `ProjectDropdown` defaults to `-- Select Project --` and disables primary submit action until valid Project and DocumentType are bound.

## Consequences

- Existing vendor email parsing rules are preserved intact while extending seamless support to all construction document types.
- Card re-renders remain fast and loss-less, preserving user manual entries when swapping projects or document types.
- Unparsed email subjects gracefully prompt for manual selection without pipeline crashes or silent filing into incorrect spreadsheets.
