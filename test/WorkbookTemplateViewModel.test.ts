import test from "node:test";
import assert from "node:assert";
import {
  DOCUMENT_LOG_WORKBOOK_SPEC,
  TabSpec,
  NamedRangeSpec
} from "../src/core/config/DocumentLogWorkbookSpec";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC, ThemeColors, StatusColors } from "../src/core/config/DocumentLogWorkbookViewSpec";
import { WorkbookTemplateViewModel, indexToColLetter } from "../src/core/config/WorkbookTemplateViewModel";

interface RepeatCellReq {
  repeatCell?: {
    range?: {
      sheetId?: number;
      startRowIndex?: number;
      endRowIndex?: number;
      startColumnIndex?: number;
      endColumnIndex?: number;
    };
    cell?: {
      userEnteredFormat?: {
        backgroundColor?: { red: number; green: number; blue: number };
        textFormat?: { foregroundColor?: { red: number; green: number; blue: number }; bold?: boolean; italic?: boolean; fontSize?: number; fontFamily?: string };
      };
    };
  };
}

test("DOCUMENT_LOG_WORKBOOK_SPEC defines Submittal FFE log tab (1000x26) with 16 columns", () => {
  const ffeTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: TabSpec) => t.name === "Submittal FFE");
  assert.ok(ffeTab, "Submittal FFE log tab must be defined in tabs");
  assert.strictEqual(ffeTab.rowCount, 8, "Submittal FFE rowCount should be 8");
  assert.strictEqual(ffeTab.columnCount, 26, "Submittal FFE columnCount should be 26");
  assert.strictEqual(ffeTab.isLogTab, true, "Submittal FFE isLogTab should be true");

  assert.ok(ffeTab.columns, "Submittal FFE columns must be defined");
  assert.strictEqual(ffeTab.columns.length, 16, "Submittal FFE should have 16 columns");

  const expectedHeaders = [
    { id: "status", header: "Status" },
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
  assert.strictEqual(sheetHeaders.rangeNotation, "A3:P4");
  assert.strictEqual(sheetHeaders.scope, "Sheet");

  const sheetFormula = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "FormulaRow" && nr.tabName === "Submittal FFE"
  );
  assert.ok(sheetFormula, "Sheet-scoped FormulaRow named range must exist for Submittal FFE");
  assert.strictEqual(sheetFormula.rangeNotation, "A4:P4");
  assert.strictEqual(sheetFormula.scope, "Sheet");

  const sheetData = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Data" && nr.tabName === "Submittal FFE"
  );
  assert.ok(sheetData, "Sheet-scoped Data named range must exist for Submittal FFE");
  assert.strictEqual(sheetData.rangeNotation, "A6:P8");
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
  assert.strictEqual(wbHeaders.rangeNotation, "A3:P4");
  assert.strictEqual(wbHeaders.scope, "Workbook");

  const wbFormula = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Submittal_FFE_FormulaRow"
  );
  assert.ok(wbFormula, "Workbook-scoped Submittal_FFE_FormulaRow named range must exist");
  assert.strictEqual(wbFormula.tabName, "Submittal FFE");
  assert.strictEqual(wbFormula.rangeNotation, "A4:P4");
  assert.strictEqual(wbFormula.scope, "Workbook");

  const wbData = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "Submittal_FFE_Data"
  );
  assert.ok(wbData, "Workbook-scoped Submittal_FFE_Data named range must exist");
  assert.strictEqual(wbData.tabName, "Submittal FFE");
  assert.strictEqual(wbData.rangeNotation, "A6:P8");
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
  assert.strictEqual(ffeTab.rowCount, 8);
  assert.strictEqual(ffeTab.columnCount, 26);
  assert.strictEqual(ffeTab.isLogTab, true);
  assert.strictEqual(ffeTab.headers.length, 16);
  assert.strictEqual(ffeTab.headers[0], "Status");
  assert.strictEqual(ffeTab.headers[15], "Calc Sort");

  const headersNR = fixtureJson.namedRanges.find((nr: any) => nr.name === "Submittal_FFE_Headers");
  assert.ok(headersNR, "Fixture JSON must contain Submittal_FFE_Headers named range");
  assert.strictEqual(headersNR.rangeNotation, "A3:P4");
});

test("DOCUMENT_LOG_WORKBOOK_SPEC defines Submittal FFE Support tab with Vendor and SpecTag seed rows and sheet-scoped named ranges", () => {
  const supportTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: TabSpec) => t.name === "Submittal FFE Support");
  assert.ok(supportTab, "Submittal FFE Support tab must exist");
  assert.strictEqual(supportTab.isSupportTab, true, "isSupportTab should be true");
  assert.strictEqual(supportTab.rowCount, 3);
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
  assert.strictEqual(vendorsNR.rangeNotation, "A2:B3");
  assert.strictEqual(vendorsNR.scope, "Sheet");

  const specTagsNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find(
    (nr: NamedRangeSpec) => nr.name === "SpecTags" && nr.tabName === "Submittal FFE Support"
  );
  assert.ok(specTagsNR, "SpecTags named range must exist on Submittal FFE Support");
  assert.strictEqual(specTagsNR.rangeNotation, "C2:D3");
  assert.strictEqual(specTagsNR.scope, "Sheet");
});

test("DOCUMENT_LOG_WORKBOOK_SPEC defines MAP/LAMBDA formulas in Submittal FFE including calcTitle tag VLOOKUP", () => {
  const ffeTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: TabSpec) => t.name === "Submittal FFE");
  assert.ok(ffeTab, "Submittal FFE tab must exist");
  assert.ok(ffeTab.columns, "columns must exist");

  const calcTitleCol = ffeTab.columns.find((c) => c.id === "calcTitle");
  assert.ok(calcTitleCol, "calcTitle column must exist");
  assert.ok(calcTitleCol.formula, "calcTitle formula must be defined");
  assert.ok(calcTitleCol.formula.includes("MAP(B6:B, E6:E, LAMBDA("), "calcTitle formula must be a MAP/LAMBDA expression");
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
  assert.strictEqual(ffeTab.formulaRow.length, 16);

  const calcTitleIdx = ffeTab.headers.indexOf("Calc Title");
  assert.ok(calcTitleIdx >= 0, "Calc Title header must exist in fixture headers");
  const calcTitleFormula = ffeTab.formulaRow[calcTitleIdx];
  assert.ok(calcTitleFormula, "calcTitle formula must be non-empty in formulaRow");
  assert.ok(calcTitleFormula.includes("VLOOKUP(tag, 'Submittal FFE Support'!SpecTags, 2, FALSE)"));
});

test("WorkbookTemplateViewModel generates setDataValidation batch update request for Spec Tag column referencing =SpecTags", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const payload = viewModel.toBatchUpdateRequestPayload();
  interface DataValidationRequest {
    setDataValidation?: {
      range?: { sheetId?: number };
      rule?: { condition?: { values?: Array<{ userEnteredValue?: string }> } };
    };
  }
  const validationReqs = (payload.requests as DataValidationRequest[]).filter(r => r.setDataValidation);
  assert.ok(validationReqs.length > 0, 'setDataValidation requests must be generated');
  const specTagValidation = validationReqs.find(r => r.setDataValidation?.rule?.condition?.values?.[0]?.userEnteredValue === '=SpecTags');
  assert.ok(specTagValidation, 'Data validation rule for =SpecTags must be included in batch requests');
  assert.ok(typeof specTagValidation?.setDataValidation?.range?.sheetId === 'number', 'Sheet ID should be assigned for Submittal FFE tab');
});

test("ThemeColors defines pale desaturated tokens and hexToRgb converter works", () => {
  assert.strictEqual(ThemeColors.PALE_GRAY_HEX, "#F1F3F4");
  assert.strictEqual(ThemeColors.PALE_BLUE_HEX, "#E8F0FE");
  assert.strictEqual(ThemeColors.PALE_GREEN_HEX, "#E6F4EA");
  assert.strictEqual(ThemeColors.PALE_RED_HEX, "#FCE8E6");

  assert.ok(ThemeColors.PALE_GRAY_RGB, "PALE_GRAY_RGB must be defined");
  assert.ok(ThemeColors.PALE_BLUE_RGB, "PALE_BLUE_RGB must be defined");
  assert.ok(ThemeColors.PALE_GREEN_RGB, "PALE_GREEN_RGB must be defined");
  assert.ok(ThemeColors.PALE_RED_RGB, "PALE_RED_RGB must be defined");
});

test("DOCUMENT_LOG_WORKBOOK_VIEW_SPEC specifies namedRangeFills and settingHeaderRanges", () => {
  assert.ok(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills, "namedRangeFills must be defined");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.MANIFEST_SCHEMA_VERSION, ThemeColors.PALE_GRAY_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Config_Manifest, ThemeColors.PALE_GRAY_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Sections, ThemeColors.PALE_GRAY_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Submittal_Arch_Support_Sections, ThemeColors.PALE_GRAY_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Config_Submittal_Arch, ThemeColors.PALE_BLUE_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Config_Submittal_FFE, ThemeColors.PALE_BLUE_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Vendors, ThemeColors.PALE_BLUE_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Shared_Contacts_Arch, ThemeColors.PALE_GREEN_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Shared_Contacts_FFE, ThemeColors.PALE_GREEN_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.SpecTags, ThemeColors.PALE_GREEN_RGB);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.namedRangeFills.Actions_Submittal, ThemeColors.PALE_RED_RGB);

  assert.ok(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.settingHeaderRanges, "settingHeaderRanges must be defined");
  assert.deepStrictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.settingHeaderRanges._Config, ["A1:B1", "A5:D5"]);
  assert.deepStrictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.settingHeaderRanges._Shared, ["A1:C1", "E1:G1"]);
  assert.deepStrictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.settingHeaderRanges["Submittal Arch Support"], ["A1:B1"]);
  assert.deepStrictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.settingHeaderRanges["Submittal FFE Support"], ["A1:D1"]);
});

test("WorkbookTemplateViewModel toBatchUpdateRequestPayload emits repeatCell requests for setting headers with #666666 fill & white text AFTER named range fills", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const payload = viewModel.toBatchUpdateRequestPayload();

  const allRequests = payload.requests as RepeatCellReq[];

  // Find index of _Config pale fill request for Config_Manifest (sheetId 5, startRow 0, endRow 3)
  const manifestFillIdx = allRequests.findIndex(
    r => r.repeatCell?.range?.sheetId === 5 &&
         r.repeatCell?.range?.startRowIndex === 0 &&
         r.repeatCell?.range?.endRowIndex === 3 &&
         r.repeatCell?.cell?.userEnteredFormat?.backgroundColor &&
         !r.repeatCell?.cell?.userEnteredFormat?.textFormat
  );
  assert.ok(manifestFillIdx >= 0, "Config_Manifest pale fill request must exist");

  // Find index of _Config header request for A1:B1 (sheetId 5, startRow 0, endRow 1)
  const configHeader1Idx = allRequests.findIndex(
    r => r.repeatCell?.range?.sheetId === 5 &&
         r.repeatCell?.range?.startRowIndex === 0 &&
         r.repeatCell?.range?.endRowIndex === 1 &&
         r.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold === true
  );
  assert.ok(configHeader1Idx >= 0, "_Config A1:B1 repeatCell header request must exist");

  // CRITICAL ASSERTION: Header request MUST be emitted AFTER named range fill request so Dark Gray headers are never overwritten!
  assert.ok(
    configHeader1Idx > manifestFillIdx,
    `_Config A1:B1 header repeatCell request (index ${configHeader1Idx}) must be emitted AFTER Config_Manifest pale fill request (index ${manifestFillIdx})`
  );
  assert.deepStrictEqual(
    allRequests[configHeader1Idx]?.repeatCell?.cell?.userEnteredFormat?.backgroundColor,
    DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fillRgb
  );
});

test("WorkbookTemplateViewModel toBatchUpdateRequestPayload emits repeatCell requests for settings named ranges with pale fills without duplicate requests", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const payload = viewModel.toBatchUpdateRequestPayload();

  const repeatCells = (payload.requests as RepeatCellReq[]).filter(
    r => r.repeatCell && r.repeatCell.cell?.userEnteredFormat?.backgroundColor && !r.repeatCell.cell?.userEnteredFormat?.textFormat
  );

  // MANIFEST_SCHEMA_VERSION: _Config (sheetId 5), B2 -> row 1 (indices 1..2), col 1 (indices 1..2), pale gray
  const schemaVersionReq = repeatCells.find(
    r => r.repeatCell?.range?.sheetId === 5 &&
         r.repeatCell?.range?.startRowIndex === 1 &&
         r.repeatCell?.range?.endRowIndex === 2 &&
         r.repeatCell?.range?.startColumnIndex === 1 &&
         r.repeatCell?.range?.endColumnIndex === 2
  );
  assert.ok(schemaVersionReq, "MANIFEST_SCHEMA_VERSION pale gray fill repeatCell request must exist with exact single-cell boundaries");
  assert.deepStrictEqual(schemaVersionReq?.repeatCell?.cell?.userEnteredFormat?.backgroundColor, ThemeColors.PALE_GRAY_RGB);

  // Actions_Submittal: _Shared (sheetId 4), E2:G6 -> row 1..6, col 4..7, pale red
  const actionsReq = repeatCells.find(
    r => r.repeatCell?.range?.sheetId === 4 &&
         r.repeatCell?.range?.startRowIndex === 1 &&
         r.repeatCell?.range?.endRowIndex === 6 &&
         r.repeatCell?.range?.startColumnIndex === 4 &&
         r.repeatCell?.range?.endColumnIndex === 7
  );
  assert.ok(actionsReq, "Actions_Submittal pale red fill repeatCell request must exist with exact range boundaries");
  assert.deepStrictEqual(actionsReq?.repeatCell?.cell?.userEnteredFormat?.backgroundColor, ThemeColors.PALE_RED_RGB);

  // Verify no duplicate fill requests for dual-scoped range Sections / Submittal_Arch_Support_Sections (sheetId 2, A2:B3)
  const sectionsReqs = repeatCells.filter(
    r => r.repeatCell?.range?.sheetId === 2 &&
         r.repeatCell?.range?.startRowIndex === 1 &&
         r.repeatCell?.range?.endRowIndex === 3 &&
         r.repeatCell?.range?.startColumnIndex === 0 &&
         r.repeatCell?.range?.endColumnIndex === 2
  );
  assert.strictEqual(sectionsReqs.length, 1, "Exactly 1 repeatCell request must be emitted for dual-scoped Sections range");
});

test("Log data rows remain unstyled white #FFFFFF without background fill repeatCell requests", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const payload = viewModel.toBatchUpdateRequestPayload();

  // Check Submittal Arch (sheetId 0) and Submittal FFE (sheetId 1) data rows (Row 6+, startRowIndex >= 5)
  const logDataFills = (payload.requests as RepeatCellReq[]).filter(
    r => r.repeatCell &&
         (r.repeatCell.range?.sheetId === 0 || r.repeatCell.range?.sheetId === 1) &&
         r.repeatCell && r.repeatCell.range && r.repeatCell.range.startRowIndex >= 5 && r.repeatCell.range.startRowIndex < 7 && (r.repeatCall.range?.startRowIndex ?? 0) < 7
  );

  assert.strictEqual(logDataFills.length, 0, "No repeatCell fill requests must be emitted for log data rows");
});


test("StatusColors defines hex and RGB tokens for Open, Closed, Waiting, Manager, and Billed", () => {
  assert.ok(StatusColors, "StatusColors must be exported");
  assert.strictEqual(StatusColors.Open.hex, "#F4CCCC");
  assert.strictEqual(StatusColors.Closed.hex, "#D9D9D9");
  assert.strictEqual(StatusColors.Waiting.hex, "#D9D2E9");
  assert.strictEqual(StatusColors.Manager.hex, "#D0E0E3");
  assert.strictEqual(StatusColors.Billed.hex, "#D9D9D9");

  assert.ok(StatusColors.Open.rgb);
  assert.ok(StatusColors.Closed.rgb);
  assert.ok(StatusColors.Waiting.rgb);
  assert.ok(StatusColors.Manager.rgb);
  assert.ok(StatusColors.Billed.rgb);
});

test("WorkbookTemplateViewModel setDataValidation specifies strict: false (Warning mode) and showCustomUi: true (Chip style)", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const payload = viewModel.toBatchUpdateRequestPayload();

  interface DataValidationReq {
    setDataValidation?: {
      rule?: {
        showCustomUi?: boolean;
        strict?: boolean;
      };
    };
  }

  const validationReqs = (payload.requests as DataValidationReq[]).filter(r => r.setDataValidation);
  assert.ok(validationReqs.length > 0, "setDataValidation requests must exist");

  validationReqs.forEach(req => {
    assert.strictEqual(req.setDataValidation?.rule?.strict, false, "Validation strictness must be false (Show Warning mode)");
    assert.strictEqual(req.setDataValidation?.rule?.showCustomUi, true, "Validation showCustomUi must be true (Chip display style)");
  });
});

test("WorkbookTemplateViewModel emits addConditionalFormatRule for status rules across content rows bounded by Top BufferRow and End BufferRow", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const payload = viewModel.toBatchUpdateRequestPayload();

  interface ConditionalFormatReq {
    addConditionalFormatRule?: {
      rule?: {
        ranges?: Array<{
          sheetId?: number;
          startRowIndex?: number;
          endRowIndex?: number;
          startColumnIndex?: number;
          endColumnIndex?: number;
        }>;
        booleanRule?: {
          condition?: {
            type?: string;
            values?: Array<{ userEnteredValue?: string }>;
          };
          format?: {
            backgroundColor?: { red: number; green: number; blue: number };
          };
        };
      };
      index?: number;
    };
  }

  const condReqs = (payload.requests as ConditionalFormatReq[]).filter(r => r.addConditionalFormatRule);
  assert.ok(condReqs.length >= 10, "Must emit at least 10 status conditional format rules (5 statuses x 2 log tabs)");

  // Check Submittal Arch (sheetId 0) Open status rule
  const archOpenRule = condReqs.find(
    r => r.addConditionalFormatRule?.rule?.ranges?.[0]?.sheetId === 0 &&
         r.addConditionalFormatRule?.rule?.booleanRule?.condition?.values?.[0]?.userEnteredValue === '=$A6="Open"'
  );
  assert.ok(archOpenRule, "Submittal Arch Open status conditional format rule must exist");
  assert.strictEqual(archOpenRule.addConditionalFormatRule?.rule?.ranges?.[0]?.startRowIndex, 5, "Content row start index must be 5 (Row 6)");
  assert.strictEqual(archOpenRule.addConditionalFormatRule?.rule?.ranges?.[0]?.endRowIndex, 7, "Content row end index must be 7 (Row 8 End BufferRow excluded)");
  assert.strictEqual(archOpenRule.addConditionalFormatRule?.rule?.booleanRule?.condition?.type, "CUSTOM_FORMULA");
  assert.deepStrictEqual(
    archOpenRule.addConditionalFormatRule?.rule?.booleanRule?.format?.backgroundColor,
    StatusColors.Open.rgb
  );

  // Check Submittal FFE (sheetId 1) Closed status rule
  const ffeClosedRule = condReqs.find(
    r => r.addConditionalFormatRule?.rule?.ranges?.[0]?.sheetId === 1 &&
         r.addConditionalFormatRule?.rule?.booleanRule?.condition?.values?.[0]?.userEnteredValue === '=$A6="Closed"'
  );
  assert.ok(ffeClosedRule, "Submittal FFE Closed status conditional format rule must exist");
  assert.deepStrictEqual(
    ffeClosedRule.addConditionalFormatRule?.rule?.booleanRule?.format?.backgroundColor,
    StatusColors.Closed.rgb
  );
});

test("indexToColLetter converts column indices to 1-based A1 notation column letters", () => {
  assert.strictEqual(indexToColLetter(0), "A");
  assert.strictEqual(indexToColLetter(1), "B");
  assert.strictEqual(indexToColLetter(25), "Z");
  assert.strictEqual(indexToColLetter(26), "AA");
  assert.strictEqual(indexToColLetter(27), "AB");
});


test("DOCUMENT_LOG_WORKBOOK_VIEW_SPEC specifies canonical typography tokens: Abril Fatface 27pt Title, Raleway Date/Headers/FormulaRow", () => {
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.titleRowStyle.fontFamily, "Abril Fatface");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.titleRowStyle.fontSize, 27);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.titleRowStyle.bold, true);

  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.dateRowStyle.fontFamily, "Raleway");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.dateRowStyle.fontSize, 10);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.dateRowStyle.italic, true);

  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fontFamily, "Raleway");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.fontSize, 11);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.headerStyle.bold, true);

  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.formulaRowStyle.fontFamily, "Raleway");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.formulaRowStyle.fontSize, 7);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.formulaRowStyle.italic, true);
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.formulaRowStyle.fontColorHex, "#B7B7B7");
  assert.deepStrictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.formulaRowStyle.fontColorRgb, { red: 0.7176, green: 0.7176, blue: 0.7176 });

  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_VIEW_SPEC.defaultFontFamily, "Raleway");
});


test("WorkbookTemplateViewModel toBatchUpdateRequestPayload emits exact textFormat font requests for Title, Date, Headers, and FormulaRow", () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const payload = viewModel.toBatchUpdateRequestPayload();

  const allRequests = payload.requests as RepeatCellReq[];

  const titleReq = allRequests.find(r => r.repeatCell?.range?.sheetId === 0 && r.repeatCell?.range?.startRowIndex === 0 && r.repeatCell?.range?.endRowIndex === 1 && r.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontFamily === "Abril Fatface");
  assert.ok(titleReq, "Submittal Arch Title Row repeatCell request must exist with Abril Fatface 27pt textFormat");
  assert.strictEqual(titleReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontSize, 27);
  assert.strictEqual(titleReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold, true);

  const dateReq = allRequests.find(r => r.repeatCell?.range?.sheetId === 0 && r.repeatCell?.range?.startRowIndex === 1 && r.repeatCell?.range?.endRowIndex === 2 && r.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontFamily === "Raleway");
  assert.ok(dateReq, "Submittal Arch Date Row repeatCell request must exist with Raleway 10pt textFormat");
  assert.strictEqual(dateReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontSize, 10);
  assert.strictEqual(dateReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.italic, true);

  const headerReq = allRequests.find(r => r.repeatCell?.range?.sheetId === 0 && r.repeatCell?.range?.startRowIndex === 2 && r.repeatCell?.range?.endRowIndex === 3 && r.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontFamily === "Raleway");
  assert.ok(headerReq, "Submittal Arch Header Row repeatCell request must exist with Raleway 11pt bold textFormat");
  assert.strictEqual(headerReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontSize, 11);
  assert.strictEqual(headerReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold, true);

  const formulaReq = allRequests.find(r => r.repeatCell?.range?.sheetId === 0 && r.repeatCell?.range?.startRowIndex === 3 && r.repeatCell?.range?.endRowIndex === 4 && r.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontFamily === "Raleway");
  assert.ok(formulaReq, "Submittal Arch FormulaRow repeatCell request must exist with Raleway 7pt #B7B7B7 textFormat");
  assert.strictEqual(formulaReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontSize, 7);
  assert.strictEqual(formulaReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.italic, true);
  assert.deepStrictEqual(formulaReq?.repeatCell?.cell?.userEnteredFormat?.textFormat?.foregroundColor, { red: 0.7176, green: 0.7176, blue: 0.7176 });
});
