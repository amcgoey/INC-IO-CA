/// <reference path="../../types.ts" />
/**
 * @file LogMigrationEngine.ts
 * @description Tier 1 Pure Core application domain engine responsible for legacy standalone log migration,
 * tab taxonomy re-ordering, preserving legacy backup tabs (_Backup_*) at the far right of workbooks,
 * creating atomic pre-migration snapshots (TargetTabSnapshot), 4-tier legacy inline formula coercion,
 * pre-flight target calculated column spill collision auditing, and _AuditLog event logging.
 */

export type TabRole = "LOG" | "SUPPORT" | "SYSTEM" | "USER" | "BACKUP";

export interface LegacyCalculatedFormulaDiscrepancy {
  tabName: string;
  rowIndex: number;
  columnIndex: number;
  header: string;
  formula: string;
  actionTaken: "CLEARED_FOR_SPILL" | "COERCED_TO_SNAPSHOT" | "PRESERVED_USER_FORMULA" | string;
}

export interface MigrationAuditReport {
  tabName: string;
  totalRows: number;
  calculatedColumnsCoercedCount: number;
  inlineFormulasDetectedCount: number;
  legacyCalculatedFormulaDiscrepancies: LegacyCalculatedFormulaDiscrepancy[];
  targetSpillCollisionBlocked: boolean;
  canProceed: boolean;
  reasons: string[];
}

/**
 * Classifies a spreadsheet tab name into the 5-tier workbook taxonomy:
 * LOG -> SUPPORT -> SYSTEM -> USER -> BACKUP.
 */
export function classifyTabRole(tabName: string): TabRole {
  if (!tabName) return "USER";
  if (tabName.startsWith("_Backup_")) {
    return "BACKUP";
  }
  if (tabName === "_Shared" || tabName === "_Config" || tabName === "_AuditLog") {
    return "SYSTEM";
  }
  if (tabName.endsWith(" Support") || tabName === "Submittal Arch Support" || tabName === "Submittal FFE Support") {
    return "SUPPORT";
  }
  if (tabName.startsWith("Submittal ") || tabName.endsWith(" Log") || tabName === "Submittal Arch" || tabName === "Submittal FFE") {
    return "LOG";
  }
  return "USER";
}

/**
 * Gets the numeric sort weight for a tab role (1: LOG, 2: SUPPORT, 3: SYSTEM, 4: USER, 5: BACKUP).
 */
export function getTabRoleWeight(role: TabRole): number {
  switch (role) {
    case "LOG": return 1;
    case "SUPPORT": return 2;
    case "SYSTEM": return 3;
    case "USER": return 4;
    case "BACKUP": return 5;
    default: return 4;
  }
}

/**
 * Returns tab names sorted strictly according to canonical 5-tier workbook taxonomy order:
 * Log tabs -> Support tabs -> System tabs (_Shared, _Config, _AuditLog) -> User tabs -> Backup tabs (_Backup_*) at far right.
 */
export function getOrderedTabNames(tabNames: string[]): string[] {
  const tabs = [...tabNames];
  
  const systemPriority: Record<string, number> = {
    "_Shared": 1,
    "_Config": 2,
    "_AuditLog": 3
  };

  return tabs.sort((a, b) => {
    const roleA = classifyTabRole(a);
    const roleB = classifyTabRole(b);
    const weightA = getTabRoleWeight(roleA);
    const weightB = getTabRoleWeight(roleB);

    if (weightA !== weightB) {
      return weightA - weightB;
    }

    if (roleA === "SYSTEM" && roleB === "SYSTEM") {
      const prioA = systemPriority[a] || 99;
      const prioB = systemPriority[b] || 99;
      return prioA - prioB;
    }

    if (roleA === "BACKUP" && roleB === "BACKUP") {
      return tabNames.indexOf(a) - tabNames.indexOf(b);
    }

    return a.localeCompare(b);
  });
}

/**
 * Verifies if tab names follow strict 5-tier workbook taxonomy ordering:
 * Log tabs -> Support tabs -> System tabs (_Shared, _Config, _AuditLog) -> User tabs -> Backup tabs (_Backup_*) at far right.
 */
export function verifyTabTaxonomyOrder(tabNames: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let maxWeightSeen = 0;
  let maxTabSeen = "";

  for (let i = 0; i < tabNames.length; i++) {
    const tab = tabNames[i];
    const role = classifyTabRole(tab);
    const weight = getTabRoleWeight(role);

    if (role === "BACKUP") {
      for (let j = i + 1; j < tabNames.length; j++) {
        const nextRole = classifyTabRole(tabNames[j]);
        if (nextRole !== "BACKUP") {
          errors.push("Backup tab '" + tab + "' must be placed at the far right of the workbook (found non-backup tab '" + tabNames[j] + "' after it).");
          break;
        }
      }
    }

    if (weight < maxWeightSeen) {
      const prevRole = classifyTabRole(maxTabSeen);
      errors.push("Tab '" + tab + "' (" + role + ") is misplaced after tab '" + maxTabSeen + "' (" + prevRole + "). Taxonomy requires LOG -> SUPPORT -> SYSTEM -> USER -> BACKUP.");
    } else {
      maxWeightSeen = weight;
      maxTabSeen = tab;
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Domain engine responsible for inspecting, validating, transforming legacy standalone log spreadsheets,
 * preserving legacy backup tabs (_Backup_*), creating transactional pre-migration snapshots,
 * executing 4-tier formula coercion, and checking spill collision gating.
 */
export class LogMigrationEngine {
  private storageAdapter: SheetStorageAdapter;

  constructor(storageAdapter: SheetStorageAdapter) {
    this.storageAdapter = storageAdapter;
  }

  /**
   * Ensures all legacy backup tabs (_Backup_*) are preserved intact (unmodified, un-deleted)
   * and positioned at the far right of the workbook tab order.
   * Calls storageAdapter.reorderTabs if implemented.
   */
  public preserveBackupTabs(existingTabNames: string[]): string[] {
    const ordered = getOrderedTabNames(existingTabNames);
    if (typeof this.storageAdapter.reorderTabs === "function") {
      this.storageAdapter.reorderTabs(ordered);
    }
    return ordered;
  }

  /**
   * Creates a pre-migration snapshot duplicate (_Backup_<TabName>_<Timestamp>) placed at tail index (far right).
   * Validates 100-character tab name length guard.
   */
  public createPreMigrationSnapshot(tabName: string, timestamp: string): string {
    const snapshotName = "_Backup_" + tabName + "_" + timestamp;
    
    if (snapshotName.length > 100) {
      throw new Error("Tab name '" + snapshotName + "' exceeds maximum length for snapshot cloning. Please shorten tab name before migrating.");
    }

    const sourceValues = this.storageAdapter.getSheetValues(tabName);
    if (sourceValues && sourceValues.length > 0) {
      this.storageAdapter.setRowValues(snapshotName, 1, sourceValues[0].map(String), sourceValues[0]);
      for (let r = 1; r < sourceValues.length; r++) {
        this.storageAdapter.setRowValues(snapshotName, r + 1, sourceValues[0].map(String), sourceValues[r]);
      }
    }

    const allTabs = this.storageAdapter.getTabNames ? this.storageAdapter.getTabNames() : [];
    this.preserveBackupTabs(allTabs);
    return snapshotName;
  }

  /**
   * Enforces the 4-tier formula coercion policy on a log tab matrix:
   * Tier 1: Calculated columns (isCalculated: true) in data rows (row > 2): values/formulas cleared to "" so FormulaRow spills down.
   * Tier 2: Standard non-calculated columns in data rows: custom inline formulas coerced to evaluated static snapshot values.
   * Tier 3: User-created columns in data rows: custom inline formulas coerced to evaluated static snapshot values.
   * Tier 4: User-created columns in Row 2 (FormulaRow): top-level formulas preserved as formula text for post-migration editing.
   */
  public coerceInlineFormulas(
    tabName: string,
    fieldSpecs: DocumentFieldSpec[],
    options?: { sourceValues?: any[][]; sourceFormulas?: string[][] }
  ): {
    coercedValues: any[][];
    discrepancies: LegacyCalculatedFormulaDiscrepancy[];
    calculatedColumnsCoercedCount: number;
    inlineFormulasDetectedCount: number;
  } {
    const rawValues = options?.sourceValues ?? this.storageAdapter.getSheetValues(tabName);
    const rawFormulas = options?.sourceFormulas ??
      (typeof this.storageAdapter.getSheetFormulas === "function"
        ? this.storageAdapter.getSheetFormulas(tabName)
        : rawValues.map(row => row.map(v => (typeof v === "string" && v.startsWith("=") ? v : ""))));

    if (!rawValues || rawValues.length === 0) {
      return {
        coercedValues: [],
        discrepancies: [],
        calculatedColumnsCoercedCount: 0,
        inlineFormulasDetectedCount: 0
      };
    }

    const headers = rawValues[0] || [];
    
    const colFieldMap: Map<number, DocumentFieldSpec | null> = new Map();
    for (let c = 0; c < headers.length; c++) {
      const hText = String(headers[c] || "").trim();
      const spec = fieldSpecs.find(
        f => f.header === hText || f.key === hText || f.label === hText
      ) || null;
      colFieldMap.set(c, spec);
    }

    const coercedValues: any[][] = rawValues.map(row => [...row]);
    const discrepancies: LegacyCalculatedFormulaDiscrepancy[] = [];
    let calculatedColumnsCoercedCount = 0;
    let inlineFormulasDetectedCount = 0;

    for (let r = 0; r < rawValues.length; r++) {
      const rowNum = r + 1;
      const rowVal = rawValues[r];
      const rowForm = rawFormulas[r] || [];

      for (let c = 0; c < headers.length; c++) {
        const colNum = c + 1;
        const cellValue = rowVal[c];
        const cellFormula = rowForm[c] || (typeof cellValue === "string" && cellValue.startsWith("=") ? cellValue : "");
        const fieldSpec = colFieldMap.get(c);
        const headerName = String(headers[c] || "");

        const isCalculated = fieldSpec?.isCalculated === true;
        const isUserColumn = !fieldSpec;
        const hasFormula = Boolean(cellFormula && cellFormula.startsWith("="));

        if (hasFormula) {
          inlineFormulasDetectedCount++;
        }

        if (rowNum === 1) {
          continue;
        } else if (rowNum === 2) {
          if (isUserColumn && hasFormula) {
            coercedValues[r][c] = cellFormula;
            discrepancies.push({
              tabName,
              rowIndex: rowNum,
              columnIndex: colNum,
              header: headerName,
              formula: cellFormula,
              actionTaken: "PRESERVED_USER_FORMULA"
            });
          }
        } else {
          if (isCalculated) {
            if (cellValue !== "" && cellValue !== null && cellValue !== undefined) {
              coercedValues[r][c] = "";
              calculatedColumnsCoercedCount++;
              if (hasFormula) {
                discrepancies.push({
                  tabName,
                  rowIndex: rowNum,
                  columnIndex: colNum,
                  header: headerName,
                  formula: cellFormula,
                  actionTaken: "CLEARED_FOR_SPILL"
                });
              }
            }
          } else {
            if (hasFormula) {
              coercedValues[r][c] = cellValue;
              discrepancies.push({
                tabName,
                rowIndex: rowNum,
                columnIndex: colNum,
                header: headerName,
                formula: cellFormula,
                actionTaken: "COERCED_TO_SNAPSHOT"
              });
            }
          }
        }
      }
    }

    return {
      coercedValues,
      discrepancies,
      calculatedColumnsCoercedCount,
      inlineFormulasDetectedCount
    };
  }

  /**
   * Audits a log migration dry-run, checking for legacy calculated formula discrepancies and
   * pre-flight target calculated column spill collisions.
   */
  public auditLogMigration(
    tabName: string,
    fieldSpecs: DocumentFieldSpec[],
    options?: { targetTabName?: string }
  ): MigrationAuditReport {
    const coercionResult = this.coerceInlineFormulas(tabName, fieldSpecs);
    const reasons: string[] = [];
    let targetSpillCollisionBlocked = false;

    const targetTab = options?.targetTabName;
    if (targetTab) {
      const targetValues = this.storageAdapter.getSheetValues(targetTab);
      if (targetValues && targetValues.length > 0) {
        const targetHeaders = targetValues[0] || [];
        const calcColIndices: number[] = [];

        for (let c = 0; c < targetHeaders.length; c++) {
          const hText = String(targetHeaders[c] || "").trim();
          const spec = fieldSpecs.find(f => f.header === hText || f.key === hText || f.label === hText);
          if (spec?.isCalculated) {
            calcColIndices.push(c);
          }
        }

        for (let r = 2; r < targetValues.length; r++) {
          for (const colIdx of calcColIndices) {
            const val = targetValues[r][colIdx];
            if (val !== "" && val !== null && val !== undefined) {
              targetSpillCollisionBlocked = true;
              break;
            }
          }
          if (targetSpillCollisionBlocked) break;
        }
      }
    }

    if (targetSpillCollisionBlocked) {
      reasons.push("Target calculated column contains pre-existing text blocking formula spill-down.");
    }

    const canProceed = !targetSpillCollisionBlocked;

    return {
      tabName,
      totalRows: coercionResult.coercedValues.length,
      calculatedColumnsCoercedCount: coercionResult.calculatedColumnsCoercedCount,
      inlineFormulasDetectedCount: coercionResult.inlineFormulasDetectedCount,
      legacyCalculatedFormulaDiscrepancies: coercionResult.discrepancies,
      targetSpillCollisionBlocked,
      canProceed,
      reasons
    };
  }

  /**
   * Appends a standardized 6-column audit log entry for migration formula coercion to the _AuditLog system tab.
   */
  public logDiscrepanciesToAuditLog(spreadsheetId: string, report: MigrationAuditReport): void {
    const sheetName = "_AuditLog";
    const auditHeaders = ["Timestamp", "Category", "EventType", "Actor", "Status", "Details"];
    const logData = this.storageAdapter.getSheetValues(sheetName);

    let targetRowIndex = logData.length + 1;
    if (logData.length === 0) {
      this.storageAdapter.setRowValues(sheetName, 1, auditHeaders, auditHeaders);
      targetRowIndex = 2;
    }

    const timestamp = new Date().toISOString();
    const status = report.canProceed ? "SUCCESS" : "BLOCKED";
    const details = JSON.stringify(report);

    const rowData = [timestamp, "LOG_MIGRATION", "FORMULA_COERCION_AUDIT", "LogMigrationEngine", status, details];
    this.storageAdapter.setRowValues(sheetName, targetRowIndex, auditHeaders, rowData);
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LogMigrationEngine,
    classifyTabRole,
    getTabRoleWeight,
    getOrderedTabNames,
    verifyTabTaxonomyOrder
  };
}

(globalThis as any).LogMigrationEngine = LogMigrationEngine;
