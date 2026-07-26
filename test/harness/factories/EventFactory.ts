// test/harness/factories/EventFactory.ts

import { GoogleAppsScriptEvent, DriveItem } from "../../../src/types";

export type EventInputs = Record<
  string,
  string | string[] | number | boolean | undefined
>;

export class EventFactory {
  /**
   * Generates a Card submit event payload with automatic dual-form
   * (formInput scalar map & formInputs array map) normalization.
   */
  static createCardSubmitEvent(
    inputs: EventInputs = {},
    overrides: Partial<GoogleAppsScriptEvent> = {}
  ): GoogleAppsScriptEvent {
    const formInput: Record<string, string> = { ...(overrides.formInput || {}) };
    const formInputs: Record<string, string[]> = { ...(overrides.formInputs || {}) };

    for (const [key, value] of Object.entries(inputs)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        const stringArray = value.map(item => String(item));
        formInputs[key] = stringArray;
        formInput[key] = stringArray.length > 0 ? stringArray[0] : "";
      } else {
        const stringValue = String(value);
        formInput[key] = stringValue;
        formInputs[key] = [stringValue];
      }
    }

    return {
      ...overrides,
      formInput,
      formInputs
    };
  }

  /**
   * Generates a Workspace Add-on Gmail contextual trigger event payload.
   */
  static createGmailContextEvent(
    overrides?: Partial<GoogleAppsScriptEvent> & {
      messageId?: string;
      accessToken?: string;
    }
  ): GoogleAppsScriptEvent {
    const messageId =
      overrides?.gmail?.messageId ?? overrides?.messageId ?? "msg-test-123";
    const accessToken =
      overrides?.gmail?.accessToken ?? overrides?.accessToken ?? "mock-access-token";

    const { messageId: _m, accessToken: _a, ...restOverrides } = overrides || {};

    const baseEvent = EventFactory.createCardSubmitEvent(
      {},
      restOverrides as Partial<GoogleAppsScriptEvent>
    );

    return {
      ...baseEvent,
      gmail: {
        messageId,
        accessToken
      }
    };
  }

  /**
   * Generates a Workspace Add-on Drive contextual trigger event payload.
   */
  static createDriveContextEvent(
    overrides?: Partial<GoogleAppsScriptEvent> & {
      selectedItems?: DriveItem[];
    }
  ): GoogleAppsScriptEvent {
    const selectedItems: DriveItem[] =
      overrides?.drive?.selectedItems ??
      overrides?.selectedItems ?? [
        {
          id: "drive-file-123",
          title: "Test_Submittal.pdf",
          mimeType: "application/pdf"
        }
      ];

    const { selectedItems: _s, ...restOverrides } = overrides || {};

    const baseEvent = EventFactory.createCardSubmitEvent(
      {},
      restOverrides as Partial<GoogleAppsScriptEvent>
    );

    return {
      ...baseEvent,
      drive: {
        selectedItems
      }
    };
  }
}

export const createCardSubmitEvent = EventFactory.createCardSubmitEvent;
export const createGmailContextEvent = EventFactory.createGmailContextEvent;
export const createDriveContextEvent = EventFactory.createDriveContextEvent;
