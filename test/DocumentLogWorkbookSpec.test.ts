import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION } from '../src/core/config/DocumentLogWorkbookSpec';
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC, ThemeColors, VisualStyleSpec } from '../src/core/config/DocumentLogWorkbookViewSpec';
import { WorkbookTemplateViewModel } from '../src/core/config/WorkbookTemplateViewModel';

test('DocumentLogWorkbookSpec - defines Submittal Arch tab with 1000x26 layout', () => {
  const submittalArchTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === 'Submittal Arch');
  assert.ok(submittalArchTab, 'Submittal Arch tab must exist in spec');
  assert.equal(submittalArchTab.rowCount, 25, 'Submittal Arch rowCount must be 25');
  assert.equal(submittalArchTab.columnCount, 26, 'Submittal Arch columnCount must be 26');
  assert.equal(submittalArchTab.isLogTab, true, 'Submittal Arch must be marked as log tab');
});

test('DocumentLogWorkbookSpec - defines all 15 columns for Submittal Arch with formulas and validation rules', () => {
  const submittalArchTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === 'Submittal Arch');
  assert.ok(submittalArchTab?.columns, 'Columns must be defined for Submittal Arch');
  assert.equal(submittalArchTab.columns.length, 15, 'Submittal Arch must have 15 columns');

  const expectedColumns = [
    { id: 'status', header: 'Status', validationRange: 'Statuses_Submittal' },
    { id: 'section', header: 'Section' },
    { id: 'number', header: 'Number' },
    { id: 'revision', header: 'Revision' },
    { id: 'title', header: 'Title' },
    { id: 'date', header: 'Date' },
    { id: 'contact', header: 'Contact', validationRange: 'Shared_Contacts_Arch' },
    { id: 'action', header: 'Action', validationRange: 'Actions_Submittal' },
    { id: 'notes', header: 'Notes' },
    { id: 'link', header: 'Link' },
    { id: 'calcFileName', header: 'Calc File Name' },
    { id: 'calcNumber', header: 'Calc Number' },
    { id: 'calcTitle', header: 'Calc Title' },
    { id: 'calcContactChain', header: 'Calc Contact Chain' },
    { id: 'calcSort', header: 'Calc Sort' }
  ];

  expectedColumns.forEach((expected, idx) => {
    const col = submittalArchTab.columns![idx];
    assert.equal(col.id, expected.id, `Column ${idx} ID must be ${expected.id}`);
    assert.equal(col.header, expected.header, `Column ${idx} header must be ${expected.header}`);
    if (expected.validationRange) {
      assert.equal(col.validationRange, expected.validationRange, `Column ${idx} validationRange must be ${expected.validationRange}`);
    }
  });

  const calcFileNameCol = submittalArchTab.columns.find(c => c.id === 'calcFileName');
  assert.ok(calcFileNameCol?.formula?.includes('MAP('), 'calcFileName must contain MAP formula');
  assert.ok(calcFileNameCol?.formula?.includes('LAMBDA('), 'calcFileName must contain LAMBDA formula');

  const calcSortCol = submittalArchTab.columns.find(c => c.id === 'calcSort');
  assert.ok(calcSortCol?.formula?.includes('MAP('), 'calcSort must contain MAP formula');
});

test('DocumentLogWorkbookSpec - defines Sheet-Scoped and Workbook-Scoped Dual-Tier Named Ranges for Submittal Arch', () => {
  const namedRanges = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges;

  const headersSheet = namedRanges.find(r => r.name === 'Headers' && r.tabName === 'Submittal Arch');
  assert.ok(headersSheet, 'Sheet-Scoped Headers range must exist');
  assert.equal(headersSheet.rangeNotation, 'A3:O4', 'Sheet-Scoped Headers notation must be A3:O4');
  assert.equal(headersSheet.scope, 'Sheet', 'Headers scope must be Sheet');

  const formulaRowSheet = namedRanges.find(r => r.name === 'FormulaRow' && r.tabName === 'Submittal Arch');
  assert.ok(formulaRowSheet, 'Sheet-Scoped FormulaRow range must exist');
  assert.equal(formulaRowSheet.rangeNotation, 'A4:O4', 'Sheet-Scoped FormulaRow notation must be A4:O4');
  assert.equal(formulaRowSheet.scope, 'Sheet', 'FormulaRow scope must be Sheet');

  const dataSheet = namedRanges.find(r => r.name === 'Data' && r.tabName === 'Submittal Arch');
  assert.ok(dataSheet, 'Sheet-Scoped Data range must exist');
  assert.equal(dataSheet.rangeNotation, 'A6:O20', 'Sheet-Scoped Data notation must be A6:O20');
  assert.equal(dataSheet.scope, 'Sheet', 'Data scope must be Sheet');

  const headersWb = namedRanges.find(r => r.name === 'Submittal_Arch_Headers');
  assert.ok(headersWb, 'Workbook-Scoped Submittal_Arch_Headers range must exist');
  assert.equal(headersWb.rangeNotation, 'A3:O4', 'Submittal_Arch_Headers notation must be A3:O4');
  assert.equal(headersWb.scope, 'Workbook', 'Submittal_Arch_Headers scope must be Workbook');

  const formulaRowWb = namedRanges.find(r => r.name === 'Submittal_Arch_FormulaRow');
  assert.ok(formulaRowWb, 'Workbook-Scoped Submittal_Arch_FormulaRow range must exist');
  assert.equal(formulaRowWb.rangeNotation, 'A4:O4', 'Submittal_Arch_FormulaRow notation must be A4:O4');

  const dataWb = namedRanges.find(r => r.name === 'Submittal_Arch_Data');
  assert.ok(dataWb, 'Workbook-Scoped Submittal_Arch_Data range must exist');
  assert.equal(dataWb.rangeNotation, 'A6:O20', 'Submittal_Arch_Data notation must be A6:O20');
});

test('DocumentLogWorkbookViewSpec - tokenizes Dark Gray #666666 header fill and 3-row layout offset', () => {
  assert.equal(ThemeColors.HEADER_FILL_HEX, '#666666', 'Header fill color hex must be #666666');
  assert.deepEqual(ThemeColors.HEADER_FILL_RGB, { red: 0.4, green: 0.4, blue: 0.4 }, 'Header fill RGB must be 0.4');
  assert.equal(ThemeColors.HEADER_TEXT_HEX, '#FFFFFF', 'Header text font color must be #FFFFFF');
  
  assert.equal(VisualStyleSpec.offsets.HEADER_ROW_INDEX, 3, 'Header row index must be 3');
  assert.equal(VisualStyleSpec.offsets.FORMULA_ROW_INDEX, 4, 'Formula row index must be 4');
  assert.equal(VisualStyleSpec.offsets.BUFFER_ROW_INDEX, 5, 'Buffer row index must be 5');
  assert.equal(VisualStyleSpec.offsets.FIRST_DATA_ROW_INDEX, 6, 'First data row index must be 6');
  assert.equal(VisualStyleSpec.offsets.FIRST_DATA_ROW_OFFSET, 5, 'First data row offset must be 5');
});

test('WorkbookTemplateViewModel - binds model and view spec into fixture JSON and batch update payload', () => {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const fixture = viewModel.toFixtureJson();

  assert.equal(fixture.schemaVersion, DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION);
  const submittalArchFixtureTab = fixture.tabs.find(t => t.name === 'Submittal Arch');
  assert.ok(submittalArchFixtureTab);
  assert.equal(submittalArchFixtureTab.headers.length, 15);
  assert.equal(submittalArchFixtureTab.formulaRow.length, 15);
  assert.equal(submittalArchFixtureTab.headers[0], 'Status');
  assert.equal(submittalArchFixtureTab.headers[10], 'Calc File Name');

  const batchPayload = viewModel.toBatchUpdateRequestPayload();
  assert.ok(Array.isArray(batchPayload.requests), 'Batch payload requests must be an array');
  assert.ok(batchPayload.requests.length > 0, 'Batch payload should contain requests');
});
test('DocumentLogWorkbookSpec - defines Submittal Arch Support tab with single blank row', () => {
  const supportTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === 'Submittal Arch Support');
  assert.ok(supportTab, 'Submittal Arch Support tab must exist in spec');
  assert.equal(supportTab.rowCount, 2);
  assert.equal(supportTab.columnCount, 10);
  assert.equal(supportTab.isSupportTab, true);
  assert.ok(supportTab.seedRows, 'seedRows must be defined for Submittal Arch Support');
  assert.deepEqual(supportTab.seedRows[0], ['', '']);
});

test('DocumentLogWorkbookSpec - places _Shared, _Config, _AuditLog system tabs at the far right of workbook tab order', () => {
  const tabNames = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.map(t => t.name);
  const lastThreeTabs = tabNames.slice(-3);
  assert.deepEqual(lastThreeTabs, ['_Shared', '_Config', '_AuditLog'], 'System tabs must appear at the far right');
});

test('DocumentLogWorkbookSpec - defines Actions picklist schema in _Shared tab', () => {
  const sharedTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === '_Shared');
  assert.ok(sharedTab, '_Shared tab must exist');
  const headers = sharedTab.seedRows[0];
  assert.ok(headers.includes('Action Order'), 'Header must contain Action Order');
  assert.ok(headers.includes('Actions'), 'Header must contain Actions');
  assert.ok(headers.includes('Action Abbr.'), 'Header must contain Action Abbr.');
});

test('DocumentLogWorkbookSpec - defines Contacts picklist schema in _Shared tab', () => {
  const sharedTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === '_Shared');
  assert.ok(sharedTab, '_Shared tab must exist');
  assert.ok(sharedTab.seedRows, 'seedRows must be defined on _Shared tab');

  const headers = sharedTab.seedRows[0];
  assert.ok(headers.includes('Contacts_Arch Key'), 'Header must contain Contacts_Arch Key');
  assert.ok(headers.includes('Contacts_Arch Label'), 'Header must contain Contacts_Arch Label');
});

test('DocumentLogWorkbookSpec - all calculated column formulas in Submittal Arch and Submittal FFE have balanced parentheses and valid syntax', () => {
  const logTabs = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.filter(t => t.isLogTab && t.columns);
  assert.equal(logTabs.length, 2, 'There must be 2 log tabs (Submittal Arch and Submittal FFE)');

  let totalFormulas = 0;
  for (const tab of logTabs) {
    const calcCols = tab.columns.filter(c => c.formula);
    const expectedCount = tab.name === 'Submittal FFE' ? 6 : 5;
    assert.equal(calcCols.length, expectedCount, `${tab.name} must have ${expectedCount} calculated formula columns`);

    for (const col of calcCols) {
      totalFormulas++;
      const formula = col.formula;
      const openParens = (formula.match(/\(/g) || []).length;
      const closeParens = (formula.match(/\)/g) || []).length;

      assert.equal(
        openParens,
        closeParens,
        `Formula for ${tab.name} -> ${col.id} has mismatched parentheses (${openParens} open vs ${closeParens} close): "${formula}"`
      );

      assert.ok(
        !formula.includes('(('),
        `Formula for ${tab.name} -> ${col.id} contains unexpected double opening parenthesis "((": "${formula}"`
      );
    }
  }

  assert.equal(totalFormulas, 11, 'Total calculated formulas verified across log tabs must be 11');
});


test('DocumentLogWorkbookSpec - Submittal Arch and Submittal FFE MAP/LAMBDA formulas start input ranges at Row 4 (FormulaRow)', () => {
  const archTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === 'Submittal Arch');
  const ffeTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find(t => t.name === 'Submittal FFE');

  assert.ok(archTab?.columns, 'Submittal Arch columns must be defined');
  assert.ok(ffeTab?.columns, 'Submittal FFE columns must be defined');

  const verifyRow4Formulas = (tabName: string, columns: NonNullable<typeof archTab.columns>) => {
    columns.filter(c => c.formula).forEach(col => {
      assert.ok(!col.formula!.includes('6:'), `${tabName} column ${col.id} formula must not contain Row 6 range reference: ${col.formula}`);
      assert.ok(col.formula!.includes('4:'), `${tabName} column ${col.id} formula must reference Row 4 input range: ${col.formula}`);
    });
  };

  verifyRow4Formulas('Submittal Arch', archTab.columns);
  verifyRow4Formulas('Submittal FFE', ffeTab.columns);
});
