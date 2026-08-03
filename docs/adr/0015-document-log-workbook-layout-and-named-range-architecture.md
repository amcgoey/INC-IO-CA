# 0015-document-log-workbook-layout-and-named-range-architecture.md

Establish the tab taxonomy, Named Range organization, and relative log layout rules (including dynamic `<TabName>_Headers` Named Ranges, `FormulaRow`, `BufferRow`, and 3-row data offset) for all `DocumentLogWorkbook` Google Sheets.

## Context & Decision

To support multiple `DocumentTypes` in a single project Google Sheet while preserving user manual entry capabilities and eliminating hardcoded row/column index assumptions in TypeScript code:

1. **Tab Taxonomy**:
   - System Config: `_Config`
   - Shared Settings: `_Shared` (contains discipline-specific contact lists like `Contacts_Arch` and `Contacts_FFE`)
   - Log Tabs: General-to-specific naming (`Submittal Arch`, `Submittal FFE`, `RFI Arch`)
   - Support Info Tabs: `<DocType> Support` (e.g., `Submittal FFE Support`, `Submittal Arch Support`)

2. **Named Range Organization & Header Resolution**:
   - Every log tab defines a `<TabName>_Headers` Named Range (e.g. `Submittal_Arch_Headers`) spanning its header row, eliminating hardcoded "Row 3" or column index references in TypeScript code.
   - Discipline contacts on `_Shared`: `Shared_Contacts_Arch`, `Shared_Contacts_FFE`.
   - Action Types: Scoped by DocumentType (e.g., `Actions_Submittal`, `Actions_RFI`).
   - Support lookup ranges: `Submittal_FFE_SpecTags`, `Submittal_FFE_Vendors`, `Submittal_Arch_Sections`.

3. **Log Tab Structural Layout & 3-Row Offset Rule**:
   - `Header Row`: Defined by `<TabName>_Headers` Named Range (`Row H`).
   - `FormulaRow`: `Row H + 1`. Contains backup formulas for calculated columns (`Calc File Name`, `Calc Number`, `Calc Title`, `Calc Contact Chain`; `Calc Sort` deprecated) to preserve user manual entry calculations.
   - `BufferRow`: `Row H + 2`. Empty buffer row preventing accidental formula overwrites.
   - `First Active Data Row`: `Row H + 3` (`FIRST_DATA_ROW_OFFSET = 3`).

## Consequences

- TypeScript application code resolves log headers dynamically without any hardcoded row or column numbers.
- Manual spreadsheet users retain calculated field backup formulas without risking formula corruption during manual row entry.
- Contact lists and action types are properly scoped by discipline and document type without naming collisions.
