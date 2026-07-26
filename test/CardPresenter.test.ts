import test from "node:test";
import assert from "node:assert/strict";

// Global GAS mocks
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
  }
};

let lastBuildMainCardArgs: any = null;
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
  ERROR_TARGET_FOLDER: "❌ Error: Target folder not resolved. Please select a Drive/Log first.",
  WARNING_AUTH_WALL: "⚠️ Cannot download: File is behind a login wall. Please download manually and use 'Google Drive URL'.",
  WARNING_NOT_WHITELISTED: "⚠️ Domain not whitelisted. Please manually download the file and use 'Google Drive URL'.",
  ERROR_FETCH_FAILED: (err: any) => `❌ Fetch failed: ${err}`,
  SUCCESS_FETCHED: "✅ Fetched successfully!",
  DEBUG_SAVED_TO_DRIVE: (fileName: string, fileId: string) => `✅ Saved ${fileName} to Drive.\nDriveFileId: ${fileId}`
};

const { CardPresenter, defaultCardPresenter } = require("../src/CardPresenter");
const { onStateChange, onSpecTagChange, handleRefreshCache, handleFetchUrl } = require("../src/UI");

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
