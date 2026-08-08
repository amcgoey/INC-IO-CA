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
        ["PROJECT_ABBREVIATION", "INC"],
        ["CONTACT_CHAIN_MAX", "-5"],
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
        ["Contacts_Arch Key", "Contacts_Arch Label", "Contacts_FFE Key", "Contacts_FFE Label", "Actions Key", "Actions Label"],
        ["INC", "INC Architecture and Design", "INC", "INC Architecture & Design", "Received", "Received"],
        ["PMG", "Pavarini McGovern", "BW", "Benjamin West", "Referred", "Referred"],
        ["FXC", "FX Collaborative", "Lighting", "Lighting", "Not Reviewed", "Not Reviewed"],
        ["IE", "Interface Engineering", "Brand", "Brand", "Rejected", "Rejected"],
        ["VLD", "Ventresca Lighting Design", "", "", "Revise & Resubmit", "Revise & Resubmit"],
        ["", "", "", "", "No Objection as Corrected", "No Objection as Corrected"],
        ["", "", "", "", "No Exceptions Taken", "No Exceptions Taken"]
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
        ["BERMAN FALK", "Berman Falk", "AC102", "HOOK"],
        ["ASHLEY", "Ashley Lighting", "CG104", "BED - KING"],
        ["CARNEGIE", "Carnegie", "CG126", "BED - DOUBLE QUEEN"],
        ["DELTA", "Delta", "CG138", "CREDENZA"],
        ["FIL DOUX", "Fil Doux Textiles", "CG138M", "CREDENZA - MIRRORED"],
        ["LIGHT ANNEX", "Light Annex", "CP112", "CARPET - CORRIDOR"],
        ["MOHAWK", "Mohawk", "", ""]
      ]
    }
  ],
  namedRanges: [
    { name: "MANIFEST_SCHEMA_VERSION", tabName: "_Config", rangeNotation: "B2", scope: "Workbook" },
    { name: "Config_Manifest", tabName: "_Config", rangeNotation: "A1:B5", scope: "Workbook" },
    { name: "Config_Submittal_Arch", tabName: "_Config", rangeNotation: "A7:D8", scope: "Workbook" },
    { name: "Shared_Contacts_Arch", tabName: "_Shared", rangeNotation: "A2:B20", scope: "Workbook" },
    { name: "Shared_Contacts_FFE", tabName: "_Shared", rangeNotation: "C2:D20", scope: "Workbook" },
    { name: "Actions_Submittal", tabName: "_Shared", rangeNotation: "E2:F20", scope: "Workbook" },
    { name: "AuditLog_Events", tabName: "_AuditLog", rangeNotation: "A1:F100", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal Arch", rangeNotation: "A1:K2", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal Arch", rangeNotation: "A2:K2", scope: "Sheet" },
    { name: "Data", tabName: "Submittal Arch", rangeNotation: "A4:K1000", scope: "Sheet" },
    { name: "Submittal_Arch_Headers", tabName: "Submittal Arch", rangeNotation: "A1:K2", scope: "Workbook" },
    { name: "Submittal_Arch_FormulaRow", tabName: "Submittal Arch", rangeNotation: "A2:K2", scope: "Workbook" },
    { name: "Submittal_Arch_Data", tabName: "Submittal Arch", rangeNotation: "A4:K1000", scope: "Workbook" },
    { name: "Sections", tabName: "Submittal Arch Support", rangeNotation: "A2:B20", scope: "Sheet" },
    { name: "Vendors", tabName: "Submittal FFE Support", rangeNotation: "A2:B20", scope: "Sheet" },
    { name: "SpecTags", tabName: "Submittal FFE Support", rangeNotation: "C2:D20", scope: "Sheet" }
  ]
};

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
    DOCUMENT_LOG_WORKBOOK_SPEC
  };
}
