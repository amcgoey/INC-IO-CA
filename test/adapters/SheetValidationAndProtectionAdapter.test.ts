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


test('SheetValidationAndProtectionAdapter.applyValidationRules - compiles and applies strict DataValidation rules linked to single-column Named Ranges', () => {
  GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-valrules-test');
  ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

  const adapter = new SheetValidationAndProtectionAdapter();
  adapter.applyValidationRules(ss, DOCUMENT_LOG_WORKBOOK_SPEC);

  const archSheet = ss.getSheetByName('Submittal Arch');
  assert.ok(archSheet, 'Submittal Arch sheet must exist');

  // Status (Column 1 - A6) -> Statuses_Submittal_Labels
  const statusRule = archSheet.getRange('A6').getDataValidation();
  assert.ok(statusRule, 'Status column (A6) must have DataValidation rule');
  assert.equal(statusRule.getCriteriaType(), 'VALUE_IN_RANGE');
  assert.equal(statusRule.getAllowInvalid(), false);
  const statusTargetRange = statusRule.getCriteriaValues()[0];
  assert.ok(statusTargetRange, 'Status validation target range must exist');

  // Contact (Column 7 - G6) -> Shared_Contacts_Arch_Keys
  const contactRule = archSheet.getRange('G6').getDataValidation();
  assert.ok(contactRule, 'Contact column (G6) must have DataValidation rule');
  assert.equal(contactRule.getCriteriaType(), 'VALUE_IN_RANGE');
  assert.equal(contactRule.getAllowInvalid(), false);

  // Action (Column 8 - H6) -> Actions_Submittal_Labels
  const actionRule = archSheet.getRange('H6').getDataValidation();
  assert.ok(actionRule, 'Action column (H6) must have DataValidation rule');
  assert.equal(actionRule.getCriteriaType(), 'VALUE_IN_RANGE');
  assert.equal(actionRule.getAllowInvalid(), false);

  const ffeSheet = ss.getSheetByName('Submittal FFE');
  assert.ok(ffeSheet, 'Submittal FFE sheet must exist');

  // Vendor (Column 6 - F6) -> Vendors_Keys
  const vendorRule = ffeSheet.getRange('F6').getDataValidation();
  assert.ok(vendorRule, 'Vendor column (F6) must have DataValidation rule');
  assert.equal(vendorRule.getCriteriaType(), 'VALUE_IN_RANGE');
  assert.equal(vendorRule.getAllowInvalid(), false);

  // Spec Tag (Column 2 - B6) -> SpecTags_Keys
  const specTagRule = ffeSheet.getRange('B6').getDataValidation();
  assert.ok(specTagRule, 'Spec Tag column (B6) must have DataValidation rule');
  assert.equal(specTagRule.getCriteriaType(), 'VALUE_IN_RANGE');
  assert.equal(specTagRule.getAllowInvalid(), false);
});


test('SheetValidationAndProtectionAdapter.applyValidationRules - throws error when target Named Range is missing from spreadsheet', () => {
  GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-missing-nr-test');
  ss.insertSheet('Submittal Arch');
  
  // Create minimal spec with a missing target named range
  const customSpec: any = {
    tabs: [
      {
        name: 'Submittal Arch',
        isLogTab: true,
        rowCount: 25,
        columnCount: 10,
        columns: [
          {
            id: 'status',
            header: 'Status',
            validationRule: {
              type: 'LIST_FROM_RANGE',
              targetNamedRange: 'MISSING_NAMED_RANGE',
              allowInvalid: false
            }
          }
        ]
      }
    ]
  };

  const adapter = new SheetValidationAndProtectionAdapter();
  assert.throws(() => {
    adapter.applyValidationRules(ss, customSpec);
  }, /Target Named Range 'MISSING_NAMED_RANGE' for validation rule on column 'status' could not be found/);
});

test('SheetValidationAndProtectionAdapter.applyRangeProtections - configures soft warning protections across all 3 tiers with warningOnly: true while leaving data entry cells unprotected', () => {
  GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-protection-test');
  ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

  const adapter = new SheetValidationAndProtectionAdapter();
  adapter.applyRangeProtections(ss, DOCUMENT_LOG_WORKBOOK_SPEC);

  // 1. Tier 1: System Tab Protection (_Config, _AuditLog)
  const configSheet = ss.getSheetByName('_Config');
  assert.ok(configSheet, '_Config sheet must exist');
  const configProtections = configSheet.getProtections('SHEET');
  assert.ok(configProtections.length >= 1, '_Config must have sheet-level protection');
  assert.equal(configProtections[0].isWarningOnly(), true, '_Config protection must have warningOnly: true');
  assert.ok(configProtections[0].getDescription().includes('SYSTEM_TAB_PROTECTION'), '_Config description must reflect SYSTEM_TAB_PROTECTION');

  const auditLogSheet = ss.getSheetByName('_AuditLog');
  assert.ok(auditLogSheet, '_AuditLog sheet must exist');
  const auditProtections = auditLogSheet.getProtections('SHEET');
  assert.ok(auditProtections.length >= 1, '_AuditLog must have sheet-level protection');
  assert.equal(auditProtections[0].isWarningOnly(), true, '_AuditLog protection must have warningOnly: true');

  // 2. Tier 2: Header Stack & Formula Protection (LOCK_HEADERS_<TabName>)
  const archSheet = ss.getSheetByName('Submittal Arch');
  assert.ok(archSheet, 'Submittal Arch sheet must exist');
  const archProtections = archSheet.getProtections('RANGE');
  
  const headerProtection = archProtections.find((p: any) => p.getDescription() === 'LOCK_HEADERS_Submittal Arch');
  assert.ok(headerProtection, 'Submittal Arch must have LOCK_HEADERS_Submittal Arch range protection');
  assert.equal(headerProtection.isWarningOnly(), true, 'Header protection must have warningOnly: true');
  const headerRange = headerProtection.getRange();
  assert.equal(headerRange.getValues().length, 5, 'Header protection range must cover rows 1 through 5');

  // 3. Tier 3: Calculated Column Protection (calcFileName, calcNumber, calcTitle, calcContactChain, calcSort)
  const calcCols = ['calcFileName', 'calcNumber', 'calcTitle', 'calcContactChain', 'calcSort'];
  for (const colId of calcCols) {
    const calcProtection = archProtections.find((p: any) => p.getDescription() === `PROTECT_CALC_Submittal Arch_${colId}`);
    assert.ok(calcProtection, `Submittal Arch must have calculated column protection for ${colId}`);
    assert.equal(calcProtection.isWarningOnly(), true, `Calculated column protection for ${colId} must have warningOnly: true`);
  }

  // 4. Data Entry Cells Unprotected
  // Total range protections on Submittal Arch = 1 (Header Stack) + 5 (Calculated Columns) = 6
  assert.equal(archProtections.length, 6, 'Submittal Arch must have exactly 6 range protections');
});
