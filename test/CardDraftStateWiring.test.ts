import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness, EventFactory, CardSerializer } from "./harness";
import { CardDraftStateManager } from "../src/core/state/CardDraftStateManager";
import { onStateChange, onSpecTagChange, buildIntakeCard } from "../src/adapters/gas/UI";
import { defaultCardPresenter } from "../src/adapters/gas/CardPresenter";
import { processSubmission } from "../src/Process";

test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

test("CardDraftStateWiring - onStateChange saves current form input into UserCache draft", () => {
  const harness = GasMockHarness.install();
  const userCache = harness.userCache;

  const event = EventFactory.createCardSubmitEvent(
    {
      title: "Custom Steel Submittal",
      revision: "3",
      section: "051200",
      discipline: "Architecture"
    },
    {
      parameters: {
        messageId: "msg_test_wire_1"
      }
    }
  );

  const response = onStateChange(event);
  assert.ok(response);

  // UserCache must now have the draft for this context
  const contextKey = CardDraftStateManager.formatGmailContextKey("msg_test_wire_1");
  const draft = CardDraftStateManager.getDraft(userCache, contextKey);

  assert.ok(draft, "Draft state should be saved in UserCache");
  assert.equal(draft?.title, "Custom Steel Submittal");
  assert.equal(draft?.revision, "3");
  assert.equal(draft?.section, "051200");
});

test("CardDraftStateWiring - onSpecTagChange saves current form input into UserCache draft", () => {
  const harness = GasMockHarness.install();
  const userCache = harness.userCache;

  const event = EventFactory.createCardSubmitEvent(
    {
      specTag: "CH-02",
      specTitle: "Lounge Chair",
      vendor: "Steelcase",
      discipline: "FF&E"
    },
    {
      parameters: {
        messageId: "msg_test_wire_2"
      }
    }
  );

  const response = onSpecTagChange(event);
  assert.ok(response);

  const contextKey = CardDraftStateManager.formatGmailContextKey("msg_test_wire_2");
  const draft = CardDraftStateManager.getDraft(userCache, contextKey);

  assert.ok(draft, "Draft state should be saved in UserCache on spec tag change");
  assert.equal(draft?.specTag, "CH-02");
  assert.equal(draft?.specTitle, "Lounge Chair");
  assert.equal(draft?.vendor, "Steelcase");
});

test("CardDraftStateWiring - buildIntakeCard restores user-edited draft fields across discipline switch", () => {
  const harness = GasMockHarness.install();
  const userCache = harness.userCache;
  const messageId = "msg_discipline_switch";
  const contextKey = CardDraftStateManager.formatGmailContextKey(messageId);

  // 1. User types title and revision while on Architecture
  CardDraftStateManager.saveDraft(userCache, contextKey, {
    title: "Specialty Millwork Package",
    revision: "4",
    section: "064000",
    number: "005"
  });

  // 2. User switches dropdown to FF&E (live formInput only sends discipline change)
  const ffeEvent = EventFactory.createCardSubmitEvent(
    {
      documentType: "SUBMITTAL_FFE",
      discipline: "FF&E"
      // title and revision are not in this live event payload
    },
    {
      parameters: {
        messageId,
        documentType: "SUBMITTAL_FFE"
      }
    }
  );

  const card = buildIntakeCard(ffeEvent);
  const cardJson = CardSerializer.toJSON(card);

  // Verify that the title was preserved and restored from draft in UserCache!
  assert.ok(
    CardSerializer.hasWidgetText(cardJson, "Specialty Millwork Package"),
    "User-edited title must survive discipline transition"
  );
});

test("CardDraftStateWiring - Process submission evicts cached draft from UserCache", async () => {
  const harness = GasMockHarness.install();
  const userCache = harness.userCache;
  const messageId = "msg_process_evict";
  const contextKey = CardDraftStateManager.formatGmailContextKey(messageId);

  // Mock spreadsheet and log repository
  const mockSheet = { getSheetId: () => 101 };
  (globalThis as any).SpreadsheetApp = {
    openById: () => ({
      getSheetByName: () => mockSheet,
      getSheets: () => [mockSheet]
    })
  };

  const origGetLogSettings = (globalThis as any).defaultLogRepository?.getLogSettings;
  if ((globalThis as any).defaultLogRepository) {
    (globalThis as any).defaultLogRepository.getLogSettings = () => ({
      actions: [{ action: "Received", abbr: "REC", status: "Incoming" }],
      ffeTags: { tags: [], vendors: [], tagMap: {} }
    });
  }

  // Populate draft
  CardDraftStateManager.saveDraft(userCache, contextKey, {
    title: "Submittal to be filed",
    section: "033000"
  });

  assert.notEqual(CardDraftStateManager.getDraft(userCache, contextKey), null);

  const event = EventFactory.createCardSubmitEvent(
    {
      discipline: "Architecture",
      section: "033000",
      number: "001",
      revision: "0",
      title: "Submittal to be filed",
      action: "Received",
      contact: "ARCH",
      date: "260726",
      incomingRouting: "GC"
    },
    {
      parameters: {
        messageId,
        discipline: "Architecture",
        logFileId: "log123",
        targetFolderId: "folder123",
        project: "PROJ"
      }
    }
  );

  (globalThis as any).defaultWorkflowActionRouter = {
    executeWorkflow: async () => ({
      success: true,
      fileId: "filed_file_1",
      newFileName: "033000-001 Submittal to be filed",
      targetKey: "033000-001",
      action: "Received"
    })
  };

  try {
    await processSubmission(event);
    // The draft must now be cleared!
    assert.equal(CardDraftStateManager.getDraft(userCache, contextKey), null);
  } finally {
    delete (globalThis as any).defaultWorkflowActionRouter;
    if (origGetLogSettings && (globalThis as any).defaultLogRepository) {
      (globalThis as any).defaultLogRepository.getLogSettings = origGetLogSettings;
    }
  }
});
