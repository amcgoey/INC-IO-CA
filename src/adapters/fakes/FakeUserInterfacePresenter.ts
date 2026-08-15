/**
 * @file FakeUserInterfacePresenter.ts
 * @description In-memory fake implementation of `UserInterfacePresenter` recording UI presentation outcomes for unit tests.
 */

export class FakeUserInterfacePresenter implements UserInterfacePresenter {
  public calls: Array<{ method: string; args: any[] }> = [];

  presentValidationError(event: GoogleAppsScriptEvent, errors: string[], missingFields?: string[]): unknown {
    const payload = { method: "presentValidationError", event, errors, missingFields };
    this.calls.push({ method: "presentValidationError", args: [event, errors, missingFields] });
    return payload;
  }

  presentInteractionPrompt(event: GoogleAppsScriptEvent, promptType: "ADD_TAG" | "ADD_VENDOR", warningMessage: string): unknown {
    const payload = { method: "presentInteractionPrompt", event, promptType, warningMessage };
    this.calls.push({ method: "presentInteractionPrompt", args: [event, promptType, warningMessage] });
    return payload;
  }

  presentIncomingSuccess(event: GoogleAppsScriptEvent, result: DocumentWorkflowResult): unknown {
    const payload = { method: "presentIncomingSuccess", event, result };
    this.calls.push({ method: "presentIncomingSuccess", args: [event, result] });
    return payload;
  }

  presentOutgoingSuccess(event: GoogleAppsScriptEvent, result: DocumentWorkflowResult, eventParams: Record<string, string>): unknown {
    const payload = { method: "presentOutgoingSuccess", event, result, eventParams };
    this.calls.push({ method: "presentOutgoingSuccess", args: [event, result, eventParams] });
    return payload;
  }

  presentIntakeCard(event: GoogleAppsScriptEvent, initialData?: any, flashMessage?: any): unknown {
    const payload = { method: "presentIntakeCard", event, initialData, flashMessage };
    this.calls.push({ method: "presentIntakeCard", args: [event, initialData, flashMessage] });
    return payload;
  }

  presentCardReload(event: GoogleAppsScriptEvent, isTagChange?: boolean): unknown {
    const payload = { method: "presentCardReload", event, isTagChange };
    this.calls.push({ method: "presentCardReload", args: [event, isTagChange] });
    return payload;
  }

  presentNotification(notificationText: string): unknown {
    const payload = { method: "presentNotification", notificationText };
    this.calls.push({ method: "presentNotification", args: [notificationText] });
    return payload;
  }
}

declare let module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeUserInterfacePresenter
  };
}
