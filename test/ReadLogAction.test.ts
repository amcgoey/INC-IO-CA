import test from "node:test";
import assert from "node:assert/strict";
import { ReadLogAction } from "../src/ReadLogAction";
import { WorkflowRunner } from "../src/core/workflow/WorkflowRunner";
import { FakeLogRepository } from "./harness/fakes/FakeLogRepository";
import { ArchitectureSubmittalStrategy, FFESubmittalStrategy } from "../src/DocumentLogStrategy";
import { createValidatedArchitectureSubmittal, createValidatedFFESubmittal } from "./harness/factories/DocumentFactory";
import { IdentityData, ReadLogInput } from "../src/types";

test("ReadLogAction - resolves IdentityData from ArchitectureSubmittalStrategy and reads log via FakeLogRepository", async () => {
  const fakeRepo = new FakeLogRepository();
  const action = new ReadLogAction();
  const doc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();

  const input: ReadLogInput = {
    spreadsheetId: "test-ss-123",
    document: doc,
    strategy,
    logRepository: fakeRepo
  };

  const result = await WorkflowRunner.runAction(action, input);

  assert.equal(fakeRepo.readLogEntries.length, 1);
  const entry = fakeRepo.readLogEntries[0];
  assert.equal(entry.spreadsheetId, "test-ss-123");
  assert.equal(entry.identityData.identityGroup, "081100-001");
  assert.equal(entry.identityData.identity, "081100-001-01");
  assert.equal(result.found, false);
});

test("ReadLogAction - accepts explicit IdentityData override in input", async () => {
  const fakeRepo = new FakeLogRepository();
  const action = new ReadLogAction();
  const customIdentity: IdentityData = {
    identityGroup: "custom-group",
    identityRevisionGroup: "custom-sort",
    identity: "custom-key-01"
  };

  const input: ReadLogInput = {
    spreadsheetId: "test-ss-456",
    identityData: customIdentity,
    logRepository: fakeRepo
  };

  const result = await WorkflowRunner.runAction(action, input);

  assert.equal(fakeRepo.readLogEntries.length, 1);
  assert.deepEqual(fakeRepo.readLogEntries[0].identityData, customIdentity);
  assert.equal(result.found, false);
});

test("ReadLogAction - returns stubbed previous entry and handles status transition options", async () => {
  const fakeRepo = new FakeLogRepository();
  const action = new ReadLogAction();
  const doc = createValidatedArchitectureSubmittal();
  const strategy = new ArchitectureSubmittalStrategy();

  fakeRepo.customReadResult = {
    found: true,
    rowIndex: 4,
    contactHistory: "GC Sub",
    previousStatus: "Open",
    rowData: { Section: "081100", Number: "001", Status: "Closed" },
    identityData: strategy.getIdentityData(doc),
    previousRowUpdated: true
  };

  const input: ReadLogInput = {
    spreadsheetId: "test-ss-789",
    document: doc,
    strategy,
    updatePreviousStatus: true,
    previousRowStatus: "Closed",
    logRepository: fakeRepo
  };

  const result = await WorkflowRunner.runAction(action, input);

  assert.equal(result.found, true);
  assert.equal(result.rowIndex, 4);
  assert.equal(result.contactHistory, "GC Sub");
  assert.equal(result.previousRowUpdated, true);
  assert.equal(fakeRepo.readLogEntries[0].options?.updatePreviousStatus, true);
  assert.equal(fakeRepo.readLogEntries[0].options?.previousRowStatus, "Closed");
});

test("WorkflowRunner.runSequence - executes ReadLogAction in sequence pipeline", async () => {
  const fakeRepo = new FakeLogRepository();
  const action = new ReadLogAction();
  const doc = createValidatedFFESubmittal();
  const strategy = new FFESubmittalStrategy();

  const input: ReadLogInput = {
    spreadsheetId: "ffe-ss-seq",
    document: doc,
    strategy,
    logRepository: fakeRepo
  };

  const results = await WorkflowRunner.runSequence([
    { action, input }
  ]);

  assert.equal(results.length, 1);
  assert.equal(fakeRepo.readLogEntries.length, 1);
  assert.equal(fakeRepo.readLogEntries[0].identityData.identityGroup, "ch-01");
});
