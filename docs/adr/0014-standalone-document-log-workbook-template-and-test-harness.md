# 0014-standalone-document-log-workbook-template-and-test-harness.md

Establish a declarative TypeScript specification (`DocumentLogWorkbookSpec.ts`), JSON snapshot test fixture generator, and automated Google Sheets API provisioner for live Test and Production Document Log Workbooks.

## Context & Decision

To support multiple `DocumentTypes` within a single project Google Sheet, the system requires a standardized workbook layout (including `_Config`, `_Shared`, discipline log tabs like `Submittal Arch` / `Submittal FFE`, support tabs, and Named Ranges).

Relying on manual spreadsheet edits or uploaded Excel (`.xlsx`) files introduces versioning drift, untracked changes, and credential leakage risks.

We decided to establish:
1. **Declarative Source of Truth (`scripts/template/DocumentLogWorkbookSpec.ts`)**: A Tier 3 TypeScript specification in Git defining all tabs, headers, Named Ranges, and initial 2-tier config seed rows (`Config_Manifest` and `Config_<DocTypeKey>`). Sensitivity audits are maintained to prevent PII/credentials in Git.
2. **Local Test Fixtures (`test/fixtures/document-log-workbook-template.json`)**: `npm run template:generate` generates a pure JSON snapshot consumed synchronously by `GasMockHarness` in Node unit tests for fast, offline testing.
3. **Live Template Provisioning (`npm run template:deploy-live`)**: A Tier 3 script using the Google Sheets API to programmatically build and update dedicated **Test Document Log Workbook Template** and **Production Document Log Workbook Template** live Google Sheets in Google Drive.
4. **Configuration Storage (`config/template-ids.json`)**: Live Google Sheet IDs for Test and Production templates are stored in gitignored `config/template-ids.json` (with `config/template-ids.json.example` in Git).

## Consequences

- The workbook structure is 100% versioned in Git and auditable via pull requests.
- Unit and integration tests run offline at full speed using `document-log-workbook-template.json`.
- Developers and CI runners can deploy updated live templates to Google Drive with a single command without manual file uploads.
