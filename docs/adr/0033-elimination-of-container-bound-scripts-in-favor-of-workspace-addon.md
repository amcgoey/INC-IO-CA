# 0033-elimination-of-container-bound-scripts-in-favor-of-workspace-addon.md

Eliminate container-bound Apps Script projects and custom spreadsheet menus (`onOpen`/`onEdit`) in favor of centralized Google Workspace Add-on execution (`AppContext.GoogleSheets`).

## Context & Decision

Standalone Google Sheets workbooks (`DocumentLogWorkbook`) can technically host container-bound Apps Script projects that render custom spreadsheet menus (`⚡ Document Log Admin`) via `onOpen` simple triggers. However, container-bound scripts present major long-term architectural maintenance challenges:

1. **Script Fragmentation & Version Drift**: Every time a `DocumentLogWorkbook` template is duplicated or copied for a new project, its container-bound Apps Script project is copied along with it. When bug fixes or feature updates are released, existing container-bound scripts in already-deployed workbooks become stale and disconnected from central application updates.
2. **Duplicated UI & Trigger Overhead**: Maintaining separate container-bound menu handlers (`Ui.alert()`, `showModalDialog`) alongside the central Workspace Add-on (`SheetsRootCard` / `SheetAdminFoldOut`) leads to duplicated UI logic and inconsistent authorization/execution behaviors under simple triggers (`onOpen`/`onEdit`).

To resolve these issues and establish a single canonical execution layer:

1. **Explicit Prohibition of Container-Bound Scripts**:
   - `DocumentLogWorkbook` templates MUST remain pure spreadsheet artifacts containing only tabs (`_Config`, `_Shared`, log tabs), named ranges, formulas, and soft range protections (`ProtectionType.WARNING`).
   - Container-bound Apps Script code and custom `onOpen`/`onEdit` spreadsheet menus are explicitly prohibited.

2. **Centralized Add-on Enforcement**:
   - All spreadsheet administrative operations, cache invalidation (`PrefixCacheManager`), live schema drift auditing (`TemplateDriftAuditor`), and document intake workflows MUST be accessed exclusively through the Google Workspace Add-on (`AppContext.GoogleSheets` via `SheetsRootCard` and `SheetAdminFoldOut`).

3. **User Onboarding & Guidance**:
   - Spreadsheet `_Config` visual notices and user documentation direct administrators and team members to open the Workspace Add-on sidebar from the Google Sheets side panel for all tools and diagnostic controls.

## Consequences

- Zero script fragmentation across cloned workbooks; all logic is centrally versioned and updated within the Google Workspace Add-on deployment.
- `DocumentLogWorkbook` templates remain lightweight, clean, code-free spreadsheet schema structures.
- Users are trained to use the standardized Workspace Add-on sidebar (`SheetsRootCard` / `SheetAdminFoldOut`), eliminating UI fragmentation and redundant modal implementations.
