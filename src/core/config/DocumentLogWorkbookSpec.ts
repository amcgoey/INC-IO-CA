/**
 * @file DocumentLogWorkbookSpec.ts
 * @description Declarative specification interfaces and types for single-workbook layout
 * (_Config, _Shared, _AuditLog, Submittal Arch, Submittal FFE)
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

export {
  DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
  PROTECTION_TIER_SPECS,
  TEST_TEMPLATE_SPREADSHEET_TITLE,
  PROD_TEMPLATE_SPREADSHEET_TITLE
};

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION,
    PROTECTION_TIER_SPECS,
    TEST_TEMPLATE_SPREADSHEET_TITLE,
    PROD_TEMPLATE_SPREADSHEET_TITLE
  };
}

(globalThis as any).DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION = DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION;
(globalThis as any).TEST_TEMPLATE_SPREADSHEET_TITLE = TEST_TEMPLATE_SPREADSHEET_TITLE;
(globalThis as any).PROD_TEMPLATE_SPREADSHEET_TITLE = PROD_TEMPLATE_SPREADSHEET_TITLE;
(globalThis as any).PROTECTION_TIER_SPECS = PROTECTION_TIER_SPECS;
