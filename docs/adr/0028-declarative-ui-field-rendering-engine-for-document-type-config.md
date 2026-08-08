# 0028-declarative-ui-field-rendering-engine-for-document-type-config.md

Establish dynamic UI form widget generation (`renderDynamicFormFields`) based on `DocumentFieldSpec` in `DocumentTypeConfig`, 5-tier field state hydration hierarchy, 2D Named Range picklist resolution (`optionsRange`), static JSON fallback alignment, and complete exclusion of calculated fields.

## Context & Decision

To eliminate hardcoded `if/else` document-type widget rendering in `src/UI.ts`, support arbitrary spreadsheet-driven `DocumentType` configurations without code changes, and preserve user input state during dynamic re-renders:

1. **Declarative Widget Type Mapping**:
   - `DocumentFieldSpec` in `DocumentTypeConfig` dynamically maps input fields to Google Apps Script `CardService` UI widgets:
     - `string` / `text`: `CardService.newTextInput()`
     - `multiline`: `CardService.newTextInput().setMultiline(true)`
     - `date`: `CardService.newDatePicker()` (with `YYMMDD` text input fallback format for compatibility)
     - `list` / `enum`: `CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN)`
   - **Calculated Fields Exclusion**: Fields where `isCalculated === true` (MAP/LAMBDA formulas or JS functions) are strictly filtered out of the intake form. Displaying calculated fields in the UI is ruled out of scope for this refactor.

2. **5-Tier Field State Resolution & Loss-Less Hydration Precedence**:
   - For any field `field.key`, value resolution follows a strict 5-tier hierarchy:
     1. `formInput[field.key]`: Live user input from active `GoogleAppsScriptEvent`.
     2. `userCacheDraft[field.key]`: Persisted card draft state in `UserCache` for `messageId` (ADR 0023).
     3. `targetedParserResult[field.key]`: High-precision regex metadata from document-specific email parser (ADR 0018).
     4. `aiMetadata[field.key]`: Initial Gemini AI triage predictions (ADR 0018 & ADR 0024).
     5. `field.defaultValue` / `""`: Schema fallback defined in `DocumentFieldSpec` or empty string.
   - **Loss-Less Retention**: When switching `DocumentType` via dropdown, fields absent in the new configuration are hidden from the card but retained in `UserCache` draft state so switching back does not destroy user edits.

3. **Field Validation & AI Confidence Warnings**:
   - **Low AI Confidence (< 0.85)**: Widget titles are prefixed with `⚠️` (e.g. `⚠️ CSI Section #`) and set helper text via `.setHint("Low AI confidence (65%) — please verify")`.
   - **Required Field Validation**: Missing required fields (`field.required === true`) on submit re-render the card with a warning flashMessage and prefix widget titles with `❌` (e.g. `❌ CSI Section #`).
   - **Schema Hints**: Optional `description` strings on `DocumentFieldSpec` supply standard `.setHint(...)` text when no confidence warning is active.

4. **Named Range Picklist Resolution & Serialized Fallbacks**:
   - `optionsRange` in `_Config` subtables references Google Sheets Named Ranges (e.g. `'Submittal FFE Support'!Vendors` or `Shared_Contacts_Arch`).
   - **2D Array Mapping**: Picklist range values map 2-column ranges as `row[0] = value` (abbreviation/key) and `row[1] = label` (display text), or 1-column ranges as `row[0] = value = label`.
   - **Static JSON Fallbacks**: Serialized JSON fallback files (`src/config/defaults/<DocTypeKey>.json`) include `optionsRange` alongside pre-resolved `options: PicklistOption[]` tuples for 100% offline execution without live sheet API calls.

## Consequences

- Form widget rendering in `src/UI.ts` becomes 100% declarative and zero-maintenance for new document types.
- No TypeScript code modifications required when adding, modifying, or removing document fields in spreadsheet `_Config`.
- Card state remains 100% loss-less across cascading dropdown updates and context re-renders.
- Dropdown picklists cleanly support key/abbreviation and display label pairs directly from Google Sheet Named Ranges.
