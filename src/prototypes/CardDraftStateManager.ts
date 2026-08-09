/**
 * @file CardDraftStateManager.ts
 * @description Logic module for Issue #135 & #222: Polymorphic CardDraftStateManager & Loss-Less Card State Preservation via UserCache.
 *
 * Implements a pure, portable draft state manager for Google Workspace Add-on card inputs.
 * Preserves draft user inputs in UserCache across card section re-renders, email context switches, and sheet tab context switches.
 */

export interface CacheAdapterLike {
  get(key: string): string | null;
  put(key: string, value: string, ttlSeconds: number): void;
  remove?(key: string): void;
}

export interface CardFormDraft {
  contextKey: string;
  messageId?: string;
  docTypeKey?: string;
  projectId?: string;
  csiSection?: string;
  notes?: string;
  aiAnalyzeRequested?: boolean;
  lastUpdatedMs: number;
  exceededSizeGuard?: boolean;
  warningMessage?: string;
}

export type FieldProvenance = "LIVE_INPUT" | "USER_CACHE_DRAFT" | "EXTRACTED_METADATA" | "DEFAULT";

export interface ResolvedCardState {
  contextKey: string;
  messageId?: string;
  documentType?: string | null;
  docTypeKey: string | null;
  projectId: string;
  csiSection: string;
  notes: string;
  aiAnalyzeRequested: boolean;
  lastUpdatedMs?: number;
  bypassedDraftHydration?: boolean;
  exceededSizeGuard?: boolean;
  warningMessage?: string;
  provenance: {
    docTypeKey: FieldProvenance;
    projectId: FieldProvenance;
    csiSection: FieldProvenance;
    notes: FieldProvenance;
    aiAnalyzeRequested: FieldProvenance;
  };
}

export class CardDraftStateManager {
  private static DRAFT_PREFIX = "CARD_DRAFT_V1_";
  private static DEFAULT_TTL_SECONDS = 3600; // 1 hour draft TTL
  public static MAX_CACHE_PAYLOAD_BYTES = 100 * 1024; // 100KB UserCache quota limit
  private static readonly SYSTEM_TAB_NAMES = [
    "system config",
    "system audit log",
    "documentation",
    "user created"
  ];

  /**
   * Helper to format Google Sheets contextKey as SHEETS_<SpreadsheetId>_<TabName>.
   */
  public static formatSheetsContextKey(spreadsheetId: string, tabName: string): string {
    return `SHEETS_${spreadsheetId}_${encodeURIComponent(tabName)}`;
  }

  /**
   * Helper to format Gmail contextKey as GMAIL_<messageId>.
   */
  public static formatGmailContextKey(messageId: string): string {
    return `GMAIL_${messageId}`;
  }

  /**
   * Generates a deterministic cache key for a given polymorphic contextKey or messageId.
   */
  public static getCacheKey(contextKey: string): string {
    if (!contextKey) return CardDraftStateManager.DRAFT_PREFIX;
    if (contextKey.startsWith(CardDraftStateManager.DRAFT_PREFIX)) {
      return contextKey;
    }
    return `${CardDraftStateManager.DRAFT_PREFIX}${contextKey}`;
  }

  /**
   * Evaluates whether a sheet tab is a system or non-log tab (_Config, _AuditLog, Documentation, etc.)
   */
  public static isSystemTab(tabName: string): boolean {
    if (!tabName) return false;
    const trimmed = tabName.trim();
    if (trimmed.startsWith("_")) return true;
    return CardDraftStateManager.SYSTEM_TAB_NAMES.includes(trimmed.toLowerCase());
  }

  /**
   * Resolves fallback messageId from contextKey or explicit messageId.
   */
  private static resolveMessageId(contextKey: string, explicitMessageId?: string): string {
    if (explicitMessageId) return explicitMessageId;
    if (contextKey.startsWith("GMAIL_")) {
      return contextKey.replace("GMAIL_", "");
    }
    return contextKey;
  }

  /**
   * Retrieves stored draft for a given polymorphic contextKey from UserCache.
   */
  public static getDraft(cache: CacheAdapterLike, contextKey: string): CardFormDraft | null {
    if (!contextKey) return null;
    const key = CardDraftStateManager.getCacheKey(contextKey);
    const rawJson = cache.get(key);
    if (!rawJson) return null;

    try {
      const parsed = JSON.parse(rawJson) as CardFormDraft;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (e) {
      // Return null on JSON corruption
    }
    return null;
  }

  /**
   * Merges updated form fields into existing UserCache draft for contextKey and saves with TTL.
   * Includes 100KB payload size limit guard check before cache.put().
   */
  public static saveDraft(
    cache: CacheAdapterLike,
    contextKey: string,
    updates: Partial<Omit<CardFormDraft, "contextKey" | "lastUpdatedMs">>,
    ttlSeconds: number = CardDraftStateManager.DEFAULT_TTL_SECONDS
  ): CardFormDraft {
    const existing = CardDraftStateManager.getDraft(cache, contextKey) || {
      contextKey,
      messageId: CardDraftStateManager.resolveMessageId(contextKey),
      lastUpdatedMs: Date.now()
    };

    const merged: CardFormDraft = {
      ...existing,
      ...updates,
      contextKey,
      messageId: CardDraftStateManager.resolveMessageId(contextKey, updates.messageId || existing.messageId),
      lastUpdatedMs: Date.now()
    };

    const serialized = JSON.stringify(merged);
    const byteLength = new TextEncoder().encode(serialized).length;

    if (byteLength > CardDraftStateManager.MAX_CACHE_PAYLOAD_BYTES) {
      merged.exceededSizeGuard = true;
      merged.warningMessage = "⚠️ Form draft state exceeds cache size limits (100KB). Please reduce text input size.";
      return merged;
    }

    const key = CardDraftStateManager.getCacheKey(contextKey);
    cache.put(key, serialized, ttlSeconds);
    return merged;
  }

  /**
   * Explicitly clears/deletes draft state for contextKey from UserCache.
   */
  public static clearDraft(cache: CacheAdapterLike, contextKey: string): void {
    if (!contextKey) return;
    const key = CardDraftStateManager.getCacheKey(contextKey);
    if (typeof cache.remove === "function") {
      cache.remove(key);
    } else {
      cache.put(key, "", 0);
    }
  }

  /**
   * Core resolution algorithm: Blends live inputs, UserCache draft, extracted metadata, and defaults.
   * Suppresses form state hydration for system tabs setting documentType = null.
   */
  public static resolveCardFormState(params: {
    cache: CacheAdapterLike;
    contextKey?: string;
    messageId?: string;
    tabName?: string;
    isSystemTab?: boolean;
    extractedMetadata?: {
      docTypeKey?: string;
      projectId?: string;
      csiSection?: string;
      notes?: string;
    };
    liveFormInputs?: {
      docTypeKey?: string;
      projectId?: string;
      csiSection?: string;
      notes?: string;
      aiAnalyzeRequested?: boolean;
    };
  }): ResolvedCardState {
    const contextKey = params.contextKey || params.messageId || "";
    const { cache, messageId, tabName, extractedMetadata = {}, liveFormInputs = {} } = params;

    const systemTab = params.isSystemTab !== undefined
      ? params.isSystemTab
      : tabName
        ? CardDraftStateManager.isSystemTab(tabName)
        : false;

    const resolvedMsgId = CardDraftStateManager.resolveMessageId(contextKey, messageId);

    if (systemTab) {
      return {
        contextKey,
        messageId: resolvedMsgId,
        documentType: null,
        docTypeKey: null,
        projectId: "PROJ-UNASSIGNED",
        csiSection: "",
        notes: "",
        aiAnalyzeRequested: false,
        bypassedDraftHydration: true,
        provenance: {
          docTypeKey: "DEFAULT",
          projectId: "DEFAULT",
          csiSection: "DEFAULT",
          notes: "DEFAULT",
          aiAnalyzeRequested: "DEFAULT"
        }
      };
    }

    const cachedDraft = CardDraftStateManager.getDraft(cache, contextKey);

    // Resolve docTypeKey / documentType
    let docTypeKey: string | null = "GENERAL_CORRESPONDENCE";
    let docTypeProv: FieldProvenance = "DEFAULT";
    if (liveFormInputs.docTypeKey) {
      docTypeKey = liveFormInputs.docTypeKey;
      docTypeProv = "LIVE_INPUT";
    } else if (cachedDraft?.docTypeKey) {
      docTypeKey = cachedDraft.docTypeKey;
      docTypeProv = "USER_CACHE_DRAFT";
    } else if (extractedMetadata.docTypeKey) {
      docTypeKey = extractedMetadata.docTypeKey;
      docTypeProv = "EXTRACTED_METADATA";
    }

    // Resolve projectId
    let projectId = "PROJ-UNASSIGNED";
    let projectProv: FieldProvenance = "DEFAULT";
    if (liveFormInputs.projectId) {
      projectId = liveFormInputs.projectId;
      projectProv = "LIVE_INPUT";
    } else if (cachedDraft?.projectId) {
      projectId = cachedDraft.projectId;
      projectProv = "USER_CACHE_DRAFT";
    } else if (extractedMetadata.projectId) {
      projectId = extractedMetadata.projectId;
      projectProv = "EXTRACTED_METADATA";
    }

    // Resolve csiSection
    let csiSection = "";
    let csiProv: FieldProvenance = "DEFAULT";
    if (liveFormInputs.csiSection !== undefined && liveFormInputs.csiSection !== "") {
      csiSection = liveFormInputs.csiSection;
      csiProv = "LIVE_INPUT";
    } else if (cachedDraft?.csiSection !== undefined && cachedDraft.csiSection !== "") {
      csiSection = cachedDraft.csiSection;
      csiProv = "USER_CACHE_DRAFT";
    } else if (extractedMetadata.csiSection) {
      csiSection = extractedMetadata.csiSection;
      csiProv = "EXTRACTED_METADATA";
    }

    // Resolve notes
    let notes = "";
    let notesProv: FieldProvenance = "DEFAULT";
    if (liveFormInputs.notes !== undefined && liveFormInputs.notes !== "") {
      notes = liveFormInputs.notes;
      notesProv = "LIVE_INPUT";
    } else if (cachedDraft?.notes !== undefined && cachedDraft.notes !== "") {
      notes = cachedDraft.notes;
      notesProv = "USER_CACHE_DRAFT";
    } else if (extractedMetadata.notes) {
      notes = extractedMetadata.notes;
      notesProv = "EXTRACTED_METADATA";
    }

    // Resolve aiAnalyzeRequested
    let aiAnalyzeRequested = false;
    let aiProv: FieldProvenance = "DEFAULT";
    if (liveFormInputs.aiAnalyzeRequested !== undefined) {
      aiAnalyzeRequested = liveFormInputs.aiAnalyzeRequested;
      aiProv = "LIVE_INPUT";
    } else if (cachedDraft?.aiAnalyzeRequested !== undefined) {
      aiAnalyzeRequested = cachedDraft.aiAnalyzeRequested;
      aiProv = "USER_CACHE_DRAFT";
    }

    return {
      contextKey,
      messageId: resolvedMsgId,
      documentType: docTypeKey,
      docTypeKey,
      projectId,
      csiSection,
      notes,
      aiAnalyzeRequested,
      lastUpdatedMs: cachedDraft?.lastUpdatedMs,
      exceededSizeGuard: cachedDraft?.exceededSizeGuard,
      warningMessage: cachedDraft?.warningMessage,
      provenance: {
        docTypeKey: docTypeProv,
        projectId: projectProv,
        csiSection: csiProv,
        notes: notesProv,
        aiAnalyzeRequested: aiProv
      }
    };
  }
}
