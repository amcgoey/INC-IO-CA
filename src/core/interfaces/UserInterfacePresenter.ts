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
  presentValidationError(event: any, errors: string[], missingFields?: string[]): any;
  presentInteractionPrompt(event: any, promptType: "ADD_TAG" | "ADD_VENDOR", warningMessage: string): any;
  presentIncomingSuccess(event: any, result: any): any;
  presentOutgoingSuccess(event: any, result: any, eventParams: Record<string, string>): any;
  presentCardReload(event: any, isTagChange?: boolean): any;
  presentNotification(notificationText: string): any;
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
