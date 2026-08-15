/**
 * @file UserInterfacePresenter.ts
 * @description Tier 1 pure core interface defining host-agnostic presentation outcomes for user interface events and workflow results.
 *
 * Dual-compatible with Google Apps Script V8 and Node.js without GAS dependencies or Node built-in imports.
 */

import type { DynamicPromptPayload } from '../specs/DocumentTypeSpec';

/**
 * Interface defining user interface presentation operations.
 */
export interface UserInterfacePresenter {
  presentValidationError(event: any, errors: string[], missingFields?: string[]): unknown;
  presentInteractionPrompt(event: any, promptType: "ADD_TAG" | "ADD_VENDOR", warningMessage: string): unknown;
  presentDynamicPromptCard?(
    event: any,
    payload: DynamicPromptPayload
  ): unknown;
  presentIncomingSuccess(event: any, result: any): unknown;
  presentOutgoingSuccess(event: any, result: any, eventParams: Record<string, string>): unknown;
  presentCardReload(event: any, isTagChange?: boolean): unknown;
  presentIntakeCard(event: any, initialData?: any, flashMessage?: any): unknown;
  presentNotification(notificationText: string): unknown;
  presentError(error: Error | string): unknown;
  presentMoveToClosedSuccess?(event: any, updatedCard: any, destName: string): unknown;
}
