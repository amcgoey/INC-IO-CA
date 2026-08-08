# ADR 0046: Minimum Viable Template (MVT) Visual Design System, Dynamic Tab Topology & Data Validation Architecture

## Context
Following visual review of the live MVT Template spreadsheet, the template layout, tab ordering, data validation behavior, and visual formatting required refinement to align precisely with canonical project reference templates (`ARCH_TEMPLATE_ID` and `FFE_TEMPLATE_ID`).

## Decisions

### 1. Workbook Tab Topology & Order
- **Primary Log Tabs**: `Submittal Arch`, `Submittal FFE` (positioned first).
- **Support / Lookup Tabs**: `Submittal Arch Support`, `Submittal FFE Support` / `Tag List` (positioned second).
- **System Configuration Tabs**: `_Shared`, `_Config`, `_AuditLog` (positioned at the end of the workbook).
- **Migration Backup Tabs**: Preserved at the far right.

### 2. Header Stack & Offsets Architecture (Rows 1–5)
- **Row 1 (Title Row)**: 16pt bold title (`Submittal Log`, `FF&E Submittal Log`, `Audit Log`), Dark Gray `#666666` fill, bold white `#FFFFFF` text.
- **Row 2 (Date/Subheader Row)**: 10pt italic date line (`=TODAY()`), Dark Gray `#666666` fill, white `#FFFFFF` text.
- **Row 3 (Column Headers Row)**: 11pt bold headers (`Status`, `Section`, etc.), Dark Gray `#666666` fill, white `#FFFFFF` text.
- **Row 4 (FormulaRow)**: Top-level `MAP`/`LAMBDA` spill formulas, Dark Gray `#666666` fill, white `#FFFFFF` text ("Formula Row. Do not delete or edit this row.").
- **Row 5 (Top BufferRow)**: Dark Gray `#666666` fill header-styled separator.
- **Row 6 to N (Content Rows)**: Populated with canonical example data rows extracted directly from reference templates.
- **Row N+1 (End BufferRow)**: Closing Dark Gray `#666666` buffer row.

### 3. Log Column Sequences & Validation Rules
- **`Submittal Arch` Columns**:
  1. `Status` (Dropdown: `Open`, `Closed`, `Waiting`, `Manager`, `Billed`)
  2. `Section` (**Free-Text Manual Entry** — no CSI dropdown validation)
  3. `Number`
  4. `Revision`
  5. `Title`
  6. `Date`
  7. `Contact` (Dropdown: `Shared_Contacts_Arch`)
  8. `Action` (Dropdown: `Actions_Submittal`)
  9. `Notes`
  10. `Link`
  11–15. `Calc File Name`, `Calc Number`, `Calc Title`, `Calc Contact Chain`, `Calc Sort` (Formulas)
- **`Submittal FFE` Columns**:
  1. `Status` (Dropdown)
  2. `Spec Tag` (**Dropdown**: `SpecTags`)
  3. `Related Tag` (**Dropdown**: `SpecTags`)
  4. `Revision`
  5. `Spec Title` (**Autopopulated `VLOOKUP` formula**)
  6. `Vendor` (**Dropdown**: `Vendors`)
  7. `Date`
  8. `Contact` (Dropdown: `Shared_Contacts_FFE`)
  9. `Action` (Dropdown: `Actions_Submittal`)
  10. `Notes`
  11. `Link`
  12–16. `Calc File Name`, `Calc Number`, `Calc Title`, `Calc Contact Chain`, `Calc Sort` (Formulas)

### 4. Settings Named Range Palette & Log Unstyled Data Fills
- **Settings Named Ranges** (`_Config`, `_Shared`, Support tabs): Color-coded with distinct pale desaturated fills (`#F1F3F4`, `#E8F0FE`, `#E6F4EA`, `#FCE8E6`) to visually delineate named range boundaries.
- **Settings Headers**: Dark Gray `#666666` fill with bold white `#FFFFFF` text.
- **Log Data Entry Rows**: Plain unstyled white `#FFFFFF` by default; background colors applied dynamically via conditional formatting rules.

### 5. Data Validation Strictness & Chip Display Style
- **Validation Strictness**: `strict: false` ("Show Warning" on invalid entry).
- **Custom UI**: `showCustomUi: true` (Google Sheets "Chip" display style).
- **Multi-Column List Schemas**:
  - `Actions`: `Action Order`, `Actions`, `Action Abbr.`
  - `Contacts`: `Contact Type`, `Contact Abbr.` (Company Abbr.), `Contact` (Company Full Name)

### 6. Conditional Formatting Rules
- Applied to all content rows between Top BufferRow and End BufferRow:
  - `Open`: Soft Pale Pink/Red (`#F4CCCC`)
  - `Closed`: Soft Gray (`#D9D9D9`) with muted text (`#999999`)
  - `Waiting`: Soft Pale Purple (`#D9D2E9`)
  - `Manager`: Soft Pale Cyan (`#D0E0E3`)
  - `Billed`: Soft Gray (`#D9D9D9`)

## Status
Accepted
