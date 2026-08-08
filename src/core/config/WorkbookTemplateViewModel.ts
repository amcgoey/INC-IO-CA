/**
 * @file WorkbookTemplateViewModel.ts
 * @description MVVM ViewModel presenter component binding DocumentLogWorkbookSpec (Model)
 * and DocumentLogWorkbookViewSpec (View Spec) to produce offline JSON test fixtures
 * and Google Sheets API batchUpdate request payloads.
 */

import { DocumentLogWorkbookSpec, DOCUMENT_LOG_WORKBOOK_SPEC, NamedRangeSpec } from "./DocumentLogWorkbookSpec";
import { DocumentLogWorkbookViewSpec, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC, HeaderStyleSpec, ColorRgb, StatusColors } from "./DocumentLogWorkbookViewSpec";

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

export interface GridRangeSpec {
  sheetId: number;
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
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
        const seedRows = tab.seedRows || [];

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

  public toBatchUpdateRequestPayload(existingSheetsMap?: Map<string, number>): BatchUpdateRequestPayload {
    const requests: object[] = [];
    const { titleRowStyle, dateRowStyle, headerStyle, formulaRowStyle, offsets, columnWidths, defaultColumnWidth } = this.viewSpec;

    const tabIndexMap = new Map<string, number>();
    this.model.tabs.forEach((tab, index) => {
      const existingSheetId = existingSheetsMap?.get(tab.name);
      const sheetId = existingSheetId !== undefined ? existingSheetId : index;
      tabIndexMap.set(tab.name, sheetId);

      if (existingSheetId !== undefined) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: existingSheetId,
              gridProperties: {
                rowCount: tab.rowCount,
                columnCount: tab.columnCount
              }
            },
            fields: "gridProperties(rowCount,columnCount)"
          }
        });
      } else if (index === 0) {
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
              sheetId,
              startRowIndex: (tab.isLogTab || tab.isAuditLogTab) ? offsets.FIRST_DATA_ROW_INDEX - 1 : 0,
              startColumnIndex: 0
            },
            rows,
            fields: "userEnteredValue"
          }
        });
      }

      if ((tab.isLogTab || tab.isAuditLogTab) && tab.columns) {
        const headerValues = tab.columns.map(c => ({
          userEnteredValue: { stringValue: c.header }
        }));
        const formulaValues = tab.columns.map(c => {
          if (c.formula) {
            return { userEnteredValue: { formulaValue: c.formula } };
          }
          return { userEnteredValue: { stringValue: "" } };
        });

        // Row 1: Title
        requests.push({
          updateCells: {
            range: {
              sheetId,
              startRowIndex: offsets.TITLE_ROW_INDEX - 1,
              startColumnIndex: 0
            },
            rows: [{ values: [{ userEnteredValue: { stringValue: tab.title || tab.name } }] }],
            fields: "userEnteredValue"
          }
        });

        // Row 2: Date
        requests.push({
          updateCells: {
            range: {
              sheetId,
              startRowIndex: offsets.DATE_ROW_INDEX - 1,
              startColumnIndex: 0
            },
            rows: [{ values: [{ userEnteredValue: { formulaValue: "=TODAY()" } }] }],
            fields: "userEnteredValue"
          }
        });

        // Row 3: Headers
        requests.push({
          updateCells: {
            range: {
              sheetId,
              startRowIndex: offsets.HEADER_ROW_INDEX - 1,
              startColumnIndex: 0
            },
            rows: [{ values: headerValues }],
            fields: "userEnteredValue"
          }
        });

        // Row 4: Formulas
        requests.push({
          updateCells: {
            range: {
              sheetId,
              startRowIndex: offsets.FORMULA_ROW_INDEX - 1,
              startColumnIndex: 0
            },
            rows: [{ values: formulaValues }],
            fields: "userEnteredValue"
          }
        });
      }
    });

    this.model.tabs.forEach((tab) => {
      const sheetId = tabIndexMap.get(tab.name)!;
      if ((tab.isLogTab || tab.isAuditLogTab) && tab.columns) {
        // Row 1: Title Style (27pt bold Abril Fatface)
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: offsets.TITLE_ROW_INDEX - 1,
              endRowIndex: offsets.TITLE_ROW_INDEX,
              startColumnIndex: 0,
              endColumnIndex: tab.columns.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: titleRowStyle.fillRgb,
                textFormat: {
                  foregroundColor: titleRowStyle.fontColorRgb,
                  bold: titleRowStyle.bold,
                  fontSize: titleRowStyle.fontSize,
                  fontFamily: titleRowStyle.fontFamily
                }
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)"
          }
        });

        // Row 2: Date Style (10pt italic)
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: offsets.DATE_ROW_INDEX - 1,
              endRowIndex: offsets.DATE_ROW_INDEX,
              startColumnIndex: 0,
              endColumnIndex: tab.columns.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: dateRowStyle.fillRgb,
                textFormat: {
                  foregroundColor: dateRowStyle.fontColorRgb,
                  italic: dateRowStyle.italic,
                  fontSize: dateRowStyle.fontSize,
                  fontFamily: dateRowStyle.fontFamily
                }
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)"
          }
        });

        // Row 3: Header Style (11pt bold)
        requests.push({
          repeatCell: {
            range: {
              sheetId,
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

        // Row 4: FormulaRow Style (9pt italic)
        requests.push({
          repeatCell: {
            range: {
              sheetId,
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

        // Row 5: Top BufferRow Style (Header Fill)
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: offsets.FIRST_DATA_ROW_INDEX - 2,
              endRowIndex: offsets.FIRST_DATA_ROW_INDEX - 1,
              startColumnIndex: 0,
              endColumnIndex: tab.columns.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: headerStyle.fillRgb
              }
            },
            fields: "userEnteredFormat(backgroundColor)"
          }
        });

        // Row N: End BufferRow Style (Header Fill)
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: tab.rowCount - 1,
              endRowIndex: tab.rowCount,
              startColumnIndex: 0,
              endColumnIndex: tab.columns.length
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: headerStyle.fillRgb
              }
            },
            fields: "userEnteredFormat(backgroundColor)"
          }
        });

        tab.columns.forEach((col, colIdx) => {
          const width = columnWidths[col.id] || defaultColumnWidth;
          requests.push({
            updateDimensionProperties: {
              range: {
                sheetId,
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
                  sheetId,
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
                  strict: false
                }
              }
            });
          }
        });

        if (tab.isLogTab && tab.columns) {
          const columns = tab.columns;
          const statusColors = this.viewSpec.statusColors || StatusColors;
          const statusColIdx = columns.findIndex(c => c.id === "status");
          if (statusColIdx !== -1) {
            const colLetter = indexToColLetter(statusColIdx);
            let ruleIndex = 0;
            Object.entries(statusColors).forEach(([status, spec]) => {
              requests.push({
                addConditionalFormatRule: {
                  rule: {
                    ranges: [
                      {
                        sheetId,
                        startRowIndex: offsets.FIRST_DATA_ROW_INDEX - 1,
                        endRowIndex: tab.rowCount - 1,
                        startColumnIndex: 0,
                        endColumnIndex: columns.length
                      }
                    ],
                    booleanRule: {
                      condition: {
                        type: "CUSTOM_FORMULA",
                        values: [
                          {
                            userEnteredValue: `=$${colLetter}${offsets.FIRST_DATA_ROW_INDEX}="${status}"`
                          }
                        ]
                      },
                      format: {
                        backgroundColor: spec.rgb
                      }
                    }
                  },
                  index: ruleIndex++
                }
              });
            });
          }
        }
      }
    });

    const addedNames = new Set<string>();
    this.model.namedRanges.forEach(namedRange => {
      const sheetId = tabIndexMap.get(namedRange.tabName) ?? 0;
      const gridRange = parseA1ToGridRange(namedRange.rangeNotation, sheetId);
      let name = namedRange.name;
      if (addedNames.has(name)) {
        name = `${namedRange.tabName.replace(/ /g, "_")}_${namedRange.name}`;
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

    // 1. Settings Named Range Fills (Emitted FIRST so header styling is applied on top)
    if (this.viewSpec.namedRangeFills) {
      const processedFillRanges = new Set<string>();
      this.model.namedRanges.forEach(namedRange => {
        const fillRgb = this.viewSpec.namedRangeFills?.[namedRange.name];
        if (fillRgb) {
          const sheetId = tabIndexMap.get(namedRange.tabName);
          if (sheetId !== undefined) {
            const rangeKey = `${sheetId}:${namedRange.rangeNotation}`;
            if (processedFillRanges.has(rangeKey)) {
              return; // skip duplicate requests for identical range notations
            }
            processedFillRanges.add(rangeKey);
            const gridRange = parseA1ToGridRange(namedRange.rangeNotation, sheetId);
            requests.push(createRepeatCellBackgroundRequest(gridRange, fillRgb));
          }
        }
      });
    }

    // 2. Settings Header Formatting (Emitted SECOND to guarantee Dark Gray #666666 headers take precedence over pale fills)
    if (this.viewSpec.settingHeaderRanges) {
      Object.entries(this.viewSpec.settingHeaderRanges).forEach(([tabName, ranges]) => {
        const sheetId = tabIndexMap.get(tabName);
        if (sheetId === undefined) return;
        ranges.forEach(rangeStr => {
          const gridRange = parseA1ToGridRange(rangeStr, sheetId);
          requests.push(createRepeatCellHeaderRequest(gridRange, headerStyle));
        });
      });
    }

    return { requests };
  }
}

function createRepeatCellBackgroundRequest(gridRange: GridRangeSpec, backgroundColor: ColorRgb) {
  return {
    repeatCell: {
      range: gridRange,
      cell: {
        userEnteredFormat: {
          backgroundColor
        }
      },
      fields: "userEnteredFormat(backgroundColor)"
    }
  };
}

function createRepeatCellHeaderRequest(gridRange: GridRangeSpec, headerStyle: HeaderStyleSpec) {
  return {
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
  };
}

export function indexToColLetter(index: number): string {
  let letter = "";
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export function colLetterToIndex(colStr: string): number {
  let index = 0;
  for (let i = 0; i < colStr.length; i++) {
    index = index * 26 + (colStr.charCodeAt(i) - 64);
  }
  return index - 1;
}

export function parseA1ToGridRange(rangeStr: string, sheetId: number): GridRangeSpec {
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
    indexToColLetter,
    colLetterToIndex,
    parseA1ToGridRange
  };
}
