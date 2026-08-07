/**
 * @file CardDraftStateManager.ts
 * @description Logic module for Issue #135 Prototype: Loss-Less Card State Preservation via UserCache.
 *
 * Implements a pure, portable draft state manager for Google Workspace Add-on card inputs.
 * Preserves draft user inputs in UserCache across card section re-renders and email context switches.
 */

export interface CacheAdapterLike {
  get(key: string): string | null;
  put(key: string, value: string, ttlSeconds: number): void;
  remove?(key: string): void;
}

export interface CardFormDraft {
  messageId: string;
  docTypeKey?: string;
  projectId?: string;
  csiSection?: string;
  notes?: string;
  aiAnalyzeRequested?: boolean;
  lastUpdatedMs: number;
}

export type FieldProvenance = "LIVE_INPUT" | "USER_CACHE_DRAFT" | "EXTRACTED_METADATA" | "DEFAULT";

export interface ResolvedCardState {
  messageId: string;
  docTypeKey: string;
  projectId: string;
  csiSection: string;
  notes: string;
  aiAnalyzeRequested: boolean;
  lastUpdatedMs?: number;
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

  /**
   * Generates a deterministic cache key for a given email message context.
   */
  public static getCacheKey(messageId: string): string {
    return `${CardDraftStateManager.DRAFT_PREFIX}${messageId}`;
  }

  /**
   * Retrieves the stored draft for a given messageId from UserCache.
   * Returns null if no draft exists or if the draft has expired.
   */
  public static getDraft(cache: CacheAdapterLike, messageId: string): CardFormDraft | null {
    if (!messageId) return null;
    const key = CardDraftStateManager.getCacheKey(messageId);
    const rawJson = cache.get(key);
    if (!rawJson) return null;

    try {
      const parsed = JSON.parse(rawJson) as CardFormDraft;
      if (parsed && typeof parsed === "object" && parsed.messageId === messageId) {
        return parsed;
      }
    } catch (e) {
      // Return null on JSON corruption
    }
    return null;
  }

  /**
   * Merges updated form fields into existing UserCache draft for messageId and saves with TTL.
   */
  public static saveDraft(
    cache: CacheAdapterLike,
    messageId: string,
    updates: Partial<Omit<CardFormDraft, "messageId" | "lastUpdatedMs">>,
    ttlSeconds: number = CardDraftStateManager.DEFAULT_TTL_SECONDS
  ): CardFormDraft {
    const existing = CardDraftStateManager.getDraft(cache, messageId) || {
      messageId,
      lastUpdatedMs: Date.now()
    };

    const merged: CardFormDraft = {
      ...existing,
      ...updates,
      messageId,
      lastUpdatedMs: Date.now()
    };

    const key = CardDraftStateManager.getCacheKey(messageId);
    cache.put(key, JSON.stringify(merged), ttlSeconds);
    return merged;
  }

  /**
   * Explicitly clears/deletes the draft state for messageId from UserCache (e.g. on document submission).
   */
  public static clearDraft(cache: CacheAdapterLike, messageId: string): void {
    if (!messageId) return;
    const key = CardDraftStateManager.getCacheKey(messageId);
    if (typeof cache.remove === "function") {
      cache.remove(key);
    } else {
      // Fallback for cache adapters without remove: overwrite with null/empty and 0 TTL
      cache.put(key, "", 0);
    }
  }

  /**
   * Core resolution algorithm: Blends (1) live inputs from card actions, (2) UserCache draft state,
   * (3) extracted email metadata, and (4) system defaults to produce the target card state and provenance map.
   */
  public static resolveCardFormState(params: {
    cache: CacheAdapterLike;
    messageId: string;
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
    const { cache, messageId, extractedMetadata = {}, liveFormInputs = {} } = params;

    const cachedDraft = CardDraftStateManager.getDraft(cache, messageId);

    // Resolve docTypeKey
    let docTypeKey = "GENERAL_CORRESPONDENCE";
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
      messageId,
      docTypeKey,
      projectId,
      csiSection,
      notes,
      aiAnalyzeRequested,
      lastUpdatedMs: cachedDraft?.lastUpdatedMs,
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
