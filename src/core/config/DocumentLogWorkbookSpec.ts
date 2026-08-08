/**
 * @file DocumentLogWorkbookSpec.ts
 * @description Declarative specification for single-workbook layout (_Config, _Shared, _AuditLog, Submittal Arch, Submittal FFE)
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
  seedRows?: (string | number | boolean)[][];
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
        ["Submittal_Arch", "Architectural Submittals", "SUB-ARCH", "Submittal Arch"],
        ["Submittal_FFE", "FFE Submittals", "SUB-FFE", "Submittal FFE"]
      ]
    },
    {
      name: "_Shared",
      rowCount: 100,
      columnCount: 20,
      isSharedTab: true,
      seedRows: [
        ["Contacts_Arch", "Contacts_FFE", "Actions_Submittal"],
        ["arch-reviewer@example.com", "ffe-reviewer@example.com", "For Approval"],
        ["arch-lead@example.com", "ffe-lead@example.com", "Approved as Noted"],
        ["", "", "Revise and Resubmit"],
        ["", "", "Rejected"],
        ["", "", "For Information Only"]
      ]
    },
    {
      name: "_AuditLog",
      rowCount: 500,
      columnCount: 10,
      isAuditLogTab: true,
      seedRows: [
        ["Timestamp", "Category", "EventType", "Actor", "Status", "Details"]
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
        { id: "contact", header: "Contact", validationRange: "Shared_Contacts_Arch" },
        { id: "action", header: "Action", validationRange: "Actions_Submittal" },
        { id: "status", header: "Status", validationRange: "Actions_Submittal" },
        { id: "notes", header: "Notes" },
        { id: "link", header: "Link" },
        { id: "calcFileName", header: "Calc File Name", formula: '=MAP(A4:A, B4:B, C4:C, D4:D, LAMBDA(sec, num, title, rev, IF(ISBLANK(sec), "", TEXT(sec, "000000") & "-" & TEXT(num, "003") & "-" & title & "-" & rev)))' },
        { id: "calcNumber", header: "Calc Number", formula: '=MAP(A4:A, B4:B, D4:D, LAMBDA(sec, num, rev, IF(ISBLANK(sec), "", TEXT(sec, "000000") & "-" & TEXT(num, "003") & "-" & rev)))' },
        { id: "calcTitle", header: "Calc Title", formula: '=MAP(A4:A, C4:C, LAMBDA(sec, title, IF(ISBLANK(sec), "", title)))' },
        { id: "calcContactChain", header: "Calc Contact Chain", formula: '=MAP(F4:F, LAMBDA(c, IF(ISBLANK(c), "", c)))' },
        { id: "calcSort", header: "Calc Sort", formula: '=MAP(A4:A, B4:B, LAMBDA(sec, num, IF(ISBLANK(sec), "", TEXT(sec, "000000") & TEXT(num, "0000")))'
 }
      ]
    },
    {
      name: "Submittal FFE",
      rowCount: 1000,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "specTag", header: "Spec Tag" },
        { id: "relatedTag", header: "Related Tag" },
        { id: "revision", header: "Revision" },
        { id: "specTitle", header: "Spec Title" },
        { id: "vendor", header: "Vendor" },
        { id: "date", header: "Date" },
        { id: "contact", header: "Contact" },
        { id: "action", header: "Action" },
        { id: "notes", header: "Notes" },
        { id: "link", header: "Link" },
        { id: "calcFileName", header: "Calc File Name" },
        { id: "calcNumber", header: "Calc Number" },
        { id: "calcTitle", header: "Calc Title" },
        { id: "calcContactChain", header: "Calc Contact Chain" },
        { id: "calcSort", header: "Calc Sort" }
      ]
    },
    {
      name: "Submittal Arch Support",
      rowCount: 100,
      columnCount: 10,
      isSupportTab: true,
      seedRows: [
        ["Section Key", "Section Label"],
        ["033000", "Cast-in-Place Concrete"],
        ["081100", "Metal Doors"]
      ]
    },
    {
      name: "Submittal FFE Support",
      rowCount: 100,
      columnCount: 10,
      isSupportTab: true,
      seedRows: [
        ["Vendor Key", "Vendor Label", "SpecTag Key", "SpecTag Label"],
        ["ACME", "Acme Supplies", "CH-01", "Dining Chair"],
        ["GLOBAL", "Global Materials", "TBL-01", "Conference Table"]
      ]
    }
  ],
  namedRanges: [
    { name: "MANIFEST_SCHEMA_VERSION", tabName: "_Config", rangeNotation: "B2", scope: "Workbook" },
    { name: "Config_Manifest", tabName: "_Config", rangeNotation: "A1:B3", scope: "Workbook" },
    { name: "Config_Submittal_Arch", tabName: "_Config", rangeNotation: "A5:D6", scope: "Workbook" },
    { name: "Config_Submittal_FFE", tabName: "_Config", rangeNotation: "A5:D7", scope: "Workbook" },
    { name: "Shared_Contacts_Arch", tabName: "_Shared", rangeNotation: "A2:A20", scope: "Workbook" },
    { name: "Shared_Contacts_FFE", tabName: "_Shared", rangeNotation: "B2:B20", scope: "Workbook" },
    { name: "Actions_Submittal", tabName: "_Shared", rangeNotation: "C2:C20", scope: "Workbook" },
    { name: "AuditLog_Events", tabName: "_AuditLog", rangeNotation: "A1:F500", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal Arch", rangeNotation: "A1:O2", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal Arch", rangeNotation: "A2:O2", scope: "Sheet" },
    { name: "Data", tabName: "Submittal Arch", rangeNotation: "A4:O1000", scope: "Sheet" },
    { name: "Submittal_Arch_Headers", tabName: "Submittal Arch", rangeNotation: "A1:O2", scope: "Workbook" },
    { name: "Submittal_Arch_FormulaRow", tabName: "Submittal Arch", rangeNotation: "A2:O2", scope: "Workbook" },
    { name: "Submittal_Arch_Data", tabName: "Submittal Arch", rangeNotation: "A4:O1000", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal FFE", rangeNotation: "A1:O2", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal FFE", rangeNotation: "A2:O2", scope: "Sheet" },
    { name: "Data", tabName: "Submittal FFE", rangeNotation: "A4:O1000", scope: "Sheet" },
    { name: "Submittal_FFE_Headers", tabName: "Submittal FFE", rangeNotation: "A1:O2", scope: "Workbook" },
    { name: "Submittal_FFE_FormulaRow", tabName: "Submittal FFE", rangeNotation: "A2:O2", scope: "Workbook" },
    { name: "Submittal_FFE_Data", tabName: "Submittal FFE", rangeNotation: "A4:O1000", scope: "Workbook" },
    { name: "Sections", tabName: "Submittal Arch Support", rangeNotation: "A2:B20", scope: "Sheet" },
    { name: "Vendors", tabName: "Submittal FFE Support", rangeNotation: "A2:B20", scope: "Sheet" },
    { name: "SpecTags", tabName: "Submittal FFE Support", rangeNotation: "C2:D20", scope: "Sheet" },
  ]
};


declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
    DOCUMENT_LOG_WORKBOOK_SPEC
  };
}