import test from "node:test";
import assert from "node:assert";
import {
  DOCUMENT_LOG_WORKBOOK_SPEC,
  TabSpec,
  NamedRangeSpec
} from "../src/core/config/DocumentLogWorkbookSpec";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from "../src/core/config/DocumentLogWorkbookViewSpec";
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
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.themeColors.headerFill, "#666666");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.themeColors.headerText, "#FFFFFF");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.bold, true);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.backgroundColor, "#666666");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.foregroundColor, "#FFFFFF");
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
test("DOCUMENT_LOG_WORKBOOK_SPEC defines Submittal FFE Support tab with Vendor and SpecTag seed rows and sheet-scoped named ranges", () => {
  const supportTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: TabSpec) => t.name === "Submittal FFE Support");
  assert.ok(supportTab, "Submittal FFE Support tab must exist");
  assert.strictEqual(supportTab.isSupportTab, true, "isSupportTab should be true");
  assert.strictEqual(supportTab.rowCount, 100);
  assert.strictEqual(supportTab.columnCount, 10);
  assert.ok(supportTab.seedRows, "seedRows must be defined on Submittal FFE Support");
  assert.strictEqual(supportTab.seedRows.length, 3);
  assert.deepStrictEqual(supportTab.seedRows[0], ["Vendor Key", "Vendor Label", "SpecTag Key", "SpecTag Label"]);
  assert.deepStrictEqual(supportTab.seedRows[1], ["ACME", "Acme Supplies", "CH-01", "Dining Chair"]);
  assert.deepStrictEqual(supportTab.seedRows[2], ["GLOBAL", "Global Materials", "TBL-01", "Conference Table"]);

  const vendorsNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Vendors" && nr.tabName === "Submittal FFE Support"
  );
  assert.ok(vendorsNR, "Vendors named range must exist on Submittal FFE Support");
  assert.strictEqual(vendorsNR.rangeNotation, "A2:B20");
  assert.strictEqual(vendorsNR.scope, "Sheet");

  const specTagsNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "SpecTags" && nr.tabName === "Submittal FFE Support"
  );
  assert.ok(specTagsNR, "SpecTags named range must exist on Submittal FFE Support");
  assert.strictEqual(specTagsNR.rangeNotation, "C2:D20");
  assert.strictEqual(specTagsNR.scope, "Sheet");
});

test("DOCUMENT_LOG_WORKBOOK_SPEC defines MAP/LAMBDA formulas in Submittal FFE including calcTitle tag VLOOKUP", () => {
  const ffeTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: TabSpec) => t.name === "Submittal FFE");
  assert.ok(ffeTab, "Submittal FFE tab must exist");
  assert.ok(ffeTab.columns, "columns must exist");

  const calcTitleCol = ffeTab.columns.find((c) => c.id === "calcTitle");
  assert.ok(calcTitleCol, "calcTitle column must exist");
  assert.ok(calcTitleCol.formula, "calcTitle formula must be defined");
  assert.ok(calcTitleCol.formula.includes("MAP(A4:A, D4:D, LAMBDA("), "calcTitle formula must be a MAP/LAMBDA expression");
  assert.ok(calcTitleCol.formula.includes("VLOOKUP(tag, 'Submittal FFE Support'!SpecTags, 2, FALSE)"), "calcTitle formula must perform VLOOKUP against SpecTags");

  const calcFileNameCol = ffeTab.columns.find((c) => c.id === "calcFileName");
  assert.ok(calcFileNameCol && calcFileNameCol.formula, "calcFileName formula must be defined");

  const calcNumberCol = ffeTab.columns.find((c) => c.id === "calcNumber");
  assert.ok(calcNumberCol && calcNumberCol.formula, "calcNumber formula must be defined");

  const calcSortCol = ffeTab.columns.find((c) => c.id === "calcSort");
  assert.ok(calcSortCol && calcSortCol.formula, "calcSort formula must be defined");
});

test("WorkbookTemplateViewModel toFixtureJson exports Submittal FFE formulaRow with tag VLOOKUP formula", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const fixtureJson = viewModel.toFixtureJson();

  const ffeTab = fixtureJson.tabs.find((t: any) => t.name === "Submittal FFE");
  assert.ok(ffeTab, "Submittal FFE tab must exist in fixture JSON");
  assert.strictEqual(ffeTab.formulaRow.length, 15);
  
  const calcTitleIdx = ffeTab.headers.indexOf("Calc Title");
  assert.ok(calcTitleIdx >= 0, "Calc Title header must exist in fixture headers");
  const calcTitleFormula = ffeTab.formulaRow[calcTitleIdx];
  assert.ok(calcTitleFormula, "calcTitle formula must be non-empty in formulaRow");
  assert.ok(calcTitleFormula.includes("VLOOKUP(tag, 'Submittal FFE Support'!SpecTags, 2, FALSE)"));
});
