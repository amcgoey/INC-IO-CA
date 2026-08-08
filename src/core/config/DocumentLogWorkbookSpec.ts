/**
 * @file DocumentLogWorkbookSpec.ts
 * @description Declarative specification for single-workbook layout (_Config, _Shared, _AuditLog, Submittal Arch)
 * and Dual-Tier Named Range taxonomy (Workbook-Scoped and Sheet-Scoped Headers, FormulaRow, Data).
 */

export const DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION = "1.0.0";

export interface ColumnSpec {
  id: string;
  header: string;
  width?: number;
  formula?: string;
  validationRange?: string;
}

export interface TabSpec {
  name: string;
  rowCount: number;
  columnCount: number;
  isConfigTab?: boolean;
  isSharedTab?: boolean;
  isAuditLogTab?: boolean;
  isLogTab?: boolean;
  isSupportTab?: boolean;
  columns?: ColumnSpec[];
  seedRows?: any[][];
}

export interface NamedRangeSpec {
  name: string;
  tabName: string;
  rangeNotation: string;
  scope?: "Workbook" | "Sheet";
}

export interface DocumentLogWorkbookSpec {
  schemaVersion: string;
  tabs: TabSpec[];
  namedRanges: NamedRangeSpec[];
}

export const DOCUMENT_LOG_WORKBOOK_SPEC: DocumentLogWorkbookSpec = {
  schemaVersion: DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
  tabs: [
    {
      name: "_Config",
      rowCount: 100,
      columnCount: 20,
      isConfigTab: true,
      seedRows: [
        ["Key", "Value"],
        ["MANIFEST_SCHEMA_VERSION", DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION],
        ["LOG_TITLE", "INC Project Document Log"],
        ["", ""],
        ["DocTypeKey", "DisplayName", "Prefix", "LogTabName"],
        ["Submittal_Arch", "Architectural Submittals", "SUB-ARCH", "Submittal Arch"]
      ]
    },
    {
      name: "_Shared",
      rowCount: 100,
      columnCount: 20,
      isSharedTab: true,
      seedRows: [
        ["Contacts_Arch"],
        ["arch-reviewer@example.com"],
        ["arch-lead@example.com"]
      ]
    },
    {
      name: "_AuditLog",
      rowCount: 500,
      columnCount: 10,
      isAuditLogTab: true,
      seedRows: [
        ["Timestamp", "EventType", "Category", "Actor", "Status", "Details"]
      ]
    },
    {
      name: "Submittal Arch",
      rowCount: 1000,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "section", header: "Section" },
        { id: "number", header: "Number" },
        { id: "title", header: "Title" },
        { id: "revision", header: "Revision" },
        { id: "date", header: "Date" },
        { id: "contact", header: "Contact" },
        { id: "action", header: "Action" },
        { id: "status", header: "Status" },
        { id: "notes", header: "Notes" },
        { id: "link", header: "Link" },
        { id: "contactHistory", header: "Contact History" }
      ]
    }
  ],
  namedRanges: [
    { name: "MANIFEST_SCHEMA_VERSION", tabName: "_Config", rangeNotation: "B2", scope: "Workbook" },
    { name: "Config_Manifest", tabName: "_Config", rangeNotation: "A1:B3", scope: "Workbook" },
    { name: "Config_Submittal_Arch", tabName: "_Config", rangeNotation: "A5:D6", scope: "Workbook" },
    { name: "Shared_Contacts_Arch", tabName: "_Shared", rangeNotation: "A2:A20", scope: "Workbook" },
    { name: "AuditLog_Events", tabName: "_AuditLog", rangeNotation: "A1:F100", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal Arch", rangeNotation: "A1:K1", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal Arch", rangeNotation: "A2:K2", scope: "Sheet" },
    { name: "Data", tabName: "Submittal Arch", rangeNotation: "A4:K1000", scope: "Sheet" },
    { name: "Submittal_Arch_Headers", tabName: "Submittal Arch", rangeNotation: "A1:K1", scope: "Workbook" },
    { name: "Submittal_Arch_FormulaRow", tabName: "Submittal Arch", rangeNotation: "A2:K2", scope: "Workbook" },
    { name: "Submittal_Arch_Data", tabName: "Submittal Arch", rangeNotation: "A4:K1000", scope: "Workbook" }
  ]
};

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
    DOCUMENT_LOG_WORKBOOK_SPEC
  };
}
