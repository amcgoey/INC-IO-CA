import test from 'node:test';
import assert from 'node:assert/strict';
import { GasMockHarness } from '../harness/GasMockHarness';
import { DOCUMENT_LOG_WORKBOOK_SPEC } from '../../src/core/config/DocumentLogWorkbookSpec';
import { SheetValidationAndProtectionAdapter } from '../../src/adapters/gas/SheetValidationAndProtectionAdapter';

test.afterEach(() => {
  GasMockHarness.uninstall();
});

test('SheetValidationAndProtectionAdapter.applyNumberFormats - applies number formats to data columns during workbook provisioning', () => {
  GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-numfmt-test');
  ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

  const adapter = new SheetValidationAndProtectionAdapter();
  adapter.applyNumberFormats(ss, DOCUMENT_LOG_WORKBOOK_SPEC);

  const archSheet = ss.getSheetByName('Submittal Arch');
  assert.ok(archSheet, 'Submittal Arch sheet must exist');

  // Column 2 is Section (id: section, numberFormat: 000000)
  assert.equal(archSheet.getRange('B6').getNumberFormat(), '000000', 'Submittal Arch Section (B6) format must be 000000');
  // Column 3 is Number (id: number, numberFormat: 000)
  assert.equal(archSheet.getRange('C6').getNumberFormat(), '000', 'Submittal Arch Number (C6) format must be 000');
  // Column 4 is Revision (id: revision, numberFormat: 0)
  assert.equal(archSheet.getRange('D6').getNumberFormat(), '0', 'Submittal Arch Revision (D6) format must be 0');
  // Column 6 is Date (id: date, numberFormat: yyMMdd)
  assert.equal(archSheet.getRange('F6').getNumberFormat(), 'yyMMdd', 'Submittal Arch Date (F6) format must be yyMMdd');

  const ffeSheet = ss.getSheetByName('Submittal FFE');
  assert.ok(ffeSheet, 'Submittal FFE sheet must exist');

  // Column 4 is Revision (id: revision, numberFormat: 0)
  assert.equal(ffeSheet.getRange('D6').getNumberFormat(), '0', 'Submittal FFE Revision (D6) format must be 0');
  // Column 7 is Date (id: date, numberFormat: yyMMdd)
  assert.equal(ffeSheet.getRange('G6').getNumberFormat(), 'yyMMdd', 'Submittal FFE Date (G6) format must be yyMMdd');
});
