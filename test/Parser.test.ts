import test from "node:test";
import assert from "node:assert/strict";

// Global mock configuration for GAS environment before requiring DocumentPipeline & Parser
(globalThis as any).CONFIG = {
  DEFAULT_ACTION: "Received",
  DEFAULT_DISCIPLINE: "Architecture",
  SUPPORTED_DISCIPLINES: ["Architecture", "FF&E"]
};

import { DriveFilenameIntakeParser, DocumentPipeline } from "../src/core/intake/DocumentPipeline";
import { EmailIntakeParser } from "../src/core/intake/EmailIntakeParser";
import "../src/AiAnalysisService";
import { FakeAiAnalysisAdapter } from "./harness/index";

(globalThis as any).DocumentPipeline = DocumentPipeline;
(globalThis as any).DriveFilenameIntakeParser = DriveFilenameIntakeParser;
(globalThis as any).EmailIntakeParser = EmailIntakeParser;

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

import { onDriveItemsSelected, buildAddOn } from '../src/Main';

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
  assert.equal(result.action, "Received");
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

test("EmailIntakeParser.parseFormaEmail_ defaults action to Received for incoming email notifications", () => {
  const subject = "Project Epsilon - # 055000-01 was Reviewed";
  const result = EmailIntakeParser.parseFormaEmail_(subject, "");
  assert.equal(result.driveName, "Project Epsilon");
  assert.equal(result.specSection, "055000");
  assert.equal(result.revNum, "01");
  assert.equal(result.action, "Received");
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

test('Main.ts buildAddOn - populates parsedData with Forma submittal notification email details', async () => {
  const fakeAi = new FakeAiAnalysisAdapter();
  fakeAi.setTriageResult({ success: true, prediction: { predictedProjectName: "Project Gamma", predictedDiscipline: "Architecture" } });
  (globalThis as any).defaultAiAnalysisService = fakeAi;

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

  const card: any = await buildAddOn(event);

  assert.equal(card.cardType, 'MainCard');
  assert.equal(card.parsedData.driveName, "Project Gamma");
  assert.equal(card.parsedData.specSection, "033000");
  assert.equal(card.parsedData.revNum, "01");
  assert.equal(card.parsedData.discipline, "Architecture");
  assert.equal(card.parsedData.action, "Received");
});

test("EmailIntakeParser parses Email 1 (.eml sample: Procore Distributed) correctly", () => {
  const fs = require("fs");
  const path = require("path");
  const emlPath = path.resolve(__dirname, "../.scratch/submittal email examples/24003-01, 38 East 35th Street_ Submittal Distributed 099100-17.0, PT432 - Public Spaces Limewash Samples.eml");
  if (!fs.existsSync(emlPath)) return;
  const content = fs.readFileSync(emlPath, "utf-8");

  const subjMatch = content.match(/^Subject:\s*([\s\S]*?)(?=\r?\n[A-Z][A-Za-z0-9-]*:|\r?\n\r?\n)/im);
  const subject = subjMatch ? subjMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';

  const msg = {
    getFrom: () => "Olivia O'Rourke (CM & Associates) <CM__Associates@us02.procoretech.com>",
    getReplyTo: () => "do-not-reply@procore.com",
    getSubject: () => subject,
    getPlainBody: () => content
  };

  const parsed = EmailIntakeParser.parseEmail(msg as any);

  assert.equal(parsed.specSection, "099100");
  assert.equal(parsed.submittalNum, "017");
  assert.equal(parsed.revNum, "0");
  assert.equal(parsed.title, "PT432 - Public Spaces Limewash Samples");
  assert.equal(parsed.action, "Received");
});

test("EmailIntakeParser parses Email 2 (.eml sample: Procore Approver Response Updated) correctly", () => {
  const fs = require("fs");
  const path = require("path");
  const emlPath = path.resolve(__dirname, "../.scratch/submittal email examples/Action Required_ 24003-01, 38 East 35th Street_ Approver Erwan Malki Updated their Response for Submittal 084113-11.2, Entrance Canopy Shop Drawing.eml");
  if (!fs.existsSync(emlPath)) return;
  const content = fs.readFileSync(emlPath, "utf-8");

  const subjMatch = content.match(/^Subject:\s*([\s\S]*?)(?=\r?\n[A-Z][A-Za-z0-9-]*:|\r?\n\r?\n)/im);
  const subject = subjMatch ? subjMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';

  const msg = {
    getFrom: () => "'Erwan Malki (Socotec, Inc)' via 26 E 35 CA <26-e-35-ca@inc.nyc>",
    getReplyTo: () => "do-not-reply@procore.com",
    getSubject: () => subject,
    getPlainBody: () => content
  };

  const parsed = EmailIntakeParser.parseEmail(msg as any);

  assert.equal(parsed.specSection, "084113");
  assert.equal(parsed.submittalNum, "011");
  assert.equal(parsed.revNum, "2");
  assert.equal(parsed.title, "Entrance Canopy Shop Drawing");
  assert.equal(parsed.action, "Received");
});

test("EmailIntakeParser parses Email 3 (.eml sample: Procore Approver Response Updated - Variation) correctly", () => {
  const fs = require("fs");
  const path = require("path");
  const emlPath = path.resolve(__dirname, "../.scratch/submittal email examples/Action Required_ 24003-01, 38 East 35th Street_ Approver Olivia O'Rourke Updated their Response for Submittal 102820-1.1, Shower Enclosure Hardware.eml");
  if (!fs.existsSync(emlPath)) return;
  const content = fs.readFileSync(emlPath, "utf-8");

  const subjMatch = content.match(/^Subject:\s*([\s\S]*?)(?=\r?\n[A-Z][A-Za-z0-9-]*:|\r?\n\r?\n)/im);
  const subject = subjMatch ? subjMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';

  const msg = {
    getFrom: () => "'Olivia O'Rourke (CM & Associates)' via 26 E 35 CA <26-e-35-ca@inc.nyc>",
    getReplyTo: () => "do-not-reply@procore.com",
    getSubject: () => subject,
    getPlainBody: () => content
  };

  const parsed = EmailIntakeParser.parseEmail(msg as any);

  assert.equal(parsed.specSection, "102820");
  assert.equal(parsed.submittalNum, "001");
  assert.equal(parsed.revNum, "1");
  assert.equal(parsed.title, "Shower Enclosure Hardware");
  assert.equal(parsed.action, "Received");
});

test("EmailIntakeParser parses Email 4 (.eml sample: Autodesk Forma) correctly", () => {
  const fs = require("fs");
  const path = require("path");
  const emlPath = path.resolve(__dirname, "../.scratch/submittal email examples/Ballston Macy's - Submittal #06 20 00-003-00 was provided for your information (1).eml");
  if (!fs.existsSync(emlPath)) return;
  const content = fs.readFileSync(emlPath, "utf-8");

  const subjMatch = content.match(/^Subject:\s*([\s\S]*?)(?=\r?\n[A-Z][A-Za-z0-9-]*:|\r?\n\r?\n)/im);
  const subject = subjMatch ? subjMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';

  const msg = {
    getFrom: () => "Autodesk Forma <no-reply@mail.forma.autodesk.com>",
    getReplyTo: () => "",
    getSubject: () => subject,
    getPlainBody: () => content
  };

  const parsed = EmailIntakeParser.parseEmail(msg as any);

  assert.equal(parsed.specSection, "062000");
  assert.equal(parsed.submittalNum, "003");
  assert.equal(parsed.revNum, "00");
  assert.equal(parsed.title, "Phase 2 Millwork Samples");
  assert.equal(parsed.action, "Received");
});

test("EmailIntakeParser parses Email 5 (.eml sample: CMiC Collaborate) correctly", () => {
  const fs = require("fs");
  const path = require("path");
  const emlPath = path.resolve(__dirname, "../.scratch/submittal email examples/New TRNS _ TRN00588 _ [11009106AU - Christie's 20 Rockefeller Plaza Reno-Auction Phase 2] P2_062200-030-1_Walnut Wood Refinishing_For App.eml");
  if (!fs.existsSync(emlPath)) return;
  const content = fs.readFileSync(emlPath, "utf-8");

  const subjMatch = content.match(/^Subject:\s*([\s\S]*?)(?=\r?\n[A-Z][A-Za-z0-9-]*:|\r?\n\r?\n)/im);
  const subject = subjMatch ? subjMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';

  const msg = {
    getFrom: () => "Neil Shah <nshah@inc.nyc>",
    getReplyTo: () => "",
    getSubject: () => subject,
    getPlainBody: () => content
  };

  const parsed = EmailIntakeParser.parseEmail(msg as any);

  assert.equal(parsed.specSection, "062200");
  assert.equal(parsed.submittalNum, "030");
  assert.equal(parsed.revNum, "1");
  assert.equal(parsed.title, "Walnut Wood Refinishing");
  assert.equal(parsed.action, "Received");
});

test("EmailIntakeParser.parseGenericEmail_ parses non-vendor submittal emails correctly", () => {
  const msg1 = {
    getFrom: () => "general@subcontractor.com",
    getSubject: () => "Submittal 099100-17.0 for review",
    getPlainBody: () => "Attached is the submittal"
  };
  const parsed1 = EmailIntakeParser.parseEmail(msg1 as any);
  assert.equal(parsed1.specSection, "099100");
  assert.equal(parsed1.section, "099100");
  assert.equal(parsed1.submittalNum, "017");
  assert.equal(parsed1.number, "017");
  assert.equal(parsed1.revNum, "0");
  assert.equal(parsed1.revision, "0");
  assert.equal(parsed1.action, "Received");

  const msg2 = {
    getFrom: () => "contractor@builder.com",
    getSubject: () => "Transmittal for 06 20 00-003-00",
    getPlainBody: () => ""
  };
  const parsed2 = EmailIntakeParser.parseEmail(msg2 as any);
  assert.equal(parsed2.specSection, "062000");
  assert.equal(parsed2.submittalNum, "003");
  assert.equal(parsed2.revNum, "00");

  const msg3 = {
    getFrom: () => "sales@fixtures.com",
    getSubject: () => "Submittal # 084113-11.2",
    getPlainBody: () => ""
  };
  const parsed3 = EmailIntakeParser.parseEmail(msg3 as any);
  assert.equal(parsed3.specSection, "084113");
  assert.equal(parsed3.submittalNum, "011");
  assert.equal(parsed3.revNum, "2");

  const msg4 = {
    getFrom: () => "contractor@builder.com",
    getSubject: () => "Submittal 06-20-00-003",
    getPlainBody: () => ""
  };
  const parsed4 = EmailIntakeParser.parseEmail(msg4 as any);
  assert.equal(parsed4.specSection, "062000");
  assert.equal(parsed4.submittalNum, "003");

  const msg5 = {
    getFrom: () => "contractor@builder.com",
    getSubject: () => "Submittal 06.20.00-17",
    getPlainBody: () => ""
  };
  const parsed5 = EmailIntakeParser.parseEmail(msg5 as any);
  assert.equal(parsed5.specSection, "062000");
  assert.equal(parsed5.submittalNum, "017");
});

test("EmailIntakeParser.parseGenericEmail_ extracts titles via delimiters and filters status noise", () => {
  const msg1 = {
    getFrom: () => "sub@builder.com",
    getSubject: () => "Submittal 099100-17.0, PT432 - Public Spaces Limewash Samples",
    getPlainBody: () => ""
  };
  const parsed1 = EmailIntakeParser.parseEmail(msg1 as any);
  assert.equal(parsed1.title, "PT432 - Public Spaces Limewash Samples");

  const msg2 = {
    getFrom: () => "sub@builder.com",
    getSubject: () => "Transmittal for 062000-003 - Phase 2 Millwork Samples for review",
    getPlainBody: () => ""
  };
  const parsed2 = EmailIntakeParser.parseEmail(msg2 as any);
  assert.equal(parsed2.title, "Phase 2 Millwork Samples");

  const msg3 = {
    getFrom: () => "sub@builder.com",
    getSubject: () => "Submittal 084113-11.2 was submitted for approval",
    getPlainBody: () => ""
  };
  const parsed3 = EmailIntakeParser.parseEmail(msg3 as any);
  assert.equal(parsed3.title, undefined);

  const msg4 = {
    getFrom: () => "sub@builder.com",
    getSubject: () => "Submittal 033000-001 | Structural Concrete Mockup",
    getPlainBody: () => ""
  };
  const parsed4 = EmailIntakeParser.parseEmail(msg4 as any);
  assert.equal(parsed4.title, "Structural Concrete Mockup");

  const msg5 = {
    getFrom: () => "sub@builder.com",
    getSubject: () => "Submittal 062000-003 - Phase 2 &amp; Millwork Samples",
    getPlainBody: () => ""
  };
  const parsed5 = EmailIntakeParser.parseEmail(msg5 as any);
  assert.equal(parsed5.title, "Phase 2 & Millwork Samples");
});




test("No duplicate top-level const/let/var declarations exist across src files (GAS global scope protection)", () => {
  const fs = require("fs");
  const path = require("path");
  const srcDir = path.resolve(__dirname, "../src");
  const files = fs.readdirSync(srcDir).filter((f: string) => f.endsWith(".ts") && f !== "types.ts");

  const declarations = new Map<string, string>(); // varName -> fileName

  for (const file of files) {
    const content = fs.readFileSync(path.join(srcDir, file), "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_]+)/);
      if (match) {
        const varName = match[1];
        if (declarations.has(varName)) {
          const prevFile = declarations.get(varName);
          assert.fail(`Duplicate top-level declaration '${varName}' found in '${file}' and '${prevFile}'`);
        }
        declarations.set(varName, file);
      }
    }
  }
});

