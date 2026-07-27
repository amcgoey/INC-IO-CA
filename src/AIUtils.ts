/**
 * @file AIUtils.ts
 * @description Utility functions for AI API key retrieval, error sanitization/redaction, HTTP backoff retries, and external URL file fetching.
 */

/**
 * Sanitizes error strings to prevent accidental leakage of Script Properties (e.g. GEMINI_API_KEY).
 * Scans PropertiesService values longer than 5 characters and masks them in the returned error string.
 *
 * @param errorStr - Raw error string or exception object.
 * @returns Redacted error string.
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

/**
 * Retrieves the Gemini API Key from Google Apps Script `PropertiesService.getScriptProperties()`.
 *
 * @returns Gemini API key string or `null` if unconfigured.
 */
function getGeminiApiKey(): string | null {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

/**
 * Executes an HTTP fetch request to Gemini API with exponential backoff retries on HTTP 429 / 503 status codes.
 *
 * @param url - Gemini API endpoint URL.
 * @param options - `UrlFetchApp` request options.
 * @param maxRetries - Maximum retry attempts (default: 2).
 * @returns `GeminiFetchResult` object.
 */
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

/**
 * Downloads a file from an external URL and saves it into a Google Drive folder.
 * Handles HTML authentication wall detection and URL domain whitelist errors.
 *
 * @param url - External file download URL.
 * @param folderId - Target Google Drive folder ID.
 * @returns Result object containing `success` status, file ID, file name, or error code.
 */
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
  (globalThis as any).sanitizeErrorString = (globalThis as any).sanitizeErrorString || sanitizeErrorString;
  (globalThis as any).getGeminiApiKey = (globalThis as any).getGeminiApiKey || getGeminiApiKey;
  (globalThis as any).fetchGeminiWithRetry = (globalThis as any).fetchGeminiWithRetry || fetchGeminiWithRetry;
  (globalThis as any).fetchAndSaveFile = (globalThis as any).fetchAndSaveFile || fetchAndSaveFile;
  module.exports = {
    sanitizeErrorString,
    getGeminiApiKey,
    fetchGeminiWithRetry,
    fetchAndSaveFile
  };
}
