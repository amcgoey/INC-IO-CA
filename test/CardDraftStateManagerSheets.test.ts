import test from "node:test";
import assert from "node:assert/strict";
import { CardDraftStateManager } from "../src/prototypes/CardDraftStateManager";
import { InMemoryCacheAdapter } from "./harness/index";

test("CardDraftStateManager Sheets: formatSheetsContextKey generates correct context key", () => {
  const contextKey = CardDraftStateManager.formatSheetsContextKey("sheet_123", "Submittal Arch");
  assert.equal(contextKey, "SHEETS_sheet_123_Submittal%20Arch");
});

test("CardDraftStateManager Sheets: getCacheKey formats polymorphic keys correctly", () => {
  assert.equal(
    CardDraftStateManager.getCacheKey("SHEETS_sheet_123_SubmittalArch"),
    "CARD_DRAFT_V1_SHEETS_sheet_123_SubmittalArch"
  );
  assert.equal(
    CardDraftStateManager.getCacheKey("GMAIL_msg_456"),
    "CARD_DRAFT_V1_GMAIL_msg_456"
  );
  assert.equal(
    CardDraftStateManager.getCacheKey("CARD_DRAFT_V1_SHEETS_sheet_123_SubmittalArch"),
    "CARD_DRAFT_V1_SHEETS_sheet_123_SubmittalArch"
  );
  assert.equal(
    CardDraftStateManager.getCacheKey("msg_789"),
    "CARD_DRAFT_V1_msg_789"
  );
});

test("CardDraftStateManager Sheets: isolates draft state per active tab", () => {
  const cache = new InMemoryCacheAdapter();
  const keyArch = CardDraftStateManager.formatSheetsContextKey("sheet_999", "Submittal Arch");
  const keyFfe = CardDraftStateManager.formatSheetsContextKey("sheet_999", "Submittal FFE");

  CardDraftStateManager.saveDraft(cache, keyArch, {
    notes: "Arch tab draft notes",
    csiSection: "03 30 00",
    docTypeKey: "SUBMITTAL_ARCH"
  });

  CardDraftStateManager.saveDraft(cache, keyFfe, {
    notes: "FFE tab draft notes",
    csiSection: "12 00 00",
    docTypeKey: "SUBMITTAL_FFE"
  });

  const draftArch = CardDraftStateManager.getDraft(cache, keyArch);
  const draftFfe = CardDraftStateManager.getDraft(cache, keyFfe);

  assert.equal(draftArch?.notes, "Arch tab draft notes");
  assert.equal(draftArch?.csiSection, "03 30 00");
  assert.equal(draftFfe?.notes, "FFE tab draft notes");
  assert.equal(draftFfe?.csiSection, "12 00 00");

  const rawArch = cache.get("CARD_DRAFT_V1_SHEETS_sheet_999_Submittal%20Arch");
  assert.notEqual(rawArch, null);
  assert.match(rawArch, /Arch tab draft notes/);
});

test("CardDraftStateManager Sheets: 100KB size guard checks byte length and skips cache.put on overflow", () => {
  const cache = new InMemoryCacheAdapter();
  const contextKey = CardDraftStateManager.formatSheetsContextKey("sheet_999", "Submittal Arch");

  const hugeNotes = "X".repeat(105 * 1024);

  const result = CardDraftStateManager.saveDraft(cache, contextKey, {
    notes: hugeNotes,
    docTypeKey: "SUBMITTAL_ARCH"
  });

  assert.equal(result.exceededSizeGuard, true);
  assert.equal(
    result.warningMessage,
    "⚠️ Form draft state exceeds cache size limits (100KB). Please reduce text input size."
  );

  const cacheKey = CardDraftStateManager.getCacheKey(contextKey);
  assert.equal(cache.get(cacheKey), null);
  assert.equal(CardDraftStateManager.getDraft(cache, contextKey), null);
});

test("CardDraftStateManager Sheets: isSystemTab accurately identifies system tabs", () => {
  assert.equal(CardDraftStateManager.isSystemTab("_Config"), true);
  assert.equal(CardDraftStateManager.isSystemTab("_AuditLog"), true);
  assert.equal(CardDraftStateManager.isSystemTab("_Shared"), true);
  assert.equal(CardDraftStateManager.isSystemTab("System Config"), true);
  assert.equal(CardDraftStateManager.isSystemTab("System Audit Log"), true);
  assert.equal(CardDraftStateManager.isSystemTab("Documentation"), true);
  assert.equal(CardDraftStateManager.isSystemTab("User Created"), true);
  assert.equal(CardDraftStateManager.isSystemTab("Submittal Arch"), false);
  assert.equal(CardDraftStateManager.isSystemTab("Submittal FFE"), false);
});

test("CardDraftStateManager Sheets: system tabs set documentType = null and bypass draft hydration", () => {
  const cache = new InMemoryCacheAdapter();
  const keyConfig = CardDraftStateManager.formatSheetsContextKey("sheet_999", "_Config");

  cache.put(
    CardDraftStateManager.getCacheKey(keyConfig),
    JSON.stringify({ contextKey: keyConfig, notes: "Stale draft" }),
    3600
  );

  const resolved = CardDraftStateManager.resolveCardFormState({
    cache,
    contextKey: keyConfig,
    tabName: "_Config",
    extractedMetadata: { docTypeKey: "SUBMITTAL" }
  });

  assert.equal(resolved.documentType, null);
  assert.equal(resolved.docTypeKey, null);
  assert.equal(resolved.bypassedDraftHydration, true);
  assert.equal(resolved.notes, "");
  assert.equal(resolved.provenance.docTypeKey, "DEFAULT");
});
