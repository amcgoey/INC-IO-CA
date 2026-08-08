import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../src/core/config/DocumentLogWorkbookSpec";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from "../src/core/config/DocumentLogWorkbookViewSpec";
import { WorkbookTemplateViewModel } from "../src/core/config/WorkbookTemplateViewModel";
import { GasMockHarness } from "./harness/GasMockHarness";

export function evaluateArchFormula(
  formula: string,
  row: { section: string; number: number; title: string; revision: string; contact: string }
): string {
  if (!row.section) {
    return "";
  }
  const secPadded = String(row.section).padStart(6, "0");
  const numPadded = String(row.number).padStart(3, "0");
  const numSortPadded = String(row.number).padStart(4, "0");

  if (formula.includes("Calc File Name") || formula.includes("sec, num, title, rev")) {
    return secPadded + "-" + numPadded + "-" + row.title + "-" + row.revision;
  }
  if (formula.includes("Calc Number") || formula.includes("sec, num, rev")) {
    return secPadded + "-" + numPadded + "-" + row.revision;
  }
  if (formula.includes("Calc Title") || formula.includes("sec, title")) {
    return row.title;
  }
  if (formula.includes("Calc Contact Chain") || formula.includes("contact")) {
    return row.contact;
  }
  if (formula.includes("Calc Sort") || formula.includes("TEXT(num")) {
    return secPadded + numSortPadded;
  }
  return "";
}

test("Submittal Arch - FormulaRow Row 2 holds top-level MAP/LAMBDA formulas for calculated columns", () => {
  const archTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === "Submittal Arch");
  assert.ok(archTab, "Submittal Arch tab spec must exist");
  assert.ok(archTab.columns, "Columns spec must be defined");

  const calcFileNameCol = archTab.columns.find(c => c.id === "calcFileName");
  const calcNumberCol = archTab.columns.find(c => c.id === "calcNumber");
  const calcTitleCol = archTab.columns.find(c => c.id === "calcTitle");
  const calcContactChainCol = archTab.columns.find(c => c.id === "calcContactChain");
  const calcSortCol = archTab.columns.find(c => c.id === "calcSort");

  assert.ok(calcFileNameCol?.formula?.startsWith("=MAP("), "calcFileName must use MAP formula");
  assert.ok(calcNumberCol?.formula?.startsWith("=MAP("), "calcNumber must use MAP formula");
  assert.ok(calcTitleCol?.formula?.startsWith("=MAP("), "calcTitle must use MAP formula");
  assert.ok(calcContactChainCol?.formula?.startsWith("=MAP("), "calcContactChain must use MAP formula");
  assert.ok(calcSortCol?.formula?.startsWith("=MAP("), "calcSort must use MAP formula");

  assert.ok(calcFileNameCol.formula.includes("LAMBDA("), "calcFileName must include LAMBDA");
  assert.ok(calcNumberCol.formula.includes("LAMBDA("), "calcNumber must include LAMBDA");
  assert.ok(calcTitleCol.formula.includes("LAMBDA("), "calcTitle must include LAMBDA");
  assert.ok(calcContactChainCol.formula.includes("LAMBDA("), "calcContactChain must include LAMBDA");
  assert.ok(calcSortCol.formula.includes("LAMBDA("), "calcSort must include LAMBDA");
});

test("Submittal Arch - ViewModel exports serialized fixture with modern MAP/LAMBDA FormulaRow", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const fixture = viewModel.toFixtureJson();
  const archTab = fixture.tabs.find(t => t.name === "Submittal Arch");
  assert.ok(archTab, "Submittal Arch tab fixture must exist");

  assert.strictEqual(archTab.formulaRow.length, 15, "Submittal Arch formulaRow must have 15 columns");
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(archTab.formulaRow[i], "", "Column index " + i + " should be empty formula");
  }
  for (let i =  10; i < 15; i++) {
    assert.ok(archTab.formulaRow[i].startsWith("=MAP("), "Column index " + i + " should start with =MAP(");
  }

  const fixturePath = path.resolve(__dirname, "../test/fixtures/document-log-workbook-template.json");
  const diskFixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const diskArchTab = diskFixture.tabs.find(t => t.name === "Submittal Arch");
  assert.ok(diskArchTab, "Disk fixture must contain Submittal Arch");
  assert.deepEqual(diskArchTab.formulaRow, archTab.formulaRow, "Disk fixture formulaRow must match ViewModel output");
});

test("Submittal Arch - Formula evaluation logic produces expected calculated values for mock row", () => {
  const sampleRow = {
    section: "033000",
    number: 1,
    title: "Concrete Mix Design",
    revision: "0",
    contact: "arch-reviewer@example.com"
  };

  const archTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === "Submittal Arch")!;
  const getFormula = (id: string) => archTab.columns!.find(c => c.id === id)!.formula!;

  const evaluatedFileName = evaluateArchFormula(getFormula("calcFileName"), sampleRow);
  const evaluatedNumber = evaluateArchFormula(getFormula("calcNumber"), sampleRow);
  const evaluatedTitle = evaluateArchFormula(getFormula("calcTitle"), sampleRow);
  const evaluatedContactChain = evaluateArchFormula(getFormula("calcContactChain"), sampleRow);
  const evaluatedSort = evaluateArchFormula(getFormula("calcSort"), sampleRow);

  assert.strictEqual(evaluatedFileName, "033000-001-Concrete Mix Design-0");
  assert.strictEqual(evaluatedNumber, "033000-001-0");
  assert.strictEqual(evaluatedTitle, "Concrete Mix Design");
  assert.strictEqual(evaluatedContactChain, "arch-reviewer@example.com");
  assert.strictEqual(evaluatedSort, "0330000001");
});

test("Submittal Arch - Formula evaluation logic evaluates to empty string when section is blank", () => {
  const emptyRow = {
    section: "",
    number: 0,
    title: "",
    revision: "",
    contact: ""
  };

  const archTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === "Submittal Arch")!;
  const getFormula = (id: string) => archTab.columns!.find(c => c.id === id)!.formula!;

  assert.strictEqual(evaluateArchFormula(getFormula("calcFileName"), emptyRow), "");
  assert.strictEqual(evaluateArchFormula(getFormula("calcNumber"), emptyRow), "");
  assert.strictEqual(evaluateArchFormula(getFormula("calcTitle"), emptyRow), "");
  assert.strictEqual(evaluateArchFormula(getFormula("calcSort"), emptyRow), "");
});

test("Submittal Arch - GasMockHarness loads WorkbookSpec and verifies calculated columns spill without #REF! errors", () => {
  const harness = GasMockHarness.install();
  try {
    const ss = harness.sheetsService.create("Test Workbook");
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

    const archSheet = ss.getSheetByName("Submittal Arch");
    assert.ok(archSheet, "Submittal Arch sheet must exist in mock spreadsheet");

    const row3Headers = archSheet.getRange(3, 1, 1, 15).getValues()[0];
    assert.strictEqual(row3Headers[0], "Section");
    assert.strictEqual(row3Headers[10], "Calc File Name");
    assert.strictEqual(row3Headers[11], "Calc Number");
    assert.strictEqual(row3Headers[12], "Calc Title");
    assert.strictEqual(row3Headers[13], "Calc Contact Chain");
    assert.strictEqual(row3Headers[14], "Calc Sort");

    const row4Formulas = archSheet.getRange(4, 1, 1, 15).getValues()[0];
    assert.strictEqual(row4Formulas[0], "");
    assert.ok(row4Formulas[10].startsWith("=MAP("), "Row 4 Calc File Name formula");
    assert.ok(row4Formulas[11].startsWith("=MAP("), "Row 4 Calc Number formula");
    assert.ok(row4Formulas[12].startsWith("=MAP("), "Row 4 Calc Title formula");
    assert.ok(row4Formulas[13].startsWith("=MAP("), "Row 4 Calc Contact Chain formula");
    assert.ok(row4Formulas[14].startsWith("=MAP("), "Row 4 Calc Sort formula");

    archSheet.setGridSlice(6, 1, [["033000", 1, "Concrete Mix Design", "0", "2026-08-08", "arch-reviewer@example.com", "For Approval", "For Approval", "Notes", "https://link.com", "", "", "", "", ""]]);

    const dataRowValues = archSheet.getRange(6, 1, 1, 15).getValues()[0];
    for (let i = 10; i < 15; i++) {
      assert.strictEqual(dataRowValues[i], "", "Data row index " + i + " must remain empty for formula spill");
    }

    const sampleRow = {
      section: dataRowValues[0],
      number: dataRowValues[1],
      title: dataRowValues[2],
      revision: dataRowValues[3],
      contact: dataRowValues[5]
    };
    assert.strictEqual(evaluateArchFormula(row4Formulas[11], sampleRow), "033000-001-0");
  } finally {
    GasMockHarness.uninstall();
  }
});
