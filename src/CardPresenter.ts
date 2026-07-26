// src/CardPresenter.ts

class CardPresenter {
  private buildUpdateCardResponse(card: any): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .build();
  }

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

    return this.buildUpdateCardResponse(card);
  }

  presentCardReload(
    e: GoogleAppsScriptEvent,
    isTagChange?: boolean
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e, null, isTagChange || false);

    return this.buildUpdateCardResponse(card);
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
