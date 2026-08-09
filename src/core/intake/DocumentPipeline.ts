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
class ListDocumentField implements IListDocumentField {
  readonly name: string;
  readonly storedForm: StoredFormType;
  readonly options: ListFieldOption[];

  constructor(name: string, storedForm: StoredFormType, options: ListFieldOption[] = []) {
    this.name = name;
    this.storedForm = storedForm;
    this.options = options;
  }

  static createContactField(contacts: ContactSetting[] = []): ListDocumentField {
    const options: ListFieldOption[] = contacts.map(c => ({
      abbr: getTrimmed(c.abbr),
      longForm: getTrimmed(c.name)
    }));
    return new ListDocumentField('contact', 'abbreviation', options);
  }

  static createActionField(actions: ActionSetting[] = []): ListDocumentField {
    const options: ListFieldOption[] = actions.map(a => ({
      abbr: getTrimmed(a.abbr),
      longForm: getTrimmed(a.action),
      status: getTrimmed(a.status)
    }));
    return new ListDocumentField('action', 'longForm', options);
  }

  static createStatusField(actions: ActionSetting[] = []): ListDocumentField {
    const options: ListFieldOption[] = actions.map(a => ({
      abbr: getTrimmed(a.abbr),
      longForm: getTrimmed(a.status || a.action),
      status: getTrimmed(a.status)
    }));
    return new ListDocumentField('status', 'longForm', options);
  }

  static createDefaultListFields(context?: ValidationContext): { contact: IListDocumentField; action: IListDocumentField; status: IListDocumentField } {
    const contacts = context?.contacts || context?.logSettings?.contacts || [];
    const actions = context?.actions || context?.logSettings?.actions || [];
    return {
      contact: context?.listFields?.contact || ListDocumentField.createContactField(contacts),
      action: context?.listFields?.action || ListDocumentField.createActionField(actions),
      status: context?.listFields?.status || ListDocumentField.createStatusField(actions)
    };
  }

  resolve(inputValue: string): ResolvedListField {
    const trimmed = getTrimmed(inputValue);
    if (!trimmed) {
      return {
        fieldName: this.name,
        storedForm: this.storedForm,
        storedValue: '',
        abbreviation: '',
        longForm: ''
      };
    }

    const lower = trimmed.toLowerCase();
    const match = this.options.find(opt => {
      const abbrMatch = opt.abbr ? opt.abbr.toLowerCase() === lower : false;
      const nameMatch = (opt.longForm || opt.name || opt.action || opt.status || '').toLowerCase() === lower;
      return abbrMatch || nameMatch;
    });

    if (match) {
      const abbr = match.abbr || trimmed;
      const longForm = match.longForm || match.name || match.action || match.status || trimmed;
      const storedValue = this.storedForm === 'abbreviation' ? abbr : longForm;
      return {
        fieldName: this.name,
        storedForm: this.storedForm,
        storedValue,
        abbreviation: abbr,
        longForm
      };
    }

    return {
      fieldName: this.name,
      storedForm: this.storedForm,
      storedValue: trimmed,
      abbreviation: trimmed,
      longForm: trimmed
    };
  }
}

class FormIntakeParser {
  static parse(formInput: Record<string, string> = {}, context?: ValidationContext): RawDocument {
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

    if (context) {
      const listFields = ListDocumentField.createDefaultListFields(context);
      const resolvedContact = listFields.contact.resolve(rawDoc.contact || '');
      const resolvedAction = listFields.action.resolve(rawDoc.action || '');
      rawDoc.contactAbbr = resolvedContact.abbreviation;
      rawDoc.contactLongForm = resolvedContact.longForm;
      rawDoc.actionAbbr = resolvedAction.abbreviation;
      rawDoc.actionLongForm = resolvedAction.longForm;
    }

    return rawDoc;
  }
}

function padSubmittalNumber(numStr?: string): string {
  if (!numStr) return "";
  const trimmed = numStr.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.length < 3 ? trimmed.padStart(3, "0") : trimmed;
  }
  return trimmed;
}

function normalizeSpecSection(secStr?: string): string {
  if (!secStr) return "";
  if (typeof PicklistResolver !== "undefined" && typeof PicklistResolver.normalizePicklistValue === "function") {
    return PicklistResolver.normalizePicklistValue(secStr, { key: "section", keyNormalizationRule: "code" });
  }
  const codePart = secStr.trim().split(/\s+-\s+|\s+-(?=[A-Za-z])/)[0];
  return codePart.replace(/[\s.-]+/g, '').toUpperCase();
}

function splitNumberAndRevision(numRevStr: string): { submittalNum: string; revNum: string } {
  if (!numRevStr) return { submittalNum: "", revNum: "" };
  const trimmed = numRevStr.trim();
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    return {
      submittalNum: padSubmittalNumber(parts[0]),
      revNum: parts.slice(1).join(".")
    };
  }
  if (trimmed.includes("-")) {
    const parts = trimmed.split("-");
    return {
      submittalNum: padSubmittalNumber(parts[0]),
      revNum: parts.slice(1).join("-")
    };
  }
  return {
    submittalNum: padSubmittalNumber(trimmed),
    revNum: trimmed
  };
}

const STATUS_NOISE_WORDS = "was\\s+submitted|has\\s+been\\s+submitted|submitted|for\\s+review|for\\s+approval|for\\s+app|notification|distributed|distribute|provided\\s+for\\s+your\\s+information|for\\s+your\\s+information|fyi";
const TRAILING_NOISE_RE = new RegExp(`\\s+(?:${STATUS_NOISE_WORDS}).*`, "i");
const EXACT_NOISE_RE = new RegExp(`^(?:${STATUS_NOISE_WORDS})$`, "i");

function getDefaultAction(): string {
  return typeof CONFIG !== "undefined" && CONFIG.DEFAULT_ACTION ? CONFIG.DEFAULT_ACTION : "Received";
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

class DriveFilenameIntakeParser {
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

function validateDocFn(raw: RawDocument, context?: ValidationContext): ValidationResult {
  const rawDoc = FormIntakeParser.parse(raw, context);
  const g = typeof globalThis !== "undefined" ? (globalThis as any) : {};
  let registry: DocumentTypeConfigRegistry | undefined = g.defaultDocumentTypeConfigRegistry;
  if (!registry && typeof defaultDocumentTypeConfigRegistry !== "undefined") {
    registry = defaultDocumentTypeConfigRegistry;
  }
  if (!registry && typeof require !== "undefined") {
    try {
      const regMod = require('../../DocumentTypeConfigRegistry');
      registry = g.defaultDocumentTypeConfigRegistry || regMod.defaultDocumentTypeConfigRegistry;
    } catch (e) {}
  }

  let config: DocumentTypeConfig | undefined;
  if (registry) {
    const userDiscipline = raw.discipline;
    const userDocType = raw.documentType;

    if (userDiscipline && registry.hasConfig(userDiscipline)) {
      config = registry.getConfig(userDiscipline);
    } else if (userDocType && registry.hasConfig(userDocType)) {
      config = registry.getConfig(userDocType);
    } else if (rawDoc.documentType && registry.hasConfig(rawDoc.documentType)) {
      config = registry.getConfig(rawDoc.documentType);
    } else if (rawDoc.discipline && registry.hasConfig(rawDoc.discipline)) {
      config = registry.getConfig(rawDoc.discipline);
    } else {
      try {
        config = registry.getConfig('Submittal');
      } catch (e) {}
    }
  }

  const listFields = ListDocumentField.createDefaultListFields(context);
  const resolvedContact = listFields.contact.resolve(rawDoc.contact);
  const resolvedAction = listFields.action.resolve(rawDoc.action);

  const missingFields: string[] = [];
  const fields: DocumentFieldSpec[] = config?.fields || [
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'contact', label: 'Contact', type: 'string', required: true },
    { key: 'action', label: 'Action', type: 'string', required: true }
  ];

  const isReceived = resolvedAction.longForm === 'Received' || resolvedAction.abbreviation === 'Received' || getTrimmed(rawDoc.action) === 'Received';

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.isCalculated) continue;

    if (field.key === 'incomingRouting') {
      if (isReceived && isEmpty(rawDoc.incomingRouting)) {
        missingFields.push('Incoming Routing');
      }
      continue;
    }

    if (field.required && isEmpty(rawDoc[field.key])) {
      missingFields.push(field.label || field.key);
    }
  }

  if (missingFields.length > 0) {
    return {
      status: 'error',
      errors: [`Missing required fields: ${missingFields.join(', ')}`],
      missingFields
    };
  }

  if (config?.validateHook) {
    const hookResult = config.validateHook(rawDoc, context);
    if (hookResult) {
      return hookResult;
    }
  }

  const warnings: string[] = [];
  const targetDocType = getTrimmed(rawDoc.documentType) || config?.documentType || 'Submittal';
  const targetDiscipline = getTrimmed(rawDoc.discipline) || 'Architecture';

  let disciplineDetails: any;

  if (targetDiscipline === 'FF&E' || config?.documentType === 'FF&E') {
    const revisionVal = getTrimmed(rawDoc.revision);
    if (!revisionVal) warnings.push('Revision');

    disciplineDetails = {
      discipline: 'FF&E',
      specTag: getTrimmed(rawDoc.specTag),
      specTitle: getTrimmed(rawDoc.specTitle),
      vendor: getTrimmed(rawDoc.vendor),
      revision: revisionVal,
      relatedTag: getTrimmed(rawDoc.relatedTag)
    };
  } else if (targetDocType === 'Submittal') {
    const sectionVal = normalizeSpecSection(rawDoc.section);
    if (!sectionVal) warnings.push('Section');

    const numberVal = getTrimmed(rawDoc.number);
    if (!numberVal) warnings.push('Number');

    const revisionVal = getTrimmed(rawDoc.revision);
    if (!revisionVal) warnings.push('Revision');

    disciplineDetails = {
      discipline: 'Architecture',
      section: sectionVal,
      number: numberVal,
      title: getTrimmed(rawDoc.title),
      revision: revisionVal
    };
  } else {
    // Dynamic document details for custom document types (e.g. RFI, ASI)
    const customDetails: Record<string, string> = {
      discipline: raw.discipline || config?.documentType || targetDocType
    };
    for (const f of fields) {
      if (!f.isCalculated && rawDoc[f.key] !== undefined) {
        customDetails[f.key] = getTrimmed(rawDoc[f.key]);
      }
    }
    disciplineDetails = customDetails;
  }

  const validatedDoc: ValidatedDocument = {
    documentType: targetDocType,
    date: getTrimmed(rawDoc.date),
    contact: resolvedContact.storedValue,
    action: resolvedAction.storedValue,
    listFields: {
      contact: resolvedContact,
      action: resolvedAction
    },
    notes: getTrimmed(rawDoc.notes),
    incomingRouting: getTrimmed(rawDoc.incomingRouting),
    disciplineDetails
  };

  return {
    status: 'success',
    data: validatedDoc,
    warnings
  };
}

class DocumentPipeline {
  static parseFormIntake(formInput: Record<string, string>, context?: ValidationContext): RawDocument {
    return FormIntakeParser.parse(formInput, context);
  }

  static parseEmail(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData {
    const ep = typeof EmailIntakeParser !== "undefined" ? EmailIntakeParser : (typeof require !== "undefined" ? require(",/EmailIntakeParser").EmailIntakeParser : (globalThis as any).EmailIntakeParser);
    return ep ? ep.parseEmail(message) : { driveName: "", action: "Received" };
  }

  static parseFilename(filename: string): RawDocument {
    return DriveFilenameIntakeParser.parse(filename);
  }

  static validate(rawDoc: RawDocument, context?: ValidationContext): ValidationResult {
    const fn = typeof validateDocument !== "undefined" ? validateDocument : validateDocFn;
    return fn(rawDoc, context);
  }

  static processFormIntake(formInput: Record<string, string>, context?: ValidationContext): ValidationResult {
    const rawDoc = FormIntakeParser.parse(formInput, context);
    return DocumentPipeline.validate(rawDoc, context);
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FormIntakeParser,
    EmailIntakeParser: typeof EmailIntakeParser !== "undefined" ? EmailIntakeParser : (typeof require !== "undefined" ? require("./EmailIntakeParser").EmailIntakeParser : (globalThis as any).EmailIntakeParser),
    DriveFilenameIntakeParser,
    DocumentPipeline,
    ListDocumentField,
    validateDocument: typeof validateDocument !== "undefined" ? validateDocument : validateDocFn
  };
}
