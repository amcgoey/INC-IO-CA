/// <reference path="../../types.ts" />
/**
 * @file LogMigrationEngine.ts
 * @description Tier 1 Pure Core application domain engine responsible for legacy standalone log migration,
 * tab taxonomy re-ordering, preserving legacy backup tabs (_Backup_*) at the far right of workbooks,
 * creating atomic pre-migration snapshots (TargetTabSnapshot), 4-tier legacy inline formula coercion,
 * pre-flight target calculated column spill collision auditing, cell budget gating, pure TS SHA-256 idempotency fingerprinting,
 * transaction lock cleanup, and _AuditLog event logging.
 */

export type TabRole = "LOG" | "SUPPORT" | "SYSTEM" | "USER" | "BACKUP";
export type CellValue = string | number | boolean | null | undefined;

export interface LegacyCalculatedFormulaDiscrepancy {
  tabName: string;
  rowIndex: number;
  columnIndex: number;
  header: string;
  formula: string;
  actionTaken: "CLEARED_FOR_SPILL" | "COERCED_TO_SNAPSHOT" | "PRESERVED_USER_FORMULA" | string;
}

export interface LiveMigrationResult {
  status: "MIGRATION_COMMITTED" | "ROLLED_BACK" | "ALREADY_MIGRATED" | "FAILED";
  tabName: string;
  sourceDataRowCount: number;
  targetAppendedRowCount: number;
  lastMigrationHash?: string;
  snapshotName?: string;
  auditReport?: MigrationAuditReport;
  error?: string;
}

export interface MigrationAuditReport {
  tabName: string;
  totalRows: number;
  sourceDataRowCount: number;
  targetAppendedRowCount: number;
  calculatedColumnsCoercedCount: number;
  inlineFormulasDetectedCount: number;
  formulaCoercionSummary: {
    calculatedColumnsCoercedCount: number;
    inlineFormulasDetectedCount: number;
    discrepanciesCount: number;
  };
  legacyCalculatedFormulaDiscrepancies: LegacyCalculatedFormulaDiscrepancy[];
  targetSpillCollisionBlocked: boolean;
  canProceed: boolean;
  reasons: string[];
  validationErrors: string[];
  cellBudgetExceeded?: boolean;
  idempotencyStatus?: "PENDING" | "ALREADY_MIGRATED";
}

/**
 * Validates snapshot tab name length against Google Sheets 100-character tab name limit.
 */
export function validateSnapshotTabName(tabName: string, timestamp: string): { valid: boolean; snapshotName: string; error?: string } {
  const snapshotName = tabName.startsWith("_Backup_") ? tabName : "_Backup_" + tabName + "_" + timestamp;
  if (snapshotName.length > 100) {
    return {
      valid: false,
      snapshotName,
      error: "Tab name '" + snapshotName + "' exceeds maximum length for snapshot cloning (100 characters limit). Please shorten tab name before migrating."
    };
  }
  return { valid: true, snapshotName };
}


function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Pure TypeScript SHA-256 digest function compatible with GAS V8 and Node.js without external imports.
 */
export function sha256Pure(ascii: string): string {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i = 0, j = 0;
  let result = "";

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef4a3f7, 0xc67178f2
  ];

  ascii += String.fromCharCode(128);
  while ((ascii.length % 64) !== 56) ascii += String.fromCharCode(0);
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << ((3 - i % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

/**
 * Computes deterministic SHA-256 fingerprint hash for idempotency checking without Node imports.
 */
export function computeMigrationHash(sourceData: CellValue[][]): string {
  const raw = JSON.stringify(sourceData || []);
  const hex = sha256Pure(raw);
  return "sha256_" + hex;
}


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
  private lockAdapter?: SpreadsheetLockAdapter;

  constructor(storageAdapter: SheetStorageAdapter, lockAdapter?: SpreadsheetLockAdapter) {
    this.storageAdapter = storageAdapter;
    this.lockAdapter = lockAdapter;
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
   * Creates a pre-migration snapshot duplicate (<TabName>_Snapshot_<Timestamp>) placed at tail index (far right).
   * Validates 100-character tab name length guard.
   */
  public createPreMigrationSnapshot(tabName: string, timestamp: string): string {
    const snapshotGuard = validateSnapshotTabName(tabName, timestamp);
    if (!snapshotGuard.valid) {
      throw new Error(snapshotGuard.error);
    }
    const snapshotName = snapshotGuard.snapshotName;
    
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
    options?: { sourceValues?: CellValue[][]; sourceFormulas?: string[][] }
  ): {
    coercedValues: CellValue[][];
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

    const coercedValues: CellValue[][] = rawValues.map(row => [...row]);
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
   * Audits a log migration dry-run, checking target snapshot tab name length, idempotency fingerprinting,
   * cell budget limits, legacy calculated formula discrepancies, and pre-flight target calculated column spill collisions.
   */
  public auditLogMigration(
    tabName: string,
    fieldSpecs: DocumentFieldSpec[],
    options?: { targetTabName?: string; timestamp?: string; sourceStorageAdapter?: SheetStorageAdapter }
  ): MigrationAuditReport {
    const reasons: string[] = [];
    const validationErrors: string[] = [];
    const ts = options?.timestamp || "20260809_120000";

    const snapshotGuard = validateSnapshotTabName(tabName, ts);
    if (!snapshotGuard.valid && snapshotGuard.error) {
      reasons.push(snapshotGuard.error);
      validationErrors.push(snapshotGuard.error);
    }

    const sourceAdapter = options?.sourceStorageAdapter || this.storageAdapter;
    const sourceValues: CellValue[][] = sourceAdapter.getSheetValues(tabName) || [];
    const sourceDataRowCount = Math.max(0, sourceValues.length - 2);

    let idempotencyStatus: "PENDING" | "ALREADY_MIGRATED" = "PENDING";
    const sourceHash = computeMigrationHash(sourceValues);
    const configValues = this.storageAdapter.getSheetValues("_Config") || [];
    let existingHash = "";
    for (const row of configValues) {
      if (row[0] === "lastMigrationHash") {
        existingHash = String(row[1] || "");
        break;
      }
    }
    if (existingHash && existingHash === sourceHash) {
      idempotencyStatus = "ALREADY_MIGRATED";
      const idErr = "ALREADY_MIGRATED: Source spreadsheet matches lastMigrationHash fingerprint.";
      reasons.push(idErr);
      validationErrors.push(idErr);
    }

    let cellBudgetExceeded = false;
    let totalWorkbookCells = 0;
    const allTabNames = this.storageAdapter.getTabNames ? this.storageAdapter.getTabNames() : [tabName];
    for (const name of allTabNames) {
      const vals = this.storageAdapter.getSheetValues(name);
      if (vals) {
        totalWorkbookCells += vals.length * (vals[0]?.length || 0);
      }
    }
    const newCells = sourceValues.length * (sourceValues[0]?.length || 0);
    if (totalWorkbookCells + newCells > 800000) {
      cellBudgetExceeded = true;
      const budgetErr = "Pre-flight cell budget exceeded limit (>800,000 cells). Total cells: " + (totalWorkbookCells + newCells);
      reasons.push(budgetErr);
      validationErrors.push(budgetErr);
    }

    const coercionResult = this.coerceInlineFormulas(tabName, fieldSpecs, { sourceValues });
    let targetSpillCollisionBlocked = false;

    const targetTab = options?.targetTabName;
    const targetAppendedRowCount = sourceDataRowCount;

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
          if (options?.targetTabName === tabName) { continue; }
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
      const spillErr = "Target calculated column contains pre-existing text blocking formula spill-down.";
      reasons.push(spillErr);
      validationErrors.push(spillErr);
    }

    const canProceed = validationErrors.length === 0 && !targetSpillCollisionBlocked;

    return {
      tabName,
      totalRows: coercionResult.coercedValues.length,
      sourceDataRowCount,
      targetAppendedRowCount,
      calculatedColumnsCoercedCount: coercionResult.calculatedColumnsCoercedCount,
      inlineFormulasDetectedCount: coercionResult.inlineFormulasDetectedCount,
      formulaCoercionSummary: {
        calculatedColumnsCoercedCount: coercionResult.calculatedColumnsCoercedCount,
        inlineFormulasDetectedCount: coercionResult.inlineFormulasDetectedCount,
        discrepanciesCount: coercionResult.discrepancies.length
      },
      legacyCalculatedFormulaDiscrepancies: coercionResult.discrepancies,
      targetSpillCollisionBlocked,
      canProceed,
      reasons,
      validationErrors,
      cellBudgetExceeded,
      idempotencyStatus
    };
  }

  /**
   * Appends a standardized 6-column audit log entry for migration dry-run to the _AuditLog system tab.
   * Telemetry emitted under Category = 'MIGRATION'.
   */
  public logDiscrepanciesToAuditLog(spreadsheetId: string, report: MigrationAuditReport): void {
    const sheetName = "_AuditLog";
    const auditHeaders = ["Timestamp", "Category", "EventType", "Actor", "Status", "Details"];
    const logData = this.storageAdapter.getSheetValues(sheetName) || [];

    let targetRowIndex = logData.length + 1;
    if (logData.length === 0) {
      this.storageAdapter.setRowValues(sheetName, 1, auditHeaders, auditHeaders);
      targetRowIndex = 2;
    }

    const timestamp = new Date().toISOString();
    const status = report.canProceed ? "SUCCESS" : "BLOCKED";
    const details = JSON.stringify(report);

    const rowData = [timestamp, "MIGRATION", "DRY_RUN_AUDIT", "LogMigrationEngine", status, details];
    this.storageAdapter.setRowValues(sheetName, targetRowIndex, auditHeaders, rowData);
  }

  /**
   * Executes Pass 1 dry-run audit end-to-end within transaction lock safety boundary.
   * Cleanly acquires and releases SpreadsheetLockAdapter transaction lock in a finally block.
   */
  public executeDryRun(
    spreadsheetId: string,
    tabName: string,
    fieldSpecs: DocumentFieldSpec[],
    options?: { targetTabName?: string; timestamp?: string }
  ): MigrationAuditReport {
    let executionId: string | null = null;
    if (this.lockAdapter) {
      executionId = this.lockAdapter.acquireLock(spreadsheetId);
      if (!executionId) {
        throw new Error("ConcurrentMigrationException: Unable to acquire transaction lock for spreadsheet '" + spreadsheetId + "'. Migration locked by active transaction.");
      }
    }

    try {
      const report = this.auditLogMigration(tabName, fieldSpecs, options);
      this.logDiscrepanciesToAuditLog(spreadsheetId, report);
      return report;
    } finally {
      if (this.lockAdapter && executionId) {
        this.lockAdapter.releaseLock(spreadsheetId, executionId);
      }
    }
  }

  /**
   * Executes Pass 1 audit under transaction lock safety.
   */

  /**
   * Restores target tab from pre-migration backup snapshot tab and cleans up snapshot tab on rollback.
   */
  public restoreFromSnapshot(storageAdapter: SheetStorageAdapter, tabName: string, snapshotName: string): boolean {
    const snapshotValues = storageAdapter.getSheetValues(snapshotName);
    if (snapshotValues && snapshotValues.length > 0) {
      storageAdapter.setSheetValues(tabName, snapshotValues);
      const snapshotFormulas = typeof storageAdapter.getSheetFormulas === "function"
        ? storageAdapter.getSheetFormulas(snapshotName)
        : null;
      if (snapshotFormulas && typeof storageAdapter.setSheetFormulas === "function") {
        storageAdapter.setSheetFormulas(tabName, snapshotFormulas);
      }
    }
    if (typeof storageAdapter.deleteTab === "function") {
      storageAdapter.deleteTab(snapshotName);
    }
    const allTabs = storageAdapter.getTabNames ? storageAdapter.getTabNames() : [];
    this.preserveBackupTabs(allTabs);
    return true;
  }

  /**
   * Archives source spreadsheet: prefixes title with [MIGRATED_LEGACY] and prepends read-only _MIGRATION_INFO summary tab at index 0.
   */
  public archiveSourceSpreadsheet(
    sourceStorage: SheetStorageAdapter,
    targetSpreadsheetId: string,
    targetTabName: string,
    lastMigrationHash: string,
    rowCount: number,
    timestamp: string,
    sourceSpreadsheetId?: string
  ): void {
    const titleId = sourceSpreadsheetId || targetSpreadsheetId;
    if (typeof sourceStorage.setSpreadsheetTitle === "function") {
      sourceStorage.setSpreadsheetTitle("[MIGRATED_LEGACY] Legacy Log " + titleId);
    }

    const infoSheetName = "_MIGRATION_INFO";
    const infoRows: CellValue[][] = [
      ["NOTICE", "This spreadsheet has been migrated to the new DocumentLogWorkbook structure and is read-only."],
      ["Target Spreadsheet ID", targetSpreadsheetId],
      ["Migrated Log Tab", targetTabName],
      ["Migration Timestamp", timestamp],
      ["Migrated Data Row Count", rowCount],
      ["Migration SHA-256 Hash", lastMigrationHash]
    ];
    sourceStorage.setSheetValues(infoSheetName, infoRows);
    const tabs = sourceStorage.getTabNames ? sourceStorage.getTabNames() : [];
    if (tabs.includes(infoSheetName) && sourceStorage.reorderTabs) {
      const remaining = tabs.filter(t => t !== infoSheetName);
      sourceStorage.reorderTabs([infoSheetName, ...remaining]);
    }
  }

  /**
   * Logs execution event telemetry under Category = 'MIGRATION' in _AuditLog tab.
   */
  public logMigrationEvent(spreadsheetId: string, eventType: string, status: string, detailsObj: Record<string, unknown>): void {
    try {
      const sheetName = "_AuditLog";
      const auditHeaders = ["Timestamp", "Category", "EventType", "Actor", "Status", "Details"];
      let logData: any[][] = [];
      try {
        logData = this.storageAdapter.getSheetValues(sheetName) || [];
      } catch (_e) {
        logData = [];
      }

      let targetRowIndex = logData.length + 1;
      if (logData.length === 0) {
        this.storageAdapter.setRowValues(sheetName, 1, auditHeaders, auditHeaders);
        targetRowIndex = 2;
      }

      const timestamp = new Date().toISOString();
      const details = JSON.stringify(detailsObj);

      const rowData = [timestamp, "MIGRATION", eventType, "LogMigrationEngine", status, details];
      this.storageAdapter.setRowValues(sheetName, targetRowIndex, auditHeaders, rowData);
    } catch (_err) {}
  }

  /**
   * Executes Pass 2 live row migration with pre-migration backup snapshot (_Backup_<TabName>_<Timestamp>),
   * 4-tier legacy formula coercion, post-flight row count parity check, atomic rollback safety,
   * SHA-256 fingerprinting, source spreadsheet archiving, and _AuditLog event telemetry.
   */
  public executeLiveMigration(
    spreadsheetId: string,
    tabName: string,
    fieldSpecs: DocumentFieldSpec[],
    options?: {
      targetTabName?: string;
      timestamp?: string;
      sourceStorageAdapter?: SheetStorageAdapter;
      sourceSpreadsheetId?: string;
      forceParityFailureForTest?: boolean;
      forceWriteErrorForTest?: boolean;
    }
  ): LiveMigrationResult {
    let executionId: string | null = null;
    if (this.lockAdapter) {
      executionId = this.lockAdapter.acquireLock(spreadsheetId);
      if (!executionId) {
        throw new Error("ConcurrentMigrationException: Unable to acquire transaction lock for spreadsheet '" + spreadsheetId + "'. Migration locked by active transaction.");
      }
    }

    const targetStorage = this.storageAdapter;
    const sourceStorage = options?.sourceStorageAdapter || targetStorage;
    const targetTabName = options?.targetTabName || tabName;
    const timestamp = options?.timestamp || "20260809_120000";

    try {
      const sourceValues: CellValue[][] = sourceStorage.getSheetValues(tabName) || [];
      const sourceFormulas: string[][] | undefined = typeof sourceStorage.getSheetFormulas === "function"
        ? sourceStorage.getSheetFormulas(tabName)
        : undefined;

      const sourceHash = computeMigrationHash(sourceValues);

      // Check idempotency in target _Config tab
      const configValues = targetStorage.getSheetValues("_Config") || [];
      for (const r of configValues) {
        if (r[0] === "lastMigrationHash" && String(r[1] || "") === sourceHash) {
          const sourceRowCount = Math.max(0, sourceValues.length - 2);
          return {
            status: "ALREADY_MIGRATED",
            tabName: targetTabName,
            sourceDataRowCount: sourceRowCount,
            targetAppendedRowCount: 0,
            lastMigrationHash: sourceHash
          };
        }
      }

      // Pass 1 audit
      const auditReport = this.auditLogMigration(tabName, fieldSpecs, { targetTabName, timestamp, sourceStorageAdapter: sourceStorage });
      if (!auditReport.canProceed || auditReport.idempotencyStatus === "ALREADY_MIGRATED") {
        return {
          status: auditReport.idempotencyStatus === "ALREADY_MIGRATED" ? "ALREADY_MIGRATED" : "FAILED",
          tabName: targetTabName,
          sourceDataRowCount: auditReport.sourceDataRowCount,
          targetAppendedRowCount: 0,
          auditReport,
          error: auditReport.reasons.join("; ")
        };
      }

      // Pre-migration snapshot creation
      const snapshotName = this.createPreMigrationSnapshot(targetTabName, timestamp);

      let targetAppendedRowCount = 0;
      const sourceDataRowCount = auditReport.sourceDataRowCount;

      try {
        if (options?.forceWriteErrorForTest) {
          throw new Error("Simulated mid-write database failure");
        }

        // Apply 4-tier legacy formula coercion
        const coercionResult = this.coerceInlineFormulas(tabName, fieldSpecs, {
          sourceValues,
          sourceFormulas
        });

        const dataRows = coercionResult.coercedValues.slice(2);
        const headers = (sourceValues[0] || []).map(String);

        // Determine target append starting row index (First Active Data Row is Row H + 3 = Row 4)
        const targetValues = targetStorage.getSheetValues(targetTabName) || [];
        let startRowIndex = 4;
        if (targetValues.length >= 3) {
          startRowIndex = Math.max(4, targetValues.length + 1);
        }

        for (let i = 0; i < dataRows.length; i++) {
          const rIdx = startRowIndex + i;
          targetStorage.setRowValues(targetTabName, rIdx, headers, dataRows[i]);
          targetAppendedRowCount++;
        }

        // Post-flight row count parity verification against live target sheet
        const finalTargetValues = targetStorage.getSheetValues(targetTabName) || [];
        const finalTargetDataRowCount = Math.max(0, finalTargetValues.length - (startRowIndex - 1));
        if (sourceDataRowCount !== targetAppendedRowCount || sourceDataRowCount !== finalTargetDataRowCount) {
          throw new Error("RowCountParityException: Source data row count (" + sourceDataRowCount + ") does not match target appended row count (" + finalTargetDataRowCount + ").");
        }

        // Verified success cleanup: delete backup snapshot tab
        if (typeof targetStorage.deleteTab === "function") {
          targetStorage.deleteTab(snapshotName);
        }

        // Update lastMigrationHash in _Config
        let hashUpdated = false;
        for (let i = 0; i < configValues.length; i++) {
          if (configValues[i][0] === "lastMigrationHash") {
            configValues[i][1] = sourceHash;
            hashUpdated = true;
            break;
          }
        }
        if (!hashUpdated) {
          if (configValues.length === 0) {
            configValues.push(["Key", "Value"]);
          }
          configValues.push(["lastMigrationHash", sourceHash]);
        }
        targetStorage.setSheetValues("_Config", configValues);

        // Archive legacy source spreadsheet
        this.archiveSourceSpreadsheet(
          sourceStorage,
          options?.sourceSpreadsheetId || spreadsheetId,
          targetTabName,
          sourceHash,
          sourceDataRowCount,
          timestamp
        );

        // Telemetry logging to _AuditLog
        this.logMigrationEvent(spreadsheetId, "MIGRATION_COMMITTED", "SUCCESS", {
          tabName: targetTabName,
          sourceDataRowCount,
          targetAppendedRowCount,
          lastMigrationHash: sourceHash
        });

        return {
          status: "MIGRATION_COMMITTED",
          tabName: targetTabName,
          sourceDataRowCount,
          targetAppendedRowCount,
          lastMigrationHash: sourceHash,
          snapshotName,
          auditReport
        };

      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // Atomic Rollback
        this.restoreFromSnapshot(targetStorage, targetTabName, snapshotName);

        this.logMigrationEvent(spreadsheetId, "MIGRATION_ROLLED_BACK", "ROLLED_BACK", {
          tabName: targetTabName,
          error: errorMsg,
          snapshotName
        });

        return {
          status: "ROLLED_BACK",
          tabName: targetTabName,
          sourceDataRowCount,
          targetAppendedRowCount: 0,
          snapshotName,
          auditReport,
          error: errorMsg
        };
      }

    } finally {
      if (this.lockAdapter && executionId) {
        this.lockAdapter.releaseLock(spreadsheetId, executionId);
      }
    }
  }

  public executeAudit(
    spreadsheetId: string,
    tabName: string,
    fieldSpecs: DocumentFieldSpec[],
    options?: { targetTabName?: string; timestamp?: string }
  ): MigrationAuditReport {
    return this.executeDryRun(spreadsheetId, tabName, fieldSpecs, options);
  }
}

declare let module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LogMigrationEngine,
    classifyTabRole,
    getTabRoleWeight,
    getOrderedTabNames,
    verifyTabTaxonomyOrder,
    validateSnapshotTabName,
    computeMigrationHash,
    sha256Pure
  };
}

(globalThis as any).LogMigrationEngine = LogMigrationEngine;
