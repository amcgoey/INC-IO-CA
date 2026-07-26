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

(globalThis as any).buildMainCard = (e: any, parsedData: any, isTagChange?: boolean, flashMessage?: any) => ({
  cardType: "MainCard",
  parsedData,
  isTagChange,
  flashMessage
});

const { FakeAiAnalysisAdapter } = require("./harness/index");
const { buildAddOn } = require("../src/Main");

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
