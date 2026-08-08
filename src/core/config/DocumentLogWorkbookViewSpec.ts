/**
 * @file DocumentLogWorkbookViewSpec.ts
 * @description MVVM View specification tokenizing aesthetic presentation rules
 * (header fill colors #666666, font typography, layout offsets, column widths,
 * and date/number format strings) derived from reference submittal log templates.
 */

export interface ColorRgb {
  red: number;
  green: number;
  blue: number;
}

export interface HeaderStyleSpec {
  fillHex: string;
  fillRgb: ColorRgb;
  fontColorHex: string;
  fontColorRgb: ColorRgb;
  bold: boolean;
  fontSize: number;
  fontFamily: string;
}

export interface TitleRowStyleSpec {
  fillHex: string;
  fillRgb: ColorRgb;
  fontColorHex: string;
  fontColorRgb: ColorRgb;
  bold: boolean;
  fontSize: number;
  fontFamily: string;
}

export interface DateRowStyleSpec {
  fillHex: string;
  fillRgb: ColorRgb;
  fontColorHex: string;
  fontColorRgb: ColorRgb;
  italic: boolean;
  fontSize: number;
  fontFamily: string;
}

export interface FormulaRowStyleSpec {
  fontColorHex: string;
  fontColorRgb: ColorRgb;
  fillHex: string;
  fillRgb: ColorRgb;
  italic: boolean;
  fontSize: number;
  fontFamily: string;
}

export interface LayoutOffsetSpec {
  TITLE_ROW_INDEX: number;
  DATE_ROW_INDEX: number;
  HEADER_ROW_INDEX: number;
  FORMULA_ROW_INDEX: number;
  TOP_BUFFER_ROW_INDEX: number;
  BUFFER_ROW_INDEX: number;
  FIRST_DATA_ROW_INDEX: number;
  FIRST_DATA_ROW_OFFSET: number;
}

export interface DocumentLogWorkbookViewSpec {
  titleRowStyle: TitleRowStyleSpec;
  dateRowStyle: DateRowStyleSpec;
  headerStyle: HeaderStyleSpec;
  formulaRowStyle: FormulaRowStyleSpec;
  offsets: LayoutOffsetSpec;
  columnWidths: Record<string, number>;
  defaultColumnWidth: number;
}

export const ThemeColors = {
  HEADER_FILL_HEX: "#666666",
  HEADER_FILL_RGB: { red: 0.4, green: 0.4, blue: 0.4 },
  HEADER_TEXT_HEX: "#FFFFFF",
  HEADER_TEXT_RGB: { red: 1.0, green: 1.0, blue: 1.0 },
  FORMULA_ROW_FONT_HEX: "#FFFFFF",
  FORMULA_ROW_FONT_RGB: { red: 1.0, green: 1.0, blue: 1.0 },
  FORMULA_ROW_FILL_HEX: "#666666",
  FORMULA_ROW_FILL_RGB: { red: 0.4, green: 0.4, blue: 0.4 }
};

export const VisualStyleSpec = {
  titleRowStyle: {
    fillHex: ThemeColors.HEADER_FILL_HEX,
    fillRgb: ThemeColors.HEADER_FILL_RGB,
    fontColorHex: ThemeColors.HEADER_TEXT_HEX,
    fontColorRgb: ThemeColors.HEADER_TEXT_RGB,
    bold: true,
    fontSize: 16,
    fontFamily: "Roboto"
  },
  dateRowStyle: {
    fillHex: ThemeColors.HEADER_FILL_HEX,
    fillRgb: ThemeColors.HEADER_FILL_RGB,
    fontColorHex: ThemeColors.HEADER_TEXT_HEX,
    fontColorRgb: ThemeColors.HEADER_TEXT_RGB,
    italic: true,
    fontSize: 10,
    fontFamily: "Roboto"
  },
  headerStyle: {
    fillHex: ThemeColors.HEADER_FILL_HEX,
    fillRgb: ThemeColors.HEADER_FILL_RGB,
    fontColorHex: ThemeColors.HEADER_TEXT_HEX,
    fontColorRgb: ThemeColors.HEADER_TEXT_RGB,
    bold: true,
    fontSize: 11,
    fontFamily: "Roboto"
  },
  formulaRowStyle: {
    fontColorHex: ThemeColors.FORMULA_ROW_FONT_HEX,
    fontColorRgb: ThemeColors.FORMULA_ROW_FONT_RGB,
    fillHex: ThemeColors.FORMULA_ROW_FILL_HEX,
    fillRgb: ThemeColors.FORMULA_ROW_FILL_RGB,
    italic: true,
    fontSize: 9,
    fontFamily: "Roboto"
  },
  offsets: {
    TITLE_ROW_INDEX: 1,
    DATE_ROW_INDEX: 2,
    HEADER_ROW_INDEX: 3,
    FORMULA_ROW_INDEX: 4,
    TOP_BUFFER_ROW_INDEX: 5,
    BUFFER_ROW_INDEX: 5,
    FIRST_DATA_ROW_INDEX: 6,
    FIRST_DATA_ROW_OFFSET: 5
  },
  columnWidths: {
    section: 100,
    number: 100,
    title: 250,
    revision: 80,
    date: 100,
    contact: 180,
    action: 140,
    status: 120,
    notes: 250,
    link: 150,
    calcFileName: 250,
    calcNumber: 180,
    calcTitle: 250,
    calcContactChain: 200,
    calcSort: 150,
    specTag: 100,
    relatedTag: 110,
    specTitle: 250,
    vendor: 180
  },
  defaultColumnWidth: 150
};

export const DOCUMENT_LOG_WORKBOOK_VIEW_SPEC: DocumentLogWorkbookViewSpec = VisualStyleSpec;

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ThemeColors,
    VisualStyleSpec,
    DOCUMENT_LOG_WORKBOOK_VIEW_SPEC
  };
}
