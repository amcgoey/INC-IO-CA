// START FILE: Main.gs
function buildAddOn(e) {
  const messageId = e.gmail.messageId;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);
  const message = GmailApp.getMessageById(messageId);
  const parsedData = parseEmailData(message);

  let aiPrediction = getCachedPrediction(messageId);
  let flashMessage = null;

  if (!aiPrediction) {
    const driveNames = getAvailableDriveNames();
    const thread = message.getThread();
    const labels = thread.getLabels().map(l => l.getName());

    const emailData = {
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

    if (aiPrediction && !aiPrediction.error) {
      setCachedPrediction(messageId, aiPrediction);
    }
  }

  if (aiPrediction) {
    if (aiPrediction.error) {
      flashMessage = { warning: aiPrediction.error };
    } else {
      parsedData.driveName = aiPrediction.predictedProjectName || parsedData.driveName || "";

      // --- NEW: Strict Validation & Config Fallback ---
      if (CONFIG.SUPPORTED_DISCIPLINES.includes(aiPrediction.predictedDiscipline)) {
        parsedData.discipline = aiPrediction.predictedDiscipline;
      } else {
        parsedData.discipline = CONFIG.DEFAULT_DISCIPLINE;
      }
      // ------------------------------------------------
    }
  }

  return buildMainCard(e, parsedData, false, flashMessage);
}

async function onDriveItemsSelected(e) {
  const items = e.drive.selectedItems;

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
    const fileMeta = Drive.Files.get(fileId, { supportsAllDrives: true });
    if (fileMeta.driveId) parsedData.driveId = fileMeta.driveId;
  } catch (err) { }

  const actionFromPdf = await extractActionFromPdfForm(fileId);
  if (actionFromPdf) parsedData.action = actionFromPdf;

  e.parameters = e.parameters || {};
  e.parameters.driveFileId = fileId;

  return buildMainCard(e, parsedData);
}
// END FILE: Main.gs