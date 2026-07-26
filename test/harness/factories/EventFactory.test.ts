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
  const event = createCardSubmitEvent({
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

test("EventFactory - createCardSubmitEvent normalizes numbers and booleans into string representations", () => {
  const event = createCardSubmitEvent({
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
  const event = createCardSubmitEvent(
    { section: "01 33 00" },
    { parameters: { action: "save" } }
  );

  assert.deepStrictEqual(event.parameters, { action: "save" });
  assert.deepStrictEqual(event.formInput, { section: "01 33 00" });
  assert.deepStrictEqual(event.formInputs, { section: ["01 33 00"] });
});

test("EventFactory - createGmailContextEvent creates valid Gmail trigger payload with defaults and overrides", () => {
  const defaultEvent = createGmailContextEvent();

  assert.deepStrictEqual(defaultEvent.gmail, {
    messageId: "msg-test-123",
    accessToken: "mock-access-token"
  });
  assert.deepStrictEqual(defaultEvent.formInput, {});
  assert.deepStrictEqual(defaultEvent.formInputs, {});

  const customEvent = EventFactory.createGmailContextEvent({
    messageId: "custom-msg-999",
    parameters: { source: "inbox" }
  });

  assert.strictEqual(customEvent.gmail?.messageId, "custom-msg-999");
  assert.strictEqual(customEvent.gmail?.accessToken, "mock-access-token");
  assert.deepStrictEqual(customEvent.parameters, { source: "inbox" });
});

test("EventFactory - createDriveContextEvent creates valid Drive trigger payload with defaults and overrides", () => {
  const defaultEvent = createDriveContextEvent();

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
  const customEvent = createDriveContextEvent({ selectedItems: customItems });

  assert.deepStrictEqual(customEvent.drive?.selectedItems, customItems);
});
