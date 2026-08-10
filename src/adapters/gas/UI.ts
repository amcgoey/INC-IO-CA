
import { defaultAnalyzeDocumentAction } from "../../AnalyzeDocumentAction";
import { defaultDocumentTypeConfigRegistry, resolve5TierFieldValue } from "../../DocumentTypeConfigRegistry";
import { MESSAGES, CONFIG } from "../../Config";
import { defaultLogRepository } from "../../GoogleSheetsLogRepository";
import { defaultCardPresenter } from "./CardPresenter";
import { defaultDriveNameProvider } from "../../GoogleDriveNameProvider";
import { FieldConfidenceThreshold } from "../../core/interfaces/AiAnalysisService";

/**
 * Helper to append ⚠ Check Value label indicator when field confidence is below threshold (< 0.85).
 */
function getWidgetTitle(key: string, baseTitle: string, fieldConfidence: Record<string, number> = {}): string {
  const threshold = typeof FieldConfidenceThreshold !== "undefined" ? FieldConfidenceThreshold : 0.85;
  const conf = fieldConfidence ? fieldConfidence[key] : undefined;
  if (conf !== undefined && conf < threshold) {
    return baseTitle.includes("Check Value") ? baseTitle : baseTitle + " ⚠ Check Value";
  }
  return baseTitle;
}


function formatGasDate(d: any): string {
  try {
    const tz = (typeof Session !== "undefined" && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : ((globalThis as any).Session?.getScriptTimeZone() || "America/New_York");
    if (typeof Utilities !== "undefined" && Utilities.formatDate) {
      return Utilities.formatDate(d, tz, "yyMMdd");
    }
    if ((globalThis as any).Utilities?.formatDate) {
      return (globalThis as any).Utilities.formatDate(d, tz, "yyMMdd");
    }
  } catch (e) {}
  return d && d.toISOString ? d.toISOString().slice(2, 10).replace(/-/g, "") : "260726";
}

/**
 * Dynamically renders form input widgets into a Google Apps Script CardSection driven by DocumentFieldSpec[].
 *
 * Rules:
 * 1. Fields with isCalculated === true are EXCLUDED from form input widget generation.
 * 2. Field values hydrate via strict 5-tier state hierarchy (Form Inputs -> User Cache Draft -> Parser Result -> AI Metadata -> Field Default / "").
 * 3. string fields render as standard single-line CardService.newTextInput().
 * 4. multiline fields render as CardService.newTextInput().setMultiline(true).
 * 5. Title formatting:
 *    - Missing required fields (field.required === true && missingFields.includes(field.key)): prefixed with "❌ ".
 *    - Low AI confidence (< 0.85): prefixed with "⚠️ " and hint set to "Low AI confidence (X%) — please verify".
 *    - Default: Normal label, hint set to field.description if available.
 */
function renderDynamicFormFields(
  section: GoogleAppsScript.Card_Service.CardSection,
  fields: DocumentFieldSpec[],
  hydrationContext: HydrationContext = {},
  validationContext: ValidationUIContext = {}
): void {
  if (!section || !fields || fields.length === 0) return;

  const { missingFields = [], fieldConfidence = {}, onStateActionName = "onStateChange", actionParams = {} } = validationContext;

  const resolveValue = (globalThis as any).resolve5TierFieldValue || resolve5TierFieldValue;

  fields.forEach(field => {
    // Rule 1: Exclude calculated fields
    if (field.isCalculated === true) {
      return;
    }

    // Rule 2: 5-tier state hydration
    const hydratedValue = resolveValue ? resolveValue(field, hydrationContext) : (field.defaultValue !== undefined ? field.defaultValue : '');

    // Rule 5: Formatting title and hints
    const cp = (globalThis as any).defaultCardPresenter || (typeof defaultCardPresenter !== "undefined" ? defaultCardPresenter : null);
    let displayTitle = field.label || field.key;
    let hintText = field.description || "";

    if (cp && typeof cp.formatFieldTitleAndHint === "function") {
      const formatted = cp.formatFieldTitleAndHint(field, missingFields, fieldConfidence);
      displayTitle = formatted.displayTitle;
      hintText = formatted.hintText;
    } else {
      const isMissing = field.required && missingFields.includes(field.key);
      const confidence = fieldConfidence[field.key];
      const threshold = typeof FieldConfidenceThreshold !== "undefined" ? FieldConfidenceThreshold : 0.85;
      const isLowConfidence = confidence !== undefined && confidence < threshold;

      if (isMissing) {
        displayTitle = `❌ ${displayTitle}`;
      } else if (isLowConfidence) {
        displayTitle = getWidgetTitle(field.key, `⚠️ ${displayTitle}`, fieldConfidence);
      }

      if (isLowConfidence && !isMissing) {
        const pct = Math.round(confidence * 100);
        hintText = `Low AI confidence (${pct}%) — please verify`;
      }
    }

    displayTitle = getWidgetTitle(field.key, displayTitle, fieldConfidence);

    // Special Field Handling for Contact
    if (field.key === 'contact') {
      const conDrop = CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setTitle(displayTitle)
        .setFieldName("contact");

      const logSettings = hydrationContext.logSettings || {};
      const contactsList = (logSettings.contacts && logSettings.contacts.length > 0)
        ? logSettings.contacts
        : [
            { abbr: "ARCH", name: "Architect" },
            { abbr: "GC", name: "General Contractor" },
            { abbr: "CLIENT", name: "Client" },
            { abbr: "MEP", name: "MEP Engineer" },
            { abbr: "STR", name: "Structural Engineer" }
          ];

      let selectedFound = false;
      contactsList.forEach((c: any) => {
        const isSelected = String(hydratedValue) === String(c.abbr);
        if (isSelected) selectedFound = true;
        conDrop.addItem(`${c.abbr} - ${c.name}`, c.abbr, isSelected);
      });

      if (hydratedValue && !selectedFound) {
        conDrop.addItem(String(hydratedValue), String(hydratedValue), true);
      }

      if (onStateActionName) {
        conDrop.setOnChangeAction(
          CardService.newAction().setFunctionName(onStateActionName).setParameters(actionParams)
        );
      }
      section.addWidget(conDrop);
      return;
    }

    // Special Field Handling for Action
    if (field.key === 'action') {
      const actDrop = CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setTitle(displayTitle)
        .setFieldName("action");

      const logSettings = hydrationContext.logSettings || {};
      const actionsList = (logSettings.actions && logSettings.actions.length > 0)
        ? logSettings.actions
        : [
            { action: "Received", abbr: "REC", status: "Incoming" },
            { action: "Reviewed", abbr: "REV", status: "Outgoing" },
            { action: "Referred", abbr: "REF", status: "Outgoing" },
            { action: "Rejected", abbr: "REJ", status: "Outgoing" }
          ];

      actDrop.addItem("", "", !hydratedValue);

      let selectedFound = false;
      actionsList.forEach((a: any) => {
        const isSelected = String(hydratedValue) === String(a.action);
        if (isSelected) selectedFound = true;
        actDrop.addItem(a.action, a.action, isSelected);
      });

      if (hydratedValue && !selectedFound) {
        actDrop.addItem(String(hydratedValue), String(hydratedValue), true);
      }

      if (onStateActionName) {
        actDrop.setOnChangeAction(
          CardService.newAction().setFunctionName(onStateActionName).setParameters(actionParams)
        );
      }
      section.addWidget(actDrop);
      return;
    }

    // Special Field Handling for Incoming Routing
    if (field.key === 'incomingRouting') {
      const currentAction = hydrationContext.formInput?.action || hydrationContext.state?.action || hydrationContext.userCacheDraft?.action || hydrationContext.parserResult?.action || hydrationContext.aiMetadata?.action || "";
      const logSettings = hydrationContext.logSettings || {};
      const actionsList = (logSettings.actions && logSettings.actions.length > 0)
        ? logSettings.actions
        : [
            { action: "Received", abbr: "REC", status: "Incoming" }
          ];

      const isIncomingAction = currentAction === "Received" ||
        actionsList.some((a: any) => (a.action === currentAction || a.abbr === currentAction) && a.action === "Received");

      if (!isIncomingAction) {
        return; // Omit Incoming Routing when Action is not Received/Incoming
      }

      const routingDrop = CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setTitle(displayTitle)
        .setFieldName("incomingRouting");

      const isRefer = String(hydratedValue) === "To Refer";
      routingDrop.addItem("To Review", "To Review", !isRefer);
      routingDrop.addItem("To Refer", "To Refer", isRefer);

      if (onStateActionName) {
        routingDrop.setOnChangeAction(
          CardService.newAction().setFunctionName(onStateActionName).setParameters(actionParams)
        );
      }
      section.addWidget(routingDrop);
      return;
    }

    // Special Field Handling for Date
    if (field.key === 'date') {
      const dateVal = String(hydratedValue || formatGasDate(new Date()));
      const dateWidget = CardService.newTextInput()
        .setFieldName("date")
        .setTitle(displayTitle || "Date")
        .setValue(dateVal);

      if (typeof (dateWidget as any).setHint === "function") {
        (dateWidget as any).setHint(hintText || "Date (YYMMDD)");
      }

      if (onStateActionName) {
        dateWidget.setOnChangeAction(
          CardService.newAction().setFunctionName(onStateActionName).setParameters(actionParams)
        );
      }
      section.addWidget(dateWidget);
      return;
    }

    // Widget Generation based on Field Type
    if (field.type === 'list' || field.type === 'enum') {
      const dropdownWidget = CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setFieldName(field.key)
        .setTitle(displayTitle);

      let optionsList: PicklistOption[] = field.options || [];

      if (field.optionsRange) {
        const ss = hydrationContext.spreadsheet || (typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp.getActiveSpreadsheet() : null);
        const docTypeKey = hydrationContext.docTypeKey || "Submittal_Arch";
        const activeSheetName = hydrationContext.activeSheetName || "Submittal Arch";

        const resolvedResult = PicklistResolver.resolvePicklistOptionsRange(field.optionsRange, ss, docTypeKey, activeSheetName, field);
        optionsList = resolvedResult.options || optionsList;
        if (resolvedResult.warningBanner) {
          section.addWidget(
            CardService.newTextParagraph().setText(resolvedResult.warningBanner)
          );
        }
        if (resolvedResult.auditEvent && typeof Logger !== "undefined" && Logger.log) {
          Logger.log(`[AuditLog] ${resolvedResult.auditEvent.eventType}: ${resolvedResult.auditEvent.details}`);
        }
      }

      if (optionsList.length === 0) {
        dropdownWidget.addItem("-- None --", "", true);
      } else {
        optionsList.forEach(opt => {
          const isSelected = String(opt.value) === String(hydratedValue) || String(opt.label) === String(hydratedValue);
          dropdownWidget.addItem(opt.label || opt.value, opt.value, isSelected);
        });
      }

      if (onStateActionName) {
        dropdownWidget.setOnChangeAction(
          CardService.newAction()
            .setFunctionName(onStateActionName)
            .setParameters(actionParams)
        );
      }

      section.addWidget(dropdownWidget);
      return;
    }

    if (field.type === 'date') {
      let dateWidget: GoogleAppsScript.Card_Service.Widget | null = null;
      if (typeof CardService !== "undefined" && typeof CardService.newDatePicker === "function") {
        const picker = CardService.newDatePicker()
          .setFieldName(field.key)
          .setTitle(displayTitle);

        if (hydratedValue) {
          let epochMs: number | null = null;
          if (typeof hydratedValue === "number") {
            epochMs = hydratedValue;
          } else if (typeof hydratedValue === "string") {
            if (/^\d{6}$/.test(hydratedValue)) {
              const yy = parseInt(hydratedValue.slice(0, 2), 10);
              const mm = parseInt(hydratedValue.slice(2, 4), 10) - 1;
              const dd = parseInt(hydratedValue.slice(4, 6), 10);
              const year = 2000 + yy;
              epochMs = new Date(year, mm, dd).getTime();
            } else if (!isNaN(Date.parse(hydratedValue))) {
              epochMs = Date.parse(hydratedValue);
            }
          }
          if (epochMs !== null && typeof picker.setValueInMsSinceEpoch === "function") {
            picker.setValueInMsSinceEpoch(epochMs);
          }
        }
        dateWidget = picker;
      } else {
        // Fallback to TextInput if DatePicker not available
        dateWidget = CardService.newTextInput()
          .setFieldName(field.key)
          .setTitle(displayTitle)
          .setValue(hydratedValue);
        if (!hintText) hintText = "Date (YYMMDD)";
      }

      if (hintText && dateWidget && typeof (dateWidget as any).setHint === "function") {
        (dateWidget as any).setHint(hintText);
      }

      if (onStateActionName && dateWidget && typeof (dateWidget as any).setOnChangeAction === "function") {
        (dateWidget as any).setOnChangeAction(
          CardService.newAction()
            .setFunctionName(onStateActionName)
            .setParameters(actionParams)
        );
      }

      if (dateWidget) {
        section.addWidget(dateWidget);
      }
      return;
    }

    // Default string / multiline TextInput
    const inputWidget = CardService.newTextInput()
      .setFieldName(field.key)
      .setTitle(displayTitle)
      .setValue(hydratedValue);

    if (field.type === 'multiline') {
      inputWidget.setMultiline(true);
    }

    if (hintText && typeof inputWidget.setHint === "function") {
      inputWidget.setHint(hintText);
    }

    if (onStateActionName) {
      inputWidget.setOnChangeAction(
        CardService.newAction()
          .setFunctionName(onStateActionName)
          .setParameters(actionParams)
      );
    }

    section.addWidget(inputWidget);
  });
}



/**
 * Action handler for clearing cached user data (Shared Drives, Log Search, Log Settings)
 * and triggering a UI card reload via CardPresenter.
 *
 * @param e - Google Apps Script event object containing action parameters.
 * @returns ActionResponse updating the Card interface.
 */
function handleRefreshCache(e: GoogleAppsScriptEvent): GoogleAppsScript.Card_Service.ActionResponse {
  const cache = CacheService.getUserCache();
  const keysToClear = ["cached_shared_drives"];

  const p = e.parameters || {};
  
  if (p.driveId) keysToClear.push(`log_search_${p.driveId}`);
  if (p.logFileId) {
    keysToClear.push(`log_settings_${p.logFileId}_Architecture`);
    keysToClear.push(`log_settings_${p.logFileId}_FF&E`);
  }

  if (cache) cache.removeAll(keysToClear);

  return defaultCardPresenter.presentCacheRefresh(e);
}

/**
 * Action handler for initiating AI submittal analysis on an attachment or Drive file blob.
 * Extracts context and invokes `AiAnalysisService` to predict metadata.
 *
 * @param e - Google Apps Script event object containing parameters and form inputs.
 * @returns A Promise resolving to an ActionResponse presenting the AI analysis results.
 */
async function handleDeepAnalysis(e: GoogleAppsScriptEvent): Promise<GoogleAppsScript.Card_Service.ActionResponse> {
  const p = e.parameters || {};
  const form = e.formInput || {};

  if (form.fileSource && form.fileSource.startsWith("http") && form.fileSource !== form.driveFileUrl) {
    return defaultCardPresenter.presentNotification("⚠️ Please click 'Fetch & Save to Drive' before analyzing.");
  }

  let sourceBlob: GoogleAppsScript.Base.Blob | null = null;
  try {
    if (form.fileSource === "Email Attachment") {
      if (!form.attachmentName) return defaultCardPresenter.presentNotification(MESSAGES.ERROR_NO_ATTACHMENT);
      const msg = GmailApp.getMessageById(p.messageId);
      const att = msg.getAttachments().find(a => a.getName() === form.attachmentName);
      if (att) sourceBlob = att.copyBlob();
    } else if (form.fileSource === "Google Drive URL") {
      if (!form.driveFileUrl) return defaultCardPresenter.presentNotification(MESSAGES.ERROR_NO_URL);
      const match = form.driveFileUrl.match(/[-\w]{25,}/);
      if (match) sourceBlob = DriveApp.getFileById(match[0]).getBlob();
    } else {
      const fId = p.driveFileId || form.driveFileId;
      if (fId) sourceBlob = DriveApp.getFileById(fId).getBlob();
    }
  } catch (err: any) {
    return defaultCardPresenter.presentNotification(MESSAGES.ERROR_GETTING_FILE(err.message));
  }

  if (!sourceBlob) return defaultCardPresenter.presentNotification(MESSAGES.ERROR_RESOLVING_FILE);

  let emailText = "";
  if (p.messageId) {
     try {
       const msg = GmailApp.getMessageById(p.messageId);
       emailText = `Subject: ${msg.getSubject()}\nSender: ${msg.getFrom()}\nBody: ${msg.getPlainBody().substring(0, 1000)}`;
     } catch (err) {}
  }

  const logRepo = (globalThis as any).defaultLogRepository || defaultLogRepository;
  const logSettings = logRepo.getLogSettings(p.logFileId, p.discipline);
  const contextObj = { contacts: logSettings.contacts, actions: logSettings.actions };
  const analyzeAction = defaultAnalyzeDocumentAction;
  const result = await analyzeAction.execute({ sourceBlob, emailText, contextObj });
  
  return defaultCardPresenter.presentDeepAnalysisResult(e, result.analysisResult || result);
}

/**
 * Action handler to download a file from an external URL and save it to the project's target Google Drive folder.
 *
 * @param e - Google Apps Script event object containing URL and target folder parameters.
 * @returns ActionResponse updating the card with the saved file context.
 */
function handleFetchUrl(e: GoogleAppsScriptEvent): GoogleAppsScript.Card_Service.ActionResponse {
  const p = e.parameters || {};
  if (!p.targetFolderId) return defaultCardPresenter.presentNotification(MESSAGES.ERROR_TARGET_FOLDER);
  const result = fetchAndSaveFile(p.url, p.targetFolderId);
  if (!result.success) {
    let msg = MESSAGES.ERROR_FETCH_FAILED(result.error);
    if (result.error === "AUTH_WALL") msg = MESSAGES.WARNING_AUTH_WALL;
    else if (result.error === "NOT_WHITELISTED") msg = MESSAGES.WARNING_NOT_WHITELISTED;
    return defaultCardPresenter.presentFetchUrlResult(e, { warning: msg }, msg);
  }
  const flashMessage = { debugPhase2: MESSAGES.DEBUG_SAVED_TO_DRIVE(result.fileName || "", result.fileId || ""), newDriveFileId: result.fileId };
  e.formInput = e.formInput || {};
  e.formInput.fileSource = "Selected Drive File";
  e.formInput.driveFileId = result.fileId || "";
  return defaultCardPresenter.presentFetchUrlResult(e, flashMessage, MESSAGES.SUCCESS_FETCHED);
}

/**
 * Builds the success result UI card displayed after filing and logging a submittal document.
 * Includes direct links to Drive files, local G:\ drive paths, spreadsheet log links, and email draft actions.
 *
 * @param fileId - Stamped/filed Google Drive file ID.
 * @param newFileName - Formatted destination filename.
 * @param fileUrl - Google Drive file Web view URL.
 * @param localPath - Local Windows G:\ drive file path.
 * @param targetKey - Document target identifier (e.g. Submittal number or Spec tag).
 * @param itemTitle - Submittal or spec item title.
 * @param discipline - Architectural or FF&E discipline string.
 * @param section - Specification section.
 * @param specTag - FF&E Spec tag.
 * @param targetFolderId - Destination Google Drive folder ID.
 * @param logFileId - Spreadsheet log file ID.
 * @param isFiled - Flag indicating if physical file has been moved to closed folder.
 * @param projectAbbr - Project abbreviation code.
 * @param action - Executed workflow action string.
 * @param incomingRouting - Routing intent for incoming submittals.
 * @param draftUrl - Optional Gmail draft direct link.
 * @param directRowUrl - Direct URL linking directly to the modified row in the spreadsheet.
 * @param failedColumns - List of column headers that failed spreadsheet validation.
 * @param emptyFallbacks - List of optional fields that fell back to empty strings.
 * @returns Constructed `GoogleAppsScript.Card_Service.Card` instance.
 */
function buildSuccessCard(fileId: string, newFileName: string, fileUrl: string, localPath: string, targetKey: string, itemTitle: string, discipline: string, section: string, specTag: string, targetFolderId: string, logFileId: string, isFiled = false, projectAbbr = "", action = "", incomingRouting = "", draftUrl: string | null = null, directRowUrl: string | null = null, failedColumns: string[] = [], emptyFallbacks: string[] = []): GoogleAppsScript.Card_Service.Card {
  const header = CardService.newCardHeader().setTitle(MESSAGES.SUCCESS_CARD_TITLE);
  if (CONFIG.LOGO_URL) header.setImageUrl(CONFIG.LOGO_URL);
  const card = CardService.newCardBuilder().setHeader(header);
  const sec = CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(MESSAGES.SUCCESS_OUTGOING(targetKey)));

  if (failedColumns && failedColumns.length > 0) {
    sec.addWidget(CardService.newTextParagraph().setText(`⚠️ **Warning:** Some columns failed to log due to data validation rules: **${failedColumns.join(", ")}**. Please check the spreadsheet.`));
  }
  if (emptyFallbacks && emptyFallbacks.length > 0) {
    sec.addWidget(CardService.newTextParagraph().setText(`⚠️ **Note:** The following fields were left empty and fell back to empty strings: **${emptyFallbacks.join(", ")}**.`));
  }

  const logUrl = directRowUrl || `https://docs.google.com/spreadsheets/d/${logFileId}/edit`;

  sec.addWidget(CardService.newButtonSet()
    .addButton(CardService.newTextButton().setText("Open Drive").setOpenLink(CardService.newOpenLink().setUrl(fileUrl)))
    .addButton(CardService.newTextButton().setText("Open Document Log").setOpenLink(CardService.newOpenLink().setUrl(logUrl)))
  );
  sec.addWidget(CardService.newTextInput().setFieldName("localPath").setTitle("G:\\ Path").setValue(localPath));

  const draftParams: Record<string, string> = { 
    fileId: fileId || "", url: fileUrl || "", localPath: localPath || "", targetKey: targetKey || "", title: itemTitle || "", 
    action: action || "", incomingRouting: incomingRouting || "", projectAbbr: projectAbbr || "", newFileName: newFileName || "", 
    discipline: discipline || "", section: section || "", specTag: specTag || "", targetFolderId: targetFolderId || "", 
    logFileId: logFileId || "", isFiledStatus: isFiled ? "true" : "false",
    directRowUrl: directRowUrl || "",
    failedColumns: JSON.stringify(failedColumns || []),
    emptyFallbacks: JSON.stringify(emptyFallbacks || [])
  };

  const btnSet = CardService.newButtonSet();
  if (draftUrl) btnSet.addButton(CardService.newTextButton().setText("Open Draft Email").setOpenLink(CardService.newOpenLink().setUrl(draftUrl)).setTextButtonStyle(CardService.TextButtonStyle.FILLED));
  else btnSet.addButton(CardService.newTextButton().setText("Draft Email").setOnClickAction(CardService.newAction().setFunctionName("createDraftEmail").setParameters(draftParams)).setTextButtonStyle(CardService.TextButtonStyle.FILLED));
  
  if (!isFiled) {
    btnSet.addButton(CardService.newTextButton().setText("File the Submittal").setOnClickAction(CardService.newAction().setFunctionName("moveSubmittalToClosed")
      .setParameters({ 
        fileId: fileId || "", newFileName: newFileName || "", fileUrl: fileUrl || "", stampSubNo: targetKey || "", itemTitle: itemTitle || "", 
        discipline: discipline || "", section: section || "", specTag: specTag || "", targetFolderId: targetFolderId || "", logFileId: logFileId || "", 
        projectAbbr: projectAbbr || "", action: action || "", incomingRouting: incomingRouting || "",
        directRowUrl: directRowUrl || "",
        failedColumns: JSON.stringify(failedColumns || []),
        emptyFallbacks: JSON.stringify(emptyFallbacks || [])
      })).setTextButtonStyle(CardService.TextButtonStyle.OUTLINED));
  }
  sec.addWidget(btnSet);
  card.addSection(sec);
  return card.build();
}

/**
 * Action handler for creating a Gmail email draft populated with workflow templates and file links.
 * Updates Gmail sharing permissions on the filed item to allow access via link.
 *
 * @param e - Google Apps Script event object containing document parameters.
 * @returns ActionResponse containing the updated success card with the draft URL link.
 */
function createDraftEmail(e: GoogleAppsScriptEvent): GoogleAppsScript.Card_Service.ActionResponse {
  const p = e.parameters || {};
  try { if (p.fileId) DriveApp.getFileById(p.fileId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(err) {}
  let signature = "";
  try {
    const configs = (Gmail as any).Users.Settings.SendAs.list('me');
    const primary = configs.sendAs.find((c: any) => c.isPrimary);
    if (primary && primary.signature) signature = "\n\n" + primary.signature;
  } catch (err) {}
  const templateData = (p.action === "Referred") ? EMAIL_TEMPLATES.toRefer(p) : (p.action === "Rejected" ? EMAIL_TEMPLATES.rejectedOutgoing(p) : EMAIL_TEMPLATES.standardOutgoing(p));
  const draft = GmailApp.createDraft("", templateData.subject, "", { htmlBody: templateData.body + signature });
  const draftUrl = 'https://mail.google.com/mail/u/0/#drafts?compose=' + draft.getMessage().getId();
  
  const failedCols = p.failedColumns ? JSON.parse(p.failedColumns) : [];
  const emptyFalls = p.emptyFallbacks ? JSON.parse(p.emptyFallbacks) : [];

  const updated = buildSuccessCard(p.fileId, p.newFileName, p.url, p.localPath, p.targetKey, p.title, p.discipline, p.section, p.specTag, p.targetFolderId, p.logFileId, p.isFiledStatus === "true", p.projectAbbr, p.action, p.incomingRouting, draftUrl, p.directRowUrl, failedCols, emptyFalls);
  return defaultCardPresenter.presentDraftEmailSuccess(e, updated);
}

/**
 * Action handler for general form state changes (e.g. dropdown selections). Reloads the card.
 *
 * @param e - Google Apps Script event object.
 * @returns ActionResponse instructing CardService to reload the UI card.
 */
function onStateChange(e: GoogleAppsScriptEvent): GoogleAppsScript.Card_Service.ActionResponse { 
  return defaultCardPresenter.presentCardReload(e);
}

/**
 * Action handler triggered when an FF&E Spec Tag selection changes. Reloads the card and auto-fills spec title.
 *
 * @param e - Google Apps Script event object.
 * @returns ActionResponse reloading the card with updated spec title suggestions.
 */
function onSpecTagChange(e: GoogleAppsScriptEvent): GoogleAppsScript.Card_Service.ActionResponse { 
  return defaultCardPresenter.presentCardReload(e, true);
}

/**
 * Interactive handler to add a newly entered FF&E tag to the spreadsheet tag list before executing `processSubmission`.
 *
 * @param e - Google Apps Script event object containing `newTag` and `newTitle` parameters.
 * @returns Action response or Card response from `processSubmission`.
 */
function processSubmissionWithNewTag(e: GoogleAppsScriptEvent): any {
  try {
    const p = e.parameters || {};
    const logRepo = (globalThis as any).defaultLogRepository || defaultLogRepository;
    logRepo.addNewTagToTagList(p.logFileId, p.newTag, p.newTitle);
    e.parameters = e.parameters || {};
    e.parameters.bypassTagValidation = "true";
    return processSubmission(e);
  } catch (err: any) {
    const cp = (globalThis as any).defaultCardPresenter || defaultCardPresenter;
    return cp.presentNotification("Error adding tag: " + err.message);
  }
}

/**
 * Interactive handler to add a newly entered FF&E vendor to the spreadsheet vendor list before executing `processSubmission`.
 *
 * @param e - Google Apps Script event object containing `newVendor` parameter.
 * @returns Action response or Card response from `processSubmission`.
 */
function processSubmissionWithNewVendor(e: GoogleAppsScriptEvent): any {
  try {
    const p = e.parameters || {};
    const logRepo = (globalThis as any).defaultLogRepository || defaultLogRepository;
    logRepo.addNewVendorToTagList(p.logFileId, p.newVendor);
    e.parameters = e.parameters || {};
    e.parameters.bypassVendorValidation = "true";
    return processSubmission(e);
  } catch (err: any) {
    const cp = (globalThis as any).defaultCardPresenter || defaultCardPresenter;
    return cp.presentNotification("Error adding vendor: " + err.message);
  }
}

/**
 * Constructs the Multi-Document Contextual Intake Card (IntakeCard).
 *
 * Card Title: "File Document"
 * Demonstrates the cascading selection flow (Project -> DocumentType -> Dynamic Attributes -> Admin & Status foldout).
 *
 * @param e - Google Apps Script event object containing form inputs and action parameters.
 * @param initialData - Optional initial parsed data.
 * @param flashMessage - Optional notification payload containing warnings or errors.
 * @returns Fully constructed `GoogleAppsScript.Card_Service.Card` instance.
 */
function buildIntakeCard(
  e: GoogleAppsScriptEvent,
  initialData: ParsedData | null = null,
  flashMessage: any = null,
  aiResult: AiClassificationResult | null = null
): GoogleAppsScript.Card_Service.Card {
  const header = CardService.newCardHeader().setTitle("File Document");
  if (CONFIG.LOGO_URL) header.setImageUrl(CONFIG.LOGO_URL);

  const card = CardService.newCardBuilder().setHeader(header);

  const aiClassification: AiClassificationResult | null = aiResult || (flashMessage && flashMessage.aiResult) || (initialData && (initialData as any).aiResult) || null;
  const fieldConfidence: Record<string, number> = {};
  let overallConfidence: number | undefined;

  if (aiClassification) {
    if (typeof aiClassification.overallConfidence === "number") {
      overallConfidence = aiClassification.overallConfidence;
    }
    if (aiClassification.fields) {
      Object.keys(aiClassification.fields).forEach(key => {
        const fieldData = aiClassification.fields![key];
        if (fieldData && typeof fieldData.confidence === "number") {
          fieldConfidence[key] = fieldData.confidence;
        }
      });
    }
  }

  const threshold = typeof FieldConfidenceThreshold !== "undefined" ? FieldConfidenceThreshold : 0.85;
  const lowConfidenceKeys = Object.keys(fieldConfidence).filter(k => fieldConfidence[k] < threshold);
  const isOverallLowConfidence = overallConfidence !== undefined && overallConfidence < threshold;
  const hasLowConfidence = lowConfidenceKeys.length > 0 || isOverallLowConfidence;

  const formInput = (e && e.formInput) || {};
  const p = (e && e.parameters) || {};

  // Resolved Cascading State
  const state = {
    project: formInput.project || (initialData && initialData.driveName) || p.project || "PROJ",
    documentType: formInput.documentType || (initialData && initialData.discipline === "FF&E" ? "SUBMITTAL_FFE" : "SUBMITTAL_ARCH"),
    section: formInput.section || (initialData && initialData.section) || "033000",
    number: formInput.number || (initialData && initialData.number) || "001",
    revision: formInput.revision || "0",
    title: formInput.title || (initialData && initialData.title) || "Cast-in-Place Concrete",
    specTag: formInput.specTag || "CH-01",
    relatedTag: formInput.relatedTag || "CH-02",
    vendor: formInput.vendor || "Acme Supplies",
    rfiNumber: formInput.rfiNumber || "RFI-042",
    date: formInput.date || formatGasDate(new Date()),
    notes: formInput.notes || ""
  };

  const getActionParams = (): Record<string, string> => ({
    project: state.project,
    documentType: state.documentType
  });

  // 1. Status Message Box (Conditional ? only added if a message is displayed or low AI confidence detected)
  if (hasLowConfidence) {
    card.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText("?? Low AI Confidence (<85%) ? please review indicated field predictions before processing.")
      )
    );
  }

  if (flashMessage && (flashMessage.error || flashMessage.warning)) {
    const msgText = flashMessage.error ? `⚠️ ${flashMessage.error}` : `⚠️ ${flashMessage.warning}`;
    card.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(msgText)
      )
    );
  }

  if (flashMessage && flashMessage.targetKey) {
    const flashSec = CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(MESSAGES.SUCCESS_INCOMING(flashMessage.targetKey)));

    if (flashMessage.failedColumns && flashMessage.failedColumns.length > 0) {
      flashSec.addWidget(CardService.newTextParagraph().setText(`⚠️ **Warning:** Some columns failed to log due to data validation rules: **${flashMessage.failedColumns.join(", ")}**. Please check the spreadsheet.`));
    }
    if (flashMessage.emptyFallbacks && flashMessage.emptyFallbacks.length > 0) {
      flashSec.addWidget(CardService.newTextParagraph().setText(`⚠️ **Note:** The following fields were left empty and fell back to empty strings: **${flashMessage.emptyFallbacks.join(", ")}**.`));
    }

    const logUrl = flashMessage.directRowUrl || (p.logFileId ? `https://docs.google.com/spreadsheets/d/${p.logFileId}/edit` : "");

    const successButtons = CardService.newButtonSet();
    if (flashMessage.url) {
      successButtons.addButton(CardService.newTextButton().setText("Open in Drive").setOpenLink(CardService.newOpenLink().setUrl(flashMessage.url)));
    }
    if (logUrl) {
      successButtons.addButton(CardService.newTextButton().setText("Open Document Log").setOpenLink(CardService.newOpenLink().setUrl(logUrl)));
    }

    flashSec.addWidget(successButtons);
    if (flashMessage.localPath) {
      flashSec.addWidget(CardService.newTextInput().setFieldName("flashPath").setTitle("Local G:\\ Path").setValue(flashMessage.localPath));
    }
    card.addSection(flashSec);
  }

  // 2. Cascading Selectors (Project & DocumentType)
  const cascadeSec = CardService.newCardSection().setHeader("1. Project & Document Type");

  const logRepo = (globalThis as any).defaultLogRepository || (typeof defaultLogRepository !== "undefined" ? defaultLogRepository : null);
  const discipline = state.documentType === "SUBMITTAL_FFE" ? "FF&E" : "Architecture";
  const logSettings = (logRepo && p.logFileId && typeof logRepo.getLogSettings === "function")
    ? logRepo.getLogSettings(p.logFileId, discipline)
    : { contacts: [], actions: [], ffeTags: { tags: [], vendors: [], tagMap: {} }, projectAbbr: "", logSheetId: null };

  const driveProvider = (globalThis as any).defaultDriveNameProvider || defaultDriveNameProvider;
  let drives: Array<{ id: string; name: string }> = [];
  if (driveProvider && typeof driveProvider.getSharedDrives === "function") {
    try {
      drives = driveProvider.getSharedDrives() || [];
    } catch (err) {}
  }
  drives.sort((a, b) => a.name.localeCompare(b.name));

  const projDrop = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Target Project")
    .setFieldName("project")
    .setOnChangeAction(CardService.newAction().setFunctionName("onStateChange").setParameters(getActionParams()));
  projDrop.addItem("-- Select Project --", "", state.project === "");

  let projectSelectedInList = false;
  if (drives.length > 0) {
    drives.forEach(d => {
      const isSelected = state.project === d.name || state.project === d.id;
      if (isSelected) projectSelectedInList = true;
      projDrop.addItem(d.name, d.name, isSelected);
    });
  }

  if (state.project && !projectSelectedInList) {
    projDrop.addItem(state.project, state.project, true);
  }

  cascadeSec.addWidget(projDrop);

  const docTypeDrop = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Document Type")
    .setFieldName("documentType")
    .setOnChangeAction(CardService.newAction().setFunctionName("onStateChange").setParameters(getActionParams()));
  docTypeDrop.addItem("-- Select Document Type --", "", state.documentType === "");
  docTypeDrop.addItem("Submittal (Architecture)", "SUBMITTAL_ARCH", state.documentType === "SUBMITTAL_ARCH");
  docTypeDrop.addItem("Submittal (FF&E)", "SUBMITTAL_FFE", state.documentType === "SUBMITTAL_FFE");
  docTypeDrop.addItem("RFI (Request for Information)", "RFI", state.documentType === "RFI");
  cascadeSec.addWidget(docTypeDrop);

  const activeLogFileId = p.logFileId || logSettings.logFileId;
  if (activeLogFileId) {
    let logUrl = `https://docs.google.com/spreadsheets/d/${activeLogFileId}/edit`;
    if (logSettings && logSettings.logSheetId) {
      logUrl += `#gid=${logSettings.logSheetId}`;
    }
    cascadeSec.addWidget(
      CardService.newTextButton()
        .setText("Open Submittal Log")
        .setOpenLink(CardService.newOpenLink().setUrl(logUrl))
    );
  }

  card.addSection(cascadeSec);

  // 2. Submittal Selection / File Source Section
  const fileSourceSec = CardService.newCardSection().setHeader("2. File Source");

  const messageId = (e && e.gmail && e.gmail.messageId) || p.messageId || null;
  const driveFileId = p.driveFileId || formInput.driveFileId || (flashMessage && flashMessage.newDriveFileId) || "";

  let pdfAttachments: any[] = [];
  let extractedUrls: Array<{ url: string; text: string }> = [];

  try {
    if (messageId && typeof GmailApp !== "undefined" && GmailApp.getMessageById) {
      const msg = GmailApp.getMessageById(messageId);
      pdfAttachments = msg.getAttachments().filter(a => a.getName().toLowerCase().endsWith('.pdf') || a.getContentType() === 'application/pdf');

      const htmlBody = msg.getBody();
      const linkRegex = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;
      const urlMap = new Map<string, string>();

      while ((match = linkRegex.exec(htmlBody)) !== null) {
        let url = match[1];
        let label = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

        if (!url.includes('schemas.') && !url.includes('w3.org') && !url.includes('google.com')) {
          if (!label) label = "Unknown Link";
          if (!urlMap.has(url)) urlMap.set(url, label);
        }
      }

      const plainMatches = msg.getPlainBody().match(/https?:\/\/[^\s>"]+/g) || [];
      plainMatches.forEach(url => {
        if (!url.includes('schemas.') && !url.includes('w3.org') && !url.includes('google.com') && !urlMap.has(url)) {
          urlMap.set(url, "Direct Link");
        }
      });

      urlMap.forEach((label, url) => {
        let cleanLabel = label.length > 40 ? label.substring(0, 37) + "..." : label;
        extractedUrls.push({ url: url, text: `🔗 ${cleanLabel}` });
      });
    }
  } catch (err) {}

  let dynamicDefaultSource = "Google Drive URL";
  if (driveFileId) {
    dynamicDefaultSource = "Selected Drive File";
  } else if (pdfAttachments.length > 0) {
    dynamicDefaultSource = "Email Attachment";
  }

  const selectedFileSource = formInput.fileSource || (initialData && (initialData as any).fileSource) || p.fileSource || dynamicDefaultSource;
  const driveFileUrlVal = formInput.driveFileUrl || (initialData && (initialData as any).driveFileUrl) || p.driveFileUrl || "";

  if (driveFileId) {
    let driveFileName = "Selected Drive File";
    try {
      if (typeof DriveApp !== "undefined" && DriveApp.getFileById) {
        driveFileName = DriveApp.getFileById(driveFileId).getName();
      }
    } catch (err) {}
    fileSourceSec.addWidget(CardService.newTextParagraph().setText(`📄 ${driveFileName}`));
  } else {
    const srcDrop = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle("Source")
      .setFieldName("fileSource")
      .setOnChangeAction(CardService.newAction().setFunctionName("onStateChange").setParameters(getActionParams()));

    ['Email Attachment', 'Google Drive URL', 'Log Data Only'].forEach(o => {
      srcDrop.addItem(o, o, selectedFileSource === o);
    });

    extractedUrls.forEach(item => {
      srcDrop.addItem(item.text, item.url, selectedFileSource === item.url);
    });

    fileSourceSec.addWidget(srcDrop);

    if (selectedFileSource === 'Email Attachment') {
      if (pdfAttachments.length > 0) {
        const attDrop = CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.DROPDOWN)
          .setTitle("Select PDF")
          .setFieldName("attachmentName");
        const selectedAttName = formInput.attachmentName || pdfAttachments[0].getName();
        pdfAttachments.forEach(a => attDrop.addItem(a.getName(), a.getName(), selectedAttName === a.getName()));
        fileSourceSec.addWidget(attDrop);
      } else {
        const warningMsg = (typeof MESSAGES !== "undefined" && MESSAGES.WARNING_NO_PDF_ATTACHMENTS) ? MESSAGES.WARNING_NO_PDF_ATTACHMENTS : "⚠️ No PDF attachments found in this email.";
        fileSourceSec.addWidget(CardService.newTextParagraph().setText(warningMsg));
      }
    } else if (selectedFileSource === 'Google Drive URL') {
      fileSourceSec.addWidget(
        CardService.newTextInput()
          .setFieldName("driveFileUrl")
          .setTitle("Google Drive URL")
          .setValue(driveFileUrlVal)
      );
    } else if (selectedFileSource.startsWith('http')) {
      fileSourceSec.addWidget(
        CardService.newTextInput()
          .setFieldName("fetchUrl")
          .setTitle("Selected URL")
          .setValue(selectedFileSource)
      );
      const fetchAction = CardService.newAction()
        .setFunctionName("handleFetchUrl")
        .setParameters({ ...getActionParams(), targetFolderId: logSettings.targetFolderId || "", url: selectedFileSource });
      fileSourceSec.addWidget(
        CardService.newTextButton()
          .setText("Fetch & Save to Drive")
          .setOnClickAction(fetchAction)
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      );
    }
  }

  card.addSection(fileSourceSec);

  // 3. Dynamic Document Attributes Section
  const attrSec = CardService.newCardSection().setHeader("3. Document Attributes");

  // Heavy AI Analysis Button at top of Document Attributes
  const aiBtn = CardService.newTextButton()
    .setText("🔍 Analyze Document with AI")
    .setOnClickAction(CardService.newAction().setFunctionName("handleDeepAnalysis").setParameters(getActionParams()))
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED);
  attrSec.addWidget(CardService.newButtonSet().addButton(aiBtn));

  const docTypeKey = state.documentType || "SUBMITTAL_ARCH";
  const registry = defaultDocumentTypeConfigRegistry;
  let fields: DocumentFieldSpec[] = [];
  if (registry && registry.hasConfig(docTypeKey)) {
    fields = registry.getConfig(docTypeKey).fields || [];
  }

  const userCacheDraft = (flashMessage && flashMessage.userCacheDraft) ||
                        (initialData && (initialData as any).userCacheDraft) ||
                        ((initialData && !(initialData as any).displayPath) ? initialData : {}) || {};
  const parserResult = (flashMessage && flashMessage.parserResult) ||
                   (initialData && (initialData as any).parserResult) || {};

  const hydrationContext: HydrationContext = {
    formInput: (e && e.formInput) ? { ...e.formInput } : {},
    userCacheDraft: userCacheDraft,
    parserResult: parserResult,
    aiMetadata: aiResult ? (aiResult.fields ? Object.fromEntries(Object.entries(aiResult.fields).map(([k, v]) => [k, v.value])) : {}) : {},
    docTypeKey: docTypeKey,
    logSettings: logSettings,
    state: state
  };

  const validationContext: ValidationUIContext = {
    missingFields: (flashMessage && flashMessage.missingFields) || [],
    fieldConfidence: fieldConfidence,
    onStateActionName: "onStateChange",
    actionParams: getActionParams()
  };

  renderDynamicFormFields(attrSec, fields, hydrationContext, validationContext);

  const isFormValid = state.project !== "" && state.documentType !== "";
  const subBtn = CardService.newTextButton()
    .setText("Process Document")
    .setOnClickAction(CardService.newAction().setFunctionName("processSubmission").setParameters(getActionParams()))
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED);

  if (!isFormValid) {
    subBtn.setDisabled(true);
  }

  const buttonSet = CardService.newButtonSet().addButton(subBtn);
  const subParams: Record<string, string> = { ...getActionParams(), logFileId: p.logFileId || "", targetFolderId: p.targetFolderId || "", projectAbbr: state.project || "" };

  if (flashMessage && flashMessage.promptAddTag) {
    const tagParams: Record<string, string> = { ...subParams, newTag: state.specTag, newTitle: state.title };
    buttonSet.addButton(
      CardService.newTextButton()
        .setText("Add New Tag, File & Log")
        .setOnClickAction(CardService.newAction().setFunctionName("processSubmissionWithNewTag").setParameters(tagParams))
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
    );
  } else if (flashMessage && flashMessage.promptAddVendor) {
    const vendorParams: Record<string, string> = { ...subParams, newVendor: state.vendor };
    buttonSet.addButton(
      CardService.newTextButton()
        .setText("Add New Vendor, File & Log")
        .setOnClickAction(CardService.newAction().setFunctionName("processSubmissionWithNewVendor").setParameters(vendorParams))
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
    );
  }

  attrSec.addWidget(buttonSet);
  card.addSection(attrSec);

  // 4. Admin & Status Foldout Section
  const targetTab = state.documentType === "SUBMITTAL_FFE" ? "Submittal FFE" : state.documentType === "RFI" ? "RFI Log" : "Submittal Arch";
  const manifestKey = state.documentType || "SUBMITTAL_ARCH";

  const adminSec = CardService.newCardSection()
    .setHeader("?? Admin & Status")
    .setCollapsible(true)
    .addWidget(CardService.newTextParagraph().setText(`?? **Target Log Tab:** \`${targetTab}\``))
    .addWidget(CardService.newTextParagraph().setText(`??? **Config Tier:** \`Config_Manifest\` ? \`Config_${manifestKey}\``))
    .addWidget(CardService.newTextParagraph().setText("?? **Relative Offsets:** Header=Row 1 | Formula=Row 2 | Buffer=Row 3 | Data=Row 4"))
    .addWidget(CardService.newTextParagraph().setText(`?? **AI Triage Status:** Project \`${state.project || "Unselected"}\` | Type \`${state.documentType || "Unselected"}\` (Confidence: 94%)`))
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("?? Refresh Cache & Reload")
          .setOnClickAction(CardService.newAction().setFunctionName("handleRefreshCache").setParameters(getActionParams()))
      )
    );

  card.addSection(adminSec);

  return card.build();
}

export {
  renderDynamicFormFields,
  buildIntakeCard,
  buildSuccessCard,
  onStateChange,
  onSpecTagChange,
  handleRefreshCache,
  handleFetchUrl,
  handleDeepAnalysis,
  createDraftEmail,
  processSubmissionWithNewTag,
  processSubmissionWithNewVendor
};

