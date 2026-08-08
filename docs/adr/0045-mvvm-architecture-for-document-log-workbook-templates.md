# 0045: MVVM Architecture for Minimum Viable Template (MVT) Layout, Styling & Provisioner Tooling

## Status
Accepted

## Context
As part of Milestone 3 in Issue 114, the project requires establishing a standardized Minimum Viable Template (MVT) Google Sheet layout, aesthetic design system, offline fixture generator (`scripts/template/generate-fixture.ts`), live Google Sheets API provisioner (`scripts/template/deploy-live.ts`), and live structural verification tool (`scripts/template/verify-live.ts`).

Without a formal architectural separation between domain layout contracts and visual presentation rules, spreadsheet styling (colors, column widths, font choices, date/number formats) risks being hardcoded inside Google Sheets API payload builders or duplicated across offline test fixtures and live deployment scripts.

## Decision
We establish a Model-View-ViewModel (MVVM) architectural pattern for `DocumentLogWorkbook` template specifications and provisioner tooling:

1. **Model (`DocumentLogWorkbookSpec.ts` - `src/core/config/`)**:
   - Pure domain layout and schema specification (`DOCUMENT_LOG_WORKBOOK_SPEC`, schema version `"1.0.0"`, tab roles, field IDs, logical data types, named range taxonomy).
   - Completely free of rendering or visual styling details.

2. **View Spec (`DocumentLogWorkbookViewSpec.ts` - `src/core/config/`)**:
   - Visual presentation specification tokenizing design attributes (header fill colors `#666666` / `rgb(102,102,102)`, formula row warning styles, font typography, text alignment, column pixel widths, number/date formatting strings, and conditional formatting rules) derived from live reference submittal log templates (`ARCH` and `FFE`).

3. **ViewModel (`WorkbookTemplateViewModel.ts` - `src/core/config/`)**:
   - The binding presenter that maps the domain Model (`DocumentLogWorkbookSpec`) and View Spec (`DocumentLogWorkbookViewSpec`) into:
     a) Consolidated `spreadsheets.batchUpdate` request payloads for live Google Sheets API provisioning (`deploy-live.ts`).
     b) Serialized JSON fixtures (`toFixtureJson()`) for offline `GasMockHarness` testing (`generate-fixture.ts`).

4. **Modern `MAP`/`LAMBDA` FormulaRow Expressions**:
   - Row 2 (`FormulaRow`) holds top-level Google Sheets `MAP`/`LAMBDA` spill formulas for calculated columns (`Calc File Name`, `Calc Number`, `Calc Title`, `Calc Contact Chain`, `Calc Sort`), spilling down across data rows starting at Row 4 (`FIRST_DATA_ROW_OFFSET = 3`).

5. **Tooling & Live Verification Pipeline**:
   - `scripts/template/generate-fixture.ts` (`npm run template:generate`): Programmatically exports `test/fixtures/document-log-workbook-template.json`.
   - `scripts/template/deploy-live.ts` (`npm run template:deploy-live`): Idempotent create/update CLI provisioning live Google Sheets via single-pass Google Sheets API batch update requests with exponential backoff retries.
   - `scripts/template/verify-live.ts` (`npm run template:verify-live`): Runs 6-dimension `TemplateDriftAuditor` structural checks and mock row formula calculation roundtrips against live test sheets, generating an audit report at `.scratch/mvt-verification-report.md`.

## Consequences
- Single source of truth for both structural schema contracts and visual aesthetic design tokens.
- Offline `GasMockHarness` test environments remain 100% synchronized with live Google Sheets API deployments.
- Re-running live template deployments updates headers, styling, drop-downs, and formulas idempotently without destroying user-entered submittal log rows.
- Modern `MAP`/`LAMBDA` formulas eliminate legacy `ARRAYFORMULA` range truncation and `#REF!` errors when blank rows exist in log tabs.
