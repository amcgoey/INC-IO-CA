import test from "node:test";
import assert from "node:assert/strict";
import { CardDraftStateManager } from "../src/core/state/CardDraftStateManager";
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

test("CardDraftStateManager: polymorphic context keys formatDriveContextKey and resolveContextKey", () => {
  assert.equal(CardDraftStateManager.formatDriveContextKey("file_999"), "DRIVE_file_999");

  // Explicit contextKey
  assert.equal(CardDraftStateManager.resolveContextKey({ contextKey: "EXPLICIT_KEY" }), "EXPLICIT_KEY");
  // Gmail context
  assert.equal(CardDraftStateManager.resolveContextKey({ messageId: "msg_abc" }), "GMAIL_msg_abc");
  assert.equal(CardDraftStateManager.resolveContextKey({ gmail: { messageId: "msg_def" } }), "GMAIL_msg_def");
  assert.equal(CardDraftStateManager.resolveContextKey({ parameters: { messageId: "msg_ghi" } }), "GMAIL_msg_ghi");
  // Sheets context
  assert.equal(
    CardDraftStateManager.resolveContextKey({ spreadsheetId: "ss_123", tabName: "Submittal Arch" }),
    "SHEETS_ss_123_Submittal%20Arch"
  );
  assert.equal(
    CardDraftStateManager.resolveContextKey({ sheets: { spreadsheetId: "ss_456", sheetName: "Submittal FFE" } }),
    "SHEETS_ss_456_Submittal%20FFE"
  );
  // Drive context
  assert.equal(CardDraftStateManager.resolveContextKey({ driveFileId: "drive_001" }), "DRIVE_drive_001");
  assert.equal(CardDraftStateManager.resolveContextKey({ parameters: { driveFileId: "drive_002" } }), "DRIVE_drive_002");
});

test("CardDraftStateManager: resolveState shorthand method", () => {
  const cache = new InMemoryCacheAdapter();
  CardDraftStateManager.saveDraft(cache, "GMAIL_msg_101", {
    notes: "Cached notes",
    csiSection: "03 30 00"
  });

  const state = CardDraftStateManager.resolveState(cache, "GMAIL_msg_101", { notes: "Live notes" }, { docTypeKey: "SUBMITTAL_ARCH" });
  assert.equal(state.notes, "Live notes");
  assert.equal(state.csiSection, "03 30 00");
  assert.equal(state.docTypeKey, "SUBMITTAL_ARCH");
});

test("CardDraftStateManager: preserves arbitrary form input fields across save and retrieval", () => {
  const cache = new InMemoryCacheAdapter();
  const formFields = {
    title: "Cast-in-Place Concrete",
    revision: "2",
    section: "033000",
    number: "001",
    specTag: "CH-01",
    vendor: "Herman Miller",
    contact: "ARCH",
    action: "Reviewed"
  };

  CardDraftStateManager.saveDraft(cache, "GMAIL_msg_fields", formFields);
  const retrieved = CardDraftStateManager.getDraft(cache, "GMAIL_msg_fields");

  assert.ok(retrieved);
  assert.equal(retrieved?.title, "Cast-in-Place Concrete");
  assert.equal(retrieved?.revision, "2");
  assert.equal(retrieved?.section, "033000");
  assert.equal(retrieved?.number, "001");
  assert.equal(retrieved?.specTag, "CH-01");
  assert.equal(retrieved?.vendor, "Herman Miller");
  assert.equal(retrieved?.contact, "ARCH");
  assert.equal(retrieved?.action, "Reviewed");
});
