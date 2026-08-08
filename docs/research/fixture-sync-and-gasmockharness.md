# Research: Automated Test Fixture Synchronization & GasMockHarness Layout Capabilities

**Issue**: #127  
**Status**: Completed  
**Author**: Research Subagent  
**Date**: August 2026  

---

## Executive Summary

To support multi-discipline Document Log Workbooks (`_Config`, `_Shared`, `Submittal Arch`, `Submittal FFE`, support tabs) while maintaining fast offline unit testing and strict drift prevention in CI/CD, this research establishes the design for:
1. **Automated Test Fixture Synchronization in CI**: Declarative TypeScript workbook specification (`DocumentLogWorkbookSpec.ts`), deterministic JSON snapshot generation (`npm run template:generate`), SHA-256 & deep structural CI validation gates (`npm run template:verify-fixture`), and schema version integrity checks (`DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION`).
2. **GasMockHarness Layout & Spreadsheet Capabilities**: Extending `test/harness/GasMockHarness.ts` (`MockSpreadsheet`, `MockSheet`, `MockRange`, `MockSheetsService`, `MockSheetsState`) with full Named Range registries, automated multi-tab layout seeding directly from `document-log-workbook-template.json`, 3-row layout offset behavior (`Row 1: Header`, `Row 2: FormulaRow`, `Row 3: BufferRow`, `Row 4+: Data`), and Data Validation / Protection API stubs.

---

## 1. Automated Test Fixture Synchronization in CI

### 1.1 Source of Truth (`DocumentLogWorkbookSpec.ts`)

Following Tier 3 Host Tooling conventions (ADR 0013, ADR 0014, ADR 0019), `scripts/template/DocumentLogWorkbookSpec.ts` serves as the single Git-versioned declarative specification for workbook structure.

```typescript
/**
 * scripts/template/DocumentLogWorkbookSpec.ts
 * Tier 3 Host Specification
 */

export const DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION = "1.0.0";

export interface ColumnSpec {
  id: string;
  header: string;
  width?: number;
  formula?: string;
  validationRange?: string;
}

export interface TabSpec {
  name: string;
  rowCount: number;
  columnCount: number;
  isConfigTab?: boolean;
  isSharedTab?: boolean;
  isLogTab?: boolean;
  isSupportTab?: boolean;
  columns?: ColumnSpec[];
  seedRows?: any[][];
}

export interface NamedRangeSpec {
  name: string;
  tabName: string;
  rangeNotation: string;
}

export interface DocumentLogWorkbookSpec {
  schemaVersion: string;
  tabs: TabSpec[];
  namedRanges: NamedRangeSpec[];
}

export const DOCUMENT_LOG_WORKBOOK_SPEC: DocumentLogWorkbookSpec = {
  schemaVersion: DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
  tabs: [
    {
      name: "_Config",
      rowCount: 100,
      columnCount: 20,
      isConfigTab: true,
      seedRows: [
        ["Key", "Value"],
        ["MANIFEST_SCHEMA_VERSION", DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION],
        ["LOG_TITLE", "INC Project Document Log"],
        ["", ""],
        ["DocTypeKey", "DisplayName", "Prefix", "LogTabName"],
        ["Submittal_Arch", "Architectural Submittals", "SUB-ARCH", "Submittal Arch"],
        ["Submittal_FFE", "FFE Submittals", "SUB-FFE", "Submittal FFE"]
      ]
    },
    {
      name: "_Shared",
      rowCount: 100,
      columnCount: 20,
      isSharedTab: true,
      seedRows: [
        ["Contacts_Arch", "Contacts_FFE"],
        ["arch-reviewer@example.com", "ffe-reviewer@example.com"],
        ["arch-lead@example.com", "ffe-lead@example.com"]
      ]
    },
    {
      name: "Submittal Arch",
      rowCount: 1000,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "calcRow", header: "Row #", formula: '=MAP(A4:A, LAMBDA(x, IF(ISBLANK(x), "", ROW(x)-3)))' },
        { id: "docNumber", header: "Document Number" },
        { id: "title", header: "Title" },
        { id: "status", header: "Status", validationRange: "_Config!G2:G10" },
        { id: "contact", header: "Reviewer", validationRange: "_Shared!A2:A20" }
      ]
    },
    {
      name: "Submittal FFE",
      rowCount: 1000,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "calcRow", header: "Row #", formula: '=MAP(A4:A, LAMBDA(x, IF(ISBLANK(x), "", ROW(x)-3)))' },
        { id: "docNumber", header: "Document Number" },
        { id: "title", header: "Title" },
        { id: "status", header: "Status", validationRange: "_Config!G2:G10" },
        { id: "contact", header: "Reviewer", validationRange: "_Shared!B2:B20" }
      ]
    }
  ],
  namedRanges: [
    { name: "MANIFEST_SCHEMA_VERSION", tabName: "_Config", rangeNotation: "B2" },
    { name: "Config_Manifest", tabName: "_Config", rangeNotation: "A1:B3" },
    { name: "Config_Submittal_Arch", tabName: "_Config", rangeNotation: "A5:D6" },
    { name: "Shared_Contacts_Arch", tabName: "_Shared", rangeNotation: "A2:A20" },
    { name: "Shared_Contacts_FFE", tabName: "_Shared", rangeNotation: "B2:B20" },
    { name: "Submittal_Arch_Headers", tabName: "Submittal Arch", rangeNotation: "A1:E1" },
    { name: "Submittal_Arch_FormulaRow", tabName: "Submittal Arch", rangeNotation: "A2:E2" },
    { name: "Submittal_FFE_Headers", tabName: "Submittal FFE", rangeNotation: "A1:E1" },
    { name: "Submittal_FFE_FormulaRow", tabName: "Submittal FFE", rangeNotation: "A2:E2" }
  ]
};
```

---

### 1.2 Deterministic JSON Generator (`npm run template:generate`)

To guarantee fast, offline testing in Node.js without network calls to Google APIs, `npm run template:generate` builds `test/fixtures/document-log-workbook-template.json`.

#### Deterministic Serialization Requirements
1. **Key Sorting**: Object keys must be deterministically ordered during stringification.
2. **Normalized Line Endings**: Output string MUST end with standard LF (`\n`) and use 2-space indentation.
3. **No Execution Metadata**: Exclude dynamic fields (such as `generatedAt: Date.now()`) to ensure binary equivalence across developer machines and OS environments.

```typescript
/**
 * scripts/template/generate-template-fixture.ts
 * Tier 3 CLI script
 */
import * as fs from "fs";
import * as path from "path";
import { DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION } from "./DocumentLogWorkbookSpec";

export function generateCanonicalFixtureJson(spec: typeof DOCUMENT_LOG_WORKBOOK_SPEC): string {
  const fixturePayload = {
    schemaVersion: spec.schemaVersion,
    tabs: spec.tabs.map(tab => ({
      name: tab.name,
      rowCount: tab.rowCount,
      columnCount: tab.columnCount,
      isConfigTab: !!tab.isConfigTab,
      isSharedTab: !!tab.isSharedTab,
      isLogTab: !!tab.isLogTab,
      headers: tab.columns ? tab.columns.map(c => c.header) : [],
      formulaRow: tab.columns ? tab.columns.map(c => c.formula || "") : [],
      seedRows: tab.seedRows || []
    })),
    namedRanges: spec.namedRanges
  };

  return JSON.stringify(fixturePayload, null, 2) + "\n";
}

function run(): void {
  const fixturePath = path.resolve(__dirname, "../../test/fixtures/document-log-workbook-template.json");
  const jsonContent = generateCanonicalFixtureJson(DOCUMENT_LOG_WORKBOOK_SPEC);
  
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, jsonContent, "utf8");
  console.log(`[OK] Generated fixture snapshot: ${fixturePath} (Schema v${DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION})`);
}

if (require.main === module) {
  run();
}
```

---

### 1.3 CI Validation Gate (`npm run template:verify-fixture`)

In CI pipelines (e.g. GitHub Actions), developers might modify `DocumentLogWorkbookSpec.ts` without committing an updated `document-log-workbook-template.json`. `npm run template:verify-fixture` prevents schema drift from entering `main`.

#### Dual Validation Mechanism
1. **SHA-256 Hash Integrity Check**: Compares SHA-256 hash of the committed JSON file on disk vs in-memory canonical output from `DocumentLogWorkbookSpec.ts`.
2. **Deep Structural Equality Fallback**: If hashes differ, performs `assert.deepStrictEqual` to output precise diff details in stdout.

```typescript
/**
 * scripts/template/verify-template-fixture.ts
 * Tier 3 CI Script
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as assert from "assert";
import { DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION } from "./DocumentLogWorkbookSpec";
import { generateCanonicalFixtureJson } from "./generate-template-fixture";

function computeSha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function verifyFixtureSync(): void {
  const fixturePath = path.resolve(__dirname, "../../test/fixtures/document-log-workbook-template.json");
  
  if (!fs.existsSync(fixturePath)) {
    console.error(`[ERROR] Test fixture missing at ${fixturePath}`);
    console.error(`--> Run 'npm run template:generate' to generate the initial fixture.`);
    process.exit(1);
  }

  const existingFileContent = fs.readFileSync(fixturePath, "utf8");
  const freshCanonicalJson = generateCanonicalFixtureJson(DOCUMENT_LOG_WORKBOOK_SPEC);

  const existingHash = computeSha256(existingFileContent);
  const freshHash = computeSha256(freshCanonicalJson);

  if (existingHash !== freshHash) {
    console.error(`[FAIL] Test fixture 'document-log-workbook-template.json' is OUT OF SYNC with 'DocumentLogWorkbookSpec.ts'!`);
    console.error(`       Existing SHA-256: ${existingHash}`);
    console.error(`       Expected SHA-256: ${freshHash}`);

    try {
      const existingObj = JSON.parse(existingFileContent);
      const freshObj = JSON.parse(freshCanonicalJson);
      assert.deepStrictEqual(existingObj, freshObj);
    } catch (diffErr: any) {
      console.error(`\nStructural Difference Details:\n`, diffErr.message);
    }

    console.error(`\n--> FIX: Run 'npm run template:generate' and commit the updated fixture.`);
    process.exit(1);
  }

  // Schema version check
  const fixtureObj = JSON.parse(existingFileContent);
  if (fixtureObj.schemaVersion !== DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION) {
    console.error(`[FAIL] Schema version mismatch! TypeScript: '${DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION}', Fixture: '${fixtureObj.schemaVersion}'`);
    process.exit(1);
  }

  console.log(`[PASS] Fixture synchronization verified. SHA-256 match (${existingHash.slice(0, 8)}...), Schema v${DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION}`);
}

if (require.main === module) {
  verifyFixtureSync();
}
```

---

### 1.4 Schema Version Alignment & `package.json` Integration

`package.json` scripts configuration:

```json
{
  "scripts": {
    "template:generate": "npx tsx scripts/template/generate-template-fixture.ts",
    "template:verify-fixture": "npx tsx scripts/template/verify-template-fixture.ts",
    "test": "npm run template:verify-fixture && npx tsx --test test/**/*.ts"
  }
}
```

---

## 2. GasMockHarness Layout & Spreadsheet Capabilities

### 2.1 Current `GasMockHarness.ts` Audit

An audit of `test/harness/GasMockHarness.ts` reveals the following gaps:

| Component | Existing Capabilities | Missing Capabilities Required for Multi-Tab Spec |
| :--- | :--- | :--- |
| `MockSheetsService` | `openById`, `create`, `getActiveSpreadsheet` | `newDataValidation()` builder factory missing. |
| `MockSpreadsheet` | `getSheetByName`, `getSheets`, `insertSheet` | `getNamedRanges()`, `getRangeByName(name)`, `setNamedRange(name, range)` missing. |
| `MockSheet` | `getRange`, `getGridSlice`, `insertRowBefore/After` | `setNamedRange`, `getDataValidation`, `setDataValidation`, `protect`, `getProtections`, and 3-row layout offset protection missing. |
| `GasMockHarness.install()` | Stubs `SpreadsheetApp` with blank `Sheet1` | Does not load `test/fixtures/document-log-workbook-template.json` to auto-populate tabs and Named Ranges. |

---

### 2.2 Named Range Support Architecture

`MockSpreadsheet` and `MockSheet` require dynamic Named Range tracking.

```typescript
export class MockNamedRange {
  constructor(private name: string, private range: MockRange) {}

  public getName(): string {
    return this.name;
  }

  public getRange(): MockRange {
    return this.range;
  }

  public setName(name: string): this {
    this.name = name;
    return this;
  }

  public setRange(range: MockRange): this {
    this.range = range;
    return this;
  }
}

// In MockSpreadsheet:
export class MockSpreadsheet {
  private namedRanges: Map<string, MockNamedRange> = new Map();

  public getNamedRanges(): MockNamedRange[] {
    this.recordCall("getNamedRanges", []);
    return Array.from(this.namedRanges.values());
  }

  public getRangeByName(name: string): MockRange | null {
    this.recordCall("getRangeByName", [name]);
    const nr = this.namedRanges.get(name);
    return nr ? nr.getRange() : null;
  }

  public setNamedRange(name: string, range: MockRange): MockNamedRange {
    this.recordCall("setNamedRange", [name, range]);
    const namedRange = new MockNamedRange(name, range);
    this.namedRanges.set(name, namedRange);
    return namedRange;
  }

  public removeNamedRange(name: string): void {
    this.recordCall("removeNamedRange", [name]);
    this.namedRanges.delete(name);
  }
}
```

---

### 2.3 Multi-Tab Layout Initialization from Fixture

When `GasMockHarness.install({ loadTemplateFixture: true })` runs, it auto-populates `MockSpreadsheet` from `document-log-workbook-template.json`.

```typescript
// In GasMockHarness.ts:
public loadDefaultTemplateFixture(fixturePath?: string): void {
  const defaultPath = fixturePath || path.resolve(__dirname, "../fixtures/document-log-workbook-template.json");
  if (!fs.existsSync(defaultPath)) return;

  const fixture = JSON.parse(fs.readFileSync(defaultPath, "utf8"));
  const ss = this.sheetsService.getActiveSpreadsheet();

  // Populate tabs
  for (const tabDef of fixture.tabs) {
    let sheet = ss.getSheetByName(tabDef.name);
    if (!sheet) {
      sheet = ss.insertSheet(tabDef.name);
    }
    
    // Header (Row 1)
    if (tabDef.headers && tabDef.headers.length > 0) {
      sheet.getRange(1, 1, 1, tabDef.headers.length).setValues([tabDef.headers]);
    }
    // FormulaRow (Row 2)
    if (tabDef.formulaRow && tabDef.formulaRow.length > 0) {
      sheet.getRange(2, 1, 1, tabDef.formulaRow.length).setValues([tabDef.formulaRow]);
    }
    // Seed Rows (Config / Shared)
    if (tabDef.seedRows && tabDef.seedRows.length > 0) {
      sheet.getRange(1, 1, tabDef.seedRows.length, tabDef.seedRows[0].length).setValues(tabDef.seedRows);
    }
  }

  // Populate Named Ranges
  for (const nrDef of fixture.namedRanges) {
    const sheet = ss.getSheetByName(nrDef.tabName);
    if (sheet) {
      const range = sheet.getRange(nrDef.rangeNotation);
      ss.setNamedRange(nrDef.name, range);
    }
  }
}
```

---

### 2.4 Formula & Buffer Row Offset Behavior (3-Row Layout Rule)

Per ADR 0015, log tabs adhere to a 3-row header/formula block:
- **Row 1**: Headers (`<TabName>_Headers`)
- **Row 2**: `FormulaRow` (`<TabName>_FormulaRow`)
- **Row 3**: `BufferRow` (empty spacer row)
- **Row 4+**: Data Section (`FIRST_DATA_ROW_OFFSET = 3`)

#### Dynamic Row Insertion Protection in `MockSheet`
When `insertRowBefore(rowIndex)` or `insertRowAfter(rowIndex)` is invoked, `MockSheet` must enforce data-area isolation so formula rows (Row 2) and header rows (Row 1) are never shifted or corrupted.

```typescript
// In MockSheet:
public insertRowBefore(rowIndex: number): void {
  this.recordCall("insertRowBefore", [rowIndex]);
  // Enforce 3-row layout offset guard for log sheets
  if (this.name.startsWith("Submittal") || this.name.startsWith("RFI")) {
    if (rowIndex < 4) {
      throw new Error(`[MockSheet Error] Attempted to insert row at index ${rowIndex}. Cannot insert rows inside Header/Formula/Buffer block (Rows 1-3) on sheet '${this.name}'!`);
    }
  }
  this.insertBlankRowAt(rowIndex - 1);
}
```

---

### 2.5 Data Validation & Protection API Mocks

To prevent `TypeError: undefined is not a function` when calling Google Apps Script validation and protection methods:

```typescript
export class MockDataValidation {
  constructor(
    private criteriaType: any,
    private args: any[],
    private allowInvalid: boolean = true,
    private helpText: string = ""
  ) {}

  public getCriteriaType(): any { return this.criteriaType; }
  public getCriteriaValues(): any[] { return this.args; }
  public getAllowInvalid(): boolean { return this.allowInvalid; }
  public getHelpText(): string { return this.helpText; }
}

export class MockDataValidationBuilder {
  private criteriaType: any = null;
  private args: any[] = [];
  private allowInvalid: boolean = true;
  private helpText: string = "";

  public requireValueInList(values: string[]): this {
    this.criteriaType = "VALUE_IN_LIST";
    this.args = [values];
    return this;
  }

  public requireValueInRange(range: MockRange): this {
    this.criteriaType = "VALUE_IN_RANGE";
    this.args = [range];
    return this;
  }

  public setAllowInvalid(allow: boolean): this {
    this.allowInvalid = allow;
    return this;
  }

  public build(): MockDataValidation {
    return new MockDataValidation(this.criteriaType, this.args, this.allowInvalid, this.helpText);
  }
}

export class MockProtection {
  constructor(
    private description: string,
    private range: MockRange | null,
    private sheet: MockSheet | null
  ) {}

  public getDescription(): string { return this.description; }
  public remove(): void {}
  public setWarningOnly(warningOnly: boolean): this { return this; }
}

// Stubs in MockRange & MockSheet:
export class MockRange {
  private dataValidation: MockDataValidation | null = null;

  public setDataValidation(rule: MockDataValidation | null): this {
    this.dataValidation = rule;
    return this;
  }

  public getDataValidation(): MockDataValidation | null {
    return this.dataValidation;
  }

  public protect(): MockProtection {
    return new MockProtection("Mock Range Protection", this, null);
  }
}
```

---

## 3. Implementation Recommendations & Action Plan

1. **Step 1 — Create Tier 3 Template Specification**:
   - Add `scripts/template/DocumentLogWorkbookSpec.ts`.
   - Export `DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION = "1.0.0"`.

2. **Step 2 — Implement Fixture Generator & Verifier**:
   - Create `scripts/template/generate-template-fixture.ts` and `scripts/template/verify-template-fixture.ts`.
   - Register `template:generate` and `template:verify-fixture` in `package.json`.
   - Update `npm test` script to run `template:verify-fixture` as a prerequisite.

3. **Step 3 — Extend `GasMockHarness.ts` Capabilities**:
   - Add `MockNamedRange`, `MockDataValidation`, `MockDataValidationBuilder`, and `MockProtection`.
   - Integrate fixture loading (`loadDefaultTemplateFixture`) into `GasMockHarness.install()`.
   - Enforce 3-row layout offset protections in `MockSheet.insertRowBefore/After`.

4. **Step 4 — Add Harness Unit Tests**:
   - Verify fixture sync script passes in Node test runner.
   - Verify `GasMockHarness` correctly resolves `Spreadsheet.getRangeByName('MANIFEST_SCHEMA_VERSION')`.

---

## 4. Primary Source Citations & References

- **ADR 0013**: Three-Tier GAS Compatibility Architecture (`docs/adr/0013-three-tier-gas-compatibility-architecture.md`)
- **ADR 0014**: Standalone Document Log Workbook Template and Test Harness (`docs/adr/0014-standalone-document-log-workbook-template-and-test-harness.md`)
- **ADR 0015**: Workbook Layout and Named Range Architecture (`docs/adr/0015-document-log-workbook-layout-and-named-range-architecture.md`)
- **ADR 0019**: Template Schema Versioning and Drift Detection (`docs/adr/0019-template-schema-versioning-and-drift-detection.md`)
- **Google Apps Script SpreadsheetApp Reference**: `Spreadsheet.getNamedRanges()`, `Sheet.setNamedRange()`, `DataValidationBuilder`
