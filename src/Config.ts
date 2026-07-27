/**
 * @file Config.ts
 * @description Centralized configuration constants, MasterFormat CSI division mappings, PDF form field dictionaries, user-facing UI messages, and email notification templates.
 */

/**
 * System-wide configuration options, Google Script Property dynamic getters, and default values.
 */
const CONFIG = {
  /** Target Google Drive subfolder name for filing submittals. */
  TARGET_FOLDER_NAME: "Submittals",
  /** Target subfolder for filed/closed submittals. */
  CLOSED_FOLDER_NAME: "Closed",
  /** Shared Drive search term used to discover submittal log spreadsheets. */
  LOG_FILE_SEARCH_TERM: "submittal log",
  /** Tab name for the primary submittal log sheet. */
  LOG_SHEET_NAME: "Log",
  /** Tab name for project settings (contacts, actions, project abbreviation). */
  SETTINGS_SHEET_NAME: "Settings",
  /** Tab name for FF&E tag and vendor lists. */
  TAG_LIST_SHEET_NAME: "Tag List",
  /** 1-based row index containing column headers in the submittal log. */
  LOG_HEADER_ROW: 3,

  /** Gets the PDF cover sheet template file ID configured in Script Properties. */
  get PDF_TEMPLATE_ID(): string {
    return PropertiesService.getScriptProperties().getProperty('PDF_TEMPLATE_ID') || "";
  },
  /** Gets the Transmittal cover sheet template file ID configured in Script Properties. */
  get TRANSMITTAL_TEMPLATE_ID(): string {
    return PropertiesService.getScriptProperties().getProperty('TRANSMITTAL_TEMPLATE_ID') || "";
  },
  /** Gets the company logo image URL configured in Script Properties. */
  get LOGO_URL(): string {
    return PropertiesService.getScriptProperties().getProperty('LOGO_URL') || "";
  },
  /** CDN URL for pdf-lib JavaScript library. */
  PDF_LIB_URL: "https://unpkg.com/pdf-lib/dist/pdf-lib.min.js",

  // File Naming Configuration
  /** Character prefix used for stamped PDF files saved in root target folders. */
  STAMPED_FILE_PREFIX: "_",

  /** Default workflow action. */
  DEFAULT_ACTION: "Received",
  /** Default submittal discipline. */
  DEFAULT_DISCIPLINE: "Architecture",
  /** Supported submittal disciplines list. */
  SUPPORTED_DISCIPLINES: ["Architecture", "FF&E"],
  /** Default incoming routing selection. */
  DEFAULT_INCOMING_ROUTING: "To Review",
  /** Default revision string. */
  DEFAULT_REVISION: "0",
  /** Default intake file source selection. */
  DEFAULT_FILE_SOURCE: "Email Attachment",

  /** Gemini API endpoint URL for email triage predictions (Gemini 3.5 Flash-Lite). */
  get GEMINI_API_URL_TRIAGE(): string {
    try {
      if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
        const custom = PropertiesService.getScriptProperties().getProperty('GEMINI_API_URL_TRIAGE')
          || PropertiesService.getScriptProperties().getProperty('GEMINI_API_URL');
        if (custom) return custom;
      }
    } catch (e) {}
    return "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
  },
  /** Gemini API endpoint URL for multimodal PDF submittal analysis (Gemini 3.6 Flash). */
  get GEMINI_API_URL_ANALYSIS(): string {
    try {
      if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
        const custom = PropertiesService.getScriptProperties().getProperty('GEMINI_API_URL_ANALYSIS')
          || PropertiesService.getScriptProperties().getProperty('GEMINI_API_URL');
        if (custom) return custom;
      }
    } catch (e) {}
    return "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
  }
};

/**
 * MasterFormat CSI (Construction Specifications Institute) 2-digit division code mappings to folder names.
 */
const CSI_DIVISIONS: Record<string, string> = {
  "00": "00 Procurement & Contracting",
  "01": "01 General Requirements",
  "02": "02 Existing Conditions",
  "03": "03 Concrete",
  "04": "04 Masonry",
  "05": "05 Metals",
  "06": "06 Wood",
  "07": "07 Thermal & Moisture",
  "08": "08 Openings",
  "09": "09 Finishes",
  "10": "10 Specialties",
  "11": "11 Equipment",
  "12": "12 Furnishings",
  "13": "13 Special Construction",
  "14": "14 Conveying",
  "21": "21 Fire Suppression",
  "22": "22 Plumbing",
  "23": "23 HVAC",
  "25": "25 Integrated Automation",
  "26": "26 Electrical",
  "27": "27 Communications",
  "28": "28 Electronic Safety & Security",
  "31": "31 Earthwork",
  "32": "32 Exterior Improvements",
  "33": "33 Utilities",
  "34": "34 Transportation",
  "35": "35 Waterway & Marine Construction",
  "40": "40 Process Interconnections",
  "41": "41 Material Processing",
  "42": "42 Process Heating Cooling Drying",
  "43": "43 Process Gas & Liquid",
  "44": "44 Pollution & Waste",
  "45": "45 Industry-Specific",
  "46": "46 Water & Wastewater",
  "48": "48 Electrical Power Generation"
};

/**
 * Mapping dictionary translating UI submittal workflow actions to PDF form field checkbox/radio names.
 */
const PDF_CHECKBOX_MAP: Record<string, string> = {
  'No Exceptions Taken': 'NO EXCEPTIONS TAKEN',
  'No Objection as Corrected': 'NO OBJECTIONS AS CORRECTED',
  'Revise & Resubmit': 'REVISE AND RESUBMIT',
  'Rejected': 'REJECTED',
  'Not Reviewed': 'NOT REVIEWED'
};

/**
 * Centralized user-facing UI title, error, warning, and confirmation text constants.
 */
const MESSAGES = {
  ADDON_TITLE: "INC IO CA",
  MAIN_CARD_TITLE: "File Submittal",
  SUCCESS_CARD_TITLE: "Submittal Logged",
  LOG_LOADED_SUCCESS: "✅ Submittal Log loaded.",
  LOG_MULTIPLE_FOUND: "⚠️ Multiple Submittal Logs detected. Please select the correct log below.",
  ERROR_MISSING_ACTION: "❌ Missing Information: Action and Contact are required to proceed.",
  ERROR_NO_LOG: "❌ No Submittal Log found in this Drive.",
  ERROR_AI_BUSY: "⏳ Google's AI is currently experiencing high demand. Please try again in a moment, or enter the metadata manually.",

  SUCCESS_INCOMING: (targetKey: string) => `✅ Successfully logged ${targetKey} and saved original to 'Closed'.`,
  SUCCESS_OUTGOING: (targetKey: string) => `✅ Successfully logged and renamed ${targetKey}.`,

  ERROR_INVALID_SELECTION_TITLE: "Invalid Selection",
  ERROR_INVALID_SELECTION_TEXT: "Please select exactly ONE PDF file.",
  ERROR_DRIVE_API: (err: any) => `⚠️ Drive API Error:\n${sanitizeErrorString(err)}`,
  ERROR_LOG_SEARCH: (err: any) => `⚠️ Log Search Error:\n${sanitizeErrorString(err)}`,
  WARNING_NO_PDF_ATTACHMENTS: "⚠️ No PDF attachments found in this email.",
  ERROR_TARGET_FOLDER: "❌ Error: Target folder not resolved. Please select a Drive/Log first.",
  WARNING_AUTH_WALL: "⚠️ Cannot download: File is behind a login wall. Please download manually and use 'Google Drive URL'.",
  WARNING_NOT_WHITELISTED: "⚠️ Domain not whitelisted. Please manually download the file and use 'Google Drive URL'.",
  ERROR_FETCH_FAILED: (err: any) => `❌ Fetch failed: ${sanitizeErrorString(err)}`,
  SUCCESS_FETCHED: "✅ Fetched successfully!",
  DEBUG_SAVED_TO_DRIVE: (fileName: string, fileId: string) => `✅ Saved ${fileName} to Drive.\nDriveFileId: ${fileId}`,
  ERROR_NO_DRIVE_FILE: "❌ Error: No Drive File selected.",
  ERROR_NO_ATTACHMENT: "❌ Error: No attachment selected.",
  ERROR_NO_URL: "❌ Error: No Drive URL provided.",
  ERROR_GETTING_FILE: (err: any) => `❌ Error getting file: ${sanitizeErrorString(err)}`,
  ERROR_RESOLVING_FILE: "❌ Error: Could not resolve file for analysis. Check URL permissions.",
  ERROR_AI_GENERAL: (err: any) => `❌ AI Error: ${sanitizeErrorString(err)}`,
  WARNING_AI_AUTO_TRIAGE: (err: any) => `⚠️ ${sanitizeErrorString(err)}`,
  SUCCESS_ANALYSIS: "✅ Analysis complete!",
  SUCCESS_DRAFT_CREATED: "✅ Draft created.",
  SUCCESS_MOVED: (folderName: string) => `✅ Moved to ${folderName}`,
  ERROR_GENERAL: (err: any) => `❌ Error: ${sanitizeErrorString(err)}`,
  BTN_FETCH: "📥 Fetch & Save to Drive",
  BTN_ANALYZE: "✨ Analyze Submittal with AI"
};

/**
 * Standard email notification templates (subject lines and HTML body strings) generated for Gmail draft creation.
 */
const EMAIL_TEMPLATES = {
  /** Template generator for standard outgoing submittal responses ("Reviewed", "Approved"). */
  standardOutgoing: ({ projectAbbr, targetKey, title, action, url, localPath }: EmailTemplateParams): EmailTemplateResult => {
    const subjPrefix = projectAbbr ? `${projectAbbr} - ` : "";
    const cleanTitle = title || "";
    return {
      subject: `${subjPrefix}Submittal ${targetKey} ${cleanTitle} - ${action}`,
      body: `Please refer to the link below for <b>Submittal ${targetKey} ${cleanTitle}</b>, which is being returned <b>${action}</b>.<br><br><a href="${url}">${url}</a>`
    };
  },

  /** Template generator for rejected outgoing submittal responses. */
  rejectedOutgoing: ({ projectAbbr, targetKey, title, action, url, localPath }: EmailTemplateParams): EmailTemplateResult => {
    const subjPrefix = projectAbbr ? `${projectAbbr} - ` : "";
    const cleanTitle = title || "";
    return {
      subject: `${subjPrefix}Submittal ${targetKey} ${cleanTitle} - REJECTED`,
      body: `Please refer to the link below for <b>Submittal ${targetKey} ${cleanTitle}</b>, which is being returned <b>REJECTED</b>.<br><br>⚠️ <i>ACTION REQUIRED: Please edit this draft to provide a brief reason for the rejection before sending, so we can accurately update the project records and notify the relevant parties.</i><br><br><a href="${url}">${url}</a>`
    };
  },

  /** Template generator for forwarding submittals for external review ("To Refer"). */
  toRefer: ({ projectAbbr, targetKey, title, action, url, localPath }: EmailTemplateParams): EmailTemplateResult => {
    const subjPrefix = projectAbbr ? `${projectAbbr} - ` : "";
    const cleanTitle = title || "";
    return {
      subject: `${subjPrefix}Submittal for Review: ${targetKey} ${cleanTitle}`,
      body: `Please refer to the link below for <b>Submittal ${targetKey} ${cleanTitle}</b>, which is being forwarded for your review and comments. Please return at your earliest convenience or contact us if you have any questions.<br><br><b>View Document:</b> <a href="${url}">${url}</a>`
    };
  }
};

if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).CONFIG = (globalThis as any).CONFIG || CONFIG;
  (globalThis as any).CSI_DIVISIONS = (globalThis as any).CSI_DIVISIONS || CSI_DIVISIONS;
  (globalThis as any).PDF_CHECKBOX_MAP = (globalThis as any).PDF_CHECKBOX_MAP || PDF_CHECKBOX_MAP;
  (globalThis as any).MESSAGES = (globalThis as any).MESSAGES || MESSAGES;
  (globalThis as any).EMAIL_TEMPLATES = (globalThis as any).EMAIL_TEMPLATES || EMAIL_TEMPLATES;
  module.exports = {
    CONFIG,
    CSI_DIVISIONS,
    PDF_CHECKBOX_MAP,
    MESSAGES,
    EMAIL_TEMPLATES
  };
}
