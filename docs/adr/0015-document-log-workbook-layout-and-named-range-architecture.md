# 0015-document-log-workbook-layout-and-named-range-architecture.md

Establish the tab taxonomy, Dual-Tier Named Range Scoping architecture, and relative log layout rules (including generic Sheet-Scoped `Headers`, `FormulaRow`, `Data` Named Ranges, `BufferRow`, and 3-row data offset) for all `DocumentLogWorkbook` Google Sheets.

## Context & Decision

To support multiple `DocumentTypes` in a single project Google Sheet while preserving user manual entry capabilities, enabling seamless tab duplication without range renaming, and eliminating hardcoded row/column index assumptions in TypeScript code:

1. **Tab Taxonomy**:
   - System Config: `_Config`
   - Shared Settings: `_Shared` (contains discipline-specific contact lists like `Shared_Contacts_Arch` and `Shared_Contacts_FFE`)
   - Log Tabs: General-to-specific naming (`Submittal Arch`, `Submittal FFE`, `RFI Arch`)
   - Support Info Tabs: `<DocType> Support` (e.g., `Submittal FFE Support`, `Submittal Arch Support`)

2. **Dual-Tier Named Range Organization & Scoping Architecture**:
   - **Sheet-Scoped Generic Named Ranges (Tab-Local / Log & Support Tabs)**:
     - Log tabs define generic Sheet-Scoped Named Ranges: `Headers` (2-row range spanning header Row 1 and `FormulaRow` Row 2), `FormulaRow` (Row 2, holding top-level MAP/LAMBDA calculated column definitions), and `Data` (enclosing active entries between top and bottom buffer rows).
     - Dedicated Support Tabs (`<DocType> Support`) define generic Sheet-Scoped Named Ranges (`Vendors`, `SpecTags`, `Sections`), referenced via `'<DocType> Support'!Vendors`.
     - *Duplication Rules*:
       - **Application Duplication**: When the application duplicates a sheet tab, it MUST perform automated validation checks to confirm sheet-scoped named ranges (`Headers`, `FormulaRow`, `Data`) are properly bound and intact.
       - **User Manual Duplication**: When a user manually duplicates a tab in Google Sheets, the user is responsible for validating and adjusting any sheet-scoped named range issues.
   - **Workbook-Scoped Specific Named Ranges (Consolidated Tabs & Singletons)**:
     - `_Config` Tab: `MANIFEST_SCHEMA_VERSION` (global SemVer string), `Config_Manifest` (master catalog table), `Config_<DocTypeKey>` (e.g. `Config_Submittal`), `Config_<DocTypeKey>_Fields`.
     - `_Shared` Tab: `Shared_Contacts_<Discipline>` (e.g., `Shared_Contacts_Arch`, `Shared_Contacts_FFE`), `Actions_<DocTypeKey>` (e.g. `Actions_Submittal`, `Actions_RFI`).
     - *Rationale*: Consolidated tabs housing multiple tables cannot reuse sheet-scoped names without namespace collisions.

3. **Log Tab Structural Layout & 3-Row Offset Rule**:
   - `Header Row`: Row 1 (`Row H`, upper row of the 2-row `Headers` range).
   - `FormulaRow`: Row 2 (`Row H + 1`, lower row of the 2-row `Headers` range). Holds top-level MAP/LAMBDA formulas for calculated columns (`Calc File Name`, `Calc Number`, `Calc Title`, `Calc Contact Chain`).
   - `BufferRow`: Row 3 (`Row H + 2`). Protected empty buffer row preventing formula overwrites.
   - `First Active Data Row`: Row 4 (`Row H + 3`, `FIRST_DATA_ROW_OFFSET = 3`).

## Consequences

- Log tabs and dedicated support tabs can be cloned or duplicated directly by users or scripts. App-driven tab cloning automatically validates named range integrity.
- TypeScript application code resolves log headers dynamically (`sheet.getRangeByName("Headers")` or `'<TabName>'!Headers`) across the 2-row range (reading header strings from Row 1) without hardcoded row or column numbers.
- Consolidated tab configuration tables (`_Config`) and shared picklists (`_Shared`) remain explicitly scoped, preventing naming collisions.

