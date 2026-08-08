import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness, CardSerializer } from "./harness";

test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

const { DocumentTypeConfigRegistry, resolve5TierFieldValue } = require("../src/DocumentTypeConfigRegistry");
const { renderDynamicFormFields } = require("../src/adapters/gas/UI");

test("DocumentTypeConfigRegistry - parseFieldSpecs converts _Config subtables into DocumentFieldSpec[]", () => {
  const registry = new DocumentTypeConfigRegistry();
  const subtableRows = [
    ["Key", "Header", "Label", "Type", "IsCalculated", "FormulaOrFunction", "OptionsRange", "Required", "Description", "DefaultValue", "KeyNormalizationRule"],
    ["section", "Section", "CSI Section", "string", "FALSE", "", "", "TRUE", "6-digit CSI section", "033000", "code"],
    ["description", "Description", "Notes / Details", "multiline", "FALSE", "", "", "FALSE", "Detailed notes", "", "exact"],
    ["calcName", "Calc File Name", "Calculated Name", "string", "TRUE", "=CONCAT()", "", "FALSE", "", "", ""],
    ["revision", "Revision", "Rev #", "string", "FALSE", "", "", "FALSE", "Revision", "0", "exact"]
  ];

  const specs = registry.parseFieldSpecs(subtableRows);
  assert.equal(specs.length, 4);

  assert.deepEqual(specs[0], {
    key: "section",
    header: "Section",
    label: "CSI Section",
    type: "string",
    required: true,
    description: "6-digit CSI section",
    defaultValue: "033000",
    keyNormalizationRule: "code"
  });

  assert.deepEqual(specs[1], {
    key: "description",
    header: "Description",
    label: "Notes / Details",
    type: "multiline",
    description: "Detailed notes",
    keyNormalizationRule: "exact"
  });

  assert.equal(specs[2].key, "calcName");
  assert.equal(specs[2].isCalculated, true);
  assert.equal(specs[2].formulaOrFunction, "=CONCAT()");
});

test("5-tier state hydration hierarchy - resolves values according to strict precedence", () => {
  const field: any = { key: "title", label: "Title", type: "string", defaultValue: "Default Title" };

  // Tier 1: Form Inputs > User Cache Draft > Parser Result > AI Metadata > Default
  const val1 = resolve5TierFieldValue(field, { title: "Form Title" }, { title: "Draft Title" }, { title: "Parser Title" }, { title: "AI Title" });
  assert.equal(val1, "Form Title");

  // Tier 2: User Cache Draft > Parser Result > AI Metadata > Default
  const val2 = resolve5TierFieldValue(field, {}, { title: "Draft Title" }, { title: "Parser Title" }, { title: "AI Title" });
  assert.equal(val2, "Draft Title");

  // Tier 3: Parser Result > AI Metadata > Default
  const val3 = resolve5TierFieldValue(field, {}, {}, { title: "Parser Title" }, { title: "AI Title" });
  assert.equal(val3, "Parser Title");

  // Tier 4: AI Metadata > Default
  const val4 = resolve5TierFieldValue(field, {}, {}, {}, { title: "AI Title" });
  assert.equal(val4, "AI Title");

  // Tier 5: Default Value / ""
  const val5 = resolve5TierFieldValue(field, {}, {}, {}, {});
  assert.equal(val5, "Default Title");

  const emptyField: any = { key: "notes", label: "Notes", type: "multiline" };
  const val6 = resolve5TierFieldValue(emptyField, {}, {}, {}, {});
  assert.equal(val6, "");
});

test("renderDynamicFormFields - renders string and multiline fields and excludes calculated fields", () => {
  const harness = GasMockHarness.install();
  const CardService = harness.cardService;
  const section = CardService.newCardSection();

  const fields: any[] = [
    { key: "section", label: "CSI Section", type: "string", required: true, description: "CSI Section #" },
    { key: "notes", label: "Detailed Notes", type: "multiline", required: false, description: "Additional details" },
    { key: "calcField", label: "Calculated Field", type: "string", isCalculated: true, header: "Calc" }
  ];

  const hydrationContext = {
    formInput: { section: "033000" },
    userCacheDraft: { notes: "Draft notes from cache" }
  };

  renderDynamicFormFields(section, fields, hydrationContext);

  const card = CardService.newCardBuilder().addSection(section).build();
  const cardJson = CardSerializer.toJSON(card);

  assert.equal(cardJson.sections.length, 1);
  const widgets: any[] = cardJson.sections[0].widgets;

  // Should have exactly 2 widgets (calculated field excluded)
  assert.equal(widgets.length, 2);

  // Widget 0: string TextInput
  assert.equal(widgets[0].fieldName, "section");
  assert.equal(widgets[0].title, "CSI Section");
  assert.equal(widgets[0].value, "033000");
  assert.equal(widgets[0].multiline, false);
  assert.equal(widgets[0].hint, "CSI Section #");

  // Widget 1: multiline TextInput
  assert.equal(widgets[1].fieldName, "notes");
  assert.equal(widgets[1].title, "Detailed Notes");
  assert.equal(widgets[1].value, "Draft notes from cache");
  assert.equal(widgets[1].multiline, true);
  assert.equal(widgets[1].hint, "Additional details");
});

test("renderDynamicFormFields - applies missing required field ❌ and low AI confidence ⚠️ formatting", () => {
  const harness = GasMockHarness.install();
  const CardService = harness.cardService;
  const section = CardService.newCardSection();

  const fields: any[] = [
    { key: "section", label: "Section", type: "string", required: true },
    { key: "title", label: "Title", type: "string", required: false }
  ];

  const validationContext = {
    missingFields: ["section"],
    fieldConfidence: { title: 0.65 }
  };

  renderDynamicFormFields(section, fields, {}, validationContext);

  const card = CardService.newCardBuilder().addSection(section).build();
  const cardJson = CardSerializer.toJSON(card);
  const widgets: any[] = cardJson.sections[0].widgets;

  assert.equal(widgets.length, 2);

  // Missing field: ❌ Section
  assert.equal(widgets[0].title, "❌ Section");

  // Low AI confidence field (< 0.85): ⚠️ Title with confidence hint
  assert.equal(widgets[1].title, "⚠️ Title");
  assert.equal(widgets[1].hint, "Low AI confidence (65%) — please verify");
});
