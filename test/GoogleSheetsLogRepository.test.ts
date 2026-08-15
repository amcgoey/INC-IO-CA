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
});