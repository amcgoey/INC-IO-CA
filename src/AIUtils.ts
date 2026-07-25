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

/**
 * Helper to fetch pdf-lib from cache or CDN to improve performance.
 */
function getCachedLibrary_(url: string): string {
  const cache = CacheService.getScriptCache();
  let script = cache ? cache.get("pdf_lib_script") : null;
  
  if (!script) {
    script = UrlFetchApp.fetch(url).getContentText();
    try {
      // Cache for 10 minutes (600 seconds)
      if (cache) cache.put("pdf_lib_script", script, 600);
    } catch (e: any) {
      console.warn("Failed to cache library: " + sanitizeErrorString(e.message));
    }
  }
  return script;
}

function getGeminiApiKey(): string | null {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

function getCachedPrediction(messageId: string): AIPrediction | null {
  if (!messageId) return null;
  const cache = CacheService.getUserCache();
  const cached = cache ? cache.get(`ai_pred_${messageId}`) : null;
  return cached ? JSON.parse(cached) : null;
}

function setCachedPrediction(messageId: string, predictionObj: AIPrediction): void {
  if (!messageId) return;
  const cache = CacheService.getUserCache();
  if (cache) {
    cache.put(`ai_pred_${messageId}`, JSON.stringify(predictionObj), 21600); // Cache for 6 hours
  }
}

/**
 * Task 1: Aggressively caches the Drive names to reduce latency.
 * Falls back to standard API call if cache exceeds limits or fails.
 */
function getCachedDrives(): SharedDriveInfo[] {
  const cache = CacheService.getUserCache();
  const cached = cache ? cache.get("cached_shared_drives") : null;
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e: any) {
      console.warn("Failed to parse cached drives: " + sanitizeErrorString(e.message));
    }
  }

  let drives: SharedDriveInfo[] = [];
  try {
    let pageToken: string | undefined;
    do {
      let resp = (globalThis as any).Drive.Drives.list({ maxResults: 100, pageToken: pageToken, fields: "items(id,name),nextPageToken" });
      if (resp.items) {
        drives = drives.concat(resp.items.map((d: any) => ({ id: d.id, name: d.name })));
      }
      pageToken = resp.nextPageToken;
    } while (pageToken);
  } catch(err: any) {
    console.error("Error fetching drive names: " + sanitizeErrorString(err));
  }

  if (drives.length > 0) {
    try {
      if (cache) cache.put("cached_shared_drives", JSON.stringify(drives), 21600); // Cache for 6 hours
    } catch (e: any) {
      console.warn("Failed to cache drives: " + sanitizeErrorString(e.message));
    }
  }
  
  return drives;
}

function getAvailableDriveNames(): string[] {
  const drives = getCachedDrives();
  return drives.map(d => d.name);
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

function predictProjectAndDiscipline(emailData: EmailData, driveNames: string[]): AIPrediction {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { error: "Missing GEMINI_API_KEY in Script Properties" };
  }

  const prompt = `You are an expert construction administration architect. Match this email to the correct Project Name and Discipline.

Available Projects: ${JSON.stringify(driveNames)}

Email Routing & Content:
Subject: ${emailData.subject}
Sender: ${emailData.sender}
Reply-To: ${emailData.replyTo}
To: ${emailData.to}
Cc: ${emailData.cc}
Gmail Labels: ${emailData.labels.join(', ')}
Attachment Names: ${emailData.attachmentNames.join(', ')}
Email Body Snippet: ${emailData.body.substring(0, 1000)}

Your task is to logically deduce the project. Return JSON.
'predictedProjectName': Exact name from list or empty string.
'predictedDiscipline': Strictly 'FF&E' or 'Architecture'.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { response_mime_type: "application/json" }
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  };

  // Route to the lightweight Triage model
  const fetchResult = fetchGeminiWithRetry(`${CONFIG.GEMINI_API_URL_TRIAGE}?key=${apiKey}`, options);
  
  if (!fetchResult.success) {
    if (fetchResult.statusCode === 503 || fetchResult.statusCode === 429) {
       return { error: "AI auto-triage skipped due to high server demand." };
    }
    return { error: sanitizeErrorString(`HTTP ${fetchResult.statusCode}: Auto-triage failed.`) };
  }

  try {
    const json = JSON.parse(fetchResult.response!.getContentText());
    if (json.candidates && json.candidates[0].content.parts[0].text) {
      let text = json.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim(); 
      const parsedResponse = JSON.parse(text);
      
      let pName = parsedResponse.predictedProjectName || "";
      if (pName && !driveNames.includes(pName)) pName = "";
      
      return {
        predictedProjectName: pName,
        predictedDiscipline: parsedResponse.predictedDiscipline || ""
      };
    }
    return { error: "Unexpected API schema returned." };
  } catch (e) {
    return { error: "Failed to parse AI prediction." };
  }
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

async function splitPdfToBase64(sourceBlob: GoogleAppsScript.Base.Blob): Promise<string> {
  const setTimeout = (fn: Function) => { fn(); return 0; };
  eval(getCachedLibrary_(CONFIG.PDF_LIB_URL));
  const { PDFDocument } = PDFLib;

  const bytes = sourceBlob.getBytes();
  const unsigned = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) unsigned[i] = bytes[i] & 0xFF;

  const sourcePdf = await PDFDocument.load(unsigned);
  const newPdf = await PDFDocument.create();
  
  const limit = Math.min(sourcePdf.getPageCount(), 3);
  const pageIndices = Array.from({length: limit}, (_, i) => i);
  const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
  copiedPages.forEach((p: any) => newPdf.addPage(p));
  
  const newBytes = await newPdf.save();
  
  // V8 TypedArray Optimization: Casting buffer to Int8Array for performance
  const regularBytes = Array.from(new Int8Array(newBytes.buffer));
  return Utilities.base64Encode(regularBytes);
}

async function analyzeSubmittalDeep(sourceBlob: GoogleAppsScript.Base.Blob, emailText: string, contextObj: { contacts: Array<{ abbr: string; name: string }>; actions: Array<{ action: string }> }): Promise<any> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { error: "Missing API Key" };
  
  let base64Pdf: string;
  try {
    const fileBytes = sourceBlob.getBytes();
    const fileSize = fileBytes.length;
    
    if (fileSize <= 2097152) { // 2 MB
      // Bypass pdf-lib entirely for small files to save GAS execution time
      base64Pdf = Utilities.base64Encode(fileBytes);
    } else {
      // For large packages, boot up pdf-lib and slice the first 3 pages
      base64Pdf = await splitPdfToBase64(sourceBlob);
    }
  } catch (e: any) {
    return { error: sanitizeErrorString(`Failed to process PDF: ${e.message}`) };
  }

  const validContacts = contextObj.contacts.map(c => ({ abbr: c.abbr, name: c.name }));
  const validActions = contextObj.actions.map(a => a.action);

  let prompt = `You are an expert construction administration architect. Analyze this submittal document (first 3 pages) and email data.
  
Valid Contacts: ${JSON.stringify(validContacts)}
Valid Actions: ${JSON.stringify(validActions)}
Email Context: ${emailText}

Extract metadata strictly. Map sender to 'predictedContactAbbr' and intent to 'predictedAction'.`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "application/pdf", data: base64Pdf } }
      ]
    }],
    // Strict JSON responseSchema Enforcement
    generationConfig: { 
      response_mime_type: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          predictedSection: { type: "STRING" },
          predictedNumber: { type: "STRING" },
          predictedRevision: { type: "STRING" },
          predictedTitle: { type: "STRING" },
          predictedSpecTag: { type: "STRING" },
          predictedVendor: { type: "STRING" },
          predictedContactAbbr: { type: "STRING" },
          predictedAction: { type: "STRING" }
        }
      }
    }
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  };

  // Route to the deeper Analysis model
  const fetchResult = fetchGeminiWithRetry(`${CONFIG.GEMINI_API_URL_ANALYSIS}?key=${apiKey}`, options);
  
  if (!fetchResult.success) {
    return { error: sanitizeErrorString(`HTTP ${fetchResult.statusCode}: ${fetchResult.errorText?.substring(0,100)}`) };
  }

  try {
    const json = JSON.parse(fetchResult.response!.getContentText());
    if (json.candidates && json.candidates[0].content.parts[0].text) {
      let text = json.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(text);
    }
    return { error: "No candidates returned from Gemini API." };
  } catch (err: any) {
    return { error: sanitizeErrorString(`API Exception: ${err.message}`) };
  }
}
