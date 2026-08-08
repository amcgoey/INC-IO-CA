/**
 * @file WorkbookTemplateViewModel.ts
 * @description MVVM ViewModel presenter component binding DocumentLogWorkbookSpec (Model)
 * and DocumentLogWorkbookViewSpec (View Spec) to produce offline JSON test fixtures
 * and Google Sheets API batchUpdate request payloads.
 */

import { DocumentLogWorkbookSpec, DOCUMENT_LOG_WORKBOOK_SPEC, NamedRangeSpec } from "./DocumentLogWorkbookSpec";
import { DocumentLogWorkbookViewSpec, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from "./DocumentLogWorkbookViewSpec";

export interface FixtureTabSpec {
  name: string;
  rowCount: number;
  columnCount: number;
  isConfigTab: boolean;
  isSharedTab: boolean;
  isAuditLogTab: boolean;
  isLogTab: boolean;
  isSupportTab?: boolean;
  headers: string[];
  formulaRow: string[];
  seedRows: (string | number | boolean)[][];
}

export interface FixtureSpec {
  schemaVersion: string;
  tabs: FixtureTabSpec[];
  namedRanges: NamedRangeSpec[];
}

export interface BatchUpdateRequestPayload {
  requests: object[];
}

export class WorkbookTemplateViewModel {
  private model: DocumentLogWorkbookSpec;
  private viewSpec: DocumentLogWorkbookViewSpec;

  constructor(
    model: DocumentLogWorkbookSpec = DOCUMENT_LOG_WORKBOOK_SPEC,
    viewSpec: DocumentLogWorkbookViewSpec = DOCUMENT_LOG_WORKBOOK_VIEW_SPEC
  ) {
    this.model = model;
    this.viewSpec = viewSpec;
  }

  public getSpec(): DocumentLogWorkbookSpec {
    return this.model;
  }

  public getViewSpec(): DocumentLogWorkbookViewSpec {
    return this.viewSpec;
  }

  public toFixtureJson(): FixtureSpec {
    return {
      schemaVersion: this.model.schemaVersion,
      tabs: this.model.tabs.map(tab => {
        const headers = tab.columns
          ? tab.columns.map(c => c.header)
          : (tab.seedRows && tab.seedRows.length > 0 ? tab.seedRows[0].map(String) : []);
        const formulaRow = tab.columns
          ? tab.columns.map(c => c.formula || "")
          : [];
        const seedRows = tab.isLogTab ? [] : (tab.seedRows || []);

        return {
          name: tab.name,
          rowCount: tab.rowCount,
          columnCount: tab.columnCount,
          isConfigTab: !!tab.isConfigTab,
          isSharedTab: !!tab.isSharedTab,
          isAuditLogTab: !!tab.isAuditLogTab,
          isLogTab: !!tab.isLogTab,
          isSupportTab: !!tab.isSupportTab,
          headers,
          formulaRow,
          seedRows
        };
      }),
      namedRanges: this.model.namedRanges
    };
  }

  public toBatchUpdateRequestPayload(): BatchUpdateRequestPayload {
    const requests: object[] = [];
    const { headerStyle, formulaRowStyle, offsets, columnWidths, defaultColumnWidth } = this.viewSpec;

    const tabIndexMap = new Map<string, number>();
    this.model.tabs.forEach((tab, index) => {
      tabIndexMap.set(tab.name, index);
    });

    this.model.tabs.forEach((tab, tabIndex) => {
      if (tab.isLogTab && tab.columns) {
        requests.push({
          repeatCell: {
            range: {
              sheetId: tabIndex,
              startRowIndex: offsets.HEADER_ROW_INDEX - 1,
              endRowIndex: offsets.HEADER_ROW_INDEX,
              startColumnIndex: 0,
              endColumnIndex: tab.columns.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: headerStyle.fillRgb,
                textFormat: {
                  foregroundColor: headerStyle.fontColorRgb,
                  bold: headerStyle.bold,
                  fontSize: headerStyle.fontSize,
                  fontFamily: headerStyle.fontFamily
                }
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)"
          }
        });

        requests.push({
          repeatCell: {
            range: {
              sheetId: tabIndex,
              startRowIndex: offsets.FORMULA_ROW_INDEX - 1,
              endRowIndex: offsets.FORMULA_ROW_INDEX,
              startColumnIndex: 0,
              endColumnIndex: tab.columns.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: formulaRowStyle.fillRgb,
                textFormat: {
                  foregroundColor: formulaRowStyle.fontColorRgb,
                  italic: formulaRowStyle.italic,
                  fontSize: formulaRowStyle.fontSize,
                  fontFamily: formulaRowStyle.fontFamily
                }
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)"
          }
        });

        tab.columns.forEach((col, colIdx) => {
          const width = columnWidths[col.id] || defaultColumnWidth;
          requests.push({
            updateDimensionProperties: {
              range: {
                sheetId: tabIndex,
                dimension: "COLUMNS",
                startIndex: colIdx,
                endIndex: colIdx + 1
              },
              properties: {
                pixelSize: width
              },
              fields: "pixelSize"
            }
          });
        });
      }
    });

    this.model.namedRanges.forEach(nr => {
      const sheetId = tabIndexMap.get(nr.tabName) ?? 0;
      requests.push({
        addNamedRange: {
          namedRange: {
            name: nr.name,
            range: {
              sheetId,
              namedRangeId: nr.name
            }
          }
        }
      });
    });

    return { requests };
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WorkbookTemplateViewModel
  };
}