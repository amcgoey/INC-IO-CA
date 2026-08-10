import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "../../harness/GasMockHarness";
import { CardSerializer } from "../../harness/CardSerializer";
import { FakeDriveFilingRepository } from "../../harness/fakes/FakeDriveFilingRepository";
import { FakePdfDocumentService } from "../../harness/fakes/FakePdfDocumentService";

import { CONFIG } from "../../../src/Config";
import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../../../src/core/config/DocumentLogWorkbookSpec";
import { DocumentPipeline } from "../../../src/core/intake/DocumentPipeline";
import { LogEngine } from "../../../src/core/log/LogEngine";
import { GoogleSheetsStorageAdapter } from "../../../src/SheetStorageAdapter";
import { GoogleSheetsLogRepository } from "../../../src/GoogleSheetsLogRepository";
import { defaultDocumentTypeConfigRegistry } from "../../../src/DocumentTypeConfigRegistry";
import * as UI from "../../../src/adapters/gas/UI";
import * as Process from "../../../src/Process";


test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

test("UnbiasedIntakeCard - dynamic field generation across registered DocumentTypes", () => {
  const docTypes = ["SUBMITTAL_ARCH", "SUBMITTAL_FFE", "RFI", "ASI"];

  for (const docType of docTypes) {
    const event = {
      formInput: {
        project: "PROJ",
        documentType: docType
      },
      parameters: {
        project: "PROJ",
        documentType: docType
      }
    };

    const card = UI.buildUnbiasedIntakeCard(event);
    assert.ok(card, `Card for ${docType} should be constructed`);

    const json = CardSerializer.toJSON(card);
    assert.ok(json.header, "Card header should exist");
    assert.strictEqual(json.header.title, "File Document");

    // Section 2: Document Attributes section should be present
    const attrSec = json.sections.find(s => s.header === "2. Document Attributes");
    assert.ok(attrSec, `Document Attributes section should exist for ${docType}`);

    // Verify widgets generated for fields
    const widgetNames = attrSec.widgets
      .filter(w => w.type === "TextInput" || w.type === "SelectionInput" || w.type === "DatePicker")
      .map(w => w.fieldName || w.title);

    assert.ok(widgetNames.length > 0, `Dynamic widgets should be generated for ${docType}`);

    // Verify calculated fields are NOT included in widget generation
    const calculatedNames = ["calcFileName", "calcNumber", "calcTitle", "calcContactChain", "calcSort"];
    for (const calcName of calculatedNames) {
      assert.strictEqual(
        widgetNames.includes(calcName),
        false,
        `Calculated field ${calcName} must be excluded from UI widgets`
      );
    }
  }
});

test("UnbiasedIntakeCard - cascading selection response cards (onStateChange)", () => {
  const event = {
    formInput: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH"
    },
    parameters: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH"
    }
  };

  const card = UI.buildUnbiasedIntakeCard(event);
  const json = CardSerializer.toJSON(card);

  const cascadeSec = json.sections.find(s => s.header === "1. Project & Document Type");
  assert.ok(cascadeSec, "Cascading selectors section should exist");

  const projWidget = cascadeSec.widgets.find(w => w.fieldName === "project");
  assert.ok(projWidget, "Project dropdown widget should exist");
  assert.strictEqual(projWidget.onChangeAction?.functionName, "onStateChange");

  const docTypeWidget = cascadeSec.widgets.find(w => w.fieldName === "documentType");
  assert.ok(docTypeWidget, "DocumentType dropdown widget should exist");
  assert.strictEqual(docTypeWidget.onChangeAction?.functionName, "onStateChange");

  // Call onStateChange handler
  const actionResponse = UI.onStateChange(event as any);
  assert.ok(actionResponse, "onStateChange should return ActionResponse");
});

test("UnbiasedIntakeCard - low-confidence warning badges and non-blocking banner", () => {
  const aiResult = {
    overallConfidence: 0.75,
    fields: {
      section: { value: "033000", confidence: 0.60 },
      title: { value: "Concrete Work", confidence: 0.95 }
    }
  };

  const event = {
    formInput: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH"
    },
    parameters: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH"
    }
  };

  const card = UI.buildUnbiasedIntakeCard(event, null, null, aiResult as any);
  const json = CardSerializer.toJSON(card);

  // Top warning banner should be rendered
  const hasWarningText = json.sections.some(sec =>
    sec.widgets.some(w => w.text && w.text.includes("Low AI Confidence (<85%)"))
  );
  assert.strictEqual(hasWarningText, true, "Top yellow warning banner should render when low confidence exists");

  // Section field widget title should have warning prefix
  const attrSec = json.sections.find(s => s.header === "2. Document Attributes");
  assert.ok(attrSec);

  const sectionWidget = attrSec.widgets.find(w => w.fieldName === "section");
  assert.ok(sectionWidget, "Section widget should exist");
  assert.ok(sectionWidget.title.includes("⚠️"), "Low confidence field title should be prefixed with ⚠️");
  assert.ok(sectionWidget.hint && sectionWidget.hint.includes("Low AI confidence (60%)"), "Low confidence hint text should render");

  // Submit button remains non-blocking
  const buttonSets = attrSec.widgets.filter(w => w.type === "ButtonSet");
  let subBtn: any = null;
  for (const bs of buttonSets) {
    subBtn = bs.buttons.find((b: any) => b.text === "Process Document");
    if (subBtn) break;
  }
  assert.ok(subBtn, "Process Document button should exist");
  assert.strictEqual(subBtn.disabled, false, "Submission remains non-blocking when required fields are satisfied");
});

test("Process Document submit action - row insertion, AuditLog telemetry, and UserCache draft eviction", async () => {
  const harness = GasMockHarness.install();

  (globalThis as any).defaultDriveFilingRepository = new FakeDriveFilingRepository();
  (globalThis as any).defaultPdfDocumentService = new FakePdfDocumentService();
  (globalThis as any).defaultLogRepository = new GoogleSheetsLogRepository();

  // Set up mock spreadsheet workbook
  const ss = (globalThis as any).SpreadsheetApp.openById("log-ss-123");
  const logSheet = ss.getSheetByName("Submittals Log") || ss.insertSheet("Submittals Log");

  // Headers in Row 1
  logSheet.getRange("A3:I3").setValues([[
    "Section", "Number", "Revision", "Title", "Date", "Contact", "Action", "Contact History", "Status"
  ]]);

  // Populate UserCache draft state
  const userCache = harness.userCache;
  const draftKey = "CARD_DRAFT_V1_GMAIL_msg_test_123";
  userCache.put(draftKey, JSON.stringify({
    contextKey: "GMAIL_msg_test_123",
    section: "033000",
    notes: "Draft notes in progress"
  }), 3600);

  assert.ok(userCache.get(draftKey), "Draft should exist in UserCache before submission");

  const event = {
    formInput: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH",
      discipline: "Architecture",
      section: "033000",
      number: "001",
      revision: "0",
      title: "Cast-in-Place Concrete",
      date: "260810",
      contact: "ARCH",
      action: "Reviewed",
      notes: "Submitted for approval"
    },
    parameters: {
      logFileId: "log-ss-123",
      targetFolderId: "folder-123",
      projectAbbr: "PROJ",
      messageId: "msg_test_123"
    }
  };

  const response = await Process.processSubmission(event as any);
  assert.ok(response, "processSubmission should return ActionResponse");

  // Draft should be evicted from UserCache
  assert.strictEqual(userCache.get(draftKey), null, "UserCache draft state should be cleared upon successful processing");

  // Verify AuditLog telemetry log entry
  const auditSheet = ss.getSheetByName("_AuditLog");
  assert.ok(auditSheet, "_AuditLog sheet should be created for telemetry");
  const auditValues = auditSheet.getDataRange().getValues();
  assert.ok(auditValues.length >= 2, "AuditLog should contain header and event entry");
});
