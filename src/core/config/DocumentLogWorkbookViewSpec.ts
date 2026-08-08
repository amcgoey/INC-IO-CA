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

export function hexToRgb(hex: string): ColorRgb {
  const cleaned = hex.replace(/^#/, '');
  let r = 0, g = 0, b = 0;
  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.substring(0, 2), 16);
    g = parseInt(cleaned.substring(2, 4), 16);
    b = parseInt(cleaned.substring(4, 6), 16);
  }
  return {
    red: Number((r / 255).toFixed(4)),
    green: Number((g / 255).toFixed(4)),
    blue: Number((b / 255).toFixed(4))
  };
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
  HEADER_ROW_INDEX: number;
  FORMULA_ROW_INDEX: number;
  BUFFER_ROW_INDEX: number;
  FIRST_DATA_ROW_INDEX: number;
  FIRST_DATA_ROW_OFFSET: number;
}

export interface DocumentLogWorkbookViewSpec {
  headerStyle: HeaderStyleSpec;
  formulaRowStyle: FormulaRowStyleSpec;
  offsets: LayoutOffsetSpec;
  columnWidths: Record<string, number>;
  defaultColumnWidth: number;
  namedRangeFills?: Record<string, ColorRgb>;
  settingHeaderRanges?: Record<string, string[]>;
}

export const ThemeColors = {
  HEADER_FILL_HEX: '#666666',
  HEADER_FILL_RGB: { red: 0.4, green: 0.4, blue: 0.4 },
  HEADER_TEXT_HEX: '#FFFFFF',
  HEADER_TEXT_RGB: { red: 1.0, green: 1.0, blue: 1.0 },
  FORMULA_ROW_FONT_HEX: '#666666',
  FORMULA_ROW_FONT_RGB: { red: 0.4, green: 0.4, blue: 0.4 },
  FORMULA_ROW_FILL_HEX: '#F3F3F3',
  FORMULA_ROW_FILL_RGB: { red: 0.95, green: 0.95, blue: 0.95 },
  PALE_GRAY_HEX: '#F1F3F4',
  PALE_GRAY_RGB: hexToRgb('#F1F3F4'),
  PALE_BLUE_HEX: '#E8F0FE',
  PALE_BLUE_RGB: hexToRgb('#E8F0FE'),
  PALE_GREEN_HEX: '#E6F4EA',
  PALE_GREEN_RGB: hexToRgb('#E6F4EA'),
  PALE_RED_HEX: '#FCE8E6',
  PALE_RED_RGB: hexToRgb('#FCE8E6')
};

export const VisualStyleSpec: DocumentLogWorkbookViewSpec = {
  headerStyle: {
    fillHex: ThemeColors.HEADER_FILL_HEX,
    fillRgb: ThemeColors.HEADER_FILL_RGB,
    fontColorHex: ThemeColors.HEADER_TEXT_HEX,
    fontColorRgb: ThemeColors.HEADER_TEXT_RGB,
    bold: true,
    fontSize: 10,
    fontFamily: 'Roboto'
  },
  formulaRowStyle: {
    fontColorHex: ThemeColors.FORMULA_ROW_FONT_HEX,
    fontColorRgb: ThemeColors.FORMULA_ROW_FONT_RGB,
    fillHex: ThemeColors.FORMULA_ROW_FILL_HEX,
    fillRgb: ThemeColors.FORMULA_ROW_FILL_RGB,
    italic: true,
    fontSize: 9,
    fontFamily: 'Roboto'
  },
  offsets: {
    HEADER_ROW_INDEX: 1,
    FORMULA_ROW_INDEX: 2,
    BUFFER_ROW_INDEX: 3,
    FIRST_DATA_ROW_INDEX: 4,
    FIRST_DATA_ROW_OFFSET: 3
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
  defaultColumnWidth: 150,
  namedRangeFills: {
    MANIFEST_SCHEMA_VERSION: ThemeColors.PALE_GRAY_RGB,
    Config_Manifest: ThemeColors.PALE_GRAY_RGB,
    Sections: ThemeColors.PALE_GRAY_RGB,
    Submittal_Arch_Support_Sections: ThemeColors.PALE_GRAY_RGB,
    Config_Submittal_Arch: ThemeColors.PALE_BLUE_RGB,
    Config_Submittal_FFE: ThemeColors.PALE_BLUE_RGB,
    Vendors: ThemeColors.PALE_BLUE_RGB,
    Shared_Contacts_Arch: ThemeColors.PALE_GREEN_RGB,
    Shared_Contacts_FFE: ThemeColors.PALE_GREEN_RGB,
    SpecTags: ThemeColors.PALE_GREEN_RGB,
    Actions_Submittal: ThemeColors.PALE_RED_RGB
  },
  settingHeaderRanges: {
    _Config: ['A1:B1', 'A5:D5'],
    _Shared: ['A1:C1', 'E1:G1'],
    'Submittal Arch Support': ['A1:B1'],
    'Submittal FFE Support': ['A1:D1']
  }
};

export const DOCUMENT_LOG_WORKBOOK_VIEW_SPEC: DocumentLogWorkbookViewSpec = VisualStyleSpec;

declare var module: any;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hexToRgb,
    ThemeColors,
    VisualStyleSpec,
    DOCUMENT_LOG_WORKBOOK_VIEW_SPEC
  };
}
