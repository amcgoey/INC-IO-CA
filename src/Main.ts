// START FILE: Main.ts

function buildAddOn(e: GoogleAppsScriptEvent): GoogleAppsScript.Card_Service.Card {
  const messageId = e.gmail ? e.gmail.messageId : "";
  const accessToken = e.gmail ? e.gmail.accessToken : "";
  if (accessToken) {
    GmailApp.setCurrentMessageAccessToken(accessToken);
  }
  const message = messageId ? GmailApp.getMessageById(messageId) : null;
  const parsedData = parseEmailData(message);

  let aiPrediction = messageId ? getCachedPrediction(messageId) : null;
  let flashMessage: FlashMessage | null = null;

  if (!aiPrediction && message) {
    const driveNames = getAvailableDriveNames();
    const thread = message.getThread();
    const labels = thread.getLabels().map(l => l.getName());

    const emailData: EmailData = {
      subject: message.getSubject(),
      sender: message.getFrom(),
      replyTo: message.getReplyTo(),
      to: message.getTo(),
      cc: message.getCc(),
      labels: labels,
      attachmentNames: message.getAttachments().map(a => a.getName()),
      body: message.getPlainBody()
    };

    aiPrediction = predictProjectAndDiscipline(emailData, driveNames);

    if (aiPrediction && !aiPrediction.error && messageId) {
      setCachedPrediction(messageId, aiPrediction);
    }
  }

  if (aiPrediction) {
    if (aiPrediction.error) {
      flashMessage = { warning: aiPrediction.error };
    } else {
      parsedData.driveName = aiPrediction.predictedProjectName || parsedData.driveName || "";

      // --- Strict Validation & Config Fallback ---
      if (aiPrediction.predictedDiscipline && CONFIG.SUPPORTED_DISCIPLINES.includes(aiPrediction.predictedDiscipline)) {
        parsedData.discipline = aiPrediction.predictedDiscipline;
      } else {
        parsedData.discipline = CONFIG.DEFAULT_DISCIPLINE;
      }
      // ------------------------------------------
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
  const parsedData = parseDriveFilename(fileName);

  try {
    const fileMeta = (globalThis as any).Drive.Files.get(fileId, { supportsAllDrives: true });
    if (fileMeta.driveId) parsedData.driveId = fileMeta.driveId;
  } catch (err) { }

  const actionFromPdf = await extractActionFromPdfForm(fileId);
  if (actionFromPdf) parsedData.action = actionFromPdf;

  e.parameters = e.parameters || {};
  e.parameters.driveFileId = fileId;

  return buildMainCard(e, parsedData);
}
// END FILE: Main.ts
