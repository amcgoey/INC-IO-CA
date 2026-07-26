import test from "node:test";
import assert from "node:assert/strict";

// Global GAS mocks
(globalThis as any).CONFIG = { LOGO_URL: "" };
(globalThis as any).CardService = {
  newActionResponseBuilder: () => {
    let resNav: any = null, resNotif: any = null;
    const builder: any = {
      setNavigation: (nav: any) => { resNav = nav; return builder; },
      setNotification: (notif: any) => { resNotif = notif; return builder; },
      build: () => ({ navigation: resNav, notification: resNotif })
    };
    return builder;
  },
  newNavigation: () => ({
    updateCard: (card: any) => ({ card, action: "updateCard" }),
    pushCard: (card: any) => ({ card, action: "pushCard" })
  }),
  newNotification: () => {
    let textVal = "";
    const notif: any = {
      setText: (txt: string) => { textVal = txt; return notif; },
      getText: () => textVal
    };
    return notif;
  },
  newCardBuilder: () => {
    const builder: any = {
      setHeader: () => builder,
      addSection: () => builder,
      build: () => ({ cardType: "SuccessCard" })
    };
    return builder;
  },
  newCardHeader: () => {
    const header: any = {
      setTitle: () => header,
      setImageUrl: () => header
    };
    return header;
  },
  newCardSection: () => {
    const section: any = {
      addWidget: () => section
    };
    return section;
  },
  newTextParagraph: () => ({
    setText: () => ({})
  }),
  newButtonSet: () => {
    const btnSet: any = {
      addButton: () => btnSet
    };
    return btnSet;
  },
  newTextButton: () => {
    const btn: any = {
      setText: () => btn,
      setOpenLink: () => btn,
      setOnClickAction: () => btn,
      setTextButtonStyle: () => btn
    };
    return btn;
  },
  newOpenLink: () => ({
    setUrl: () => ({})
  }),
  newTextInput: () => {
    const input: any = {
      setFieldName: () => input,
      setTitle: () => input,
      setValue: () => input
    };
    return input;
  },
  newAction: () => {
    const action: any = {
      setFunctionName: () => action,
      setParameters: () => action
    };
    return action;
  },
  TextButtonStyle: {
    FILLED: "FILLED",
    OUTLINED: "OUTLINED"
  }
};

let lastBuildMainCardArgs: any = null;
let lastBuildSuccessCardArgs: any = null;
(globalThis as any).buildSuccessCard = (...args: any[]) => {
  lastBuildSuccessCardArgs = args;
  return { cardType: "SuccessCard", args };
};

(globalThis as any).buildMainCard = (e: any, initialData: any, isTagChange: any, flashData: any) => {
  lastBuildMainCardArgs = { e, initialData, isTagChange, flashData };
  return { cardType: "MainCard", flashData };
};

let removedKeys: string[] = [];
(globalThis as any).CacheService = {
  getUserCache: () => ({
    removeAll: (keys: string[]) => { removedKeys.push(...keys); }
  })
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

const { CardPresenter, defaultCardPresenter } = require("../src/CardPresenter");
const { onStateChange, onSpecTagChange, handleRefreshCache, handleFetchUrl, handleDeepAnalysis, createDraftEmail, processSubmissionWithNewTag, processSubmissionWithNewVendor } = require("../src/UI");

test("CardPresenter - presentValidationError formats error flash and returns ActionResponse updateCard", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = { formInput: { discipline: "Architecture" } };
  const errors = ["Title is required", "Date is invalid"];
  const missingFields = ["title", "date"];

  const response = presenter.presentValidationError(mockEvent, errors, missingFields);

  assert.deepEqual(lastBuildMainCardArgs, {
    e: mockEvent,
    initialData: null,
    isTagChange: false,
    flashData: {
      error: "Title is required\nDate is invalid",
      missingFields: ["title", "date"]
    }
  });

  assert.ok(response);
  assert.equal(response.navigation.action, "updateCard");
  assert.equal(response.navigation.card.cardType, "MainCard");
  assert.deepEqual(response.navigation.card.flashData, {
    error: "Title is required\nDate is invalid",
    missingFields: ["title", "date"]
  });
});

test("CardPresenter - presentValidationError handles optional missingFields", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = { formInput: {} };
  const errors = ["General error"];

  const response = presenter.presentValidationError(mockEvent, errors);

  assert.deepEqual(lastBuildMainCardArgs.flashData, {
    error: "General error",
    missingFields: []
  });

  assert.equal(response.navigation.action, "updateCard");
});

test("CardPresenter - defaultCardPresenter is exported and functional", () => {
  assert.ok(defaultCardPresenter);
  assert.ok(defaultCardPresenter instanceof CardPresenter);
});

test("CardPresenter - presentCardReload updates main card with default isTagChange false", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = { formInput: { discipline: "Architecture" } };

  const response = presenter.presentCardReload(mockEvent);

  assert.deepEqual(lastBuildMainCardArgs, {
    e: mockEvent,
    initialData: null,
    isTagChange: false,
    flashData: undefined
  });

  assert.ok(response);
  assert.equal(response.navigation.action, "updateCard");
  assert.equal(response.navigation.card.cardType, "MainCard");
});

test("CardPresenter - presentCardReload propagates isTagChange true flag", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = { formInput: { specTag: "A-101" } };

  const response = presenter.presentCardReload(mockEvent, true);

  assert.deepEqual(lastBuildMainCardArgs, {
    e: mockEvent,
    initialData: null,
    isTagChange: true,
    flashData: undefined
  });

  assert.ok(response);
  assert.equal(response.navigation.action, "updateCard");
  assert.equal(response.navigation.card.cardType, "MainCard");
});

test("CardPresenter - presentCacheRefresh updates main card and sets notification toast", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = { parameters: { driveId: "drive1" } };

  const response = presenter.presentCacheRefresh(mockEvent);

  assert.ok(response);
  assert.equal(response.navigation.action, "updateCard");
  assert.equal(response.navigation.card.cardType, "MainCard");
  assert.ok(response.notification);
  assert.equal(response.notification.getText(), "✅ Cache cleared. Data reloaded.");
});

test("CardPresenter - presentFetchUrlResult builds main card with flash message and optional notification", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = { parameters: {} };
  const flashMessage = { debugPhase2: "Saved file" };

  const response = presenter.presentFetchUrlResult(mockEvent, flashMessage, "✅ Fetched successfully!");

  assert.ok(response);
  assert.equal(response.navigation.action, "updateCard");
  assert.equal(response.navigation.card.cardType, "MainCard");
  assert.deepEqual(response.navigation.card.flashData, flashMessage);
  assert.ok(response.notification);
  assert.equal(response.notification.getText(), "✅ Fetched successfully!");
});

test("CardPresenter - presentNotification returns notification-only action response", () => {
  const presenter = new CardPresenter();
  const response = presenter.presentNotification("Test Notification");

  assert.ok(response);
  assert.equal(response.navigation, null);
  assert.ok(response.notification);
  assert.equal(response.notification.getText(), "Test Notification");
});

test("UI.ts - onStateChange delegates navigation update to defaultCardPresenter.presentCardReload", () => {
  let reloadCalledWith: any = null;
  const originalPresentCardReload = defaultCardPresenter.presentCardReload;

  defaultCardPresenter.presentCardReload = (e: any, isTagChange?: boolean) => {
    reloadCalledWith = { e, isTagChange };
    return { mockResponse: "onStateChange" } as any;
  };

  try {
    const mockEvent: any = { formInput: { discipline: "Architecture" } };
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
    const mockEvent: any = { formInput: { specTag: "A-101" } };
    const response = onSpecTagChange(mockEvent);

    assert.deepEqual(reloadCalledWith, { e: mockEvent, isTagChange: true });
    assert.deepEqual(response, { mockResponse: "onSpecTagChange" });
  } finally {
    defaultCardPresenter.presentCardReload = originalPresentCardReload;
  }
});

test("CardPresenter - presentOutgoingSuccess builds pushed SuccessCard ActionResponse for Architecture", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = {
    formInput: {
      discipline: "Architecture",
      section: "033000",
      title: "Concrete Submittal",
      action: "Approved"
    }
  };
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

  assert.ok(response);
  assert.equal(response.navigation.action, "pushCard");
  assert.equal(response.navigation.card.cardType, "SuccessCard");
  assert.equal(lastBuildSuccessCardArgs[0], "file-123");
  assert.equal(lastBuildSuccessCardArgs[1], "033000-001 Concrete");
  assert.equal(lastBuildSuccessCardArgs[2], "http://drive.google.com/file-123");
  assert.equal(lastBuildSuccessCardArgs[3], "G:\\My Drive\\file-123");
  assert.equal(lastBuildSuccessCardArgs[4], "033000-001");
  assert.equal(lastBuildSuccessCardArgs[5], "Concrete Submittal");
  assert.equal(lastBuildSuccessCardArgs[6], "Architecture");
  assert.equal(lastBuildSuccessCardArgs[7], "033000");
  assert.equal(lastBuildSuccessCardArgs[9], "folder-456");
  assert.equal(lastBuildSuccessCardArgs[10], "log-789");
  assert.equal(lastBuildSuccessCardArgs[11], false);
});

test("CardPresenter - presentOutgoingSuccess builds pushed SuccessCard ActionResponse for FF&E", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = {
    formInput: {
      discipline: "FF&E",
      specTag: "CH-01",
      specTitle: "Side Chair",
      action: "Approved"
    }
  };
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

  assert.ok(response);
  assert.equal(response.navigation.action, "pushCard");
  assert.equal(lastBuildSuccessCardArgs[6], "FF&E");
  assert.equal(lastBuildSuccessCardArgs[8], "CH-01");
});

test("CardPresenter - presentMoveToClosedSuccess updates card with toast notification", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = {};
  const mockUpdatedCard: any = { cardType: "SuccessCardUpdated" };
  const destName = "Closed/Concrete";

  const response = presenter.presentMoveToClosedSuccess(mockEvent, mockUpdatedCard, destName);

  assert.ok(response);
  assert.equal(response.navigation.action, "updateCard");
  assert.deepEqual(response.navigation.card, mockUpdatedCard);
  assert.equal(response.notification.getText(), "Moved to Closed/Concrete");
});

test("UI.ts - handleRefreshCache invalidates cache and delegates response to defaultCardPresenter.presentCacheRefresh", () => {
  let refreshCalledWith: any = null;
  const originalPresentCacheRefresh = defaultCardPresenter.presentCacheRefresh;

  defaultCardPresenter.presentCacheRefresh = (e: any) => {
    refreshCalledWith = e;
    return { mockResponse: "handleRefreshCache" } as any;
  };

  try {
    removedKeys = [];
    const mockEvent: any = { parameters: { driveId: "drive123", logFileId: "log456" } };
    const response = handleRefreshCache(mockEvent);

    assert.deepEqual(removedKeys, [
      "cached_shared_drives",
      "log_search_drive123",
      "log_settings_log456_Architecture",
      "log_settings_log456_FF&E"
    ]);
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
    const mockEventNoFolder: any = { parameters: {} };
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
    const mockEventFail: any = { parameters: { targetFolderId: "folder1", url: "fail_url" } };
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
    const mockEvent: any = { parameters: { targetFolderId: "folder1", url: "http://example.com/file.pdf" }, formInput: {} };
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
  const mockEvent: any = { parameters: { discipline: "Architecture" }, formInput: {} };
  const mockResult: any = {
    success: true,
    analysis: { predictedSection: "033000", predictedTitle: "Cast-in-Place Concrete" }
  };

  const response = presenter.presentDeepAnalysisResult(mockEvent, mockResult);

  assert.equal(mockEvent.formInput.section, "033000");
  assert.equal(mockEvent.formInput.title, "Cast-in-Place Concrete");
  assert.ok(response);
  assert.equal(response.navigation.action, "updateCard");
  assert.equal(response.navigation.card.cardType, "MainCard");
  assert.ok(response.notification);
  assert.equal(response.notification.getText(), "✅ Analysis complete!");
});

test("CardPresenter - presentDeepAnalysisResult returns error notification toast on failed analysisResult", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = { formInput: {} };
  const mockErrorResult: any = {
    success: false,
    error: { code: "RATE_LIMITED", userMessage: "Quota exceeded" }
  };

  const response = presenter.presentDeepAnalysisResult(mockEvent, mockErrorResult);

  assert.ok(response);
  assert.equal(response.navigation, null);
  assert.ok(response.notification);
  assert.equal(response.notification.getText(), "⚠️ AI Busy.");
});

test("CardPresenter - presentDraftEmailSuccess returns updateCard with updated success card and SUCCESS_DRAFT_CREATED notification", () => {
  const presenter = new CardPresenter();
  const mockEvent: any = {};
  const mockUpdatedSuccessCard: any = { cardType: "SuccessCardWithDraftUrl" };

  const response = presenter.presentDraftEmailSuccess(mockEvent, mockUpdatedSuccessCard);

  assert.ok(response);
  assert.equal(response.navigation.action, "updateCard");
  assert.deepEqual(response.navigation.card, mockUpdatedSuccessCard);
  assert.ok(response.notification);
  assert.equal(response.notification.getText(), "✅ Draft created.");
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
    const mockEvent: any = {
      parameters: { driveFileId: "file123", discipline: "Architecture" },
      formInput: {}
    };

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
    const mockEvent: any = {
      formInput: { fileSource: "http://example.com/doc.pdf", driveFileUrl: "http://drive.google.com/doc.pdf" }
    };

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
    const mockEvent: any = {
      parameters: { fileId: "f1", title: "Test", action: "Approved" }
    };

    const response = createDraftEmail(mockEvent);

    assert.equal(draftSuccessCalledWith.e, mockEvent);
    assert.equal(draftSuccessCalledWith.card.cardType, "SuccessCard");
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
    const mockEventTag: any = { parameters: { logFileId: "l1", newTag: "t1", newTitle: "n1" } };
    const resTag = processSubmissionWithNewTag(mockEventTag);
    assert.equal(notificationCalledWith, "Error adding tag: Tag fail");
    assert.deepEqual(resTag, { mockResponse: "presentNotification" });

    const mockEventVendor: any = { parameters: { logFileId: "l1", newVendor: "v1" } };
    const resVendor = processSubmissionWithNewVendor(mockEventVendor);
    assert.equal(notificationCalledWith, "Error adding vendor: Vendor fail");
    assert.deepEqual(resVendor, { mockResponse: "presentNotification" });
  } finally {
    defaultCardPresenter.presentNotification = originalPresentNotification;
  }
});
