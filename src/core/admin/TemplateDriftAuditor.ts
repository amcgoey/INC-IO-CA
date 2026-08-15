/// <reference path="../../types.ts" />

import { DocumentLogWorkbookSpec, DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION } from "../config/DocumentLogWorkbookSpec";
import { LogEngine } from "../log/LogEngine";

export type SchemaDriftStatus = "MATCH" | "MINOR_DRIFT" | "MAJOR_DRIFT" | "INCOMPATIBLE";
export type IssueSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface TemplateDriftIssue {
  category: string; // "VERSION" | "TAB" | "NAMED_RANGE" | "HEADER" | "FORMULA" | "VALIDATION" | "PROTECTION_DRIFT" | "VALIDATION_DRIFT"
  severity: IssueSeverity;
  description: string;
}

export interface TemplateDriftTelemetry {
  auditDurationMs: number;
  tabCount: number;
  inspectionStrategy: "ADVANCED_SHEETS_BATCH_V1" | "STORAGE_ADAPTER_LIVE";
  apiReadCount: number;
}

export interface TemplateDriftReport {
  timestamp: string;
  spreadsheetId: string;
  status: SchemaDriftStatus;
  liveSchemaVersion?: string;
  codeSchemaVersion: string;
  issues: TemplateDriftIssue[];
  canAutoPatch: boolean;
  summary: string;
  telemetry?: TemplateDriftTelemetry;
}


export type AutoPatchStatus = "PATCHED" | "NO_OP" | "LOCK_CONTENTION" | "UNPATCHABLE" | "REPAIR_FAILED";

export interface AutoPatchResult {
  success: boolean;
  status: AutoPatchStatus;
  spreadsheetId: string;
  auditReport?: TemplateDriftReport;
  repairsApplied: string[];
  error?: string;
  telemetry?: TemplateDriftTelemetry;
}

export interface AutoPatchWorkbookOptions {
  lockAdapter?: SpreadsheetLockAdapter;
  cacheAdapter?: CacheAdapter;
  validationAndProtectionAdapter?: any;
  logger?: (logPayloadJson: string) => void;
}

export interface AuditWorkbookOptions {
  bypassCache?: boolean;
  logger?: (logPayloadJson: string) => void;
}

export interface SheetStorageSeam {
  spreadsheetId?: string;
  id?: string;
  getId?(): string;
  getTabNames?(): string[];
  getSheetValues?(sheetName: string): any[][];
  getRangeValues?(sheetName: string, rangeNotation: string): any[][];
  getSheets?(): Array<{
    getName(): string;
    getDataRange(): { getValues(): any[][] };
    getRange(rowOrNotation: number | string, col?: number): {
      getValues(): any[][];
      getDataValidation(): any;
    };
  }>;
  getSheetByName?(name: string): any;
  getNamedRanges?(): Array<{ getName(): string; name?: string }>;
  getRangeByName?(name: string): any;
}

export interface BatchPayloadSheet {
  properties?: { sheetId?: number; title?: string };
  data?: Array<{
    rowData?: Array<{
      values?: Array<{
        userEnteredValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string };
        dataValidation?: any;
      }>;
    }>;
  }>;
}

export interface BatchPayloadNamedRange {
  name?: string;
  range?: { sheetId?: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number };
}

export interface BatchPayload {
  spreadsheetId: string;
  namedRanges?: BatchPayloadNamedRange[];
  sheets?: BatchPayloadSheet[];
}

export type StorageAdapterInput = BatchPayload | SheetStorageSeam | string;

export class TemplateDriftAuditor {
  private static defaultSpec?: DocumentLogWorkbookSpec;

  public static setDefaultSpec(spec?: DocumentLogWorkbookSpec): void {
    TemplateDriftAuditor.defaultSpec = spec;
  }

  public static getDefaultSpec(): DocumentLogWorkbookSpec | undefined {
    return TemplateDriftAuditor.defaultSpec;
  }

  private static defaultValidationAndProtectionAdapter?: any;

  public static setDefaultValidationAndProtectionAdapter(adapter?: any): void {
    TemplateDriftAuditor.defaultValidationAndProtectionAdapter = adapter;
  }

  public static getDefaultValidationAndProtectionAdapter(): any {
    return TemplateDriftAuditor.defaultValidationAndProtectionAdapter;
  }

  public static get CODE_SCHEMA_VERSION(): string {
    return TemplateDriftAuditor.defaultSpec?.schemaVersion || DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION || "1.0.0";
  }

  public static auditWorkbook(
    storageAdapter: StorageAdapterInput,
    options: AuditWorkbookOptions = { bypassCache: true }
  ): TemplateDriftReport {
    const startTime = Date.now();
    const inspector = new TemplateDriftInspector(storageAdapter, options);
    return inspector.runAudit(startTime);
  }

  public static autoPatchWorkbook(
    storageAdapter: StorageAdapterInput,
    options: AutoPatchWorkbookOptions = {}
  ): AutoPatchResult {
    const patcher = new TemplateDriftPatcher(storageAdapter, options);
    return patcher.runAutoPatch();
  }

}
class TemplateDriftInspector {
  private spreadsheetId: string = "active-workbook";
  private get spec(): DocumentLogWorkbookSpec | undefined {
    return this.options?.spec || TemplateDriftAuditor.getDefaultSpec();
  }
  private apiReadCount: number = 0;
  private inspectionStrategy: "ADVANCED_SHEETS_BATCH_V1" | "STORAGE_ADAPTER_LIVE" = "STORAGE_ADAPTER_LIVE";
  private batchData: BatchPayload | null = null;
  private seam: SheetStorageSeam | null = null;
  private options: AuditWorkbookOptions;

  constructor(storageInput: StorageAdapterInput, options: AuditWorkbookOptions) {
    this.options = options;
    this.resolveStorageInput(storageInput);
  }

  private resolveStorageInput(input: StorageAdapterInput): void {
    if (!input) return;

    if (typeof input === "object" && Array.isArray((input as BatchPayload).sheets)) {
      this.batchData = input as BatchPayload;
      this.spreadsheetId = this.batchData.spreadsheetId || "active-workbook";
      this.inspectionStrategy = "ADVANCED_SHEETS_BATCH_V1";
      this.apiReadCount = 1;
    } else if (typeof input === "object") {
      this.seam = input as SheetStorageSeam;
      if (typeof this.seam.getId === "function") {
        this.spreadsheetId = this.seam.getId();
      } else {
        this.spreadsheetId = this.seam.spreadsheetId || this.seam.id || "active-workbook";
      }
    } else if (typeof input === "string") {
      this.spreadsheetId = input;
    }
  }

  public runAudit(startTime: number): TemplateDriftReport {
    const issues: TemplateDriftIssue[] = [];
    const liveSheetNames = this.getLiveSheetNames();

    const liveSchemaVersion = this.auditDimension1_SchemaVersion(issues, liveSheetNames);

    const hasConfigTab = liveSheetNames.includes("_Config");
    this.auditDimension2_TabTaxonomy(issues, liveSheetNames, hasConfigTab);

    this.auditDimension3_NamedRanges(issues, liveSheetNames);

    this.auditDimensions4_5_6_LogTabs(issues, liveSheetNames);
    this.auditDimension7_Protections(issues, liveSheetNames);

    const { status, canAutoPatch } = this.classifyStatus(issues, hasConfigTab);

    const auditDurationMs = Date.now() - startTime;
    const telemetry: TemplateDriftTelemetry = {
      auditDurationMs,
      tabCount: liveSheetNames.length,
      inspectionStrategy: this.inspectionStrategy,
      apiReadCount: this.apiReadCount
    };

    const report: TemplateDriftReport = {
      timestamp: new Date().toISOString(),
      spreadsheetId: this.spreadsheetId,
      status,
      liveSchemaVersion: liveSchemaVersion || "N/A",
      codeSchemaVersion: TemplateDriftAuditor.CODE_SCHEMA_VERSION,
      issues,
      canAutoPatch,
      summary: this.generateSummary(status, issues, liveSchemaVersion),
      telemetry
    };

    if (typeof this.options.logger === "function") {
      this.options.logger(JSON.stringify({
        event: "TEMPLATE_DRIFT_AUDIT_EXECUTION",
        spreadsheetId: this.spreadsheetId,
        status,
        canAutoPatch,
        issuesCount: issues.length,
        telemetry
      }));
    }

    return report;
  }

  private getLiveSheetNames(): string[] {
    if (this.batchData && this.batchData.sheets) {
      return this.batchData.sheets.map(s => s.properties?.title || "").filter(Boolean);
    }
    if (this.seam) {
      if (typeof this.seam.getSheets === "function") {
        return this.seam.getSheets().map(s => s.getName());
      }
      if (typeof this.seam.getTabNames === "function") {
        return this.seam.getTabNames() || [];
      }
    }
    return [];
  }

  private getSheetGrid(tabName: string): any[][] {
    if (this.batchData && this.batchData.sheets) {
      const sheet = this.batchData.sheets.find(s => s.properties?.title === tabName);
      if (!sheet || !sheet.data || sheet.data.length === 0 || !sheet.data[0].rowData) {
        return [];
      }
      return sheet.data[0].rowData.map(r => (r.values || []).map(v => {
        if (!v) return "";
        if (v.userEnteredValue?.formulaValue) return v.userEnteredValue.formulaValue;
        if (v.userEnteredValue?.stringValue !== undefined) return v.userEnteredValue.stringValue;
        if (v.userEnteredValue?.numberValue !== undefined) return v.userEnteredValue.numberValue;
        if (v.userEnteredValue?.boolValue !== undefined) return v.userEnteredValue.boolValue;
        return "";
      }));
    }
    if (this.seam) {
      if (typeof this.seam.getSheetByName === "function") {
        const s = this.seam.getSheetByName(tabName);
        if (s && typeof s.getDataRange === "function") {
          this.apiReadCount++;
          return s.getDataRange().getValues();
        }
      }
      if (typeof this.seam.getSheetValues === "function") {
        try {
          this.apiReadCount++;
          return this.seam.getSheetValues(tabName) || [];
        } catch (e) { return []; }
      }
    }
    return [];
  }

  private hasNamedRange(name: string, tabName?: string): boolean {
    if (this.batchData && this.batchData.namedRanges) {
      return this.batchData.namedRanges.some(nr => {
        if (nr.name === name) return true;
        if (tabName && (nr.name === tabName + "_" + name || nr.name === tabName + "!" + name)) return true;
        return false;
      });
    }
    if (this.seam) {
      if (typeof this.seam.getNamedRanges === "function") {
        const nrs = this.seam.getNamedRanges();
        if (Array.isArray(nrs) && nrs.length > 0) {
          return nrs.some(nr => {
            const nrName = nr.name || (typeof nr.getName === "function" ? nr.getName() : "");
            if (nrName === name) return true;
            if (tabName && (nrName === tabName + "_" + name || nrName === tabName + "!" + name)) return true;
            return false;
          });
        }
      }
      if (typeof this.seam.getRangeByName === "function") {
        if (this.seam.getRangeByName(name)) return true;
        if (tabName && (this.seam.getRangeByName(tabName + "_" + name) || this.seam.getRangeByName(tabName + "!" + name))) return true;
      }
    }
    return false;
  }

  private getNamedRangeValues(name: string): any[][] {
    if (this.seam && typeof this.seam.getRangeByName === "function") {
      const r = this.seam.getRangeByName(name);
      if (r && typeof r.getValues === "function") {
        this.apiReadCount++;
        return r.getValues();
      }
    }
    if (this.seam && typeof this.seam.getRangeValues === "function") {
      try {
        this.apiReadCount++;
        return this.seam.getRangeValues("_Config", "A1:B10") || [];
      } catch (e) {}
    }
    return [];
  }

  private auditDimension1_SchemaVersion(issues: TemplateDriftIssue[], liveSheetNames: string[]): string | undefined {
    let liveSchemaVersion: string | undefined = undefined;
    const configGrid = this.getSheetGrid("_Config");
    const hasConfigTab = liveSheetNames.includes("_Config") || configGrid.length > 0;

    if (hasConfigTab) {
      const nrValues = this.getNamedRangeValues("MANIFEST_SCHEMA_VERSION");
      if (nrValues.length > 0 && nrValues[0].length > 0) {
        liveSchemaVersion = String(nrValues[0][1] || nrValues[0][0] || "").trim();
      }
      if (!liveSchemaVersion && configGrid.length >= 2) {
        for (const row of configGrid) {
          if (row && String(row[0]).trim() === "MANIFEST_SCHEMA_VERSION") {
            liveSchemaVersion = String(row[1] || "").trim();
            break;
          }
        }
        if (!liveSchemaVersion && configGrid[1] && configGrid[1][1]) {
          liveSchemaVersion = String(configGrid[1][1]).trim();
        }
      }

      const expectedVersion = this.spec?.schemaVersion || TemplateDriftAuditor.CODE_SCHEMA_VERSION;
      if (!liveSchemaVersion) {
        issues.push({
          category: "VERSION",
          severity: "WARNING",
          description: "MANIFEST_SCHEMA_VERSION missing or unassigned on '_Config' tab."
        });
      } else if (liveSchemaVersion !== expectedVersion) {
        const liveParts = liveSchemaVersion.split(".");
        const codeParts = expectedVersion.split(".");
        if (liveParts[0] !== codeParts[0]) {
          issues.push({
            category: "VERSION",
            severity: "CRITICAL",
            description: "Major schema version mismatch (Live: v" + liveSchemaVersion + ", Code: v" + expectedVersion + "). Migration required."
          });
        } else {
          issues.push({
            category: "VERSION",
            severity: "WARNING",
            description: "Minor schema version mismatch (Live: v" + liveSchemaVersion + ", Code: v" + expectedVersion + ")."
          });
        }
      }
    }

    return liveSchemaVersion;
  }

  private auditDimension2_TabTaxonomy(issues: TemplateDriftIssue[], liveSheetNames: string[], hasConfigTab: boolean): void {
    if (!hasConfigTab) {
      issues.push({
        category: "TAB",
        severity: "CRITICAL",
        description: "Missing required system configuration tab '_Config'."
      });
    }

    if (!liveSheetNames.includes("_AuditLog")) {
      issues.push({
        category: "TAB",
        severity: "WARNING",
        description: "Missing optional system audit log tab '_AuditLog' (can be auto-initialized)."
      });
    }

    const specTabs = this.spec?.tabs || [];
    for (const specTab of specTabs) {
      if (!liveSheetNames.includes(specTab.name)) {
        if (specTab.isLogTab) {
          issues.push({
            category: "TAB",
            severity: "CRITICAL",
            description: "Missing required discipline log tab '" + specTab.name + "'."
          });
        } else if (specTab.isSupportTab) {
          issues.push({
            category: "TAB",
            severity: "WARNING",
            description: "Missing required support tab '" + specTab.name + "'."
          });
        } else if (specTab.isSharedTab) {
          issues.push({
            category: "TAB",
            severity: "CRITICAL",
            description: "Missing required shared picklists tab '" + specTab.name + "'."
          });
        }
      }
    }
  }

  private auditDimension3_NamedRanges(issues: TemplateDriftIssue[], liveSheetNames: string[]): void {
    const namedRanges = this.spec?.namedRanges || [];
    for (const nrSpec of namedRanges) {
      if (!liveSheetNames.includes(nrSpec.tabName)) continue;

      const exists = this.hasNamedRange(nrSpec.name, nrSpec.tabName);
      if (!exists) {
        if (nrSpec.scope === "Sheet" || nrSpec.name === "AuditLog_Events") {
          issues.push({
            category: "NAMED_RANGE",
            severity: "WARNING",
            description: "Missing sheet-scoped named range '" + nrSpec.name + "' on tab '" + nrSpec.tabName + "' (can be auto-initialized)."
          });
        } else {
          issues.push({
            category: "NAMED_RANGE",
            severity: "WARNING",
            description: "Missing workbook-scoped named range '" + nrSpec.name + "' on tab '" + nrSpec.tabName + "'."
          });
        }
      }
    }
  }

  private auditDimensions4_5_6_LogTabs(issues: TemplateDriftIssue[], liveSheetNames: string[]): void {
    const specTabs = this.spec?.tabs || [];
    for (const specTab of specTabs) {
      if (!specTab.isLogTab || !specTab.columns || !liveSheetNames.includes(specTab.name)) {
        continue;
      }

      const grid = this.getSheetGrid(specTab.name);
      const liveHeaders = grid.length >= 3 ? grid[2].map(h => String(h || "").trim()) : (grid.length >= 1 ? grid[0].map(h => String(h || "").trim()) : []);

      // Dimension 4: Headers
      for (let colIdx = 0; colIdx < specTab.columns.length; colIdx++) {
        const colSpec = specTab.columns[colIdx];
        const liveHeader = liveHeaders[colIdx] || "";

        if (!liveHeader) {
          if (colSpec.formula) {
            issues.push({
              category: "HEADER",
              severity: "CRITICAL",
              description: "Missing calculated column header '" + colSpec.header + "' on tab '" + specTab.name + "' at column " + (colIdx + 1) + "."
            });
          } else {
            issues.push({
              category: "HEADER",
              severity: "WARNING",
              description: "Missing column header '" + colSpec.header + "' on tab '" + specTab.name + "' at column " + (colIdx + 1) + "."
            });
          }
        } else if (liveHeader.toLowerCase() !== colSpec.header.toLowerCase()) {
          issues.push({
            category: "HEADER",
            severity: "WARNING",
            description: "Header label mismatch on tab '" + specTab.name + "' at column " + (colIdx + 1) + ": expected '" + colSpec.header + "', found '" + liveHeader + "'."
          });
        }
      }

      // Dimension 5: Formulas (FormulaRow)
      let formulaRowIdx = 3; // Default Row 4 (index 3)
      if (this.batchData && this.batchData.namedRanges) {
        const nr = this.batchData.namedRanges.find(r => r.name === "FormulaRow" || r.name === specTab.name + "_FormulaRow");
        if (nr && nr.range && typeof nr.range.startRowIndex === "number") {
          formulaRowIdx = nr.range.startRowIndex;
        }
      } else if (this.seam && typeof this.seam.getRangeByName === "function") {
        const nr = this.seam.getRangeByName("FormulaRow") || this.seam.getRangeByName(specTab.name + "_FormulaRow");
        if (nr && typeof nr.getRow === "function") {
          formulaRowIdx = nr.getRow() - 1;
        }
      }
      if (formulaRowIdx >= grid.length) {
        formulaRowIdx = grid.length >= 4 ? 3 : (grid.length >= 2 ? 1 : -1);
      }

      const liveFormulas = formulaRowIdx >= 0 && formulaRowIdx < grid.length ? grid[formulaRowIdx] : [];

      for (let colIdx = 0; colIdx < specTab.columns.length; colIdx++) {
        const colSpec = specTab.columns[colIdx];
        if (!colSpec.formula) continue;

        const liveFormulaCell = String(liveFormulas[colIdx] || "").trim();

        if (!liveFormulaCell) {
          issues.push({
            category: "FORMULA",
            severity: "CRITICAL",
            description: "Missing calculated formula in column '" + colSpec.id + "' on tab '" + specTab.name + "' (Row 2)."
          });
        } else if (liveFormulaCell.includes("#REF!") || liveFormulaCell.includes("#NAME?") || liveFormulaCell.includes("#N/A") || liveFormulaCell.includes("#VALUE!")) {
          issues.push({
            category: "FORMULA",
            severity: "CRITICAL",
            description: "Formula evaluation error '" + liveFormulaCell + "' detected in column '" + colSpec.id + "' on tab '" + specTab.name + "' (Row 2)."
          });
        } else if (!liveFormulaCell.startsWith("=")) {
          issues.push({
            category: "FORMULA",
            severity: "CRITICAL",
            description: "Formula overwrite detected in column '" + colSpec.id + "' on tab '" + specTab.name + "' (Row 2): expected formula, found static text."
          });
        }
      }

      // Dimension 6 / 8: Dynamic Cell Validations (VALIDATION_DRIFT)
      const firstDataRow = 6;
      for (let colIdx = 0; colIdx < specTab.columns.length; colIdx++) {
        const colSpec = specTab.columns[colIdx];
        const targetRange = colSpec.validationRule?.targetNamedRange;
        if (!targetRange) continue;

        let hasValidation = false;
        const targetNRExists = this.hasNamedRange(targetRange);

        if (targetNRExists) {
          if (this.seam && typeof this.seam.getSheetByName === "function") {
            const sheet = this.seam.getSheetByName(specTab.name);
            if (sheet && typeof sheet.getRange === "function") {
              const range = sheet.getRange(firstDataRow, colIdx + 1);
              if (range && typeof range.getDataValidation === "function") {
                const rule = range.getDataValidation();
                hasValidation = !!rule;
              }
            }
          } else if (this.batchData) {
            hasValidation = true;
          }
        }

        if (!hasValidation) {
          issues.push({
            category: "VALIDATION_DRIFT",
            severity: "WARNING",
            description: "Missing data validation rule for column '" + colSpec.id + "' on tab '" + specTab.name + "' (expected range '" + targetRange + "')."
          });
        }
      }
    }
  }



  private auditDimension7_Protections(issues: TemplateDriftIssue[], liveSheetNames: string[]): void {
    const specTabs = this.spec?.tabs || [];
    for (const specTab of specTabs) {
      if (!liveSheetNames.includes(specTab.name)) continue;

      if (this.seam && typeof this.seam.getSheetByName === "function") {
        const sheet = this.seam.getSheetByName(specTab.name);
        if (!sheet) continue;

        // Tier 1: System Tab Protection
        if (specTab.isConfigTab || specTab.isAuditLogTab || specTab.isSupportTab || specTab.name.startsWith("_")) {
          const sheetProts = typeof sheet.getProtections === "function" ? sheet.getProtections("SHEET") : [];
          const hasProt = Array.isArray(sheetProts) && sheetProts.length > 0;
          if (!hasProt) {
            issues.push({
              category: "PROTECTION_DRIFT",
              severity: "WARNING",
              description: "Missing system tab protection on tab '" + specTab.name + "'."
            });
          }
          continue;
        }

        // Log Tabs: Tier 2 Header Stack & Tier 3 Calculated Columns
        if (specTab.isLogTab && specTab.columns && specTab.columns.length > 0) {
          const rangeProts = typeof sheet.getProtections === "function" ? sheet.getProtections("RANGE") : [];
          const descriptions = Array.isArray(rangeProts)
            ? rangeProts.map((p: { getDescription?(): string; description?: string }) => (typeof p.getDescription === "function" ? p.getDescription() : (p.description || "")))
            : [];

          // Tier 2: Header Stack Protection (LOCK_HEADERS_<TabName>)
          const expectedHeaderDesc = "LOCK_HEADERS_" + specTab.name;
          const hasHeaderProt = descriptions.includes(expectedHeaderDesc) || descriptions.some((d: string) => d.startsWith("LOCK_HEADERS"));
          if (!hasHeaderProt) {
            issues.push({
              category: "PROTECTION_DRIFT",
              severity: "WARNING",
              description: "Missing header and formula range protection ('" + expectedHeaderDesc + "') on tab '" + specTab.name + "'."
            });
          }

          // Tier 3: Calculated Column Protection (PROTECT_CALC_<TabName>_<colId>)
          for (const colSpec of specTab.columns) {
            const isCalculated = colSpec.formula !== undefined || (colSpec.id && colSpec.id.startsWith("calc"));
            if (!isCalculated) continue;

            const expectedCalcDesc = "PROTECT_CALC_" + specTab.name + "_" + colSpec.id;
            const hasCalcProt = descriptions.includes(expectedCalcDesc);
            if (!hasCalcProt) {
              issues.push({
                category: "PROTECTION_DRIFT",
                severity: "WARNING",
                description: "Missing calculated column range protection ('" + expectedCalcDesc + "') for column '" + colSpec.id + "' on tab '" + specTab.name + "'."
              });
            }
          }
        }
      }
    }
  }

  private classifyStatus(issues: TemplateDriftIssue[], hasConfigTab: boolean): { status: SchemaDriftStatus; canAutoPatch: boolean } {
    const criticalCount = issues.filter(i => i.severity === "CRITICAL").length;
    const warningCount = issues.filter(i => i.severity === "WARNING").length;

    if (criticalCount > 0) {
      return {
        status: !hasConfigTab ? "INCOMPATIBLE" : "MAJOR_DRIFT",
        canAutoPatch: false
      };
    } else if (warningCount > 0) {
      return {
        status: "MINOR_DRIFT",
        canAutoPatch: true
      };
    }
    return {
      status: "MATCH",
      canAutoPatch: true
    };
  }

  private generateSummary(status: SchemaDriftStatus, issues: TemplateDriftIssue[], liveVersion?: string): string {
    const criticalCount = issues.filter(i => i.severity === "CRITICAL").length;
    const warningCount = issues.filter(i => i.severity === "WARNING").length;

    if (status === "MATCH") {
      return "All structural contracts, tabs, and Named Ranges validated against Schema v" + (liveVersion || TemplateDriftAuditor.CODE_SCHEMA_VERSION) + ".";
    } else if (status === "MINOR_DRIFT") {
      return "Detected " + warningCount + " non-critical drift issue(s). Auto-patching is ready.";
    } else if (status === "MAJOR_DRIFT") {
      return "Detected " + criticalCount + " critical structural discrepancy(ies). Manual migration required.";
    }
    return "Workbook is missing core _Config manifest. Incompatible Document Log.";
  }
}


class TemplateDriftPatcher {
  private storageInput: StorageAdapterInput;
  private options: AutoPatchWorkbookOptions;
  private spreadsheetId: string = "active-workbook";
  private get spec(): DocumentLogWorkbookSpec | undefined {
    return this.options?.spec || TemplateDriftAuditor.getDefaultSpec();
  }

  constructor(storageInput: StorageAdapterInput, options: AutoPatchWorkbookOptions) {
    this.storageInput = storageInput;
    this.options = options;
    this.resolveSpreadsheetId(storageInput);
  }

  private resolveSpreadsheetId(input: StorageAdapterInput): void {
    if (!input) return;
    if (typeof input === "object" && Array.isArray((input as any).sheets)) {
      this.spreadsheetId = (input as any).spreadsheetId || "active-workbook";
    } else if (typeof input === "object") {
      const seam = input as any;
      if (typeof seam.getId === "function") {
        this.spreadsheetId = seam.getId();
      } else {
        this.spreadsheetId = seam.spreadsheetId || seam.id || "active-workbook";
      }
    } else if (typeof input === "string") {
      this.spreadsheetId = input;
    }
  }

  private resolveLockAdapter(): SpreadsheetLockAdapter | null {
    if (this.options.lockAdapter) return this.options.lockAdapter;
    const g = typeof globalThis !== "undefined" ? (globalThis as any) : {};
    if (g.defaultSpreadsheetLockAdapter) return g.defaultSpreadsheetLockAdapter;
    if (g.FakeSpreadsheetLockAdapter) return new g.FakeSpreadsheetLockAdapter();
    return null;
  }

  private resolveValidationAndProtectionAdapter(): {
    applyValidationRules?: (spreadsheet: any, spec?: any) => void;
    applyRangeProtections?: (spreadsheet: any, spec?: any) => void;
    applyNumberFormats?: (spreadsheet: any, spec?: any) => void;
  } | null {
    if (this.options.validationAndProtectionAdapter) return this.options.validationAndProtectionAdapter;
    if (TemplateDriftAuditor.getDefaultValidationAndProtectionAdapter()) return TemplateDriftAuditor.getDefaultValidationAndProtectionAdapter();
    const g = typeof globalThis !== "undefined" ? (globalThis as any) : {};
    if (g.defaultSheetValidationAndProtectionAdapter) return g.defaultSheetValidationAndProtectionAdapter;
    if (g.SheetValidationAndProtectionAdapter && this.spec) {
      const viewSpec = g.DOCUMENT_LOG_WORKBOOK_VIEW_SPEC || (typeof DOCUMENT_LOG_WORKBOOK_VIEW_SPEC !== "undefined" ? DOCUMENT_LOG_WORKBOOK_VIEW_SPEC : undefined);
      if (viewSpec) {
        return new g.SheetValidationAndProtectionAdapter(this.spec, viewSpec);
      }
    }
    return null;
  }

  private resolveCacheAdapter(): CacheAdapter | null {
    if (this.options.cacheAdapter) return this.options.cacheAdapter;
    const g = typeof globalThis !== "undefined" ? (globalThis as any) : {};
    if (g.defaultCacheAdapter) return g.defaultCacheAdapter;
    if (g.FakeCacheAdapter) return new g.FakeCacheAdapter();
    return null;
  }

  private invalidateConfigCache(): void {
    const cacheAdapter = this.resolveCacheAdapter();
    if (cacheAdapter) {
      try {
        const g = typeof globalThis !== "undefined" ? (globalThis as any) : {};
        const PrefixManagerClass = g.PrefixCacheManager || (typeof PrefixCacheManager !== "undefined" ? PrefixCacheManager : null);
        if (PrefixManagerClass) {
          const manager = new PrefixManagerClass(cacheAdapter);
          manager.invalidatePrefix("DOC_CONFIG_" + this.spreadsheetId);
        }
      } catch (e) {}
    }
  }

  private hasNamedRangeInSeam(seam: any, name: string, tabName: string): boolean {
    if (typeof seam.getNamedRanges === "function") {
      const nrs = seam.getNamedRanges();
      if (Array.isArray(nrs)) {
        return nrs.some((nr: any) => {
          const nrName = nr.name || (typeof nr.getName === "function" ? nr.getName() : "");
          return nrName === name || nrName === tabName + "_" + name || nrName === tabName + "!" + name;
        });
      }
    }
    if (typeof seam.getRangeByName === "function") {
      if (seam.getRangeByName(name) || seam.getRangeByName(tabName + "_" + name) || seam.getRangeByName(tabName + "!" + name)) return true;
    }
    return false;
  }

  public runAutoPatch(): AutoPatchResult {
    const lockAdapter = this.resolveLockAdapter();
    let executionId: string | null = null;

    if (lockAdapter && typeof lockAdapter.acquireLock === "function") {
      executionId = lockAdapter.acquireLock(this.spreadsheetId, 5000);
      if (!executionId) {
        if (typeof this.options.logger === "function") {
          this.options.logger(JSON.stringify({
            event: "AUTO_PATCH_LOCK_CONTENTION",
            spreadsheetId: this.spreadsheetId,
            status: "LOCK_CONTENTION",
            message: "Failed to acquire workbook lock (LOCK_MIGRATION_" + this.spreadsheetId + ") within 5,000 ms timeout."
          }));
        }
        return {
          success: false,
          status: "LOCK_CONTENTION",
          spreadsheetId: this.spreadsheetId,
          repairsApplied: [],
          error: "Failed to acquire workbook lock (LOCK_MIGRATION_" + this.spreadsheetId + ") within 5,000 ms timeout."
        };
      }
    }

    try {
      // 1. Double-checked audit under lock
      const initialReport = TemplateDriftAuditor.auditWorkbook(this.storageInput, { bypassCache: true, spec: this.spec });

      if (initialReport.status === "MATCH") {
        return {
          success: true,
          status: "NO_OP",
          spreadsheetId: this.spreadsheetId,
          auditReport: initialReport,
          repairsApplied: []
        };
      }

      if (!initialReport.canAutoPatch || initialReport.status === "MAJOR_DRIFT" || initialReport.status === "INCOMPATIBLE") {
        return {
          success: false,
          status: "UNPATCHABLE",
          spreadsheetId: this.spreadsheetId,
          auditReport: initialReport,
          repairsApplied: [],
          error: "Workbook has major structural drift or incompatible schema that cannot be auto-patched."
        };
      }

      // 2. Perform minor non-destructive repairs
      const repairsApplied: string[] = [];
      const seam = this.storageInput as any;

      // Repair A: Initialize missing _AuditLog tab
      const sheetNames = typeof seam.getTabNames === "function" ? seam.getTabNames() : (
        typeof seam.getSheets === "function" ? seam.getSheets().map((s: any) => s.getName()) : []
      );

      if (!sheetNames.includes("_AuditLog")) {
        if (typeof seam.insertSheet === "function") {
          const auditSheet = seam.insertSheet("_AuditLog", [
            ["Timestamp", "Category", "EventType", "Actor", "Status", "Details"]
          ]);
          if (typeof seam.setNamedRange === "function") {
            seam.setNamedRange("AuditLog_Events", "_AuditLog", "A2:F100");
          } else if (auditSheet && typeof auditSheet.setNamedRange === "function") {
            auditSheet.setNamedRange("AuditLog_Events", "A2:F100");
          }
          repairsApplied.push("Initialized missing system audit log tab '_AuditLog'");
        }
      }

      // Repair B: Sheet-scoped Named Ranges (Headers, FormulaRow, Data) on log tabs
      const specTabs = this.spec?.tabs || [];
      for (const specTab of specTabs) {
        if (!specTab.isLogTab || !sheetNames.includes(specTab.name)) continue;

        const tabName = specTab.name;

        if (!this.hasNamedRangeInSeam(seam, "Headers", tabName) && typeof seam.setNamedRange === "function") {
          seam.setNamedRange("Headers", tabName, "A3:Z3");
          repairsApplied.push("Re-created sheet-scoped Named Range 'Headers' on tab '" + tabName + "'");
        }

        if (!this.hasNamedRangeInSeam(seam, "FormulaRow", tabName) && typeof seam.setNamedRange === "function") {
          seam.setNamedRange("FormulaRow", tabName, "A2:Z2");
          repairsApplied.push("Re-created sheet-scoped Named Range 'FormulaRow' on tab '" + tabName + "'");
        }

        if (!this.hasNamedRangeInSeam(seam, "Data", tabName) && typeof seam.setNamedRange === "function") {
          seam.setNamedRange("Data", tabName, "A4:Z1000");
          repairsApplied.push("Re-created sheet-scoped Named Range 'Data' on tab '" + tabName + "'");
        }
      }

      // Repair C: Default _Config key rows if MANIFEST_SCHEMA_VERSION missing
      if (sheetNames.includes("_Config")) {
        const configValues = typeof seam.getSheetValues === "function" ? seam.getSheetValues("_Config") : [];
        let hasVersionKey = false;
        for (const row of configValues) {
          if (row && String(row[0]).trim() === "MANIFEST_SCHEMA_VERSION") {
            hasVersionKey = true;
            break;
          }
        }
        if (!hasVersionKey) {
          if (typeof seam.setRangeValue === "function") {
            seam.setRangeValue("_Config", 2, 1, "MANIFEST_SCHEMA_VERSION");
            seam.setRangeValue("_Config", 2, 2, TemplateDriftAuditor.CODE_SCHEMA_VERSION);
            if (typeof seam.setNamedRange === "function") {
              seam.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A2:B2");
            }
            repairsApplied.push("Appended missing default '_Config' key 'MANIFEST_SCHEMA_VERSION'");
          }
        }
      }

      // Repair D: Restore missing validation rules, range protections, and number formats via SheetValidationAndProtectionAdapter
      const valProtAdapter = this.resolveValidationAndProtectionAdapter();
      if (valProtAdapter) {
        const spec = this.spec;
        if (typeof valProtAdapter.applyValidationRules === "function") {
          try {
            valProtAdapter.applyValidationRules(seam);
            repairsApplied.push("Restored missing cell validation rules across log tabs");
          } catch (e) {
            
          }
        }
        if (typeof valProtAdapter.applyRangeProtections === "function") {
          try {
            valProtAdapter.applyRangeProtections(seam);
            repairsApplied.push("Restored soft warning range protections across system tabs, headers, and calculated columns");
          } catch (e) {}
        }
        if (typeof valProtAdapter.applyNumberFormats === "function") {
          try {
            valProtAdapter.applyNumberFormats(seam);
            repairsApplied.push("Applied cell number formats across log tabs");
          } catch (e) {}
        }
      }

      // 3. Post-repair Cache Invalidation
      this.invalidateConfigCache();

      // 4. Log telemetry events to _AuditLog
      this.writeTelemetryEvents(seam, repairsApplied);

      // 5. Re-run post-repair audit
      const finalReport = TemplateDriftAuditor.auditWorkbook(this.storageInput, { bypassCache: true, spec: this.spec });

      return {
        success: true,
        status: "PATCHED",
        spreadsheetId: this.spreadsheetId,
        auditReport: finalReport,
        repairsApplied
      };

    } catch (err: any) {
      // Mid-Repair Exception Recovery
      const errorMessage = String(err && err.message ? err.message : err);

      this.invalidateConfigCache();

      try {
        this.writeFailureEvent(this.storageInput, errorMessage);
      } catch (e) {}

      return {
        success: false,
        status: "REPAIR_FAILED",
        spreadsheetId: this.spreadsheetId,
        repairsApplied: [],
        error: errorMessage
      };
    } finally {
      if (lockAdapter && executionId && typeof lockAdapter.releaseLock === "function") {
        lockAdapter.releaseLock(this.spreadsheetId, executionId);
      }
    }
  }

  private getLogEngineClass(): any {
    return LogEngine;
  }

  private writeTelemetryEvents(seam: any, repairsApplied: string[]): void {
    try {
      const now = new Date().toISOString();
      const auditSheet = typeof seam.getSheetByName === "function" ? seam.getSheetByName("_AuditLog") : null;
      if (auditSheet) {
        const row1 = [now, "SCHEMA_DRIFT", "DRIFT_REPAIR_EXECUTED", "TemplateDriftAuditor", "SUCCESS", JSON.stringify({ repairsApplied, count: repairsApplied.length })];
        const row2 = [now, "CACHE_PURGE", "EVICT_PREFIX", "TemplateDriftAuditor", "SUCCESS", JSON.stringify({ scope: "DOC_CONFIG_" + this.spreadsheetId })];
        if (typeof auditSheet.appendRow === "function") {
          auditSheet.appendRow(row1);
          auditSheet.appendRow(row2);
        } else if (typeof auditSheet.setGridSlice === "function") {
          const data = typeof auditSheet.getDataRange === "function" ? auditSheet.getDataRange().getValues() : [];
          const startRow = data.length + 1;
          auditSheet.setGridSlice(startRow, 1, [row1]);
          auditSheet.setGridSlice(startRow + 1, 1, [row2]);
        }
      }
    } catch (e) {}
  }

  private writeFailureEvent(seam: any, errorMessage: string): void {
    try {
      const now = new Date().toISOString();
      const auditSheet = typeof seam.getSheetByName === "function" ? seam.getSheetByName("_AuditLog") : null;
      if (auditSheet) {
        const row = [now, "SCHEMA_DRIFT", "DRIFT_REPAIR_FAILED", "TemplateDriftAuditor", "ERROR", JSON.stringify({ error: errorMessage })];
        if (typeof auditSheet.appendRow === "function") {
          auditSheet.appendRow(row);
        } else if (typeof auditSheet.setGridSlice === "function") {
          const data = typeof auditSheet.getDataRange === "function" ? auditSheet.getDataRange().getValues() : [];
          auditSheet.setGridSlice(data.length + 1, 1, [row]);
        }
      }
    } catch (e) {}
  }
}


declare let module: { exports?: unknown };
if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).TemplateDriftAuditor = TemplateDriftAuditor;
  module.exports = {
    TemplateDriftAuditor
  };
}
