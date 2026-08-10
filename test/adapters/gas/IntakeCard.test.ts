import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "../../harness/GasMockHarness";
import { CardSerializer } from "../../harness/CardSerializer";
import * as UI from "../../../src/adapters/gas/UI";

test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

test("IntakeCard - dynamic field generation across registered DocumentTypes", () => {
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

    const attrSec = json.sections.find(s => s.header === "2. Document Attributes");
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

  const attrSec = json.sections.find(s => s.header === "2. Document Attributes");
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

  const attrSec = json.sections.find(s => s.header === "2. Document Attributes");
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
