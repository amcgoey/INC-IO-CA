/** Fixed numerical confidence threshold (< 0.85) for triggering visual low-confidence warning indicators. */
var FieldConfidenceThreshold: number = (typeof globalThis !== "undefined" && (globalThis as any).FieldConfidenceThreshold) || 0.85;

/** Extracted field confidence object from 1-pass AI classification. */
interface AiClassificationField {
  value: string;
  confidence: number;
}

/** Standardized payload returned from 1-pass AI document triage and classification. */
interface AiClassificationResult {
  overallConfidence?: number;
  fields?: Record<string, AiClassificationField>;
}

/**
 * @file types.ts
 * @description Global ambient type definitions, domain interfaces, workflow types, and global Google Apps Script declarations.
 */

/** Raw email header and content structure used for AI triage. */
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

/** Prediction output payload returned from email triage. */
interface AIPrediction {
  predictedProjectName?: string;
  predictedDiscipline?: string;
  error?: string;
  confidence?: number;
}

/** Discriminated union outcome for AI email triage execution. */
type AiPredictionResult =
  | { success: true; prediction: AIPrediction }
  | {
      success: false;
      error: {
        code: 'RATE_LIMITED' | 'MISSING_KEY' | 'API_FAILURE' | 'PARSE_FAILURE';
        userMessage: string;
      };
    };

/** Context containing valid contact and action options passed to deep AI submittal analysis. */
interface DeepAnalysisContext {
  contacts: Array<{ abbr: string; name: string }>;
  actions: Array<{ action: string }>;
}

/** Extracted metadata fields returned from multimodal submittal PDF analysis. */
interface DeepAnalysisPrediction {
  predictedSection?: string;
  predictedNumber?: string;
  predictedRevision?: string;
  predictedTitle?: string;
  predictedSpecTag?: string;
  predictedVendor?: string;
  predictedContactAbbr?: string;
  predictedAction?: string;
}

/** Discriminated union outcome for deep AI submittal analysis. */
type DeepAnalysisResult =
  | { success: true; analysis: DeepAnalysisPrediction }
  | {
      success: false;
      error: {
        code: "RATE_LIMITED" | "MISSING_KEY" | "API_FAILURE" | "PARSE_FAILURE" | "PDF_PROCESSING_ERROR";
        userMessage: string;
      };
    };

/** Service interface for email triage and submittal document deep AI analysis. */
interface AiAnalysisService {
  triageEmail?(emailData: EmailData, messageId?: string): Promise<AiPredictionResult>;
  analyzeSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    emailText: string,
    contextObj: DeepAnalysisContext
  ): Promise<DeepAnalysisResult>;
}

/** Intermediate unvalidated dictionary of submittal fields extracted from email, filename, or card inputs. */
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
  blob?: GoogleAppsScript.Base.Blob;
  attachments?: GoogleAppsScript.Base.Blob[];
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

/** Card UI state flash message object for error/warning banners and interactive prompts. */
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
  originalFileId?: string;
  duplicateDocumentAction?: DuplicateDocumentAction;
  emptyFallbacks?: string[];
  newFileName?: string;
  newDriveFileId?: string;
  debugPhase2?: string;
}

/** Drive item selection payload object. */
interface DriveItem {
  id: string;
  title: string;
  mimeType: string;
}

/** Event payload object passed to Google Workspace Add-on trigger handlers. */
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

/** Parameters passed to email notification template generators. */
interface EmailTemplateParams {
  projectAbbr?: string;
  targetKey?: string;
  title?: string;
  action?: string;
  url?: string;
  localPath?: string;
}

/** Result subject and HTML body strings generated by email notification templates. */
interface EmailTemplateResult {
  subject: string;
  body: string;
}

/** Shared Drive ID and name tuple. */
interface SharedDriveInfo {
  id: string;
  name: string;
}

/** Result container for internal Gemini HTTP fetch operations. */
interface GeminiFetchResult {
  success: boolean;
  response?: GoogleAppsScript.URL_Fetch.HTTPResponse;
  statusCode?: number | string;
  errorText?: string;
}

/** Action configuration entry from Settings sheet. */
interface ActionSetting {
  action: string;
  abbr: string;
  status: string;
}

/** Contact configuration entry from Settings sheet. */
interface ContactSetting {
  abbr: string;
  name: string;
}

/** Consolidated project settings parsed from spreadsheet Settings and Tag List tabs. */
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
  sheetGids?: Record<string, number>;
}

/** Context object for legacy process submission handlers. */
interface ProcessContext {
  e: GoogleAppsScriptEvent;
  form: Record<string, string>;
  p: Record<string, string>;
  discipline: string;
  logSheet: GoogleAppsScript.Spreadsheet.Sheet;
  headers: string[];
  getColIdx: (name: string) => number;
  selectedAction: { action: string; abbr: string; status: string };
  appContext?: AppContext;
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

/** Key-value dictionary of raw document string fields. */
type RawDocument = Record<string, string>;

/** Submittal details specific to Architectural discipline. */
interface ArchitectureDetails {
  discipline: "Architecture";
  section: string;
  number: string;
  title: string;
  revision: string;
}

/** Submittal details specific to FF&E discipline. */
interface FFEDetails {
  discipline: "FF&E";
  specTag: string;
  specTitle: string;
  vendor: string;
  revision: string;
  relatedTag?: string;
}

/** Stored representation preference for a list-backed document field. */
type StoredFormType = 'abbreviation' | 'longForm';

/** Option item for dynamic ListDocumentField resolution. */
interface ListFieldOption {
  abbr: string;
  name?: string;
  longForm?: string;
  action?: string;
  status?: string;
}

/** Bi-directionally resolved value payload for a ListDocumentField. */
interface ResolvedListField {
  fieldName: string;
  storedForm: StoredFormType;
  storedValue: string;
  abbreviation: string;
  longForm: string;
}

/** Strongly typed validated document domain model. */
interface ValidatedDocument {
  documentType: string;
  date: string;
  contact: string;
  action: string;
  listFields?: Record<string, ResolvedListField>;
  notes?: string;
  incomingRouting?: string;
  disciplineDetails: ArchitectureDetails | FFEDetails;
}

/** Options and tag lists for submittal validation. */
interface IListDocumentField {
  name: string;
  storedForm: StoredFormType;
  resolve(inputValue: string): ResolvedListField;
}

interface ValidationContext {
  ffeTags?: {
    tags: string[];
    vendors: string[];
  };
  bypassTagValidation?: boolean;
  bypassVendorValidation?: boolean;
  contacts?: ContactSetting[];
  actions?: ActionSetting[];
  logSettings?: LogSettings;
  listFields?: Record<string, IListDocumentField>;
}

/** Discriminated union outcome for submittal validation. */
type ValidationResult =
  | { status: "success"; data: ValidatedDocument; warnings: string[] }
  | { status: "error"; errors: string[]; missingFields?: string[] }
  | { status: "interaction_required"; interactionType: "ADD_TAG" | "ADD_VENDOR"; message: string };

/** Function type for extracting group or sort keys from raw spreadsheet row arrays. */
type RowKeyFn = (row: any[], headers: string[]) => string;

/** Insertion position plan calculated for placing a new submittal into Google Sheets. */
interface RowInsertionPlan {
  targetRowIndex: number;
  insertBlankBefore: boolean;
  insertBlankAfter: boolean;
  finalRowIndex: number;
}

/** Options provided to Drive filing repository during file upload/movement. */
interface FilingOptions {
  targetFolderId: string;
  subfolderPath?: string[];
  newFileName?: string;
}

/** Result object returned from Drive filing operations. */
interface FilingResult {
  fileId: string;
  url: string;
  localPath: string;
  folderId: string;
}

/** Strategy pattern interface for discipline-specific submittal rules. */
interface DocumentLogStrategy<T = ValidatedDocument> {
  getGroupKey(doc: T): string;
  getSortKey(doc: T): string;
  getTargetKey(doc: T): string;
  getIdentityData(doc: T): IdentityData;
  getGroupKeyFromRow(row: any[], headers: string[]): string;
  getSortKeyFromRow(row: any[], headers: string[]): string;
  getTargetKeyFromRow(row: any[], headers: string[]): string;
  formatRowPayload(doc: T, options: { link: string; contactHistory: string; status: string }): Record<string, string>;
  getFileName(doc: T, contactHistory: string, actionAbbr: string): string;
  getFilingSubfolders?(doc: T): string[];
}

/** Abstract identity model for storage-agnostic logging. */
interface IdentityData {
  identityGroup: string;
  identityRevisionGroup: string;
  identity: string;
}

/** Options for appending submittals to log repository. */

/** Audit log event input options. */
interface AuditLogEventInput {
  category: string;
  eventType: string;
  actor?: string;
  status: string;
  details?: string | Record<string, unknown>;
  timestamp?: string;
}

/** Result object returned from logging an audit event. */
interface AuditLogResult {
  sheetName: string;
  rowIndex: number;
  event: AuditLogEventInput;
}

interface AppendDocumentOptions {
  actor?: string;
  sheetName?: string;
  headers?: string[];
  link?: string;
  status?: string;
  actionAbbr?: string;
  updatePreviousStatus?: boolean;
  previousRowStatus?: string;
  identityData?: IdentityData;
}

/** Result object returned after appending a document row to Google Sheets. */
/** Options for reading submittals from log repository. */
interface ReadLogOptions {
  sheetName?: string;
  headers?: string[];
  updatePreviousStatus?: boolean;
  previousRowStatus?: string;
}

/** Result object returned after reading log entries matching IdentityData. */
interface ReadLogResult {
  found: boolean;
  rowIndex: number | null;
  contactHistory: string;
  previousStatus: string;
  rowData: Record<string, any> | null;
  identityData: IdentityData;
  previousRowUpdated: boolean;
}

interface AppendDocumentResult {
  targetKey: string;
  newFileName: string;
  contactHistory: string;
  rowIndex: number;
  failedColumns: string[];
  previousRowUpdated: boolean;
}

/** Repository interface managing Google Sheets log persistence, settings, and tag lists. */
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
  readLog(
    spreadsheetId: string,
    identityData: IdentityData,
    strategy?: DocumentLogStrategy,
    options?: ReadLogOptions
  ): ReadLogResult;
  updateDocumentLink?(
    spreadsheetId: string,
    options: { sheetName?: string; rowIndex: number; url: string }
  ): void;
}



declare function validateDocument(rawDoc: RawDocument, context?: ValidationContext): ValidationResult;


interface PicklistOption {
  label: string;
  value: string;
}

declare var PicklistResolver: {
  resolveFrom2DArray(rows: unknown[][]): PicklistOption[];
  resolvePicklistOptionsRange(
    optionsRange: string | undefined,
    spreadsheet: any,
    docTypeKey?: string,
    activeSheetName?: string,
    fieldSpec?: DocumentFieldSpec | MinimalFieldSpec
  ): { options: PicklistOption[]; success?: boolean; isFallback?: boolean; warningBanner?: string; auditEvent?: any };
  normalizePicklistValue(value: string, fieldSpec?: DocumentFieldSpec | MinimalFieldSpec): string;
};

// Global Ambient Function Declarations
declare function buildIntakeCard(e: GoogleAppsScriptEvent, initialData?: ParsedData | null, flashMessage?: any, aiResult?: AiClassificationResult | null): GoogleAppsScript.Card_Service.Card;
declare function buildSuccessCard(fileId: string, newFileName: string, fileUrl: string, localPath: string, targetKey: string, itemTitle: string, discipline: string, section: string, specTag: string, targetFolderId: string, logFileId: string, isFiled?: boolean, projectAbbr?: string, action?: string, incomingRouting?: string, draftUrl?: string | null, directRowUrl?: string | null, failedColumns?: string[], emptyFallbacks?: string[]): GoogleAppsScript.Card_Service.Card;
declare function parseEmailData(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData;
declare function parseDriveFilename(filename: string): ParsedData;
declare function parseFormaEmail_(subject: string, body: string): Partial<ParsedData>;
declare function parseProcoreEmail_(subject: string, body: string): Partial<ParsedData>;
declare function fetchAndSaveFile(url: string, folderId: string): { success: boolean; error?: string; fileId?: string; fileName?: string };
declare function getBoundedData(logData: any[][]): any[][];
declare function getRowGroupKey(row: any[], discipline: string, headers: string[]): string;
declare function getRowSortKey(row: any[], discipline: string, headers: string[]): string;
declare function computeRowInsertionPlan(boundedData: any[][], headers: string[], rowData: any[], disciplineOrGroupKeyFn: string | RowKeyFn, sortKeyFn?: RowKeyFn): RowInsertionPlan;

/** Primitive reusable document transformation or operation step handler. */
interface DocumentAction<TInput = any, TOutput = any> {
  name?: string;
  execute(input: TInput): Promise<TOutput> | TOutput;
}

/** Input options for InsertPagesAction. */
interface InsertPagesInput {
  sourceBlob: GoogleAppsScript.Base.Blob;
  data: ParsedData;
  options: StampOptions;
  pdfDocumentService?: PdfDocumentService;
  pdfService?: PdfDocumentService;
  aiService?: AiAnalysisService;
  coverPageTemplateId?: string;
  analysis?: DeepAnalysisPrediction;
  analysisResult?: DeepAnalysisResult;
}


/** Input options for WriteLogAction. */
interface WriteLogInput {
  spreadsheetId: string;
  document: ValidatedDocument;
  strategy: DocumentLogStrategy;
  identityData?: IdentityData;
  options?: AppendDocumentOptions;
  logRepository?: LogRepository;
}



/** PDF stamping options. */
interface StampOptions {
  newFileName: string;
  stampSubmittalNo: string;
  templateId: string;
}

/** Supported execution environment context. */
type AppContext = "GoogleDrive" | "Gmail" | "GoogleSheets";

/** Input payload for PDF page extraction action. */
interface ExtractPagesInput {
  sourceBlob: GoogleAppsScript.Base.Blob;
  maxPages?: number;
}

/** Result payload produced by PDF page extraction action. */
interface ExtractPagesResult {
  blob: GoogleAppsScript.Base.Blob;
  base64: string;
}

/** Service interface for PDF stamping, page slicing, and form action extraction. */
interface PdfDocumentService {
  extractFormAction(fileId: string): Promise<string | null>;
  stampSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    data: ParsedData,
    options: StampOptions
  ): Promise<GoogleAppsScript.Base.Blob>;
  extractPages(
    sourceBlob: GoogleAppsScript.Base.Blob,
    maxPages?: number
  ): Promise<GoogleAppsScript.Base.Blob>;
  slicePagesToBase64(
    sourceBlob: GoogleAppsScript.Base.Blob,
    maxPages: number
  ): Promise<string>;
  mergeBlobsToPdf(
    blobs: GoogleAppsScript.Base.Blob[],
    newFileName?: string
  ): Promise<GoogleAppsScript.Base.Blob>;
}

/** Repository interface for Drive filing and local path resolution. */
interface DriveFilingRepository {
  getLocalPath(fileId: string): string;
  fileDocument(file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }, options: FilingOptions): FilingResult;
}

/** Provider interface for Shared Drive lists. */
interface DriveNameProvider {
  getAvailableDriveNames(): string[];
  getSharedDrives(): SharedDriveInfo[];
}

declare var defaultCardPresenter: CardPresenter;
declare function buildSuccessCard(...args: any[]): GoogleAppsScript.Card_Service.Card;
declare var defaultLogRepository: LogRepository;
declare var defaultDriveFilingRepository: DriveFilingRepository;
declare var defaultPdfDocumentService: PdfDocumentService;
declare var defaultAiAnalysisService: AiAnalysisService;
declare var defaultDriveNameProvider: DriveNameProvider;
/** Input payload for ReadLogAction. */
interface ReadLogInput {
  spreadsheetId: string;
  identityData?: IdentityData;
  document?: ValidatedDocument;
  strategy?: DocumentLogStrategy;
  sheetName?: string;
  updatePreviousStatus?: boolean;
  previousRowStatus?: string;
  logRepository?: LogRepository;
}

declare var defaultExtractPagesAction: ExtractPagesAction;

/** Input payload for AnalyzeDocumentAction. */
interface AnalyzeDocumentInput {
  sourceBlob: GoogleAppsScript.Base.Blob;
  emailText?: string;
  contextObj: DeepAnalysisContext;
  aiAnalysisService?: AiAnalysisService;
  cacheAdapter?: CacheAdapter;
  spreadsheetLockAdapter?: SpreadsheetLockAdapter;
  userInterfacePresenter?: UserInterfacePresenter;
  extractPagesAction?: ExtractPagesAction;
}

declare var defaultAnalyzeDocumentAction: AnalyzeDocumentAction;

/** Input payload for TriageDocumentAction. */
interface TriageDocumentInput {
  emailData: EmailData;
  messageId?: string;
  aiAnalysisService?: AiAnalysisService;
  cacheAdapter?: CacheAdapter;
  spreadsheetLockAdapter?: SpreadsheetLockAdapter;
  userInterfacePresenter?: UserInterfacePresenter;
}

declare var defaultTriageDocumentAction: TriageDocumentAction;
declare var defaultDuplicateDocumentAction: DuplicateDocumentAction;


declare function processSubmission(e: GoogleAppsScriptEvent): Promise<any>;

/** Policy detailing workflow actions (direction, stamping, subfolder rules). */
declare var getActionPolicy: (action: string) => WorkflowActionPolicy;
declare var getDocumentLogStrategy: (doc: ValidatedDocument) => DocumentLogStrategy;
declare var getDocumentTitle: (doc: ValidatedDocument) => string;
declare var buildDirectRowUrl: (logFileId: string, rowIndex: number, sheetId?: number | null, spreadsheetApp?: any) => string;

interface WorkflowActionPolicy {
  direction: "incoming" | "outgoing";
  stampPdf: boolean;
  updatePreviousStatus: boolean;
  previousRowStatus?: string;
}

/** Input object passed to DocumentWorkflowModule.executeWorkflow. */
interface DocumentWorkflowInput {
  appContext?: AppContext;
  validatedDoc: ValidatedDocument;
  logFileId: string;
  logSheetId?: number;
  sheetName?: string;
  targetFolderId: string;
  driveFileId?: string;
  blob?: GoogleAppsScript.Base.Blob;
  attachments?: GoogleAppsScript.Base.Blob[];
  fileSource?: string;
  messageId?: string;
  attachmentName?: string;
  driveFileUrl?: string;
  incomingRouting?: string;
  projectAbbr?: string;
  emptyFallbacks?: string[];
  selectedAction: { action: string; abbr: string; status: string };
  logRepository?: LogRepository;
  driveFilingRepository?: DriveFilingRepository;
  duplicateDocumentAction?: DuplicateDocumentAction;
  insertPagesAction?: InsertPagesAction;
  writeLogAction?: WriteLogAction;
  moveDocumentAction?: MoveDocumentAction;
  pdfDocumentService?: PdfDocumentService;
  strategy?: DocumentLogStrategy;
  driveApp?: any;
  gmailApp?: any;
  spreadsheetApp?: any;
}

/** Output result returned from DocumentWorkflowModule.executeWorkflow. */
interface DocumentWorkflowResult {
  fileId: string;
  targetKey: string;
  url: string;
  localPath: string;
  title: string;
  action: string;
  incomingRouting?: string;
  projectAbbr?: string;
  directRowUrl: string;
  failedColumns: string[];
  emptyFallbacks: string[];
  newFileName: string;
}




/** Configuration schema encapsulating document-type specific rules, search criteria, and adapter selection keys. */
/** Property schema defining a single document field specification for UI, validation, and log row formatting. */
/** Hydration options for 5-tier state resolution. */
interface HydrationContext {
  formInput?: Record<string, any>;
  userCacheDraft?: Record<string, any>;
  parserResult?: Record<string, any>;
  aiMetadata?: Record<string, any>;
  spreadsheet?: unknown;
  docTypeKey?: string;
  activeSheetName?: string;
}

/** Validation and AI confidence UI context for dynamic field formatting. */
interface ValidationUIContext {
  aiResult?: AiClassificationResult;
  missingFields?: string[];
  fieldConfidence?: Record<string, number>;
  onStateActionName?: string;
  actionParams?: Record<string, string>;
}

interface PicklistOption {
  label: string;
  value: string;
}

interface MinimalFieldSpec {
  key: string;
  label?: string;
  optionsRange?: string;
  options?: PicklistOption[];
  keyNormalizationRule?: 'picklist' | 'code' | 'exact';
}



interface DocumentFieldSpec {
  key: string;
  numberFormat?: string;
  label: string;
  type: 'string' | 'multiline' | 'date' | 'list' | 'enum';
  required?: boolean;
  description?: string;
  defaultValue?: string;
  isCalculated?: boolean;
  optionsRange?: string;
  options?: PicklistOption[];
  keyNormalizationRule?: 'picklist' | 'code' | 'exact';
  header?: string;
  formulaOrFunction?: string;
}

interface DocumentTypeConfig {
  documentType: 'Submittal' | 'RFI' | string;
  displayName?: string;
  targetTab?: string;
  rootFolderSearchTerms: string[];
  projectSearchTerms?: string[];
  closedRootFolderName: string;
  closedSubfolderMap?: Record<string, string>;
  filenamePrefix: string;
  coverPageTemplateId?: string;
  logSearchTerms: string[];
  logSheetName: string;
  logParentFolderTerms?: string[];
  logAdapterKey: string;
  filingAdapterKey: string;
  pdfAdapterKey?: string;
  aiAdapterKey?: string;
  fields?: DocumentFieldSpec[];
    logStrategy?: any;
  validateHook?: (rawDoc: RawDocument, context?: ValidationContext) => ValidationResult | void;
}

interface ContextAdapters {
  logRepository?: LogRepository;
  driveFilingRepository?: DriveFilingRepository;
  pdfDocumentService?: PdfDocumentService;
  aiAnalysisService?: AiAnalysisService;
  cacheAdapter?: CacheAdapter;
  spreadsheetLockAdapter?: SpreadsheetLockAdapter;
  userInterfacePresenter?: UserInterfacePresenter;
  [key: string]: any;
}

/** Execution context passed through action pipeline steps. */
interface DocumentActionContext<TDoc extends ValidatedDocument = ValidatedDocument> {
  document?: TDoc;
  appContext?: AppContext;
  fileId?: string;
  blob?: GoogleAppsScript.Base.Blob;
  validatedDoc?: TDoc;
  config?: DocumentTypeConfig;
  targetFolderId?: string;
  subfolderPath?: string[];
  newFileName?: string;
  url?: string;
  localPath?: string;
  folderId?: string;
  adapters?: ContextAdapters;
  aiAnalysisService?: AiAnalysisService;
  cacheAdapter?: CacheAdapter;
  spreadsheetLockAdapter?: SpreadsheetLockAdapter;
  userInterfacePresenter?: UserInterfacePresenter;
  driveFilingRepository?: DriveFilingRepository;
  logRepository?: LogRepository;
  pdfDocumentService?: PdfDocumentService;
  driveApp?: any;
  gmailApp?: any;
  spreadsheetApp?: any;
  strategy?: DocumentLogStrategy;
  selectedAction?: { action: string; abbr: string; status: string };
  incomingRouting?: string;
  projectAbbr?: string;
  emptyFallbacks?: string[];
  [key: string]: any;
}

// Global declaration for pdf-lib evaluated at runtime
declare const PDFLib: any;




interface PicklistResolveResult {
  options: PicklistOption[];
  success: boolean;
  isFallback: boolean;
  warningBanner?: string;
  auditEvent?: { eventType: string; details: string };
}

