// START FILE: Main.ts

declare var defaultAiAnalysisService: AiAnalysisService;

async function buildAddOn(e: GoogleAppsScriptEvent): Promise<GoogleAppsScript.Card_Service.Card> {
  const messageId = e.gmail ? e.gmail.messageId : "";
  const accessToken = e.gmail ? e.gmail.accessToken : "";
  if (accessToken && typeof GmailApp !== "undefined" && GmailApp.setCurrentMessageAccessToken) {
    GmailApp.setCurrentMessageAccessToken(accessToken);
  }
  const message = messageId && typeof GmailApp !== "undefined" && GmailApp.getMessageById ? GmailApp.getMessageById(messageId) : null;
  const parsedData = DocumentPipeline.parseEmail(message);

  let flashMessage: FlashMessage | null = null;

  if (message) {
    const thread = message.getThread ? message.getThread() : null;
    const labels = thread && thread.getLabels ? thread.getLabels().map((l: any) => l.getName()) : [];

    const emailData: EmailData = {
      subject: message.getSubject ? message.getSubject() : "",
      sender: message.getFrom ? message.getFrom() : "",
      replyTo: message.getReplyTo ? message.getReplyTo() : "",
      to: message.getTo ? message.getTo() : "",
      cc: message.getCc ? message.getCc() : "",
      labels: labels,
      attachmentNames: message.getAttachments ? message.getAttachments().map((a: any) => a.getName()) : [],
      body: message.getPlainBody ? message.getPlainBody() : ""
    };

    if (typeof defaultAiAnalysisService !== "undefined" && defaultAiAnalysisService.triageEmail) {
      const triageResult = await defaultAiAnalysisService.triageEmail(emailData, messageId);

      if (triageResult.success) {
        const pred = triageResult.prediction;
        if (pred) {
          parsedData.driveName = pred.predictedProjectName || parsedData.driveName || "";

          // --- Strict Validation & Config Fallback ---
          if (pred.predictedDiscipline && CONFIG.SUPPORTED_DISCIPLINES.includes(pred.predictedDiscipline)) {
            parsedData.discipline = pred.predictedDiscipline;
          } else {
            parsedData.discipline = CONFIG.DEFAULT_DISCIPLINE;
          }
          // ------------------------------------------
        }
      } else if (triageResult.error) {
        flashMessage = { warning: triageResult.error.userMessage };
        parsedData.discipline = CONFIG.DEFAULT_DISCIPLINE;
      }
    }
  }

  return buildMainCard(e, parsedData, false, flashMessage);
}

async function onDriveItemsSelected(e: GoogleAppsScriptEvent): Promise<GoogleAppsScript.Card_Service.Card> {
  const items = e.drive ? e.drive.selectedItems : [];

  if (items.length !== 1 || items[0].mimeType !== 'application/pdf') {
    return CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle(MESSAGES.ERROR_INVALID_SELECTION_TITLE))
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText(MESSAGES.ERROR_INVALID_SELECTION_TEXT)))
      .build();
  }

  const fileId = items[0].id;
  const fileName = items[0].title;
  const parsedData = DocumentPipeline.parseFilename(fileName);

  try {
    const fileMeta = (Drive as any).Files.get(fileId, { supportsAllDrives: true });
    if (fileMeta.driveId) parsedData.driveId = fileMeta.driveId;
  } catch (err) { }

  const actionFromPdf = await defaultPdfDocumentService.extractFormAction(fileId);
  if (actionFromPdf) parsedData.action = actionFromPdf;

  e.parameters = e.parameters || {};
  e.parameters.driveFileId = fileId;

  return buildMainCard(e, parsedData);
}
// END FILE: Main.ts


declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    onDriveItemsSelected,
    buildAddOn
  };
}
