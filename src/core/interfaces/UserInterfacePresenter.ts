/**
 * @file UserInterfacePresenter.ts
 * @description Tier 1 pure core interface defining host-agnostic presentation outcomes for user interface events and workflow results.
 *
 * Dual-compatible with Google Apps Script V8 and Node.js without GAS dependencies or Node built-in imports.
 */

/**
 * Interface defining user interface presentation operations.
 */
interface UserInterfacePresenter {
  presentValidationError(event: GoogleAppsScriptEvent, errors: string[], missingFields?: string[]): unknown;
  presentInteractionPrompt(event: GoogleAppsScriptEvent, promptType: "ADD_TAG" | "ADD_VENDOR", warningMessage: string): unknown;
  presentIncomingSuccess(event: GoogleAppsScriptEvent, result: DocumentWorkflowResult): unknown;
  presentOutgoingSuccess(event: GoogleAppsScriptEvent, result: DocumentWorkflowResult, eventParams: Record<string, string>): unknown;
  presentCardReload(event: GoogleAppsScriptEvent, isTagChange?: boolean): unknown;
  presentNotification(notificationText: string): unknown;
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
