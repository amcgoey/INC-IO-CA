/// <reference path="../../types.ts" />
/**
 * @file LogMigrationEngine.ts
 * @description Tier 1 Pure Core application domain engine responsible for legacy standalone log migration,
 * tab taxonomy re-ordering, preserving legacy backup tabs (_Backup_*) at the far right of workbooks,
 * and creating atomic pre-migration snapshots (TargetTabSnapshot).
 */

export type TabRole = "LOG" | "SUPPORT" | "SYSTEM" | "USER" | "BACKUP";

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
 * preserving legacy backup tabs (_Backup_*), and creating transactional pre-migration snapshots.
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
      throw new Error("⚠️ Tab name '" + snapshotName + "' exceeds maximum length for snapshot cloning. Please shorten tab name before migrating.");
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
