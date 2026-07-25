// src/types.ts (Global Ambient Declarations for Google Apps Script)

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
}

interface ParsedData {
  projectAbbr?: string;
  discipline?: string;
  specSection?: string;
  section?: string;
  submittalNum?: string;
  number?: string;
  revNum?: string;
  revision?: string;
  title?: string;
  action?: string;
  driveName?: string;
  driveId?: string;
  logFileId?: string;
  incomingRouting?: string;
  fileSource?: string;
  driveFileUrl?: string;
  contact?: string;
  targetKey?: string;
  driveFileId?: string;
  attachmentIndex?: number;
  pdfUrl?: string;
  fileName?: string;
  specTag?: string;
  relatedTag?: string;
  specTitle?: string;
  vendor?: string;
  date?: string;
  notes?: string;
}

interface FlashMessage {
  warning?: string;
  info?: string;
  error?: string;
  missingFields?: string[];
  promptAddTag?: boolean;
  promptAddVendor?: boolean;
  targetKey?: string;
  fileId?: string;
  url?: string;
  localPath?: string;
  title?: string;
  action?: string;
  incomingRouting?: string;
  projectAbbr?: string;
  directRowUrl?: string;
  failedColumns?: string[];
  emptyFallbacks?: string[];
  newFileName?: string;
  newDriveFileId?: string;
  debugPhase2?: string;
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

interface ActionSetting {
  action: string;
  abbr: string;
  status: string;
}

interface ContactSetting {
  abbr: string;
  name: string;
}

interface LogSettings {
  contacts: ContactSetting[];
  actions: ActionSetting[];
  ffeTags: {
    tags: string[];
    vendors: string[];
    tagMap: Record<string, string>;
  };
  projectAbbr: string;
  logSheetId: number | null;
}

interface ProcessContext {
  e: GoogleAppsScriptEvent;
  form: Record<string, string>;
  p: Record<string, string>;
  discipline: string;
  logSheet: GoogleAppsScript.Spreadsheet.Sheet;
  headers: string[];
  getColIdx: (name: string) => number;
  selectedAction: { action: string; abbr: string; status: string };
  targetKey: string;
  groupKey: string;
  newFileName: string;
  boundedData: any[][];
  newChain: string;
  previousRowSheetIndex: number | null;
  sectionVal: string;
  numberVal: string;
  revisionVal: string;
  emptyFallbacks: string[];
}

type RawDocument = Record<string, string>;

interface ArchitectureDetails {
  discipline: "Architecture";
  section: string;
  number: string;
  title: string;
  revision: string;
}

interface FFEDetails {
  discipline: "FF&E";
  specTag: string;
  specTitle: string;
  vendor: string;
  revision: string;
  relatedTag?: string;
}

interface ValidatedDocument {
  documentType: string;
  date: string;
  contact: string;
  action: string;
  notes?: string;
  incomingRouting?: string;
  disciplineDetails: ArchitectureDetails | FFEDetails;
}

interface ValidationContext {
  ffeTags?: {
    tags: string[];
    vendors: string[];
  };
  bypassTagValidation?: boolean;
  bypassVendorValidation?: boolean;
}

type ValidationResult =
  | { status: "success"; data: ValidatedDocument; warnings: string[] }
  | { status: "error"; errors: string[]; missingFields?: string[] }
  | { status: "interaction_required"; interactionType: "ADD_TAG" | "ADD_VENDOR"; message: string };

interface RowInsertionPlan {
  targetRowIndex: number;
  insertBlankBefore: boolean;
  insertBlankAfter: boolean;
  finalRowIndex: number;
}

interface LogRepository {
  getLogSettings(spreadsheetId: string, discipline: string): LogSettings;
  verifyAndFormatLogSheet(spreadsheetId: string): string[];
  addNewTagToTagList(spreadsheetId: string, newTag: string, newTitle: string): void;
  addNewVendorToTagList(spreadsheetId: string, newVendor: string): void;
  insertLogRow(
    spreadsheetId: string,
    headers: string[],
    rowData: any[],
    plan: RowInsertionPlan
  ): { rowIndex: number; failedColumns: string[] };
}




// Global Ambient Function Declarations
declare function buildMainCard(e: GoogleAppsScriptEvent, initialData?: ParsedData | null, isTagChange?: boolean, flashMessage?: FlashMessage | null): GoogleAppsScript.Card_Service.Card;
declare function buildSuccessCard(fileId: string, newFileName: string, fileUrl: string, localPath: string, targetKey: string, itemTitle: string, discipline: string, section: string, specTag: string, targetFolderId: string, logFileId: string, isFiled?: boolean, projectAbbr?: string, action?: string, incomingRouting?: string, draftUrl?: string | null, directRowUrl?: string | null, failedColumns?: string[], emptyFallbacks?: string[]): GoogleAppsScript.Card_Service.Card;
declare function parseEmailData(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData;
declare function parseDriveFilename(filename: string): ParsedData;
declare function extractActionFromPdfForm(fileId: string): Promise<string | null>;
declare function getCachedPrediction(messageId: string): AIPrediction | null;
declare function setCachedPrediction(messageId: string, predictionObj: AIPrediction): void;
declare function getCachedDrives(): SharedDriveInfo[];
declare function getAvailableDriveNames(): string[];
declare function predictProjectAndDiscipline(emailData: EmailData, driveNames: string[]): AIPrediction;
declare function analyzeSubmittalDeep(sourceBlob: GoogleAppsScript.Base.Blob, emailText: string, contextObj: any): Promise<any>;
declare function fetchAndSaveFile(url: string, folderId: string): { success: boolean; error?: string; fileId?: string; fileName?: string };
declare function manipulatePdf(sourceBlob: GoogleAppsScript.Base.Blob, data: ParsedData, newFileName: string, stampSubmittalNo: string, templateId: string): Promise<GoogleAppsScript.Base.Blob>;
declare function getBoundedData(logData: any[][]): any[][];
declare function getRowGroupKey(row: any[], discipline: string, headers: string[]): string;
declare function getRowSortKey(row: any[], discipline: string, headers: string[]): string;
declare function computeRowInsertionPlan(boundedData: any[][], headers: string[], rowData: any[], discipline: string): RowInsertionPlan;
declare var defaultLogRepository: LogRepository;
declare function processSubmission(e: GoogleAppsScriptEvent): Promise<any>;
declare function getLocalDrivePath(fileId: string): string;
declare function getOrCreateFilingFolder(parentFolderId: string, discipline: string, section?: string, specTag?: string): string;
declare function insertSmartRowGapAware(sheet: GoogleAppsScript.Spreadsheet.Sheet, headers: string[], rowData: any[], discipline: string, boundedData: any[][]): { rowIndex: number; failedColumns: string[] };

// Global declaration for pdf-lib evaluated at runtime
declare const PDFLib: any;
