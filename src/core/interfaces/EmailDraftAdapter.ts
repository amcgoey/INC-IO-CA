/**
 * @file EmailDraftAdapter.ts
 * @description Pure Tier 1 interface defining email drafting operations.
 * Zero GAS globals, zero Node.js built-in imports (ADR-0013).
 */

export interface DraftEmailOptions {
  to?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  [key: string]: any;
}

export interface DraftEmailResult {
  draftId: string;
  draftUrl: string;
  subject: string;
}

export interface EmailDraftAdapter {
  createDraft(options: DraftEmailOptions): Promise<DraftEmailResult> | DraftEmailResult;
}

declare let module: { exports?: unknown };
if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
