// src/CardPresenter.ts

class CardPresenter {
  presentValidationError(
    e: GoogleAppsScriptEvent,
    errors: string[],
    missingFields?: string[]
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const flashData = {
      error: errors.join("\n"),
      missingFields: missingFields || []
    };

    const card = buildMainCard(e, null, false, flashData);

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .build();
  }

  presentCardReload(
    e: GoogleAppsScriptEvent,
    isTagChange?: boolean
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e, null, isTagChange || false);

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .build();
  }
}

var defaultCardPresenter: CardPresenter = new CardPresenter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CardPresenter,
    defaultCardPresenter
  };
}
