
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
 * @file UI.ts
 * @description CardService user interface components and user event handlers for the Workspace Add-on.
 *
 * Constructs interactive Google Apps Script Cards for intake data entry, project location selection,
 * source file resolution, submittal metadata inputs, AI analysis triggers, and workflow outcome cards.
 */

/**
 * Constructs the primary UI Card for the Workspace Add-on.
 *
 * Assembles form sections for project location (Shared Drive lookup), file source selection,
 * submittal metadata (discipline-specific for Architecture vs FF&E), and workflow submission triggers.
 *
 * @param e - Google Apps Script event object containing form input and parameters.
 * @param initialData - Optional initial parsed data extracted from email or filename intake.
 * @param isTagChange - Flag indicating if card build was triggered by a spec tag selection change.
 * @param flashMessage - Optional notification message payload containing warnings, errors, or prompts.
 * @returns A fully constructed `GoogleAppsScript.Card_Service.Card` instance.
 */
function buildMainCard(e: GoogleAppsScriptEvent, initialData: ParsedData | null = null, isTagChange = false, flashMessage: any = null): GoogleAppsScript.Card_Service.Card {
  const header = CardService.newCardHeader().setTitle(MESSAGES.MAIN_CARD_TITLE);
  if (CONFIG.LOGO_URL) header.setImageUrl(CONFIG.LOGO_URL);
  const card = CardService.newCardBuilder().setHeader(header);

  const missing = (flashMessage && flashMessage.missingFields) || [];
  const getTitle = (name: string, defaultTitle: string) => missing.includes(name) ? `❌ ${defaultTitle}` : defaultTitle;

  if (flashMessage && flashMessage.error) {
    card.addSection(CardService.newCardSection().addWidget(
      CardService.newTextParagraph().setText(`⚠️ **Validation Error:** ${flashMessage.error}`)
    ));
  }

  if (flashMessage && flashMessage.warning) {
    card.addSection(CardService.newCardSection().addWidget(
      CardService.newTextParagraph().setText(MESSAGES.WARNING_AI_AUTO_TRIAGE(flashMessage.warning))
    ));
  }

  const formInput = e.formInput || {};
  const p = e.parameters || {};
  const messageId = e.gmail ? e.gmail.messageId : (p.messageId || null);
  const driveFileId = p.driveFileId || formInput.driveFileId || (flashMessage && flashMessage.newDriveFileId) || "";

  const getActionParams = (): Record<string, string> => {
    let res: Record<string, string> = {};
    if (messageId) res.messageId = messageId;
    if (driveFileId) res.driveFileId = driveFileId;
    return res;
  };

  let fallbackDate = formatGasDate(new Date());
  let extractedUrls: Array<{ url: string; text: string }> = [];
  let pdfAttachments: GoogleAppsScript.Gmail.GmailAttachment[] = [];
  
  try {
    if (messageId) {
      const msg = GmailApp.getMessageById(messageId);
      fallbackDate = formatGasDate(msg.getDate());
      
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

  const state = {
    discipline: formInput.discipline || (initialData && initialData.discipline) || CONFIG.DEFAULT_DISCIPLINE,
    driveName: formInput.driveName || (initialData && initialData.driveName) || "",
    driveId: "",
    fileSource: formInput.fileSource || (initialData && initialData.fileSource) || dynamicDefaultSource,
    driveFileUrl: formInput.driveFileUrl || (initialData && initialData.driveFileUrl) || "",
    section: formInput.section || (initialData && initialData.section) || "",
    number: formInput.number || (initialData && initialData.number) || "",
    revision: formInput.revision || (initialData && initialData.revision) || CONFIG.DEFAULT_REVISION,
    title: formInput.title || (initialData && initialData.title) || "",
    specTag: formInput.specTag || (initialData && initialData.specTag) || "",
    relatedTag: (e.formInputs && e.formInputs.relatedTag) ? e.formInputs.relatedTag.join(", ") : (formInput.relatedTag || (initialData && initialData.relatedTag) || ""),
    specTitle: formInput.specTitle || (initialData && initialData.specTitle) || "",
    vendor: formInput.vendor || (initialData && initialData.vendor) || "",
    date: formInput.date || (driveFileId ? fallbackDate : (initialData && initialData.date) || fallbackDate),
    notes: formInput.notes || (initialData && initialData.notes) || "",
    contact: formInput.contact || "",
    action: formInput.action !== undefined ? formInput.action : (initialData && initialData.action ? initialData.action : (driveFileId ? "" : CONFIG.DEFAULT_ACTION)),
    incomingRouting: formInput.incomingRouting || CONFIG.DEFAULT_INCOMING_ROUTING
  };

  if (flashMessage && flashMessage.targetKey) {
    const draftParams: Record<string, string> = {
      fileId: flashMessage.fileId || "",
      url: flashMessage.url || "",
      localPath: flashMessage.localPath || "",
      targetKey: flashMessage.targetKey || "",
      title: flashMessage.title || "",
      action: flashMessage.action || "",
      incomingRouting: flashMessage.incomingRouting || "",
      projectAbbr: flashMessage.projectAbbr || "",
      discipline: state.discipline || "",
      section: state.section || "",
      specTag: state.specTag || "",
      targetFolderId: p.targetFolderId || "",
      logFileId: p.logFileId || "",
      isFiledStatus: "true",
      newFileName: flashMessage.newFileName || "",
      directRowUrl: flashMessage.directRowUrl || "",
      failedColumns: JSON.stringify(flashMessage.failedColumns || []),
      emptyFallbacks: JSON.stringify(flashMessage.emptyFallbacks || [])
    };

    const flashSec = CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(MESSAGES.SUCCESS_INCOMING(flashMessage.targetKey)));

    if (flashMessage.failedColumns && flashMessage.failedColumns.length > 0) {
      flashSec.addWidget(CardService.newTextParagraph().setText(`⚠️ **Warning:** Some columns failed to log due to data validation rules: **${flashMessage.failedColumns.join(", ")}**. Please check the spreadsheet.`));
    }
    if (flashMessage.emptyFallbacks && flashMessage.emptyFallbacks.length > 0) {
      flashSec.addWidget(CardService.newTextParagraph().setText(`⚠️ **Note:** The following fields were left empty and fell back to empty strings: **${flashMessage.emptyFallbacks.join(", ")}**.`));
    }

    const logUrl = flashMessage.directRowUrl || (p.logFileId ? `https://docs.google.com/spreadsheets/d/${p.logFileId}/edit` : "");

    const successButtons = CardService.newButtonSet()
      .addButton(CardService.newTextButton().setText("Open in Drive").setOpenLink(CardService.newOpenLink().setUrl(flashMessage.url)));
    
    if (logUrl) {
      successButtons.addButton(CardService.newTextButton().setText("Open Submittal Log").setOpenLink(CardService.newOpenLink().setUrl(logUrl)));
    }
    successButtons.addButton(CardService.newTextButton().setText("Draft Email").setOnClickAction(CardService.newAction().setFunctionName("createDraftEmail").setParameters(draftParams)).setTextButtonStyle(CardService.TextButtonStyle.FILLED));

    flashSec.addWidget(successButtons)
      .addWidget(CardService.newTextInput().setFieldName("flashPath").setTitle("Local G:\\ Path").setValue(flashMessage.localPath));
    card.addSection(flashSec);
  }

  const modeSection = CardService.newCardSection();
  const discDrop = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle("Discipline").setFieldName("discipline").setOnChangeAction(CardService.newAction().setFunctionName("onStateChange").setParameters(getActionParams()));
  discDrop.addItem("Architecture", "Architecture", state.discipline === "Architecture").addItem("FF&E", "FF&E", state.discipline === "FF&E");
  modeSection.addWidget(discDrop);
  card.addSection(modeSection);

  const section1 = CardService.newCardSection().setHeader("1. Project Location");
  
  let drives = (typeof defaultDriveNameProvider !== "undefined" && defaultDriveNameProvider.getSharedDrives)
    ? defaultDriveNameProvider.getSharedDrives()
    : [];
  drives.sort((a,b) => a.name.localeCompare(b.name));

  if (!state.driveName) {
    let lookupId = (initialData && initialData.driveId) || null;
    if (!lookupId && driveFileId) {
      try { lookupId = (Drive as any).Files.get(driveFileId, {supportsAllDrives: true}).driveId; } catch (err) {}
    }
    if (lookupId) {
      const matched = drives.find(d => d.id === lookupId);
      if (matched) state.driveName = matched.name;
    }
  }

  let matchedDrive = drives.find(d => d.name === state.driveName);
  if (matchedDrive) state.driveId = matchedDrive.id;

  const driveInput = CardService.newTextInput().setFieldName("driveName").setTitle("Project Shared Drive").setValue(state.driveName).setOnChangeAction(CardService.newAction().setFunctionName("onStateChange").setParameters(getActionParams()));
  if (drives.length > 0) driveInput.setSuggestions(CardService.newSuggestions().addSuggestions(drives.map(d => d.name)));
  section1.addWidget(driveInput);

  let logSettings: any = { contacts: [], actions: [], ffeTags: { tags: [], vendors: [], tagMap: {} }, logFileId: "", targetFolderId: "", projectAbbr: "" };

  if (state.driveId) {
    let logs: Array<{ id: string; title: string }> = [];
    const cache = CacheService.getUserCache();
    const logSearchKey = `log_search_${state.driveId}`;
    const cachedLogs = cache ? cache.get(logSearchKey) : null;

    if (cachedLogs) {
      try { logs = JSON.parse(cachedLogs); } catch(e) {}
    }

    if (logs.length === 0) {
      try {
        const resp = (Drive as any).Files.list({ q: `title contains '${CONFIG.LOG_FILE_SEARCH_TERM}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, corpora: 'drive', driveId: state.driveId, supportsAllDrives: true, includeItemsFromAllDrives: true });
        if (resp && resp.items) {
          logs = resp.items.map((l: any) => ({ id: l.id, title: l.title }));
          try { if (cache) cache.put(logSearchKey, JSON.stringify(logs), 3600); } catch(e) {}
        }
      } catch (err) {}
    }

    if (logs.length > 0) {
      logSettings.logFileId = formInput.logFileId || logs[0].id;
      if (logs.length === 1) {
        section1.addWidget(CardService.newTextParagraph().setText(MESSAGES.LOG_LOADED_SUCCESS));
      } else {
        section1.addWidget(CardService.newTextParagraph().setText(MESSAGES.LOG_MULTIPLE_FOUND));
        const logDrop = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle("Log File").setFieldName("logFileId").setOnChangeAction(CardService.newAction().setFunctionName("onStateChange").setParameters(getActionParams()));
        logs.forEach(l => logDrop.addItem(l.title, l.id, logSettings.logFileId === l.id));
        section1.addWidget(logDrop);
      }

      logSettings = { ...logSettings, ...defaultLogRepository.getLogSettings(logSettings.logFileId, state.discipline) };
      if (logSettings.logFileId) {
        let logUrl = `https://docs.google.com/spreadsheets/d/${logSettings.logFileId}/edit`;
        if (logSettings.logSheetId) {
          logUrl += `#gid=${logSettings.logSheetId}`;
        }
        section1.addWidget(CardService.newTextButton().setText("Open Submittal Log").setOpenLink(CardService.newOpenLink().setUrl(logUrl)));
      }

      try {
        const logFile = DriveApp.getFileById(logSettings.logFileId);
        const parents = logFile.getParents();
        if (parents.hasNext()) {
          const parent = parents.next();
          const sub = parent.getFoldersByName(CONFIG.TARGET_FOLDER_NAME);
          logSettings.targetFolderId = sub.hasNext() ? sub.next().getId() : parent.getId();
        }
      } catch (err) {}
    }
  }

  card.addSection(section1);

  const section2 = CardService.newCardSection().setHeader("2. File Source");
  if (driveFileId) {
    section2.addWidget(CardService.newTextParagraph().setText(`📄 ${DriveApp.getFileById(driveFileId).getName()}`));
  } else {
    const srcDrop = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle("Source").setFieldName("fileSource").setOnChangeAction(CardService.newAction().setFunctionName("onStateChange").setParameters(getActionParams()));
    ['Email Attachment', 'Google Drive URL', 'Log Data Only'].forEach(o => srcDrop.addItem(o, o, state.fileSource === o));
    extractedUrls.forEach(item => srcDrop.addItem(item.text, item.url, state.fileSource === item.url));
    section2.addWidget(srcDrop);

    if (state.fileSource === 'Email Attachment') {
      if (pdfAttachments.length > 0) {
        const attDrop = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle("Select PDF").setFieldName("attachmentName");
        const selectedAttName = formInput.attachmentName || pdfAttachments[0].getName();
        pdfAttachments.forEach(a => attDrop.addItem(a.getName(), a.getName(), selectedAttName === a.getName()));
        section2.addWidget(attDrop);
      } else {
        section2.addWidget(CardService.newTextParagraph().setText(MESSAGES.WARNING_NO_PDF_ATTACHMENTS));
      }
    } else if (state.fileSource === 'Google Drive URL') {
       section2.addWidget(CardService.newTextInput().setFieldName("driveFileUrl").setTitle("Google Drive URL").setValue(state.driveFileUrl));
    } else if (state.fileSource.startsWith('http')) {
       section2.addWidget(CardService.newTextInput().setFieldName("fetchUrl").setTitle("Selected URL").setValue(state.fileSource));
       const fetchAction = CardService.newAction().setFunctionName("handleFetchUrl").setParameters({...getActionParams(), targetFolderId: logSettings.targetFolderId, url: state.fileSource});
       section2.addWidget(CardService.newTextButton().setText(MESSAGES.BTN_FETCH).setOnClickAction(fetchAction).setTextButtonStyle(CardService.TextButtonStyle.FILLED));
    }
  }

  card.addSection(section2);

  const section3 = CardService.newCardSection().setHeader("3. Metadata");
  
  const showAiBtn = state.fileSource === "Email Attachment" || state.fileSource === "Google Drive URL" || state.fileSource === "Selected Drive File";
  if (showAiBtn) {
     const aiParams: Record<string, string> = { ...getActionParams(), logFileId: logSettings.logFileId, discipline: state.discipline };
     section3.addWidget(CardService.newButtonSet().addButton(
       CardService.newTextButton().setText(MESSAGES.BTN_ANALYZE)
         .setOnClickAction(CardService.newAction().setFunctionName("handleDeepAnalysis").setParameters(aiParams))
         .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
     ));
  }

  if (state.discipline === "Architecture") {
    section3.addWidget(CardService.newTextInput().setFieldName("section").setTitle(getTitle("Section", "Section")).setValue(state.section));
    section3.addWidget(CardService.newTextInput().setFieldName("number").setTitle(getTitle("Number", "Number")).setValue(state.number));
    section3.addWidget(CardService.newTextInput().setFieldName("title").setTitle(getTitle("Title", "Title")).setValue(state.title));
  } else {
    const tagIn = CardService.newTextInput().setFieldName("specTag").setTitle(getTitle("Spec Tag", "Spec Tag")).setValue(state.specTag).setOnChangeAction(CardService.newAction().setFunctionName("onSpecTagChange").setParameters(getActionParams()));
    if (logSettings.ffeTags.tags.length > 0) tagIn.setSuggestions(CardService.newSuggestions().addSuggestions(logSettings.ffeTags.tags));
    section3.addWidget(tagIn);

    const relatedTagDrop = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.MULTI_SELECT)
      .setTitle(getTitle("Related Tags", "Related Tags"))
      .setFieldName("relatedTag");
    
    logSettings.ffeTags.tags.forEach((tag: string) => {
      const isSelected = state.relatedTag.includes(tag);
      relatedTagDrop.addItem(tag, tag, isSelected);
    });
    section3.addWidget(relatedTagDrop);

    if (isTagChange && logSettings.ffeTags.tagMap[state.specTag]) state.specTitle = logSettings.ffeTags.tagMap[state.specTag];
    section3.addWidget(CardService.newTextInput().setFieldName("specTitle").setTitle(getTitle("Spec Title", "Spec Title")).setValue(state.specTitle));
    const vendorIn = CardService.newTextInput().setFieldName("vendor").setTitle(getTitle("Vendor", "Vendor")).setValue(state.vendor);
    if (logSettings.ffeTags.vendors.length > 0) {
      vendorIn.setSuggestions(CardService.newSuggestions().addSuggestions(logSettings.ffeTags.vendors));
    }
    section3.addWidget(vendorIn);
  }

  section3.addWidget(CardService.newTextInput().setFieldName("revision").setTitle(getTitle("Revision", "Revision")).setValue(state.revision));
  section3.addWidget(CardService.newTextInput().setFieldName("date").setTitle(getTitle("Date", "Date (YYMMDD)")).setValue(state.date));

  const conDrop = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle(getTitle("Contact", "Contact")).setFieldName("contact");
  logSettings.contacts.forEach((c: any) => conDrop.addItem(`${c.abbr} - ${c.name}`, c.abbr, state.contact === c.abbr));
  section3.addWidget(conDrop);

  const actDrop = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle(getTitle("Action", "Action")).setFieldName("action").setOnChangeAction(CardService.newAction().setFunctionName("onStateChange").setParameters(getActionParams()));
  if (state.action === "") actDrop.addItem("", "", true);
  logSettings.actions.forEach((a: any) => actDrop.addItem(a.action, a.action, state.action === a.action));
  section3.addWidget(actDrop);

  const isIncomingAction = state.action === "Received" || (logSettings.actions && logSettings.actions.some((a: any) => (a.action === state.action || a.abbr === state.action) && a.action === "Received"));
  if (isIncomingAction) {
    const routingDrop = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle(getTitle("Incoming Routing", "Incoming Routing")).setFieldName("incomingRouting");
    routingDrop.addItem("To Review", "To Review", state.incomingRouting === "To Review").addItem("To Refer", "To Refer", state.incomingRouting === "To Refer");
    section3.addWidget(routingDrop);
  }

  section3.addWidget(CardService.newTextInput().setFieldName("notes").setTitle("Notes").setMultiline(true).setValue(state.notes));

  const subParams: Record<string, string> = { ...getActionParams(), logFileId: logSettings.logFileId, targetFolderId: logSettings.targetFolderId, projectAbbr: logSettings.projectAbbr || state.driveName || "" };
  const buttonSet = CardService.newButtonSet();
  buttonSet.addButton(CardService.newTextButton().setText("File & Log").setOnClickAction(CardService.newAction().setFunctionName("processSubmission").setParameters(subParams)).setTextButtonStyle(CardService.TextButtonStyle.FILLED));
  
  if (flashMessage && flashMessage.promptAddTag) {
    const tagParams: Record<string, string> = { ...subParams, newTag: state.specTag, newTitle: state.specTitle };
    buttonSet.addButton(CardService.newTextButton().setText("Add New Tag, File & Log").setOnClickAction(CardService.newAction().setFunctionName("processSubmissionWithNewTag").setParameters(tagParams)).setTextButtonStyle(CardService.TextButtonStyle.OUTLINED));
  } else if (flashMessage && flashMessage.promptAddVendor) {
    const vendorParams: Record<string, string> = { ...subParams, newVendor: state.vendor };
    buttonSet.addButton(CardService.newTextButton().setText("Add New Vendor, File & Log").setOnClickAction(CardService.newAction().setFunctionName("processSubmissionWithNewVendor").setParameters(vendorParams)).setTextButtonStyle(CardService.TextButtonStyle.OUTLINED));
  }
  
  section3.addWidget(buttonSet);

  card.addSection(section3);

  const advancedSection = CardService.newCardSection()
    .setHeader("⚙️ Advanced Options")
    .setCollapsible(true);

  const refreshParams: Record<string, string> = { ...getActionParams() };
  if (state.driveId) refreshParams.driveId = state.driveId;
  if (logSettings.logFileId) refreshParams.logFileId = logSettings.logFileId;

  advancedSection.addWidget(CardService.newButtonSet().addButton(
    CardService.newTextButton()
      .setText("🔄 Refresh Cache & Reload")
      .setOnClickAction(CardService.newAction().setFunctionName("handleRefreshCache").setParameters(refreshParams))
  ));
  
  card.addSection(advancedSection);

  return card.build();
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

  const logSettings = defaultLogRepository.getLogSettings(p.logFileId, p.discipline);
  const contextObj = { contacts: logSettings.contacts, actions: logSettings.actions };
  const result = await defaultAiAnalysisService.analyzeSubmittal(sourceBlob, emailText, contextObj);
  
  return defaultCardPresenter.presentDeepAnalysisResult(e, result);
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
    .addButton(CardService.newTextButton().setText("Open Submittal Log").setOpenLink(CardService.newOpenLink().setUrl(logUrl)))
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
  let templateData = (p.action === "Referred") ? EMAIL_TEMPLATES.toRefer(p) : (p.action === "Rejected" ? EMAIL_TEMPLATES.rejectedOutgoing(p) : EMAIL_TEMPLATES.standardOutgoing(p));
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
    defaultLogRepository.addNewTagToTagList(p.logFileId, p.newTag, p.newTitle);
    e.parameters = e.parameters || {};
    e.parameters.bypassTagValidation = "true";
    return processSubmission(e);
  } catch (err: any) {
    return defaultCardPresenter.presentNotification("Error adding tag: " + err.message);
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
    defaultLogRepository.addNewVendorToTagList(p.logFileId, p.newVendor);
    e.parameters = e.parameters || {};
    e.parameters.bypassVendorValidation = "true";
    return processSubmission(e);
  } catch (err: any) {
    return defaultCardPresenter.presentNotification("Error adding vendor: " + err.message);
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).buildMainCard = (globalThis as any).buildMainCard || buildMainCard;
  (globalThis as any).buildSuccessCard = (globalThis as any).buildSuccessCard || buildSuccessCard;
  module.exports = {
    buildMainCard,
    buildSuccessCard,
    onStateChange,
    onSpecTagChange,
    processSubmissionWithNewTag,
    processSubmissionWithNewVendor,
    handleRefreshCache,
    handleFetchUrl,
    handleDeepAnalysis,
    createDraftEmail
  };
}
