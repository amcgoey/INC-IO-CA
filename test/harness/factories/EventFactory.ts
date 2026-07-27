// test/harness/factories/EventFactory.ts

// Ambient types GoogleAppsScriptEvent & DriveItem

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
    inputs: EventInputs = {},
    overrides: GmailContextOptions = {}
  ): GoogleAppsScriptEvent {
    const messageId =
      overrides.gmail?.messageId ?? overrides.messageId ?? "msg-test-123";
    const accessToken =
      overrides.gmail?.accessToken ?? overrides.accessToken ?? "mock-access-token";

    const baseOverrides: Partial<GoogleAppsScriptEvent> = { ...overrides };
    delete baseOverrides.gmail;

    const baseEvent = EventFactory.createCardSubmitEvent(inputs, baseOverrides);

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
    inputs: EventInputs = {},
    overrides: DriveContextOptions = {}
  ): GoogleAppsScriptEvent {
    const selectedItems: DriveItem[] =
      overrides.drive?.selectedItems ??
      overrides.selectedItems ?? [
        {
          id: "drive-file-123",
          title: "Test_Submittal.pdf",
          mimeType: "application/pdf"
        }
      ];

    const baseOverrides: Partial<GoogleAppsScriptEvent> = { ...overrides };
    delete baseOverrides.drive;

    const baseEvent = EventFactory.createCardSubmitEvent(inputs, baseOverrides);

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
