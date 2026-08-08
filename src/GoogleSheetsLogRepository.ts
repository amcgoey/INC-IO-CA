/**
 * @file GoogleSheetsLogRepository.ts
 * @description Concrete implementation of `LogRepository` persisting submittal records, log settings, and tag lists using the Google Sheets API.
 *
 * Provides caching for settings, header schema verification/formatting, interactive tag/vendor additions,
 * and delegates document appending to `LogEngine` via `GoogleSheetsStorageAdapter`.
 */

class GoogleSheetsLogRepository implements LogRepository {
  /**
   * Invalidates the cached user settings payload for a specific spreadsheet and discipline.
   *
   * @param spreadsheetId - Target Google Sheets spreadsheet ID.
   * @param discipline - Architectural or FF&E discipline string.
   */
  private invalidateSettingsCache(spreadsheetId: string, discipline: string = "FF&E"): void {
    try {
      const cache = CacheService.getUserCache();
      if (cache) cache.remove(`log_settings_${spreadsheetId}_${discipline}`);
    } catch (e: any) {
      console.warn("Failed to invalidate cache: " + e.message);
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

    let result: LogSettings = { contacts: [], actions: [], ffeTags: { tags: [], vendors: [], tagMap: {} }, projectAbbr: "", logSheetId: null };

    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);
      const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
      if (logSheet) result.logSheetId = logSheet.getSheetId();
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

      if (discipline === "FF&E") {
        const tagSheet = ss.getSheetByName(CONFIG.TAG_LIST_SHEET_NAME);
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
    const sheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
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

    return headers;
  }

  /**
   * Adds a new FF&E Spec Tag and Title to the Tag List spreadsheet tab, inserting it in alphabetical order.
   * Invalidates the settings cache upon completion.
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @param newTag - New spec tag code (e.g. "CH-01").
   * @param newTitle - New spec title string.
   */
  addNewTagToTagList(spreadsheetId: string, newTag: string, newTitle: string): void {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const tagSheet = ss.getSheetByName(CONFIG.TAG_LIST_SHEET_NAME);
    if (!tagSheet) throw new Error("Tag List sheet not found.");
    
    const tagData = tagSheet.getDataRange().getValues();
    if (tagData.length <= 2) {
      tagSheet.appendRow([newTag, newTitle]);
    } else {
      const tHeaders = this.getTagSheetHeaders(tagData);
      const specTagIdx = tHeaders.indexOf("Spec Tag");
      const specTitleIdx = tHeaders.indexOf("Spec Title");
      
      if (specTagIdx === -1 || specTitleIdx === -1) {
        throw new Error("Spec Tag or Spec Title columns not found in Tag List.");
      }
      
      let insertRow = -1;
      for (let i = 3; i < tagData.length; i++) {
        const currentTag = String(tagData[i][specTagIdx] || "").trim();
        if (newTag.localeCompare(currentTag, undefined, { numeric: true, sensitivity: 'base' }) < 0) {
          insertRow = i + 1; // 1-based index
          break;
        }
      }
      
      if (insertRow === -1) insertRow = tagData.length + 1;
      
      tagSheet.insertRowBefore(insertRow);
      tagSheet.getRange(insertRow, specTagIdx + 1).setValue(newTag);
      tagSheet.getRange(insertRow, specTitleIdx + 1).setValue(newTitle);
    }

    this.invalidateSettingsCache(spreadsheetId, "FF&E");
  }

  /**
   * Adds a new FF&E Vendor name to the Tag List spreadsheet tab.
   * Invalidates the settings cache upon completion.
   *
   * @param spreadsheetId - Target spreadsheet ID.
   * @param newVendor - New vendor name string.
   */
  addNewVendorToTagList(spreadsheetId: string, newVendor: string): void {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const tagSheet = ss.getSheetByName(CONFIG.TAG_LIST_SHEET_NAME);
    if (!tagSheet) throw new Error("Tag List sheet not found.");
    
    const tagData = tagSheet.getDataRange().getValues();
    const tHeaders = this.getTagSheetHeaders(tagData);
    let vendorIdx = tHeaders.indexOf("Vendor Names");
    if (vendorIdx === -1) vendorIdx = tHeaders.indexOf("Vendor");
    
    if (vendorIdx === -1) throw new Error("Vendor Names column not found in Tag List.");
    
    let insertRow = -1;
    for (let i = 3; i < tagData.length; i++) {
      if (String(tagData[i][vendorIdx] || "").trim() === "") {
        insertRow = i + 1;
        break;
      }
    }
    
    if (insertRow === -1) insertRow = tagData.length + 1;
    tagSheet.getRange(insertRow, vendorIdx + 1).setValue(newVendor);

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
    plan: RowInsertionPlan
  ): { rowIndex: number; failedColumns: string[] } {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
    if (!sheet) throw new Error("Log sheet not found in spreadsheet.");

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
    const adapter = new GoogleSheetsStorageAdapter(spreadsheetId);
    const LogEngineClass = (globalThis as any).LogEngine || require("./core/log/LogEngine").LogEngine;
    const engine = new LogEngineClass(adapter);
    return engine.appendDocument(spreadsheetId, document, strategy, options);
  }
  readLog(
    spreadsheetId: string,
    identityData: IdentityData,
    strategy?: DocumentLogStrategy,
    options: ReadLogOptions = {}
  ): ReadLogResult {
    const adapter = new GoogleSheetsStorageAdapter(spreadsheetId);
    const LogEngineClass = (globalThis as any).LogEngine || require("./core/log/LogEngine").LogEngine;
    const engine = new LogEngineClass(adapter);
    return engine.readLog(spreadsheetId, identityData, strategy, options);
  }
}

/** Global default repository seam for Google Sheets storage operations. */
var defaultLogRepository: LogRepository = new GoogleSheetsLogRepository();
