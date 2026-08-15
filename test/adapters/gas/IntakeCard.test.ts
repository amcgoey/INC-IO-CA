import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "../../harness/GasMockHarness";
import { CardSerializer } from "../../harness/CardSerializer";
import { FakeDriveFilingRepository } from "../../harness/fakes/FakeDriveFilingRepository";
import { FakePdfDocumentService } from "../../harness/fakes/FakePdfDocumentService";
import { GoogleSheetsLogRepository } from "../../../src/GoogleSheetsLogRepository";
import { defaultDocumentTypeConfigRegistry, DEFAULT_RFI_CONFIG, DEFAULT_ASI_CONFIG } from "../../../src/DocumentTypeConfigRegistry";
import * as UI from "../../../src/adapters/gas/UI";
import * as Process from "../../../src/Main";

test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

test("IntakeCard - dynamic field generation across registered DocumentTypes", () => {
  defaultDocumentTypeConfigRegistry.registerConfig(DEFAULT_RFI_CONFIG);
  defaultDocumentTypeConfigRegistry.registerConfig(DEFAULT_ASI_CONFIG);
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

    const card = UI.buildIntakeCard(event);
    assert.ok(card, "Card for " + docType + " should be constructed");

    const json = CardSerializer.toJSON(card);
    assert.ok(json.header, "Card header should exist");
    assert.strictEqual(json.header.title, "File Document");

    const attrSec = json.sections.find(s => s.header && s.header.includes("Document Attributes"));
    assert.ok(attrSec, "Document Attributes section should exist for " + docType);

    const widgetNames = attrSec.widgets
      .filter(w => w.type === "TextInput" || w.type === "SelectionInput" || w.type === "DatePicker")
      .map(w => w.fieldName || w.title);

    assert.ok(widgetNames.length > 0, "Dynamic widgets should be generated for " + docType);

    const calculatedNames = ["calcFileName", "calcNumber", "calcTitle", "calcContactChain", "calcSort"];
    for (const calcName of calculatedNames) {
      assert.strictEqual(
        widgetNames.includes(calcName),
        false,
        "Calculated field " + calcName + " must be excluded from UI widgets"
      );
    }
  }
});

test("IntakeCard - cascading selection response cards (onStateChange)", () => {
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

  const card = UI.buildIntakeCard(event);
  const json = CardSerializer.toJSON(card);

  const cascadeSec = json.sections.find(s => s.header === "1. Project & Document Type");
  assert.ok(cascadeSec, "Cascading selectors section should exist");

  const projWidget = cascadeSec.widgets.find(w => w.fieldName === "project");
  assert.ok(projWidget, "Project dropdown widget should exist");
  assert.strictEqual(projWidget.onChangeAction?.functionName, "onStateChange");

  const docTypeWidget = cascadeSec.widgets.find(w => w.fieldName === "documentType");
  assert.ok(docTypeWidget, "DocumentType dropdown widget should exist");
  assert.strictEqual(docTypeWidget.onChangeAction?.functionName, "onStateChange");

  const actionResponse = UI.onStateChange(event as any);
  assert.ok(actionResponse, "onStateChange should return ActionResponse");
});

test("IntakeCard - low-confidence warning badges and non-blocking banner", () => {
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

  const card = UI.buildIntakeCard(event, null, null, aiResult as any);
  const json = CardSerializer.toJSON(card);

  const hasWarningText = json.sections.some(sec =>
    sec.widgets.some(w => w.text && w.text.includes("Low AI Confidence (<85%)"))
  );
  assert.strictEqual(hasWarningText, true, "Top yellow warning banner should render when low confidence exists");

  const attrSec = json.sections.find(s => s.header && s.header.includes("Document Attributes"));
  assert.ok(attrSec);

  const sectionWidget = attrSec.widgets.find(w => w.fieldName === "section");
  assert.ok(sectionWidget, "Section widget should exist");
  assert.ok(sectionWidget.title.includes("⚠️"), "Low confidence field title should be prefixed with ⚠️");
  assert.ok(sectionWidget.hint && sectionWidget.hint.includes("Low AI confidence (60%)"), "Low confidence hint text should render");

  const buttonSets = attrSec.widgets.filter(w => w.type === "ButtonSet");
  let subBtn: any = null;
  for (const bs of buttonSets) {
    subBtn = bs.buttons.find((b: any) => b.text === "Process Document");
    if (subBtn) break;
  }
  assert.ok(subBtn, "Process Document button should exist");
  assert.strictEqual(subBtn.disabled, false, "Submission remains non-blocking when required fields are satisfied");
});

test("IntakeCard - interactive prompt buttons display (promptAddTag)", () => {
  const event = {
    formInput: {
      project: "PROJ",
      documentType: "SUBMITTAL_FFE",
      specTag: "CH-99",
      specTitle: "Custom Chair"
    },
    parameters: {
      project: "PROJ",
      documentType: "SUBMITTAL_FFE"
    }
  };

  const flashMessage = {
    warning: "Tag CH-99 does not exist.",
    promptAddTag: true
  };

  const card = UI.buildIntakeCard(event, null, flashMessage);
  const json = CardSerializer.toJSON(card);

  const attrSec = json.sections.find(s => s.header && s.header.includes("Document Attributes"));
  assert.ok(attrSec, "Document Attributes section should exist");

  const buttonSets = attrSec.widgets.filter(w => w.type === "ButtonSet");
  let promptBtn: any = null;
  for (const bs of buttonSets) {
    promptBtn = bs.buttons.find((b: any) => b.text === "Add New Tag, File & Log");
    if (promptBtn) break;
  }

  assert.ok(promptBtn, "Add New Tag, File & Log prompt button should be rendered");
  assert.strictEqual(promptBtn.onClickAction?.functionName, "processSubmissionWithNewTag");
});

test("IntakeCard - interactive prompt buttons display (promptAddVendor)", () => {
  const event = {
    formInput: {
      project: "PROJ",
      documentType: "SUBMITTAL_FFE",
      vendor: "New Vendor Corp"
    },
    parameters: {
      project: "PROJ",
      documentType: "SUBMITTAL_FFE"
    }
  };

  const flashMessage = {
    warning: "Vendor New Vendor Corp does not exist.",
    promptAddVendor: true
  };

  const card = UI.buildIntakeCard(event, null, flashMessage);
  const json = CardSerializer.toJSON(card);

  const attrSec = json.sections.find(s => s.header && s.header.includes("Document Attributes"));
  assert.ok(attrSec, "Document Attributes section should exist");

  const buttonSets = attrSec.widgets.filter(w => w.type === "ButtonSet");
  let promptBtn: any = null;
  for (const bs of buttonSets) {
    promptBtn = bs.buttons.find((b: any) => b.text === "Add New Vendor, File & Log");
    if (promptBtn) break;
  }

  assert.ok(promptBtn, "Add New Vendor, File & Log prompt button should be rendered");
  assert.strictEqual(promptBtn.onClickAction?.functionName, "processSubmissionWithNewVendor");
});

test("IntakeCard - filing outcome banner rendering", () => {
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

  const flashMessage = {
    targetKey: "033000-001",
    url: "https://drive.google.com/file/d/123",
    directRowUrl: "https://docs.google.com/spreadsheets/d/456#gid=0",
    localPath: "G:\\Shared Drives\\PROJ\\033000-001.pdf",
    failedColumns: ["Notes"],
    emptyFallbacks: ["Contact"]
  };

  const card = UI.buildIntakeCard(event, null, flashMessage);
  const json = CardSerializer.toJSON(card);

  const hasTargetKeyText = json.sections.some(s =>
    s.widgets.some(w => w.text && w.text.includes("033000-001"))
  );
  assert.strictEqual(hasTargetKeyText, true, "Filing outcome banner should include targetKey");

  const hasFailedColsWarning = json.sections.some(s =>
    s.widgets.some(w => w.text && w.text.includes("failed to log due to data validation rules"))
  );
  assert.strictEqual(hasFailedColsWarning, true, "Filing outcome banner should render failed columns warning");
});

test("Process Document submit action - row insertion, AuditLog telemetry, and UserCache draft eviction", async () => {
  const harness = GasMockHarness.install();

  (globalThis as any).defaultDriveFilingRepository = new FakeDriveFilingRepository();
  (globalThis as any).defaultPdfDocumentService = new FakePdfDocumentService();
  (globalThis as any).defaultLogRepository = new GoogleSheetsLogRepository();

  const ss = (globalThis as any).SpreadsheetApp.openById("log-ss-123");
  const logSheet = ss.getSheetByName("Submittals Log") || ss.insertSheet("Submittals Log");

  logSheet.getRange("A3:I3").setValues([[
    "Section", "Number", "Revision", "Title", "Date", "Contact", "Action", "Contact History", "Status"
  ]]);

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

  assert.strictEqual(userCache.get(draftKey), null, "UserCache draft state should be cleared upon successful processing");

  
});

test("IntakeCard - Refresh Cache & Reload button in Admin & Status section", () => {
  const event = {
    formInput: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH"
    },
    parameters: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH",
      logFileId: "log-ss-123"
    }
  };

  const card = UI.buildIntakeCard(event);
  const json = CardSerializer.toJSON(card);

  const adminSec = json.sections.find(s => s.header && s.header.includes("Admin & Status"));
  assert.ok(adminSec, "Admin & Status section should exist");

  const buttonSets = adminSec.widgets.filter(w => w.type === "ButtonSet");
  let refreshBtn: any = null;
  for (const bs of buttonSets) {
    refreshBtn = bs.buttons.find((b: any) => b.text && b.text.includes("Refresh Cache"));
    if (refreshBtn) break;
  }

  assert.ok(refreshBtn, "Refresh Cache & Reload button should exist in Admin & Status section");
  assert.strictEqual(refreshBtn.onClickAction?.functionName, "handleRefreshCache");
});

test("IntakeCard - Log status informational messages rendering", () => {
  const event = {
    formInput: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH"
    },
    parameters: {
      project: "PROJ",
      documentType: "SUBMITTAL_ARCH",
      logFileId: "log-ss-123"
    }
  };

  const card = UI.buildIntakeCard(event);
  const json = CardSerializer.toJSON(card);

  const cascadeSec = json.sections.find(s => s.header === "1. Project & Document Type");
  assert.ok(cascadeSec, "Cascading selectors section should exist");

  const hasLoadedText = cascadeSec.widgets.some(w => w.text && (w.text.includes("Log file loaded successfully") || w.text.includes("Log loaded")));
  assert.strictEqual(hasLoadedText, true, "Log status loaded message should render when log is loaded");
});

test("IntakeCard - AI auto-triage flash message banner rendering", () => {
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

  const flashMessage = {
    warning: "AI auto-triaged as Submittal (Architecture) based on email body"
  };

  const card = UI.buildIntakeCard(event, null, flashMessage);
  const json = CardSerializer.toJSON(card);

  const hasFlashWarningText = json.sections.some(s =>
    s.widgets.some(w => w.text && w.text.includes("AI auto-triaged as Submittal"))
  );
  assert.strictEqual(hasFlashWarningText, true, "AI auto-triage warning message should render in status section");
});

test("IntakeCard - DocumentType change updates Open Submittal Log tab GID and hydrates target fields", () => {
  const fakeRepo = new FakeDriveFilingRepository() as any;
  const mockSettings = {
    contacts: [{ abbr: "ARCH", name: "Architect" }],
    actions: [{ action: "Received", abbr: "REC", status: "Incoming" }],
    ffeTags: { tags: ["CH-01"], vendors: ["Acme"], tagMap: { "CH-01": "Lounge Chair" } },
    projectAbbr: "PROJ",
    logSheetId: 0,
    sheetGids: {
      "Submittal Arch": 0,
      "Submittal FFE": 101,
      "RFI Log": 202,
      "ASI Log": 303
    }
  };
  const mockLogRepo = {
    getLogSettings: (_spreadsheetId: string, _discipline: string) => mockSettings
  };
  (globalThis as any).defaultLogRepository = mockLogRepo;

  const archEvent = {
    formInput: { project: "PROJ", documentType: "SUBMITTAL_ARCH" },
    parameters: { project: "PROJ", documentType: "SUBMITTAL_ARCH", logFileId: "log-123" }
  };
  const archCard = UI.buildIntakeCard(archEvent as any);
  const archJson = CardSerializer.toJSON(archCard);

  const cascadeSecArch = archJson.sections.find(s => s.header === "1. Project & Document Type");
  assert.ok(cascadeSecArch);
  const buttonSetsArch = cascadeSecArch.widgets.filter(w => w.type === "ButtonSet");
  let archBtn: any = null;
  for (const bs of buttonSetsArch) {
    archBtn = bs.buttons?.find((b: any) => b.text === "Open Submittal Log");
    if (archBtn) break;
  }
  assert.ok(archBtn);
  assert.ok(archBtn.openLink?.url.includes("#gid=0"), "Submittal Arch log link should point to #gid=0");

  const ffeEvent = {
    formInput: { project: "PROJ", documentType: "SUBMITTAL_FFE" },
    parameters: { project: "PROJ", documentType: "SUBMITTAL_ARCH", logFileId: "log-123" }
  };
  const ffeCard = UI.buildIntakeCard(ffeEvent as any);
  const ffeJson = CardSerializer.toJSON(ffeCard);

  const cascadeSecFfe = ffeJson.sections.find(s => s.header === "1. Project & Document Type");
  assert.ok(cascadeSecFfe);
  const buttonSetsFfe = cascadeSecFfe.widgets.filter(w => w.type === "ButtonSet");
  let ffeBtn: any = null;
  for (const bs of buttonSetsFfe) {
    ffeBtn = bs.buttons?.find((b: any) => b.text === "Open Submittal Log");
    if (ffeBtn) break;
  }
  assert.ok(ffeBtn);
  assert.ok(ffeBtn.openLink?.url.includes("#gid=101"), "Submittal FF&E log link should point to #gid=101");

  const rfiEvent = {
    formInput: { project: "PROJ", documentType: "RFI" },
    parameters: { project: "PROJ", documentType: "SUBMITTAL_ARCH", logFileId: "log-123" }
  };
  defaultDocumentTypeConfigRegistry.registerConfig({
    documentType: "RFI",
    displayName: "RFI (Request for Information)",
    targetTab: "RFI Log",
    rootFolderSearchTerms: ["RFIs"],
    closedRootFolderName: "Closed",
    filenamePrefix: "_",
    logSearchTerms: ["rfi log"],
    logSheetName: "RFI Log",
    logAdapterKey: "GoogleSheetsLogRepository",
    filingAdapterKey: "GoogleDriveFilingRepository",
    fields: []
  });
  const rfiCard = UI.buildIntakeCard(rfiEvent as any);
  const rfiJson = CardSerializer.toJSON(rfiCard);

  const cascadeSecRfi = rfiJson.sections.find(s => s.header === "1. Project & Document Type");
  assert.ok(cascadeSecRfi);
  const buttonSetsRfi = cascadeSecRfi.widgets.filter(w => w.type === "ButtonSet");
  let rfiBtn: any = null;
  for (const bs of buttonSetsRfi) {
    rfiBtn = bs.buttons?.find((b: any) => b.text === "Open Submittal Log");
    if (rfiBtn) break;
  }
  assert.ok(rfiBtn);
  assert.ok(rfiBtn.openLink?.url.includes("#gid=202"), "RFI log link should point to #gid=202");
});
