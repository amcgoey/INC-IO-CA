# 0038-picklist-abbreviation-normalization-and-dynamic-range-qualification.md

Establish Config-Driven Picklist Key Resolution (`normalizePicklistValue`), In-Memory Uppercasing & Raw Cell Casing Preservation, Declarative Field Normalization Rules (`keyNormalizationRule`), and Fully-Qualified Sheet-Scoped `optionsRange` Lookup Resolution (`resolvePicklistOptionsRange`).

## Context & Decision

To eliminate fragmented submittal group clusters and broken revision sorting in `RowPositionCalculator.ts` caused by string formatting variations, while preventing Apps Script `null` range lookup failures on sheet-scoped Named Ranges:

1. **Config-Driven Picklist Key Resolution & Zero Hardcoded TS Aliases**:
   - Picklist normalization leverages `DocumentFieldSpec.options` lookup tables defined in `DocumentTypeConfig` and spreadsheet `_Config` subtables.
   - When matching field values in `RowKeyFn`, if input matches an option's display `label` (e.g., `"Architectural"`), it dynamically resolves to the canonical `value` (`"ARCH"`).
   - Eliminates fragile, incomplete hardcoded TypeScript alias databases.

2. **In-Memory Uppercasing & Raw Cell Value Preservation**:
   - User input in UI cards and cell contents in Google Sheets retain their raw, original casing (Title Case, mixed case, etc.).
   - Uppercasing and whitespace trimming (`val.trim().toUpperCase()`) operate strictly in-memory inside `RowKeyFn` during key comparison in `RowPositionCalculator.ts`, keeping spreadsheet cells human-readable while guaranteeing exact key matching.

3. **Declarative Field Normalization Rules (`keyNormalizationRule`)**:
   - `DocumentFieldSpec` encapsulates field-specific key normalization behavior via `keyNormalizationRule?: 'picklist' | 'code' | 'exact'`:
     - `'picklist'` (default for dropdown fields): Case-insensitively resolves option `label` $\rightarrow$ option `value`.
     - `'code'` (for numeric/CSI fields like Spec Section): Strips whitespace and extracts leading code before dashes/labels (`"08 11 00 - Metal Doors"` $\rightarrow$ `"081100"`).
     - `'exact'` (default for free text): Trim + uppercase matching only; preserves dashes, spaces, and full text intact.

4. **Fully-Qualified `optionsRange` & Defensive 3-Tier Range Resolver (`resolvePicklistOptionsRange`)**:
   - `DocumentFieldSpec` schema explicitly includes `keyNormalizationRule?: 'picklist' | 'code' | 'exact'` and `optionsRange?: string`.
   - Sheet-scoped `optionsRange` entries in `DocumentFieldSpec` and `_Config` subtables require single-quoted sheet tab name prefixes (e.g. `'Submittal FFE Support'!Vendors` or `'Submittal Arch'!SpecTags`), while workbook-scoped ranges remain bare (`Shared_Contacts_Arch`).
   - `PicklistResolver` executes a 3-tier defensive lookup sequence:
     1. Attempt `spreadsheet.getRangeByName(optionsRange)` wrapped in a `try/catch` block.
     2. **Defensive Tab-Qualification Retry**: If `null` or exception thrown and `optionsRange` lacks `'!'`, retry with `'<activeSheetName>'!<optionsRange>`.
     3. **Offline & Error Fallback**: If still `null` or if `optionsRange` references a deleted/missing tab, catch the `Exception: Range not found`, log a diagnostic system audit event, return fallback defaults (`src/config/defaults/<DocTypeKey>.json`), and display a clear warning hint to the user: `"⚠️ Options range '${optionsRange}' is missing or invalid. Displaying fallback defaults."`

## Consequences

- Completely eliminates fragmented group clusters and erroneous blank spacer rows in `RowPositionCalculator.ts`.
- Spreadsheet cell values and UI input widgets preserve raw human-readable formatting.
- Missing or deleted `optionsRange` targets are caught safely, preventing Apps Script unhandled exception crashes and providing actionable feedback to the user.
- All picklist mapping remains 100% config-driven via `_Config` sheets without hardcoded TypeScript alias maps.
- Sheet-scoped named range lookups in Apps Script execute safely without `null` pointer failures.
