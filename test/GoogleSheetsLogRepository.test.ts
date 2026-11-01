import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GasMockHarness } from './harness/GasMockHarness';
import { GoogleSheetsLogRepository } from '../src/GoogleSheetsLogRepository';
import { DocumentLogWorkbookViewSpec } from '../src/core/config/DocumentLogWorkbookViewSpec';
import { PrefixCacheManager } from '../src/core/admin/PrefixCacheManager';
import { FakeCacheAdapter } from '../src/adapters/fakes/FakeCacheAdapter';

describe('GoogleSheetsLogRepository - updateDocumentLink', () => {
  beforeEach(() => {
    GasMockHarness.install();
  });

  afterEach(() => {
    GasMockHarness.uninstall();
  });

  it('updates link column at expected row when explicit viewSpec is provided', () => {
    const ssId = 'ss-test-log-repo';
    const ss = (globalThis as any).SpreadsheetApp.openById(ssId);
    const sheet = ss.insertSheet('Submittal Arch');

    // Row 3 (index 2) has a Link column at col 1 (index 0)
    // Row 5 (index 4) has the actual Link column at col 3 (index 2)
    sheet.getRange(1, 1, 6, 4).setValues([
      ['Title', '', '', ''],
      ['Formula', '', '', ''],
      ['Link', 'OldCol2', 'OldCol3', 'OldCol4'],
      ['', '', '', ''],
      ['Status', 'Number', 'Link', 'Date'],
      ['PENDING', '001', '', '2026-01-01']
    ]);

    const customViewSpec: DocumentLogWorkbookViewSpec = {
      defaultFontFamily: 'Raleway',
      defaultFontSize: 10,
      titleStyle: {
        fontFamily: 'Raleway',
        fontSize: 16,
        bold: true,
        fontColor: { red: 0, green: 0, blue: 0 },
        fillColor: { red: 1, green: 1, blue: 1 }
      },
      headerStyle: {
        fontFamily: 'Raleway',
        fontSize: 10,
        bold: true,
        fontColor: { red: 1, green: 1, blue: 1 },
        fillColor: { red: 0.2, green: 0.2, blue: 0.2 }
      },
      rowHeights: {
        titleRow: 45,
        formulaRow: 24,
        subtitleRow: 24,
        emptySpacerRow: 10,
        headerRow: 28,
        dataRow: 21
      },
      offsets: {
        HEADER_ROW_INDEX: 5,
        FIRST_DATA_ROW_INDEX: 6,
        FORMULA_ROW_INDEX: 2,
        SUBTITLE_ROW_INDEX: 3,
        EMPTY_SPACER_ROW_INDEX: 4
      },
      systemTabColors: {}
    };

    const repo = new GoogleSheetsLogRepository();
    repo.updateDocumentLink(ssId, {
      sheetName: 'Submittal Arch',
      rowIndex: 6,
      url: 'https://drive.google.com/open?id=file123',
      viewSpec: customViewSpec
    });

    const updatedGrid = sheet.getDataRange().getValues();
    // Should update column 3 (index 2) based on viewSpec offsets (Row 5), NOT column 1 (index 0) from Row 3
    expect(updatedGrid[5][2]).toBe('https://drive.google.com/open?id=file123');
    expect(updatedGrid[5][0]).toBe('PENDING');
  });

  it('falls back to default header row index 3 when viewSpec is not provided', () => {
    const ssId = 'ss-test-log-repo-fallback';
    const ss = (globalThis as any).SpreadsheetApp.openById(ssId);
    const sheet = ss.insertSheet('Submittal Arch');

    sheet.getRange(1, 1, 4, 3).setValues([
      ['Title', '', ''],
      ['Formula', '', ''],
      ['Status', 'Link', 'Date'],
      ['PENDING', '', '2026-01-01']
    ]);

    const repo = new GoogleSheetsLogRepository();
    repo.updateDocumentLink(ssId, {
      sheetName: 'Submittal Arch',
      rowIndex: 4,
      url: 'https://drive.google.com/open?id=fallback123'
    });

    const updatedGrid = sheet.getDataRange().getValues();
    expect(updatedGrid[3][1]).toBe('https://drive.google.com/open?id=fallback123');
  });

  it('handles missing spreadsheetId, invalid rowIndex, or missing url gracefully without error', () => {
    const repo = new GoogleSheetsLogRepository();
    expect(() => {
      repo.updateDocumentLink('', { rowIndex: 1, url: 'http://example.com' });
      repo.updateDocumentLink('ss-id', { rowIndex: 0, url: 'http://example.com' });
      repo.updateDocumentLink('ss-id', { rowIndex: 1, url: '' });
    }).not.toThrow();
  });

describe('dual-topology tab resolution in getLogSettings', () => {
    it('resolves modern MVT tabs (Submittal Arch, _Shared, Submittal FFE Support) first', () => {
      const ssId = 'ss-mvt-dual-topology';
      const ss = (globalThis as any).SpreadsheetApp.openById(ssId);

      const archSheet = ss.insertSheet('Submittal Arch');
      const ffeSheet = ss.insertSheet('Submittal FFE');
      const sharedSheet = ss.insertSheet('_Shared');
      const ffeSupportSheet = ss.insertSheet('Submittal FFE Support');

      // Setup _Shared contacts and actions
      sharedSheet.getRange(1, 1, 3, 9).setValues([
        ['Contacts_Arch Key', 'Contacts_Arch Label', 'Contacts_FFE Key', 'Contacts_FFE Label', 'Action Order', 'Actions', 'Action Abbr.', 'Statuses Key', 'Statuses Label'],
        ['AIA', 'Architect', 'VEN', 'Vendor', '1', 'Approved', 'APP', 'OPEN', 'Pending'],
        ['ENG', 'Engineer', '', '', '2', 'Rejected', 'REJ', 'CLOSED', 'Closed']
      ]);

      // Setup Submittal FFE Support vendors and tags
      ffeSupportSheet.getRange(1, 1, 3, 4).setValues([
        ['Vendor Key', 'Vendor Label', 'SpecTag Key', 'SpecTag Label'],
        ['Berman Falk', 'Berman Falk', 'AC102', 'HOOK'],
        ['Ashley Lighting', 'Ashley Lighting', 'CG104', 'BED - KING']
      ]);

      const repo = new GoogleSheetsLogRepository();

      // Architectural settings lookup
      const archSettings = repo.getLogSettings(ssId, 'Architectural');
      expect(archSettings.logSheetId).toBe(archSheet.getSheetId());
      expect(archSettings.contacts).toHaveLength(2);
      expect(archSettings.contacts[0]).toEqual({ abbr: 'AIA', name: 'Architect' });
      expect(archSettings.actions).toHaveLength(2);
      expect(archSettings.actions[0]).toEqual({ action: 'Approved', abbr: 'APP', status: 'Pending' });

      // FF&E settings lookup
      const ffeSettings = repo.getLogSettings(ssId, 'FF&E');
      expect(ffeSettings.logSheetId).toBe(ffeSheet.getSheetId());
      expect(ffeSettings.ffeTags.tags).toContain('AC102');
      expect(ffeSettings.ffeTags.tags).toContain('CG104');
      expect(ffeSettings.ffeTags.vendors).toContain('Berman Falk');
      expect(ffeSettings.ffeTags.tagMap['AC102']).toBe('HOOK');
    });

    it('falls back transparently to legacy tabs (Log, Settings, Tag List) on unmigrated workbooks', () => {
      const ssId = 'ss-legacy-unmigrated';
      const ss = (globalThis as any).SpreadsheetApp.openById(ssId);

      const logSheet = ss.insertSheet('Log');
      const settingsSheet = ss.insertSheet('Settings');
      const tagSheet = ss.insertSheet('Tag List');

      // Setup Settings headers and rows
      settingsSheet.getRange(1, 1, 3, 6).setValues([
        ['Project Abbreviation', 'Actions', 'Action Abbr.', 'Status', 'Contact', 'Contact Abbr.'],
        ['LEG', 'Reviewed', 'REV', 'Open', 'Contractor', 'GC'],
        ['', 'Revise and Resubmit', 'R&R', 'Pending', 'Consultant', 'CON']
      ]);

      // Setup Tag List headers and rows
      tagSheet.getRange(1, 1, 4, 3).setValues([
        ['', '', ''],
        ['', '', ''],
        ['Spec Tag', 'Spec Title', 'Vendor'],
        ['PL101', 'Plumbing Fixture', 'Kohler']
      ]);

      const repo = new GoogleSheetsLogRepository();

      const archSettings = repo.getLogSettings(ssId, 'Architectural');
      expect(archSettings.logSheetId).toBe(logSheet.getSheetId());
      expect(archSettings.projectAbbr).toBe('LEG');
      expect(archSettings.contacts).toHaveLength(2);
      expect(archSettings.contacts[0]).toEqual({ abbr: 'GC', name: 'Contractor' });
      expect(archSettings.actions).toHaveLength(2);
      expect(archSettings.actions[0]).toEqual({ action: 'Reviewed', abbr: 'REV', status: 'Open' });

      const ffeSettings = repo.getLogSettings(ssId, 'FF&E');
      expect(ffeSettings.ffeTags.tags).toContain('PL101');
      expect(ffeSettings.ffeTags.vendors).toContain('Kohler');
      expect(ffeSettings.ffeTags.tagMap['PL101']).toBe('Plumbing Fixture');
    });
  });

  it('automatically expands sheet capacity and inserts first submittal at Row 6 on a 5-row MVT tab', () => {
    const ssId = 'ss-test-log-repo-mvt-5row';
    const ss = (globalThis as any).SpreadsheetApp.openById(ssId);
    const sheet = ss.insertSheet('Submittal Arch');

    // MVT tab initially has exactly 5 rows (Rows 1-5)
    sheet.getRange(1, 1, 5, 4).setValues([
      ['Project Title', '', '', ''],
      ['2026-11-01', '', '', ''],
      ['Section', 'Number', 'Revision', 'Title'],
      ['', '', '', '=MAP(A5:A, LAMBDA(s, s))'], // Row 4: FormulaRow
      ['', '', '', '']                          // Row 5: BufferRow
    ]);
    expect(sheet.getMaxRows()).toBe(5);

    const repo = new GoogleSheetsLogRepository();
    const plan = { targetRowIndex: 5, insertBlankBefore: false, insertBlankAfter: false, finalRowIndex: 6 };
    const res = repo.insertLogRow(ssId, ['Section', 'Number', 'Revision', 'Title'], ['033000', '001', '0', 'Concrete Mix'], plan, 'Submittal Arch');

    expect(res.rowIndex).toBe(6);
    expect(sheet.getMaxRows()).toBeGreaterThanOrEqual(6);
    const grid = sheet.getDataRange().getValues();
    // Row 4 FormulaRow intact
    expect(grid[3][3]).toBe('=MAP(A5:A, LAMBDA(s, s))');
    // Row 5 BufferRow intact (empty)
    expect(grid[4].every((c: any) => c === '')).toBe(true);
    // Row 6 contains the new submittal
    expect(grid[5][0]).toBe('033000');
    expect(grid[5][1]).toBe('001');
    expect(grid[5][2]).toBe('0');
    expect(grid[5][3]).toBe('Concrete Mix');
  });

  describe('Ticket #311 - dynamic support table persistence & scoped cache eviction', () => {
    it('persists newly confirmed SpecTag to Submittal FFE Support and executes scoped cache eviction', () => {
      const ssId = 'ss-mvt-ffe-persist-tag';
      const ss = (globalThis as any).SpreadsheetApp.openById(ssId);

      const ffeSupportSheet = ss.insertSheet('Submittal FFE Support');
      ffeSupportSheet.getRange(1, 1, 4, 4).setValues([
        ['Vendor Key', 'Vendor Label', 'SpecTag Key', 'SpecTag Label'],
        ['Berman Falk', 'Berman Falk', 'AC102', 'HOOK'],
        ['Ashley Lighting', 'Ashley Lighting', 'CG104', 'BED - KING'],
        ['', '', '', '']
      ]);

      const fakeCache = new FakeCacheAdapter();
      (globalThis as any).defaultCacheAdapter = fakeCache;
      const prefixManager = new PrefixCacheManager(fakeCache);
      prefixManager.putScoped(`DOC_CONFIG_${ssId}`, `DOC_CONFIG_${ssId}_ffe`, JSON.stringify({ version: 1 }), 3600);
      prefixManager.putScoped('log_search_', 'log_search_unrelated', 'keep_me', 3600);

      const repo = new GoogleSheetsLogRepository();
      // Insert 'CG100' which is alphabetically between AC102 and CG104
      repo.addNewTagToTagList(ssId, 'CG100', 'BED - QUEEN');

      // 1. Check scoped cache eviction
      expect(prefixManager.getScoped(`DOC_CONFIG_${ssId}`, `DOC_CONFIG_${ssId}_ffe`)).toBeNull();
      // Unrelated scope remains intact
      expect(prefixManager.getScoped('log_search_', 'log_search_unrelated')).toBe('keep_me');

      // 2. Check updated settings observation
      const settings = repo.getLogSettings(ssId, 'FF&E');
      expect(settings.ffeTags.tags).toContain('CG100');
      expect(settings.ffeTags.tagMap['CG100']).toBe('BED - QUEEN');
    });

    it('persists newly confirmed Vendor to Submittal FFE Support and executes scoped cache eviction', () => {
      const ssId = 'ss-mvt-ffe-persist-vendor';
      const ss = (globalThis as any).SpreadsheetApp.openById(ssId);

      const ffeSupportSheet = ss.insertSheet('Submittal FFE Support');
      ffeSupportSheet.getRange(1, 1, 3, 4).setValues([
        ['Vendor Key', 'Vendor Label', 'SpecTag Key', 'SpecTag Label'],
        ['Berman Falk', 'Berman Falk', 'AC102', 'HOOK'],
        ['', '', 'CG104', 'BED - KING']
      ]);

      const fakeCache = new FakeCacheAdapter();
      (globalThis as any).defaultCacheAdapter = fakeCache;
      const prefixManager = new PrefixCacheManager(fakeCache);
      prefixManager.putScoped(`DOC_CONFIG_${ssId}`, `DOC_CONFIG_${ssId}_ffe`, JSON.stringify({ version: 1 }), 3600);

      const repo = new GoogleSheetsLogRepository();
      repo.addNewVendorToTagList(ssId, 'Herman Miller');

      expect(prefixManager.getScoped(`DOC_CONFIG_${ssId}`, `DOC_CONFIG_${ssId}_ffe`)).toBeNull();

      const settings = repo.getLogSettings(ssId, 'FF&E');
      expect(settings.ffeTags.vendors).toContain('Herman Miller');
    });

    it('persists tag and vendor to legacy Tag List tab when MVT tabs are absent', () => {
      const ssId = 'ss-legacy-persist';
      const ss = (globalThis as any).SpreadsheetApp.openById(ssId);

      const tagSheet = ss.insertSheet('Tag List');
      tagSheet.getRange(1, 1, 4, 3).setValues([
        ['', '', ''],
        ['', '', ''],
        ['Spec Tag', 'Spec Title', 'Vendor'],
        ['AC100', 'Hook Legacy', 'Old Vendor']
      ]);

      const fakeCache = new FakeCacheAdapter();
      (globalThis as any).defaultCacheAdapter = fakeCache;
      const prefixManager = new PrefixCacheManager(fakeCache);
      prefixManager.putScoped(`DOC_CONFIG_${ssId}`, `DOC_CONFIG_${ssId}_leg`, 'cached', 3600);

      const repo = new GoogleSheetsLogRepository();
      repo.addNewTagToTagList(ssId, 'AC101', 'Hook 2');
      repo.addNewVendorToTagList(ssId, 'New Legacy Vendor');

      expect(prefixManager.getScoped(`DOC_CONFIG_${ssId}`, `DOC_CONFIG_${ssId}_leg`)).toBeNull();

      const settings = repo.getLogSettings(ssId, 'FF&E');
      expect(settings.ffeTags.tags).toContain('AC101');
      expect(settings.ffeTags.tagMap['AC101']).toBe('Hook 2');
      expect(settings.ffeTags.vendors).toContain('New Legacy Vendor');
    });
  });
});