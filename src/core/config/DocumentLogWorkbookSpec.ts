/**
 * @file DocumentLogWorkbookSpec.ts
 * @description Declarative specification for single-workbook layout (_Config, _Shared, _AuditLog, Submittal Arch, Submittal FFE)
 * and Dual-Tier Named Range taxonomy (Workbook-Scoped and Sheet-Scoped Headers, FormulaRow, Data).
 */

export const DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION = "1.0.0";

export const TEST_TEMPLATE_SPREADSHEET_TITLE = "INC Document Log - Test Template";
export const PROD_TEMPLATE_SPREADSHEET_TITLE = "INC Document Log - Template";

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
      rowCount: 20,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "status", header: "Status", validationRange: "Statuses_Submittal" },
        { id: "section", header: "Section" },
        { id: "number", header: "Number" },
        { id: "revision", header: "Revision" },
        { id: "title", header: "Title" },
        { id: "date", header: "Date" },
        { id: "contact", header: "Contact", validationRange: "Shared_Contacts_Arch" },
        { id: "action", header: "Action", validationRange: "Actions_Submittal" },
        { id: "notes", header: "Notes" },
        { id: "link", header: "Link" },
        { id: "calcFileName", header: "Calc File Name", formula: '=MAP(B4:B, C4:C, E4:E, D4:D, LAMBDA(sec, num, title, rev, IF(ISBLANK(sec), "", TEXT(sec, "000000") & "-" & TEXT(num, "000") & "-" & title & "-" & rev)))' },
        { id: "calcNumber", header: "Calc Number", formula: '=MAP(B4:B, C4:C, D4:D, LAMBDA(sec, num, rev, IF(ISBLANK(sec), "", TEXT(sec, "000000") & "-" & TEXT(num, "000") & "-" & rev)))' },
        { id: "calcTitle", header: "Calc Title", formula: '=MAP(B4:B, E4:E, LAMBDA(sec, title, IF(ISBLANK(sec), "", title)))' },
        { id: "calcContactChain", header: "Calc Contact Chain", formula: '=MAP(B4:B, G4:G, LAMBDA(sec, contact, IF(ISBLANK(sec), "", contact)))' },
        { id: "calcSort", header: "Calc Sort", formula: '=MAP(B4:B, C4:C, LAMBDA(sec, num, IF(ISBLANK(sec), "", TEXT(sec, "000000") & TEXT(num, "0000"))))' }
      ],
      seedRows: [
        ["Open", "071200", 1, "0", "Fluid-Applied Waterproofing", "2026-08-01", "PMG", "Received", "Initial submittal received from PMG", ""],
        ["Open", "071200", 1, "0", "Fluid-Applied Waterproofing", "2026-08-02", "INC", "Open", "Under active review by INC", ""],
        ["Closed", "092900", 1, "0", "Gypsum Board Shaft Wall Assemblies", "2026-07-10", "PMG", "Received", "Rev 1 submittal received from PMG", ""],
        ["Closed", "092900", 1, "0", "Gypsum Board Shaft Wall Assemblies", "2026-07-12", "INC", "Revise & Resubmit", "Returned to PMG for resubmittal", ""],
        ["Closed", "092900", 1, "1", "Gypsum Board Shaft Wall Assemblies", "2026-07-20", "PMG", "Received", "Rev 2 resubmittal received from PMG", ""],
        ["Closed", "092900", 1, "1", "Gypsum Board Shaft Wall Assemblies", "2026-07-21", "IE", "Referred", "Referred to IE for consultant review", ""],
        ["Closed", "092900", 1, "1", "Gypsum Board Shaft Wall Assemblies", "2026-07-24", "IE", "No Exceptions Taken", "Consultant review complete - no exceptions", ""],
        ["Closed", "092900", 1, "1", "Gypsum Board Shaft Wall Assemblies", "2026-07-25", "INC", "No Objection as Corrected", "Final approval as corrected", ""],
        ["Closed", "093000", 1, "0", "Tiling Assemblies", "2026-07-01", "PMG", "Received", "Rev 1 submittal received from PMG", ""],
        ["Closed", "093000", 1, "0", "Tiling Assemblies", "2026-07-03", "INC", "Rejected", "Rejected due to missing product data", ""],
        ["Closed", "093000", 1, "1", "Tiling Assemblies", "2026-07-15", "PMG", "Received", "Rev 2 resubmittal received from PMG", ""],
        ["Closed", "093000", 1, "1", "Tiling Assemblies", "2026-07-16", "IE", "Referred", "Referred to IE for tile membrane review", ""],
        ["Closed", "093000", 1, "1", "Tiling Assemblies", "2026-07-18", "IE", "No Exceptions Taken", "Consultant review complete - no exceptions", ""],
        ["Closed", "093000", 1, "1", "Tiling Assemblies", "2026-07-19", "INC", "No Objection as Corrected", "Final approval as corrected", ""]
      ]
    },
    {
      name: "Submittal FFE",
      rowCount: 18,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "status", header: "Status", validationRange: "Statuses_Submittal" },
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
        { id: "calcFileName", header: "Calc File Name", formula: '=MAP(B4:B, C4:C, D4:D, LAMBDA(tag, rel, rev, IF(ISBLANK(tag), "", tag & IF(ISBLANK(rel), "", "-" & rel) & "-" & rev)))' },
        { id: "calcNumber", header: "Calc Number", formula: '=MAP(B4:B, D4:D, LAMBDA(tag, rev, IF(ISBLANK(tag), "", tag & "-" & rev)))' },
        { id: "calcTitle", header: "Calc Title", formula: '=MAP(B4:B, E4:E, LAMBDA(tag, title, IF(ISBLANK(tag), IF(ISBLANK(title), "", title), IFERROR(VLOOKUP(tag, \'Submittal FFE Support\'!SpecTags, 2, FALSE), title))))' },
        { id: "calcContactChain", header: "Calc Contact Chain", formula: '=MAP(H4:H, I4:I, LAMBDA(c, a, IF(ISBLANK(c), "", c & IF(ISBLANK(a), "", " (" & a & ")"))))' },
        { id: "calcSort", header: "Calc Sort", formula: '=MAP(B4:B, D4:D, LAMBDA(tag, rev, IF(ISBLANK(tag), "", tag & "_" & rev)))' }
      ],
      seedRows: [
        ["Closed", "AC102", "", "0", "Hook", "Ashley Lighting", "2026-07-05", "BW", "Received", "Rev 1 sample submittal received", ""],
        ["Closed", "AC102", "", "0", "Hook", "Ashley Lighting", "2026-07-07", "INC", "Revise & Resubmit", "Finish sample rejected, resubmittal required", ""],
        ["Closed", "AC102", "", "1", "Hook", "Ashley Lighting", "2026-07-15", "BW", "Received", "Rev 2 finish sample resubmittal received", ""],
        ["Closed", "AC102", "", "1", "Hook", "Ashley Lighting", "2026-07-17", "INC", "No Objection as Corrected", "Approved with finish notes", ""],
        ["Closed", "CG138", "", "0", "Credenza", "Fil Doux Textiles", "2026-07-08", "BW", "Received", "Rev 1 shop drawings received", ""],
        ["Closed", "CG138", "", "0", "Credenza", "Fil Doux Textiles", "2026-07-10", "INC", "Rejected", "Dimensions do not match specification", ""],
        ["Closed", "CG138", "", "1", "Credenza", "Fil Doux Textiles", "2026-07-20", "BW", "Received", "Rev 2 revised shop drawings received", ""],
        ["Closed", "CG138", "", "1", "Credenza", "Fil Doux Textiles", "2026-07-22", "INC", "No Objection as Corrected", "Approved as corrected with dimension updates", ""],
        ["Open", "FB132B", "", "0", "Fabric Woven", "Carnegie", "2026-08-03", "BW", "Received", "Initial fabric submittal received", ""],
        ["Open", "FB132B", "", "0", "Fabric Woven", "Carnegie", "2026-08-04", "INC", "Open", "Under active review by INC", ""],
        ["Open", "LT150", "", "0", "Pendant", "Light Annex", "2026-08-01", "BW", "Received", "Initial fixture cutsheet submittal received", ""],
        ["Open", "LT150", "", "0", "Pendant", "Light Annex", "2026-08-03", "INC", "Revise & Resubmit", "Driver voltage specification missing", ""]
      ]
    },
    {
      name: "Submittal Arch Support",
      rowCount: 6,
      columnCount: 10,
      isSupportTab: true,
      seedRows: [
        ["Section Key", "Section Label"],
        ["071200", "Fluid-Applied Waterproofing"],
        ["092900", "Gypsum Board Shaft Wall Assemblies"],
        ["093000", "Tiling Assemblies"],
        ["033000", "Cast-in-Place Concrete"],
        ["081100", "Metal Doors"]
      ]
    },
    {
      name: "Submittal FFE Support",
      rowCount: 7,
      columnCount: 10,
      isSupportTab: true,
      seedRows: [
        ["Vendor Key", "Vendor Label", "SpecTag Key", "SpecTag Label"],
        ["Ashley Lighting", "Ashley Lighting", "AC102", "Hook"],
        ["Fil Doux Textiles", "Fil Doux Textiles", "CG138", "Credenza"],
        ["Carnegie", "Carnegie", "FB132B", "Fabric Woven"],
        ["Light Annex", "Light Annex", "LT150", "Pendant"],
        ["ACME", "Acme Supplies", "CH-01", "Dining Chair"],
        ["GLOBAL", "Global Materials", "TBL-01", "Conference Table"]
      ]
    },
    {
      name: "_Shared",
      rowCount: 100,
      columnCount: 20,
      isSharedTab: true,
      seedRows: [
        ["Contacts_Arch Key", "Contacts_Arch Label", "Contacts_FFE Key", "Contacts_FFE Label", "Actions Key", "Actions Label", "Statuses Key", "Statuses Label"],
        ["INC", "INC Architecture and Design", "INC", "INC Architecture & Design", "Received", "Received", "Open", "Open"],
        ["PMG", "Pavarini McGovern", "BW", "Benjamin West", "Referred", "Referred", "Closed", "Closed"],
        ["FXC", "FX Collaborative", "Lighting", "Lighting", "Not Reviewed", "Not Reviewed", "", ""],
        ["IE", "Interface Engineering", "Brand", "Brand", "Rejected", "Rejected", "", ""],
        ["VLD", "Ventresca Lighting Design", "", "", "Revise & Resubmit", "Revise & Resubmit", "", ""],
        ["", "", "", "", "No Objection as Corrected", "No Objection as Corrected", "", ""],
        ["", "", "", "", "No Exceptions Taken", "No Exceptions Taken", "", ""]
      ]
    },
    {
      name: "_Config",
      rowCount: 10,
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
    { name: "Config_Manifest", tabName: "_Config", rangeNotation: "A1:B5", scope: "Workbook" },
    { name: "Config_Submittal_Arch", tabName: "_Config", rangeNotation: "A7:D8", scope: "Workbook" },
    { name: "Config_Submittal_FFE", tabName: "_Config", rangeNotation: "A7:D9", scope: "Workbook" },
    { name: "Shared_Contacts_Arch", tabName: "_Shared", rangeNotation: "A2:B20", scope: "Workbook" },
    { name: "Shared_Contacts_FFE", tabName: "_Shared", rangeNotation: "C2:D20", scope: "Workbook" },
    { name: "Actions_Submittal", tabName: "_Shared", rangeNotation: "E2:F20", scope: "Workbook" },
    { name: "Statuses_Submittal", tabName: "_Shared", rangeNotation: "G2:H20", scope: "Workbook" },
    { name: "AuditLog_Events", tabName: "_AuditLog", rangeNotation: "A6:F7", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal Arch", rangeNotation: "A3:O4", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal Arch", rangeNotation: "A4:O4", scope: "Sheet" },
    { name: "Data", tabName: "Submittal Arch", rangeNotation: "A6:O20", scope: "Sheet" },
    { name: "Submittal_Arch_Headers", tabName: "Submittal Arch", rangeNotation: "A3:O4", scope: "Workbook" },
    { name: "Submittal_Arch_FormulaRow", tabName: "Submittal Arch", rangeNotation: "A4:O4", scope: "Workbook" },
    { name: "Submittal_Arch_Data", tabName: "Submittal Arch", rangeNotation: "A6:O20", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal FFE", rangeNotation: "A3:P4", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal FFE", rangeNotation: "A4:P4", scope: "Sheet" },
    { name: "Data", tabName: "Submittal FFE", rangeNotation: "A6:P18", scope: "Sheet" },
    { name: "Submittal_FFE_Headers", tabName: "Submittal FFE", rangeNotation: "A3:P4", scope: "Workbook" },
    { name: "Submittal_FFE_FormulaRow", tabName: "Submittal FFE", rangeNotation: "A4:P4", scope: "Workbook" },
    { name: "Submittal_FFE_Data", tabName: "Submittal FFE", rangeNotation: "A6:P18", scope: "Workbook" },
    { name: "Sections", tabName: "Submittal Arch Support", rangeNotation: "A2:B20", scope: "Sheet" },
    { name: "Submittal_Arch_Support_Sections", tabName: "Submittal Arch Support", rangeNotation: "A2:B20", scope: "Workbook" },
    { name: "Vendors", tabName: "Submittal FFE Support", rangeNotation: "A2:B20", scope: "Sheet" },
    { name: "SpecTags", tabName: "Submittal FFE Support", rangeNotation: "C2:D20", scope: "Sheet" }
  ]
};

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
    TEST_TEMPLATE_SPREADSHEET_TITLE,
    PROD_TEMPLATE_SPREADSHEET_TITLE,
    DOCUMENT_LOG_WORKBOOK_SPEC
  };
}
