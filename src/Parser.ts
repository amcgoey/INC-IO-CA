interface SubjectPattern {
  id: string;
  regex: RegExp;
  extract: (match: RegExpMatchArray) => {
    section: string;
    number: string;
    revision: string;
    title: string;
  };
}

interface FilenamePattern {
  id: string;
  regex: RegExp;
  extract: (match: RegExpMatchArray) => Partial<ParsedData>;
}

/**
 * Modular configuration for email subject parsing patterns.
 * Add new patterns to this array as different project software formats arise.
 */
const EMAIL_SUBJECT_PATTERNS: SubjectPattern[] = [
  {
    id: 'ProcoreSubmittal', // Handles Procore submittals including section numbers with decimals (e.g., 238239.19-63.0)
    regex: /Submittal\s+([a-zA-Z0-9\.]+)-(\d+)[\.-](\d+)?(?:,\s*(.*))?/i,
    extract: (match: RegExpMatchArray) => ({
      section: match[1] || "",
      number: match[2] || "",
      revision: match[3] || "",
      title: match[4] ? match[4].trim() : ""
    })
  },
  {
    id: 'LegacyStandard',
    regex: /Submittal\s+([a-zA-Z0-9]+)-(\d+)[\.-](\d+)?(?:,\s*(.*))?/i,
    extract: (match: RegExpMatchArray) => ({
      section: match[1] || "",
      number: match[2] || "",
      revision: match[3] || "",
      title: match[4] ? match[4].trim() : ""
    })
  }
];

/**
 * Modular configuration for Drive filename parsing patterns.
 */
const DRIVE_FILENAME_PATTERNS: FilenamePattern[] = [
  {
    id: 'ArchitectureStandard',
    regex: /^[^A-Za-z0-9]*([A-Za-z0-9]+)-([A-Za-z0-9\.]+)-([A-Za-z0-9]+)\s+(.*?)\s+-\s+(\d{6})/i,
    extract: (match: RegExpMatchArray) => ({
      discipline: "Architecture",
      section: match[1],
      number: match[2],
      revision: match[3],
      title: match[4].trim(),
      date: match[5]
    })
  },
  {
    id: 'FFEStandard',
    regex: /^[^A-Za-z0-9]*([A-Za-z0-9]+)-([A-Za-z0-9]+)\s+(.*?)\s+-\s+(\d{6})/i,
    extract: (match: RegExpMatchArray) => ({
      discipline: "FF&E",
      specTag: match[1],
      revision: match[2],
      vendor: match[3].trim(),
      date: match[4]
    })
  }
];

function parseDriveFilename(filename: string): ParsedData {
  if (typeof DocumentPipeline !== "undefined" && typeof DocumentPipeline.parseFilename === "function") {
    return DocumentPipeline.parseFilename(filename);
  }
  let data: ParsedData = { discipline: "Architecture", specSection: undefined, submittalNum: undefined, revNum: undefined, title: undefined, specTag: undefined, vendor: undefined, date: undefined };

  for (const pattern of DRIVE_FILENAME_PATTERNS) {
    const match = filename.match(pattern.regex);
    if (match) {
      Object.assign(data, pattern.extract(match));
      break;
    }
  }

  return data;
}


function parseEmailData(message?: GoogleAppsScript.Gmail.GmailMessage | null): ParsedData {
  if (typeof DocumentPipeline !== "undefined" && DocumentPipeline.parseEmail) {
    return DocumentPipeline.parseEmail(message);
  }
  const defaultResult: ParsedData = {
    driveName: "",
    discipline: CONFIG.DEFAULT_DISCIPLINE,
    action: CONFIG.DEFAULT_ACTION
  };

  if (!message) return defaultResult;

  const sender = message.getFrom() || "";
  const subject = message.getSubject() || "";
  const body = message.getPlainBody() || "";

  if (sender.toLowerCase().includes("@mail.forma.autodesk.com")) {
    return { ...defaultResult, ...parseFormaEmail_(subject, body) };
  }

  if (sender.toLowerCase().includes("procore.com") || sender.toLowerCase().includes("procoretech.com") || /procore/i.test(sender)) {
    return { ...defaultResult, ...parseProcoreEmail_(subject, body) };
  }

  return defaultResult;
}

function parseFormaEmail_(subject: string, body: string): Partial<ParsedData> {
  if (typeof EmailIntakeParser !== "undefined" && EmailIntakeParser.parseFormaEmail_) {
    return EmailIntakeParser.parseFormaEmail_(subject, body);
  }
  const result: Partial<ParsedData> = {};
  const projectMatch = subject.match(/^([^-]+)-/);
  if (projectMatch) result.driveName = projectMatch[1].trim();

  const subMatch = subject.match(/(?:Submittal\s*)?#\s*(.*?)\s+was/i);
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
      result.action = CONFIG.DEFAULT_ACTION;
    } else {
      result.action = actionMatch[1].trim();
    }
  }
  return result;
}

function parseProcoreEmail_(subject: string, body: string): Partial<ParsedData> {
  if (typeof EmailIntakeParser !== "undefined" && EmailIntakeParser.parseProcoreEmail_) {
    return EmailIntakeParser.parseProcoreEmail_(subject, body);
  }
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
    result.action = CONFIG.DEFAULT_ACTION;
  }
  return result;
}
