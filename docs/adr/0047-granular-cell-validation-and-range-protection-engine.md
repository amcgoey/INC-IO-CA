# 0047-granular-cell-validation-and-range-protection-engine.md

Establish Declarative Validation Rule Schema (`ValidationRuleSpec`), Strict Deprecation of `validationRange`, Dedicated Single-Column Named Ranges (`targetNamedRange`), Selective Validation Scoping, Declarative `numberFormat` Cell Formatting, Three-Tier Soft Warning Protection Taxonomy (`warningOnly: true`), `SheetValidationAndProtectionAdapter`, and `TemplateDriftAuditor` Auto-Patching.

## Context & Decision

To protect formula integrity, row headers, and system configuration tabs from accidental manual overwrites in Google Sheets workbooks while enforcing strict drop-down picklist integrity without obstructing user data entry:

1. **Declarative `ValidationRuleSpec` & Deprecation of Legacy `validationRange`**:
   - `ColumnSpec` and `DocumentFieldSpec` encapsulate validation criteria via `validationRule?: ValidationRuleSpec`:
     ```typescript
     export type ValidationType = "LIST_FROM_RANGE" | "REGEX_MATCH" | "DATE_FORMAT" | "NUMBER_RANGE" | "CUSTOM_FORMULA";

     export interface ValidationRuleSpec {
       type: ValidationType;
       targetNamedRange?: string; // Single-column Named Range name for LIST_FROM_RANGE (e.g. "Shared_Contacts_Arch_Keys")
       pattern?: string;          // Regex pattern string for REGEX_MATCH
       minValue?: number;         // Min numeric value for NUMBER_RANGE
       maxValue?: number;         // Max numeric value for NUMBER_RANGE
       allowInvalid: boolean;     // false = hard reject input
       helpText?: string;         // Optional UI tooltip prompt
     }
     ```
   - Legacy `validationRange: string` is strictly deprecated across all workbook specs, test fixtures, and `_Config` subtables in favor of `validationRule`.

2. **Dedicated Single-Column Named Ranges (`targetNamedRange`)**:
   - For `LIST_FROM_RANGE` validations, dedicated single-column Named Ranges (`Shared_Contacts_Arch_Keys`, `Shared_Contacts_FFE_Keys`, `Actions_Submittal_Labels`, `Statuses_Submittal_Labels`, `Vendors_Keys`, `SpecTags_Keys`) are registered in `DocumentLogWorkbookSpec` and Google Sheets.
   - Eliminates raw cell ranges (`_Shared!F2:F20`) and numeric column indices (`targetColumnIndex`) from specs and UI.
   - Data validation rules in Google Sheets UI display clean, human-readable named ranges (`=Shared_Contacts_Arch_Keys`).

3. **Selective Validation Scoping & Declarative `numberFormat` Cell Formatting**:
   - Strict `DataValidation` is applied exclusively to picklist/dropdown columns (`status`, `contact`, `action`, `vendor`, `specTag`).
   - CSI Section, Submittal Number, Revision, and Date columns do not use data validation; instead, declarative `numberFormat?: string` (e.g., `"000000"` for section, `"000"` for number, `"yyMMdd"` for date) is applied via `.setNumberFormat()` during provisioning and patching.

4. **Three-Tier Soft Warning Protection Taxonomy (`warningOnly: true`)**:
   - Establishes 3 standard protection tiers with soft warning banners (`setWarningOnly(true)`):
     1. `SYSTEM_TAB_PROTECTION`: Applied to `_Config` and `_AuditLog` tabs.
     2. `HEADER_AND_FORMULA_PROTECTION`: Applied to Rows 1–3 of all log tabs (`LOCK_HEADERS_<TabName>`), protecting header rows and Row 2 `MAP/LAMBDA` formula definitions.
     3. `CALCULATED_COLUMN_PROTECTION`: Applied to calculated column ranges across data rows (e.g. `calcFileName`, `calcNumber`, `calcTitle`, `calcContactChain`, `calcSort`).

5. **`SheetValidationAndProtectionAdapter` & Drift Auditor Auto-Patching**:
   - `SheetValidationAndProtectionAdapter` encapsulating Google Sheets `Protection` and `DataValidation` APIs.
   - `TemplateDriftAuditor` extends structural auditing to check protections and validations (`PROTECTION_DRIFT` and `VALIDATION_DRIFT`), reporting discrepancies as `WARNING` severity (`MINOR_DRIFT`) and auto-patching missing protections and validations under `GasSpreadsheetLockAdapter`.

## Consequences

- Row 1–2 headers, Row 2 `MAP/LAMBDA` formulas, and calculated columns display warning banners when users attempt manual edits.
- Dropdown columns strictly enforce valid selection options via single-column Named Ranges visible in Google Sheets Named Range Manager.
- Section numbers and dates format automatically without hard-rejecting input.
- Missing validations or protections are detected as `MINOR_DRIFT` and auto-patched safely.
