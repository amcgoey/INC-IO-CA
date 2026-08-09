/**
 * @file SheetsTabRoleClassifier.ts
 * @description Pure core logic module for 5-tier active tab role classification and bounded data row count calculation in Google Sheets context.
 */

export type TabRole = "LOG_TAB" | "SYSTEM_CONFIG" | "AUDIT_LOG" | "DOCUMENTATION" | "USER_CREATED";

export interface TabClassificationResult {
  role: TabRole;
  docTypeKey: string;
  dataRowCount: number | string;
}

export class SheetsTabRoleClassifier {
  /**
   * Classify tab role based on sheet name, log workbook status, and optional registered docType mappings.
   */
  public static classifyTabRole(
    sheetName: string,
    isLogWorkbook: boolean,
    registeredDocTypes?: Record<string, string>
  ): TabClassificationResult {
    if (!isLogWorkbook) {
      return { role: "USER_CREATED", docTypeKey: "N/A", dataRowCount: "N/A" };
    }

    if (sheetName === "_Config") {
      return { role: "SYSTEM_CONFIG", docTypeKey: "N/A", dataRowCount: "N/A" };
    }

    if (sheetName === "_AuditLog") {
      return { role: "AUDIT_LOG", docTypeKey: "N/A", dataRowCount: "N/A" };
    }

    // Explicit registered docType mapping takes precedence for log tabs
    if (registeredDocTypes && registeredDocTypes[sheetName]) {
      return {
        role: "LOG_TAB",
        docTypeKey: registeredDocTypes[sheetName],
        dataRowCount: "N/A",
      };
    }

    // Standard log tab prefix conventions
    if (
      sheetName.startsWith("Submittal") ||
      sheetName.startsWith("RFI") ||
      sheetName.startsWith("Transmittal") ||
      sheetName.startsWith("ASI") ||
      sheetName.startsWith("Bulletin")
    ) {
      const docType = sheetName.toUpperCase().replace(/\s+/g, "_");
      return { role: "LOG_TAB", docTypeKey: docType, dataRowCount: "N/A" };
    }

    const lowerSheet = sheetName.toLowerCase().trim();
    if (
      lowerSheet === "documentation" ||
      lowerSheet === "user guide" ||
      lowerSheet === "readme" ||
      lowerSheet === "instructions" ||
      lowerSheet.includes("guide") ||
      lowerSheet.includes("readme")
    ) {
      return { role: "DOCUMENTATION", docTypeKey: "N/A", dataRowCount: "N/A" };
    }

    return { role: "USER_CREATED", docTypeKey: "N/A", dataRowCount: "N/A" };
  }

  /**
   * Calculates the number of active data rows bounded strictly by top and bottom BufferRows / Data range.
   */
  public static calculateBoundedDataRowCount(
    gridData: any[][],
    dataRangeBounds?: { startRow: number; endRow: number }
  ): number {
    if (!gridData || gridData.length === 0) return 0;

    let startIdx = 0;
    let endIdx = gridData.length - 1;

    if (dataRangeBounds) {
      startIdx = Math.max(0, dataRangeBounds.startRow - 1);
      endIdx = Math.min(gridData.length - 1, dataRangeBounds.endRow - 1);
    } else {
      let topBufIdx = -1;
      let botBufIdx = -1;
      for (let i = 0; i < gridData.length; i++) {
        const firstCell = String(gridData[i]?.[0] || "").trim();
        if (firstCell === "BUFFER_TOP") topBufIdx = i;
        else if (firstCell === "BUFFER_BOTTOM") botBufIdx = i;
      }

      if (topBufIdx !== -1 && botBufIdx !== -1 && botBufIdx > topBufIdx) {
        startIdx = topBufIdx + 1;
        endIdx = botBufIdx - 1;
      }
    }

    let count = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const row = gridData[i];
      if (!row || row.length === 0) continue;

      const firstCell = String(row[0] || "").trim();
      if (firstCell === "BUFFER_TOP" || firstCell === "BUFFER_BOTTOM") {
        continue;
      }

      const hasContent = row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
      if (hasContent) {
        count++;
      }
    }

    return count;
  }
}
