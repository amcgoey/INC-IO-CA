// src/types.ts (Global Ambient Declarations for Apps Script)

interface EmailData {
  subject: string;
  sender: string;
  replyTo: string;
  to: string;
  cc: string;
  labels: string[];
  attachmentNames: string[];
  body: string;
}

interface AIPrediction {
  predictedProjectName?: string;
  predictedDiscipline?: string;
  error?: string;
  confidence?: number;
  [key: string]: any;
}

interface ParsedData {
  projectAbbr?: string;
  discipline?: string;
  specSection?: string;
  submittalNum?: string;
  revNum?: string;
  title?: string;
  action?: string;
  driveName?: string;
  driveId?: string;
  logFileId?: string;
  incomingRouting?: string;
  fileSource?: string;
  contact?: string;
  targetKey?: string;
  driveFileId?: string;
  attachmentIndex?: number;
  pdfUrl?: string;
  fileName?: string;
  specTag?: string;
  vendor?: string;
  date?: string;
  [key: string]: any;
}

interface FlashMessage {
  warning?: string;
  info?: string;
  error?: string;
}

interface DriveItem {
  id: string;
  title: string;
  mimeType: string;
}

interface GoogleAppsScriptEvent {
  gmail?: {
    messageId: string;
    accessToken: string;
  };
  drive?: {
    selectedItems: DriveItem[];
  };
  parameters?: Record<string, string>;
  formInputs?: Record<string, string[]>;
  formInput?: Record<string, string>;
  [key: string]: any;
}

interface EmailTemplateParams {
  projectAbbr?: string;
  targetKey?: string;
  title?: string;
  action?: string;
  url?: string;
  localPath?: string;
}

interface EmailTemplateResult {
  subject: string;
  body: string;
}

interface SharedDriveInfo {
  id: string;
  name: string;
}

interface GeminiFetchResult {
  success: boolean;
  response?: GoogleAppsScript.URL_Fetch.HTTPResponse;
  statusCode?: number | string;
  errorText?: string;
}

// Global declaration for pdf-lib evaluated at runtime
declare const PDFLib: any;
