/**
 * @file CardPresenter.ts
 * @description Presenter application service responsible for assembling Google Apps Script `CardService.ActionResponse` navigation and notification responses.
 *
 * Encapsulates card updates (`updateCard`), card pushes (`pushCard`), and toast notifications (`setNotification`).
 */

/**
 * Application presenter class creating standardized `ActionResponse` UI navigation outcomes.
 */
class CardPresenter {
  /**
   * Helper constructing an `ActionResponse` updating the current active card with a new Card instance.
   *
   * @param card - Target `CardService.Card` instance.
   * @returns ActionResponse updating the Card UI.
   */
  private buildUpdateCardResponse(card: any): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .build();
  }

  /**
   * Helper constructing an `ActionResponse` pushing a new card onto the navigation stack.
   *
   * @param card - Target `CardService.Card` instance.
   * @returns ActionResponse pushing the Card UI.
   */
  private buildPushCardResponse(card: any): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(card))
      .build();
  }

  /**
   * Presents a validation error banner on the main UI card.
   *
   * @param e - Google Apps Script event object.
   * @param errors - List of fatal validation error messages.
   * @param missingFields - List of missing field names.
   * @returns ActionResponse updating main card with validation errors.
   */
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

  /**
   * Presents an interaction prompt on the main card asking the user to add a missing tag or vendor.
   *
   * @param e - Google Apps Script event object.
   * @param promptType - `"ADD_TAG"` or `"ADD_VENDOR"`.
   * @param warningMessage - Warning message string.
   * @returns ActionResponse updating main card with interactive prompt buttons.
   */
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

  /**
   * Presents the updated main UI card after successfully processing an incoming submittal ("Received").
   *
   * @param e - Google Apps Script event object.
   * @param result - Workflow execution outcome.
   * @returns ActionResponse updating main card with filing confirmation banner.
   */
  presentIncomingSuccess(
    e: GoogleAppsScriptEvent,
    result: DocumentWorkflowResult
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e, null, false, result);

    return this.buildUpdateCardResponse(card);
  }

  /**
   * Reloads the main card in response to form state changes (e.g. dropdown selections).
   *
   * @param e - Google Apps Script event object.
   * @param isTagChange - Flag indicating if state change was caused by a spec tag selection.
   * @returns ActionResponse updating main card.
   */
  presentCardReload(
    e: GoogleAppsScriptEvent,
    isTagChange?: boolean
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e, null, isTagChange || false);

    return this.buildUpdateCardResponse(card);
  }

  /**
   * Pushes a new outcome success card onto the navigation stack for outgoing submittals ("Reviewed", "Referred", etc).
   *
   * @param e - Google Apps Script event object.
   * @param result - Workflow execution outcome.
   * @param eventParams - Original action parameters.
   * @returns ActionResponse pushing the success card.
   */
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

  /**
   * Updates the success card and displays a toast notification confirming that a submittal file was moved to the Closed folder.
   *
   * @param e - Google Apps Script event object.
   * @param updatedCard - Updated success card instance.
   * @param destName - Destination folder name.
   * @returns ActionResponse updating card and showing notification toast.
   */
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

  /**
   * Reloads the main card and displays a cache cleared toast notification.
   *
   * @param e - Google Apps Script event object.
   * @returns ActionResponse reloading card and notifying user.
   */
  presentCacheRefresh(
    e: GoogleAppsScriptEvent
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = buildMainCard(e);

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification().setText("✅ Cache cleared. Data reloaded."))
      .build();
  }

  /**
   * Updates the main card after downloading a file from an external URL and displays an optional notification.
   *
   * @param e - Google Apps Script event object.
   * @param flashMessage - Optional flash message data.
   * @param notificationText - Optional toast notification message.
   * @returns ActionResponse updating card.
   */
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

  /**
   * Populates predicted AI analysis results into card form fields, reloads the main card, and displays an outcome toast.
   *
   * @param e - Google Apps Script event object.
   * @param analysisResult - Output from `AiAnalysisService.analyzeSubmittal`.
   * @returns ActionResponse updating form fields and displaying notification.
   */
  presentDeepAnalysisResult(
    e: GoogleAppsScriptEvent,
    analysisResult?: DeepAnalysisResult | any
  ): GoogleAppsScript.Card_Service.ActionResponse {
    if (analysisResult) {
      if (analysisResult.success === false) {
        let notifyMsg = MESSAGES.ERROR_AI_GENERAL(analysisResult.error ? analysisResult.error.userMessage : "Unknown Error");
        if (analysisResult.error && analysisResult.error.code === "RATE_LIMITED") {
          notifyMsg = MESSAGES.ERROR_AI_BUSY;
        }
        return this.presentNotification(notifyMsg);
      }

      if (analysisResult.success === true && analysisResult.analysis) {
        const analysis = analysisResult.analysis;
        const p = (e && e.parameters) || {};
        const form = (e && e.formInput) || {};
        const discipline = form.discipline || p.discipline || "Architecture";
        e.formInput = e.formInput || {};
        if (discipline === "Architecture") {
          if (analysis.predictedSection) e.formInput.section = analysis.predictedSection;
          if (analysis.predictedNumber) e.formInput.number = analysis.predictedNumber;
          if (analysis.predictedTitle) e.formInput.title = analysis.predictedTitle;
        } else {
          if (analysis.predictedSpecTag) e.formInput.specTag = analysis.predictedSpecTag;
          if (analysis.predictedVendor) e.formInput.vendor = analysis.predictedVendor;
        }

        if (analysis.predictedRevision) e.formInput.revision = String(analysis.predictedRevision);
        if (analysis.predictedContactAbbr) e.formInput.contact = analysis.predictedContactAbbr;
        if (analysis.predictedAction) e.formInput.action = analysis.predictedAction;
      }
    }

    const card = buildMainCard(e);

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification().setText(MESSAGES.SUCCESS_ANALYSIS))
      .build();
  }

  /**
   * Updates the success card with a direct Gmail draft email URL and shows a confirmation toast.
   *
   * @param e - Google Apps Script event object.
   * @param updatedSuccessCard - Updated success card instance.
   * @returns ActionResponse updating card and showing notification.
   */
  presentDraftEmailSuccess(
    e: GoogleAppsScriptEvent,
    updatedSuccessCard: GoogleAppsScript.Card_Service.Card
  ): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(updatedSuccessCard))
      .setNotification(CardService.newNotification().setText(MESSAGES.SUCCESS_DRAFT_CREATED))
      .build();
  }

  /**
   * Returns a simple notification toast ActionResponse.
   *
   * @param notificationText - Text to display in the toast notification.
   * @returns ActionResponse displaying toast.
   */
  presentNotification(
    notificationText: string
  ): GoogleAppsScript.Card_Service.ActionResponse {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(notificationText))
      .build();
  }
}

/** Global default instance seam for CardPresenter. */
var defaultCardPresenter: CardPresenter = new CardPresenter();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  (globalThis as any).defaultCardPresenter = defaultCardPresenter;
  module.exports = {
    CardPresenter,
    defaultCardPresenter
  };
}
