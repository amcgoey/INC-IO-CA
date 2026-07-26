import test from "node:test";
import assert from "node:assert/strict";

// Global mock configuration for GAS environment before requiring DocumentPipeline & Parser
(globalThis as any).CONFIG = {
  DEFAULT_ACTION: "Received",
  DEFAULT_DISCIPLINE: "Architecture"
};

const { EmailIntakeParser, DocumentPipeline } = require("../src/DocumentPipeline");

test("EmailIntakeParser.parseProcoreEmail_ extracts project driveName, spec section, revision, discipline, and action from subject", () => {
  const subject = "[Project Alpha] Submittal # 033000-001 has been submitted";
  const body = "Procore Submittal notification body text";

  const result = EmailIntakeParser.parseProcoreEmail_(subject, body);

  assert.equal(result.driveName, "Project Alpha");
  assert.equal(result.specSection, "033000");
  assert.equal(result.revNum, "001");
  assert.equal(result.discipline, "Architecture");
  assert.equal(result.action, "Received");
});

test("EmailIntakeParser.parseProcoreEmail_ identifies returned or reviewed submittal action", () => {
  const subject = "[Project Beta] Subm 081100-02 has been returned";
  const body = "Returned for review";

  const result = EmailIntakeParser.parseProcoreEmail_(subject, body);

  assert.equal(result.driveName, "Project Beta");
  assert.equal(result.specSection, "081100");
  assert.equal(result.revNum, "02");
  assert.equal(result.discipline, "Architecture");
  assert.equal(result.action, "Reviewed");
});

test("EmailIntakeParser.parseFormaEmail_ extracts project driveName, spec section, revision, and action", () => {
  const subject = "Project Gamma - # 033000-01 was submitted";
  const body = "Forma notification body";

  const result = EmailIntakeParser.parseFormaEmail_(subject, body);

  assert.equal(result.driveName, "Project Gamma");
  assert.equal(result.specSection, "033000");
  assert.equal(result.revNum, "01");
  assert.equal(result.discipline, "Architecture");
  assert.equal(result.action, "Received");
});

test("EmailIntakeParser.parseEmail handles null or undefined message cleanly", () => {
  const resultNull = EmailIntakeParser.parseEmail(null);
  assert.equal(resultNull.driveName, "");
  assert.equal(resultNull.discipline, "Architecture");
  assert.equal(resultNull.action, "Received");

  const resultUndefined = EmailIntakeParser.parseEmail(undefined);
  assert.equal(resultUndefined.driveName, "");
  assert.equal(resultUndefined.discipline, "Architecture");
  assert.equal(resultUndefined.action, "Received");
});

test("DocumentPipeline.parseEmail facade delegates to EmailIntakeParser.parseEmail for Procore messages", () => {
  const fakeProcoreMessage = {
    getFrom: () => "Procore Notifications <submittals@procoretech.com>",
    getSubject: () => "[Skyline Tower] Submittal # 230000-03 submitted",
    getPlainBody: () => "Submittal notification details..."
  };

  const parsed = DocumentPipeline.parseEmail(fakeProcoreMessage);

  assert.equal(parsed.driveName, "Skyline Tower");
  assert.equal(parsed.specSection, "230000");
  assert.equal(parsed.revNum, "03");
  assert.equal(parsed.discipline, "Architecture");
  assert.equal(parsed.action, "Received");
});

test("DocumentPipeline.parseEmail facade delegates for Autodesk Forma messages", () => {
  const fakeFormaMessage = {
    getFrom: () => "notifications@mail.forma.autodesk.com",
    getSubject: () => "Tower Project - # 081100-02 was submitted",
    getPlainBody: () => "Forma details..."
  };

  const parsed = DocumentPipeline.parseEmail(fakeFormaMessage);

  assert.equal(parsed.driveName, "Tower Project");
  assert.equal(parsed.specSection, "081100");
  assert.equal(parsed.revNum, "02");
  assert.equal(parsed.discipline, "Architecture");
  assert.equal(parsed.action, "Received");
});

test("DocumentPipeline.parseEmail facade returns default ParsedData for non-matching senders", () => {
  const fakeStandardMessage = {
    getFrom: () => "someone@example.com",
    getSubject: () => "Random Email",
    getPlainBody: () => "Hello world"
  };

  const parsed = DocumentPipeline.parseEmail(fakeStandardMessage);

  assert.equal(parsed.driveName, "");
  assert.equal(parsed.discipline, "Architecture");
  assert.equal(parsed.action, "Received");
});
