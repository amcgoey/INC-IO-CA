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

type RowKeyFn = (row: any[], headers: string[]) => string;

interface RowInsertionPlan {
  targetRowIndex: number;
  insertBlankBefore: boolean;
  insertBlankAfter: boolean;
  finalRowIndex: number;
}


interface FilingOptions {
  targetFolderId: string;
  subfolderPath?: string[];
  newFileName?: string;
}

interface FilingResult {
  fileId: string;
  url: string;
  localPath: string;
  folderId: string;
}

interface DocumentLogStrategy<T = ValidatedDocument> {
  getGroupKey(doc: T): string;
  getSortKey(doc: T): string;
  getTargetKey(doc: T): string;
  getGroupKeyFromRow(row: any[], headers: string[]): string;
  getSortKeyFromRow(row: any[], headers: string[]): string;
  getTargetKeyFromRow(row: any[], headers: string[]): string;
  formatRowPayload(doc: T, options: { link: string; contactHistory: string; status: string }): Record<string, string>;
  getFileName(doc: T, contactHistory: string, actionAbbr: string): string;
  getFilingSubfolders?(doc: T): string[];
}

interface AppendDocumentOptions {
  sheetName?: string;
  headers?: string[];
  link?: string;
  status?: string;
  actionAbbr?: string;
  updatePreviousStatus?: boolean;
  previousRowStatus?: string;
}

interface AppendDocumentResult {
  targetKey: string;
  newFileName: string;
  contactHistory: string;
  rowIndex: number;
  failedColumns: string[];
  previousRowUpdated: boolean;
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
  appendDocument(
    spreadsheetId: string,
    document: ValidatedDocument,
    strategy: DocumentLogStrategy,
    options?: AppendDocumentOptions
  ): AppendDocumentResult;
}




// Global Ambient Function Declarations
declare class FormIntakeParser {
  static parse(formInput: Record<string, string>): RawDocument;
}

declare class EmailIntakeParser {
  static parseProcoreEmail_(subject: string, body: string): Partial<ParsedData>;
  static parseFormaEmail_(subject: string, body: string): Partial<ParsedData>;
  static parseEmail(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData;
}

declare class DocumentPipeline {
  static parseFormIntake(formInput: Record<string, string>): RawDocument;
  static parseEmail(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData;
  static validate(rawDoc: RawDocument, context?: ValidationContext): ValidationResult;
  static processFormIntake(formInput: Record<string, string>, context?: ValidationContext): ValidationResult;
}

declare function validateDocument(rawDoc: RawDocument, context?: ValidationContext): ValidationResult;


declare function buildMainCard(e: GoogleAppsScriptEvent, initialData?: ParsedData | null, isTagChange?: boolean, flashMessage?: FlashMessage | null): GoogleAppsScript.Card_Service.Card;
declare function buildSuccessCard(fileId: string, newFileName: string, fileUrl: string, localPath: string, targetKey: string, itemTitle: string, discipline: string, section: string, specTag: string, targetFolderId: string, logFileId: string, isFiled?: boolean, projectAbbr?: string, action?: string, incomingRouting?: string, draftUrl?: string | null, directRowUrl?: string | null, failedColumns?: string[], emptyFallbacks?: string[]): GoogleAppsScript.Card_Service.Card;
declare function parseEmailData(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData;
declare function parseDriveFilename(filename: string): ParsedData;
declare function parseFormaEmail_(subject: string, body: string): Partial<ParsedData>;
declare function parseProcoreEmail_(subject: string, body: string): Partial<ParsedData>;
declare function getCachedPrediction(messageId: string): AIPrediction | null;
declare function setCachedPrediction(messageId: string, predictionObj: AIPrediction): void;
declare function getCachedDrives(): SharedDriveInfo[];
declare function getAvailableDriveNames(): string[];
declare function predictProjectAndDiscipline(emailData: EmailData, driveNames: string[]): AIPrediction;
declare function analyzeSubmittalDeep(sourceBlob: GoogleAppsScript.Base.Blob, emailText: string, contextObj: any): Promise<any>;
declare function fetchAndSaveFile(url: string, folderId: string): { success: boolean; error?: string; fileId?: string; fileName?: string };
declare function getBoundedData(logData: any[][]): any[][];
declare function getRowGroupKey(row: any[], discipline: string, headers: string[]): string;
declare function getRowSortKey(row: any[], discipline: string, headers: string[]): string;
declare function computeRowInsertionPlan(boundedData: any[][], headers: string[], rowData: any[], disciplineOrGroupKeyFn: string | RowKeyFn, sortKeyFn?: RowKeyFn): RowInsertionPlan;

interface StampOptions {
  newFileName: string;
  stampSubmittalNo: string;
  templateId: string;
}

interface PdfDocumentService {
  extractFormAction(fileId: string): Promise<string | null>;
  stampSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    data: ParsedData,
    options: StampOptions
  ): Promise<GoogleAppsScript.Base.Blob>;
}

interface DriveFilingRepository {
  getLocalPath(fileId: string): string;
  fileDocument(file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }, options: FilingOptions): FilingResult;
}

declare var defaultLogRepository: LogRepository;
declare var defaultDriveFilingRepository: DriveFilingRepository;
declare var defaultPdfDocumentService: PdfDocumentService;
declare function processSubmission(e: GoogleAppsScriptEvent): Promise<any>;

// Global declaration for pdf-lib evaluated at runtime
declare const PDFLib: any;


declare class ArchitectureSubmittalStrategy implements DocumentLogStrategy<ValidatedDocument> {
  getFilingSubfolders(doc: ValidatedDocument): string[];
  getGroupKey(doc: ValidatedDocument): string;
  getSortKey(doc: ValidatedDocument): string;
  getTargetKey(doc: ValidatedDocument): string;
  getGroupKeyFromRow(row: any[], headers: string[]): string;
  getSortKeyFromRow(row: any[], headers: string[]): string;
  getTargetKeyFromRow(row: any[], headers: string[]): string;
  formatRowPayload(doc: ValidatedDocument, options: { link: string; contactHistory: string; status: string }): Record<string, string>;
  getFileName(doc: ValidatedDocument, contactHistory: string, actionAbbr: string): string;
}

declare class FFESubmittalStrategy implements DocumentLogStrategy<ValidatedDocument> {
  getGroupKey(doc: ValidatedDocument): string;
  getSortKey(doc: ValidatedDocument): string;
  getTargetKey(doc: ValidatedDocument): string;
  getGroupKeyFromRow(row: any[], headers: string[]): string;
  getSortKeyFromRow(row: any[], headers: string[]): string;
  getTargetKeyFromRow(row: any[], headers: string[]): string;
  formatRowPayload(doc: ValidatedDocument, options: { link: string; contactHistory: string; status: string }): Record<string, string>;
  getFileName(doc: ValidatedDocument, contactHistory: string, actionAbbr: string): string;
}
