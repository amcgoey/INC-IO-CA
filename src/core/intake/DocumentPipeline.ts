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

class EmailIntakeParser {
  static parseProcoreEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {
      action: getDefaultAction()
    };

    const projectMatch = subject.match(/\[([^\]]+)\]/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    // 1. Procore Distributed: Submittal Distributed 099100-17.0, PT432 - Public Spaces Limewash Samples
    const distMatch = subject.match(/Submittal\s+Distributed\s+([\w.]+)-([\w.]+)(?:,\s*(.*))?/i);
    if (distMatch) {
      result.specSection = normalizeSpecSection(distMatch[1]);
      const { submittalNum, revNum } = splitNumberAndRevision(distMatch[2]);
      result.submittalNum = submittalNum;
      result.revNum = revNum;
      if (distMatch[3]) result.title = distMatch[3].trim();
      if (/^\d/.test(result.specSection)) result.discipline = "Architecture";
      return result;
    }

    // 2. Action Required / Approver Response Updated: for Submittal 084113-11.2, Entrance Canopy Shop Drawing
    const updatedMatch = subject.match(/for\s+Submittal\s+([\w.]+)-([\w.]+)(?:,\s*(.*))?/i);
    if (updatedMatch) {
      result.specSection = normalizeSpecSection(updatedMatch[1]);
      const { submittalNum, revNum } = splitNumberAndRevision(updatedMatch[2]);
      result.submittalNum = submittalNum;
      result.revNum = revNum;
      if (updatedMatch[3]) result.title = updatedMatch[3].trim();
      if (/^\d/.test(result.specSection)) result.discipline = "Architecture";
      return result;
    }

    // 3. Standard Procore: Submittal # 033000-001 has been submitted / Subm 081100-02
    const submittalMatch = subject.match(/(?:Submittal|Subm)\s*#?\s*([\w.]+)-([\w.]+)/i);
    if (submittalMatch) {
      result.specSection = normalizeSpecSection(submittalMatch[1]);
      const { submittalNum, revNum } = splitNumberAndRevision(submittalMatch[2]);
      result.submittalNum = submittalNum;
      result.revNum = revNum;
      if (/^\d/.test(result.specSection)) result.discipline = "Architecture";
    }

    return result;
  }

  static parseFormaEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {
      action: getDefaultAction()
    };

    const projectMatch = subject.match(/^([^-]+)-/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    // Forma subject pattern matching space-separated CSI sections: #06 20 00-003-00
    const subMatch = subject.match(/(?:Submittal\s*)?#\s*([\d\s]+)-([\w.]+(?:-[\w.]+)*)/i) ||
                     subject.match(/(?:Submittal\s*)?#\s*([\w\.\-]+)\s+was/i);
    if (subMatch) {
      const fullSectionStr = subMatch[1].trim();
      const numRevStr = subMatch[2] ? subMatch[2].trim() : "";
      result.specSection = normalizeSpecSection(fullSectionStr);
      if (numRevStr) {
        const { submittalNum, revNum } = splitNumberAndRevision(numRevStr);
        result.submittalNum = submittalNum;
        result.revNum = revNum;
      }
      if (/^\d/.test(result.specSection)) result.discipline = "Architecture";
    }

    // Body fallback for item title (e.g. "item #06 20 00-003-00 Phase 2 Millwork Samples")
    if (body) {
      const cleanBody = body.replace(/=\r?\n/g, '').replace(/<[^>]+>/g, ' ');
      const bodyTitleMatch = cleanBody.match(/item\s*#\s*[\d\s\-.]+\s+([^<>\r\n]+?)(?:\s+was|\s+provided|\s+submitted|\s+for|\r|\n|$)/i);
      if (bodyTitleMatch) {
        result.title = bodyTitleMatch[1].replace(/\s+/g, ' ').trim();
      }
    }

    return result;
  }

  static parseCmicEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {
      action: getDefaultAction()
    };

    // Subject Pattern: [Fwd: ]New TRNS | TRN00588 | [Project] P2_062200-030-1_Walnut Wood Refinishing_For App
    const projectMatch = subject.match(/\[([^\]]+)\]/);
    if (projectMatch) {
      let rawProj = projectMatch[1].trim();
      if (rawProj.includes("-")) {
        const parts = rawProj.split("-");
        result.driveName = parts.slice(1).join("-").trim();
      } else {
        result.driveName = rawProj;
      }
    }

    const cmicSubjMatch = subject.match(/(?:P\d+_)?(\d{6})-(\d+)-(\d+)_([^_]+)/i);
    if (cmicSubjMatch) {
      result.specSection = normalizeSpecSection(cmicSubjMatch[1]);
      result.submittalNum = padSubmittalNumber(cmicSubjMatch[2]);
      result.revNum = cmicSubjMatch[3];
      result.title = cmicSubjMatch[4].trim();
      return result;
    }

    // Body Fallback: Code/Description: 062200-030 - Walnut Wood Refinishing
    if (body) {
      const bodyMatch = body.match(/(?:Code\/Description|Transmittal):\s*(?:P\d+_)?(\d{6})-(\d+)(?:-(\d+))?\s*(?:-|_)\s*([^\r\n]+)/i);
      if (bodyMatch) {
        result.specSection = normalizeSpecSection(bodyMatch[1]);
        result.submittalNum = padSubmittalNumber(bodyMatch[2]);
        if (bodyMatch[3]) result.revNum = bodyMatch[3];
        if (bodyMatch[4]) result.title = bodyMatch[4].replace(/_For App.*/i, '').trim();
      }
    }

    return result;
  }

  static parseGenericEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {
      action: getDefaultAction()
    };

    const searchableEmailContent = (subject + "\n" + (body || "")).replace(/=\r?\n/g, '');

    const submittalSectionMatch = searchableEmailContent.match(/(?:Submittal\s*#?|Subm\s*#?|Spec\s*#?|Section\s*#?|Transmittal\s*(?:for)?\s*)\s*(\d{2}[\s.-]?\d{2}[\s.-]?\d{2})[\s._-]*#?\s*([\w.]+(?:-[\w.]+)*)/i) ||
                                searchableEmailContent.match(/(\d{2}[\s.-]?\d{2}[\s.-]?\d{2})[\s._-]+(\d{1,4})(?:[.-](\d{1,3}))?/);

    if (submittalSectionMatch) {
      result.specSection = normalizeSpecSection(submittalSectionMatch[1]);
      const submittalNumberAndRevisionString = submittalSectionMatch[2] ? submittalSectionMatch[2].trim() : "";
      if (submittalNumberAndRevisionString) {
        const { submittalNum, revNum } = splitNumberAndRevision(submittalNumberAndRevisionString);
        result.submittalNum = submittalNum;
        if (revNum) result.revNum = revNum;
      }
      if (submittalSectionMatch[3] && !result.revNum) {
        result.revNum = submittalSectionMatch[3];
      }

      // Title Extraction: Check text following the matched section/number for delimiters (, , - , _ , | , : )
      const matchedFullText = submittalSectionMatch[0];
      const matchIndex = typeof submittalSectionMatch.index === "number" ? submittalSectionMatch.index : searchableEmailContent.indexOf(matchedFullText);
      if (matchIndex !== -1) {
        const remainingText = searchableEmailContent.substring(matchIndex + matchedFullText.length);
        const delimiterMatch = remainingText.match(/^\s*(?:[,\-_|:]\s*|\s+-\s+)(.+)/);
        if (delimiterMatch) {
          let extractedTitle = delimiterMatch[1].replace(/[\r\n].*/s, '').trim();

          // Decode common HTML entities in title
          extractedTitle = extractedTitle
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

          // Filter out status noise phrases
          extractedTitle = extractedTitle.replace(TRAILING_NOISE_RE, '').trim();

          const isPureNoise = EXACT_NOISE_RE.test(extractedTitle);

          if (extractedTitle && !isPureNoise) {
            result.title = extractedTitle;
          }
        }
      }
    }

    return result;
  }

  static parseEmail(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData {
    const defaultResult: ParsedData = {
      driveName: "",
      discipline: typeof CONFIG !== "undefined" && CONFIG.DEFAULT_DISCIPLINE ? CONFIG.DEFAULT_DISCIPLINE : "Architecture",
      action: getDefaultAction()
    };

    if (!message) return defaultResult;

    const sender = message.getFrom ? message.getFrom() : "";
    const replyTo = message.getReplyTo ? message.getReplyTo() : "";
    const subject = message.getSubject ? message.getSubject() : "";
    const body = message.getPlainBody ? message.getPlainBody() : "";

    const combinedHeaders = (sender + " " + replyTo + " " + subject).toLowerCase();

    let matched: Partial<ParsedData> | null = null;
    if (combinedHeaders.includes("forma") || combinedHeaders.includes("autodesk")) {
      matched = EmailIntakeParser.parseFormaEmail_(subject, body);
    } else if (combinedHeaders.includes("cmic") || combinedHeaders.includes("stobg") || combinedHeaders.includes("trn")) {
      matched = EmailIntakeParser.parseCmicEmail_(subject, body);
    } else if (combinedHeaders.includes("procore")) {
      matched = EmailIntakeParser.parseProcoreEmail_(subject, body);
    }

    // Tier 2: Generic Email Parser fallback if Tier 1 vendor parsers did not produce a specSection
    if (!matched || !matched.specSection) {
      const genericParsed = EmailIntakeParser.parseGenericEmail_(subject, body);
      if (genericParsed.specSection) {
        matched = { ...(matched || {}), ...genericParsed };
      }
    }

    const res: ParsedData = { ...defaultResult, ...(matched || {}) };

    if (res.specSection && !res.section) res.section = res.specSection;
    if (res.section && !res.specSection) res.specSection = res.section;
    if (res.submittalNum && !res.number) res.number = res.submittalNum;
    if (res.number && !res.submittalNum) res.submittalNum = res.number;
    if (res.revNum && !res.revision) res.revision = res.revNum;
    if (res.revision && !res.revNum) res.revNum = res.revision;

    return res;
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
    return EmailIntakeParser.parseEmail(message);
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
    EmailIntakeParser,
    DriveFilenameIntakeParser,
    DocumentPipeline,
    ListDocumentField,
    validateDocument: typeof validateDocument !== "undefined" ? validateDocument : validateDocFn
  };
}
