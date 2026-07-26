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
  newNotification: () => ({
    setText: (t: string) => t
  }),
  newNavigation: () => ({
    updateCard: (card: any) => ({ card, action: "updateCard" }),
    pushCard: (card: any) => ({ card, action: "pushCard" })
  })
};

let lastBuildMainCardArgs: any = null;
let lastBuildSuccessCardArgs: any = null;
(globalThis as any).buildSuccessCard = (...args: any[]) => {
  lastBuildSuccessCardArgs = args;
  return { cardType: "SuccessCard", args };
};

(globalThis as any).MESSAGES = {
  SUCCESS_MOVED: (f: string) => `Moved to ${f}`
};
(globalThis as any).buildMainCard = (e: any, initialData: any, isTagChange: any, flashData: any) => {
  lastBuildMainCardArgs = { e, initialData, isTagChange, flashData };
  return { cardType: "MainCard", flashData };
};

const { CardPresenter, defaultCardPresenter } = require("../src/CardPresenter");
const { onStateChange, onSpecTagChange } = require("../src/UI");

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
  assert.equal(lastBuildSuccessCardArgs[0], "file-123"); // fileId
  assert.equal(lastBuildSuccessCardArgs[1], "033000-001 Concrete"); // newFileName
  assert.equal(lastBuildSuccessCardArgs[2], "http://drive.google.com/file-123"); // url
  assert.equal(lastBuildSuccessCardArgs[3], "G:\\My Drive\\file-123"); // localPath
  assert.equal(lastBuildSuccessCardArgs[4], "033000-001"); // targetKey
  assert.equal(lastBuildSuccessCardArgs[5], "Concrete Submittal"); // itemTitle
  assert.equal(lastBuildSuccessCardArgs[6], "Architecture"); // discipline
  assert.equal(lastBuildSuccessCardArgs[7], "033000"); // section
  assert.equal(lastBuildSuccessCardArgs[9], "folder-456"); // targetFolderId
  assert.equal(lastBuildSuccessCardArgs[10], "log-789"); // logFileId
  assert.equal(lastBuildSuccessCardArgs[11], false); // isFiled
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
  assert.equal(response.notification, "Moved to Closed/Concrete");
});
