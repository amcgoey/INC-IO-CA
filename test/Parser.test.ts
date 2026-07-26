import test from "node:test";
import assert from "node:assert/strict";

// Global mock configuration for GAS environment before requiring DocumentPipeline & Parser
(globalThis as any).CONFIG = {
  DEFAULT_ACTION: "Received",
  DEFAULT_DISCIPLINE: "Architecture",
  SUPPORTED_DISCIPLINES: ["Architecture", "FF&E"]
};

const { EmailIntakeParser, DriveFilenameIntakeParser, DocumentPipeline } = require("../src/DocumentPipeline");

(globalThis as any).DocumentPipeline = DocumentPipeline;
(globalThis as any).DriveFilenameIntakeParser = DriveFilenameIntakeParser;

(globalThis as any).CardService = {
  newCardBuilder: () => {
    let header: any = null;
    const sections: any[] = [];
    const builder: any = {
      setHeader: (h: any) => { header = h; return builder; },
      addSection: (s: any) => { sections.push(s); return builder; },
      build: () => ({ header, sections, cardType: 'Card' })
    };
    return builder;
  },
  newCardHeader: () => {
    return {
      setTitle: (t: string) => ({ title: t })
    };
  },
  newCardSection: () => {
    const widgets: any[] = [];
    const section: any = {
      addWidget: (w: any) => { widgets.push(w); return section; },
      widgets
    };
    return section;
  },
  newTextParagraph: () => {
    return {
      setText: (t: string) => ({ text: t })
    };
  }
};

(globalThis as any).MESSAGES = {
  ERROR_INVALID_SELECTION_TITLE: 'Invalid Selection',
  ERROR_INVALID_SELECTION_TEXT: 'Please select exactly one PDF file.'
};

(globalThis as any).Drive = {
  Files: {
    get: (id: string, opts?: any) => ({ id, driveId: 'drive-123' })
  }
};

(globalThis as any).defaultPdfDocumentService = {
  extractFormAction: async (fileId: string) => 'Received'
};

(globalThis as any).buildMainCard = (e: any, parsedData: any, isTagChange?: boolean, flashMessage?: any) => ({
  cardType: 'MainCard',
  e,
  parsedData,
  isTagChange,
  flashMessage
});

(globalThis as any).getCachedPrediction = (messageId: string) => null;
(globalThis as any).setCachedPrediction = (messageId: string, pred: any) => {};
(globalThis as any).getAvailableDriveNames = () => ["Project Gamma", "Skyline Tower"];
(globalThis as any).predictProjectAndDiscipline = (emailData: any, driveNames: string[]) => ({
  predictedProjectName: "Project Gamma",
  predictedDiscipline: "Architecture"
});

const { onDriveItemsSelected, buildAddOn } = require('../src/Main');

test("EmailIntakeParser.parseProcoreEmail_ extracts project driveName, spec section, revision, discipline, and action from subject", () => {
  const subject = "[Project Alpha] Submittal # 033000-001 has been submitted";
  const body = "Procore Submittal notification body text";

  const result = EmailIntakeParser.parseProcoreEmail_(subject, body);

  assert.equal(result.driveName, "Project Alpha");
  assert.equal(result.specSection, "033000");
  assert.equal(result.revNum, "001");
  assert.equal(result.discipline, "Architecture");
  assert.equal(result.action, "Received");
});

test("EmailIntakeParser.parseProcoreEmail_ identifies returned or reviewed submittal action", () => {
  const subject = "[Project Beta] Subm 081100-02 has been returned";
  const body = "Returned for review";

  const result = EmailIntakeParser.parseProcoreEmail_(subject, body);

  assert.equal(result.driveName, "Project Beta");
  assert.equal(result.specSection, "081100");
  assert.equal(result.revNum, "02");
  assert.equal(result.discipline, "Architecture");
  assert.equal(result.action, "Reviewed");
});

test("EmailIntakeParser.parseFormaEmail_ extracts project driveName, spec section, revision, and action", () => {
  const subject = "Project Gamma - # 033000-01 was submitted";
  const body = "Forma notification body";

  const result = EmailIntakeParser.parseFormaEmail_(subject, body);

  assert.equal(result.driveName, "Project Gamma");
  assert.equal(result.specSection, "033000");
  assert.equal(result.revNum, "01");
  assert.equal(result.discipline, "Architecture");
  assert.equal(result.action, "Received");
});

test("EmailIntakeParser.parseFormaEmail_ handles provided for information and forwarded intents", () => {
  const subject1 = "Project Gamma - Submittal # 081100-02 was provided for your information";
  const result1 = EmailIntakeParser.parseFormaEmail_(subject1, "");
  assert.equal(result1.driveName, "Project Gamma");
  assert.equal(result1.specSection, "081100");
  assert.equal(result1.revNum, "02");
  assert.equal(result1.action, "Received");

  const subject2 = "Project Delta - # 092900-03 was forwarded";
  const result2 = EmailIntakeParser.parseFormaEmail_(subject2, "");
  assert.equal(result2.driveName, "Project Delta");
  assert.equal(result2.specSection, "092900");
  assert.equal(result2.revNum, "03");
  assert.equal(result2.action, "Received");
});

test("EmailIntakeParser.parseFormaEmail_ preserves non-default action intents like reviewed", () => {
  const subject = "Project Epsilon - # 055000-01 was Reviewed";
  const result = EmailIntakeParser.parseFormaEmail_(subject, "");
  assert.equal(result.driveName, "Project Epsilon");
  assert.equal(result.specSection, "055000");
  assert.equal(result.revNum, "01");
  assert.equal(result.action, "Reviewed");
});

test("EmailIntakeParser.parseEmail handles null or undefined message cleanly", () => {
  const resultNull = EmailIntakeParser.parseEmail(null);
  assert.equal(resultNull.driveName, "");
  assert.equal(resultNull.discipline, "Architecture");
  assert.equal(resultNull.action, "Received");

  const resultUndefined = EmailIntakeParser.parseEmail(undefined);
  assert.equal(resultUndefined.driveName, "");
  assert.equal(resultUndefined.discipline, "Architecture");
  assert.equal(resultUndefined.action, "Received");
});

test("DocumentPipeline.parseEmail facade delegates to EmailIntakeParser.parseEmail for Procore messages", () => {
  const fakeProcoreMessage = {
    getFrom: () => "Procore Notifications <submittals@procoretech.com>",
    getSubject: () => "[Skyline Tower] Submittal # 230000-03 submitted",
    getPlainBody: () => "Submittal notification details..."
  };

  const parsed = DocumentPipeline.parseEmail(fakeProcoreMessage);

  assert.equal(parsed.driveName, "Skyline Tower");
  assert.equal(parsed.specSection, "230000");
  assert.equal(parsed.revNum, "03");
  assert.equal(parsed.discipline, "Architecture");
  assert.equal(parsed.action, "Received");
});

test("DocumentPipeline.parseEmail facade delegates for Autodesk Forma messages", () => {
  const fakeFormaMessage = {
    getFrom: () => "notifications@mail.forma.autodesk.com",
    getSubject: () => "Tower Project - # 081100-02 was submitted",
    getPlainBody: () => "Forma details..."
  };

  const parsed = DocumentPipeline.parseEmail(fakeFormaMessage);

  assert.equal(parsed.driveName, "Tower Project");
  assert.equal(parsed.specSection, "081100");
  assert.equal(parsed.revNum, "02");
  assert.equal(parsed.discipline, "Architecture");
  assert.equal(parsed.action, "Received");
});

test("DocumentPipeline.parseEmail facade returns default ParsedData for non-matching senders", () => {
  const fakeStandardMessage = {
    getFrom: () => "someone@example.com",
    getSubject: () => "Random Email",
    getPlainBody: () => "Hello world"
  };

  const parsed = DocumentPipeline.parseEmail(fakeStandardMessage);

  assert.equal(parsed.driveName, "");
  assert.equal(parsed.discipline, "Architecture");
  assert.equal(parsed.action, "Received");
});

test('DriveFilenameIntakeParser.parse - extracts ArchitectureStandard filename pattern fields correctly', () => {
  const filename = '081113-01-00 Hollow Metal Doors and Frames - 240115.pdf';
  const result = DriveFilenameIntakeParser.parse(filename);

  assert.equal(result.discipline, 'Architecture');
  assert.equal(result.section, '081113');
  assert.equal(result.number, '01');
  assert.equal(result.revision, '00');
  assert.equal(result.title, 'Hollow Metal Doors and Frames');
  assert.equal(result.date, '240115');
  assert.equal(result.fileSource, 'Drive');
});

test('DriveFilenameIntakeParser.parse - handles decimal section and submittal numbers in Architecture filenames', () => {
  const filename = '238239.19-63.0-0 Fan Coil Units - 240510.pdf';
  const result = DriveFilenameIntakeParser.parse(filename);

  assert.equal(result.discipline, 'Architecture');
  assert.equal(result.section, '238239.19');
  assert.equal(result.number, '63.0');
  assert.equal(result.revision, '0');
  assert.equal(result.title, 'Fan Coil Units');
  assert.equal(result.date, '240510');
});

test('DriveFilenameIntakeParser.parse - handles leading non-alphanumeric characters', () => {
  const filename = ' _081113-01-00 Hollow Metal Doors - 240115.pdf';
  const result = DriveFilenameIntakeParser.parse(filename);

  assert.equal(result.discipline, 'Architecture');
  assert.equal(result.section, '081113');
  assert.equal(result.number, '01');
  assert.equal(result.revision, '00');
  assert.equal(result.title, 'Hollow Metal Doors');
  assert.equal(result.date, '240115');
});

test('DriveFilenameIntakeParser.parse - extracts FFEStandard filename pattern fields correctly', () => {
  const filename = 'CH-01-01 Herman Miller Chair - 240320.pdf';
  const result = DriveFilenameIntakeParser.parse(filename);

  assert.equal(result.discipline, 'FF&E');
  assert.equal(result.specTag, 'CH-01');
  assert.equal(result.revision, '01');
  assert.equal(result.vendor, 'Herman Miller Chair');
  assert.equal(result.date, '240320');
});

test('DriveFilenameIntakeParser.parse - returns default RawDocument when filename does not match pattern', () => {
  const filename = 'UnstructuredDocument.pdf';
  const result = DriveFilenameIntakeParser.parse(filename);

  assert.equal(result.discipline, 'Architecture');
  assert.equal(result.fileSource, 'Drive');
  assert.equal(result.section, '');
  assert.equal(result.number, '');
  assert.equal(result.title, '');
});

test('DocumentPipeline.parseFilename - facade delegates to DriveFilenameIntakeParser.parse', () => {
  const filename = '081113-02-01 Metal Frames - 240201.pdf';
  const result = DocumentPipeline.parseFilename(filename);

  assert.equal(result.discipline, 'Architecture');
  assert.equal(result.section, '081113');
  assert.equal(result.number, '02');
  assert.equal(result.revision, '01');
  assert.equal(result.title, 'Metal Frames');
  assert.equal(result.date, '240201');
});

test('Main.ts onDriveItemsSelected - invokes DocumentPipeline.parseFilename and builds card with parsed data', async () => {
  const event = {
    drive: {
      selectedItems: [
        {
          id: 'file-pdf-1',
          mimeType: 'application/pdf',
          title: '081113-05-02 Custom Architectural Millwork - 240615.pdf'
        }
      ]
    }
  };

  const card: any = await onDriveItemsSelected(event as any);

  assert.equal(card.cardType, 'MainCard');
  assert.equal(card.parsedData.discipline, 'Architecture');
  assert.equal(card.parsedData.section, '081113');
  assert.equal(card.parsedData.number, '05');
  assert.equal(card.parsedData.revision, '02');
  assert.equal(card.parsedData.title, 'Custom Architectural Millwork');
  assert.equal(card.parsedData.date, '240615');
  assert.equal(card.parsedData.action, 'Received');
  assert.equal(card.parsedData.driveId, 'drive-123');
  assert.equal(event.parameters.driveFileId, 'file-pdf-1');
});

test('Main.ts onDriveItemsSelected - handles invalid selection when non-PDF or multiple items selected', async () => {
  const invalidEvent = {
    drive: {
      selectedItems: [
        {
          id: 'file-doc-1',
          mimeType: 'application/vnd.google-apps.document',
          title: 'Meeting Notes.docx'
        }
      ]
    }
  };

  const card: any = await onDriveItemsSelected(invalidEvent as any);

  assert.equal(card.cardType, 'Card');
  assert.equal(card.header.title, 'Invalid Selection');
});

test('Main.ts buildAddOn - populates parsedData with Forma submittal notification email details', () => {
  (globalThis as any).GmailApp = {
    setCurrentMessageAccessToken: (token: string) => {},
    getMessageById: (id: string) => ({
      getId: () => id,
      getFrom: () => "notifications@mail.forma.autodesk.com",
      getSubject: () => "Project Gamma - # 033000-01 was submitted",
      getPlainBody: () => "Submittal notification details...",
      getThread: () => ({
        getLabels: () => []
      }),
      getReplyTo: () => "",
      getTo: () => "",
      getCc: () => "",
      getAttachments: () => []
    })
  };

  const event = {
    gmail: {
      messageId: "msg-forma-001",
      accessToken: "token-abc"
    }
  };

  const card: any = buildAddOn(event);

  assert.equal(card.cardType, 'MainCard');
  assert.equal(card.parsedData.driveName, "Project Gamma");
  assert.equal(card.parsedData.specSection, "033000");
  assert.equal(card.parsedData.revNum, "01");
  assert.equal(card.parsedData.discipline, "Architecture");
  assert.equal(card.parsedData.action, "Received");
});
