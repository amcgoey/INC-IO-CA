/**
 * @file DocumentLogWorkbookViewSpec.ts
 * @description Aesthetic design system tokenizing visual presentation attributes (#666666 header fill, white text, column widths, font typography).
 */

export interface ThemeColorsSpec {
  headerFill: string;
  headerText: string;
  formulaRowFill: string;
  formulaRowText: string;
  accentColor: string;
}

export interface HeaderStyleSpec {
  bold: boolean;
  fontSize: number;
  fontFamily: string;
  backgroundColor: string;
  foregroundColor: string;
  horizontalAlignment: "LEFT" | "CENTER" | "RIGHT";
}

export interface ColumnWidthSpec {
  [columnId: string]: number;
}

export interface DocumentLogWorkbookViewSpec {
  themeColors: ThemeColorsSpec;
  headerStyle: HeaderStyleSpec;
  defaultColumnWidth: number;
  columnWidths: Record<string, ColumnWidthSpec>;
}

const themeColors: ThemeColorsSpec = {
  headerFill: "#666666",
  headerText: "#FFFFFF",
  formulaRowFill: "#F3F3F3",
  formulaRowText: "#666666",
  accentColor: "#4A90E2"
};

const headerStyle: HeaderStyleSpec = {
  bold: true,
  fontSize: 10,
  fontFamily: "Arial",
  backgroundColor: themeColors.headerFill,
  foregroundColor: themeColors.headerText,
  horizontalAlignment: "LEFT"
};

export const DOCUMENT_LOG_WORKBOOK_VIEW_SPEC: DocumentLogWorkbookViewSpec = {
  themeColors,
  headerStyle,
  defaultColumnWidth: 120,
  columnWidths: {
    "Submittal Arch": {
      section: 100,
      number: 80,
      title: 250,
      revision: 80,
      date: 100,
      contact: 180,
      action: 140,
      status: 120,
      notes: 200,
      link: 150,
      contactHistory: 220
    },
    "Submittal FFE": {
      specTag: 100,
      relatedTag: 110,
      revision: 80,
      specTitle: 250,
      vendor: 180,
      date: 100,
      contact: 180,
      action: 140,
      notes: 200,
      link: 150,
      calcFileName: 160,
      calcNumber: 120,
      calcTitle: 200,
      calcContactChain: 220,
      calcSort: 140
    }
  }
};

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DOCUMENT_LOG_WORKBOOK_VIEW_SPEC
  };
}