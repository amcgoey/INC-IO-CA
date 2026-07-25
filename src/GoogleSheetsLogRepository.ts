// src/GoogleSheetsLogRepository.ts

class GoogleSheetsLogRepository implements LogRepository {
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
          const headers = data[headerRowIdx];
          const projAbbrIdx = headers.findIndex((h: any) => String(h).trim() === "Project Abbreviation" || String(h).trim() === "Project Abbrevation");
          
          if (projAbbrIdx !== -1 && data.length > headerRowIdx + 1) { 
            result.projectAbbr = String(data[headerRowIdx + 1][projAbbrIdx] || "").trim(); 
          }
          
          const aIdx = headers.indexOf("Actions"), bIdx = headers.indexOf("Action Abbr."), sIdx = headers.indexOf("Status"), cIdx = headers.indexOf("Contact"), dIdx = headers.indexOf("Contact Abbr.");
          
          for (let i = headerRowIdx + 1; i < data.length; i++) {
            const row = data[i]; 
            if (aIdx !== -1 && row[aIdx]) result.actions.push({ action: row[aIdx], abbr: row[bIdx] || "", status: row[sIdx] || "" });
            if (dIdx !== -1 && cIdx !== -1 && row[dIdx] && row[cIdx]) result.contacts.push({ abbr: row[dIdx], name: row[cIdx] });
          }
        }
      }

      if (discipline === "FF&E") {
        const tagSheet = ss.getSheetByName(CONFIG.TAG_LIST_SHEET_NAME);
        if (tagSheet) {
          const tagData = tagSheet.getDataRange().getValues();
          if (tagData.length > 2) {
            const tHeaders = tagData[2], specTagIdx = tHeaders.indexOf("Spec Tag"), specTitleIdx = tHeaders.indexOf("Spec Title");
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

  verifyAndFormatLogSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet): string[] {
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

  addNewTagToTagList(spreadsheetId: string, newTag: string, newTitle: string): void {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const tagSheet = ss.getSheetByName(CONFIG.TAG_LIST_SHEET_NAME);
    if (!tagSheet) throw new Error("Tag List sheet not found.");
    
    const tagData = tagSheet.getDataRange().getValues();
    if (tagData.length <= 2) {
      tagSheet.appendRow([newTag, newTitle]);
      return;
    }
    
    const tHeaders = tagData[2];
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

  addNewVendorToTagList(spreadsheetId: string, newVendor: string): void {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const tagSheet = ss.getSheetByName(CONFIG.TAG_LIST_SHEET_NAME);
    if (!tagSheet) throw new Error("Tag List sheet not found.");
    
    const tagData = tagSheet.getDataRange().getValues();
    const tHeaders = tagData.length > 2 ? tagData[2] : [];
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
  }
}

// Global default repository instance
const defaultLogRepository: LogRepository = new GoogleSheetsLogRepository();
