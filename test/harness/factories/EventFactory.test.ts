// test/harness/factories/EventFactory.test.ts

import test from "node:test";
import assert from "node:assert";
import {
  EventFactory,
  createCardSubmitEvent,
  createGmailContextEvent,
  createDriveContextEvent
} from "./EventFactory";

test("EventFactory - createCardSubmitEvent normalizes scalar string inputs into dual formInput and formInputs", () => {
  const event = EventFactory.createCardSubmitEvent({
    section: "01 33 00",
    title: "Concrete Formwork"
  });

  assert.deepStrictEqual(event.formInput, {
    section: "01 33 00",
    title: "Concrete Formwork"
  });

  assert.deepStrictEqual(event.formInputs, {
    section: ["01 33 00"],
    title: ["Concrete Formwork"]
  });
});

test("EventFactory - createCardSubmitEvent normalizes string array inputs into dual formInput and formInputs", () => {
  const event = EventFactory.createCardSubmitEvent({
    relatedTag: ["TAG-1", "TAG-2"]
  });

  assert.deepStrictEqual(event.formInput, {
    relatedTag: "TAG-1"
  });

  assert.deepStrictEqual(event.formInputs, {
    relatedTag: ["TAG-1", "TAG-2"]
  });
});

test("EventFactory - createCardSubmitEvent handles empty arrays without setting formInput scalar", () => {
  const event = EventFactory.createCardSubmitEvent({
    emptyTags: []
  });

  assert.strictEqual(event.formInput?.emptyTags, undefined);
  assert.deepStrictEqual(event.formInputs?.emptyTags, []);
});

test("EventFactory - createCardSubmitEvent normalizes numbers and booleans into string representations", () => {
  const event = EventFactory.createCardSubmitEvent({
    revision: 2,
    isApproved: true
  });

  assert.deepStrictEqual(event.formInput, {
    revision: "2",
    isApproved: "true"
  });

  assert.deepStrictEqual(event.formInputs, {
    revision: ["2"],
    isApproved: ["true"]
  });
});

test("EventFactory - createCardSubmitEvent merges overrides and custom parameters", () => {
  const event = EventFactory.createCardSubmitEvent(
    { section: "01 33 00" },
    { parameters: { action: "save" } }
  );

  assert.deepStrictEqual(event.parameters, { action: "save" });
  assert.deepStrictEqual(event.formInput, { section: "01 33 00" });
  assert.deepStrictEqual(event.formInputs, { section: ["01 33 00"] });
});

test("EventFactory - createGmailContextEvent creates valid Gmail trigger payload with defaults, inputs, and overrides", () => {
  const defaultEvent = EventFactory.createGmailContextEvent();

  assert.deepStrictEqual(defaultEvent.gmail, {
    messageId: "msg-test-123",
    accessToken: "mock-access-token"
  });
  assert.deepStrictEqual(defaultEvent.formInput, {});
  assert.deepStrictEqual(defaultEvent.formInputs, {});

  const customEvent = EventFactory.createGmailContextEvent(
    { section: "01 33 00" },
    { messageId: "custom-msg-999", parameters: { source: "inbox" } }
  );

  assert.strictEqual(customEvent.gmail?.messageId, "custom-msg-999");
  assert.strictEqual(customEvent.gmail?.accessToken, "mock-access-token");
  assert.deepStrictEqual(customEvent.parameters, { source: "inbox" });
  assert.deepStrictEqual(customEvent.formInput, { section: "01 33 00" });
  assert.deepStrictEqual(customEvent.formInputs, { section: ["01 33 00"] });
});

test("EventFactory - createDriveContextEvent creates valid Drive trigger payload with defaults, inputs, and overrides", () => {
  const defaultEvent = EventFactory.createDriveContextEvent();

  assert.deepStrictEqual(defaultEvent.drive, {
    selectedItems: [
      {
        id: "drive-file-123",
        title: "Test_Submittal.pdf",
        mimeType: "application/pdf"
      }
    ]
  });
  assert.deepStrictEqual(defaultEvent.formInput, {});
  assert.deepStrictEqual(defaultEvent.formInputs, {});

  const customItems = [
    { id: "file-abc", title: "Spec.pdf", mimeType: "application/pdf" }
  ];
  const customEvent = EventFactory.createDriveContextEvent(
    { specTag: "TAG-001" },
    { selectedItems: customItems }
  );

  assert.deepStrictEqual(customEvent.drive?.selectedItems, customItems);
  assert.deepStrictEqual(customEvent.formInput, { specTag: "TAG-001" });
  assert.deepStrictEqual(customEvent.formInputs, { specTag: ["TAG-001"] });
});

test("EventFactory - exported standalone functions function identically to static methods", () => {
  const cardEvt = createCardSubmitEvent({ k: "v" });
  assert.deepStrictEqual(cardEvt.formInput, { k: "v" });

  const gmailEvt = createGmailContextEvent();
  assert.strictEqual(gmailEvt.gmail?.messageId, "msg-test-123");

  const driveEvt = createDriveContextEvent();
  assert.strictEqual(driveEvt.drive?.selectedItems[0].id, "drive-file-123");
});
