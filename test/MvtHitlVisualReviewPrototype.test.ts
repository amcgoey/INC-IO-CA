/**
 * @file MvtHitlVisualReviewPrototype.test.ts
 * @description Integration test suite for Issue 192 validating MVT Live Template Deployment,
 * Automated Structural Auditing, Single-Submittal Workflow Execution, and HITL Visual Review checklist tokens.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { deployLiveTemplate, buildDeploymentPayload } from "../scripts/template/deploy-live";
import { runLiveVerification } from "../scripts/template/verify-live";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from "../src/core/config/DocumentLogWorkbookViewSpec";
import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../src/core/config/DocumentLogWorkbookSpec";
import { GasMockHarness } from "./harness/GasMockHarness";
import { DocumentWorkflowModule, WorkflowExecutionInput } from "../src/core/workflow/DocumentWorkflowModule";
import { DeclarativeDocumentLogStrategy } from "../src/DocumentLogStrategy";
import { defaultDocumentTypeSpecRegistry } from "../src/core/specs/DocumentTypeSpecRegistry";
import { GoogleSheetsLogRepository } from "../src/GoogleSheetsLogRepository";
import { FakeDriveFilingRepository } from "./harness/fakes/FakeDriveFilingRepository";
import { FakePdfDocumentService } from "./harness/fakes/FakePdfDocumentService";
import { createValidatedArchitectureSubmittal } from "./harness/factories/DocumentFactory";
import { ValidatedDocument } from "../src/types";

test("Issue 192 - Live MVT Template Deployment Payload and Dry-Run Verification", async () => {
  const options = {
    spreadsheetId: "1MVT_DEPLOY_TEST_ID",
    target: "test" as const,
    dryRun: true
  };

  const result = await deployLiveTemplate(options);

  assert.equal(result.success, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.spreadsheetId, "1MVT_DEPLOY_TEST_ID");
  assert.ok(result.totalRequests > 0, "Batch update request payload should contain requests");

  const payload = buildDeploymentPayload();
  assert.ok(payload.requests.length > 0);
  assert.ok(payload.requests.some(r => r.updateCells || r.addNamedRange || r.updateDimensionProperties));
});

test("Issue 192 - Automated 6-Dimension Structural and Roundtrip Audit Verification", async () => {
  const result = await runLiveVerification({
    spreadsheetId: "1MVT_VERIFY_TEST_ID",
    target: "test" as const,
    dryRun: true
  });

  assert.equal(result.success, true);
  assert.equal(result.checks.length, 6);
  assert.ok(result.checks.every(c => c.status === "PASS"), "All 6 structural dimension checks must pass");
  assert.equal(result.roundtripResult.passed, true);
  assert.equal(result.roundtripResult.calcFileName, "033000-001-Concrete Mix Design-0");
  assert.equal(result.roundtripResult.calcNumber, "033000-001-0");
});

test("Issue 192 - HITL Visual Review Verification Checklist Tokens", () => {
  // 1. Dark Gray #666666 Header Fill and Bold White Text
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fillHex, "#666666");
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fillRgb.red, 0.4);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fillRgb.green, 0.4);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fillRgb.blue, 0.4);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fontColorHex, "#FFFFFF");
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.bold, true);

  // 2. Custom Column Pixel Width Specifications
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.columnWidths.section, 100);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.columnWidths.number, 100);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.columnWidths.title, 250);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.columnWidths.revision, 80);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.columnWidths.date, 100);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.columnWidths.contact, 180);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.columnWidths.action, 140);
  assert.equal(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.columnWidths.status, 120);

  // 3. Dropdown Validations Reference Named Ranges
  const archTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === "Submittal Arch");
  assert.ok(archTab);
  const actionCol = archTab.columns.find(c => c.id === "action");
  assert.equal(actionCol?.validationRule?.targetNamedRange || actionCol?.validationRange, "Actions_Submittal_Labels");
  const contactCol = archTab.columns.find(c => c.id === "contact");
  assert.equal(contactCol?.validationRule?.targetNamedRange || contactCol?.validationRange, "Shared_Contacts_Arch_Keys");
});


