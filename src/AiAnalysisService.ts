// src/AiAnalysisService.ts

function getSanitizeErrorString(): (err: any) => string {
  if (typeof sanitizeErrorString !== "undefined") return sanitizeErrorString;
  try { return require("./AIUtils").sanitizeErrorString; } catch (e) { return (s: any) => String(s); }
}

function getApiKeyHelper(): () => string | null {
  if (typeof getGeminiApiKey !== "undefined") return getGeminiApiKey;
  try { return require("./AIUtils").getGeminiApiKey; } catch (e) { return () => null; }
}

function getFetchGeminiHelper(): (...args: any[]) => GeminiFetchResult {
  if (typeof fetchGeminiWithRetry !== "undefined") return fetchGeminiWithRetry;
  try { return require("./AIUtils").fetchGeminiWithRetry; } catch (e) { return () => ({ success: false, statusCode: "ERROR" }); }
}

class GeminiAiAnalysisAdapter implements AiAnalysisService {
  private driveNameProvider: DriveNameProvider;
  private cacheAdapter: CacheAdapter;
  private pdfDocumentService: PdfDocumentService;

  constructor(options?: {
    driveNameProvider?: DriveNameProvider;
    cacheAdapter?: CacheAdapter;
    pdfDocumentService?: PdfDocumentService;
  }) {
    if (options && options.driveNameProvider) {
      this.driveNameProvider = options.driveNameProvider;
    } else if (typeof defaultDriveNameProvider !== "undefined") {
      this.driveNameProvider = defaultDriveNameProvider;
    } else {
      try {
        this.driveNameProvider = require("./DriveNameProvider").defaultDriveNameProvider;
      } catch (e) {
        this.driveNameProvider = null as any;
      }
    }

    if (options && options.cacheAdapter) {
      this.cacheAdapter = options.cacheAdapter;
    } else if (typeof defaultCacheAdapter !== "undefined") {
      this.cacheAdapter = defaultCacheAdapter;
    } else {
      try {
        this.cacheAdapter = require("./CacheAdapter").defaultCacheAdapter;
      } catch (e) {
        this.cacheAdapter = null as any;
      }
    }

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

  async triageEmail(emailData: EmailData, messageId?: string): Promise<AiPredictionResult> {
    if (messageId && this.cacheAdapter) {
      const cached = this.cacheAdapter.get("ai_pred_" + messageId);
      if (cached) {
        try {
          const parsed: AIPrediction = JSON.parse(cached);
          return { success: true, prediction: parsed };
        } catch (e) {
          // Ignore cache parse errors and proceed to fetch
        }
      }
    }

    const driveNames = this.driveNameProvider ? this.driveNameProvider.getAvailableDriveNames() : [];

    const apiKey = getApiKeyHelper()();
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
      : "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    const fetchResult = getFetchGeminiHelper()(`${apiUrl}?key=${apiKey}`, options);

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
          userMessage: getSanitizeErrorString()(`HTTP ${fetchResult.statusCode}: Auto-triage failed.`)
        }
      };
    }

    try {
      const responseText = fetchResult.response ? fetchResult.response.getContentText() : "";
      const json = JSON.parse(responseText);
      if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text) {
        let text = json.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedResponse = JSON.parse(text);

        let pName = parsedResponse.predictedProjectName || "";
        if (pName && !driveNames.includes(pName)) {
          pName = "";
        }

        const pred: AIPrediction = {
          predictedProjectName: pName,
          predictedDiscipline: parsedResponse.predictedDiscipline || ""
        };

        if (messageId && this.cacheAdapter) {
          this.cacheAdapter.put("ai_pred_" + messageId, JSON.stringify(pred), 21600);
        }

        return { success: true, prediction: pred };
      }

      return {
        success: false,
        error: {
          code: "PARSE_FAILURE",
          userMessage: getSanitizeErrorString()("Unexpected API schema returned.")
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: {
          code: "PARSE_FAILURE",
          userMessage: getSanitizeErrorString()("Failed to parse AI prediction.")
        }
      };
    }
  }

  async analyzeSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    emailText: string,
    contextObj: DeepAnalysisContext
  ): Promise<DeepAnalysisResult> {
    const apiKey = getApiKeyHelper()();
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
          userMessage: getSanitizeErrorString()(`Failed to process PDF: ${e && e.message ? e.message : String(e)}`)
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

    const fetchResult = getFetchGeminiHelper()(`${apiUrl}?key=${apiKey}`, options);

    if (!fetchResult.success) {
      if (fetchResult.statusCode === 429 || fetchResult.statusCode === 503) {
        return {
          success: false,
          error: {
            code: "RATE_LIMITED",
            userMessage: getSanitizeErrorString()(`HTTP ${fetchResult.statusCode}: ${fetchResult.errorText || 'High server demand or rate limited.'}`)
          }
        };
      }
      return {
        success: false,
        error: {
          code: "API_FAILURE",
          userMessage: getSanitizeErrorString()(`HTTP ${fetchResult.statusCode}: ${fetchResult.errorText || 'Gemini API call failed.'}`)
        }
      };
    }

    try {
      const responseText = fetchResult.response ? fetchResult.response.getContentText() : "";
      const json = JSON.parse(responseText);
      if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text) {
        let text = json.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
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
          userMessage: getSanitizeErrorString()("No valid text candidate returned from Gemini API.")
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: "PARSE_FAILURE",
          userMessage: getSanitizeErrorString()(`API Exception or Parse Failure: ${err && err.message ? err.message : String(err)}`)
        }
      };
    }
  }
}

class FakeAiAnalysisAdapter implements AiAnalysisService {
  public triageCalls: Array<{ emailData: EmailData; messageId?: string }> = [];
  public analyzeCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; emailText: string; contextObj: DeepAnalysisContext }> = [];
  private triageResult: AiPredictionResult = {
    success: true,
    prediction: { predictedProjectName: "Default Project", predictedDiscipline: "Architecture" }
  };
  private analysisResult: DeepAnalysisResult = {
    success: true,
    prediction: {},
    analysis: {}
  };

  setTriageResult(result: AiPredictionResult): void {
    this.triageResult = result;
  }

  setAnalyzeSubmittalResult(result: DeepAnalysisResult): void {
    this.analysisResult = result;
  }

  setAnalysisResult(result: DeepAnalysisResult): void {
    this.analysisResult = result;
  }

  async triageEmail(emailData: EmailData, messageId?: string): Promise<AiPredictionResult> {
    this.triageCalls.push({ emailData, messageId });
    return this.triageResult;
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
