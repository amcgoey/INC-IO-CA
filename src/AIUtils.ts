/**
 * Sanitizes strings to prevent accidental leakage of Script Properties (e.g., API keys).
 * Automatically fetches all script properties and masks them in the output string.
 */
function sanitizeErrorString(errorStr: any): string {
  if (!errorStr) return "Unknown Error";
  let sanitized = String(errorStr);
  
  try {
    const props = PropertiesService.getScriptProperties().getProperties();
    for (const key in props) {
      const val = props[key];
      // Only mask values longer than 5 chars to avoid wiping out common short words
      if (val && val.trim().length > 5) {
        // Escape regex characters in the property value
        const escapedVal = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedVal, 'g');
        sanitized = sanitized.replace(regex, `[REDACTED_${key}]`);
      }
    }
  } catch (e) {
    // Fail silently if PropertiesService is inaccessible
  }

  // Hard fallback for Google API Keys specifically, in case PropertiesService fails
  sanitized = sanitized.replace(/key=AIza[a-zA-Z0-9-_]+/g, 'key=[REDACTED_API_KEY]');
  
  return sanitized;
}

function getGeminiApiKey(): string | null {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

function fetchGeminiWithRetry(url: string, options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions, maxRetries = 2): GeminiFetchResult {
  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      
      if (statusCode === 200) return { success: true, response: response };
      
      if (statusCode === 503 || statusCode === 429) {
        attempts++;
        if (attempts > maxRetries) return { success: false, statusCode: statusCode, errorText: sanitizeErrorString(response.getContentText()) };
        Utilities.sleep(Math.pow(2, attempts) * 1000);
      } else {
        return { success: false, statusCode: statusCode, errorText: sanitizeErrorString(response.getContentText()) };
      }
    } catch (e: any) {
      attempts++;
      if (attempts > maxRetries) return { success: false, statusCode: "EXCEPTION", errorText: sanitizeErrorString(e.toString()) };
      Utilities.sleep(Math.pow(2, attempts) * 1000);
    }
  }
  return { success: false, statusCode: "MAX_RETRIES_EXCEEDED", errorText: "Max retries exceeded" };
}

function fetchAndSaveFile(url: string, folderId: string): { success: boolean; error?: string; fileId?: string; fileName?: string } {
  try {
    const response = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
    const code = response.getResponseCode();
    if (code !== 200) return { success: false, error: `HTTP ${code}` };
    
    const blob = response.getBlob();
    const contentType = blob.getContentType();
    if (contentType && contentType.includes('text/html')) return { success: false, error: "AUTH_WALL" };
    
    blob.setName("Fetched_Submittal.pdf");
    const file = DriveApp.getFolderById(folderId).createFile(blob); 
    return { success: true, fileId: file.getId(), fileName: file.getName() };
  } catch (err: any) {
    if (err.message && err.message.includes("not been whitelisted")) return { success: false, error: "NOT_WHITELISTED" };
    return { success: false, error: sanitizeErrorString(err.message || err) };
  }
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    sanitizeErrorString,
    getGeminiApiKey,
    fetchGeminiWithRetry,
    fetchAndSaveFile
  };
}
