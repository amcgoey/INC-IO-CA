import { buildSuccessCard, buildIntakeCard, buildDynamicSupportDataCard } from "./UI";
import type { DynamicPromptConfig } from "../../core/specs/DocumentTypeSpec";
import { DocumentFieldSpec } from "../../core/specs/DocumentTypeSpec";
import {
  DocumentTypeWidgetFactory,
  DocumentSectionViewModel,
  DocumentWidgetViewModel
} from "../../core/specs/DocumentTypeWidgetFactory";
import { FieldConfidenceThreshold } from "../../core/interfaces/AiAnalysisService";
import { MESSAGES, CONFIG } from "../../Config";

/**
 * @file CardPresenter.ts
 * @description Presenter application service responsible for assembling Google Apps Script `CardService.ActionResponse` navigation and notification responses.
 *
 * Encapsulates card updates (`updateCard`), card pushes (`pushCard`), and toast notifications (`setNotification`).
 */

/**
 * Application presenter class creating standardized `ActionResponse` UI navigation outcomes.
 */
export class CardPresenter implements UserInterfacePresenter {
  /**
   * Formats display title and diagnostic hint text for UI form fields.
   * Required fields that fail submit validation are prefixed with '? '.
   * AI fields with confidence < 0.85 are prefixed with '?? ' and assigned diagnostic hint text.
   *
   * @param field - Document field specification.
   * @param missingFields - List of missing field keys failing validation.
   * @param fieldConfidence - Map of field key to numerical confidence float (0.00 to 1.00).
   * @returns Object containing formatted displayTitle and hintText.
   */
  formatFieldTitleAndHint(
    field: DocumentFieldSpec,
    missingFields: string[] = [],
    fieldConfidence: Record<string, number> = {}
  ): { displayTitle: string; hintText: string } {
    const threshold =
      typeof FieldConfidenceThreshold !== "undefined"
        ? FieldConfidenceThreshold
        : 0.85;

    const result = DocumentTypeWidgetFactory.formatFieldTitleAndHint(
      field,
      missingFields,
      fieldConfidence,
      threshold
    );

    return {
      displayTitle: result.displayTitle,
      hintText: result.hintText
    };
  }

  /**
   * Translates an abstract DocumentWidgetViewModel into a physical Google Apps Script CardService widget.
   *
   * @param widgetVm - Abstract widget view model.
   * @returns CardService widget instance, or null if invalid.
   */
  renderWidget(
    widgetVm: DocumentWidgetViewModel
  ): GoogleAppsScript.Card_Service.Widget | null {
    if (!widgetVm) return null;

    if (widgetVm.type === "dropdown" || widgetVm.type === "multi_select") {
      const drop = CardService.newSelectionInput()
        .setTitle(widgetVm.displayTitle)
        .setFieldName(widgetVm.key);

      if (widgetVm.type === "multi_select") {
        drop.setType(CardService.SelectionInputType.MULTI_SELECT);
      } else {
        drop.setType(CardService.SelectionInputType.DROPDOWN);
      }

      if (widgetVm.options && widgetVm.options.length > 0) {
        widgetVm.options.forEach(opt => {
          drop.addItem(opt.label, opt.value, Boolean(opt.isSelected));
        });
      }

      if (widgetVm.onStateActionName) {
        drop.setOnChangeAction(
          CardService.newAction()
            .setFunctionName(widgetVm.onStateActionName)
            .setParameters(widgetVm.actionParams || {})
        );
      }

      return drop;
    }

    if (widgetVm.type === "date_picker") {
      if (
        typeof CardService !== "undefined" &&
        typeof (CardService as any).newDatePicker === "function"
      ) {
        const picker = (CardService as any)
          .newDatePicker()
          .setTitle(widgetVm.displayTitle)
          .setFieldName(widgetVm.key);

        if (widgetVm.value) {
          let epochMs: number | null = null;
          if (typeof widgetVm.value === "number") {
            epochMs = widgetVm.value;
          } else if (typeof widgetVm.value === "string") {
            if (/^\d{6}$/.test(widgetVm.value)) {
              const yy = parseInt(widgetVm.value.slice(0, 2), 10);
              const mm = parseInt(widgetVm.value.slice(2, 4), 10) - 1;
              const dd = parseInt(widgetVm.value.slice(4, 6), 10);
              const year = 2000 + yy;
              epochMs = new Date(year, mm, dd).getTime();
            } else if (!isNaN(Date.parse(widgetVm.value))) {
              epochMs = Date.parse(widgetVm.value);
            }
          }
          if (epochMs !== null && typeof (picker as any).setValueInMsSinceEpoch === "function") {
            (picker as any).setValueInMsSinceEpoch(epochMs);
          }
        }

        if (widgetVm.hintText && typeof (picker as any).setHint === "function") {
          (picker as any).setHint(widgetVm.hintText);
        }

        if (
          widgetVm.onStateActionName &&
          typeof (picker as any).setOnChangeAction === "function"
        ) {
          (picker as any).setOnChangeAction(
            CardService.newAction()
              .setFunctionName(widgetVm.onStateActionName)
              .setParameters(widgetVm.actionParams || {})
          );
        }

        return picker;
      } else {
        const input = CardService.newTextInput()
          .setTitle(widgetVm.displayTitle)
          .setFieldName(widgetVm.key)
          .setValue(String(widgetVm.value || ""));

        if (widgetVm.hintText && typeof (input as any).setHint === "function") {
          (input as any).setHint(widgetVm.hintText);
        }

        if (
          widgetVm.onStateActionName &&
          typeof (input as any).setOnChangeAction === "function"
        ) {
          (input as any).setOnChangeAction(
            CardService.newAction()
              .setFunctionName(widgetVm.onStateActionName)
              .setParameters(widgetVm.actionParams || {})
          );
        }

        return input;
      }
    }

    const input = CardService.newTextInput()
      .setTitle(widgetVm.displayTitle)
      .setFieldName(widgetVm.key)
      .setValue(String(widgetVm.value ?? ""));

    if (widgetVm.type === "multiline") {
      input.setMultiline(true);
    }

    if (widgetVm.suggestions && widgetVm.suggestions.length > 0) {
      input.setSuggestions(
        CardService.newSuggestions().addSuggestions(widgetVm.suggestions)
      );
    }

    if (widgetVm.hintText && typeof (input as any).setHint === "function") {
      (input as any).setHint(widgetVm.hintText);
    }

    if (
      widgetVm.onStateActionName &&
      typeof (input as any).setOnChangeAction === "function"
    ) {
      (input as any).setOnChangeAction(
        CardService.newAction()
          .setFunctionName(widgetVm.onStateActionName)
          .setParameters(widgetVm.actionParams || {})
      );
    }

    return input;
  }

  /**
   * Renders a DocumentSectionViewModel into a Google Apps Script CardSection.
   *
   * @param sectionVm - Abstract section view model.
   * @param targetSection - Optional existing section to populate.
   * @returns Populated CardSection, or null if view model is invisible.
   */
  renderDocumentSection(
    sectionVm: DocumentSectionViewModel | null | undefined,
    targetSection?: GoogleAppsScript.Card_Service.CardSection
  ): GoogleAppsScript.Card_Service.CardSection | null {
    if (!sectionVm || !sectionVm.visible) {
      return null;
    }

    const section =
      targetSection || CardService.newCardSection().setHeader(sectionVm.header);

    for (const widgetVm of sectionVm.fields) {
      const widget = this.renderWidget(widgetVm);
      if (widget) {
        section.addWidget(widget);
      }
    }

    return section;
  }

  buildUpdateCardResponse(card: GoogleAppsScript.Card_Service.Card | any): GoogleAppsScript.Card_Service.ActionResponse {
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

    const card = ((globalThis as any).buildIntakeCard || buildIntakeCard)(e, null, flashData);

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
  presentDynamicPromptCard(
    e: GoogleAppsScriptEvent,
    payload: {
      supportDataKey: string;
      fieldKey: string;
      userValue: string;
      dynamicPrompts: DynamicPromptConfig[];
      message?: string;
      interactionType?: string;
    }
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const builder = (globalThis as any).buildDynamicSupportDataCard || buildDynamicSupportDataCard;
    const card = builder(e, payload);
    return this.buildPushCardResponse(card);
  }

  /**
   * Presents an interaction prompt on the main card asking the user to add a missing tag or vendor.
   *
   * @param e - Google Apps Script event object.
   * @param promptType - "ADD_TAG" | "ADD_VENDOR".
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

    const card = ((globalThis as any).buildIntakeCard || buildIntakeCard)(e, null, flashData);

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
    const card = ((globalThis as any).buildIntakeCard || buildIntakeCard)(e, null, result);

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
    const builder = (globalThis as any).buildIntakeCard || buildIntakeCard;
    const card = builder(e, null);

    return this.buildUpdateCardResponse(card);
  }

  /**
   * Presents the Unbiased Multi-Document Contextual Intake Card.
   *
   * @param e - Google Apps Script event object.
   * @returns ActionResponse updating Card UI with unbiased intake card.
   */
  presentIntakeCard(
    e: GoogleAppsScriptEvent,
    initialData: ParsedData | null = null,
    flashMessage: any = null
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const builder = (globalThis as any).buildIntakeCard || buildIntakeCard;
    const card = builder(e, initialData, flashMessage);
    return this.buildUpdateCardResponse(card);
  }

  presentUnbiasedIntakeCard(
    e: GoogleAppsScriptEvent
  ): GoogleAppsScript.Card_Service.ActionResponse {
    const card = ((globalThis as any).buildIntakeCard || buildIntakeCard)(e);
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

    const discipline = form.discipline || eventParams.discipline || (typeof CONFIG !== "undefined" && (CONFIG as any).DEFAULT_DISCIPLINE ? (CONFIG as any).DEFAULT_DISCIPLINE : "Architecture");
    const isArchitecture = discipline === "Architecture";
    const isFFE = discipline === "FF&E";
    const sectionVal = isArchitecture ? (form.section || eventParams.section || "") : "";
    const specTagVal = isFFE ? (form.specTag || eventParams.specTag || "") : "";
    const itemTitle = result.title || form.title || (isFFE ? form.specTitle : "") || eventParams.itemTitle || eventParams.title || "";

    const builder = buildSuccessCard;
    const card = builder(
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
    const msg = (globalThis as any).MESSAGES || MESSAGES;
    const movedText = msg.SUCCESS_MOVED ? msg.SUCCESS_MOVED(destName) : `Moved to ${destName}`;
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(updatedCard))
      .setNotification(CardService.newNotification().setText(movedText))
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
    const card = ((globalThis as any).buildIntakeCard || buildIntakeCard)(e);

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification().setText("\u2705 Cache cleared. Data reloaded."))
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
    const buildCard = (globalThis as any).buildIntakeCard || buildIntakeCard;
    const card = buildCard(e, null, flashMessage);
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
        const msg = (globalThis as any).MESSAGES || MESSAGES;
        let notifyMsg = msg.ERROR_AI_GENERAL ? msg.ERROR_AI_GENERAL(analysisResult.error ? analysisResult.error.userMessage : 'Unknown Error') : '\u274C AI Error';
        if (analysisResult.error && analysisResult.error.code === "RATE_LIMITED") {
          notifyMsg = msg.ERROR_AI_BUSY ? msg.ERROR_AI_BUSY : '\u26A0\uFE0F AI Busy.';
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

    const card = ((globalThis as any).buildIntakeCard || buildIntakeCard)(e);

    const msg = (globalThis as any).MESSAGES || MESSAGES;
    const successText = msg.SUCCESS_ANALYSIS ? msg.SUCCESS_ANALYSIS : '\u2705 Analysis complete!';
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(card))
      .setNotification(CardService.newNotification().setText(successText))
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
    
    const msg = (globalThis as any).MESSAGES || MESSAGES;
    const draftText = msg.SUCCESS_DRAFT_CREATED ? msg.SUCCESS_DRAFT_CREATED : '\u2705 Draft created.';
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(updatedSuccessCard))
      .setNotification(CardService.newNotification().setText(draftText))
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
export const defaultCardPresenter: CardPresenter = new CardPresenter();


