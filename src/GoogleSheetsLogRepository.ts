/**
 * @file GoogleSheetsLogRepository.ts
 * @description Concrete implementation of `LogRepository` persisting submittal records, log settings, and tag lists using the Google Sheets API.
 *
 * Provides caching for settings, header schema verification/formatting, interactive tag/vendor additions,
 * and delegates document appending to `LogEngine` via `GoogleSheetsStorageAdapter`.
 */


import { GoogleSheetsStorageAdapter } from "./SheetStorageAdapter";
import { LogEngine } from "./core/log/LogEngine";
import { SheetValidationAndProtectionAdapter } from "./adapters/gas/SheetValidationAndProtectionAdapter";
import { defaultDocumentTypeConfigRegistry } from "./DocumentTypeConfigRegistry";
import { DocumentLogWorkbookViewSpec } from "./core/config/DocumentLogWorkbookViewSpec";
import { PrefixCacheManager } from "./core/admin/PrefixCacheManager";
import { GoogleScriptCacheAdapter } from "./adapters/gas/GoogleScriptCacheAdapter";

function getGoogleSheetsStorageAdapterClass(): any {
  return GoogleSheetsStorageAdapter;
}

function getLogEngineClass(): any {
  return LogEngine;
}

function getSheetValidationAndProtectionAdapterClass(): any {
  return SheetValidationAndProtectionAdapter;
}

function getGoogleScriptCacheAdapterClass(): any {
  return GoogleScriptCacheAdapter;
}

function getPrefixCacheManagerClass(): any {
  return PrefixCacheManager;
}

class GoogleSheetsLogRepository implements LogRepository {
  private cacheAdapter?: CacheAdapter;
  private prefixManager?: PrefixCacheManager;

  constructor(cacheAdapter?: CacheAdapter, prefixManager?: PrefixCacheManager) {
    this.cacheAdapter = cacheAdapter;
    this.prefixManager = prefixManager;
  }

  /**
   * Invalidates the cached user settings payload and scoped PrefixCacheManager config keys
   * for a specific spreadsheet and discipline (Ticket #311).
   *
   * @param spreadsheetId - Target Google Sheets spreadsheet ID.
   * @param discipline - Architectural or FF&E discipline string.
   */
  private invalidateSettingsCache(spreadsheetId: string, discipline: string = "FF&E"): void {
    try {
      const cache = CacheService.getUserCache();
      if (cache) {
        cache.remove(`log_settings_${spreadsheetId}_${discipline}`);
        cache.remove(`log_settings_${spreadsheetId}_FF&E`);
        cache.remove(`log_settings_${spreadsheetId}_Architectural`);
        cache.remove(`log_settings_${spreadsheetId}`);
      }
    } catch (e: any) {
      console.warn("Failed to invalidate cache: " + e.message);
    }

    try {
      const CacheAdapterClass = getGoogleScriptCacheAdapterClass();
      const PrefixManagerClass = getPrefixCacheManagerClass();
      const cacheAdapter = this.cacheAdapter || (globalThis as any).defaultCacheAdapter || new CacheAdapterClass();
      const prefixManager = this.prefixManager || new PrefixManagerClass(cacheAdapter);
      prefixManager.invalidatePrefix("DOC_CONFIG_" + spreadsheetId);
      prefixManager.invalidatePrefix("log_settings_" + spreadsheetId);
      prefixManager.invalidatePrefix("log_settings_");
      if (spreadsheetId) {
        prefixManager.invalidatePrefix("log_search_" + spreadsheetId);
      }
    } catch (e: any) {
      console.warn("Failed to invalidate prefix cache: " + e.message);
    }
  }

  /**
   * Extracts clean header string arrays from raw Tag List sheet matrix data.
   *
   * @param tagData - 2D matrix of sheet values from the Tag List sheet.
   * @returns Array of column header names.
   */
  private getTagSheetHeaders(tagData: any[][]): string[] {
    return tagData.length > 2 ? tagData[2].map((h: any) => String(h).trim()) : [];
  }

  /**
   * Fallback cell-by-cell writer used when a row-level `setValues` call fails due to spreadsheet validation errors.
   *
   * @param sheet - Target Google Sheets Sheet object.
   * @param rowIndex - 1-based target row index.
   * @param headers - Column headers array.
   * @param rowData - Array of values to write into cells.
   * @returns Array of column header names that failed to write.
   */
  private setValuesCellByCell(sheet: GoogleAppsScript.Spreadsheet.Sheet, rowIndex: number, headers: string[], rowData: any[]): string[] {
    const failedColumns: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      const colName = headers[i];
      const cellValue = rowData[i];
      try {
        sheet.getRange(rowIndex, i + 1).setValue(cellValue);
      } catch (err: any) {
        console.warn(`Failed to write cell at row ${rowIndex}, col ${i + 1} (${colName}): ${err.message}`);
        failedColumns.push(colName);
      }
    }
    return failedColumns;
  }

  /**
   * Fetches settings, contacts, actions, project abbreviation, and FF&E tags/vendors from the spreadsheet.
   * Uses CacheService to cache results for up to 1 hour (3600 seconds).
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @param discipline - Architectural or FF&E discipline string.
   * @returns `LogSettings` dictionary containing contacts, actions, project abbreviation, and tags.
   */
  getLogSettings(spreadsheetId: string, discipline: string): LogSettings {
    const cache = CacheService.getUserCache();
    const cacheKey = `log_settings_${spreadsheetId}_${discipline}`;
    const cached = cache ? cache.get(cacheKey) : null;

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e: any) {
        console.warn("Failed to parse cached log settings: " + e.message);
      }
    }

    const result: LogSettings = { contacts: [], actions: [], ffeTags: { tags: [], vendors: [], tagMap: {} }, projectAbbr: "", logSheetId: null, sheetGids: {} };

    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);
      try {
        const sheets = ss.getSheets();
        sheets.forEach(s => {
          result.sheetGids![s.getName()] = s.getSheetId();
        });
      } catch (e) {}

      const configSheet = ss.getSheetByName("_Config");
      if (configSheet) {
        try {
          const configValues = configSheet.getDataRange().getValues();
          const docTypeRows: unknown[][] = [];
          const fieldSpecsMap: Record<string, unknown[][]> = {};
          
          let currentSection: "NONE" | "DOCTYPES" | "FIELDS" = "NONE";
          let currentFieldKey = "";

          for (let r = 0; r < configValues.length; r++) {
            const row = configValues[r];
            const firstCell = String(row[0] || "").trim();
            const secondCell = String(row[1] || "").trim();

            if (firstCell.toLowerCase() === "doctypekey" || secondCell.toLowerCase() === "displayname") {
              currentSection = "DOCTYPES";
              docTypeRows.push(row);
              continue;
            }

            if (firstCell.toLowerCase() === "key" && secondCell.toLowerCase() === "header") {
              currentSection = "FIELDS";
              if (docTypeRows.length > 1) {
                const dtIdx = Object.keys(fieldSpecsMap).length;
                if (docTypeRows[dtIdx + 1] && docTypeRows[dtIdx + 1][0]) {
                  currentFieldKey = String(docTypeRows[dtIdx + 1][0]).trim();
                }
              }
              const targetKey = currentFieldKey || "Submittal_Arch";
              if (!fieldSpecsMap[targetKey]) {
                fieldSpecsMap[targetKey] = [row];
              }
              continue;
            }

            if (currentSection === "DOCTYPES") {
              if (firstCell === "" && secondCell === "") {
                currentSection = "NONE";
              } else {
                docTypeRows.push(row);
              }
            } else if (currentSection === "FIELDS") {
              if (firstCell === "" && secondCell === "") {
                currentSection = "NONE";
              } else {
                const targetKey = currentFieldKey || "Submittal_Arch";
                if (!fieldSpecsMap[targetKey]) {
                  fieldSpecsMap[targetKey] = [["Key", "Header", "Label", "Type", "IsCalculated", "FormulaOrFunction", "OptionsRange", "Required", "Description", "DefaultValue", "KeyNormalizationRule", "NumberFormat"]];
                }
                fieldSpecsMap[targetKey].push(row);
              }
            }
          }

          const reg = (globalThis as any).defaultDocumentTypeConfigRegistry || defaultDocumentTypeConfigRegistry;
          if (reg && typeof reg.loadFromSpreadsheetConfig === "function" && docTypeRows.length > 1) {
            reg.loadFromSpreadsheetConfig(docTypeRows, fieldSpecsMap);
          }
        } catch (err) {}
      }

      // Dual-Topology Tab Resolution: Modern MVT tabs first, then legacy unmigrated tabs
      let logSheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;
      if (discipline === "FF&E") {
        logSheet = ss.getSheetByName("Submittal FFE") || ss.getSheetByName(CONFIG.LOG_SHEET_NAME) || ss.getSheetByName("Submittals Log") || ss.getSheetByName("Submittal Arch");
      } else {
        logSheet = ss.getSheetByName("Submittal Arch") || ss.getSheetByName(CONFIG.LOG_SHEET_NAME) || ss.getSheetByName("Submittals Log") || ss.getSheetByName("Submittal FFE");
      }
      if (!logSheet && ss.getSheets) {
        logSheet = ss.getSheets()[0] || null;
      }
      if (logSheet) result.logSheetId = logSheet.getSheetId();

      // Settings / Contacts / Actions: Check modern _Shared tab first, fall back to legacy Settings tab
      const sharedSheet = ss.getSheetByName("_Shared");
      if (sharedSheet) {
        const sharedData = sharedSheet.getDataRange().getValues();
        let headerRowIdx = -1;
        for (let r = 0; r < sharedData.length; r++) {
          if (sharedData[r].indexOf("Actions") !== -1 || sharedData[r].indexOf("Contacts_Arch Key") !== -1) {
            headerRowIdx = r;
            break;
          }
        }
        if (headerRowIdx !== -1) {
          const headers = sharedData[headerRowIdx].map((h: any) => String(h).trim());
          const aIdx = headers.indexOf("Actions");
          const bIdx = headers.indexOf("Action Abbr.");
          const sIdx = headers.indexOf("Statuses Label") !== -1 ? headers.indexOf("Statuses Label") : headers.indexOf("Status");

          let dIdx = -1;
          let cIdx = -1;
          if (discipline === "FF&E") {
            dIdx = headers.indexOf("Contacts_FFE Key");
            cIdx = headers.indexOf("Contacts_FFE Label");
            if (dIdx === -1) dIdx = headers.indexOf("Contact Abbr.");
            if (cIdx === -1) cIdx = headers.indexOf("Contact");
          } else {
            dIdx = headers.indexOf("Contacts_Arch Key");
            cIdx = headers.indexOf("Contacts_Arch Label");
            if (dIdx === -1) dIdx = headers.indexOf("Contact Abbr.");
            if (cIdx === -1) cIdx = headers.indexOf("Contact");
          }

          for (let i = headerRowIdx + 1; i < sharedData.length; i++) {
            const row = sharedData[i];
            if (aIdx !== -1 && row[aIdx]) {
              result.actions.push({
                action: String(row[aIdx]).trim(),
                abbr: String(row[bIdx] || "").trim(),
                status: String(sIdx !== -1 && row[sIdx] ? row[sIdx] : "").trim()
              });
            }
            if (dIdx !== -1 && cIdx !== -1 && row[dIdx] && row[cIdx]) {
              result.contacts.push({
                abbr: String(row[dIdx]).trim(),
                name: String(row[cIdx]).trim()
              });
            }
          }
        }
      } else {
        const settingsSheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET_NAME);
        if (settingsSheet) {
          const data = settingsSheet.getDataRange().getValues();
          let headerRowIdx = -1;
          for (let r = 0; r < data.length; r++) {
            if (data[r].indexOf("Actions") !== -1) { headerRowIdx = r; break; }
          }
          if (headerRowIdx !== -1) {
            const headers = data[headerRowIdx].map((h: any) => String(h).trim());
            const projAbbrIdx = headers.findIndex((h: string) => h === "Project Abbreviation" || h === "Project Abbrevation");
            if (projAbbrIdx !== -1 && data.length > headerRowIdx + 1) { 
              result.projectAbbr = String(data[headerRowIdx + 1][projAbbrIdx] || "").trim(); 
            }
            const aIdx = headers.indexOf("Actions"), bIdx = headers.indexOf("Action Abbr."), sIdx = headers.indexOf("Status"), cIdx = headers.indexOf("Contact"), dIdx = headers.indexOf("Contact Abbr.");
            for (let i = headerRowIdx + 1; i < data.length; i++) {
              const row = data[i]; 
              if (aIdx !== -1 && row[aIdx]) result.actions.push({ action: String(row[aIdx]).trim(), abbr: String(row[bIdx] || "").trim(), status: String(row[sIdx] || "").trim() });
              if (dIdx !== -1 && cIdx !== -1 && row[dIdx] && row[cIdx]) result.contacts.push({ abbr: String(row[dIdx]).trim(), name: String(row[cIdx]).trim() });
            }
          }
        }
      }

      // FF&E Tags & Vendors: Check modern Submittal FFE Support tab first, fall back to legacy Tag List tab
      if (discipline === "FF&E") {
        const ffeSupportSheet = ss.getSheetByName("Submittal FFE Support");
        if (ffeSupportSheet) {
          const ffeData = ffeSupportSheet.getDataRange().getValues();
          if (ffeData.length > 1) {
            const headers = ffeData[0].map((h: any) => String(h).trim());
            let vendorIdx = headers.indexOf("Vendor Label") !== -1 ? headers.indexOf("Vendor Label") : headers.indexOf("Vendor Key");
            if (vendorIdx === -1) vendorIdx = headers.indexOf("Vendor");
            let specTagIdx = headers.indexOf("SpecTag Key");
            if (specTagIdx === -1) specTagIdx = headers.indexOf("Spec Tag");
            let specTitleIdx = headers.indexOf("SpecTag Label");
            if (specTitleIdx === -1) specTitleIdx = headers.indexOf("Spec Title");

            const vendorSet = new Set<string>();
            const tagSet = new Set<string>();
            for (let i = 1; i < ffeData.length; i++) {
              const tagVal = specTagIdx > -1 ? ffeData[i][specTagIdx] : "";
              const titleVal = specTitleIdx > -1 ? ffeData[i][specTitleIdx] : "";
              const vendorVal = vendorIdx > -1 ? ffeData[i][vendorIdx] : "";
              if (tagVal && String(tagVal).trim() !== "") {
                const cleanTag = String(tagVal).trim();
                tagSet.add(cleanTag);
                result.ffeTags.tagMap[cleanTag] = titleVal ? String(titleVal).trim() : "";
              }
              if (vendorVal && String(vendorVal).trim() !== "") vendorSet.add(String(vendorVal).trim());
            }
            result.ffeTags.tags = Array.from(tagSet);
            result.ffeTags.vendors = Array.from(vendorSet);
          }
        } else {
          const tagSheet = ss.getSheetByName("Submittal FFE Support") || ss.getSheetByName(CONFIG.TAG_LIST_SHEET_NAME);
          if (tagSheet) {
            const tagData = tagSheet.getDataRange().getValues();
            if (tagData.length > 2) {
              const tHeaders = this.getTagSheetHeaders(tagData);
              const specTagIdx = tHeaders.indexOf("Spec Tag"), specTitleIdx = tHeaders.indexOf("Spec Title");
              let vendorIdx = tHeaders.indexOf("Vendor Names");
              if (vendorIdx === -1) vendorIdx = tHeaders.indexOf("Vendor");
              const vendorSet = new Set<string>(), tagSet = new Set<string>();
              for (let i = 3; i < tagData.length; i++) {
                const tagVal = specTagIdx > -1 ? tagData[i][specTagIdx] : "", titleVal = specTitleIdx > -1 ? tagData[i][specTitleIdx] : "", vendorVal = vendorIdx > -1 ? tagData[i][vendorIdx] : "";
                if (tagVal && String(tagVal).trim() !== "") { 
                  const cleanTag = String(tagVal).trim(); 
                  tagSet.add(cleanTag); 
                  result.ffeTags.tagMap[cleanTag] = titleVal ? String(titleVal).trim() : ""; 
                }
                if (vendorVal && String(vendorVal).trim() !== "") vendorSet.add(String(vendorVal).trim());
              }
              result.ffeTags.tags = Array.from(tagSet); 
              result.ffeTags.vendors = Array.from(vendorSet);
            }
          }
        }
      }
    } catch (err: any) {}

    // Cache the generated payload for 1 hour (3600 seconds)
    try {
      if (cache) cache.put(cacheKey, JSON.stringify(result), 3600);
    } catch (e: any) {
      console.warn("Failed to cache log settings: " + e.message);
    }

    return result;
  }

  /**
   * Inspects the target log sheet headers, renames duplicate headers (e.g. calculated columns),
   * and dynamically inserts missing required system columns like `Link` or `Contact History`.
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @returns Cleaned array of header column strings.
   */
  verifyAndFormatLogSheet(spreadsheetId: string): string[] {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("Submittal Arch") || ss.getSheetByName(CONFIG.LOG_SHEET_NAME) || ss.getSheetByName("Submittals Log");
    if (!sheet) throw new Error("Log sheet not found in spreadsheet");

    const lastCol = sheet.getLastColumn() || 1;
    const headerRange = sheet.getRange(CONFIG.LOG_HEADER_ROW, 1, 1, lastCol);
    let headers = headerRange.getValues()[0].map((h: any) => String(h).trim());

    let seenNumber = false, seenTitle = false;

    for (let i = 0; i < headers.length; i++) {
      const colName = headers[i].toLowerCase();

      if (colName === "number") {
        if (seenNumber) {
          sheet.getRange(CONFIG.LOG_HEADER_ROW, i + 1).setValue("Calc Number");
          headers[i] = "Calc Number";
        } else {
          seenNumber = true;
        }
      } else if (colName === "title") {
        if (seenTitle) {
          sheet.getRange(CONFIG.LOG_HEADER_ROW, i + 1).setValue("Calc Title");
          headers[i] = "Calc Title";
        } else {
          seenTitle = true;
        }
      } else if (colName === "file name") {
        sheet.getRange(CONFIG.LOG_HEADER_ROW, i + 1).setValue("Calc File Name");
        headers[i] = "Calc File Name";
      } else if (colName === "contact chain") {
        sheet.getRange(CONFIG.LOG_HEADER_ROW, i + 1).setValue("Calc Contact Chain");
        headers[i] = "Calc Contact Chain";
      } else if (colName === "sort") {
        sheet.getRange(CONFIG.LOG_HEADER_ROW, i + 1).setValue("Calc Sort");
        headers[i] = "Calc Sort";
      }
    }

    if (headers.indexOf("Link") === -1) {
      const notesIdx = headers.indexOf("Notes");
      if (notesIdx !== -1) {
        sheet.insertColumnAfter(notesIdx + 1);
        sheet.getRange(CONFIG.LOG_HEADER_ROW, notesIdx + 2).setValue("Link");
      } else {
        sheet.insertColumnAfter(lastCol);
        sheet.getRange(CONFIG.LOG_HEADER_ROW, lastCol + 1).setValue("Link");
      }
      headers = sheet.getRange(CONFIG.LOG_HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0].map((h: any) => String(h).trim());
    }

    if (headers.indexOf("Contact History") === -1) {
      const linkIdx = headers.indexOf("Link");
      if (linkIdx !== -1) {
        sheet.insertColumnAfter(linkIdx + 1);
        sheet.getRange(CONFIG.LOG_HEADER_ROW, linkIdx + 2).setValue("Contact History");
      } else {
        sheet.insertColumnAfter(sheet.getLastColumn());
        sheet.getRange(CONFIG.LOG_HEADER_ROW, sheet.getLastColumn() + 1).setValue("Contact History");
      }
      headers = sheet.getRange(CONFIG.LOG_HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0].map((h: any) => String(h).trim());
    }

    try {
      const AdapterClass = getSheetValidationAndProtectionAdapterClass();
      const adapter = (globalThis as any).defaultSheetValidationAndProtectionAdapter;
      if (adapter && typeof adapter.applyNumberFormats === "function") {
        adapter.applyNumberFormats(ss);
        if (typeof adapter.applyRangeProtections === "function") adapter.applyRangeProtections(ss);
      }
    } catch (err) { console.warn("Failed to apply range protections during repository setup:", err); }

    return headers;
  }

  /**
   * Adds a new FF&E Spec Tag and Title to the active support table (`Submittal FFE Support` / `_Shared`, or legacy `Tag List`),
   * inserting it in alphabetical order or populating an empty slot.
   * Executes scoped cache eviction via `PrefixCacheManager` upon completion (Ticket #311).
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @param newTag - New spec tag code (e.g. "CH-01").
   * @param newTitle - New spec title string.
   */
  addNewTagToTagList(spreadsheetId: string, newTag: string, newTitle: string): void {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const candidateNames = ["Submittal FFE Support", "_Shared", typeof CONFIG !== "undefined" ? CONFIG.TAG_LIST_SHEET_NAME : "Tag List"];

    let targetSheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;
    let targetData: any[][] = [];
    let headerRowIdx = -1;
    let specTagIdx = -1;
    let specTitleIdx = -1;

    for (const name of candidateNames) {
      const sheet = ss.getSheetByName(name);
      if (!sheet) continue;
      const data = sheet.getDataRange().getValues();
      for (let r = 0; r < Math.min(5, data.length); r++) {
        const headers = data[r].map((h: any) => String(h || "").trim());
        let tIdx = headers.indexOf("SpecTag Key");
        if (tIdx === -1) tIdx = headers.indexOf("Spec Tag");
        if (tIdx === -1) tIdx = headers.indexOf("Tag");

        let titleIdx = headers.indexOf("SpecTag Label");
        if (titleIdx === -1) titleIdx = headers.indexOf("Spec Title");
        if (titleIdx === -1) titleIdx = headers.indexOf("Title");
        if (titleIdx === -1) titleIdx = headers.indexOf("Description");

        if (tIdx !== -1) {
          targetSheet = sheet;
          targetData = data;
          headerRowIdx = r;
          specTagIdx = tIdx;
          specTitleIdx = titleIdx !== -1 ? titleIdx : tIdx + 1;
          break;
        }
      }
      if (targetSheet) break;
    }

    if (!targetSheet || specTagIdx === -1) {
      throw new Error("Spec Tag or Spec Title columns not found in Tag List.");
    }

    if (targetData.length <= headerRowIdx + 1) {
      targetSheet.getRange(headerRowIdx + 2, specTagIdx + 1).setValue(newTag);
      targetSheet.getRange(headerRowIdx + 2, specTitleIdx + 1).setValue(newTitle);
    } else {
      let insertRow = -1;
      for (let i = headerRowIdx + 1; i < targetData.length; i++) {
        const currentTag = String(targetData[i][specTagIdx] || "").trim();
        if (currentTag && newTag.localeCompare(currentTag, undefined, { numeric: true, sensitivity: 'base' }) < 0) {
          insertRow = i + 1; // 1-based index
          break;
        }
      }

      if (insertRow !== -1) {
        targetSheet.insertRowBefore(insertRow);
        targetSheet.getRange(insertRow, specTagIdx + 1).setValue(newTag);
        targetSheet.getRange(insertRow, specTitleIdx + 1).setValue(newTitle);
      } else {
        for (let i = headerRowIdx + 1; i < targetData.length; i++) {
          if (String(targetData[i][specTagIdx] || "").trim() === "") {
            insertRow = i + 1;
            break;
          }
        }
        if (insertRow === -1) insertRow = targetData.length + 1;
        targetSheet.getRange(insertRow, specTagIdx + 1).setValue(newTag);
        targetSheet.getRange(insertRow, specTitleIdx + 1).setValue(newTitle);
      }
    }

    this.invalidateSettingsCache(spreadsheetId, "FF&E");
  }

  /**
   * Adds a new FF&E Vendor name to the active support table (`Submittal FFE Support` / `_Shared`, or legacy `Tag List`).
   * Populates both Vendor Key and Vendor Label if distinct columns exist.
   * Executes scoped cache eviction via `PrefixCacheManager` upon completion (Ticket #311).
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @param newVendor - New vendor name string.
   * @param vendorLabel - Optional display label string.
   */
  addNewVendorToTagList(spreadsheetId: string, newVendor: string, vendorLabel?: string): void {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const candidateNames = ["Submittal FFE Support", "_Shared", typeof CONFIG !== "undefined" ? CONFIG.TAG_LIST_SHEET_NAME : "Tag List"];

    let targetSheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;
    let targetData: any[][] = [];
    let headerRowIdx = -1;
    let vendorKeyIdx = -1;
    let vendorLabelIdx = -1;

    for (const name of candidateNames) {
      const sheet = ss.getSheetByName(name);
      if (!sheet) continue;
      const data = sheet.getDataRange().getValues();
      for (let r = 0; r < Math.min(5, data.length); r++) {
        const headers = data[r].map((h: any) => String(h || "").trim());
        let kIdx = headers.indexOf("Vendor Key");
        if (kIdx === -1) kIdx = headers.indexOf("Vendor Names");
        if (kIdx === -1) kIdx = headers.indexOf("Vendor");
        if (kIdx === -1) kIdx = headers.indexOf("Vendors");

        let lIdx = headers.indexOf("Vendor Label");
        if (lIdx === -1 && kIdx !== -1) lIdx = kIdx;
        if (kIdx === -1 && lIdx !== -1) kIdx = lIdx;

        if (kIdx !== -1) {
          targetSheet = sheet;
          targetData = data;
          headerRowIdx = r;
          vendorKeyIdx = kIdx;
          vendorLabelIdx = lIdx;
          break;
        }
      }
      if (targetSheet) break;
    }

    if (!targetSheet || vendorKeyIdx === -1) {
      throw new Error("Vendor Names column not found in Tag List.");
    }

    let insertRow = -1;
    for (let i = headerRowIdx + 1; i < targetData.length; i++) {
      if (String(targetData[i][vendorKeyIdx] || "").trim() === "") {
        insertRow = i + 1;
        break;
      }
    }

    if (insertRow === -1) insertRow = targetData.length + 1;
    targetSheet.getRange(insertRow, vendorKeyIdx + 1).setValue(newVendor);
    if (vendorLabelIdx !== vendorKeyIdx && vendorLabelIdx !== -1) {
      targetSheet.getRange(insertRow, vendorLabelIdx + 1).setValue(vendorLabel || newVendor);
    }

    this.invalidateSettingsCache(spreadsheetId, "FF&E");
  }

  /**
   * Inserts a new row into the physical spreadsheet sheet based on an calculated `RowInsertionPlan`.
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @param headers - Column headers array.
   * @param rowData - Row values array matching headers.
   * @param plan - `RowInsertionPlan` containing target row index and blank gap instructions.
   * @returns Object containing final 1-based `rowIndex` and any `failedColumns`.
   */
  insertLogRow(
    spreadsheetId: string,
    headers: string[],
    rowData: any[],
    plan: RowInsertionPlan,
    sheetName?: string
  ): { rowIndex: number; failedColumns: string[] } {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const targetSheetName = sheetName || (typeof CONFIG !== "undefined" ? CONFIG.LOG_SHEET_NAME : "Submittals Log");
    let sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      sheet = ss.getSheetByName("Submittal Arch") || ss.getSheetByName("Submittal FFE") || ss.getActiveSheet();
    }
    if (!sheet) throw new Error("Log sheet not found in spreadsheet.");

    if (typeof (sheet as any).getMaxRows === "function") {
      const currentMax = (sheet as any).getMaxRows();
      if (currentMax < 6 || currentMax <= plan.targetRowIndex) {
        const rowsNeeded = Math.max(25 - currentMax, (plan.targetRowIndex + 1) - currentMax);
        if (rowsNeeded > 0) {
          if (typeof (sheet as any).insertRowsAfter === "function") {
            (sheet as any).insertRowsAfter(currentMax, rowsNeeded);
          } else if (typeof sheet.insertRowAfter === "function") {
            for (let i = 0; i < rowsNeeded; i++) {
              sheet.insertRowAfter(currentMax + i);
            }
          }
        }
      }
    }

    sheet.insertRowAfter(plan.targetRowIndex);

    if (plan.insertBlankBefore) {
      sheet.insertRowBefore(plan.targetRowIndex + 1);
    }
    if (plan.insertBlankAfter) {
      sheet.insertRowAfter(plan.finalRowIndex);
    }

    let failedColumns: string[] = [];
    try {
      sheet.getRange(plan.finalRowIndex, 1, 1, headers.length).setValues([rowData]);
    } catch (err) {
      failedColumns = this.setValuesCellByCell(sheet, plan.finalRowIndex, headers, rowData);
    }

    return { rowIndex: plan.finalRowIndex, failedColumns };
  }

  /**
   * Appends a validated document to the Google Sheets log by delegating to `LogEngine` via `GoogleSheetsStorageAdapter`.
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @param document - Validated document instance.
   * @param strategy - Strategy controlling formatting and sorting.
   * @param options - Additional execution options.
   * @returns `AppendDocumentResult` containing row index, filename, and contact history chain.
   */
  appendDocument(
    spreadsheetId: string,
    document: ValidatedDocument,
    strategy: DocumentLogStrategy,
    options: AppendDocumentOptions = {}
  ): AppendDocumentResult {
    const StorageAdapterClass = getGoogleSheetsStorageAdapterClass();
    const adapter = new StorageAdapterClass(spreadsheetId);
    const LogEngineClass = getLogEngineClass();
    const engine = new LogEngineClass(adapter);
    return engine.appendDocument(spreadsheetId, document, strategy, options);
  }
  updateDocumentLink(
    spreadsheetId: string,
    options: { sheetName?: string; rowIndex: number; url: string; viewSpec?: DocumentLogWorkbookViewSpec }
  ): void {
    if (!spreadsheetId || !options.url || !options.rowIndex || options.rowIndex <= 0) return;
    const StorageAdapterClass = getGoogleSheetsStorageAdapterClass();
    const adapter = new StorageAdapterClass(spreadsheetId);
    const sheetName = options.sheetName || "Submittal Arch";
    const grid = adapter.getSheetValues(sheetName);
    if (!grid || grid.length === 0) return;
    const headerRowIdx = (options.viewSpec && options.viewSpec.offsets)
      ? options.viewSpec.offsets.HEADER_ROW_INDEX - 1
      : 2;
    let linkColIdx = -1;
    if (grid.length > headerRowIdx) {
      const headers = grid[headerRowIdx].map((h: any) => String(h || "").trim());
      linkColIdx = headers.indexOf("Link");
    }
    if (linkColIdx === -1) {
      for (let r = 0; r < Math.min(5, grid.length); r++) {
        const rowHeaders = grid[r].map((h: any) => String(h || "").trim());
        const idx = rowHeaders.indexOf("Link");
        if (idx !== -1) {
          linkColIdx = idx;
          break;
        }
      }
    }
    if (linkColIdx !== -1) {
      adapter.setRangeValue(sheetName, options.rowIndex, linkColIdx + 1, options.url);
    }
  }

  readLog(
    spreadsheetId: string,
    identityData: IdentityData,
    strategy?: DocumentLogStrategy,
    options: ReadLogOptions = {}
  ): ReadLogResult {
    const StorageAdapterClass = getGoogleSheetsStorageAdapterClass();
    const adapter = new StorageAdapterClass(spreadsheetId);
    const LogEngineClass = getLogEngineClass();
    const engine = new LogEngineClass(adapter);
    return engine.readLog(spreadsheetId, identityData, strategy, options);
  }
}

const defaultLogRepository: LogRepository = new GoogleSheetsLogRepository();

export {
  GoogleSheetsLogRepository,
  defaultLogRepository
};
