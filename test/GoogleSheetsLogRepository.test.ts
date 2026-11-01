import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GasMockHarness } from './harness/GasMockHarness';
import { GoogleSheetsLogRepository } from '../src/GoogleSheetsLogRepository';
import { DocumentLogWorkbookViewSpec } from '../src/core/config/DocumentLogWorkbookViewSpec';

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
});