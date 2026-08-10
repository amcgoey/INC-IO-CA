/**
 * @file DocumentLogWorkbookSpec.ts
 * @description Declarative specification for single-workbook layout (_Config, _Shared, _AuditLog, Submittal Arch, Submittal FFE)
 * and Dual-Tier Named Range taxonomy (Workbook-Scoped and Sheet-Scoped Headers, FormulaRow, Data).
 */

const DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION = "1.0.0";

const TEST_TEMPLATE_SPREADSHEET_TITLE = "INC Document Log - Test Template";
const PROD_TEMPLATE_SPREADSHEET_TITLE = "INC Document Log - Template";

export type ValidationType = "LIST_FROM_RANGE" | "REGEX_MATCH" | "DATE_FORMAT" | "NUMBER_RANGE" | "CUSTOM_FORMULA";

export interface ValidationRuleSpec {
  type: ValidationType;
  targetNamedRange?: string;
  pattern?: string;
  minValue?: number;
  maxValue?: number;
  allowInvalid: boolean;
  helpText?: string;
}

export interface ColumnSpec {
  id: string;
  header: string;
  width?: number;
  formula?: string;
  /** @deprecated Use validationRule instead */
  validationRange?: string;
  validationRule?: ValidationRuleSpec;
  numberFormat?: string;
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


export type ProtectionTierType =
  | "SYSTEM_TAB_PROTECTION"
  | "HEADER_AND_FORMULA_PROTECTION"
  | "CALCULATED_COLUMN_PROTECTION";

export interface ProtectionTierSpec {
  tier: ProtectionTierType;
  description: string;
  warningOnly: boolean;
}

const PROTECTION_TIER_SPECS: Record<ProtectionTierType, ProtectionTierSpec> = {
  SYSTEM_TAB_PROTECTION: {
    tier: "SYSTEM_TAB_PROTECTION",
    description: "System tab protection with warning prompt for configuration and audit logs",
    warningOnly: true
  },
  HEADER_AND_FORMULA_PROTECTION: {
    tier: "HEADER_AND_FORMULA_PROTECTION",
    description: "Header stack and formula row protection with warning prompt",
    warningOnly: true
  },
  CALCULATED_COLUMN_PROTECTION: {
    tier: "CALCULATED_COLUMN_PROTECTION",
    description: "Calculated column protection with warning prompt across data rows",
    warningOnly: true
  }
};

export interface DocumentLogWorkbookSpec {
  schemaVersion: string;
  tabs: TabSpec[];
  namedRanges: NamedRangeSpec[];
}

const DOCUMENT_LOG_WORKBOOK_SPEC: DocumentLogWorkbookSpec = {
  schemaVersion: DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
  tabs: [
    {
      name: "Submittal Arch",
      rowCount: 25,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "status", header: "Status", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "Statuses_Submittal_Labels", allowInvalid: false } },
        { id: "section", header: "Section", numberFormat: "000000" },
        { id: "number", header: "Number", numberFormat: "000" },
        { id: "revision", header: "Revision", numberFormat: "0" },
        { id: "title", header: "Title" },
        { id: "date", header: "Date", numberFormat: "yyMMdd" },
        { id: "contact", header: "Contact", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "Shared_Contacts_Arch_Keys", allowInvalid: false } },
        { id: "action", header: "Action", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "Actions_Submittal_Labels", allowInvalid: false } },
        { id: "notes", header: "Notes" },
        { id: "link", header: "Link" },
        { id: "calcFileName", header: "Calc File Name", formula: '=MAP(B4:B, C4:C, E4:E, D4:D, LAMBDA(sec, num, title, rev, IF(ISBLANK(sec), "", TEXT(sec, "000000") & "-" & TEXT(num, "000") & "-" & title & "-" & rev)))' },
        { id: "calcNumber", header: "Calc Number", formula: '=MAP(B4:B, C4:C, D4:D, LAMBDA(sec, num, rev, IF(ISBLANK(sec), "", TEXT(sec, "000000") & "-" & TEXT(num, "000") & "-" & rev)))' },
        { id: "calcTitle", header: "Calc Title", formula: '=MAP(B4:B, E4:E, LAMBDA(sec, title, IF(ISBLANK(sec), "", title)))' },
        { id: "calcContactChain", header: "Calc Contact Chain", formula: '=MAP(B4:B, G4:G, LAMBDA(sec, contact, IF(ISBLANK(sec), "", contact)))' },
        { id: "calcSort", header: "Calc Sort", formula: '=MAP(B4:B, C4:C, LAMBDA(sec, num, IF(ISBLANK(sec), "", TEXT(sec, "000000") & TEXT(num, "0000"))))' }
      ],
      seedRows: [
        ["Closed", "071200", 1, "1", "Test", "230726", "PMG", "Received", "", ""],
        ["Open", "071200", 1, "1", "Test", "230726", "INC", "", "", ""],
        ["", "", "", "", "", "", "", "", "", ""],
        ["Billed", "092900", 1, "1", "Gyp Bd", "230720", "PMG", "Received", "", ""],
        ["Billed", "092900", 1, "1", "Gyp Bd", "230721", "INC", "Revise & Resubmit", "", ""],
        ["Billed", "092900", 1, "2", "Gyp Bd", "230722", "PMG", "Received", "", ""],
        ["Billed", "092900", 1, "2", "Gyp Bd", "230722", "IE", "Referred", "", ""],
        ["Billed", "092900", 1, "2", "Gyp Bd", "230723", "IE", "No Exceptions Taken", "", ""],
        ["Billed", "092900", 1, "2", "Gyp Bd", "230724", "INC", "No Objection as Corrected", "", ""],
        ["", "", "", "", "", "", "", "", "", ""],
        ["Closed", "093000", 1, "1", "Gyp Bd", "230720", "PMG", "Received", "", ""],
        ["Closed", "093000", 1, "1", "Gyp Bd", "230721", "INC", "Rejected", "", ""],
        ["Closed", "093000", 1, "2", "Gyp Bd", "230722", "PMG", "Received", "", ""],
        ["Waiting", "093000", 1, "2", "Gyp Bd", "230722", "IE", "Referred", "", ""],
        ["Open", "093000", 1, "2", "Gyp Bd", "230723", "IE", "No Exceptions Taken", "", ""],
        ["Manager", "093000", 1, "2", "Gyp Bd", "230724", "INC", "No Objection as Corrected", "", ""],
        ["", "", "", "", "", "", "", "", "", ""],
        ["Closed", "280000", 1, "1", "Test 2", "230731", "PMG", "Received", "", ""],
        ["Open", "280000", 1, "1", "Test 2", "230731", "INC", "Revise & Resubmit", "", ""]
      ]
    },
    {
      name: "Submittal FFE",
      rowCount: 25,
      columnCount: 26,
      isLogTab: true,
      columns: [
        { id: "status", header: "Status", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "Statuses_Submittal_Labels", allowInvalid: false } },
        { id: "specTag", header: "Spec Tag", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "SpecTags_Keys", allowInvalid: false } },
        { id: "relatedTag", header: "Related Tag", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "SpecTags_Keys", allowInvalid: false } },
        { id: "revision", header: "Revision", numberFormat: "0" },
        { id: "specTitle", header: "Spec Title", formula: '=MAP(B4:B, LAMBDA(tag, IF(ISBLANK(tag), "", IFERROR(VLOOKUP(tag, \'Submittal FFE Support\'!SpecTags, 2, FALSE), ""))))' },
        { id: "vendor", header: "Vendor", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "Vendors_Keys", allowInvalid: false } },
        { id: "date", header: "Date", numberFormat: "yyMMdd" },
        { id: "contact", header: "Contact", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "Shared_Contacts_FFE_Keys", allowInvalid: false } },
        { id: "action", header: "Action", validationRule: { type: "LIST_FROM_RANGE", targetNamedRange: "Actions_Submittal_Labels", allowInvalid: false } },
        { id: "notes", header: "Notes" },
        { id: "link", header: "Link" },
        { id: "calcFileName", header: "Calc File Name", formula: '=MAP(B4:B, C4:C, D4:D, LAMBDA(tag, rel, rev, IF(ISBLANK(tag), "", tag & IF(ISBLANK(rel), "", "-" & rel) & "-" & rev)))' },
        { id: "calcNumber", header: "Calc Number", formula: '=MAP(B4:B, D4:D, LAMBDA(tag, rev, IF(ISBLANK(tag), "", tag & "-" & rev)))' },
        { id: "calcTitle", header: "Calc Title", formula: '=MAP(B4:B, E4:E, LAMBDA(tag, title, IF(ISBLANK(tag), IF(ISBLANK(title), "", title), IFERROR(VLOOKUP(tag, \'Submittal FFE Support\'!SpecTags, 2, FALSE), title))))' },
        { id: "calcContactChain", header: "Calc Contact Chain", formula: '=MAP(H4:H, I4:I, LAMBDA(c, a, IF(ISBLANK(c), "", c & IF(ISBLANK(a), "", " (" & a & ")"))))' },
        { id: "calcSort", header: "Calc Sort", formula: '=MAP(B4:B, D4:D, LAMBDA(tag, rev, IF(ISBLANK(tag), "", tag & "_" & rev)))' }
      ],
      seedRows: [
        ["Billed", "AC102", "", "1", "", "Berman Falk", "230720", "BW", "Received", "", ""],
        ["Billed", "AC102", "", "1", "", "Berman Falk", "230721", "INC", "Revise & Resubmit", "", ""],
        ["Billed", "AC102", "", "2", "", "Berman Falk", "230722", "BW", "Received", "", ""],
        ["Billed", "AC102", "", "2", "", "Berman Falk", "230724", "INC", "No Objection as Corrected", "", ""],
        ["", "", "", "", "", "", "", "", "", "", ""],
        ["Closed", "CG138", "", "1", "", "Berman Falk", "230720", "BW", "Received", "", ""],
        ["Closed", "CG138", "", "1", "", "Berman Falk", "230721", "INC", "Rejected", "", ""],
        ["Closed", "CG138", "", "2", "", "Berman Falk", "230722", "BW", "Received", "", ""],
        ["Manager", "CG138", "", "2", "", "Berman Falk", "230724", "INC", "No Objection as Corrected", "", ""],
        ["", "", "", "", "", "", "", "", "", "", ""],
        ["Closed", "FB132B", "", "1", "", "Berman Falk", "230726", "BW", "Received", "", ""],
        ["Open", "FB132B", "", "1", "", "Berman Falk", "230726", "INC", "", "", ""],
        ["", "", "", "", "", "", "", "", "", "", ""],
        ["Closed", "LT150", "", "1", "", "Berman Falk", "230731", "BW", "Received", "", ""],
        ["Open", "LT150", "", "1", "", "Berman Falk", "230731", "INC", "Revise & Resubmit", "", ""]
      ]
    },
    {
      name: "Submittal Arch Support",
      rowCount: 2,
      columnCount: 10,
      isSupportTab: true,
      seedRows: [
        ["", ""]
      ]
    },
    {
      name: "Submittal FFE Support",
      rowCount: 50,
      columnCount: 10,
      isSupportTab: true,
      seedRows: [
        ["Vendor Key", "Vendor Label", "SpecTag Key", "SpecTag Label"],
        ["Berman Falk", "Berman Falk", "AC102", "HOOK"],
        ["Ashley Lighting", "Ashley Lighting", "CG104", "BED - KING"],
        ["Fil Doux Textiles", "Fil Doux Textiles", "CG126", "BED - DOUBLE QUEEN"],
        ["Carnegie", "Carnegie", "CG138", "CREDENZA"],
        ["Light Annex", "Light Annex", "CG138M", "CREDENZA - MIRRORED"],
        ["ACME", "Acme Supplies", "CP112", "CARPET - CORRIDOR"],
        ["GLOBAL", "Global Materials", "CP119", "CARPET"],
        ["", "", "FB127", "FABRIC - LEATHER"],
        ["", "", "FB132", "FABRIC - WOVEN"],
        ["", "", "FB132B", "FABRIC - WOVEN"],
        ["", "", "FB135", "FABRIC - LEATHER"],
        ["", "", "FB141", "FABRIC - WOVEN"],
        ["", "", "FB149", "FABRIC - LEATHER"],
        ["", "", "FB156", "FABRIC - LEATHER"],
        ["", "", "FB158", "FABRIC - WOVEN"],
        ["", "", "FB174", "FABRIC - BLACKOUT"],
        ["", "", "FB198", "FABRIC - SHEER"],
        ["", "", "LT108", "SCONCE"],
        ["", "", "LT125", "TABLE LAMP"],
        ["", "", "LT134", "SCONCE"],
        ["", "", "LT136", "SCONCE - HEADBOARD"],
        ["", "", "LT150", "PENDANT"],
        ["", "", "LT159A", "SCONCE - CORRIDOR"],
        ["", "", "LT159B", "SCONCE - CORRIDOR"],
        ["", "", "LT162", "PENDANT"],
        ["", "", "MI132", "MIRROR - VANITY"],
        ["", "", "MI166", "MIRROR - FULL LENGTH"],
        ["", "", "SE145A", "CHAISE"],
        ["", "", "SE145B", "CHAISE - OPEN BACK"],
        ["", "", "SE145C", "CHAISE - HYBRID"],
        ["", "", "SE167", "CHAISE - SMALL"],
        ["", "", "TA139", "TABLE - WORK"],
        ["", "", "TA139B", "TABLE - WORK - SMALL"],
        ["", "", "CH-01", "Dining Chair"],
        ["", "", "TBL-01", "Conference Table"]
      ]
    },
    {
      name: "_Shared",
      rowCount: 100,
      columnCount: 20,
      isSharedTab: true,
      seedRows: [
        ["Contacts_Arch Key", "Contacts_Arch Label", "Contacts_FFE Key", "Contacts_FFE Label", "Action Order", "Actions", "Action Abbr.", "Statuses Key", "Statuses Label"],
        ["INC", "INC Architecture and Design", "INC", "INC Architecture & Design", 1, "Received", "", "Open", "Open"],
        ["PMG", "Pavarini McGovern", "BW", "Benjamin West", 2, "Referred", "_REF", "Closed", "Closed"],
        ["FXC", "FX Collaborative", "Lighting", "Lighting", 3, "Not Reviewed", "_NR", "Waiting", "Waiting"],
        ["IE", "Interface Engineering", "Brand", "Brand", 4, "Rejected", "_REJ", "Manager", "Manager"],
        ["VLD", "Ventresca Lighting Design", "", "", 5, "Revise & Resubmit", "_RR", "Billed", "Billed"],
        ["", "", "", "", 6, "No Objection as Corrected", "_NOC", "", ""],
        ["", "", "", "", 7, "No Exceptions Taken", "_NET", "", ""]
      ]
    },
    {
      name: "_Config",
      rowCount: 50,
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
        ["Submittal_FFE", "FFE Submittals", "SUB-FFE", "Submittal FFE"],
        ["", "", "", ""],
        ["Key", "Header", "Label", "Type", "IsCalculated", "FormulaOrFunction", "OptionsRange", "Required", "Description", "DefaultValue", "KeyNormalizationRule", "NumberFormat"],
        ["status", "Status", "Status", "list", "FALSE", "", "Statuses_Submittal_Labels", "TRUE", "Status", "Open", "picklist", ""],
        ["section", "Section", "Section", "string", "FALSE", "", "", "FALSE", "CSI Section", "", "code", "000000"],
        ["number", "Number", "Number", "string", "FALSE", "", "", "FALSE", "Submittal Number", "", "", "000"],
        ["revision", "Revision", "Revision", "string", "FALSE", "", "", "FALSE", "Revision", "0", "", "0"],
        ["title", "Title", "Title", "string", "FALSE", "", "", "TRUE", "Title", "", "", ""],
        ["date", "Date", "Date", "date", "FALSE", "", "", "TRUE", "Date", "", "", "yyMMdd"],
        ["contact", "Contact", "Contact", "list", "FALSE", "", "Shared_Contacts_Arch_Keys", "TRUE", "Contact", "", "picklist", ""],
        ["action", "Action", "Action", "list", "FALSE", "", "Actions_Submittal_Labels", "TRUE", "Action", "", "picklist", ""],
        ["notes", "Notes", "Notes", "multiline", "FALSE", "", "", "FALSE", "Notes", "", "", ""],
        ["link", "Link", "Link", "string", "FALSE", "", "", "FALSE", "Link", "", "", ""],
        ["calcFileName", "Calc File Name", "Calc File Name", "string", "TRUE", "=CONCAT()", "", "FALSE", "Calculated File Name", "", "", ""],
        ["", "", "", "", "", "", "", "", "", "", "", ""],
        ["Key", "Header", "Label", "Type", "IsCalculated", "FormulaOrFunction", "OptionsRange", "Required", "Description", "DefaultValue", "KeyNormalizationRule", "NumberFormat"],
        ["status", "Status", "Status", "list", "FALSE", "", "Statuses_Submittal_Labels", "TRUE", "Status", "Open", "picklist", ""],
        ["specTag", "Spec Tag", "Spec Tag", "list", "FALSE", "", "SpecTags_Keys", "TRUE", "Spec Tag", "", "picklist", ""],
        ["relatedTag", "Related Tag", "Related Tag", "list", "FALSE", "", "SpecTags_Keys", "FALSE", "Related Tag", "", "picklist", ""],
        ["revision", "Revision", "Revision", "string", "FALSE", "", "", "FALSE", "Revision", "0", "", "0"],
        ["specTitle", "Spec Title", "Spec Title", "string", "FALSE", "", "", "TRUE", "Spec Title", "", "", ""],
        ["vendor", "Vendor", "Vendor", "list", "FALSE", "", "Vendors_Keys", "TRUE", "Vendor", "", "picklist", ""],
        ["date", "Date", "Date", "date", "FALSE", "", "", "TRUE", "Date", "", "", "yyMMdd"],
        ["contact", "Contact", "Contact", "list", "FALSE", "", "Shared_Contacts_FFE_Keys", "TRUE", "Contact", "", "picklist", ""],
        ["action", "Action", "Action", "list", "FALSE", "", "Actions_Submittal_Labels", "TRUE", "Action", "", "picklist", ""],
        ["notes", "Notes", "Notes", "multiline", "FALSE", "", "", "FALSE", "Notes", "", "", ""],
        ["link", "Link", "Link", "string", "FALSE", "", "", "FALSE", "Link", "", "", ""]
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
    { name: "Config_Submittal_Arch_Fields", tabName: "_Config", rangeNotation: "A11:L22", scope: "Workbook" },
    { name: "Config_Submittal_FFE_Fields", tabName: "_Config", rangeNotation: "A24:L35", scope: "Workbook" },
    { name: "Shared_Contacts_Arch", tabName: "_Shared", rangeNotation: "A2:B20", scope: "Workbook" },
    { name: "Shared_Contacts_FFE", tabName: "_Shared", rangeNotation: "C2:D20", scope: "Workbook" },
    { name: "Actions_Submittal", tabName: "_Shared", rangeNotation: "E2:G20", scope: "Workbook" },
    { name: "Statuses_Submittal", tabName: "_Shared", rangeNotation: "H2:I20", scope: "Workbook" },
    { name: "AuditLog_Events", tabName: "_AuditLog", rangeNotation: "A6:F7", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal Arch", rangeNotation: "A3:O4", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal Arch", rangeNotation: "A4:O4", scope: "Sheet" },
    { name: "Data", tabName: "Submittal Arch", rangeNotation: "A6:O20", scope: "Sheet" },
    { name: "Submittal_Arch_Headers", tabName: "Submittal Arch", rangeNotation: "A3:O4", scope: "Workbook" },
    { name: "Submittal_Arch_FormulaRow", tabName: "Submittal Arch", rangeNotation: "A4:O4", scope: "Workbook" },
    { name: "Submittal_Arch_Data", tabName: "Submittal Arch", rangeNotation: "A6:O20", scope: "Workbook" },
    { name: "Headers", tabName: "Submittal FFE", rangeNotation: "A3:P4", scope: "Sheet" },
    { name: "FormulaRow", tabName: "Submittal FFE", rangeNotation: "A4:P4", scope: "Sheet" },
    { name: "Data", tabName: "Submittal FFE", rangeNotation: "A6:P20", scope: "Sheet" },
    { name: "Submittal_FFE_Headers", tabName: "Submittal FFE", rangeNotation: "A3:P4", scope: "Workbook" },
    { name: "Submittal_FFE_FormulaRow", tabName: "Submittal FFE", rangeNotation: "A4:P4", scope: "Workbook" },
    { name: "Submittal_FFE_Data", tabName: "Submittal FFE", rangeNotation: "A6:P20", scope: "Workbook" },
    { name: "Shared_Contacts_Arch_Keys", tabName: "_Shared", rangeNotation: "A2:A20", scope: "Workbook" },
    { name: "Shared_Contacts_FFE_Keys", tabName: "_Shared", rangeNotation: "C2:C20", scope: "Workbook" },
    { name: "Actions_Submittal_Labels", tabName: "_Shared", rangeNotation: "F2:F20", scope: "Workbook" },
    { name: "Statuses_Submittal_Labels", tabName: "_Shared", rangeNotation: "I2:I20", scope: "Workbook" },
    { name: "Vendors_Keys", tabName: "Submittal FFE Support", rangeNotation: "A2:A50", scope: "Workbook" },
    { name: "SpecTags_Keys", tabName: "Submittal FFE Support", rangeNotation: "C2:C50", scope: "Workbook" },
    { name: "Vendors", tabName: "Submittal FFE Support", rangeNotation: "A2:B50", scope: "Workbook" },
    { name: "SpecTags", tabName: "Submittal FFE Support", rangeNotation: "C2:D50", scope: "Workbook" }
  ]
};

export {
  DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
  PROTECTION_TIER_SPECS,
  TEST_TEMPLATE_SPREADSHEET_TITLE,
  PROD_TEMPLATE_SPREADSHEET_TITLE,
  DOCUMENT_LOG_WORKBOOK_SPEC
};

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
    PROTECTION_TIER_SPECS,
    TEST_TEMPLATE_SPREADSHEET_TITLE,
    PROD_TEMPLATE_SPREADSHEET_TITLE,
    DOCUMENT_LOG_WORKBOOK_SPEC
  };
}

(globalThis as any).DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION = DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION;
(globalThis as any).TEST_TEMPLATE_SPREADSHEET_TITLE = TEST_TEMPLATE_SPREADSHEET_TITLE;
(globalThis as any).PROD_TEMPLATE_SPREADSHEET_TITLE = PROD_TEMPLATE_SPREADSHEET_TITLE;
(globalThis as any).DOCUMENT_LOG_WORKBOOK_SPEC = DOCUMENT_LOG_WORKBOOK_SPEC;
(globalThis as any).PROTECTION_TIER_SPECS = PROTECTION_TIER_SPECS;
