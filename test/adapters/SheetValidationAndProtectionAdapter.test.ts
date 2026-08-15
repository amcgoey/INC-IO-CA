import { describe, it, expect, afterEach } from 'vitest';
import { GasMockHarness } from '../harness/GasMockHarness';

import { TEST_DOCUMENT_LOG_WORKBOOK_SPEC, TEST_DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from '../fixtures/canonicalTestSpec';
const DOCUMENT_LOG_WORKBOOK_SPEC = TEST_DOCUMENT_LOG_WORKBOOK_SPEC;
const DOCUMENT_LOG_WORKBOOK_VIEW_SPEC = TEST_DOCUMENT_LOG_WORKBOOK_VIEW_SPEC;
import { SheetValidationAndProtectionAdapter } from '../../src/adapters/gas/SheetValidationAndProtectionAdapter';

describe('SheetValidationAndProtectionAdapter', () => {
  afterEach(() => {
    GasMockHarness.uninstall();
  });

  it('constructor - throws an error if workbookSpec or viewSpec is missing', () => {
    expect(() => {
      new (SheetValidationAndProtectionAdapter as any)();
    }).toThrow(/DocumentLogWorkbookSpec is required/);

    expect(() => {
      new (SheetValidationAndProtectionAdapter as any)(DOCUMENT_LOG_WORKBOOK_SPEC, undefined);
    }).toThrow(/DocumentLogWorkbookViewSpec is required/);
  });

  it('constructor - accepts explicit SpreadsheetApp injection via options or direct parameter', () => {
    const mockApp = {
      newDataValidation: () => ({
        requireValueInRange: () => {},
        setAllowInvalid: () => {},
        setHelpText: () => {},
        build: () => ({ type: 'MOCK_VALIDATION' })
      })
    };

    const adapterWithOptions = new SheetValidationAndProtectionAdapter(
      DOCUMENT_LOG_WORKBOOK_SPEC,
      DOCUMENT_LOG_WORKBOOK_VIEW_SPEC,
      { spreadsheetApp: mockApp as any }
    );
    expect(adapterWithOptions).toBeInstanceOf(SheetValidationAndProtectionAdapter);

    const adapterWithDirectApp = new SheetValidationAndProtectionAdapter(
      DOCUMENT_LOG_WORKBOOK_SPEC,
      DOCUMENT_LOG_WORKBOOK_VIEW_SPEC,
      mockApp as any
    );
    expect(adapterWithDirectApp).toBeInstanceOf(SheetValidationAndProtectionAdapter);
  });

  it('applyNumberFormats - applies number formats to data columns during workbook provisioning', () => {
    GasMockHarness.install();
    const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-numfmt-test');
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

    const adapter = new SheetValidationAndProtectionAdapter(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
    adapter.applyNumberFormats(ss);

    const archSheet = ss.getSheetByName('Submittal Arch');
    expect(archSheet).toBeTruthy();

    // Column 2 is Section (id: section, numberFormat: 000000)
    expect(archSheet.getRange('B6').getNumberFormat()).toBe('000000');
    // Column 3 is Number (id: number, numberFormat: 000)
    expect(archSheet.getRange('C6').getNumberFormat()).toBe('000');
    // Column 4 is Revision (id: revision, numberFormat: 0)
    expect(archSheet.getRange('D6').getNumberFormat()).toBe('0');
    // Column 6 is Date (id: date, numberFormat: yyMMdd)
    expect(archSheet.getRange('F6').getNumberFormat()).toBe('yyMMdd');

    const ffeSheet = ss.getSheetByName('Submittal FFE');
    expect(ffeSheet).toBeTruthy();

    // Column 4 is Revision (id: revision, numberFormat: 0)
    expect(ffeSheet.getRange('D6').getNumberFormat()).toBe('0');
    // Column 7 is Date (id: date, numberFormat: yyMMdd)
    expect(ffeSheet.getRange('G6').getNumberFormat()).toBe('yyMMdd');
  });

  it('applyValidationRules - compiles and applies strict DataValidation rules linked to single-column Named Ranges', () => {
    GasMockHarness.install();
    const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-valrules-test');
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

    const adapter = new SheetValidationAndProtectionAdapter(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
    adapter.applyValidationRules(ss);

    const archSheet = ss.getSheetByName('Submittal Arch');
    expect(archSheet).toBeTruthy();

    // Status (Column 1 - A6) -> Statuses_Submittal_Labels
    const statusRule = archSheet.getRange('A6').getDataValidation();
    expect(statusRule).toBeTruthy();
    expect(statusRule.getCriteriaType()).toBe('VALUE_IN_RANGE');
    expect(statusRule.getAllowInvalid()).toBe(false);
    const statusTargetRange = statusRule.getCriteriaValues()[0];
    expect(statusTargetRange).toBeTruthy();

    // Contact (Column 7 - G6) -> Shared_Contacts_Arch_Keys
    const contactRule = archSheet.getRange('G6').getDataValidation();
    expect(contactRule).toBeTruthy();
    expect(contactRule.getCriteriaType()).toBe('VALUE_IN_RANGE');
    expect(contactRule.getAllowInvalid()).toBe(false);

    // Action (Column 8 - H6) -> Actions_Submittal_Labels
    const actionRule = archSheet.getRange('H6').getDataValidation();
    expect(actionRule).toBeTruthy();
    expect(actionRule.getCriteriaType()).toBe('VALUE_IN_RANGE');
    expect(actionRule.getAllowInvalid()).toBe(false);

    const ffeSheet = ss.getSheetByName('Submittal FFE');
    expect(ffeSheet).toBeTruthy();

    // Vendor (Column 6 - F6) -> Vendors_Keys
    const vendorRule = ffeSheet.getRange('F6').getDataValidation();
    expect(vendorRule).toBeTruthy();
    expect(vendorRule.getCriteriaType()).toBe('VALUE_IN_RANGE');
    expect(vendorRule.getAllowInvalid()).toBe(false);

    // Spec Tag (Column 2 - B6) -> SpecTags_Keys
    const specTagRule = ffeSheet.getRange('B6').getDataValidation();
    expect(specTagRule).toBeTruthy();
    expect(specTagRule.getCriteriaType()).toBe('VALUE_IN_RANGE');
    expect(specTagRule.getAllowInvalid()).toBe(false);
  });

  it('applyValidationRules - throws error when target Named Range is missing from spreadsheet', () => {
    GasMockHarness.install();
    const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-missing-nr-test');
    ss.insertSheet('Submittal Arch');

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

    const adapter = new SheetValidationAndProtectionAdapter(customSpec, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
    expect(() => {
      adapter.applyValidationRules(ss);
    }).toThrow(/Target Named Range 'MISSING_NAMED_RANGE' for validation rule on column 'status' could not be found/);
  });

  it('applyRangeProtections - configures soft warning protections across all 3 tiers with warningOnly: true while leaving data entry cells unprotected', () => {
    GasMockHarness.install();
    const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-protection-test');
    ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

    const adapter = new SheetValidationAndProtectionAdapter(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
    adapter.applyRangeProtections(ss);

    // 1. Tier 1: System Tab Protection (_Config, _AuditLog)
    const configSheet = ss.getSheetByName('_Config');
    expect(configSheet).toBeTruthy();
    const configProtections = configSheet.getProtections('SHEET');
    expect(configProtections.length).toBeGreaterThanOrEqual(1);
    expect(configProtections[0].isWarningOnly()).toBe(true);
    expect(configProtections[0].getDescription()).toContain('SYSTEM_TAB_PROTECTION');

    const auditLogSheet = ss.getSheetByName('_AuditLog');
    expect(auditLogSheet).toBeTruthy();
    const auditProtections = auditLogSheet.getProtections('SHEET');
    expect(auditProtections.length).toBeGreaterThanOrEqual(1);
    expect(auditProtections[0].isWarningOnly()).toBe(true);

    // 2. Tier 2: Header Stack & Formula Protection (LOCK_HEADERS_<TabName>)
    const archSheet = ss.getSheetByName('Submittal Arch');
    expect(archSheet).toBeTruthy();
    const archProtections = archSheet.getProtections('RANGE');

    const headerProtection = archProtections.find((p: { getDescription(): string; isWarningOnly(): boolean; getRange(): any }) => p.getDescription() === 'LOCK_HEADERS_Submittal Arch');
    expect(headerProtection).toBeTruthy();
    expect(headerProtection.isWarningOnly()).toBe(true);
    const headerRange = headerProtection.getRange();
    expect(headerRange.getValues().length).toBe(5);

    // 3. Tier 3: Calculated Column Protection (calcFileName, calcNumber, calcTitle, calcContactChain, calcSort)
    const calcCols = ['calcFileName', 'calcNumber', 'calcTitle', 'calcContactChain', 'calcSort'];
    for (const colId of calcCols) {
      const calcProtection = archProtections.find((p: { getDescription(): string; isWarningOnly(): boolean; getRange(): any }) => p.getDescription() === `PROTECT_CALC_Submittal Arch_${colId}`);
      expect(calcProtection).toBeTruthy();
      expect(calcProtection.isWarningOnly()).toBe(true);
    }

    // 4. Data Entry Cells Unprotected
    expect(archProtections.length).toBe(6);
  });

  it('applyValidationRules - dynamically slices primary key column from full-table multi-column Named Ranges via .offset()', () => {
    GasMockHarness.install();
    const ss = (globalThis as any).SpreadsheetApp.openById('ss-adapter-multi-col-nr-test');

    const customSpec: any = {
      tabs: [
        {
          name: 'Submittal FFE',
          isLogTab: true,
          rowCount: 25,
          columnCount: 10,
          columns: [
            {
              id: 'vendor',
              header: 'Vendor',
              validationRule: {
                type: 'LIST_FROM_RANGE',
                targetNamedRange: 'Vendors',
                allowInvalid: false,
                helpText: 'Select a valid vendor'
              }
            },
            {
              id: 'contact',
              header: 'Contact',
              validationRule: {
                type: 'LIST_FROM_RANGE',
                targetNamedRange: 'Contacts_Arch',
                allowInvalid: false
              }
            }
          ]
        },
        {
          name: 'Submittal FFE Support',
          isSupportTab: true,
          rowCount: 50,
          columnCount: 10,
          seedRows: [
            ['code', 'name'],
            ['HERMAN_MILLER', 'Herman Miller'],
            ['STEELCASE', 'Steelcase']
          ]
        },
        {
          name: 'Submittal Arch Support',
          isSupportTab: true,
          rowCount: 20,
          columnCount: 10,
          seedRows: [
            ['code', 'name', 'email'],
            ['ARCH', 'Architect', 'arch@example.com'],
            ['GC', 'General Contractor', 'gc@example.com']
          ]
        }
      ],
      namedRanges: [
        { name: 'Vendors', tabName: 'Submittal FFE Support', rangeNotation: 'A2:B50', scope: 'Workbook' },
        { name: 'Contacts_Arch', tabName: 'Submittal Arch Support', rangeNotation: 'A2:C20', scope: 'Workbook' }
      ]
    };

    ss.loadWorkbookSpec(customSpec);

    const adapter = new SheetValidationAndProtectionAdapter(customSpec, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
    adapter.applyValidationRules(ss);

    const ffeSheet = ss.getSheetByName('Submittal FFE');
    expect(ffeSheet).toBeTruthy();

    const vendorRule = ffeSheet.getRange('A6').getDataValidation();
    expect(vendorRule).toBeTruthy();
    expect(vendorRule.getCriteriaType()).toBe('VALUE_IN_RANGE');
    expect(vendorRule.getAllowInvalid()).toBe(false);
    expect(vendorRule.getHelpText()).toBe('Select a valid vendor');
    const vendorTargetRange = vendorRule.getCriteriaValues()[0];
    expect(vendorTargetRange).toBeTruthy();
    expect(vendorTargetRange.getNumColumns()).toBe(1);
    expect(vendorTargetRange.getNumRows()).toBe(49);
    expect(vendorTargetRange.getA1Notation()).toBe('A2:A50');

    const contactRule = ffeSheet.getRange('B6').getDataValidation();
    expect(contactRule).toBeTruthy();
    expect(contactRule.getCriteriaType()).toBe('VALUE_IN_RANGE');
    const contactTargetRange = contactRule.getCriteriaValues()[0];
    expect(contactTargetRange).toBeTruthy();
    expect(contactTargetRange.getNumColumns()).toBe(1);
    expect(contactTargetRange.getNumRows()).toBe(19);
    expect(contactTargetRange.getA1Notation()).toBe('A2:A20');
  });
});