import { AiAnalysisService, EmailData, AiPredictionResult, DeepAnalysisContext, DeepAnalysisResult, DeepAnalysisPrediction, AIPrediction, DocumentBlob } from './core/interfaces/AiAnalysisService';
/**
 * @file AiAnalysisService.ts
 * @description Service interface and implementations for Gemini AI email triage and submittal document deep analysis.
 *
 * Handles API key extraction, error string sanitization/redaction, exponential backoff retries,
 * base64 encoding, PDF page slicing via `PdfDocumentService`, and response caching.
 */

/**
 * Redacts sensitive API keys and Script Properties from raw error strings to prevent leaking secrets in UI toasts or logs.
 *
 * @param errorStr - The raw error message or exception object.
 * @returns Redacted error string.
 */
/** Result container for internal Gemini HTTP fetch operations. */
interface GeminiFetchResult {
  success: boolean;
  response?: GoogleAppsScript.URL_Fetch.HTTPResponse;
  statusCode?: number | string;
  errorText?: string;
}

const sanitizeErrorStringHelper = (errorStr: any): string => {
  if (typeof (globalThis as any).sanitizeErrorString === "function") {
    return (globalThis as any).sanitizeErrorString(errorStr);
  }
  if (!errorStr) return "Unknown Error";
  let sanitized = String(errorStr);
  try {
    if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
      const props = PropertiesService.getScriptProperties().getProperties();
      for (const key in props) {
        const val = props[key];
        if (val && val.trim().length > 5) {
          const escapedVal = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedVal, 'g');
          sanitized = sanitized.replace(regex, `[REDACTED_${key}]`);
        }
      }
    }
  } catch (e) {}
  sanitized = sanitized.replace(/key=AIza[a-zA-Z0-9-_]+/g, 'key=[REDACTED_API_KEY]');
  return sanitized;
};

/**
 * Retrieves the Gemini API key from global getter or Google Apps Script PropertiesService.
 *
 * @returns API key string or `null` if unconfigured.
 */
const getGeminiApiKeyHelper = (): string | null => {
  if (typeof (globalThis as any).getGeminiApiKey === "function") {
    const key = (globalThis as any).getGeminiApiKey();
    if (key) return key;
  }
  try {
    if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
      return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    }
  } catch (e) {}
  return null;
};

/**
 * Executes an HTTP fetch to the Gemini API with automatic retries and exponential backoff for 429 and 503 status codes.
 *
 * @param url - Gemini API endpoint URL including API key query param.
 * @param options - `UrlFetchApp` request options.
 * @param maxRetries - Maximum retry attempts (default: 2).
 * @returns `GeminiFetchResult` object containing HTTP response or error details.
 */
const fetchGeminiWithRetryHelper = (
  url: string,
  options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions,
  maxRetries = 2
): GeminiFetchResult => {
  if (typeof (globalThis as any).fetchGeminiWithRetry === "function") {
    return (globalThis as any).fetchGeminiWithRetry(url, options, maxRetries);
  }
  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      if (statusCode === 200) return { success: true, response: response };
      if (statusCode === 503 || statusCode === 429) {
        attempts++;
        if (attempts > maxRetries) return { success: false, statusCode: statusCode, errorText: sanitizeErrorStringHelper(response.getContentText()) };
        if (typeof Utilities !== "undefined" && (Utilities as any).sleep) Utilities.sleep(Math.pow(2, attempts) * 1000);
      } else {
        return { success: false, statusCode: statusCode, errorText: sanitizeErrorStringHelper(response.getContentText()) };
      }
    } catch (e: any) {
      attempts++;
      if (attempts > maxRetries) return { success: false, statusCode: "EXCEPTION", errorText: sanitizeErrorStringHelper(e.toString()) };
      if (typeof Utilities !== "undefined" && (Utilities as any).sleep) Utilities.sleep(Math.pow(2, attempts) * 1000);
    }
  }
  return { success: false, statusCode: "MAX_RETRIES_EXCEEDED", errorText: "Max retries exceeded" };
};

/**
 * Production implementation of `AiAnalysisService` using the Gemini API.
 */
class GeminiAiAnalysisAdapter implements AiAnalysisService {
  private driveNameProvider?: DriveNameProvider;
  private cacheAdapter?: CacheAdapter;
  private pdfDocumentService?: PdfDocumentService;
  private extractPagesAction?: ExtractPagesAction;

  /**
   * Constructs a `GeminiAiAnalysisAdapter` instance.
   *
   * @param options - Dependency injections for `driveNameProvider`, `cacheAdapter`, and `pdfDocumentService`.
   */
  constructor(options?: {
    driveNameProvider?: DriveNameProvider;
    cacheAdapter?: CacheAdapter;
    pdfDocumentService?: PdfDocumentService;
    extractPagesAction?: ExtractPagesAction;
  }) {
    if (options && options.driveNameProvider) {
      this.driveNameProvider = options.driveNameProvider;
    }
    if (options && options.cacheAdapter) {
      this.cacheAdapter = options.cacheAdapter;
    }
    if (options && options.pdfDocumentService) {
      this.pdfDocumentService = options.pdfDocumentService;
    }
    if (options && options.extractPagesAction) {
      this.extractPagesAction = options.extractPagesAction;
    }
  }

  private getDriveNameProvider(): DriveNameProvider | null {
    if (this.driveNameProvider) return this.driveNameProvider;
    if (typeof defaultDriveNameProvider !== "undefined") return defaultDriveNameProvider;
    if (typeof require !== "undefined") {
      try {
        return require("./GoogleDriveNameProvider").defaultDriveNameProvider;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  private getCacheAdapter(): CacheAdapter | null {
    if (this.cacheAdapter) return this.cacheAdapter;
    if (typeof defaultCacheAdapter !== "undefined") return defaultCacheAdapter;
    try {
      return (globalThis as any).defaultCacheAdapter || null;
    } catch (e) {
      return null;
    }
  }

  private getExtractPagesAction(): ExtractPagesAction | null {
    if (this.extractPagesAction) return this.extractPagesAction;
    const pdfService = this.getPdfDocumentService();
    if (pdfService) {
      const ExtractActionClass = typeof ExtractPagesAction !== "undefined"
        ? ExtractPagesAction
        : (typeof require !== "undefined" ? require("./core/workflow/ExtractPagesAction").ExtractPagesAction : (globalThis as any).ExtractPagesAction);
      if (ExtractActionClass) {
        return new ExtractActionClass({ pdfDocumentService: pdfService });
      }
    }
    if (typeof defaultExtractPagesAction !== "undefined") return defaultExtractPagesAction;
    if (typeof require !== "undefined") {
      try {
        return require("./core/workflow/ExtractPagesAction").defaultExtractPagesAction;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  private getPdfDocumentService(): PdfDocumentService | null {
    if (this.pdfDocumentService) return this.pdfDocumentService;
    if (typeof defaultPdfDocumentService !== "undefined") return defaultPdfDocumentService;
    if (typeof require !== "undefined") {
      try {
        return require("./PdfDocumentService").defaultPdfDocumentService;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Analyzes email header/body context using Gemini to predict the project name and discipline (Architecture vs FF&E).
   * Caches predictions in CacheAdapter for 6 hours (21,600 seconds).
   *
   * @param emailData - Extracted email details.
   * @param messageId - Optional Gmail message ID for cache lookup.
   * @returns A Promise resolving to `AiPredictionResult`.
   */
  async triageEmail(emailData: EmailData, messageId?: string): Promise<AiPredictionResult> {
    const cacheAdapter = this.getCacheAdapter();
    if (messageId && cacheAdapter) {
      const cached = cacheAdapter.get("ai_pred_" + messageId);
      if (cached) {
        try {
          const parsed: AIPrediction = JSON.parse(cached);
          return { success: true, prediction: parsed };
        } catch (e) {
          // Ignore cache parse errors and proceed to fetch
        }
      }
    }

    const driveNameProvider = this.getDriveNameProvider();
    const driveNames = driveNameProvider ? driveNameProvider.getAvailableDriveNames() : [];

    const apiKey = getGeminiApiKeyHelper();
    if (!apiKey) {
      return {
        success: false,
        error: {
          code: "MISSING_KEY",
          userMessage: "Missing GEMINI_API_KEY in Script Properties"
        }
      };
    }

    const prompt = `You are an expert construction administration architect. Match this email to the correct Project Name and Discipline.

Available Projects: ${JSON.stringify(driveNames)}

Email Routing & Content:
Subject: ${emailData.subject}
Sender: ${emailData.sender}
Reply-To: ${emailData.replyTo}
To: ${emailData.to}
Cc: ${emailData.cc}
Gmail Labels: ${emailData.labels ? emailData.labels.join(', ') : ''}
Attachment Names: ${emailData.attachmentNames ? emailData.attachmentNames.join(', ') : ''}
Email Body Snippet: ${emailData.body ? emailData.body.substring(0, 1000) : ''}

Your task is to logically deduce the project. Return JSON.
'predictedProjectName': Exact name from list or empty string.
'predictedDiscipline': Strictly 'FF&E' or 'Architecture'.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" }
    };

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const apiUrl = (typeof CONFIG !== "undefined" && CONFIG.GEMINI_API_URL_TRIAGE)
      ? CONFIG.GEMINI_API_URL_TRIAGE
      : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

    const fetchResult = fetchGeminiWithRetryHelper(`${apiUrl}?key=${apiKey}`, options);

    if (!fetchResult.success) {
      if (fetchResult.statusCode === 503 || fetchResult.statusCode === 429) {
        return {
          success: false,
          error: {
            code: "RATE_LIMITED",
            userMessage: "AI auto-triage skipped due to high server demand."
          }
        };
      }
      return {
        success: false,
        error: {
          code: "API_FAILURE",
          userMessage: sanitizeErrorStringHelper(`HTTP ${fetchResult.statusCode}: Auto-triage failed.`)
        }
      };
    }

    try {
      const responseText = fetchResult.response ? fetchResult.response.getContentText() : "";
      const json = JSON.parse(responseText);
      if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text) {
        let text = json.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedResponse = JSON.parse(text);

        let projectName = parsedResponse.predictedProjectName || "";
        if (projectName && !driveNames.includes(projectName)) {
          projectName = "";
        }

        const triagePrediction: AIPrediction = {
          predictedProjectName: projectName,
          predictedDiscipline: parsedResponse.predictedDiscipline || ""
        };

        if (messageId && cacheAdapter) {
          cacheAdapter.put("ai_pred_" + messageId, JSON.stringify(triagePrediction), 21600);
        }

        return { success: true, prediction: triagePrediction };
      }

      return {
        success: false,
        error: {
          code: "PARSE_FAILURE",
          userMessage: sanitizeErrorStringHelper("Unexpected API schema returned.")
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: {
          code: "PARSE_FAILURE",
          userMessage: sanitizeErrorStringHelper("Failed to parse AI prediction.")
        }
      };
    }
  }

  /**
   * Analyzes a submittal PDF document and email body using Gemini multimodal capabilities.
   * Direct base64 encodes PDFs <= 2MB, or slices the first 3 pages via `PdfDocumentService` for larger files.
   *
   * @param sourceBlob - Source PDF blob.
   * @param emailText - Extracted email body text.
   * @param contextObj - Available contacts and actions context dictionary.
   * @returns A Promise resolving to `DeepAnalysisResult`.
   */
  async analyzeSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    emailText: string,
    contextObj: DeepAnalysisContext
  ): Promise<DeepAnalysisResult> {
    const apiKey = getGeminiApiKeyHelper();
    if (!apiKey) {
      return {
        success: false,
        error: {
          code: "MISSING_KEY",
          userMessage: "Missing GEMINI_API_KEY in Script Properties"
        }
      };
    }

    let base64Pdf: string;
    try {
      const fileBytes = sourceBlob.getBytes();
      const fileSize = fileBytes.length;

      if (fileSize <= 2097152) { // 2 MB
        base64Pdf = Utilities.base64Encode(fileBytes);
      } else {
        const extractAction = this.getExtractPagesAction();
        if (extractAction) {
          const extractRes = await extractAction.execute({ sourceBlob, maxPages: 3 });
          base64Pdf = extractRes.base64;
        } else {
          const pdfService = this.getPdfDocumentService();
          if (!pdfService) {
            throw new Error("PdfDocumentService is not available");
          }
          base64Pdf = await pdfService.slicePagesToBase64(sourceBlob, 3);
        }
      }
    } catch (e: any) {
      return {
        success: false,
        error: {
          code: "PDF_PROCESSING_ERROR",
          userMessage: sanitizeErrorStringHelper(`Failed to process PDF: ${e && e.message ? e.message : String(e)}`)
        }
      };
    }

    const validContacts = contextObj && contextObj.contacts ? contextObj.contacts.map(c => ({ abbr: c.abbr, name: c.name })) : [];
    const validActions = contextObj && contextObj.actions ? contextObj.actions.map(a => a.action) : [];

    const prompt = `You are an expert construction administration architect. Analyze this submittal document (first 3 pages) and email data.
  
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
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const apiUrl = (typeof CONFIG !== "undefined" && CONFIG.GEMINI_API_URL_ANALYSIS)
      ? CONFIG.GEMINI_API_URL_ANALYSIS
      : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

    const fetchResult = fetchGeminiWithRetryHelper(`${apiUrl}?key=${apiKey}`, options);

    if (!fetchResult.success) {
      if (fetchResult.statusCode === 429 || fetchResult.statusCode === 503) {
        return {
          success: false,
          error: {
            code: "RATE_LIMITED",
            userMessage: sanitizeErrorStringHelper(`HTTP ${fetchResult.statusCode}: ${fetchResult.errorText || 'High server demand or rate limited.'}`)
          }
        };
      }
      return {
        success: false,
        error: {
          code: "API_FAILURE",
          userMessage: sanitizeErrorStringHelper(`HTTP ${fetchResult.statusCode}: ${fetchResult.errorText || 'Gemini API call failed.'}`)
        }
      };
    }

    try {
      const responseText = fetchResult.response ? fetchResult.response.getContentText() : "";
      const json = JSON.parse(responseText);
      const textCandidate = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textCandidate) {
        let text = textCandidate.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed: DeepAnalysisPrediction = JSON.parse(text);
        return {
          success: true,
          analysis: parsed
        };
      }
      return {
        success: false,
        error: {
          code: "PARSE_FAILURE",
          userMessage: sanitizeErrorStringHelper("No valid text candidate returned from Gemini API.")
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: "PARSE_FAILURE",
          userMessage: sanitizeErrorStringHelper(`API Exception or Parse Failure: ${err && err.message ? err.message : String(err)}`)
        }
      };
    }
  }
}

/**
 * Diagnostic health check function to ping configured Gemini API model endpoints.
 * Verifies that the models are active, accessible, and not discontinued.
 *
 * @returns Object with status details for triage and analysis endpoints.
 */
function checkAiModelHealth(): {
  triage: { url: string; ok: boolean; statusCode: number | string; message: string };
  analysis: { url: string; ok: boolean; statusCode: number | string; message: string };
} {
  const apiKey = getGeminiApiKeyHelper();
  const triageUrl = (typeof CONFIG !== "undefined" && CONFIG.GEMINI_API_URL_TRIAGE)
    ? CONFIG.GEMINI_API_URL_TRIAGE
    : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
  const analysisUrl = (typeof CONFIG !== "undefined" && CONFIG.GEMINI_API_URL_ANALYSIS)
    ? CONFIG.GEMINI_API_URL_ANALYSIS
    : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

  const testEndpoint = (url: string) => {
    if (!apiKey) {
      return { url, ok: false, statusCode: "MISSING_KEY", message: "Missing GEMINI_API_KEY in Script Properties" };
    }
    const payload = {
      contents: [{ parts: [{ text: "ping" }] }]
    };
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    const res = fetchGeminiWithRetryHelper(`${url}?key=${apiKey}`, options, 0);
    if (res.success && (res.statusCode === 200 || (res.response && res.response.getResponseCode() === 200))) {
      return { url, ok: true, statusCode: 200, message: "Model active and responding." };
    }
    const code = res.statusCode || "ERROR";
    const rawText = res.response ? res.response.getContentText() : res.errorText || "";
    return { url, ok: false, statusCode: code, message: rawText || "Failed to reach model endpoint." };
  };

  return {
    triage: testEndpoint(triageUrl),
    analysis: testEndpoint(analysisUrl)
  };
}


/** Global default instance seam for AI analysis service. */
var defaultAiAnalysisService: AiAnalysisService = new GeminiAiAnalysisAdapter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GeminiAiAnalysisAdapter,
    defaultAiAnalysisService,
    checkAiModelHealth
  };
}
