import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness, EventFactory, CardSerializer } from "./harness";

test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

(globalThis as any).buildSuccessCard = (
  fileId: string,
  newFileName: string,
  fileUrl: string,
  localPath: string,
  targetKey: string,
  itemTitle: string,
  discipline: string,
  section: string,
  specTag: string,
  targetFolderId: string,
  logFileId: string
) => {
  const harness = GasMockHarness.install();
  const CardService = harness.cardService;
  const header = CardService.newCardHeader().setTitle("Submittal Processed Successfully");
  const card = CardService.newCardBuilder().setHeader(header);
  const sec = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(`Logged submittal ${targetKey}`))
    .addWidget(CardService.newTextParagraph().setText(`Discipline: ${discipline}`))
    .addWidget(CardService.newTextParagraph().setText(`Section: ${section}`))
    .addWidget(CardService.newTextParagraph().setText(`SpecTag: ${specTag}`))
    .addWidget(
      CardService.newButtonSet()
        .addButton(CardService.newTextButton().setText("Open Drive"))
        .addButton(CardService.newTextButton().setText("Draft Email"))
    );
  card.addSection(sec);
  return card.build();
};

(globalThis as any).buildMainCard = (e: any, initialData: any, isTagChange: any, flashData: any) => {
  const harness = GasMockHarness.install();
  const CardService = harness.cardService;
  const header = CardService.newCardHeader().setTitle("MainCard");
  const card = CardService.newCardBuilder().setHeader(header);
  const sec = CardService.newCardSection();
  if (flashData && flashData.error) {
    sec.addWidget(CardService.newTextParagraph().setText(flashData.error));
  }
  if (flashData && flashData.warning) {
    sec.addWidget(CardService.newTextParagraph().setText(flashData.warning));
  }
  if (flashData && flashData.debugPhase2) {
    sec.addWidget(CardService.newTextParagraph().setText(flashData.debugPhase2));
  }
  card.addSection(sec);
  return card.build();
};

(globalThis as any).fetchAndSaveFile = (url: string, folderId: string) => {
  if (url === "fail_url") return { success: false, error: "AUTH_WALL" };
  return { success: true, fileName: "test.pdf", fileId: "file123" };
};

(globalThis as any).MESSAGES = {
  SUCCESS_MOVED: (f: string) => `Moved to ${f}`,
  ERROR_TARGET_FOLDER: "❌ Error: Target folder not resolved. Please select a Drive/Log first.",
  WARNING_AUTH_WALL: "⚠️ Cannot download: File is behind a login wall. Please download manually and use 'Google Drive URL'.",
  WARNING_NOT_WHITELISTED: "⚠️ Domain not whitelisted. Please manually download the file and use 'Google Drive URL'.",
  ERROR_FETCH_FAILED: (err: any) => `❌ Fetch failed: ${err}`,
  SUCCESS_FETCHED: "✅ Fetched successfully!",
  DEBUG_SAVED_TO_DRIVE: (fileName: string, fileId: string) => `✅ Saved ${fileName} to Drive.\nDriveFileId: ${fileId}`,
  SUCCESS_CARD_TITLE: "Submittal Processed Successfully",
  SUCCESS_OUTGOING: (k: string) => `Logged submittal ${k}`,
  SUCCESS_ANALYSIS: "✅ Analysis complete!",
  SUCCESS_DRAFT_CREATED: "✅ Draft created.",
  ERROR_NO_ATTACHMENT: "❌ Attachment not found.",
  ERROR_NO_URL: "❌ Drive URL missing.",
  ERROR_GETTING_FILE: (m: string) => `❌ Error file: ${m}`,
  ERROR_RESOLVING_FILE: "❌ Cannot resolve file.",
  ERROR_AI_GENERAL: (m: string) => `❌ AI Error: ${m}`,
  ERROR_AI_BUSY: "⚠️ AI Busy."
};

const { CardPresenter, defaultCardPresenter } = require("../src/adapters/gas/CardPresenter");
const {
  onStateChange,
  onSpecTagChange,
  handleRefreshCache,
  handleFetchUrl,
  handleDeepAnalysis,
  createDraftEmail,
  processSubmissionWithNewTag,
  processSubmissionWithNewVendor
} = require("../src/adapters/gas/UI");

test("CardPresenter - presentValidationError formats error flash and returns ActionResponse updateCard", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent({ discipline: "Architecture" });
  const errors = ["Title is required", "Date is invalid"];
  const missingFields = ["title", "date"];

  const response = presenter.presentValidationError(mockEvent, errors, missingFields);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "Title is required"));
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "Date is invalid"));
});

test("CardPresenter - presentValidationError handles optional missingFields", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent();
  const errors = ["General error"];

  const response = presenter.presentValidationError(mockEvent, errors);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "General error"));
});

test("CardPresenter - defaultCardPresenter is exported and functional", () => {
  assert.ok(defaultCardPresenter);
  assert.ok(defaultCardPresenter instanceof CardPresenter);
});

test("CardPresenter - presentCardReload updates main card with default isTagChange false", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent({ discipline: "Architecture" });

  const response = presenter.presentCardReload(mockEvent);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.ok(resJson.navigation?.card);
});

test("CardPresenter - presentCardReload propagates isTagChange true flag", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent({ specTag: "A-101" });

  const response = presenter.presentCardReload(mockEvent, true);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.ok(resJson.navigation?.card);
});

test("CardPresenter - presentCacheRefresh updates main card and sets notification toast", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent({}, { parameters: { driveId: "drive1" } });

  const response = presenter.presentCacheRefresh(mockEvent);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.ok(resJson.navigation?.card);
  assert.equal(CardSerializer.getNotificationText(response), "✅ Cache cleared. Data reloaded.");
});

test("CardPresenter - presentFetchUrlResult builds main card with flash message and optional notification", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent({}, { parameters: {} });
  const flashMessage = { debugPhase2: "Saved file" };

  const response = presenter.presentFetchUrlResult(mockEvent, flashMessage, "✅ Fetched successfully!");
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "Saved file"));
  assert.equal(CardSerializer.getNotificationText(response), "✅ Fetched successfully!");
});

test("CardPresenter - presentNotification returns notification-only action response", () => {
  const presenter = new CardPresenter();
  const response = presenter.presentNotification("Test Notification");

  assert.ok(response);
  assert.equal(response.navigation, undefined);
  assert.equal(CardSerializer.getNotificationText(response), "Test Notification");
});

test("UI.ts - onStateChange delegates navigation update to defaultCardPresenter.presentCardReload", () => {
  let reloadCalledWith: any = null;
  const originalPresentCardReload = defaultCardPresenter.presentCardReload;

  defaultCardPresenter.presentCardReload = (e: any, isTagChange?: boolean) => {
    reloadCalledWith = { e, isTagChange };
    return { mockResponse: "onStateChange" } as any;
  };

  try {
    const mockEvent = EventFactory.createCardSubmitEvent({ discipline: "Architecture" });
    const response = onStateChange(mockEvent);

    assert.deepEqual(reloadCalledWith, { e: mockEvent, isTagChange: undefined });
    assert.deepEqual(response, { mockResponse: "onStateChange" });
  } finally {
    defaultCardPresenter.presentCardReload = originalPresentCardReload;
  }
});

test("UI.ts - onSpecTagChange delegates navigation update to defaultCardPresenter.presentCardReload with isTagChange true", () => {
  let reloadCalledWith: any = null;
  const originalPresentCardReload = defaultCardPresenter.presentCardReload;

  defaultCardPresenter.presentCardReload = (e: any, isTagChange?: boolean) => {
    reloadCalledWith = { e, isTagChange };
    return { mockResponse: "onSpecTagChange" } as any;
  };

  try {
    const mockEvent = EventFactory.createCardSubmitEvent({ specTag: "A-101" });
    const response = onSpecTagChange(mockEvent);

    assert.deepEqual(reloadCalledWith, { e: mockEvent, isTagChange: true });
    assert.deepEqual(response, { mockResponse: "onSpecTagChange" });
  } finally {
    defaultCardPresenter.presentCardReload = originalPresentCardReload;
  }
});

test("CardPresenter - presentOutgoingSuccess builds pushed SuccessCard ActionResponse for Architecture", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent({
    discipline: "Architecture",
    section: "033000",
    title: "Concrete Submittal",
    action: "Approved"
  });
  const mockResult: any = {
    fileId: "file-123",
    newFileName: "033000-001 Concrete",
    url: "http://drive.google.com/file-123",
    localPath: "G:\\My Drive\\file-123",
    targetKey: "033000-001",
    title: "Concrete Submittal",
    projectAbbr: "PROJ",
    action: "Approved",
    incomingRouting: "To Review",
    directRowUrl: "http://docs.google.com/sheet?range=A5",
    failedColumns: ["ColA"],
    emptyFallbacks: ["ColB"]
  };
  const mockParams: any = {
    targetFolderId: "folder-456",
    logFileId: "log-789",
    projectAbbr: "PROJ"
  };

  const response = presenter.presentOutgoingSuccess(mockEvent, mockResult, mockParams);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "pushCard");
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "033000-001"));
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "Architecture"));
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "033000"));
  assert.ok(CardSerializer.findButton(resJson.navigation?.card, "Open Drive"));
  assert.ok(CardSerializer.findButton(resJson.navigation?.card, "Draft Email"));
});

test("CardPresenter - presentOutgoingSuccess builds pushed SuccessCard ActionResponse for FF&E", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent({
    discipline: "FF&E",
    specTag: "CH-01",
    specTitle: "Side Chair",
    action: "Approved"
  });
  const mockResult: any = {
    fileId: "file-ffe-123",
    newFileName: "CH-01 Side Chair",
    url: "http://drive.google.com/file-ffe-123",
    localPath: "G:\\My Drive\\file-ffe-123",
    targetKey: "CH-01-001",
    title: "Side Chair",
    projectAbbr: "PROJ",
    action: "Approved",
    incomingRouting: "",
    directRowUrl: "http://docs.google.com/sheet?range=A8",
    failedColumns: [],
    emptyFallbacks: []
  };
  const mockParams: any = {
    targetFolderId: "folder-ffe",
    logFileId: "log-ffe",
    projectAbbr: "PROJ"
  };

  const response = presenter.presentOutgoingSuccess(mockEvent, mockResult, mockParams);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "pushCard");
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "FF&E"));
  assert.ok(CardSerializer.hasWidgetText(resJson.navigation?.card, "CH-01"));
});

test("CardPresenter - presentMoveToClosedSuccess updates card with toast notification", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent();
  const harness = GasMockHarness.install();
  const CardService = harness.cardService;
  const mockUpdatedCard = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("SuccessCardUpdated"))
    .build();
  const destName = "Closed/Concrete";

  const response = presenter.presentMoveToClosedSuccess(mockEvent, mockUpdatedCard, destName);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.equal(CardSerializer.getNotificationText(response), "Moved to Closed/Concrete");
});

test("UI.ts - handleRefreshCache invalidates cache and delegates response to defaultCardPresenter.presentCacheRefresh", () => {
  let refreshCalledWith: any = null;
  const originalPresentCacheRefresh = defaultCardPresenter.presentCacheRefresh;

  defaultCardPresenter.presentCacheRefresh = (e: any) => {
    refreshCalledWith = e;
    return { mockResponse: "handleRefreshCache" } as any;
  };

  try {
    const harness = GasMockHarness.install();
    const cache = harness.userCache;
    cache.put("cached_shared_drives", "data");
    cache.put("log_search_drive123", "data");
    cache.put("log_settings_log456_Architecture", "data");
    cache.put("log_settings_log456_FF&E", "data");

    const mockEvent = EventFactory.createCardSubmitEvent({}, { parameters: { driveId: "drive123", logFileId: "log456" } });
    const response = handleRefreshCache(mockEvent);

    assert.equal(cache.get("cached_shared_drives"), null);
    assert.equal(cache.get("log_search_drive123"), null);
    assert.equal(cache.get("log_settings_log456_Architecture"), null);
    assert.equal(cache.get("log_settings_log456_FF&E"), null);
    assert.equal(refreshCalledWith, mockEvent);
    assert.deepEqual(response, { mockResponse: "handleRefreshCache" });
  } finally {
    defaultCardPresenter.presentCacheRefresh = originalPresentCacheRefresh;
  }
});

test("UI.ts - handleFetchUrl delegates error notification on missing targetFolderId", () => {
  let notificationCalledWith: string | null = null;
  const originalPresentNotification = defaultCardPresenter.presentNotification;

  defaultCardPresenter.presentNotification = (text: string) => {
    notificationCalledWith = text;
    return { mockResponse: "presentNotification" } as any;
  };

  try {
    const mockEventNoFolder = EventFactory.createCardSubmitEvent({}, { parameters: {} });
    const res1 = handleFetchUrl(mockEventNoFolder);
    assert.equal(notificationCalledWith, "❌ Error: Target folder not resolved. Please select a Drive/Log first.");
    assert.deepEqual(res1, { mockResponse: "presentNotification" });
  } finally {
    defaultCardPresenter.presentNotification = originalPresentNotification;
  }
});

test("UI.ts - handleFetchUrl delegates warning toast and card update to presentFetchUrlResult on fetch warning", () => {
  let fetchResultCalledWith: any = null;
  const originalPresentFetchUrlResult = defaultCardPresenter.presentFetchUrlResult;

  defaultCardPresenter.presentFetchUrlResult = (e: any, flashMessage?: any, notificationText?: string) => {
    fetchResultCalledWith = { e, flashMessage, notificationText };
    return { mockResponse: "presentFetchUrlResult" } as any;
  };

  try {
    const mockEventFail = EventFactory.createCardSubmitEvent({}, { parameters: { targetFolderId: "folder1", url: "fail_url" } });
    const res = handleFetchUrl(mockEventFail);

    assert.equal(fetchResultCalledWith.e, mockEventFail);
    assert.equal(fetchResultCalledWith.notificationText, "⚠️ Cannot download: File is behind a login wall. Please download manually and use 'Google Drive URL'.");
    assert.deepEqual(fetchResultCalledWith.flashMessage, {
      warning: "⚠️ Cannot download: File is behind a login wall. Please download manually and use 'Google Drive URL'."
    });
    assert.deepEqual(res, { mockResponse: "presentFetchUrlResult" });
  } finally {
    defaultCardPresenter.presentFetchUrlResult = originalPresentFetchUrlResult;
  }
});

test("UI.ts - handleFetchUrl delegates successful result to defaultCardPresenter.presentFetchUrlResult", () => {
  let fetchResultCalledWith: any = null;
  const originalPresentFetchUrlResult = defaultCardPresenter.presentFetchUrlResult;

  defaultCardPresenter.presentFetchUrlResult = (e: any, flashMessage?: any, notificationText?: string) => {
    fetchResultCalledWith = { e, flashMessage, notificationText };
    return { mockResponse: "presentFetchUrlResult" } as any;
  };

  try {
    const mockEvent = EventFactory.createCardSubmitEvent({}, { parameters: { targetFolderId: "folder1", url: "http://example.com/file.pdf" } });
    const response = handleFetchUrl(mockEvent);

    assert.equal(mockEvent.formInput.fileSource, "Selected Drive File");
    assert.equal(mockEvent.formInput.driveFileId, "file123");
    assert.equal(fetchResultCalledWith.e, mockEvent);
    assert.equal(fetchResultCalledWith.notificationText, "✅ Fetched successfully!");
    assert.deepEqual(fetchResultCalledWith.flashMessage, {
      debugPhase2: "✅ Saved test.pdf to Drive.\nDriveFileId: file123",
      newDriveFileId: "file123"
    });
    assert.deepEqual(response, { mockResponse: "presentFetchUrlResult" });
  } finally {
    defaultCardPresenter.presentFetchUrlResult = originalPresentFetchUrlResult;
  }
});

test("CardPresenter - presentDeepAnalysisResult updates main card with navigation and SUCCESS_ANALYSIS notification on success analysisResult", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent({}, { parameters: { discipline: "Architecture" } });
  const mockResult: any = {
    success: true,
    analysis: { predictedSection: "033000", predictedTitle: "Cast-in-Place Concrete" }
  };

  const response = presenter.presentDeepAnalysisResult(mockEvent, mockResult);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.equal(mockEvent.formInput.section, "033000");
  assert.equal(mockEvent.formInput.title, "Cast-in-Place Concrete");
  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.equal(CardSerializer.getNotificationText(response), "✅ Analysis complete!");
});

test("CardPresenter - presentDeepAnalysisResult returns error notification toast on failed analysisResult", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent();
  const mockErrorResult: any = {
    success: false,
    error: { code: "RATE_LIMITED", userMessage: "Quota exceeded" }
  };

  const response = presenter.presentDeepAnalysisResult(mockEvent, mockErrorResult);

  assert.ok(response);
  assert.equal(response.navigation, undefined);
  assert.equal(CardSerializer.getNotificationText(response), "⚠️ AI Busy.");
});

test("CardPresenter - presentDraftEmailSuccess returns updateCard with updated success card and SUCCESS_DRAFT_CREATED notification", () => {
  const presenter = new CardPresenter();
  const mockEvent = EventFactory.createCardSubmitEvent();
  const harness = GasMockHarness.install();
  const CardService = harness.cardService;
  const mockUpdatedSuccessCard = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("SuccessCardWithDraftUrl"))
    .build();

  const response = presenter.presentDraftEmailSuccess(mockEvent, mockUpdatedSuccessCard);
  const resJson = CardSerializer.actionResponseToJSON(response);

  assert.ok(response);
  assert.equal(resJson.navigation?.action, "updateCard");
  assert.equal(CardSerializer.getNotificationText(response), "✅ Draft created.");
});

test("UI.ts - handleDeepAnalysis delegates presentational response to defaultCardPresenter.presentDeepAnalysisResult on success", async () => {
  let deepAnalysisCalledWith: any = null;
  const originalPresentDeepAnalysisResult = defaultCardPresenter.presentDeepAnalysisResult;

  defaultCardPresenter.presentDeepAnalysisResult = (e: any, result: any) => {
    deepAnalysisCalledWith = { e, result };
    return { mockResponse: "presentDeepAnalysisResult" } as any;
  };

  (globalThis as any).DriveApp = {
    getFileById: (id: string) => ({
      getBlob: () => ({ getBytes: () => new Uint8Array([1, 2, 3]), getContentType: () => "application/pdf" })
    })
  };

  (globalThis as any).defaultLogRepository = {
    getLogSettings: () => ({ contacts: [], actions: [] }),
    addNewTagToTagList: () => {},
    addNewVendorToTagList: () => {}
  };

  (globalThis as any).defaultAiAnalysisService = {
    analyzeSubmittal: async () => ({
      success: true,
      analysis: { predictedSection: "033000", predictedTitle: "Concrete" }
    })
  };

  try {
    const mockEvent = EventFactory.createCardSubmitEvent({}, { parameters: { driveFileId: "file123", discipline: "Architecture" } });

    const response = await handleDeepAnalysis(mockEvent);

    assert.equal(deepAnalysisCalledWith.e, mockEvent);
    assert.equal(deepAnalysisCalledWith.result.analysis.predictedSection, "033000");
    assert.equal(deepAnalysisCalledWith.result.analysis.predictedTitle, "Concrete");
    assert.deepEqual(response, { mockResponse: "presentDeepAnalysisResult" });
  } finally {
    defaultCardPresenter.presentDeepAnalysisResult = originalPresentDeepAnalysisResult;
  }
});

test("UI.ts - handleDeepAnalysis delegates error notifications to defaultCardPresenter.presentNotification", async () => {
  let notificationCalledWith: string | null = null;
  const originalPresentNotification = defaultCardPresenter.presentNotification;

  defaultCardPresenter.presentNotification = (text: string) => {
    notificationCalledWith = text;
    return { mockResponse: "presentNotification" } as any;
  };

  try {
    const mockEvent = EventFactory.createCardSubmitEvent({ fileSource: "http://example.com/doc.pdf", driveFileUrl: "http://drive.google.com/doc.pdf" });

    const response = await handleDeepAnalysis(mockEvent);

    assert.equal(notificationCalledWith, "⚠️ Please click 'Fetch & Save to Drive' before analyzing.");
    assert.deepEqual(response, { mockResponse: "presentNotification" });
  } finally {
    defaultCardPresenter.presentNotification = originalPresentNotification;
  }
});

test("UI.ts - createDraftEmail delegates presentational response to defaultCardPresenter.presentDraftEmailSuccess", () => {
  let draftSuccessCalledWith: any = null;
  const originalPresentDraftEmailSuccess = defaultCardPresenter.presentDraftEmailSuccess;

  defaultCardPresenter.presentDraftEmailSuccess = (e: any, card: any) => {
    draftSuccessCalledWith = { e, card };
    return { mockResponse: "presentDraftEmailSuccess" } as any;
  };

  (globalThis as any).DriveApp = {
    getFileById: () => ({ setSharing: () => {} })
  };
  (globalThis as any).Gmail = {
    Users: { Settings: { SendAs: { list: () => ({ sendAs: [] }) } } }
  };
  (globalThis as any).EMAIL_TEMPLATES = {
    standardOutgoing: () => ({ subject: "Submittal Review", body: "Please see attached" })
  };
  (globalThis as any).GmailApp = {
    createDraft: () => ({ getMessage: () => ({ getId: () => "draft123" }) })
  };

  try {
    const mockEvent = EventFactory.createCardSubmitEvent({}, { parameters: { fileId: "f1", title: "Test", action: "Approved" } });

    const response = createDraftEmail(mockEvent);

    assert.equal(draftSuccessCalledWith.e, mockEvent);
    assert.ok(draftSuccessCalledWith.card);
    assert.deepEqual(response, { mockResponse: "presentDraftEmailSuccess" });
  } finally {
    defaultCardPresenter.presentDraftEmailSuccess = originalPresentDraftEmailSuccess;
  }
});

test("UI.ts - processSubmissionWithNewTag / processSubmissionWithNewVendor delegate errors to defaultCardPresenter.presentNotification", () => {
  let notificationCalledWith: string | null = null;
  const originalPresentNotification = defaultCardPresenter.presentNotification;

  defaultCardPresenter.presentNotification = (text: string) => {
    notificationCalledWith = text;
    return { mockResponse: "presentNotification" } as any;
  };

  (globalThis as any).defaultLogRepository = {
    addNewTagToTagList: () => { throw new Error("Tag fail"); },
    addNewVendorToTagList: () => { throw new Error("Vendor fail"); }
  };

  try {
    const mockEventTag = EventFactory.createCardSubmitEvent({}, { parameters: { logFileId: "l1", newTag: "t1", newTitle: "n1" } });
    const resTag = processSubmissionWithNewTag(mockEventTag);
    assert.equal(notificationCalledWith, "Error adding tag: Tag fail");
    assert.deepEqual(resTag, { mockResponse: "presentNotification" });

    const mockEventVendor = EventFactory.createCardSubmitEvent({}, { parameters: { logFileId: "l1", newVendor: "v1" } });
    const resVendor = processSubmissionWithNewVendor(mockEventVendor);
    assert.equal(notificationCalledWith, "Error adding vendor: Vendor fail");
    assert.deepEqual(resVendor, { mockResponse: "presentNotification" });
  } finally {
    defaultCardPresenter.presentNotification = originalPresentNotification;
  }
});

test("CardPresenter - formatFieldTitleAndHint formats low AI confidence (<0.85) with ⚠️ title prefix and diagnostic hint text", () => {
  const presenter = new CardPresenter();
  const field: any = { key: "title", label: "Submittal Title", description: "Enter title", required: false };
  const fieldConfidence = { title: 0.65 };

  const result = presenter.formatFieldTitleAndHint(field, [], fieldConfidence);

  assert.equal(result.displayTitle, "⚠️ Submittal Title");
  assert.equal(result.hintText, "Low AI confidence (65%) — please verify");
});

test("CardPresenter - formatFieldTitleAndHint formats missing required field failing validation with ❌ title prefix", () => {
  const presenter = new CardPresenter();
  const field: any = { key: "section", label: "CSI Section", description: "CSI section number", required: true };
  const missingFields = ["section"];

  const result = presenter.formatFieldTitleAndHint(field, missingFields, {});

  assert.equal(result.displayTitle, "❌ CSI Section");
  assert.equal(result.hintText, "CSI section number");
});

test("CardPresenter - formatFieldTitleAndHint missing required field takes precedence (❌) over low AI confidence (⚠️)", () => {
  const presenter = new CardPresenter();
  const field: any = { key: "section", label: "CSI Section", description: "CSI section number", required: true };
  const missingFields = ["section"];
  const fieldConfidence = { section: 0.50 };

  const result = presenter.formatFieldTitleAndHint(field, missingFields, fieldConfidence);

  assert.equal(result.displayTitle, "❌ CSI Section");
  assert.equal(result.hintText, "CSI section number");
});

test("CardPresenter - formatFieldTitleAndHint high AI confidence (>=0.85) renders default title and description", () => {
  const presenter = new CardPresenter();
  const field: any = { key: "title", label: "Submittal Title", description: "Enter title", required: false };
  const fieldConfidence = { title: 0.92 };

  const result = presenter.formatFieldTitleAndHint(field, [], fieldConfidence);

  assert.equal(result.displayTitle, "Submittal Title");
  assert.equal(result.hintText, "Enter title");
});
