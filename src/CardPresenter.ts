// src/CardPresenter.ts

class CardPresenter {
  private buildUpdateCardResponse(card: any): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .build();
  }

  private buildPushCardResponse(card: any): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(card))
      .build();
  }

  presentValidationError(
    e: GoogleAppsScriptEvent,
    errors: string[],
    missingFields?: string[]
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const flashData = {
      error: errors.join('\n'),
      missingFields: missingFields || []
    };

    const card = buildMainCard(e, null, false, flashData);

    return this.buildUpdateCardResponse(card);
  }

  presentInteractionPrompt(
    e: GoogleAppsScriptEvent,
    promptType: "ADD_TAG" | "ADD_VENDOR",
    warningMessage: string
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const flashData: FlashMessage = {
      warning: warningMessage,
      promptAddTag: promptType === "ADD_TAG",
      promptAddVendor: promptType === "ADD_VENDOR"
    };

    const card = buildMainCard(e, null, false, flashData);

    return this.buildUpdateCardResponse(card);
  }

  presentIncomingSuccess(
    e: GoogleAppsScriptEvent,
    result: DocumentWorkflowResult
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e, null, false, result);

    return this.buildUpdateCardResponse(card);
  }

  presentCardReload(
    e: GoogleAppsScriptEvent,
    isTagChange?: boolean
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e, null, isTagChange || false);

    return this.buildUpdateCardResponse(card);
  }

  presentOutgoingSuccess(
    e: GoogleAppsScriptEvent,
    result: DocumentWorkflowResult,
    eventParams: Record<string, string>
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const form = (e && e.formInput) || {};

    const discipline = form.discipline || eventParams.discipline || (typeof CONFIG !== "undefined" && CONFIG.DEFAULT_DISCIPLINE ? CONFIG.DEFAULT_DISCIPLINE : "Architecture");
    const isArchitecture = discipline === "Architecture";
    const isFFE = discipline === "FF&E";
    const sectionVal = isArchitecture ? (form.section || eventParams.section || "") : "";
    const specTagVal = isFFE ? (form.specTag || eventParams.specTag || "") : "";
    const itemTitle = result.title || form.title || (isFFE ? form.specTitle : "") || eventParams.itemTitle || eventParams.title || "";

    const card = buildSuccessCard(
      result.fileId,
      result.newFileName,
      result.url,
      result.localPath,
      result.targetKey,
      itemTitle,
      discipline,
      sectionVal,
      specTagVal,
      eventParams.targetFolderId,
      eventParams.logFileId,
      false,
      result.projectAbbr || eventParams.projectAbbr,
      result.action || form.action,
      result.incomingRouting || form.incomingRouting,
      null,
      result.directRowUrl,
      result.failedColumns,
      result.emptyFallbacks
    );

    return this.buildPushCardResponse(card);
  }

  presentMoveToClosedSuccess(
    e: GoogleAppsScriptEvent,
    updatedCard: GoogleAppsScript.Card_Service.Card,
    destName: string
  ): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(updatedCard))
      .setNotification(CardService.newNotification().setText(MESSAGES.SUCCESS_MOVED(destName)))
      .build();
  }

  presentCacheRefresh(
    e: GoogleAppsScriptEvent
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e);

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification().setText("✅ Cache cleared. Data reloaded."))
      .build();
  }

  presentFetchUrlResult(
    e: GoogleAppsScriptEvent,
    flashMessage?: any,
    notificationText?: string
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e, null, false, flashMessage);
    const builder = CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card));

    if (notificationText) {
      builder.setNotification(CardService.newNotification().setText(notificationText));
    }

    return builder.build();
  }

  presentNotification(
    notificationText: string
  ): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(notificationText))
      .build();
  }
}

var defaultCardPresenter: CardPresenter = new CardPresenter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).defaultCardPresenter = defaultCardPresenter;
  module.exports = {
    CardPresenter,
    defaultCardPresenter
  };
}
