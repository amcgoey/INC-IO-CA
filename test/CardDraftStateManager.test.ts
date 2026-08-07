import test from "node:test";
import assert from "node:assert/strict";
import { CardDraftStateManager } from "../src/prototypes/CardDraftStateManager";
import { InMemoryCacheAdapter } from "./harness/index";

test("CardDraftStateManager: returns null when no draft exists in cache", () => {
  const cache = new InMemoryCacheAdapter();
  const draft = CardDraftStateManager.getDraft(cache, "msg_123");
  assert.equal(draft, null);
});

test("CardDraftStateManager: saves and retrieves draft state for a message ID", () => {
  const cache = new InMemoryCacheAdapter();
  const saved = CardDraftStateManager.saveDraft(cache, "msg_123", {
    notes: "User draft notes",
    csiSection: "03 30 00",
    docTypeKey: "SUBMITTAL"
  });

  assert.equal(saved.messageId, "msg_123");
  assert.equal(saved.notes, "User draft notes");

  const retrieved = CardDraftStateManager.getDraft(cache, "msg_123");
  assert.notEqual(retrieved, null);
  assert.equal(retrieved?.notes, "User draft notes");
  assert.equal(retrieved?.csiSection, "03 30 00");
  assert.equal(retrieved?.docTypeKey, "SUBMITTAL");
});

test("CardDraftStateManager: isolates draft state per message ID (email switching)", () => {
  const cache = new InMemoryCacheAdapter();
  CardDraftStateManager.saveDraft(cache, "msg_A", { notes: "Draft A" });
  CardDraftStateManager.saveDraft(cache, "msg_B", { notes: "Draft B" });

  const draftA = CardDraftStateManager.getDraft(cache, "msg_A");
  const draftB = CardDraftStateManager.getDraft(cache, "msg_B");

  assert.equal(draftA?.notes, "Draft A");
  assert.equal(draftB?.notes, "Draft B");
});

test("CardDraftStateManager: clears draft state from cache on process/submission", () => {
  const cache = new InMemoryCacheAdapter();
  CardDraftStateManager.saveDraft(cache, "msg_123", { notes: "To be cleared" });
  assert.notEqual(CardDraftStateManager.getDraft(cache, "msg_123"), null);

  CardDraftStateManager.clearDraft(cache, "msg_123");
  assert.equal(CardDraftStateManager.getDraft(cache, "msg_123"), null);
});

test("CardDraftStateManager: resolveCardFormState precedence algorithm", () => {
  const cache = new InMemoryCacheAdapter();

  // Baseline: Only extracted metadata
  let state = CardDraftStateManager.resolveCardFormState({
    cache,
    messageId: "msg_101",
    extractedMetadata: { docTypeKey: "RFI", projectId: "PROJ-1", notes: "Header notes" }
  });

  assert.equal(state.docTypeKey, "RFI");
  assert.equal(state.provenance.docTypeKey, "EXTRACTED_METADATA");
  assert.equal(state.notes, "Header notes");
  assert.equal(state.provenance.notes, "EXTRACTED_METADATA");

  // Save UserCache Draft override for notes & csiSection
  CardDraftStateManager.saveDraft(cache, "msg_101", {
    notes: "User edited draft notes",
    csiSection: "04 20 00"
  });

  state = CardDraftStateManager.resolveCardFormState({
    cache,
    messageId: "msg_101",
    extractedMetadata: { docTypeKey: "RFI", projectId: "PROJ-1", notes: "Header notes" }
  });

  assert.equal(state.docTypeKey, "RFI");
  assert.equal(state.provenance.docTypeKey, "EXTRACTED_METADATA");
  assert.equal(state.notes, "User edited draft notes");
  assert.equal(state.provenance.notes, "USER_CACHE_DRAFT");
  assert.equal(state.csiSection, "04 20 00");
  assert.equal(state.provenance.csiSection, "USER_CACHE_DRAFT");

  // Live Input override (transient user typing during action event)
  state = CardDraftStateManager.resolveCardFormState({
    cache,
    messageId: "msg_101",
    extractedMetadata: { docTypeKey: "RFI", projectId: "PROJ-1", notes: "Header notes" },
    liveFormInputs: { docTypeKey: "SUBMITTAL" }
  });

  assert.equal(state.docTypeKey, "SUBMITTAL");
  assert.equal(state.provenance.docTypeKey, "LIVE_INPUT");
});
