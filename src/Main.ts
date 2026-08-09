declare var GasSpreadsheetLockAdapter: any;
declare var LogMigrationEngine: any;
declare var BatchMigrationEngine: any;
declare var GasTimeoutBudget: any;

/**
 * @file Main.ts
 * @description Primary Google Apps Script entry points for the Workspace Add-on.
 * Serves contextual trigger callbacks for Gmail message views and Google Drive file selections,
 * delegating intake parsing to DocumentPipeline and rendering the main user interface.
 */

declare var defaultAiAnalysisService: AiAnalysisService;

/**
 * Contextual trigger entry point invoked by Google Workspace when an email is opened in Gmail.
 *
 * Extracts the message context, parses email attributes via DocumentPipeline, executes optional AI triage
 * for discipline and project prediction, and constructs the primary add-on UI card.
 *
 * @param e - The Google Apps Script event object containing Gmail context (message ID, access token).
 * @returns A Promise resolving to the rendered CardService.Card UI.
 */
async function buildAddOn(e: GoogleAppsScriptEvent): Promise<GoogleAppsScript.Card_Service.Card> {
  const messageId = e.gmail ? e.gmail.messageId : "";
  const accessToken = e.gmail ? e.gmail.accessToken : "";
  if (accessToken && typeof GmailApp !== "undefined" && GmailApp.setCurrentMessageAccessToken) {
    GmailApp.setCurrentMessageAccessToken(accessToken);
  }
  const message = messageId && typeof GmailApp !== "undefined" && GmailApp.getMessageById ? GmailApp.getMessageById(messageId) : null;
  const parsedData = DocumentPipeline.parseEmail(message);

  let flashMessage: FlashMessage | null = null;

  if (message) {
    const thread = message.getThread ? message.getThread() : null;
    const labels = thread && thread.getLabels ? thread.getLabels().map((l: any) => l.getName()) : [];

    const emailData: EmailData = {
      subject: message.getSubject ? message.getSubject() : "",
      sender: message.getFrom ? message.getFrom() : "",
      replyTo: message.getReplyTo ? message.getReplyTo() : "",
      to: message.getTo ? message.getTo() : "",
      cc: message.getCc ? message.getCc() : "",
      labels: labels,
      attachmentNames: message.getAttachments ? message.getAttachments().map((a: any) => a.getName()) : [],
      body: message.getPlainBody ? message.getPlainBody() : ""
    };

    const triageAction = (typeof defaultTriageDocumentAction !== "undefined" && defaultTriageDocumentAction)
      ? defaultTriageDocumentAction
      : ((globalThis as any).defaultTriageDocumentAction || (function() {
          try { return require("./TriageDocumentAction").defaultTriageDocumentAction; }
          catch(e) { return new TriageDocumentAction(); }
        })());

    if (triageAction && typeof triageAction.execute === "function") {
      const triageResult = await triageAction.execute({ emailData, messageId });

      if (triageResult.success) {
        const pred = triageResult.prediction;
        if (pred) {
          parsedData.driveName = pred.predictedProjectName || parsedData.driveName || "";

          // --- Strict Validation & Config Fallback ---
          if (pred.predictedDiscipline && CONFIG.SUPPORTED_DISCIPLINES.includes(pred.predictedDiscipline)) {
            parsedData.discipline = pred.predictedDiscipline;
          } else {
            parsedData.discipline = CONFIG.DEFAULT_DISCIPLINE;
          }
          // ------------------------------------------
        }
      } else if (triageResult.error) {
        flashMessage = { warning: triageResult.error.userMessage };
        parsedData.discipline = CONFIG.DEFAULT_DISCIPLINE;
      }
    }
  }

  return buildMainCard(e, parsedData, false, flashMessage);
}

/**
 * Contextual trigger entry point invoked by Google Workspace when items are selected in Google Drive.
 *
 * Validates that exactly one single PDF file is selected, parses document metadata from its filename,
 * extracts form field action metadata if present, and constructs the primary add-on UI card.
 *
 * @param e - The Google Apps Script event object containing Google Drive selection context.
 * @returns A Promise resolving to the rendered CardService.Card UI (or an error card if selection is invalid).
 */
async function onDriveItemsSelected(e: GoogleAppsScriptEvent): Promise<GoogleAppsScript.Card_Service.Card> {
  const items = e.drive ? e.drive.selectedItems : [];

  if (items.length !== 1 || items[0].mimeType !== 'application/pdf') {
    return CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle(MESSAGES.ERROR_INVALID_SELECTION_TITLE))
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText(MESSAGES.ERROR_INVALID_SELECTION_TEXT)))
      .build();
  }

  const fileId = items[0].id;
  const fileName = items[0].title;
  const parsedData = DocumentPipeline.parseFilename(fileName);

  try {
    const fileMeta = (Drive as any).Files.get(fileId, { supportsAllDrives: true });
    if (fileMeta.driveId) parsedData.driveId = fileMeta.driveId;
  } catch (err) { }

  const actionFromPdf = await defaultPdfDocumentService.extractFormAction(fileId);
  if (actionFromPdf) parsedData.action = actionFromPdf;

  e.parameters = e.parameters || {};
  e.parameters.driveFileId = fileId;

  return buildMainCard(e, parsedData);
}

/**
 * Admin entry point function for single-workbook log migration.
 * Runs Pass 1 dry-run audit or Pass 2 execution under transaction lock safety.
 */
function migrateLogSpreadsheet(
  sourceSpreadsheetId: string,
  targetSpreadsheetId: string,
  options?: {
    dryRun?: boolean;
    tabName?: string;
    storageAdapter?: any;
    sourceStorageAdapter?: any;
    targetStorageAdapter?: any;
    lockAdapter?: any;
  }
): any {
  const targetId = targetSpreadsheetId || sourceSpreadsheetId;
  const lockAdapter = options?.lockAdapter || (
    (typeof GasSpreadsheetLockAdapter !== "undefined")
      ? new (GasSpreadsheetLockAdapter as any)()
      : undefined
  );

  const targetStorage = options?.targetStorageAdapter || options?.storageAdapter || (
    (typeof GoogleSheetsStorageAdapter !== "undefined")
      ? new (GoogleSheetsStorageAdapter as any)(targetId)
      : undefined
  );

  const sourceStorage = options?.sourceStorageAdapter || (
    sourceSpreadsheetId === targetId
      ? targetStorage
      : ((typeof GoogleSheetsStorageAdapter !== "undefined")
          ? new (GoogleSheetsStorageAdapter as any)(sourceSpreadsheetId)
          : targetStorage)
  );

  if (!targetStorage) {
    throw new Error("StorageAdapterException: GoogleSheetsStorageAdapter is unavailable in host environment.");
  }

  const engine = new LogMigrationEngine(targetStorage, lockAdapter);
  const isDryRun = options?.dryRun !== false;
  const targetTab = options?.tabName || "Submittal Arch";

  const fieldSpecs: DocumentFieldSpec[] = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string", isCalculated: false },
    { key: "submittalTitle", header: "Title", label: "Title", type: "string", isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string", isCalculated: true }
  ];

  if (isDryRun) {
    return engine.executeDryRun(targetId, targetTab, fieldSpecs, {
      targetTabName: targetTab,
      sourceStorageAdapter: sourceStorage
    });
  }

  return engine.executeLiveMigration(targetId, targetTab, fieldSpecs, {
    targetTabName: targetTab,
    sourceStorageAdapter: sourceStorage,
    sourceSpreadsheetId
  });
}

/**
 * Admin entry point function for multi-workbook batch migration.
 * Discovers target workbooks or receives a list of spreadsheet IDs, enforces 270s quota timekeeper,
 * handles transactional rollback on mid-write timeout, and schedules continuation triggers.
 */
function migrateBatchLogSpreadsheets(
  spreadsheetIds?: string[],
  options?: {
    batchId?: string;
    dryRun?: boolean;
    getStorageAdapter?: (id: string) => any;
    lockAdapter?: any;
    manifestRepo?: any;
    timekeeper?: any;
    triggerAdapter?: any;
  }
): any {
  const batchId = options?.batchId || "batch_" + Date.now();
  const lockAdapter = options?.lockAdapter || (
    (typeof GasSpreadsheetLockAdapter !== "undefined")
      ? new (GasSpreadsheetLockAdapter as any)()
      : undefined
  );

  const getStorage = options?.getStorageAdapter || ((id: string) => {
    if (typeof GoogleSheetsStorageAdapter !== "undefined") {
      return new (GoogleSheetsStorageAdapter as any)(id);
    }
    throw new Error("StorageAdapterException: GoogleSheetsStorageAdapter unavailable.");
  });

  const manifestRepo = options?.manifestRepo || {
    manifestData: null,
    getManifest() { return this.manifestData; },
    saveManifest(m: any) { this.manifestData = m; }
  };

  const timekeeper = options?.timekeeper || (
    (typeof GasTimeoutBudget !== "undefined")
      ? new (GasTimeoutBudget as any)(270000)
      : undefined
  );

  const triggerAdapter = options?.triggerAdapter || {
    scheduleContinuationTrigger(delaySec: number) {
      if (typeof ScriptApp !== "undefined" && ScriptApp.newTrigger) {
        const trigger = ScriptApp.newTrigger("onBatchMigrationContinuationTrigger")
          .timeBased()
          .after(delaySec * 1000)
          .create();
        return trigger.getUniqueId();
      }
      return null;
    },
    deleteContinuationTrigger(triggerId: string) {
      if (typeof ScriptApp !== "undefined" && ScriptApp.getProjectTriggers) {
        const triggers = ScriptApp.getProjectTriggers();
        for (const t of triggers) {
          if (t.getUniqueId() === triggerId) {
            ScriptApp.deleteTrigger(t);
          }
        }
      }
    }
  };

  const BatchEngineClass = (globalThis as any).BatchMigrationEngine || BatchMigrationEngine;
  const engine = new BatchEngineClass(
    getStorage,
    manifestRepo,
    lockAdapter,
    timekeeper,
    triggerAdapter
  );

  const targets = (spreadsheetIds && spreadsheetIds.length > 0)
    ? spreadsheetIds.map(id => ({ spreadsheetId: id, spreadsheetName: "Workbook " + id, targetTabName: "Submittal Arch Log" }))
    : [
        { spreadsheetId: "1WB_DISCOVERED_1", spreadsheetName: "Discovered Log 1", targetTabName: "Submittal Arch Log" }
      ];

  const manifest = engine.initializeBatch(batchId, targets);

  const fieldSpecs: DocumentFieldSpec[] = [
    { key: "specSection", header: "Spec Section", label: "Spec Section", type: "string" as const, isCalculated: false },
    { key: "title", header: "Title", label: "Title", type: "string" as const, isCalculated: false },
    { key: "daysOpen", header: "Days Open", label: "Days Open", type: "string" as const, isCalculated: true }
  ];

  return engine.runBatch(manifest, fieldSpecs);
}

/**
 * Continuation trigger handler invoked automatically by ScriptApp when a batch migration is paused due to timeout.
 */
function onBatchMigrationContinuationTrigger(e: any): void {
  const triggerId = e && e.triggerUid ? e.triggerUid : undefined;
  if (triggerId && typeof ScriptApp !== "undefined" && ScriptApp.getProjectTriggers) {
    const triggers = ScriptApp.getProjectTriggers();
    for (const t of triggers) {
      if (t.getUniqueId() === triggerId) {
        ScriptApp.deleteTrigger(t);
      }
    }
  }
  migrateBatchLogSpreadsheets();
}


/**
 * Global GAS entry point to execute Phase 2 cross-log reference scanning and cell hyperlink repair.
 */
function repairCrossLogReferences(batchId?: string): any {
  const StorageClass = (globalThis as any).GoogleSheetsStorageAdapter || (typeof GoogleSheetsStorageAdapter !== "undefined" ? GoogleSheetsStorageAdapter : eval("require")("./SheetStorageAdapter").GoogleSheetsStorageAdapter);
  const storageMap = new Map<string, any>();
  const getStorage = (id: string) => {
    if (!storageMap.has(id)) {
      storageMap.set(id, new StorageClass(id));
    }
    return storageMap.get(id)!;
  };

  let inMemoryManifest: any = null;
  const manifestRepo = {
    getManifest: () => {
      if (inMemoryManifest) return inMemoryManifest;
      if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
        const json = PropertiesService.getScriptProperties().getProperty("MIGRATION_BATCH_MANIFEST");
        if (json) {
          try { return JSON.parse(json); } catch (_e) {}
        }
      }
      return null;
    },
    saveManifest: (manifest: any) => {
      inMemoryManifest = manifest;
      if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
        PropertiesService.getScriptProperties().setProperty("MIGRATION_BATCH_MANIFEST", JSON.stringify(manifest));
      }
    }
  };

  const BatchEngineClass = (globalThis as any).BatchMigrationEngine || (typeof BatchMigrationEngine !== "undefined" ? BatchMigrationEngine : eval("require")("./core/log/BatchMigrationEngine").BatchMigrationEngine);
  const engine = new BatchEngineClass(getStorage, manifestRepo);

  const existingManifest = manifestRepo.getManifest();
  if (existingManifest) {
    return engine.runBatch(existingManifest);
  }

  const targetBatchId = batchId || "batch-" + new Date().getTime();
  const defaultTargets = [
    { spreadsheetId: "1WB_DISCOVERED_1", spreadsheetName: "Discovered Log 1", targetTabName: "Submittal Arch Log" }
  ];
  const newManifest = engine.initializeBatch(targetBatchId, defaultTargets);
  return engine.runBatch(newManifest);
}


declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    onDriveItemsSelected,
    buildAddOn,
    migrateLogSpreadsheet,
    migrateBatchLogSpreadsheets,
    onBatchMigrationContinuationTrigger,
    repairCrossLogReferences
  };
}

(globalThis as any).migrateLogSpreadsheet = migrateLogSpreadsheet;
(globalThis as any).migrateBatchLogSpreadsheets = migrateBatchLogSpreadsheets;
(globalThis as any).onBatchMigrationContinuationTrigger = onBatchMigrationContinuationTrigger;
(globalThis as any).repairCrossLogReferences = repairCrossLogReferences;
