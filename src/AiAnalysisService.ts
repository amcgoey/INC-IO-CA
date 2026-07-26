// src/AiAnalysisService.ts

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

class GeminiAiAnalysisAdapter implements AiAnalysisService {
  private pdfDocumentService: PdfDocumentService;

  constructor(options?: { pdfDocumentService?: PdfDocumentService }) {
    if (options && options.pdfDocumentService) {
      this.pdfDocumentService = options.pdfDocumentService;
    } else if (typeof defaultPdfDocumentService !== "undefined") {
      this.pdfDocumentService = defaultPdfDocumentService;
    } else {
      try {
        this.pdfDocumentService = require("./PdfDocumentService").defaultPdfDocumentService;
      } catch (e) {
        this.pdfDocumentService = null as any;
      }
    }
  }

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
        base64Pdf = await this.pdfDocumentService.slicePagesToBase64(sourceBlob, 3);
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
      : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash:generateContent";

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
          prediction: parsed,
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

class FakeAiAnalysisAdapter implements AiAnalysisService {
  public analyzeCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; emailText: string; contextObj: DeepAnalysisContext }> = [];
  private analysisResult: DeepAnalysisResult = {
    success: true,
    prediction: {},
    analysis: {}
  };

  setAnalysisResult(result: DeepAnalysisResult): void {
    this.analysisResult = result;
  }

  async analyzeSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    emailText: string,
    contextObj: DeepAnalysisContext
  ): Promise<DeepAnalysisResult> {
    this.analyzeCalls.push({ sourceBlob, emailText, contextObj });
    return this.analysisResult;
  }
}

var defaultAiAnalysisService: AiAnalysisService = new GeminiAiAnalysisAdapter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GeminiAiAnalysisAdapter,
    FakeAiAnalysisAdapter,
    defaultAiAnalysisService
  };
}
