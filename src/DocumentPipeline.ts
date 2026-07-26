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

/*
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

export class EmailIntakeParser {
  static parseProcoreEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {};
    const projectMatch = subject.match(/\[([^\]]+)\]/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    const submittalMatch = subject.match(/(?:Submittal|Subm)\s*#?\s*([\w]+)-([\w.]+)/i);
    if (submittalMatch) {
      result.specSection = submittalMatch[1];
      result.revNum = submittalMatch[2];
      if (/^\d/.test(result.specSection)) result.discipline = "Architecture";
    }

    if (/returned/i.test(subject) || /reviewed/i.test(subject)) {
      result.action = "Reviewed";
    } else if (/submitted/i.test(subject)) {
      result.action = typeof CONFIG !== "undefined" && CONFIG.DEFAULT_ACTION ? CONFIG.DEFAULT_ACTION : "Received";
    }
    return result;
  }

  static parseFormaEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {};
    const projectMatch = subject.match(/^([^-]+)-/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    const subMatch = subject.match(/#\s*(.*?)\s+was/i);
    if (subMatch) {
      const parts = subMatch[1].split('-');
      result.specSection = parts[0].trim();
      if (parts.length > 1) result.revNum = parts.slice(1).join('-').trim();
      if (/^\d/.test(result.specSection)) result.discipline = "Architecture";
    }

    const actionMatch = subject.match(/was\s+(.+)$/i);
    if (actionMatch) {
      const intent = actionMatch[1].toLowerCase().trim();
      if (intent.includes("provided for your information") || intent.includes("submitted") || intent.includes("forwarded")) {
        result.action = typeof CONFIG !== "undefined" && CONFIG.DEFAULT_ACTION ? CONFIG.DEFAULT_ACTION : "Received";
      } else {
        result.action = actionMatch[1].trim();
      }
    }
    return result;
  }

  static parseEmail(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData {
    const defaultResult: ParsedData = {
      driveName: "",
      discipline: typeof CONFIG !== "undefined" && CONFIG.DEFAULT_DISCIPLINE ? CONFIG.DEFAULT_DISCIPLINE : "Architecture",
      action: typeof CONFIG !== "undefined" && CONFIG.DEFAULT_ACTION ? CONFIG.DEFAULT_ACTION : "Received"
    };

    if (!message) return defaultResult;

    const sender = message.getFrom() || "";
    const subject = message.getSubject() || "";
    const body = message.getPlainBody() || "";

    if (sender.toLowerCase().includes("@mail.forma.autodesk.com")) {
      return { ...defaultResult, ...EmailIntakeParser.parseFormaEmail_(subject, body) };
    }

    if (sender.toLowerCase().includes("procore.com") || sender.toLowerCase().includes("procoretech.com") || /procore/i.test(sender)) {
      return { ...defaultResult, ...EmailIntakeParser.parseProcoreEmail_(subject, body) };
    }

    return defaultResult;
  }
}

export class DocumentPipeline {
  static parseFormIntake(formInput: Record<string, string>): RawDocument {
    return FormIntakeParser.parse(formInput);
  }

  static parseEmail(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData {
    return EmailIntakeParser.parseEmail(message);
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
    EmailIntakeParser,
    DocumentPipeline,
    validateDocument: typeof validateDocument !== "undefined" ? validateDocument : validateDocFn
  };
}
