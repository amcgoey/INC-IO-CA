// src/CardPresenter.ts

declare var buildMainCard: any;
declare var CardService: any;

export class CardPresenter {
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
}

export const defaultCardPresenter = new CardPresenter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CardPresenter,
    defaultCardPresenter
  };
}
