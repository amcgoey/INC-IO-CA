import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveFilenameIntakeParser, DocumentPipeline } from '../src/DocumentPipeline';

// Set global environment for GAS tests
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

(globalThis as any).buildMainCard = (e: any, parsedData: any) => ({
  cardType: 'MainCard',
  e,
  parsedData
});

const { onDriveItemsSelected } = require('../src/Main');

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
