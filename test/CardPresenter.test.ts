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
  })
};

let lastBuildMainCardArgs: any = null;
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
