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
  title?: string;
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
      name: "Submittal Arch",
      rowCount: 8,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "status", header: "Status", validationRange: "Actions_Submittal" },
        { id: "section", header: "Section" },
        { id: "number", header: "Number" },
        { id: "revision", header: "Revision" },
        { id: "title", header: "Title" },
        { id: "date", header: "Date" },
        { id: "contact", header: "Contact", validationRange: "Shared_Contacts_Arch" },
        { id: "action", header: "Action", validationRange: "Actions_Submittal" },
        { id: "notes", header: "Notes" },
        { id: "link", header: "Link" },
        { id: "calcFileName", header: "Calc File Name", formula: '=MAP(B6:B, C6:C, E6:E, D6:D, LAMBDA(sec, num, title, rev, IF(ISBLANK(sec), "", TEXT(sec, "000000") & "-" & TEXT(num, "000") & "-" & title & "-" & rev)))' },
        { id: "calcNumber", header: "Calc Number", formula: '=MAP(B6:B, C6:C, D6:D, LAMBDA(sec, num, rev, IF(ISBLANK(sec), "", TEXT(sec, "000000") & "-" & TEXT(num, "000") & "-" & rev))))' },
        { id: "calcTitle", header: "Calc Title", formula: '=MAP(B6:B, E6:E, LAMBDA(sec, title, IF(ISBLANK((sec), "", title)))' },
        { id: "calcContactChain", header: "Calc Contact Chain", formula: '=MAP(B6:B, G6:G, LAMBDA(sec, contact, IF(ISBLANK(sec), "", contact)))' },
        { id: "calcSort", header: "Calc Sort", formula: '=MAP(B6:B, C6:C, LAMBDA(sec, num, IF(ISBLANK(sec), "", TEXT(sec, "000000") & TEXT(num, "0000"))))' }
      ],
      seedRows: [
        ["Open", "033000", 1, "0", "Concrete Mix Design", "2026-08-08", "arch-reviewer@example.com", "For Approval", "Initial submittal for review", ""],
        ["Approved as Noted", "081100", 1, "0", "Metal Doors & Frames", "2026-08-08", "arch-lead@example.com", "Approved as Noted", "Approved with door schedule notes", ""]
      ]
    },
    {
      name: "Submittal FFE",
      rowCount: 8,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "status", header: "Status", validationRange: "Actions_Submittal" },
        { id: "specTag", header: "Spec Tag", validationRange: "SpecTags" },
        { id: "relatedTag", header: "Related Tag", validationRange: "SpecTags" },
        { id: "revision", header: "Revision" },
        { id: "specTitle", header: "Spec Title" },
        { id: "vendor", header: "Vendor", validationRange: "Vendors" },
        { id: "date", header: "Date" },
        { id: "contact", header: "Contact", validationRange: "Shared_Contacts_FFE" },
        { id: "action", header: "Action", validationRange: "Actions_Submittal" },
        { id: "notes", header: "Notes" },
        { id: "link", header: "Link" },
        { id: "calcFileName", header: "Calc File Name", formula: '=MAP(B6:B, C6:C, D6:D, LAMBDA(tag, rel, rev, IF(ISBLANK(tag), "", tag & IF(ISBLANK(rel), "", "-" & rel) & "-" & rev))' },
        { id: "calcNumber", header: "Calc Number", formula: '=MAP(B6:B, D6:D, LAMBDA(tag, rev, IF(ISBLANK(tag), "", tag & "-" & rev))' },
        { id: "calcTitle", header: "Calc Title", formula: '=MAP(B6:B, E6:E, LAMBDA(tag, title, IF(ISBLANK(tag), IF(ISBLANK(title), "", title), IFERROR(VLOOKUP(tag, \'Submittal FFE Support\'!SpecTags, 2, FALSE), title)))' },
        { id: "calcContactChain", header: "Calc Contact Chain", formula: '=MAP(H6:H, I6:I, LAMBDA(c, a, IF(ISBLANK(c), "", c & IF(ISBLANK(a), "", " (" & a & ")")))' },
        { id: "calcSort", header: "Calc Sort", formula: '=MAP(B6:B, D6:D, LAMBDA(tag, rev, IF(ISBLANK(tag), "", tag & "_" & rev))' }
      ],
      seedRows: [
        ["Open", "CH-01", "", "0", "Dining Chair", "ACME", "2026-08-08", "ffe-reviewer@example.com", "For Approval", "Finish sample submittal", ""],
        ["Waiting", "TBL-01", "", "0", "Conference Table", "GLOBAL", "2026-08-08", "ffe-lead@example.com", "Revise and Resubmit", "Veneer sample update required", ""]
      ]
    },
    {
      name: "Submittal Arch Support",
      rowCount: 3,
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
      rowCount: 3,
      columnCount: 10,
      isSupportTab: true,
      seedRows: [
        ["Vendor Key", "Vendor Label", "SpecTag Key", "SpecTag Label"],
        ["ACME", "Acme Supplies", "CH-01", "Dining Chair"],
        ["GLOBAL", "Global Materials", "TBL-01", "Conference Table"]
      ]
    },
    {
      name: "_Shared",
      rowCount: 6,
      columnCount: 20,
      isSharedTab: true,
      seedRows: [
        ["Contact Type", "Contact Abbr.", "Contact Full Name", "", "Action Order", "Actions", "Action Abbr."],
        ["Arch", "ARCH", "arch-reviewer@example.com", "", 1, "For Approval", "_NET"],
        ["Arch", "ARCH-LEAD", "arch-lead@example.com", "", 2, "Approved as Noted", "_NOC"],
        ["FFE", "FFE", "ffe-reviewer@example.com", "", 3, "Revise and Resubmit", "_RR"],
        ["FFE", "FFE-LEAD", "ffe-lead@example.com", "", 4, "Rejected", "_REJ"],
        ["", "", "", "", 5, "For Information Only", "_REF"]
      ]
    },
    {
      name: "_Config",
      rowCount: 7,
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
      name: "_AuditLog",
      title: "Audit Log",
      rowCount: 7,
      columnCount: 10,
      isAuditLogTab: true,
      columns: [
        { id: "timestamp", header: "Timestamp" },
        { id: "category", header: "Category" },
        { id: "eventType", header: "EventType" },
        { id: "actor", header: "Actor" },
        { id: "status", header: "Status" },
        { id: "details", header: "Details" }
      ],
      seedRows: [
        ["2026-08-08T00:00:00.000Z", "SYSTEM", "SCHEMA_INIT", "system", "SUCCESS", "Initial MVT Template Provisioning"]
      ]
    }
  ],
  namedRanges: [
    { name: "MANIFEST_SCHEMA_VERSION", tabName: "_Config", rangeNotation: "B2", scope: "Workbook" },
    { name: "Config_Manifest", tabName: "_Config", rangeNotation: "A1:B3", scope: "Workbook" },
    { name: "Config_Submittal_Arch", tabName: "_Config", rangeNotation: "A5:D6", scope: "Workbook" },
    { name: "Config_Submittal_FFE", tabName: "_Config", rangeNotation: "A5:D7", scope: "Workbook" },
    { name: "Shared_Contacts_Arch", tabName: "_Shared", rangeNotation: "A2:C3", scope: "Workbook" },
    { name: "Shared_Contacts_FFE", tabName: "_Shared", rangeNotation: "A4:C5", scope: "Workbook" },
    { name: "Actions_Submittal", tabName: "_Shared", rangeNotation: "E2:G6", scope: "Workbook" },
    { name: "AuditLog_Events", tabName: "_AuditLog", rangeNotation: "A6:F7", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal Arch", rangeNotation: "A3:O4", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal Arch", rangeNotation: "A4:O4", scope: "Sheet" },
    { name: "Data", tabName: "Submittal Arch", rangeNotation: "A6:O8", scope: "Sheet" },
    { name: "Submittal_Arch_Headers", tabName: "Submittal Arch", rangeNotation: "A3:O4", scope: "Workbook" },
    { name: "Submittal_Arch_FormulaRow", tabName: "Submittal Arch", rangeNotation: "A4:O4", scope: "Workbook" },
    { name: "Submittal_Arch_Data", tabName: "Submittal Arch", rangeNotation: "A6:O8", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal FFE", rangeNotation: "A3:P4", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal FFE", rangeNotation: "A4:P4", scope: "Sheet" },
    { name: "Data", tabName: "Submittal FFE", rangeNotation: "A6:P8", scope: "Sheet" },
    { name: "Submittal_FFE_Headers", tabName: "Submittal FFE", rangeNotation: "A3:P4", scope: "Workbook" },
    { name: "Submittal_FFE_FormulaRow", tabName: "Submittal FFE", rangeNotation: "A4:P4", scope: "Workbook" },
    { name: "Submittal_FFE_Data", tabName: "Submittal FFE", rangeNotation: "A6:P8", scope: "Workbook" },
    { name: "Sections", tabName: "Submittal Arch Support", rangeNotation: "A2:B3", scope: "Sheet" },
    { name: "Submittal_Arch_Support_Sections", tabName: "Submittal Arch Support", rangeNotation: "A2:B3", scope: "Workbook" },
    { name: "Vendors", tabName: "Submittal FFE Support", rangeNotation: "A2:B3", scope: "Sheet" },
    { name: "SpecTags", tabName: "Submittal FFE Support", rangeNotation: "C2:D3", scope: "Sheet" },
  ]
};

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
    DOCUMENT_LOG_WORKBOOK_SPEC
  };
}
