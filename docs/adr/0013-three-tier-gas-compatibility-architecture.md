# 0013-three-tier-gas-compatibility-architecture.md

Establish a 3-tier compatibility model (Tier 1 Pure Core, Tier 2 GAS Infrastructure Adapters, Tier 3 Host Tooling) to enforce Google Apps Script (GAS) V8 compatibility across application workflows while keeping core domain logic 100% insulated from GAS API lock-in for future migration.

## Context & Decision

During feature development, agents can accidentally introduce Node.js built-ins (`fs`, `path`, `crypto`), non-GAS npm packages, or leak GAS global APIs (`SpreadsheetApp`, `DriveApp`, `CardService`) into core domain logic. Furthermore, the system may in the future migrate away from Google Apps Script in full or in part (e.g. to a Web / Express / Cloud backend).

We decided to classify all codebase modules into three explicit tiers:
1. **Tier 1 (Pure Core Logic)**: Dual GAS V8 and Node.js compatible. Contains pure domain logic, data models, validation pipelines, and abstract interfaces (`LogRepository`, `DriveFilingRepository`, `AiAnalysisService`). Zero GAS globals and zero Node.js built-ins.
2. **Tier 2 (GAS Infrastructure Adapters)**: Dedicated to the GAS V8 runtime (`GoogleSheetsLogRepository`, `GoogleDriveFilingRepository`, `CardPresenter`, `UI.ts`, `Main.ts`). Implements Tier 1 interfaces using GAS APIs. Zero Node.js built-ins. All GAS global access is strictly isolated behind Tier 1 interfaces.
3. **Tier 3 (Host Tooling & Test Harnesses)**: Node.js CLI environment (`scripts/`, `test/`, dev harness). May use Node.js built-ins and CLI npm packages. Must never be imported by Tier 1 or Tier 2 code.

## Consequences

- Core business logic remains 100% testable in pure Node.js (`npx tsx --test`) without GAS mocks or runtime stubs.
- Migrating off Google Apps Script in the future only requires replacing Tier 2 adapters with Web/Node adapters without modifying Tier 1 core logic.
- Code reviews automatically flag any GAS global leakage into Tier 1 or Node.js API imports in Tier 1/2.
