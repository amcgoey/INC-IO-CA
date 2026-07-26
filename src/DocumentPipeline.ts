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

export class DocumentPipeline {
  static parseFormIntake(formInput: Record<string, string>): RawDocument {
    return FormIntakeParser.parse(formInput);
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
    DocumentPipeline,
    validateDocument: typeof validateDocument !== "undefined" ? validateDocument : validateDocFn
  };
}
