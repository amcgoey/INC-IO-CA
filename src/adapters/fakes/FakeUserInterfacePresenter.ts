/**
 * @file FakeUserInterfacePresenter.ts
 * @description In-memory fake implementation of `UserInterfacePresenter` recording UI presentation outcomes for unit tests.
 */

export class FakeUserInterfacePresenter implements UserInterfacePresenter {
  public calls: Array<{ method: string; args: any[] }> = [];

  presentValidationError(event: any, errors: string[], missingFields?: string[]): any {
    const payload = { method: "presentValidationError", event, errors, missingFields };
    this.calls.push({ method: "presentValidationError", args: [event, errors, missingFields] });
    return payload;
  }

  presentInteractionPrompt(event: any, promptType: "ADD_TAG" | "ADD_VENDOR", warningMessage: string): any {
    const payload = { method: "presentInteractionPrompt", event, promptType, warningMessage };
    this.calls.push({ method: "presentInteractionPrompt", args: [event, promptType, warningMessage] });
    return payload;
  }

  presentIncomingSuccess(event: any, result: any): any {
    const payload = { method: "presentIncomingSuccess", event, result };
    this.calls.push({ method: "presentIncomingSuccess", args: [event, result] });
    return payload;
  }

  presentOutgoingSuccess(event: any, result: any, eventParams: Record<string, string>): any {
    const payload = { method: "presentOutgoingSuccess", event, result, eventParams };
    this.calls.push({ method: "presentOutgoingSuccess", args: [event, result, eventParams] });
    return payload;
  }

  presentCardReload(event: any, isTagChange?: boolean): any {
    const payload = { method: "presentCardReload", event, isTagChange };
    this.calls.push({ method: "presentCardReload", args: [event, isTagChange] });
    return payload;
  }

  presentNotification(notificationText: string): any {
    const payload = { method: "presentNotification", notificationText };
    this.calls.push({ method: "presentNotification", args: [notificationText] });
    return payload;
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeUserInterfacePresenter
  };
}
