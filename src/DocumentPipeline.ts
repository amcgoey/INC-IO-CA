declare var require: any;

let validateDocFn: any = typeof validateDocument !== "undefined" ? validateDocument : undefined;

if (typeof require !== "undefined") {
  try {
    const _v = eval('require("./Validation")');
    if (_v && _v.validateDocument) {
      validateDocFn = _v.validateDocument;
      if (typeof validateDocument === "undefined") {
        (globalThis as any).validateDocument = _v.validateDocument;
      }
    }
  } catch (e) {}
}

function getTrimmed(val?: string): string {
  return (val || "").trim();
}

/**
 * Form Intake Parser & Document Pipeline core service.
 */

export class FormIntakeParser {
  static parse(formInput: Record<string, string> = {}): RawDocument {
    return {
      documentType: getTrimmed(formInput.documentType) || "Submittal",
      date: getTrimmed(formInput.date),
      contact: getTrimmed(formInput.contact),
      action: getTrimmed(formInput.action),
      incomingRouting: getTrimmed(formInput.incomingRouting),
      discipline: getTrimmed(formInput.discipline),
      title: getTrimmed(formInput.title),
      section: getTrimmed(formInput.section),
      number: getTrimmed(formInput.number),
      revision: getTrimmed(formInput.revision),
      notes: getTrimmed(formInput.notes),
      specTag: getTrimmed(formInput.specTag),
      specTitle: getTrimmed(formInput.specTitle),
      vendor: getTrimmed(formInput.vendor),
      relatedTag: getTrimmed(formInput.relatedTag),
      fileSource: getTrimmed(formInput.fileSource),
      driveFileUrl: getTrimmed(formInput.driveFileUrl)
    };
  }
}

interface DriveFilenamePattern {
  id: string;
  regex: RegExp;
  extract: (match: RegExpMatchArray) => Record<string, string>;
}

const DRIVE_FILENAME_PATTERNS: DriveFilenamePattern[] = [
  {
    id: 'ArchitectureStandard',
    regex: /^[^A-Za-z0-9]*(\d[A-Za-z0-9\.]*)-([A-Za-z0-9\.]+)-([A-Za-z0-9]+)\s+(.*?)\s+-\s+(\d{6})/i,
    extract: (match: RegExpMatchArray) => ({
      discipline: "Architecture",
      section: match[1],
      specSection: match[1],
      number: match[2],
      submittalNum: match[2],
      revision: match[3],
      revNum: match[3],
      title: match[4].trim(),
      date: match[5]
    })
  },
  {
    id: 'FFEStandard',
    regex: /^[^A-Za-z0-9]*([A-Za-z0-9]+-[A-Za-z0-9]+)-([A-Za-z0-9]+)\s+(.*?)\s+-\s+(\d{6})/i,
    extract: (match: RegExpMatchArray) => ({
      discipline: "FF&E",
      specTag: match[1],
      revision: match[2],
      revNum: match[2],
      vendor: match[3].trim(),
      date: match[4]
    })
  }
];

export class DriveFilenameIntakeParser {
  static parse(filename: string = ""): RawDocument {
    const rawDoc: RawDocument = {
      discipline: "Architecture",
      fileSource: "Drive",
      section: "",
      specSection: "",
      number: "",
      submittalNum: "",
      revision: "",
      revNum: "",
      title: "",
      date: "",
      specTag: "",
      vendor: ""
    };

    const cleanFilename = getTrimmed(filename);
    if (!cleanFilename) return rawDoc;

    for (const pattern of DRIVE_FILENAME_PATTERNS) {
      const match = cleanFilename.match(pattern.regex);
      if (match) {
        Object.assign(rawDoc, pattern.extract(match));
        break;
      }
    }

    return rawDoc;
  }
}

export class DocumentPipeline {
  static parseFormIntake(formInput: Record<string, string>): RawDocument {
    return FormIntakeParser.parse(formInput);
  }

  static parseFilename(filename: string): RawDocument {
    return DriveFilenameIntakeParser.parse(filename);
  }

  static validate(rawDoc: RawDocument, context?: ValidationContext): ValidationResult {
    const fn = typeof validateDocument !== "undefined" ? validateDocument : validateDocFn;
    return fn(rawDoc, context);
  }

  static processFormIntake(formInput: Record<string, string>, context?: ValidationContext): ValidationResult {
    const rawDoc = FormIntakeParser.parse(formInput);
    return DocumentPipeline.validate(rawDoc, context);
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FormIntakeParser,
    DriveFilenameIntakeParser,
    DocumentPipeline,
    validateDocument: typeof validateDocument !== "undefined" ? validateDocument : validateDocFn
  };
}
