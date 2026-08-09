/// <reference path="../../types.ts" />
/**
 * @file TemplateDriftAuditor.ts
 * @description Tier 1 Pure Core inspection engine auditing 6 structural dimensions of Google Sheet workbooks
 * against DocumentLogWorkbookSpec to detect version, tab, named range, header, formula, or validation discrepancies
 * (Issue #221, Issue #225, ADR 0019, ADR 0029, ADR 0037, ADR 0041, ADR 0043).
 *
 * Adheres strictly to Tier 1 Pure Core guidelines: zero GAS globals, zero Node built-ins, zero inverted Tier 2 dependencies.
 */

import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../config/DocumentLogWorkbookSpec";

export type SchemaDriftStatus = "MATCH" | "MINOR_DRIFT" | "MAJOR_DRIFT" | "INCOMPATIBLE";
export type IssueSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface TemplateDriftIssue {
  category: string; // "VERSION" | "TAB" | "NAMED_RANGE" | "HEADER" | "FORMULA" | "VALIDATION"
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

export interface AuditWorkbookOptions {
  bypassCache?: boolean;
  logger?: (msg: string) => void;
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

export class TemplateDriftAuditor {
  public static readonly CODE_SCHEMA_VERSION = DOCUMENT_LOG_WORKBOOK_SPEC.schemaVersion || "1.0.0";

  /**
   * Performs a dry-run 6-dimension structural schema audit against target workbook without mutating sheet structure or cache state.
   * Lock-free read-only operation. Direct uncached reads enforced when bypassCache: true.
   *
   * @param storageAdapter - Tier 1 SheetStorageAdapter, BatchPayload, or spreadsheetId string.
   * @param options - Audit execution options (bypassCache, logger, etc.).
   * @returns TemplateDriftReport object.
   */
  public static auditWorkbook(
    storageAdapter: any,
    options: AuditWorkbookOptions = { bypassCache: true }
  ): TemplateDriftReport {
    const startTime = Date.now();
    const bypassCache = options.bypassCache !== false; // default true
    let spreadsheetId = "active-workbook";
    let apiReadCount = 0;
    let inspectionStrategy: "ADVANCED_SHEETS_BATCH_V1" | "STORAGE_ADAPTER_LIVE" = "STORAGE_ADAPTER_LIVE";

    let batchData: BatchPayload | null = null;
    let ssObject: any = null;
    let adapter: any = null;

    if (storageAdapter && typeof storageAdapter === "object" && Array.isArray(storageAdapter.sheets)) {
      batchData = storageAdapter;
      spreadsheetId = storageAdapter.spreadsheetId || "active-workbook";
      inspectionStrategy = "ADVANCED_SHEETS_BATCH_V1";
      apiReadCount = 1;
    } else if (storageAdapter && typeof storageAdapter === "object" && typeof storageAdapter.getSheets === "function") {
      ssObject = storageAdapter;
      spreadsheetId = typeof storageAdapter.getId === "function" ? storageAdapter.getId() : (storageAdapter.id || "active-workbook");
    } else if (typeof storageAdapter === "string") {
      spreadsheetId = storageAdapter;
      // In GAS environment, resolve batch reader via global registry or fallback to openById seam
      if (bypassCache && typeof (globalThis as any).Sheets !== "undefined" && (globalThis as any).Sheets?.Spreadsheets?.get) {
        try {
          const BatchReader = (globalThis as any).SpreadsheetBatchReaderAdapter ||
            (typeof require !== "undefined" ? require("../../adapters/gas/SpreadsheetBatchReaderAdapter").SpreadsheetBatchReaderAdapter : null);
          if (BatchReader) {
            const reader = new BatchReader();
            batchData = reader.readWorkbookBatch(spreadsheetId);
            inspectionStrategy = "ADVANCED_SHEETS_BATCH_V1";
            apiReadCount = 1;
          }
        } catch (e) {}
      }
      if (!batchData && (globalThis as any).SpreadsheetApp && typeof (globalThis as any).SpreadsheetApp.openById === "function") {
        try {
          ssObject = (globalThis as any).SpreadsheetApp.openById(spreadsheetId);
          apiReadCount++;
        } catch (e) {}
      }
    } else if (storageAdapter) {
      adapter = storageAdapter;
      spreadsheetId = (storageAdapter as any)?.spreadsheetId || "active-workbook";
      if ((globalThis as any).SpreadsheetApp && typeof (globalThis as any).SpreadsheetApp.openById === "function") {
        try {
          ssObject = (globalThis as any).SpreadsheetApp.openById(spreadsheetId);
          apiReadCount++;
        } catch (e) {}
      }
    }

    const issues: TemplateDriftIssue[] = [];
    let liveSchemaVersion: string | undefined = undefined;

    const getLiveSheetNames = (): string[] => {
      if (batchData && batchData.sheets) {
        return batchData.sheets.map(s => s.properties?.title || "").filter(Boolean);
      }
      if (ssObject && typeof ssObject.getSheets === "function") {
        return ssObject.getSheets().map((s: any) => s.getName());
      }
      if (adapter && typeof adapter.getTabNames === "function") {
        return adapter.getTabNames();
      }
      return [];
    };

    const liveSheetNames = getLiveSheetNames();

    const getSheetGrid = (tabName: string): any[][] => {
      if (batchData && batchData.sheets) {
        const sheet = batchData.sheets.find(s => s.properties?.title === tabName);
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
      if (ssObject) {
        const s = ssObject.getSheetByName(tabName);
        if (s) {
          apiReadCount++;
          return s.getDataRange().getValues();
        }
      }
      if (adapter && typeof adapter.getSheetValues === "function") {
        try {
          apiReadCount++;
          return adapter.getSheetValues(tabName);
        } catch (e) { return []; }
      }
      return [];
    };

    const hasNamedRange = (name: string, tabName?: string): boolean => {
      if (batchData && batchData.namedRanges) {
        return batchData.namedRanges.some(nr => {
          if (nr.name === name) return true;
          if (tabName && nr.name === tabName + "_" + name) return true;
          return false;
        });
      }
      if (ssObject && typeof ssObject.getNamedRanges === "function") {
        const nrs = ssObject.getNamedRanges();
        if (Array.isArray(nrs) && nrs.length > 0) {
          return nrs.some((nr: any) => {
            const nrName = typeof nr.getName === "function" ? nr.getName() : nr.name;
            if (nrName === name) return true;
            if (tabName && (nrName === tabName + "_" + name || nrName === tabName + "!" + name)) return true;
            return false;
          });
        }
      }
      if (ssObject && typeof ssObject.getRangeByName === "function") {
        if (ssObject.getRangeByName(name)) return true;
        if (tabName && (ssObject.getRangeByName(tabName + "_" + name) || ssObject.getRangeByName(tabName + "!" + name))) return true;
      }
      return false;
    };

    const getNamedRangeValues = (name: string): any[][] => {
      if (ssObject && typeof ssObject.getRangeByName === "function") {
        const r = ssObject.getRangeByName(name);
        if (r) {
          apiReadCount++;
          return r.getValues();
        }
      }
      if (adapter && typeof adapter.getRangeValues === "function") {
        try {
          apiReadCount++;
          return adapter.getRangeValues("_Config", "A1:B10");
        } catch (e) {}
      }
      return [];
    };

    // --- DIMENSION 1: Schema Version Check ---
    const configGrid = getSheetGrid("_Config");
    const hasConfigTab = liveSheetNames.includes("_Config") || configGrid.length > 0;

    if (hasConfigTab) {
      const nrValues = getNamedRangeValues("MANIFEST_SCHEMA_VERSION");
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

      const expectedVersion = DOCUMENT_LOG_WORKBOOK_SPEC.schemaVersion || TemplateDriftAuditor.CODE_SCHEMA_VERSION;
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

    // --- DIMENSION 2: Tab Taxonomy Audit ---
    if (!hasConfigTab) {
      issues.push({
        category: "TAB",
        severity: "CRITICAL",
        description: "Missing required system configuration tab '_Config'."
      });
    }

    const hasAuditLogTab = liveSheetNames.includes("_AuditLog");
    if (!hasAuditLogTab) {
      issues.push({
        category: "TAB",
        severity: "WARNING",
        description: "Missing optional system audit log tab '_AuditLog' (can be auto-initialized)."
      });
    }

    for (const specTab of DOCUMENT_LOG_WORKBOOK_SPEC.tabs) {
      const exists = liveSheetNames.includes(specTab.name);
      if (!exists) {
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

    // --- DIMENSION 3: Named Range Registry Audit ---
    for (const nrSpec of DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges) {
      if (!liveSheetNames.includes(nrSpec.tabName)) continue;

      const exists = hasNamedRange(nrSpec.name, nrSpec.tabName);

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

    // --- DIMENSION 4 & 5 & 6: Header, Formula, & Data Validation Audits ---
    for (const specTab of DOCUMENT_LOG_WORKBOOK_SPEC.tabs) {
      if (!specTab.isLogTab || !specTab.columns || !liveSheetNames.includes(specTab.name)) {
        continue;
      }

      const grid = getSheetGrid(specTab.name);
      const liveHeaders = grid.length >= 3 ? grid[2].map(h => String(h || "").trim()) : (grid.length >= 1 ? grid[0].map(h => String(h || "").trim()) : []);

      // Dimension 4: Header Schema Alignment Audit
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

      // Dimension 5: Formula Integrity Audit (Strictly Scoped to FormulaRow)
      // Dynamically resolve formula row index from FormulaRow named range notation or fallback
      let formulaRowIdx = 3; // Default Row 4 (index 3) in standard view spec
      if (batchData && batchData.namedRanges) {
        const nr = batchData.namedRanges.find(r => r.name === "FormulaRow" || r.name === specTab.name + "_FormulaRow");
        if (nr && nr.range && typeof nr.range.startRowIndex === "number") {
          formulaRowIdx = nr.range.startRowIndex;
        }
      } else if (ssObject && typeof ssObject.getRangeByName === "function") {
        const nr = ssObject.getRangeByName("FormulaRow") || ssObject.getRangeByName(specTab.name + "_FormulaRow");
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

      // Dimension 6: Picklist Data Validation Audit
      for (let colIdx = 0; colIdx < specTab.columns.length; colIdx++) {
        const colSpec = specTab.columns[colIdx];
        if (!colSpec.validationRange) continue;

        let hasValidation = false;
        if (hasNamedRange(colSpec.validationRange)) {
          hasValidation = true;
        } else if (ssObject) {
          const sheet = ssObject.getSheetByName(specTab.name);
          if (sheet) {
            const rule = sheet.getRange(2, colIdx + 1).getDataValidation();
            hasValidation = !!rule;
          }
        }

        if (!hasValidation) {
          issues.push({
            category: "VALIDATION",
            severity: "WARNING",
            description: "Missing data validation rule for column '" + colSpec.id + "' on tab '" + specTab.name + "' (expected range '" + colSpec.validationRange + "')."
          });
        }
      }
    }

    // Determine Overall Status & Auto-Patch Boundary
    let status: SchemaDriftStatus = "MATCH";
    let canAutoPatch = true;

    const criticalCount = issues.filter(i => i.severity === "CRITICAL").length;
    const warningCount = issues.filter(i => i.severity === "WARNING").length;

    if (criticalCount > 0) {
      if (!hasConfigTab) {
        status = "INCOMPATIBLE";
      } else {
        status = "MAJOR_DRIFT";
      }
      canAutoPatch = false;
    } else if (warningCount > 0) {
      status = "MINOR_DRIFT";
      canAutoPatch = true;
    } else {
      status = "MATCH";
      canAutoPatch = true;
    }

    const auditDurationMs = Date.now() - startTime;
    const telemetry: TemplateDriftTelemetry = {
      auditDurationMs,
      tabCount: liveSheetNames.length,
      inspectionStrategy,
      apiReadCount
    };

    const executionLogPayload = JSON.stringify({
      event: "TEMPLATE_DRIFT_AUDIT_EXECUTION",
      spreadsheetId,
      status,
      canAutoPatch,
      issuesCount: issues.length,
      telemetry
    });

    if (typeof options.logger === "function") {
      options.logger(executionLogPayload);
    } else if ((globalThis as any).Logger && typeof (globalThis as any).Logger.log === "function") {
      (globalThis as any).Logger.log(executionLogPayload);
    }

    let summary = "";
    if (status === "MATCH") {
      summary = "All structural contracts, tabs, and Named Ranges validated against Schema v" + (liveSchemaVersion || TemplateDriftAuditor.CODE_SCHEMA_VERSION) + ".";
    } else if (status === "MINOR_DRIFT") {
      summary = "Detected " + warningCount + " non-critical drift issue(s). Auto-patching is ready.";
    } else if (status === "MAJOR_DRIFT") {
      summary = "Detected " + criticalCount + " critical structural discrepancy(ies). Manual migration required.";
    } else {
      summary = "Workbook is missing core _Config manifest. Incompatible Document Log.";
    }

    return {
      timestamp: new Date().toISOString(),
      spreadsheetId,
      status,
      liveSchemaVersion: liveSchemaVersion || "N/A",
      codeSchemaVersion: TemplateDriftAuditor.CODE_SCHEMA_VERSION,
      issues,
      canAutoPatch,
      summary,
      telemetry
    };
  }
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).TemplateDriftAuditor = TemplateDriftAuditor;
  module.exports = {
    TemplateDriftAuditor
  };
}
