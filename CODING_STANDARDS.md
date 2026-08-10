# Coding Standards

This repository adheres to documented coding standards and architectural principles to ensure code quality, maintainability, and Google Apps Script (GAS) compatibility.

## 1. Architectural Tiering & Compatibility Rules

All code in this project must belong to one of three compatibility tiers (see [ADR-0013](docs/adr/0013-three-tier-gas-compatibility-architecture.md)):

### Tier 1: Pure Core Logic (Dual Compatible: GAS V8 + Node.js)
- **Target Runtime**: Executes in both Google Apps Script V8 engine and Node.js test environment without polyfills.
- **Allowed Code**: Pure functions, domain types, data transformation pipelines (`DocumentPipeline.ts`), workflow orchestrators (`WorkflowRunner.ts`), and abstract interfaces (`LogRepository`, `DriveFilingRepository`, `AiAnalysisService`).
- **Forbidden**:
  - **NO GAS Globals**: Do NOT reference `SpreadsheetApp`, `DriveApp`, `GmailApp`, `CardService`, `Logger`, `PropertiesService`, `ScriptApp`, or `UrlFetchApp`.
  - **NO Node.js Built-in Imports**: Do NOT import `fs`, `path`, `crypto`, `os`, `http`, `child_process`, `stream`, etc.
  - **NO DOM / Browser APIs**: Do NOT use `document`, `window`, or web-specific APIs.
  - **NO C-Extension or Node-dependent NPM packages**.

### Tier 2: GAS Infrastructure Adapters (GAS V8 Specific)
- **Target Runtime**: Dedicated to Google Apps Script V8 runtime (`clasp`).
- **Allowed Code**: Implementation adapters for Tier 1 interfaces (`GoogleSheetsLogRepository`, `GoogleDriveFilingRepository`, `GeminiAiAnalysisAdapter`), presenter/UI components (`CardPresenter`, `UI.ts`), and script entry points (`Main.ts`).
- **Forbidden**:
  - **NO Node.js Built-in Imports**: Do NOT import Node built-in modules (`fs`, `path`, `crypto`, etc.).
  - **NO Direct GAS Globals outside of Tier 2 Adapters**: Do NOT leak raw GAS calls into Tier 1 modules. Keep GAS objects encapsulated behind Tier 1 interfaces.

### Tier 3: Host Tooling & Test Harnesses (Node.js Only)
- **Target Runtime**: Node.js / CLI (`scripts/`, `test/`).
- **Allowed Code**: Test suites, CLI utilities (`check-models.ts`, `previewCard.ts`), build scripts.
- **Forbidden**:
  - **Do NOT import Tier 3 files inside `src/` (Tier 1 or Tier 2)**.

---

## 2. TypeScript & GAS Constraints

1. **Strict Interface Seams**: Always depend on abstract interfaces (e.g. `LogRepository`), not concrete classes or global GAS singletons.
2. **Clasp & Dual-Environment Compatibility (GAS + Node)**:
   - **Guard `require()` Calls**: Never call `require(...)` directly in `src/`. Always check `typeof require !== 'undefined'` first to avoid `ReferenceError: require is not defined` in Google Apps Script V8 runtime.
   - **Local Declarations Before Exporting**: Do not use inline `export const FOO = ...` or `export var BAR = ...` when symbols are referenced within the file or bound to `globalThis`. CommonJS transpilation emits `exports.FOO = ...` without declaring a local `FOO` in scope. Declare symbols locally (`const FOO = ...`), export at the bottom (`export { FOO };`), and assign to `globalThis` (`(globalThis as any).FOO = FOO;`).
3. **Type Safety**: Maintain strict TypeScript typing (`"strict": true`). Avoid `any` types; prefer discriminated unions and strongly-typed payload interfaces.
4. **Pure Testing**: Write pure unit tests in `test/` for Tier 1 core logic using `Fake` in-memory repository adapters (e.g. `FakeDriveFilingRepository`) instead of mocking GAS globals.

---

## 3. Code Smells & Violations

When reviewing code or adding new files, watch for these specific violations:

- ❌ **Leaked GAS Globals**: A Tier 1 file (e.g. `DocumentPipeline.ts` or `LogEngine.ts`) referencing `DriveApp` or `SpreadsheetApp` directly instead of calling a repository interface.
- ❌ **Node API Leakage**: A file under `src/` importing `node:path`, `fs`, or `crypto`.
- ❌ **Inverted Tier Dependency**: A Tier 1 or Tier 2 file importing a script or test harness file from `scripts/` or `test/`.
- ❌ **Monolithic Handler**: Mixing card UI generation (`CardService`) with core submittal parsing or business rules in a single file.

---

## 4. Automated Code Quality & Linting

1. **ESLint Compliance**: All code must pass `npm run lint` with exit code 0 before committing or merging.
2. **Automated Rule Enforcement**: ESLint (`eslint.config.mjs`) enforces Tier 1 GAS global restrictions (`no-restricted-globals`) and Node.js import rules (`no-restricted-imports`) alongside TypeScript checks.

