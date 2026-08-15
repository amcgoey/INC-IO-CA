/**
 * @file DocumentLogWorkbookViewSpec.ts
 * @description MVVM View specification interfaces and design tokens tokenizing aesthetic presentation rules
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
  defaultFontFamily?: string;
  namedRangeFills?: Record<string, ColorRgb>;
  settingHeaderRanges?: Record<string, string[]>;
  statusColors?: Record<string, { hex: string; rgb: ColorRgb }>;
}

const PALE_GRAY_HEX = '#F1F3F4';
const PALE_BLUE_HEX = '#E8F0FE';
const PALE_GREEN_HEX = '#E6F4EA';
const PALE_RED_HEX = '#FCE8E6';

const ThemeColors = {
  HEADER_FILL_HEX: '#666666',
  HEADER_FILL_RGB: { red: 0.4, green: 0.4, blue: 0.4 },
  HEADER_TEXT_HEX: '#FFFFFF',
  HEADER_TEXT_RGB: { red: 1.0, green: 1.0, blue: 1.0 },
  FORMULA_ROW_FONT_HEX: '#B7B7B7',
  FORMULA_ROW_FONT_RGB: hexToRgb('#B7B7B7'),
  FORMULA_ROW_FILL_HEX: '#666666',
  FORMULA_ROW_FILL_RGB: { red: 0.4, green: 0.4, blue: 0.4 },
  PALE_GRAY_HEX,
  PALE_GRAY_RGB: hexToRgb(PALE_GRAY_HEX),
  PALE_BLUE_HEX,
  PALE_BLUE_RGB: hexToRgb(PALE_BLUE_HEX),
  PALE_GREEN_HEX,
  PALE_GREEN_RGB: hexToRgb(PALE_GREEN_HEX),
  PALE_RED_HEX,
  PALE_RED_RGB: hexToRgb(PALE_RED_HEX)
};

const StatusColors: Record<string, { hex: string; rgb: ColorRgb }> = {
  Open: { hex: '#F4CCCC', rgb: hexToRgb('#F4CCCC') },
  Closed: { hex: '#D9D9D9', rgb: hexToRgb('#D9D9D9') },
  Waiting: { hex: '#D9D2E9', rgb: hexToRgb('#D9D2E9') },
  Manager: { hex: '#D0E0E3', rgb: hexToRgb('#D0E0E3') },
  Billed: { hex: '#D9D9D9', rgb: hexToRgb('#D9D9D9') }
};

export {
  ThemeColors,
  StatusColors
};

declare let module: { exports?: unknown };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hexToRgb,
    ThemeColors,
    StatusColors
  };
}

(globalThis as any).hexToRgb = hexToRgb;
(globalThis as any).ThemeColors = ThemeColors;
(globalThis as any).StatusColors = StatusColors;
