// test/harness/factories/EventFactory.ts

import { GoogleAppsScriptEvent, DriveItem } from "../../../src/types";

export type EventInputs = Record<
  string,
  string | string[] | number | boolean | undefined
>;

export interface GmailContextOptions extends Partial<GoogleAppsScriptEvent> {
  messageId?: string;
  accessToken?: string;
}

export interface DriveContextOptions extends Partial<GoogleAppsScriptEvent> {
  selectedItems?: DriveItem[];
}

function isGmailOptions(obj: unknown): obj is GmailContextOptions {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    "gmail" in o ||
    "messageId" in o ||
    "accessToken" in o ||
    "parameters" in o
  );
}

function isDriveOptions(obj: unknown): obj is DriveContextOptions {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    "drive" in o ||
    "selectedItems" in o ||
    "parameters" in o
  );
}

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
        if (stringArray.length > 0) {
          formInput[key] = stringArray[0];
        }
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
    inputsOrOverrides?: EventInputs | GmailContextOptions,
    explicitOverrides?: GmailContextOptions
  ): GoogleAppsScriptEvent {
    let inputs: EventInputs = {};
    let options: GmailContextOptions = {};

    if (explicitOverrides !== undefined) {
      inputs = (inputsOrOverrides as EventInputs) || {};
      options = explicitOverrides;
    } else if (isGmailOptions(inputsOrOverrides)) {
      options = inputsOrOverrides;
    } else if (inputsOrOverrides) {
      inputs = inputsOrOverrides as EventInputs;
    }

    const messageId =
      options.gmail?.messageId ?? options.messageId ?? "msg-test-123";
    const accessToken =
      options.gmail?.accessToken ?? options.accessToken ?? "mock-access-token";

    const {
      messageId: unusedMessageId,
      accessToken: unusedAccessToken,
      ...restOverrides
    } = options;

    const baseEvent = EventFactory.createCardSubmitEvent(
      inputs,
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
    inputsOrOverrides?: EventInputs | DriveContextOptions,
    explicitOverrides?: DriveContextOptions
  ): GoogleAppsScriptEvent {
    let inputs: EventInputs = {};
    let options: DriveContextOptions = {};

    if (explicitOverrides !== undefined) {
      inputs = (inputsOrOverrides as EventInputs) || {};
      options = explicitOverrides;
    } else if (isDriveOptions(inputsOrOverrides)) {
      options = inputsOrOverrides;
    } else if (inputsOrOverrides) {
      inputs = inputsOrOverrides as EventInputs;
    }

    const selectedItems: DriveItem[] =
      options.drive?.selectedItems ??
      options.selectedItems ?? [
        {
          id: "drive-file-123",
          title: "Test_Submittal.pdf",
          mimeType: "application/pdf"
        }
      ];

    const { selectedItems: unusedSelectedItems, ...restOverrides } = options;

    const baseEvent = EventFactory.createCardSubmitEvent(
      inputs,
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
