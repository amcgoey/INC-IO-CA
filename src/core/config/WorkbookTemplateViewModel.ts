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
      if (index === 0) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: 0,
              title: tab.name,
              gridProperties: {
                rowCount: tab.rowCount,
                columnCount: tab.columnCount
              }
            },
            fields: "title,gridProperties(rowCount,columnCount)"
          }
        });
      } else {
        requests.push({
          addSheet: {
            properties: {
              sheetId: index,
              title: tab.name,
              gridProperties: {
                rowCount: tab.rowCount,
                columnCount: tab.columnCount
              }
            }
          }
        });
      }

      if (tab.seedRows && tab.seedRows.length > 0) {
        const rows = tab.seedRows.map((row: any[]) => ({
          values: row.map((val: any) => ({
            userEnteredValue: {
              stringValue: String(val)
            }
          }))
        }));
        requests.push({
          updateCells: {
            range: {
              sheetId: index,
              startRowIndex: 0,
              startColumnIndex: 0
            },
            rows,
            fields: "userEnteredValue"
          }
        });
      }

      if (tab.isLogTab && tab.columns) {
        const headerValues = tab.columns.map(c => ({
          userEnteredValue: { stringValue: c.header }
        }));
        const formulaValues = tab.columns.map(c => {
          if (c.formula) {
            return { userEnteredValue: { formulaValue: c.formula } };
          }
          return { userEnteredValue: { stringValue: "" } };
        });

        requests.push({
          updateCells: {
            range: {
              sheetId: index,
              startRowIndex: offsets.HEADER_ROW_INDEX - 1,
              startColumnIndex: 0
            },
            rows: [{ values: headerValues }],
            fields: "userEnteredValue"
          }
        });

        requests.push({
          updateCells: {
            range: {
              sheetId: index,
              startRowIndex: offsets.FORMULA_ROW_INDEX - 1,
              startColumnIndex: 0
            },
            rows: [{ values: formulaValues }],
            fields: "userEnteredValue"
          }
        });
      }
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

          if (col.validationRange) {
            requests.push({
              setDataValidation: {
                range: {
                  sheetId: tabIndex,
                  startRowIndex: offsets.FIRST_DATA_ROW_INDEX - 1,
                  endRowIndex: tab.rowCount,
                  startColumnIndex: colIdx,
                  endColumnIndex: colIdx + 1
                },
                rule: {
                  condition: {
                    type: "ONE_OF_RANGE",
                    values: [
                      {
                        userEnteredValue: `=${col.validationRange}`
                      }
                    ]
                  },
                  showCustomUi: true,
                  strict: true
                }
              }
            });
          }
        });
      }
    });

    const addedNames = new Set<string>();
    this.model.namedRanges.forEach(nr => {
      const sheetId = tabIndexMap.get(nr.tabName) ?? 0;
      const gridRange = parseA1ToGridRange(nr.rangeNotation, sheetId);
      let name = nr.name;
      if (addedNames.has(name)) {
        name = `${nr.tabName.replace(/ /g, "_")}_${nr.name}`;
      }
      if (addedNames.has(name)) {
        return; // skip if exact name already added
      }
      addedNames.add(name);
      const safeId = `nr_${sheetId}_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      requests.push({
        addNamedRange: {
          namedRange: {
            namedRangeId: safeId,
            name: name,
            range: gridRange
          }
        }
      });
    });

    if (this.viewSpec.settingHeaderRanges) {
      Object.entries(this.viewSpec.settingHeaderRanges).forEach(([tabName, ranges]) => {
        const sheetId = tabIndexMap.get(tabName);
        if (sheetId === undefined) return;
        ranges.forEach(rangeStr => {
          const gridRange = parseA1ToGridRange(rangeStr, sheetId);
          requests.push({
            repeatCell: {
              range: gridRange,
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
        });
      });
    }

    if (this.viewSpec.namedRangeFills) {
      this.model.namedRanges.forEach(nr => {
        const fillRgb = this.viewSpec.namedRangeFills?.[nr.name];
        if (fillRgb) {
          const sheetId = tabIndexMap.get(nr.tabName);
          if (sheetId !== undefined) {
            const gridRange = parseA1ToGridRange(nr.rangeNotation, sheetId);
            requests.push({
              repeatCell: {
                range: gridRange,
                cell: {
                  userEnteredFormat: {
                    backgroundColor: fillRgb
                  }
                },
                fields: "userEnteredFormat(backgroundColor)"
              }
            });
          }
        }
      });
    }

    return { requests };
  }
}

export function colLetterToIndex(colStr: string): number {
  let index = 0;
  for (let i = 0; i < colStr.length; i++) {
    index = index * 26 + (colStr.charCodeAt(i) - 64);
  }
  return index - 1;
}

export function parseA1ToGridRange(rangeStr: string, sheetId: number) {
  const rangeMatch = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (rangeMatch) {
    const startCol = colLetterToIndex(rangeMatch[1].toUpperCase());
    const startRow = parseInt(rangeMatch[2], 10) - 1;
    const endCol = colLetterToIndex(rangeMatch[3].toUpperCase()) + 1;
    const endRow = parseInt(rangeMatch[4], 10);
    return {
      sheetId,
      startRowIndex: startRow,
      endRowIndex: endRow,
      startColumnIndex: startCol,
      endColumnIndex: endCol
    };
  }

  const singleMatch = rangeStr.match(/^([A-Z]+)(\d+)$/i);
  if (singleMatch) {
    const col = colLetterToIndex(singleMatch[1].toUpperCase());
    const row = parseInt(singleMatch[2], 10) - 1;
    return {
      sheetId,
      startRowIndex: row,
      endRowIndex: row + 1,
      startColumnIndex: col,
      endColumnIndex: col + 1
    };
  }

  return { sheetId };
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WorkbookTemplateViewModel,
    colLetterToIndex,
    parseA1ToGridRange
  };
}
