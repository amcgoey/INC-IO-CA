import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { GasMockHarness, CardSerializer } from "./harness";

test.beforeEach(() => {
  GasMockHarness.install({
    CONFIG: {
      DEFAULT_DISCIPLINE: "Architecture",
      DEFAULT_ACTION: "Received",
      DEFAULT_REVISION: "00",
      DEFAULT_INCOMING_ROUTING: "Review Required",
      SUPPORTED_DISCIPLINES: ["Architecture", "FF&E"]
    }
  });
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

(globalThis as any).MESSAGES = {
  MAIN_CARD_TITLE: "Submittal Intake",
  WARNING_AI_AUTO_TRIAGE: (w: string) => `AI Warning: ${w}`
};

(globalThis as any).formatGasDate = (d: Date) => "240115";

const { DocumentPipeline } = require("../src/DocumentPipeline");
require("../src/AiAnalysisService");
require("../src/TriageDocumentAction");

(globalThis as any).DocumentPipeline = DocumentPipeline;

const { buildMainCard } = require("../src/UI");
const { buildAddOn } = require("../src/Main");

function createMockGmailMessage(from: string, replyTo: string, subject: string, plainBody: string) {
  return {
    getId: () => "msg-mock-123",
    getFrom: () => from,
    getReplyTo: () => replyTo,
    getSubject: () => subject,
    getPlainBody: () => plainBody,
    getBody: () => plainBody,
    getDate: () => new Date("2026-07-27T12:00:00Z"),
    getThread: () => ({ getLabels: () => [] }),
    getTo: () => "ca@inc.nyc",
    getCc: () => "",
    getAttachments: () => []
  };
}

test("UI Intake Binding - Matched Email 1 (Procore Distributed) populates UI form widgets", async () => {
  const emlPath = path.resolve(__dirname, "../.scratch/submittal email examples/24003-01, 38 East 35th Street_ Submittal Distributed 099100-17.0, PT432 - Public Spaces Limewash Samples.eml");
  const content = fs.readFileSync(emlPath, "utf-8");

  const subjMatch = content.match(/^Subject:\s*([\s\S]*?)(?=\r?\n[A-Z][A-Za-z0-9-]*:|\r?\n\r?\n)/im);
  const subject = subjMatch ? subjMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';

  const msg = createMockGmailMessage(
    "Olivia O'Rourke (CM & Associates) <CM__Associates@us02.procoretech.com>",
    "do-not-reply@procore.com",
    subject,
    content
  );

  const parsed = DocumentPipeline.parseEmail(msg as any);
  assert.equal(parsed.specSection, "099100");
  assert.equal(parsed.section, "099100");
  assert.equal(parsed.submittalNum, "017");
  assert.equal(parsed.number, "017");
  assert.equal(parsed.revNum, "0");
  assert.equal(parsed.revision, "0");
  assert.equal(parsed.title, "PT432 - Public Spaces Limewash Samples");
  assert.equal(parsed.action, "Received");

  (globalThis as any).GmailApp = {
    setCurrentMessageAccessToken: (t: string) => {},
    getMessageById: () => msg
  };

  const event = { gmail: { messageId: "msg-mock-123", accessToken: "token-123" } };
  const card: any = await buildAddOn(event);

  assert.ok(card);
  const cardJson = CardSerializer.toJSON(card);
  assert.ok(CardSerializer.hasWidgetText(cardJson, "099100"));
  assert.ok(CardSerializer.hasWidgetText(cardJson, "017"));
});

test("UI Intake Binding - Matched Email 2 (Procore Approver Response Updated) populates UI form widgets", async () => {
  const emlPath = path.resolve(__dirname, "../.scratch/submittal email examples/Action Required_ 24003-01, 38 East 35th Street_ Approver Erwan Malki Updated their Response for Submittal 084113-11.2, Entrance Canopy Shop Drawing.eml");
  const content = fs.readFileSync(emlPath, "utf-8");

  const subjMatch = content.match(/^Subject:\s*([\s\S]*?)(?=\r?\n[A-Z][A-Za-z0-9-]*:|\r?\n\r?\n)/im);
  const subject = subjMatch ? subjMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';

  const msg = createMockGmailMessage(
    "'Erwan Malki (Socotec, Inc)' via 26 E 35 CA <26-e-35-ca@inc.nyc>",
    "do-not-reply@procore.com",
    subject,
    content
  );

  const parsed = DocumentPipeline.parseEmail(msg as any);
  assert.equal(parsed.specSection, "084113");
  assert.equal(parsed.section, "084113");
  assert.equal(parsed.submittalNum, "011");
  assert.equal(parsed.number, "011");
  assert.equal(parsed.revNum, "2");
  assert.equal(parsed.revision, "2");
  assert.equal(parsed.title, "Entrance Canopy Shop Drawing");
  assert.equal(parsed.action, "Received");

  (globalThis as any).GmailApp = {
    setCurrentMessageAccessToken: (t: string) => {},
    getMessageById: () => msg
  };

  const event = { gmail: { messageId: "msg-mock-123", accessToken: "token-123" } };
  const card: any = await buildAddOn(event);

  assert.ok(card);
  const cardJson = CardSerializer.toJSON(card);
  assert.ok(CardSerializer.hasWidgetText(cardJson, "084113"));
  assert.ok(CardSerializer.hasWidgetText(cardJson, "011"));
});

test("UI Intake Binding - Matched Email 4 (Autodesk Forma) populates UI form widgets and body title", async () => {
  const emlPath = path.resolve(__dirname, "../.scratch/submittal email examples/Ballston Macy's - Submittal #06 20 00-003-00 was provided for your information (1).eml");
  const content = fs.readFileSync(emlPath, "utf-8");

  const subjMatch = content.match(/^Subject:\s*([\s\S]*?)(?=\r?\n[A-Z][A-Za-z0-9-]*:|\r?\n\r?\n)/im);
  const subject = subjMatch ? subjMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';

  const msg = createMockGmailMessage(
    "Autodesk Forma <no-reply@mail.forma.autodesk.com>",
    "",
    subject,
    content
  );

  const parsed = DocumentPipeline.parseEmail(msg as any);
  assert.equal(parsed.specSection, "062000");
  assert.equal(parsed.section, "062000");
  assert.equal(parsed.submittalNum, "003");
  assert.equal(parsed.number, "003");
  assert.equal(parsed.revNum, "00");
  assert.equal(parsed.revision, "00");
  assert.equal(parsed.title, "Phase 2 Millwork Samples");
  assert.equal(parsed.action, "Received");

  (globalThis as any).GmailApp = {
    setCurrentMessageAccessToken: (t: string) => {},
    getMessageById: () => msg
  };

  const event = { gmail: { messageId: "msg-mock-123", accessToken: "token-123" } };
  const card: any = await buildAddOn(event);

  assert.ok(card);
  const cardJson = CardSerializer.toJSON(card);
  assert.ok(CardSerializer.hasWidgetText(cardJson, "062000"));
  assert.ok(CardSerializer.hasWidgetText(cardJson, "003"));
});

test("UI Intake Binding - Unmatched Email Format defaults fields cleanly without undefined or null values", async () => {
  const msg = createMockGmailMessage(
    "subcontractor@generalbuilder.com",
    "",
    "Weekly Site Meeting Schedule and Update",
    "Hi Team, attached is the weekly schedule..."
  );

  const parsed = DocumentPipeline.parseEmail(msg as any);
  assert.equal(parsed.specSection, undefined);
  assert.equal(parsed.section, undefined);
  assert.equal(parsed.submittalNum, undefined);
  assert.equal(parsed.number, undefined);
  assert.equal(parsed.revNum, undefined);
  assert.equal(parsed.revision, undefined);
  assert.equal(parsed.title, undefined);
  assert.equal(parsed.action, "Received");
  assert.equal(parsed.discipline, "Architecture");

  (globalThis as any).GmailApp = {
    setCurrentMessageAccessToken: (t: string) => {},
    getMessageById: () => msg
  };

  const event = { gmail: { messageId: "msg-unmatched-999", accessToken: "token-123" } };
  const card: any = await buildAddOn(event);

  assert.ok(card);
  const mainCard: any = buildMainCard({} as any, parsed);
  assert.ok(mainCard);
  const cardJson = CardSerializer.toJSON(mainCard);
  assert.ok(cardJson);
});

test("UI Intake Binding - Null message context initializes default fallback UI form state cleanly", () => {
  const parsedNull = DocumentPipeline.parseEmail(null);

  assert.equal(parsedNull.driveName, "");
  assert.equal(parsedNull.discipline, "Architecture");
  assert.equal(parsedNull.action, "Received");
  assert.equal(parsedNull.section, undefined);
  assert.equal(parsedNull.number, undefined);
  assert.equal(parsedNull.revision, undefined);
  assert.equal(parsedNull.title, undefined);

  const card: any = buildMainCard({} as any, parsedNull);
  assert.ok(card);
  const cardJson = CardSerializer.toJSON(card);
  assert.ok(cardJson);
});
