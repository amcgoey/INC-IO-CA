# 0045: Unified Declarative DocumentTypeSpec Architecture and Three-Tier Adapter Model

## Status
Accepted

## Context
The system requires a unified, declarative representation (`DocumentTypeSpec`) for document types (such as Architectural Submittals, FF&E Submittals, RFIs, and ASIs) that decouples field definitions, calculations, workflows, actions, picklists, identity rules, storage options, and UI bindings from host runtime code.

Following ADR-0013 (Three-Tier Compatibility Architecture) and ADR-0044 (Dedicated Adapter Namespace Architecture), we must establish clear module boundaries, interface seams, compilation pipelines, and error handling mechanisms across Tier 1 (Pure Core), Tier 2 (GAS Infrastructure Adapters), and Tier 3 (Host Tooling & CLI).

## Decision

We establish the unified `DocumentTypeSpec` module architecture and 4-step vertical workflow:

### 1. Architectural Compatibility Tiers & Boundaries
- **Tier 1: Pure Core Logic (Dual GAS V8 + Node.js Compatible)**
  - `src/core/specs/DocumentTypeSpec.ts`: Primary domain interface defining declarative fields, calculations, workflows, actions, picklists, identity rules, and UI presenter bindings.
  - `src/core/specs/DocumentTypeSpecRegistry.ts`: Central runtime registry loading, validating, caching, and serving `DocumentTypeSpec` objects.
  - `src/core/specs/JsonDocumentTypeSpecAdapter.ts`: Pure parser/serializer converting canonical JSON text/objects to `DocumentTypeSpec` instances without disk I/O.
  - `src/core/specs/ValidationEngine.ts`: Spec schema validation engine returning discriminated union results (`SpecValidationResult`).
  - *Tier 1 Rule*: Zero GAS globals (`SpreadsheetApp`, `CardService`, etc.) and zero Node.js built-in imports (`fs`, `path`, etc.).
- **Tier 2: GAS Infrastructure Adapters (GAS V8 Specific)**
  - `src/adapters/gas/GoogleSheetsDocumentTypeSpecAdapter.ts`: Compiles `DocumentTypeSpec` into Google Sheets workbook templates (`_Config`, `_Shared`, named ranges, data validation, Row 2 `=MAP(...)` formulas) and decompiles live `_Config` tabs back to `DocumentTypeSpec`.
  - `src/adapters/gas/CardPresenter.ts`: Generates Workspace Add-on card UI elements dynamically from `DocumentTypeSpec` UI presenter bindings.
  - *Tier 2 Rule*: GAS V8 target runtime (`clasp`). Zero Node.js built-in imports.
- **Tier 3: Host Tooling & CLI (Node.js Only)**
  - `src/specs/*.json`: Canonical source specification files (`workbook_base.json`, `workbook_view.json`, `submittal_arch.json`).
  - `scripts/template/deploy-live.ts`: Node.js CLI script for loading serialized JSON configuration, validating, and compiling the workbook templates (`npm run deploy:live`).
  - *Tier 3 Rule*: Host/CLI environment only. Never imported into `src/` runtime code.

### 2. Interface Seams & Data Flow
```
Canonical JSON (src/specs/*.json)
   │
   ▼ (Tier 3 CLI / I/O)
JsonDocumentTypeSpecAdapter (Tier 1 Pure Core)
   │
   ├──────────────────────────────┐
   ▼                              ▼
DocumentTypeSpecRegistry    GoogleSheetsDocumentTypeSpecAdapter (Tier 2 GAS)
(Tier 1 Core Store)              │
   │                             ▼
   ▼                     Google Sheets Workbook (_Config tab)
Runtime Pipelines & UI
```

### 3. Key Design Choices
- **Unified Core Schema (`DocumentTypeSpec`)**:
  - `key`, `label`, `name`: Clear naming triad (`"SUBMITTAL_ARCH"`, `"Submittal Arch"`, `"Submittal Architecture"`).
  - `identity`: Declarative format strings (`format`, `groupFormat`, `revisionGroupFormat`).
  - `fields`: Field specifications with embedded abstract `picklistSource` contracts.
  - `storage`: Array of polymorphic storage specifications (`DriveStorageSpec`, extensible for future adapters).
  - `workflows`: Trigger-driven workflow specifications (`WorkflowTriggerSpec` matching `context` and `fieldMatches`).
  - `ui`: Presentation hints (`confidenceThreshold`, `sections`).
- **Spreadsheet Adapter Decoupling**: Spreadsheet-specific named range names (`Headers`, `Data`) and MVVM presentation styling (`viewSpec`, column widths, fill colors) are managed exclusively inside `GoogleSheetsDocumentTypeSpecAdapter` rather than stored in core `DocumentTypeSpec`.
- **Calculated Field Compilation (`TemplateFormat`)**: Declarative format strings (`calcFormat: "${section}-${number}-${revision}"`) are stored in `_Config` tabs for clean editing and decompilation, while `GoogleSheetsDocumentTypeSpecAdapter` compiles them to top-level `=MAP(...)` spill formulas on Row 2 (`FormulaRow`).
- **Progressive Adapter Migration**: A pure Tier 1 adapter (`specToConfigAdapter`) projects `DocumentTypeSpec` to legacy `DocumentTypeConfig` objects so existing callers (`WorkflowContextFactory`, `LogEngine`) remain 100% backward compatible without breaking changes.
- **UI CardPresenter Integration**: `CardPresenter` and `buildIntakeCard` preserve static outer layout sections (Top Context Header, Bottom Actions) and dynamically render the "Document Attributes" card section strictly when `documentType` is populated. Picklists are populated dynamically via `PicklistResolver` from `field.picklistSource` without hardcoded field key checks (`if (field.key === 'contact')`). Calculated fields (`isCalculated === true`) are excluded from form input controls without read-only previews. Visual field status uses `CardPresenter.formatFieldTitleAndHint` with strict precedence (`❌ Missing Required` > `⚠️ Low AI Confidence`).
- **Support Data & Picklist Specification Schema (`supportData` & `PicklistSourceSpec`)**: Multi-column picklists and reference tables are defined in a top-level `supportData: Record<string, SupportDataSpec>` map on `DocumentTypeSpec`. Fields reference datasets via `DocumentFieldSpec.picklistSource` (`supportDataKey`, `valueColumnKey`, `displayColumnKey`). Dataset tab placement is governed by `isShared` (`true` = `_Shared` system tab; `false` = `<Type> Support` tab), while named ranges (`Contacts`, `Actions`, `Statuses`, `Vendors`, `SpecTags`) are generated concisely by `GoogleSheetsDocumentTypeSpecAdapter`. Static master JSON specs (`src/specs/*.json`) define schema templates and system default seeds, while individual project Google Sheets workbooks serve as the live source of truth for project-specific runtime items.
- **JSON Serialization & Spec Validation Pipeline (`JsonDocumentTypeSpecAdapter`)**: `JsonDocumentTypeSpecAdapter` is a pure Tier 1 core serializer/deserializer (`src/core/specs/JsonDocumentTypeSpecAdapter.ts`) with zero I/O side effects. Deserialization follows an object-first validation architecture: raw JSON text is parsed into typed in-memory `DocumentTypeSpec` instances and passed through `ValidationEngine.validateSpec(spec)` before registry registration or re-serialization via `stringify()`. Spec validation checks structural integrity, format template variable bindings, picklist dataset linkages, registered action sequences (`workflow.sequence`), and registered validation hooks (`validationHookKey` mapped via `ValidationHookRegistry`). Canonical JSON files (`src/specs/submittal_arch.json`, `src/specs/submittal_ffe.json`) provide 1:1 validated declarative representations that stay synchronized with TypeScript interface definitions, including declarative helper functions (`prefix`, `lookup`) in `calcFormat` for dynamic closed subfolder routing (`"Closed/${division}"` seeded with `CSI_DIVISIONS` and `"Closed/${specCategory}/${specTag}"`).
- **Google Sheets Bidirectional Compilation & Decompilation (`GoogleSheetsDocumentTypeSpecAdapter`)**: `GoogleSheetsDocumentTypeSpecAdapter` (`src/adapters/gas/GoogleSheetsDocumentTypeSpecAdapter.ts`) sits at the Tier 2 boundary, exposing a two-stage deep module interface. Forward compilation (`compileWorkbookSpec(specs, baseSpec)`) projects `DocumentTypeSpec[]` into an intermediate `DocumentLogWorkbookSpec` model—generating centralized `_Config` subtables (`Config_DocTypes`, `Config_<DocTypeKey>_Identity`, `Config_<DocTypeKey>_Storage`, `Config_<DocTypeKey>_Workflows`, `Config_<DocTypeKey>_Fields`) under `SYSTEM_TAB_PROTECTION`, `_Shared` and `<Type> Support` tabs with single full-table Named Ranges (`Contacts_Arch`, `Actions`, `Statuses`, `Vendors`, `SpecTags`), cell Data Validation rules, and Row 2 `=MAP(...)` spill formulas compiled via Tier 1 `TemplateFormatCompiler`. Visual styling and Google Sheets API `batchUpdate` requests are delegated downstream to `WorkbookTemplateViewModel`. Reverse decompilation (`decompile(reader)`) executes a single batch read of workbook tables via `SpreadsheetBatchReaderAdapter`, reconstructs typed `DocumentTypeSpec` instances, and validates each through `ValidationEngine.validateSpec()`, returning discriminated union `SpecValidationResult[]` for error resilience across CLI sync, Admin UI cards, and runtime registries.
- **Discriminated Union Validation**: `ValidationEngine` returns `{ status: 'valid', spec } | { status: 'invalid', errors }` to prevent uncaught runtime crashes and display precise Admin UI error cards when `_Config` edits contain errors.

## Consequences
- `DocumentTypeSpec` is 100% testable in pure Vitest (<1s) without GAS mocks or runtime dependencies.
- Non-technical spreadsheet admins can safely edit picklists, field labels, and template format strings in `_Config` tabs without breaking code.
- Bidirectional synchronization is handled asynchronously: Spreadsheet edits are saved to Canonical JSON via the "Save to JSON Configuration" button in the Admin Foldout, and deployed to new workbooks via `deploy-live.ts`, eliminating configuration drift.
