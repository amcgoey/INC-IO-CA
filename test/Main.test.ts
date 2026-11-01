// test/Main.test.ts

import test from "node:test";
import assert from "node:assert";

// Global environment mocks before requiring Main.ts
(globalThis as any).CONFIG = {
  DEFAULT_DISCIPLINE: "Architecture",
  SUPPORTED_DISCIPLINES: ["Architecture", "FF&E"]
};

(globalThis as any).DocumentPipeline = {
  parseEmail: (msg: any) => ({
    driveName: "",
    discipline: "",
    specSection: "033000",
    revNum: "00",
    action: "Received"
  })
};

(globalThis as any).buildIntakeCard = (e: any, parsedData: any, flashMessage?: any) => ({
  cardType: "MainCard",
  parsedData,
  flashMessage
});

import { FakeAiAnalysisAdapter } from "./harness/index";
import { GasMockHarness } from "./harness/GasMockHarness";
import { CardSerializer } from "./harness/CardSerializer";
import { PrefixCacheManager } from "../src/core/admin/PrefixCacheManager";
import { GoogleScriptCacheAdapter } from "../src/adapters/gas/GoogleScriptCacheAdapter";
import {
  buildAddOn,
  onResetLogSearchCache,
  onClearAiTriageCache,
  onFlushContactsActionsCache
} from "../src/Main";

function setupGmailAppMock(messageId: string = "msg-main-001") {
  (globalThis as any).GmailApp = {
    setCurrentMessageAccessToken: (token: string) => {},
    getMessageById: (id: string) => ({
      getId: () => id,
      getFrom: () => "contractor@builder.com",
      getSubject: () => "Submittal 033000-00 Concrete",
      getPlainBody: () => "Submittal details text...",
      getThread: () => ({
        getLabels: () => []
      }),
      getReplyTo: () => "",
      getTo: () => "",
      getCc: () => "",
      getAttachments: () => []
    })
  };
}

test("Main.ts buildAddOn integration with FakeAiAnalysisAdapter - success triage path", async () => {
  setupGmailAppMock("msg-success-100");

  const fakeAiService = new FakeAiAnalysisAdapter();
  fakeAiService.setTriageResult({
    success: true,
    prediction: {
      predictedProjectName: "Project Alpha",
      predictedDiscipline: "FF&E"
    }
  });

  (globalThis as any).defaultAiAnalysisService = fakeAiService;

  const event = {
    gmail: {
      messageId: "msg-success-100",
      accessToken: "token-abc"
    }
  };

  const card: any = await buildAddOn(event);

  assert.strictEqual(card.cardType, "MainCard");
  assert.strictEqual(card.parsedData.driveName, "Project Alpha");
  assert.strictEqual(card.parsedData.discipline, "FF&E");
  assert.strictEqual(card.flashMessage, null);
  assert.strictEqual(fakeAiService.triageCalls.length, 1);
});

test("Main.ts buildAddOn integration - unsupported discipline falls back to DEFAULT_DISCIPLINE", async () => {
  setupGmailAppMock("msg-fallback-200");

  const fakeAiService = new FakeAiAnalysisAdapter();
  fakeAiService.setTriageResult({
    success: true,
    prediction: {
      predictedProjectName: "Project Beta",
      predictedDiscipline: "Civil" // Unsupported discipline
    }
  });

  (globalThis as any).defaultAiAnalysisService = fakeAiService;

  const event = {
    gmail: {
      messageId: "msg-fallback-200",
      accessToken: "token-abc"
    }
  };

  const card: any = await buildAddOn(event);

  assert.strictEqual(card.cardType, "MainCard");
  assert.strictEqual(card.parsedData.driveName, "Project Beta");
  assert.strictEqual(card.parsedData.discipline, "Architecture"); // Fallback discipline
});

test("Main.ts buildAddOn integration - error triage sets flashMessage warning and fallback discipline", async () => {
  setupGmailAppMock("msg-error-300");

  const fakeAiService = new FakeAiAnalysisAdapter();
  fakeAiService.setTriageResult({
    success: false,
    error: {
      code: "RATE_LIMITED",
      userMessage: "AI auto-triage skipped due to high server demand."
    }
  });

  (globalThis as any).defaultAiAnalysisService = fakeAiService;

  const event = {
    gmail: {
      messageId: "msg-error-300",
      accessToken: "token-abc"
    }
  };

  const card: any = await buildAddOn(event);

  assert.strictEqual(card.cardType, "MainCard");
  assert.strictEqual(card.parsedData.discipline, "Architecture");
  assert.notStrictEqual(card.flashMessage, null);
  assert.strictEqual(card.flashMessage.warning, "AI auto-triage skipped due to high server demand.");
});

// =========================================================================
// Ticket #309: Global Administrative Cache Eviction Entry Points
// =========================================================================

test("Ticket #309 - exports onResetLogSearchCache, onClearAiTriageCache, and onFlushContactsActionsCache on Main and globalThis", () => {
  assert.strictEqual(typeof onResetLogSearchCache, "function", "onResetLogSearchCache should be exported from Main.ts");
  assert.strictEqual(typeof onClearAiTriageCache, "function", "onClearAiTriageCache should be exported from Main.ts");
  assert.strictEqual(typeof onFlushContactsActionsCache, "function", "onFlushContactsActionsCache should be exported from Main.ts");

  const g = globalThis as any;
  assert.strictEqual(typeof g.onResetLogSearchCache, "function", "onResetLogSearchCache should exist on globalThis");
  assert.strictEqual(typeof g.onClearAiTriageCache, "function", "onClearAiTriageCache should exist on globalThis");
  assert.strictEqual(typeof g.onFlushContactsActionsCache, "function", "onFlushContactsActionsCache should exist on globalThis");
});

test("Ticket #309 - onResetLogSearchCache evicts only log_search_ prefixes in PrefixCacheManager and returns toast notification", () => {
  GasMockHarness.install();
  try {
    const cacheAdapter = new GoogleScriptCacheAdapter();
    const prefixManager = new PrefixCacheManager(cacheAdapter);

    // Populate scoped cache entries across distinct prefixes
    prefixManager.putScoped("log_search_", "log_search_unscoped_doc", JSON.stringify({ fileId: "111" }), 3600);
    prefixManager.putScoped("log_search_drive_abc_", "log_search_drive_abc_doc", JSON.stringify({ fileId: "222" }), 3600);
    prefixManager.putScoped("DOC_CONFIG_sheet_001", "DOC_CONFIG_sheet_001_sub", JSON.stringify({ cols: [] }), 3600);
    prefixManager.putScoped("ai_triage_", "ai_triage_msg_001", JSON.stringify({ pred: "Arch" }), 3600);
    prefixManager.putScoped("contacts_", "contacts_list_001", JSON.stringify(["Alice", "Bob"]), 3600);

    // Verify entries exist before eviction
    assert.ok(prefixManager.getScoped("log_search_", "log_search_unscoped_doc") !== null);
    assert.ok(prefixManager.getScoped("log_search_drive_abc_", "log_search_drive_abc_doc") !== null);
    assert.ok(prefixManager.getScoped("DOC_CONFIG_sheet_001", "DOC_CONFIG_sheet_001_sub") !== null);
    assert.ok(prefixManager.getScoped("ai_triage_", "ai_triage_msg_001") !== null);
    assert.ok(prefixManager.getScoped("contacts_", "contacts_list_001") !== null);

    // Invoke handler with driveId parameter
    const event = {
      parameters: {
        driveId: "drive_abc"
      }
    };
    const response = onResetLogSearchCache(event);
    const actionJson = CardSerializer.actionResponseToJSON(response);

    // Check toast notification returned
    assert.ok(actionJson.notification?.text?.includes("Log search cache reset"), `Expected toast message, got: ${actionJson.notification?.text}`);

    // Verify targeted log_search_ prefixes evicted
    assert.strictEqual(prefixManager.getScoped("log_search_", "log_search_unscoped_doc"), null);
    assert.strictEqual(prefixManager.getScoped("log_search_drive_abc_", "log_search_drive_abc_doc"), null);

    // Verify unrelated scopes remain intact
    assert.ok(prefixManager.getScoped("DOC_CONFIG_sheet_001", "DOC_CONFIG_sheet_001_sub") !== null, "DOC_CONFIG must not be evicted");
    assert.ok(prefixManager.getScoped("ai_triage_", "ai_triage_msg_001") !== null, "ai_triage must not be evicted");
    assert.ok(prefixManager.getScoped("contacts_", "contacts_list_001") !== null, "contacts must not be evicted");
  } finally {
    GasMockHarness.uninstall();
  }
});

test("Ticket #309 - onClearAiTriageCache evicts only ai_triage_ and ai_pred_ prefixes in PrefixCacheManager and returns toast", () => {
  GasMockHarness.install();
  try {
    const cacheAdapter = new GoogleScriptCacheAdapter();
    const prefixManager = new PrefixCacheManager(cacheAdapter);

    prefixManager.putScoped("ai_triage_", "ai_triage_item_1", JSON.stringify({ triage: true }), 3600);
    prefixManager.putScoped("ai_pred_", "ai_pred_item_2", JSON.stringify({ pred: true }), 3600);
    prefixManager.putScoped("DOC_CONFIG_sheet_002", "DOC_CONFIG_sheet_002_data", JSON.stringify({ config: true }), 3600);
    prefixManager.putScoped("log_search_", "log_search_entry", JSON.stringify({ item: 1 }), 3600);
    prefixManager.putScoped("contacts_", "contacts_entry", JSON.stringify({ name: "Dan" }), 3600);

    const response = onClearAiTriageCache();
    const actionJson = CardSerializer.actionResponseToJSON(response);

    assert.ok(actionJson.notification?.text?.includes("AI triage cache cleared"), `Expected toast message, got: ${actionJson.notification?.text}`);

    // Verify targeted AI prefixes evicted
    assert.strictEqual(prefixManager.getScoped("ai_triage_", "ai_triage_item_1"), null);
    assert.strictEqual(prefixManager.getScoped("ai_pred_", "ai_pred_item_2"), null);

    // Verify unrelated scopes remain intact
    assert.ok(prefixManager.getScoped("DOC_CONFIG_sheet_002", "DOC_CONFIG_sheet_002_data") !== null);
    assert.ok(prefixManager.getScoped("log_search_", "log_search_entry") !== null);
    assert.ok(prefixManager.getScoped("contacts_", "contacts_entry") !== null);
  } finally {
    GasMockHarness.uninstall();
  }
});

test("Ticket #309 - onFlushContactsActionsCache evicts only contacts_, actions_, and log_settings_ prefixes in PrefixCacheManager and returns toast", () => {
  GasMockHarness.install();
  try {
    const cacheAdapter = new GoogleScriptCacheAdapter();
    const prefixManager = new PrefixCacheManager(cacheAdapter);

    prefixManager.putScoped("contacts_", "contacts_pick_1", JSON.stringify(["Subcontractor A"]), 3600);
    prefixManager.putScoped("actions_", "actions_pick_2", JSON.stringify(["Reviewed", "Rejected"]), 3600);
    prefixManager.putScoped("log_settings_", "log_settings_sheet_3", JSON.stringify({ sheet: "Submittals" }), 3600);
    prefixManager.putScoped("DOC_CONFIG_sheet_003", "DOC_CONFIG_entry", JSON.stringify({ valid: true }), 3600);
    prefixManager.putScoped("log_search_", "log_search_unrelated", JSON.stringify({ file: "abc" }), 3600);
    prefixManager.putScoped("ai_triage_", "ai_triage_unrelated", JSON.stringify({ score: 0.99 }), 3600);

    const response = onFlushContactsActionsCache();
    const actionJson = CardSerializer.actionResponseToJSON(response);

    assert.ok(actionJson.notification?.text?.includes("Contacts and actions cache flushed"), `Expected toast message, got: ${actionJson.notification?.text}`);

    // Verify targeted prefixes evicted
    assert.strictEqual(prefixManager.getScoped("contacts_", "contacts_pick_1"), null);
    assert.strictEqual(prefixManager.getScoped("actions_", "actions_pick_2"), null);
    assert.strictEqual(prefixManager.getScoped("log_settings_", "log_settings_sheet_3"), null);

    // Verify unrelated scopes remain intact
    assert.ok(prefixManager.getScoped("DOC_CONFIG_sheet_003", "DOC_CONFIG_entry") !== null);
    assert.ok(prefixManager.getScoped("log_search_", "log_search_unrelated") !== null);
    assert.ok(prefixManager.getScoped("ai_triage_", "ai_triage_unrelated") !== null);
  } finally {
    GasMockHarness.uninstall();
  }
});
