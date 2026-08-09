import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness, CardSerializer, EventFactory } from "../harness";

test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

const { FieldConfidenceThreshold } = require("../../src/core/interfaces/AiAnalysisService");
const { buildUnbiasedIntakeCard } = require("../../src/adapters/gas/UI");

const findWidgetByFieldName = (cardJson: any, fieldName: string) => {
  return (cardJson.sections || []).flatMap((s: any) => s.widgets || []).find((w: any) => w.fieldName === fieldName);
};

test("FieldConfidenceThreshold constant - is set to 0.85 in core AI definitions", () => {
  assert.equal(FieldConfidenceThreshold, 0.85);
});

test("UnbiasedIntakeCard - renders without low-confidence warning banner or widget warning labels when confidence >= 0.85", () => {
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

  const card = buildUnbiasedIntakeCard(event, null, null, aiResult);
  const cardJson = CardSerializer.toJSON(card);

  const hasLowConfBanner = CardSerializer.hasWidgetText(cardJson, "Low AI Confidence (<85%)");
  assert.equal(hasLowConfBanner, false, "Warning banner should not be rendered");

  const sectionWidget = findWidgetByFieldName(cardJson, "section");
  assert.ok(sectionWidget);
  assert.equal(sectionWidget.title.includes("Check Value"), false, "Section title should not have warning label");
});

test("UnbiasedIntakeCard - checks field-level confidence and appends Check Value warning labels and yellow banner when confidence < 0.85", () => {
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

  const card = buildUnbiasedIntakeCard(event, null, null, aiResult);
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
