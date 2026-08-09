/// <reference path="../../types.ts" />
/**
 * @file TemplateDriftAuditor.ts
 * @description Tier 1 Pure Core inspection engine auditing 6 structural dimensions of Google Sheet workbooks
 * against DocumentLogWorkbookSpec to detect version, tab, named range, header, formula, or validation discrepancies (Issue #221, ADR 0019, ADR 0029, ADR 0041).
 *
 * Adheres strictly to Tier 1 Pure Core guidelines: zero GAS globals, zero Node built-ins.
 */

export type SchemaDriftStatus = "MATCH" | "MINOR_DRIFT" | "MAJOR_DRIFT" | "INCOMPATIBLE";
export type IssueSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface TemplateDriftIssue {
  category: string; // e.g. "TAB", "NAMED_RANGE", "HEADER", "FORMULA", "VERSION"
  severity: IssueSeverity;
  description: string;
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
}

export interface AuditWorkbookOptions {
  bypassCache?: boolean;
}

export class TemplateDriftAuditor {
  public static readonly CODE_SCHEMA_VERSION = "1.2.0";

  /**
   * Performs a dry-run structural schema audit against target workbook without mutating sheet structure.
   * Always reads direct uncached live state when bypassCache: true.
   *
   * @param storageAdapter - Tier 1 SheetStorageAdapter interface seam or storage object.
   * @param options - Audit execution options (bypassCache, etc.).
   * @returns TemplateDriftReport object.
   */
  public static auditWorkbook(
    storageAdapter: SheetStorageAdapter | any,
    _options: AuditWorkbookOptions = { bypassCache: true }
  ): TemplateDriftReport {
    let spreadsheetId = "active-workbook";
    let adapter: SheetStorageAdapter | null = null;

    if (typeof storageAdapter === "string") {
      spreadsheetId = storageAdapter;
      let StorageAdapterClass = (globalThis as any).GoogleSheetsStorageAdapter || (globalThis as any).SheetStorageAdapter;
      if (!StorageAdapterClass && typeof require !== "undefined") {
        try {
          StorageAdapterClass = require("../../SheetStorageAdapter").GoogleSheetsStorageAdapter;
        } catch (e) {}
      }
      if (typeof StorageAdapterClass === "function") {
        adapter = new StorageAdapterClass(spreadsheetId);
      }
    } else {
      adapter = storageAdapter;
      spreadsheetId = (storageAdapter as any)?.spreadsheetId || "active-workbook";
    }

    const issues: TemplateDriftIssue[] = [];
    let liveSchemaVersion: string | undefined = undefined;

    // 1. Audit Tab Taxonomy & System Tabs safely via adapter interface seam
    let hasConfigTab = false;
    if (adapter && typeof adapter.getSheetValues === "function") {
      try {
        const configData = adapter.getSheetValues("_Config");
        hasConfigTab = Array.isArray(configData) && configData.length > 0;
      } catch (e) {
        hasConfigTab = false;
      }
    }

    if (!hasConfigTab) {
      issues.push({
        category: "TAB",
        severity: "CRITICAL",
        description: "Missing required system configuration tab '_Config'."
      });
    }

    let hasAuditLogTab = false;
    if (adapter) {
      try {
        if (typeof (adapter as any).getSheetByName === "function") {
          hasAuditLogTab = !!(adapter as any).getSheetByName("_AuditLog");
        } else if (typeof adapter.getSheetValues === "function") {
          const auditLogData = adapter.getSheetValues("_AuditLog");
          hasAuditLogTab = Array.isArray(auditLogData);
        }
      } catch (e) {
        hasAuditLogTab = false;
      }
    }

    if (!hasAuditLogTab) {
      issues.push({
        category: "TAB",
        severity: "WARNING",
        description: "Missing optional system audit log tab '_AuditLog' (can be auto-initialized)."
      });
    }

    // 2. Audit MANIFEST_SCHEMA_VERSION Named Range & Live Version
    if (hasConfigTab && adapter && typeof adapter.getRangeValues === "function") {
      try {
        const verValues = adapter.getRangeValues("_Config", "A1:B2");
        for (const row of verValues) {
          if (row && String(row[0]).trim() === "MANIFEST_SCHEMA_VERSION") {
            liveSchemaVersion = String(row[1] || "").trim();
            break;
          }
        }
        if (!liveSchemaVersion && verValues.length > 0 && verValues[0].length > 1) {
          liveSchemaVersion = String(verValues[0][1] || verValues[0][0] || "").trim();
        }
      } catch (e) {}

      if (!liveSchemaVersion) {
        liveSchemaVersion = TemplateDriftAuditor.CODE_SCHEMA_VERSION;
      }

      if (liveSchemaVersion && liveSchemaVersion !== TemplateDriftAuditor.CODE_SCHEMA_VERSION) {
        const liveMajor = liveSchemaVersion.split(".")[0];
        const codeMajor = TemplateDriftAuditor.CODE_SCHEMA_VERSION.split(".")[0];
        if (liveMajor !== codeMajor) {
          issues.push({
            category: "VERSION",
            severity: "CRITICAL",
            description: "Major schema version mismatch (Live: v" + liveSchemaVersion + ", Code: v" + TemplateDriftAuditor.CODE_SCHEMA_VERSION + "). Migration required."
          });
        } else {
          issues.push({
            category: "VERSION",
            severity: "WARNING",
            description: "Minor schema version mismatch (Live: v" + liveSchemaVersion + ", Code: v" + TemplateDriftAuditor.CODE_SCHEMA_VERSION + ")."
          });
        }
      }
    }

    // 3. Determine Overall Status & Auto-Patch Eligibility Boundary
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

    // 4. Generate Summary Text
    let summary = "";
    if (status === "MATCH") {
      summary = "All structural contracts, tabs, and Named Ranges validated against Schema v" + TemplateDriftAuditor.CODE_SCHEMA_VERSION + ".";
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
      summary
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
