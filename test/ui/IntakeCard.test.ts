import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness, CardSerializer, EventFactory } from "../harness";

test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

import { FieldConfidenceThreshold } from "../../src/core/interfaces/AiAnalysisService";
import { buildIntakeCard } from "../../src/adapters/gas/UI";
import { defaultDocumentTypeConfigRegistry, DEFAULT_RFI_CONFIG, DEFAULT_ASI_CONFIG } from "../../src/DocumentTypeConfigRegistry";

const findWidgetByFieldName = (cardJson: any, fieldName: string) => {
  return (cardJson.sections || []).flatMap((s: any) => s.widgets || []).find((w: any) => w.fieldName === fieldName);
};

test("FieldConfidenceThreshold constant - is set to 0.85 in core AI definitions", () => {
  assert.equal(FieldConfidenceThreshold, 0.85);
});

test("IntakeCard - renders without low-confidence warning banner or widget warning labels when confidence >= 0.85", () => {
  const event = EventFactory.createCardSubmitEvent({
    project: "PROJ",
    documentType: "SUBMITTAL_ARCH"
  });

  const aiResult = {
    overallConfidence: 0.94,
    fields: {
      section: { value: "033000", confidence: 0.95 },
      number: { value: "001", confidence: 0.92 },
      title: { value: "Cast-in-Place Concrete", confidence: 0.90 }
    }
  };

  const card = buildIntakeCard(event, null, null, aiResult);
  const cardJson = CardSerializer.toJSON(card);

  const hasLowConfBanner = CardSerializer.hasWidgetText(cardJson, "Low AI Confidence (<85%)");
  assert.equal(hasLowConfBanner, false, "Warning banner should not be rendered");

  const sectionWidget = findWidgetByFieldName(cardJson, "section");
  assert.ok(sectionWidget);
  assert.equal(sectionWidget.title.includes("Check Value"), false, "Section title should not have warning label");
});

test("IntakeCard - checks field-level confidence and appends Check Value warning labels and yellow banner when confidence < 0.85", () => {
  const event = EventFactory.createCardSubmitEvent({
    project: "PROJ",
    documentType: "SUBMITTAL_ARCH"
  });

  const aiResult = {
    overallConfidence: 0.78,
    fields: {
      section: { value: "033000", confidence: 0.70 },
      number: { value: "001", confidence: 0.95 },
      title: { value: "Concrete Spec", confidence: 0.60 }
    }
  };

  const card = buildIntakeCard(event, null, null, aiResult);
  const cardJson = CardSerializer.toJSON(card);

  const hasLowConfBanner = CardSerializer.hasWidgetText(cardJson, "Low AI Confidence (<85%)");
  assert.ok(hasLowConfBanner, "Banner should be rendered");

  const sectionWidget = findWidgetByFieldName(cardJson, "section");
  assert.ok(sectionWidget, "Section widget should exist");
  assert.ok(sectionWidget.title.includes("Check Value"), "Section widget title should contain Check Value");

  const titleWidget = findWidgetByFieldName(cardJson, "title");
  assert.ok(titleWidget, "Title widget should exist");
  assert.ok(titleWidget.title.includes("Check Value"), "Title widget title should contain Check Value");

  const numberWidget = findWidgetByFieldName(cardJson, "number");
  assert.ok(numberWidget, "Number widget should exist");
  assert.equal(numberWidget.title.includes("Check Value"), false, "Number widget title should not contain Check Value");
});

test("IntakeCard - dynamically renders form input widgets for SUBMITTAL_ARCH without hardcoded checks", () => {
  const event = EventFactory.createCardSubmitEvent({
    project: "PROJ",
    documentType: "SUBMITTAL_ARCH",
    section: "033000",
    number: "001",
    revision: "0",
    title: "Cast-in-Place Concrete"
  });

  const card = buildIntakeCard(event);
  const cardJson = CardSerializer.toJSON(card);

  const sectionWidget = findWidgetByFieldName(cardJson, "section");
  assert.ok(sectionWidget, "Section widget should exist for SUBMITTAL_ARCH");
  assert.equal(sectionWidget.value, "033000");

  const numberWidget = findWidgetByFieldName(cardJson, "number");
  assert.ok(numberWidget, "Number widget should exist for SUBMITTAL_ARCH");

  const revisionWidget = findWidgetByFieldName(cardJson, "revision");
  assert.ok(revisionWidget, "Revision widget should exist for SUBMITTAL_ARCH");

  const titleWidget = findWidgetByFieldName(cardJson, "title");
  assert.ok(titleWidget, "Title widget should exist for SUBMITTAL_ARCH");

  const calcWidget = findWidgetByFieldName(cardJson, "calcFileName");
  assert.equal(calcWidget, undefined, "Calculated fields must be excluded from UI widget generation");
});

test("IntakeCard - dynamically renders form input widgets for SUBMITTAL_FFE without hardcoded checks", () => {
  const event = EventFactory.createCardSubmitEvent({
    project: "PROJ",
    documentType: "SUBMITTAL_FFE",
    specTag: "CH-01",
    specTitle: "Lounge Chair",
    vendor: "Acme Furniture"
  });

  const card = buildIntakeCard(event);
  const cardJson = CardSerializer.toJSON(card);

  const specTagWidget = findWidgetByFieldName(cardJson, "specTag");
  assert.ok(specTagWidget, "Spec Tag widget should exist for SUBMITTAL_FFE");
  assert.equal(specTagWidget.value, "CH-01");

  const specTitleWidget = findWidgetByFieldName(cardJson, "specTitle");
  assert.ok(specTitleWidget, "Spec Title widget should exist for SUBMITTAL_FFE");

  const vendorWidget = findWidgetByFieldName(cardJson, "vendor");
  assert.ok(vendorWidget, "Vendor widget should exist for SUBMITTAL_FFE");

  const sectionWidget = findWidgetByFieldName(cardJson, "section");
  assert.equal(sectionWidget, undefined, "Architectural section widget should not exist for SUBMITTAL_FFE");

  const calcWidget = findWidgetByFieldName(cardJson, "calcFileName");
  assert.equal(calcWidget, undefined, "Calculated fields must be excluded from UI widget generation");
});

test("IntakeCard - dynamically renders form input widgets for RFI without hardcoded checks", () => {
  defaultDocumentTypeConfigRegistry.registerConfig(DEFAULT_RFI_CONFIG);
  const event = EventFactory.createCardSubmitEvent({
    project: "PROJ",
    documentType: "RFI",
    rfiNumber: "RFI-042",
    title: "Foundation Footing Detail Clarification"
  });

  const card = buildIntakeCard(event);
  const cardJson = CardSerializer.toJSON(card);

  const rfiNumberWidget = findWidgetByFieldName(cardJson, "rfiNumber");
  assert.ok(rfiNumberWidget, "RFI Number widget should exist for RFI");
  assert.equal(rfiNumberWidget.value, "RFI-042");

  const titleWidget = findWidgetByFieldName(cardJson, "title");
  assert.ok(titleWidget, "Title widget should exist for RFI");

  const sectionWidget = findWidgetByFieldName(cardJson, "section");
  assert.equal(sectionWidget, undefined, "Architectural section widget should not exist for RFI");

  const calcWidget = findWidgetByFieldName(cardJson, "calcFileName");
  assert.equal(calcWidget, undefined, "Calculated fields must be excluded from UI widget generation");
});

test("IntakeCard - dynamically renders form input widgets for ASI without hardcoded checks", () => {
  defaultDocumentTypeConfigRegistry.registerConfig({
    documentType: "ASI",
    displayName: "ASI (Architect's Supplemental Instructions)",
    targetTab: "ASI Log",
    rootFolderSearchTerms: ["ASIs"],
    closedRootFolderName: "Closed",
    filenamePrefix: "_",
    logSearchTerms: ["asi log"],
    logSheetName: "ASI Log",
    logAdapterKey: "GoogleSheetsLogRepository",
    filingAdapterKey: "GoogleDriveFilingRepository",
    fields: [
      { key: 'asiNumber', label: 'ASI Number', type: 'string', required: true, header: 'ASI Number' },
      { key: 'title', label: 'Title', type: 'string', required: true, header: 'Title' },
      { key: 'calcFileName', label: 'Calc File Name', type: 'string', isCalculated: true, header: 'Calc File Name' }
    ]
  });

  const event = EventFactory.createCardSubmitEvent({
    project: "PROJ",
    documentType: "ASI",
    asiNumber: "ASI-012",
    title: "Updated Window Glazing Specification"
  });

  const card = buildIntakeCard(event);
  const cardJson = CardSerializer.toJSON(card);

  const asiNumberWidget = findWidgetByFieldName(cardJson, "asiNumber");
  assert.ok(asiNumberWidget, "ASI Number widget should exist for ASI");
  assert.equal(asiNumberWidget.value, "ASI-012");

  const titleWidget = findWidgetByFieldName(cardJson, "title");
  assert.ok(titleWidget, "Title widget should exist for ASI");

  const rfiNumberWidget = findWidgetByFieldName(cardJson, "rfiNumber");
  assert.equal(rfiNumberWidget, undefined, "RFI Number widget should not exist for ASI");

  const calcWidget = findWidgetByFieldName(cardJson, "calcFileName");
  assert.equal(calcWidget, undefined, "Calculated fields must be excluded from UI widget generation");
});
