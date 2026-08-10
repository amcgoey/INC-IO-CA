/**
 * @file TemplateDriftAuditor.test.ts
 * @description Unit and End-to-End drift audit tests for Issue #244:
 * Template Drift Auditor 7th & 8th Dimensions (PROTECTION_DRIFT & VALIDATION_DRIFT) & Auto-Patching.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { GasMockHarness } from "./harness/GasMockHarness";
import { TemplateDriftAuditor } from "../src/core/admin/TemplateDriftAuditor";
import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../src/core/config/DocumentLogWorkbookSpec";
import { SheetValidationAndProtectionAdapter } from "../src/adapters/gas/SheetValidationAndProtectionAdapter";
import { FakeSpreadsheetLockAdapter } from "../src/adapters/fakes/FakeSpreadsheetLockAdapter";

describe("TemplateDriftAuditor 7th & 8th Dimensions & Auto-Patching (Issue #244)", () => {
  let harness: ReturnType<typeof GasMockHarness.install>;

  beforeEach(() => {
    harness = GasMockHarness.install();
  });

  afterEach(() => {
    GasMockHarness.uninstall();
  });

  it("verifies clean baseline audit against fully provisioned workbook returning MATCH status", () => {
    const ss = harness.sheetsService.openById("wb-244-clean");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    // Apply validations and protections via adapter
    const adapter = new SheetValidationAndProtectionAdapter();
    adapter.applyValidationRules(ss as any, DOCUMENT_LOG_WORKBOOK_SPEC);
    adapter.applyRangeProtections(ss as any, DOCUMENT_LOG_WORKBOOK_SPEC);

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });

    assert.strictEqual(report.status, "MATCH");
    assert.strictEqual(report.canAutoPatch, true);
    assert.strictEqual(report.issues.length, 0);
  });

  it("7th Dimension (PROTECTION_DRIFT): detects missing system tab, header stack, and calculated column protections", () => {
    const ss = harness.sheetsService.openById("wb-244-prot-drift");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    // Apply only validation rules, omitting protections
    const adapter = new SheetValidationAndProtectionAdapter();
    adapter.applyValidationRules(ss as any, DOCUMENT_LOG_WORKBOOK_SPEC);

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });

    assert.strictEqual(report.status, "MINOR_DRIFT");
    assert.strictEqual(report.canAutoPatch, true);

    const protIssues = report.issues.filter(i => i.category === "PROTECTION_DRIFT");
    assert.ok(protIssues.length > 0, "Must report PROTECTION_DRIFT issues");
    for (const issue of protIssues) {
      assert.strictEqual(issue.severity, "WARNING", "Protection drift issues must be WARNING severity");
    }

    // Must flag _Config tab protection missing
    assert.ok(protIssues.some(i => i.description.includes("_Config")));
    // Must flag header protection missing on Submittal Arch
    assert.ok(protIssues.some(i => i.description.includes("LOCK_HEADERS_Submittal Arch")));
    // Must flag calculated column protection missing
    assert.ok(protIssues.some(i => i.description.includes("calcFileName")));
  });

  it("8th Dimension (VALIDATION_DRIFT): detects missing picklist cell validation rules and missing target Named Ranges", () => {
    const ss = harness.sheetsService.openById("wb-244-val-drift");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    // Apply protections, omitting validations
    const adapter = new SheetValidationAndProtectionAdapter();
    adapter.applyRangeProtections(ss as any, DOCUMENT_LOG_WORKBOOK_SPEC);

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });

    assert.strictEqual(report.status, "MINOR_DRIFT");
    assert.strictEqual(report.canAutoPatch, true);

    const valIssues = report.issues.filter(i => i.category === "VALIDATION_DRIFT");
    assert.ok(valIssues.length > 0, "Must report VALIDATION_DRIFT issues");
    for (const issue of valIssues) {
      assert.strictEqual(issue.severity, "WARNING", "Validation drift issues must be WARNING severity");
    }

    // Must flag missing validation for picklist column (e.g. status or contact)
    assert.ok(valIssues.some(i => i.description.includes("status") || i.description.includes("contact")));
  });

  it("Auto-Patching Routine: restores missing protections and cell validations under GasSpreadsheetLockAdapter lock", () => {
    const ss = harness.sheetsService.openById("wb-244-autopatch");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);
    // Unpatched state: zero validations, zero protections

    const lockAdapter = new FakeSpreadsheetLockAdapter();
    const result = TemplateDriftAuditor.autoPatchWorkbook(ss, { lockAdapter });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, "PATCHED");
    assert.ok(result.repairsApplied.length > 0);

    // Verify repairsApplied mentions protections and validations
    const repairsText = result.repairsApplied.join(" | ");
    assert.ok(repairsText.includes("validation") || repairsText.includes("Validation"));
    assert.ok(repairsText.includes("protection") || repairsText.includes("Protection"));

    // Post-repair audit must pass green (MATCH)
    assert.strictEqual(result.auditReport?.status, "MATCH");
    assert.strictEqual(result.auditReport?.issues.length, 0);
  });

  it("End-to-End drift audit test against document-log-workbook-template.json fixture", () => {
    const fixturePath = path.join(__dirname, "fixtures/document-log-workbook-template.json");
    assert.ok(fs.existsSync(fixturePath), "document-log-workbook-template.json fixture must exist");

    const templateData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    assert.ok(templateData.schemaVersion, "Template JSON must have schemaVersion");
    assert.ok(Array.isArray(templateData.tabs), "Template JSON must have tabs array");

    // Load template JSON into GasMockHarness spreadsheet
    const ss = harness.sheetsService.openById("wb-244-fixture-e2e");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC as any);

    const adapter = new SheetValidationAndProtectionAdapter();
    adapter.applyValidationRules(ss as any, DOCUMENT_LOG_WORKBOOK_SPEC);
    adapter.applyRangeProtections(ss as any, DOCUMENT_LOG_WORKBOOK_SPEC);

    const report = TemplateDriftAuditor.auditWorkbook(ss, { bypassCache: true });

    assert.strictEqual(report.status, "MATCH", "Template workbook fixture audit must report MATCH");
    assert.strictEqual(report.canAutoPatch, true);
    assert.strictEqual(report.issues.length, 0);
  });
});
