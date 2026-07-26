/**
 * @file DocumentPipeline.ts
 * @description Ingestion, parsing, normalization, and validation application service for document intake.
 *
 * `DocumentPipeline` processes raw input data (email subjects/bodies, Google Drive filenames, and UI form submissions),
 * converts them into normalized `RawDocument` payloads, and enforces domain validation rules to produce `ValidationResult`.
 */

/**
 * Trims whitespace from a given string value, returning an empty string if undefined or null.
 *
 * @param val - The string to trim.
 * @returns The trimmed string or an empty string.
 */
function getTrimmed(val?: string): string {
  return (val || "").trim();
}

/**
 * Checks whether a given string is empty or contains only whitespace.
 *
 * @param val - The string to evaluate.
 * @returns `true` if empty/whitespace-only, `false` otherwise.
 */
function isEmpty(val?: string): boolean {
  return getTrimmed(val) === "";
}

/**
 * Parses raw form key-value input maps into normalized `RawDocument` objects.
 */
export class FormIntakeParser {
  /**
   * Normalizes raw form input keys by trimming strings and applying default fallback values
   * for discipline, action, and document type.
   *
   * @param formInput - Dictionary of raw form field values from UI submission.
   * @returns Normalized `RawDocument` containing trimmed form values and applied defaults.
   */
  static parse(formInput: Record<string, string> = {}): RawDocument {
    const rawDoc: RawDocument = {};
    const keys = Object.keys(formInput);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      rawDoc[key] = getTrimmed(formInput[key]);
    }

    if (rawDoc.discipline === undefined) {
      rawDoc.discipline = typeof CONFIG !== "undefined" && CONFIG.DEFAULT_DISCIPLINE ? CONFIG.DEFAULT_DISCIPLINE : "Architecture";
    }
    if (rawDoc.action === undefined) {
      rawDoc.action = typeof CONFIG !== "undefined" && CONFIG.DEFAULT_ACTION ? CONFIG.DEFAULT_ACTION : "Received";
    }
    rawDoc.documentType = rawDoc.documentType || "Submittal";

    return rawDoc;
  }
}

/**
 * Parses email subjects and body text from external software integrations (Procore, Autodesk Forma)
 * into partial or full `ParsedData` intake structures.
 */
export class EmailIntakeParser {
  /**
   * Internal helper to parse Procore submittal email notification subjects.
   * Extracts project name from square brackets `[Project]`, specification section, revision number,
   * and inferred action (Reviewed vs Received).
   *
   * @param subject - Email subject line.
   * @param body - Email body content.
   * @returns Partial `ParsedData` extracted from Procore email context.
   */
  static parseProcoreEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {};
    const projectMatch = subject.match(/\[([^\]]+)\]/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    const submittalMatch = subject.match(/(?:Submittal|Subm)\s*#?\s*([\w.]+)-([\w.]+)/i);
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

  /**
   * Internal helper to parse Autodesk Forma submittal notification emails.
   * Extracts project name, specification section, revision number, and workflow action.
   *
   * @param subject - Email subject line.
   * @param body - Email body content.
   * @returns Partial `ParsedData` extracted from Autodesk Forma email context.
   */
  static parseFormaEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {};
    const projectMatch = subject.match(/^([^-]+)-/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    const subMatch = subject.match(/(?:Submittal\s*)?#\s*([\w\.\-]+)\s+was/i);
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

  /**
   * Parses incoming Gmail message context to extract submittal metadata.
   * Identifies integrated vendor domains (Autodesk Forma, Procore) and delegates to specific parsers.
   *
   * @param message - The Google Apps Script GmailMessage instance (or null/undefined).
   * @returns `ParsedData` populated with extracted metadata or fallback default values.
   */
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

/**
 * Interface representing standard filename regex extraction patterns for Google Drive files.
 */
interface DriveFilenamePattern {
  /** Unique identifier for the filename pattern rule. */
  id: string;
  /** Regular expression used to match file names. */
  regex: RegExp;
  /** Extractor callback returning key-value document properties from regex match groups. */
  extract: (match: RegExpMatchArray) => Record<string, string>;
}

/**
 * Supported Google Drive filename matching patterns for Architecture and FF&E submittal files.
 */
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

/**
 * Intake parser for extracting document attributes from Google Drive filenames.
 */
export class DriveFilenameIntakeParser {
  /**
   * Matches clean file names against configured Drive filename patterns (Architecture or FF&E standard naming).
   *
   * @param filename - The raw filename of the selected Google Drive item.
   * @returns `RawDocument` containing extracted metadata fields or empty defaults if unmatched.
   */
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

/**
 * Core validation function evaluating raw intake documents against domain rules.
 *
 * Validates common mandatory fields (Date, Contact, Action, Incoming Routing for received items)
 * and discipline-specific rules for Architecture (Title, Section/Number/Revision warnings)
 * and FF&E (Spec Tag, Spec Title, Vendor, Tag/Vendor list verification, and related tag validation).
 *
 * @param raw - The unvalidated `RawDocument` input payload.
 * @param context - Optional `ValidationContext` containing valid tag lists and bypass options.
 * @returns `ValidationResult` indicating success (with `ValidatedDocument`), error, or interaction_required.
 */
function validateDocFn(raw: RawDocument, context?: ValidationContext): ValidationResult {
  const rawDoc = FormIntakeParser.parse(raw);
  const discipline = rawDoc.discipline || "Architecture";

  // Validate common required fields
  const missingFields: string[] = [];
  if (isEmpty(rawDoc.date)) missingFields.push("Date");
  if (isEmpty(rawDoc.contact)) missingFields.push("Contact");
  if (isEmpty(rawDoc.action)) missingFields.push("Action");

  if (rawDoc.action === "Received" && isEmpty(rawDoc.incomingRouting)) {
    missingFields.push("Incoming Routing");
  }

  // Discipline-specific required fields
  if (discipline === "Architecture") {
    if (isEmpty(rawDoc.title)) missingFields.push("Title");
  } else if (discipline === "FF&E") {
    if (isEmpty(rawDoc.specTag)) missingFields.push("Spec Tag");
    if (isEmpty(rawDoc.specTitle)) missingFields.push("Spec Title");
    if (isEmpty(rawDoc.vendor)) missingFields.push("Vendor");
  }

  if (missingFields.length > 0) {
    return {
      status: "error",
      errors: [`Missing required fields: ${missingFields.join(", ")}`],
      missingFields
    };
  }

  const warnings: string[] = [];
  const validTags = context?.ffeTags?.tags || [];
  const validVendors = context?.ffeTags?.vendors || [];

  if (discipline === "Architecture") {
    const sectionVal = getTrimmed(rawDoc.section);
    if (!sectionVal) warnings.push("Section");

    const numberVal = getTrimmed(rawDoc.number);
    if (!numberVal) warnings.push("Number");

    const revisionVal = getTrimmed(rawDoc.revision);
    if (!revisionVal) warnings.push("Revision");

    const archDetails: ArchitectureDetails = {
      discipline: "Architecture",
      section: sectionVal,
      number: numberVal,
      title: getTrimmed(rawDoc.title),
      revision: revisionVal
    };

    const validatedDoc: ValidatedDocument = {
      documentType: getTrimmed(rawDoc.documentType) || "Submittal",
      date: getTrimmed(rawDoc.date),
      contact: getTrimmed(rawDoc.contact),
      action: getTrimmed(rawDoc.action),
      notes: getTrimmed(rawDoc.notes),
      incomingRouting: getTrimmed(rawDoc.incomingRouting),
      disciplineDetails: archDetails
    };

    return {
      status: "success",
      data: validatedDoc,
      warnings
    };
  }

  if (discipline === "FF&E") {
    const specTag = getTrimmed(rawDoc.specTag);
    const vendor = getTrimmed(rawDoc.vendor);
    const relatedTag = getTrimmed(rawDoc.relatedTag);

    // Related Tags Validation
    if (relatedTag) {
      const inputRelatedTags = relatedTag.split(",").map(t => t.trim()).filter(Boolean);
      const invalidRelatedTags = inputRelatedTags.filter(
        t => !validTags.some(valid => valid.toLowerCase() === t.toLowerCase())
      );
      if (invalidRelatedTags.length > 0) {
        return {
          status: "error",
          errors: [`Invalid Related Tags: ${invalidRelatedTags.join(", ")}. Only valid options from the tag list are accepted.`]
        };
      }
    }

    // Spec Tag & Vendor Exist Validation (with bypass check)
    const bypassTag = !!context?.bypassTagValidation;
    const bypassVendor = !!context?.bypassVendorValidation;

    const tagExists = validTags.some(t => t.toLowerCase() === specTag.toLowerCase());
    if (!tagExists && !bypassTag) {
      return {
        status: "interaction_required",
        interactionType: "ADD_TAG",
        message: `Spec Tag "${specTag}" is not in the Tag List. Would you like to add it?`
      };
    }

    const vendorExists = validVendors.some(v => v.toLowerCase() === vendor.toLowerCase());
    if (!vendorExists && !bypassVendor) {
      return {
        status: "interaction_required",
        interactionType: "ADD_VENDOR",
        message: `Vendor "${vendor}" is not in the Tag List. Would you like to add it?`
      };
    }

    const revisionVal = getTrimmed(rawDoc.revision);
    if (!revisionVal) warnings.push("Revision");

    const ffeDetails: FFEDetails = {
      discipline: "FF&E",
      specTag,
      specTitle: getTrimmed(rawDoc.specTitle),
      vendor,
      revision: revisionVal,
      relatedTag
    };

    const validatedDoc: ValidatedDocument = {
      documentType: getTrimmed(rawDoc.documentType) || "Submittal",
      date: getTrimmed(rawDoc.date),
      contact: getTrimmed(rawDoc.contact),
      action: getTrimmed(rawDoc.action),
      notes: getTrimmed(rawDoc.notes),
      incomingRouting: getTrimmed(rawDoc.incomingRouting),
      disciplineDetails: ffeDetails
    };

    return {
      status: "success",
      data: validatedDoc,
      warnings
    };
  }

  return {
    status: "error",
    errors: [`Discipline ${discipline} validation not yet implemented`]
  };
}

/**
 * Pure application service class providing static entry points for document parsing and validation.
 */
export class DocumentPipeline {
  /**
   * Normalizes raw form input dictionary into a `RawDocument`.
   *
   * @param formInput - Key-value map from form submission.
   * @returns Formatted `RawDocument`.
   */
  static parseFormIntake(formInput: Record<string, string>): RawDocument {
    return FormIntakeParser.parse(formInput);
  }

  /**
   * Extracts metadata from a Gmail message context.
   *
   * @param message - Gmail message object or null.
   * @returns Parsed email data structure.
   */
  static parseEmail(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData {
    return EmailIntakeParser.parseEmail(message);
  }

  /**
   * Extracts document attributes from a Google Drive filename.
   *
   * @param filename - Drive file name string.
   * @returns Raw document structure populated with extracted attributes.
   */
  static parseFilename(filename: string): RawDocument {
    return DriveFilenameIntakeParser.parse(filename);
  }

  /**
   * Validates a `RawDocument` against business rules and domain requirements.
   *
   * @param rawDoc - Raw document to validate.
   * @param context - Validation context dependencies (tags, vendors, bypass flags).
   * @returns Validation outcome (`success`, `error`, or `interaction_required`).
   */
  static validate(rawDoc: RawDocument, context?: ValidationContext): ValidationResult {
    const fn = typeof validateDocument !== "undefined" ? validateDocument : validateDocFn;
    return fn(rawDoc, context);
  }

  /**
   * Convenience method to normalize and validate form input in a single pipeline step.
   *
   * @param formInput - Raw form inputs map.
   * @param context - Validation context dependencies.
   * @returns Final `ValidationResult`.
   */
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
    DriveFilenameIntakeParser,
    DocumentPipeline,
    validateDocument: typeof validateDocument !== "undefined" ? validateDocument : validateDocFn
  };
}
