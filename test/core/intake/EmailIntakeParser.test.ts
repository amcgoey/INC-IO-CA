import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SubmittalEmailParser,
  RfiEmailParser,
  AsiEmailParser,
  GenericEmailParser,
  EmailIntakeParser
} from "../../../src/core/intake/EmailIntakeParser";
import { AIPrediction, EmailData } from "../../../src/types";

test("SubmittalEmailParser - extracts submittal section, number, revision, and title from subject", () => {
  const subject = "[Project Alpha] Submittal # 033000-001 has been submitted";
  const body = "Submittal details...";

  const result = SubmittalEmailParser.parse(subject, body);

  assert.equal(result.specSection, "033000");
  assert.equal(result.submittalNum, "001");
  assert.equal(result.revNum, "0");
  assert.equal(result.driveName, "Project Alpha");
  assert.equal(result.action, "Received");
});

test("RfiEmailParser - extracts RFI number, revision, title, and project from subject", () => {
  const subject = "[Project Beta] RFI # 104-1 - Structural Steel Connection Revisions";
  const body = "Please review attached RFI.";

  const result = RfiEmailParser.parse(subject, body);

  assert.equal(result.number, "104");
  assert.equal(result.revision, "1");
  assert.equal(result.title, "Structural Steel Connection Revisions");
  assert.equal(result.driveName, "Project Beta");
});

test("AsiEmailParser - extracts ASI number, revision, title, and project from subject", () => {
  const subject = "[Project Gamma] ASI # 012-00 - Structural Steel Connection Revisions";
  const body = "Please see ASI 012.";

  const result = AsiEmailParser.parse(subject, body);

  assert.equal(result.number, "012");
  assert.equal(result.revision, "00");
  assert.equal(result.title, "Structural Steel Connection Revisions");
  assert.equal(result.driveName, "Project Gamma");
});

test("GenericEmailParser - extracts CSI section, submittal number, and revision as fallback", () => {
  const subject = "Transmittal for 06 20 00-003-01 Phase 2 Millwork Samples";
  const body = "See attached samples.";

  const result = GenericEmailParser.parse(subject, body);

  assert.equal(result.specSection, "062000");
  assert.equal(result.submittalNum, "003");
  assert.equal(result.revNum, "01");
  assert.equal(result.title, "Phase 2 Millwork Samples");
});

test("EmailIntakeParser.dispatchParser - selects SubmittalEmailParser when docType is Submittal", () => {
  const subject = "[Skyline Tower] Submittal # 081100-02 Door Schedule";
  const body = "Attached...";

  const result = EmailIntakeParser.dispatchParser("Submittal", subject, body);

  assert.equal(result.specSection, "081100");
  assert.equal(result.submittalNum, "002");
});

test("EmailIntakeParser.dispatchParser - selects RfiEmailParser when docType is RFI", () => {
  const subject = "[Skyline Tower] RFI # 045 Detail Query";
  const body = "Please clarify...";

  const result = EmailIntakeParser.dispatchParser("RFI", subject, body);

  assert.equal(result.number, "045");
  assert.equal(result.title, "Detail Query");
});

test("EmailIntakeParser.dispatchParser - selects AsiEmailParser when docType is ASI", () => {
  const subject = "[Skyline Tower] ASI # 007 Architectural Revision";
  const body = "Please see revised sheets...";

  const result = EmailIntakeParser.dispatchParser("ASI", subject, body);

  assert.equal(result.number, "007");
  assert.equal(result.title, "Architectural Revision");
});

test("EmailIntakeParser.dispatchParser - prioritizes vendor email headers (Procore / Forma / CMiC)", () => {
  const sender = "submittals@procoretech.com";
  const subject = "[Project X] Submittal Distributed 092900-05, Drywall Detail";
  const body = "Distributed via Procore";

  const result = EmailIntakeParser.dispatchParser("Generic", subject, body, sender);

  assert.equal(result.specSection, "092900");
  assert.equal(result.submittalNum, "005");
  assert.equal(result.title, "Drywall Detail");
});

test("EmailIntakeParser.mergeAiTriageAndRegex - deterministic overwrite of specSection, number, revision", () => {
  const aiPrediction: AIPrediction = {
    predictedDocType: "Submittal",
    predictedProjectName: "Skyline Tower Project",
    predictedDiscipline: "Architecture",
    specSection: "000000",
    submittalNum: "999",
    revNum: "99",
    title: "AI Inferred Title"
  };

  const regexResult = {
    specSection: "081100",
    submittalNum: "002",
    revNum: "01",
    title: "Regex Exact Title: Hollow Metal Doors",
    action: "Received"
  };

  const merged = EmailIntakeParser.mergeAiTriageAndRegex(aiPrediction, regexResult);

  assert.equal(merged.specSection, "081100");
  assert.equal(merged.submittalNum, "002");
  assert.equal(merged.revNum, "01");
  assert.equal(merged.driveName, "Skyline Tower Project");
  assert.equal(merged.discipline, "Architecture");
  assert.equal(merged.title, "AI Inferred Title");
});

test("EmailIntakeParser.mergeAiTriageAndRegex - regex title populates when AI title is empty", () => {
  const aiPrediction: AIPrediction = {
    predictedDocType: "Submittal",
    predictedProjectName: "Skyline Tower Project"
  };

  const regexResult = {
    specSection: "081100",
    submittalNum: "002",
    revNum: "01",
    title: "Regex Title: Metal Framing",
    action: "Received"
  };

  const merged = EmailIntakeParser.mergeAiTriageAndRegex(aiPrediction, regexResult);

  assert.equal(merged.title, "Regex Title: Metal Framing");
});

test("EmailIntakeParser.parseEmail2Phase - executes 2-phase intake and returns merged ParsedData", () => {
  const emailData: EmailData = {
    id: "msg-123",
    subject: "[Skyline Tower] Submittal # 081100-002.01 Hollow Metal Doors",
    body: "Please find attached submittal for doors.",
    sender: "submittals@vendor.com",
    date: new Date()
  };

  const aiPrediction: AIPrediction = {
    predictedDocType: "Submittal",
    predictedProjectName: "Skyline Tower Project",
    predictedDiscipline: "Architecture"
  };

  const merged = EmailIntakeParser.parseEmail2Phase(emailData, aiPrediction);

  assert.equal(merged.specSection, "081100");
  assert.equal(merged.submittalNum, "002");
  assert.equal(merged.revNum, "01");
  assert.equal(merged.driveName, "Skyline Tower Project");
  assert.equal(merged.discipline, "Architecture");
  assert.equal(merged.title, "Hollow Metal Doors");
});


test("EmailIntakeParser.parseEmail - accepts pure EmailData parameter signature", () => {
  const emailData: EmailData = {
    id: "msg-456",
    subject: "[Skyline Tower] Submittal # 033000-001 Concrete Pour",
    body: "Details...",
    sender: "sub@vendor.com",
    date: new Date()
  };

  const result = EmailIntakeParser.parseEmail(emailData);

  assert.equal(result.specSection, "033000");
  assert.equal(result.submittalNum, "001");
  assert.equal(result.title, "Concrete Pour");
});
