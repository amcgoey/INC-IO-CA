import test from "node:test";
import assert from "node:assert";
import {
  DOCUMENT_LOG_WORKBOOK_SPEC,
  TabSpec,
  NamedRangeSpec
} from "../src/core/config/DocumentLogWorkbookSpec";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC, ThemeColors } from "../src/core/config/DocumentLogWorkbookViewSpec";
import { WorkbookTemplateViewModel } from "../src/core/config/WorkbookTemplateViewModel";

test("DOCUMENT_LOG_WORKBOOK_SPEC defines Submittal FFE log tab (1000x26) with 15 columns", () => {
  const ffeTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: TabSpec) => t.name === "Submittal FFE");
  assert.ok(ffeTab, "Submittal FFE log tab must be defined in tabs");
  assert.strictEqual(ffeTab.rowCount, 1000, "Submittal FFE rowCount should be 1000");
  assert.strictEqual(ffeTab.columnCount, 26, "Submittal FFE columnCount should be 26");
  assert.strictEqual(ffeTab.isLogTab, true, "Submittal FFE isLogTab should be true");

  assert.ok(ffeTab.columns, "Submittal FFE columns must be defined");
  assert.strictEqual(ffeTab.columns.length, 15, "Submittal FFE should have 15 columns");

  const expectedHeaders = [
    { id: "specTag", header: "Spec Tag" },
    { id: "relatedTag", header: "Related Tag" },
    { id: "revision", header: "Revision" },
    { id: "specTitle", header: "Spec Title" },
    { id: "vendor", header: "Vendor" },
    { id: "date", header: "Date" },
    { id: "contact", header: "Contact" },
    { id: "action", header: "Action" },
    { id: "notes", header: "Notes" },
    { id: "link", header: "Link" },
    { id: "calcFileName", header: "Calc File Name" },
    { id: "calcNumber", header: "Calc Number" },
    { id: "calcTitle", header: "Calc Title" },
    { id: "calcContactChain", header: "Calc Contact Chain" },
    { id: "calcSort", header: "Calc Sort" }
  ];

  expectedHeaders.forEach((exp, idx) => {
    assert.strictEqual(ffeTab.columns![idx].id, exp.id);
    assert.strictEqual(ffeTab.columns![idx].header, exp.header);
  });
});

test("DOCUMENT_LOG_WORKBOOK_SPEC seedRows in _Config includes Submittal_FFE entry", () => {
  const configTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: TabSpec) => t.name === "_Config");
  assert.ok(configTab, "_Config tab must exist");
  assert.ok(configTab.seedRows, "_Config seedRows must exist");

  const ffeSeedRow = configTab.seedRows.find((row: any) => row[0] === "Submittal_FFE");
  assert.ok(ffeSeedRow, "Submittal_FFE seed row must exist in _Config");
  assert.deepStrictEqual(ffeSeedRow, ["Submittal_FFE", "FFE Submittals", "SUB-FFE", "Submittal FFE"]);
});

test("DOCUMENT_LOG_WORKBOOK_SPEC registers dual-tier named ranges for Submittal FFE", () => {
  const sheetHeaders = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Headers" && nr.tabName === "Submittal FFE"
  );
  assert.ok(sheetHeaders, "Sheet-scoped Headers named range must exist for Submittal FFE");
  assert.strictEqual(sheetHeaders.rangeNotation, "A1:O2");
  assert.strictEqual(sheetHeaders.scope, "Sheet");

  const sheetFormula = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "FormulaRow" && nr.tabName === "Submittal FFE"
  );
  assert.ok(sheetFormula, "Sheet-scoped FormulaRow named range must exist for Submittal FFE");
  assert.strictEqual(sheetFormula.rangeNotation, "A2:O2");
  assert.strictEqual(sheetFormula.scope, "Sheet");

  const sheetData = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Data" && nr.tabName === "Submittal FFE"
  );
  assert.ok(sheetData, "Sheet-scoped Data named range must exist for Submittal FFE");
  assert.strictEqual(sheetData.rangeNotation, "A4:O1000");
  assert.strictEqual(sheetData.scope, "Sheet");

  const wbConfigFFE = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Config_Submittal_FFE"
  );
  assert.ok(wbConfigFFE, "Workbook-scoped Config_Submittal_FFE named range must exist");
  assert.strictEqual(wbConfigFFE.tabName, "_Config");
  assert.strictEqual(wbConfigFFE.rangeNotation, "A5:D7");
  assert.strictEqual(wbConfigFFE.scope, "Workbook");

  const wbHeaders = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Submittal_FFE_Headers"
  );
  assert.ok(wbHeaders, "Workbook-scoped Submittal_FFE_Headers named range must exist");
  assert.strictEqual(wbHeaders.tabName, "Submittal FFE");
  assert.strictEqual(wbHeaders.rangeNotation, "A1:O2");
  assert.strictEqual(wbHeaders.scope, "Workbook");

  const wbFormula = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Submittal_FFE_FormulaRow"
  );
  assert.ok(wbFormula, "Workbook-scoped Submittal_FFE_FormulaRow named range must exist");
  assert.strictEqual(wbFormula.tabName, "Submittal FFE");
  assert.strictEqual(wbFormula.rangeNotation, "A2:O2");
  assert.strictEqual(wbFormula.scope, "Workbook");

  const wbData = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Submittal_FFE_Data"
  );
  assert.ok(wbData, "Workbook-scoped Submittal_FFE_Data named range must exist");
  assert.strictEqual(wbData.tabName, "Submittal FFE");
  assert.strictEqual(wbData.rangeNotation, "A4:O1000");
  assert.strictEqual(wbData.scope, "Workbook");
});

test("DOCUMENT_LOG_WORKBOOK_VIEW_SPEC specifies Dark Gray #666666 header fill and white text", () => {
  assert.ok(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC, "DOCUMENT_LOG_WORKBOOK_VIEW_SPEC must be exported");
  assert.strictEqual(ThemeColors.HEADER_FILL_HEX, "#666666");
  assert.strictEqual(ThemeColors.HEADER_TEXT_HEX, "#FFFFFF");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.bold, true);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fillHex, "#666666");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fontColorHex, "#FFFFFF");
});

test("WorkbookTemplateViewModel binds spec and view spec to export complete fixture JSON", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const fixtureJson = viewModel.toFixtureJson();

  assert.strictEqual(fixtureJson.schemaVersion, "1.0.0");
  assert.ok(Array.isArray(fixtureJson.tabs));

  const ffeTab = fixtureJson.tabs.find((t: any) => t.name === "Submittal FFE");
  assert.ok(ffeTab, "Fixture JSON must include Submittal FFE tab");
  assert.strictEqual(ffeTab.rowCount, 1000);
  assert.strictEqual(ffeTab.columnCount, 26);
  assert.strictEqual(ffeTab.isLogTab, true);
  assert.strictEqual(ffeTab.headers.length, 15);
  assert.strictEqual(ffeTab.headers[0], "Spec Tag");
  assert.strictEqual(ffeTab.headers[14], "Calc Sort");

  const headersNR = fixtureJson.namedRanges.find((nr: any) => nr.name === "Submittal_FFE_Headers");
  assert.ok(headersNR, "Fixture JSON must contain Submittal_FFE_Headers named range");
  assert.strictEqual(headersNR.rangeNotation, "A1:O2");
});