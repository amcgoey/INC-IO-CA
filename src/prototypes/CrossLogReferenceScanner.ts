/**
 * @file CrossLogReferenceScanner.ts
 * @description Pure Tier 1 Core Module for detecting and repairing cross-log document references
 * (RFIs, Submittals, ASIs) during dry-run audit and post-migration sheet re-linking.
 *
 * Adheres to CODING_STANDARDS.md (Tier 1 Pure Core: no Apps Script globals, no Node imports).
 */

export interface SourceCellData {
  sheetId: string;
  tabName: string;
  rowIndex: number;
  columnIndex: number;
  cellAddress: string;
  rawFormulaOrValue: string;
}

export type CrossLogReferenceType =
  | "HYPERLINK_URL"
  | "INTERNAL_GID_LINK"
  | "SHEET_FORMULA"
  | "TEXT_DOCUMENT_KEY";

export type ReferenceHealthStatus =
  | "HEALTHY"
  | "NEEDS_REPAIR"
  | "BROKEN_ORPHAN"
  | "UNCERTAIN";

export type RepairStrategyType =
  | "REBIND_GID_AND_OFFSET"
  | "KEY_LOOKUP_HYPERLINK"
  | "STATIC_SNAPSHOT"
  | "NONE";

export interface ExtractedTargetInfo {
  spreadsheetId?: string;
  gid?: string;
  sheetTabName?: string;
  range?: string;
  docKey?: string;
  docType?: "RFI" | "SUBMITTAL" | "ASI" | "CHANGE_ORDER" | "PCO" | "OTHER";
  docNumber?: string;
  label?: string;
}

export interface CrossLogReference {
  id: string;
  sourceLocation: {
    sheetId: string;
    tabName: string;
    rowIndex: number;
    columnIndex: number;
    cellAddress: string;
  };
  referenceType: CrossLogReferenceType;
  rawFormulaOrValue: string;
  detectedTextLabel: string;
  extractedTarget: ExtractedTargetInfo;
  healthStatus: ReferenceHealthStatus;
  repairStrategy: RepairStrategyType;
  proposedRepairedValue?: string;
  notes?: string;
}

export interface TargetDocumentRegistryEntry {
  docKey: string;
  docType: string;
  docNumber: string;
  targetSpreadsheetId: string;
  targetGid: string;
  targetTabName: string;
  targetRowIndex: number;
  targetColumnIndex: number;
  targetCellAddress: string;
}

export interface TargetLogManifest {
  targetSpreadsheetId: string;
  tabs: Record<
    string,
    {
      gid: string;
      headerRow: number;
      activeDataStartRow: number;
    }
  >;
  documentRegistry: Record<string, TargetDocumentRegistryEntry>;
  sourceToTargetRowOffsets: Record<string, number>;
}

export interface CrossLogAuditReport {
  scannedCellCount: number;
  detectedReferencesCount: number;
  referenceTypeBreakdown: Record<CrossLogReferenceType, number>;
  healthStatusBreakdown: Record<ReferenceHealthStatus, number>;
  references: CrossLogReference[];
  canProceed: boolean;
}

export interface RepairResult {
  referenceId: string;
  originalFormulaOrValue: string;
  repairedFormulaOrValue: string;
  strategyApplied: RepairStrategyType;
  success: boolean;
  notes: string;
}

// RegEx Patterns for Detection
const URL_HYPERLINK_REGEX =
  /^=HYPERLINK\(\s*"https?:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)\/edit#gid=(\d+)(?:&(?:range=)?([A-Z0-9]+))?"\s*,\s*"([^"]+)"\s*\)/i;

const INTERNAL_GID_REGEX =
  /^=HYPERLINK\(\s*"#gid=(\d+)(?:&(?:range=)?([A-Z0-9]+))?"\s*,\s*"([^"]+)"\s*\)/i;

const SHEET_FORMULA_REGEX = /^='?([A-Za-z0-9_ -]+)'?!([A-Z]+[0-9]+)/i;

const DOC_KEY_PATTERNS = [
  { type: "RFI", regex: /\b(RFI)[- #]*(\d+)\b/i },
  { type: "SUBMITTAL", regex: /\b(SUBMITTAL|SUB)[- #]*(\d+(?:[-.]\d+)?)\b/i },
  { type: "ASI", regex: /\b(ASI)[- #]*(\d+)\b/i },
  { type: "CHANGE_ORDER", regex: /\b(CO|PCO)[- #]*(\d+)\b/i },
];

/**
 * Standardizes document keys into canonical format (e.g. "RFI-012", "SUB-042", "ASI-005").
 */
export function normalizeDocKey(docType: string, docNumber: string): string {
  const typeUpper = docType.toUpperCase();
  const numPad = docNumber.padStart(3, "0");
  if (typeUpper === "RFI") return `RFI-${numPad}`;
  if (typeUpper === "SUBMITTAL" || typeUpper === "SUB") return `SUB-${numPad}`;
  if (typeUpper === "ASI") return `ASI-${numPad}`;
  if (typeUpper === "CO" || typeUpper === "CHANGE_ORDER") return `CO-${numPad}`;
  if (typeUpper === "PCO") return `PCO-${numPad}`;
  return `${typeUpper}-${numPad}`;
}

/**
 * Detects cross-log document references in legacy cell data.
 */
export function detectCrossLogReferences(
  cells: SourceCellData[],
  manifest: TargetLogManifest
): CrossLogAuditReport {
  const references: CrossLogReference[] = [];
  const referenceTypeBreakdown: Record<CrossLogReferenceType, number> = {
    HYPERLINK_URL: 0,
    INTERNAL_GID_LINK: 0,
    SHEET_FORMULA: 0,
    TEXT_DOCUMENT_KEY: 0,
  };
  const healthStatusBreakdown: Record<ReferenceHealthStatus, number> = {
    HEALTHY: 0,
    NEEDS_REPAIR: 0,
    BROKEN_ORPHAN: 0,
    UNCERTAIN: 0,
  };

  let idCounter = 1;

  for (const cell of cells) {
    const val = cell.rawFormulaOrValue.trim();
    if (!val) continue;

    let ref: CrossLogReference | null = null;

    // 1. Check URL Hyperlink
    const urlMatch = val.match(URL_HYPERLINK_REGEX);
    if (urlMatch) {
      const [, targetSpreadsheetId, gid, range, label] = urlMatch;
      const docKeyMatch = findDocKeyInText(label) || findDocKeyInText(val);

      const extracted: ExtractedTargetInfo = {
        spreadsheetId: targetSpreadsheetId,
        gid,
        range: range || "A1",
        label,
        docKey: docKeyMatch ? docKeyMatch.docKey : undefined,
        docType: docKeyMatch ? (docKeyMatch.docType as any) : undefined,
        docNumber: docKeyMatch ? docKeyMatch.docNumber : undefined,
      };

      ref = {
        id: `REF-${String(idCounter++).padStart(3, "0")}`,
        sourceLocation: {
          sheetId: cell.sheetId,
          tabName: cell.tabName,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          cellAddress: cell.cellAddress,
        },
        referenceType: "HYPERLINK_URL",
        rawFormulaOrValue: cell.rawFormulaOrValue,
        detectedTextLabel: label,
        extractedTarget: extracted,
        healthStatus: "NEEDS_REPAIR",
        repairStrategy: "REBIND_GID_AND_OFFSET",
      };
    } else {
      // 2. Check Internal GID Link
      const gidMatch = val.match(INTERNAL_GID_REGEX);
      if (gidMatch) {
        const [, gid, range, label] = gidMatch;
        const docKeyMatch = findDocKeyInText(label) || findDocKeyInText(val);

        const extracted: ExtractedTargetInfo = {
          gid,
          range: range || "A1",
          label,
          docKey: docKeyMatch ? docKeyMatch.docKey : undefined,
          docType: docKeyMatch ? (docKeyMatch.docType as any) : undefined,
          docNumber: docKeyMatch ? docKeyMatch.docNumber : undefined,
        };

        ref = {
          id: `REF-${String(idCounter++).padStart(3, "0")}`,
          sourceLocation: {
            sheetId: cell.sheetId,
            tabName: cell.tabName,
            rowIndex: cell.rowIndex,
            columnIndex: cell.columnIndex,
            cellAddress: cell.cellAddress,
          },
          referenceType: "INTERNAL_GID_LINK",
          rawFormulaOrValue: cell.rawFormulaOrValue,
          detectedTextLabel: label,
          extractedTarget: extracted,
          healthStatus: "NEEDS_REPAIR",
          repairStrategy: "REBIND_GID_AND_OFFSET",
        };
      } else {
        // 3. Check Sheet Formula Reference
        const formulaMatch = val.match(SHEET_FORMULA_REGEX);
        if (formulaMatch) {
          const [, sheetTabName, range] = formulaMatch;
          const docKeyMatch = findDocKeyInText(sheetTabName) || findDocKeyInText(val);

          const extracted: ExtractedTargetInfo = {
            sheetTabName,
            range,
            label: `${sheetTabName}!${range}`,
            docKey: docKeyMatch ? docKeyMatch.docKey : undefined,
            docType: docKeyMatch ? (docKeyMatch.docType as any) : undefined,
            docNumber: docKeyMatch ? docKeyMatch.docNumber : undefined,
          };

          ref = {
            id: `REF-${String(idCounter++).padStart(3, "0")}`,
            sourceLocation: {
              sheetId: cell.sheetId,
              tabName: cell.tabName,
              rowIndex: cell.rowIndex,
              columnIndex: cell.columnIndex,
              cellAddress: cell.cellAddress,
            },
            referenceType: "SHEET_FORMULA",
            rawFormulaOrValue: cell.rawFormulaOrValue,
            detectedTextLabel: `${sheetTabName}!${range}`,
            extractedTarget: extracted,
            healthStatus: "NEEDS_REPAIR",
            repairStrategy: "REBIND_GID_AND_OFFSET",
          };
        } else {
          // 4. Check Text Document Key
          const docKeyMatch = findDocKeyInText(val);
          if (docKeyMatch) {
            const extracted: ExtractedTargetInfo = {
              docKey: docKeyMatch.docKey,
              docType: docKeyMatch.docType as any,
              docNumber: docKeyMatch.docNumber,
              label: docKeyMatch.docKey,
            };

            ref = {
              id: `REF-${String(idCounter++).padStart(3, "0")}`,
              sourceLocation: {
                sheetId: cell.sheetId,
                tabName: cell.tabName,
                rowIndex: cell.rowIndex,
                columnIndex: cell.columnIndex,
                cellAddress: cell.cellAddress,
              },
              referenceType: "TEXT_DOCUMENT_KEY",
              rawFormulaOrValue: cell.rawFormulaOrValue,
              detectedTextLabel: docKeyMatch.docKey,
              extractedTarget: extracted,
              healthStatus: "NEEDS_REPAIR",
              repairStrategy: "KEY_LOOKUP_HYPERLINK",
            };
          }
        }
      }
    }

    if (ref) {
      // Evaluate health status and repair proposed value against manifest
      evaluateReferenceHealth(ref, manifest);
      references.push(ref);

      referenceTypeBreakdown[ref.referenceType]++;
      healthStatusBreakdown[ref.healthStatus]++;
    }
  }

  const hasUnresolvableOrphans = references.some(
    (r) => r.healthStatus === "BROKEN_ORPHAN"
  );

  return {
    scannedCellCount: cells.length,
    detectedReferencesCount: references.length,
    referenceTypeBreakdown,
    healthStatusBreakdown,
    references,
    canProceed: !hasUnresolvableOrphans,
  };
}

/**
 * Helper to find document keys in string content.
 */
function findDocKeyInText(text: string): {
  docKey: string;
  docType: string;
  docNumber: string;
} | null {
  for (const pattern of DOC_KEY_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const [, rawType, num] = match;
      const normKey = normalizeDocKey(rawType, num);
      return {
        docKey: normKey,
        docType: pattern.type,
        docNumber: num,
      };
    }
  }
  return null;
}

/**
 * Evaluates target location, checks document registry, and determines health & proposed repair.
 */
function evaluateReferenceHealth(
  ref: CrossLogReference,
  manifest: TargetLogManifest
): void {
  const { extractedTarget } = ref;
  const docKey = extractedTarget.docKey;

  // Case A: Key is present in the target document registry
  if (docKey && manifest.documentRegistry[docKey]) {
    const reg = manifest.documentRegistry[docKey];
    const isTargetSpreadsheetMatch =
      extractedTarget.spreadsheetId === manifest.targetSpreadsheetId;
    const isTargetGidMatch = extractedTarget.gid === reg.targetGid;
    const isTargetCellMatch = extractedTarget.range === reg.targetCellAddress;

    if (isTargetSpreadsheetMatch && isTargetGidMatch && isTargetCellMatch) {
      ref.healthStatus = "HEALTHY";
      ref.repairStrategy = "NONE";
      ref.notes = `Link already points to target cell ${reg.targetCellAddress} in tab ${reg.targetTabName}`;
      return;
    }

    ref.healthStatus = "NEEDS_REPAIR";
    ref.repairStrategy =
      ref.referenceType === "TEXT_DOCUMENT_KEY"
        ? "KEY_LOOKUP_HYPERLINK"
        : "REBIND_GID_AND_OFFSET";
    ref.proposedRepairedValue = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${manifest.targetSpreadsheetId}/edit#gid=${reg.targetGid}&range=${reg.targetCellAddress}", "${extractedTarget.label || docKey}")`;
    ref.notes = `Target ${docKey} found in registry at tab '${reg.targetTabName}', cell ${reg.targetCellAddress}`;
    return;
  }

  // Case B: Sheet/tab formula reference (e.g. 'Legacy RFIs'!B15)
  if (ref.referenceType === "SHEET_FORMULA" && extractedTarget.sheetTabName) {
    const tabName = extractedTarget.sheetTabName;
    const tabMeta = manifest.tabs[tabName];
    if (tabMeta) {
      const offset = manifest.sourceToTargetRowOffsets[tabName] || 0;
      // Parse row index from cell range (e.g. "B15" -> row 15)
      const rangeMatch = extractedTarget.range?.match(/([A-Z]+)(\d+)/);
      if (rangeMatch) {
        const colLetter = rangeMatch[1];
        const sourceRow = parseInt(rangeMatch[2], 10);
        const targetRow = sourceRow + offset;
        const targetCell = `${colLetter}${targetRow}`;

        ref.healthStatus = "NEEDS_REPAIR";
        ref.repairStrategy = "REBIND_GID_AND_OFFSET";
        ref.proposedRepairedValue = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${manifest.targetSpreadsheetId}/edit#gid=${tabMeta.gid}&range=${targetCell}", "${ref.detectedTextLabel}")`;
        ref.notes = `Offset row by +${offset} (${sourceRow} -> ${targetRow}) in target tab '${tabName}'`;
        return;
      }
    }
  }

  // Case C: Explicit GID or URL link where doc key wasn't indexed, but GID matches a tab
  if (extractedTarget.gid) {
    // Find matching tab by GID in manifest
    const matchedTabEntry = Object.entries(manifest.tabs).find(
      ([, meta]) => meta.gid === extractedTarget.gid
    );
    if (matchedTabEntry) {
      const [tabName, meta] = matchedTabEntry;
      const offset = manifest.sourceToTargetRowOffsets[tabName] || 0;
      const rangeMatch = extractedTarget.range?.match(/([A-Z]+)(\d+)/);
      if (rangeMatch) {
        const colLetter = rangeMatch[1];
        const sourceRow = parseInt(rangeMatch[2], 10);
        const targetRow = sourceRow + offset;
        const targetCell = `${colLetter}${targetRow}`;

        ref.healthStatus = "NEEDS_REPAIR";
        ref.repairStrategy = "REBIND_GID_AND_OFFSET";
        ref.proposedRepairedValue = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${manifest.targetSpreadsheetId}/edit#gid=${meta.gid}&range=${targetCell}", "${extractedTarget.label || ref.detectedTextLabel}")`;
        ref.notes = `Re-bound to target spreadsheet ID and updated range to ${targetCell} (+${offset} offset)`;
        return;
      }
    }
  }

  // Case D: Cannot resolve target key or GID
  if (docKey) {
    ref.healthStatus = "BROKEN_ORPHAN";
    ref.repairStrategy = "STATIC_SNAPSHOT";
    ref.notes = `Document key '${docKey}' was not found in target log manifest document registry`;
  } else {
    ref.healthStatus = "UNCERTAIN";
    ref.repairStrategy = "STATIC_SNAPSHOT";
    ref.notes = `Unrecognized cross-log format or missing target tab GID`;
  }
}

/**
 * Executes post-migration reference repair.
 */
export function repairCrossLogReferences(
  report: CrossLogAuditReport,
  manifest: TargetLogManifest
): RepairResult[] {
  const results: RepairResult[] = [];

  for (const ref of report.references) {
    if (ref.healthStatus === "HEALTHY" || ref.repairStrategy === "NONE") {
      results.push({
        referenceId: ref.id,
        originalFormulaOrValue: ref.rawFormulaOrValue,
        repairedFormulaOrValue: ref.rawFormulaOrValue,
        strategyApplied: "NONE",
        success: true,
        notes: "No repair needed; link is healthy.",
      });
      continue;
    }

    if (ref.proposedRepairedValue) {
      results.push({
        referenceId: ref.id,
        originalFormulaOrValue: ref.rawFormulaOrValue,
        repairedFormulaOrValue: ref.proposedRepairedValue,
        strategyApplied: ref.repairStrategy,
        success: true,
        notes: ref.notes || "Repaired link successfully.",
      });
    } else if (ref.repairStrategy === "STATIC_SNAPSHOT") {
      results.push({
        referenceId: ref.id,
        originalFormulaOrValue: ref.rawFormulaOrValue,
        repairedFormulaOrValue: ref.rawFormulaOrValue,
        strategyApplied: "STATIC_SNAPSHOT",
        success: false,
        notes: ref.notes || "Coerced to static snapshot due to orphan/unresolved target.",
      });
    } else {
      results.push({
        referenceId: ref.id,
        originalFormulaOrValue: ref.rawFormulaOrValue,
        repairedFormulaOrValue: ref.rawFormulaOrValue,
        strategyApplied: "NONE",
        success: false,
        notes: "Repair failed: No proposed repair formula available.",
      });
    }
  }

  return results;
}
